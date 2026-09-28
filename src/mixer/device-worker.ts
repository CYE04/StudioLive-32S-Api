import { Client, MessageCode } from '@featherbear/presonus-studiolive-api';
import { ApiError, assertMuted, assertLevel, assertTarget, type MixMuteState, type TalkbackState, type SendState } from './MixerAdapter.ts';
import { config } from '../config/index.ts';
import { ReceivedState } from './ReceivedState.ts';
import { snapshotRead } from './session.ts';
const { ip, allowed, verifiedAuxMode } = config();
const state = new ReceivedState(allowed, verifiedAuxMode);
const client = new Client({ host: ip }, { autoreconnect: false, logLevel: 'fatal' });
let ready = false, writing = false;
let pendingControl: { key: string; check: () => void } | undefined;
let pending: { key: string; expected: number; resolve: (s: SendState) => void; mix: number; channel: number } | undefined;
client.on(MessageCode.ZLIB, () => {
  state.snapshot(client.dumpState().internal.children);
});
for (const code of [MessageCode.ParamValue, MessageCode.ParamString, MessageCode.ParamChars]) {
  client.on(code, data => {
    const key = state.update(data?.name, data?.value);
    if (pendingControl && key === pendingControl.key) pendingControl.check();
    if (pending && key === pending.key) {
      try {
        const actual = state.read(pending.mix, pending.channel);
        if (Math.abs(actual.level - pending.expected) <= 0.01) pending.resolve(actual);
      } catch { /* Unknown data cannot confirm a write. */ }
    }
  });
}
client.on('closed', () => { process.send?.({ event: 'disconnected' }); process.exit(1); });
process.on('disconnect', () => process.exit(0));
function reply(id: number, result: unknown) { process.send?.({ id, ok: true, result }); }
process.on('message', async (r: { id: number; kind: string; mix: number; channel: number; level: number; muted: boolean }) => {
  try {
    if (!ready) throw new ApiError(503, 'NOT_CONNECTED', 'Mixer is not synchronized');
    if (r.kind === 'status') return reply(r.id, { connected: true, mixer: state.name(), checkedAt: new Date().toISOString() });
    if (r.kind === 'mixes') return reply(r.id, state.mixes());
    if (['readMute', 'writeMute', 'readTalkback', 'writeTalkback'].includes(r.kind)) {
      assertTarget(allowed, r.mix);
      const mute = r.kind.endsWith('Mute');
      const read = () => mute ? state.readMute(r.mix) : state.readTalkback(r.mix);
      if (r.kind.startsWith('read')) return reply(r.id, read());
      if (mute) assertMuted(r.muted); else assertLevel(r.level);
      if (writing) throw new ApiError(409, 'DEVICE_BUSY', 'Another write is being confirmed');
      if (!read().writable) throw new ApiError(409, 'UNSAFE_MIX_MODE', 'Requires verified unlinked Aux mode');
      writing = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const matches = (s: MixMuteState | TalkbackState) => 'muted' in s ? s.muted === r.muted : Math.abs(s.level - r.level) <= 0.01;
      try {
        const receipt = new Promise<MixMuteState | TalkbackState | null>(resolve => {
          pendingControl = { key: mute ? `aux.ch${r.mix}.mute` : `talkback.ch1.aux${r.mix}`, check: () => {
            try { const actual = read(); if (matches(actual)) resolve(actual); } catch { /* Unknown values do not confirm writes. */ }
          } };
          timer = setTimeout(() => resolve(null), 1200);
        });
        // Library 1.9.1: AUX selector WITHOUT mixType targets the bus master mute.
        if (mute) await client.setMute({ type: 'AUX', channel: r.mix }, r.muted);
        else await client.setChannelVolumeLinear({ type: 'TALKBACK', mixType: 'AUX', mixNumber: r.mix }, r.level);
        let actual = await receipt;
        pendingControl = undefined;
        if (!actual) {
          const snapshot = await snapshotRead(r.mix, undefined, mute ? 'readMute' : 'readTalkback');
          if (!matches(snapshot)) throw new ApiError(409, 'READBACK_MISMATCH', 'Device value differs; no automatic retry');
          state.confirmControl(snapshot);
          actual = read();
        }
        console.log(`Confirmed Aux ${r.mix} ${mute ? 'master mute' : 'Talkback send'} from ${actual.source}`);
        reply(r.id, actual);
      } catch (e) {
        process.send?.({ id: r.id, ok: false, status: e instanceof ApiError ? e.status : 504, code: 'WRITE_UNCONFIRMED', message: 'Value may have changed. Reconnect and read before retrying; no automatic retry.' }, () => process.exit(1));
      } finally { clearTimeout(timer); pendingControl = undefined; writing = false; }
      return;
    }
    assertTarget(allowed, r.mix, r.kind === 'channels' ? undefined : r.channel);
    if (r.kind === 'channels') return reply(r.id, state.channels(r.mix));
    if (r.kind === 'read') return reply(r.id, state.read(r.mix, r.channel));
    if (r.kind !== 'write') throw new ApiError(400, 'UNKNOWN_OPERATION', 'Unknown adapter operation');
    assertLevel(r.level);
    if (writing) throw new ApiError(409, 'DEVICE_BUSY', 'Another send is being confirmed');
    if (!state.read(r.mix, r.channel).writable) throw new ApiError(409, 'UNSAFE_MIX_MODE', 'Aux and input must be verified and writable');
    writing = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const receipt = new Promise<SendState | null>(resolve => {
        pending = { key: `line.ch${r.channel}.aux${r.mix}`, expected: r.level, mix: r.mix, channel: r.channel, resolve };
        timer = setTimeout(() => resolve(null), 1200);
      });
      await client.setChannelVolumeLinear({ type: 'LINE', channel: r.channel, mixType: 'AUX', mixNumber: r.mix }, r.level);
      const partner = r.channel % 2 ? r.channel + 1 : r.channel - 1;
      if (state.isLinked(r.channel) && partner > r.channel) {
        await client.setChannelVolumeLinear({ type: 'LINE', channel: partner, mixType: 'AUX', mixNumber: r.mix }, r.level).catch(() => {});
      }
      let actual = await receipt;
      pending = undefined;
      if (!actual) {
        // Some firmware may not echo to the writer. Never accept optimistic state.
        const snapshot = await snapshotRead(r.mix, r.channel);
        if (Math.abs(snapshot.level - r.level) > 0.01) throw new ApiError(409, 'READBACK_MISMATCH', 'Device value differs from request; no automatic retry');
        state.confirm(snapshot);
        actual = state.read(r.mix, r.channel);
      }
      reply(r.id, actual);
    } catch (e) {
      process.send?.({ id: r.id, ok: false, status: e instanceof ApiError ? e.status : 504, code: 'WRITE_UNCONFIRMED', message: 'Send may have changed. Reconnect and read before retrying; no automatic write retry.' }, () => process.exit(1));
    } finally { clearTimeout(timer); pending = undefined; writing = false; }
  } catch (e) {
    process.send?.({ id: r.id, ok: false, status: e instanceof ApiError ? e.status : 503,
      code: e instanceof ApiError ? e.code : 'DEVICE_ERROR', message: e instanceof Error ? e.message : 'Device error' });
  }
});
await client.connect({ clientDescription: 'CECP Monitor Phase 2' });
ready = true;
process.send?.({ event: 'ready', mixer: state.name() });
// Upstream keepalive emits 'closed' on failure. It consumes heartbeat replies
// internally, so absence of public parameter events does not mean disconnection.
