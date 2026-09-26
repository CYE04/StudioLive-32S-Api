import { Client, MessageCode } from '@featherbear/presonus-studiolive-api';
import { ApiError, assertLevel, assertTarget, type SendState } from './MixerAdapter.ts';
import { config } from '../config/index.ts';
import { ReceivedState } from './ReceivedState.ts';
import { snapshotRead } from './session.ts';
const { ip, allowed, verifiedAuxMode } = config();
const state = new ReceivedState(allowed, verifiedAuxMode);
const client = new Client({ host: ip }, { autoreconnect: false, logLevel: 'fatal' });
let ready = false, writing = false;
let pending: { key: string; expected: number; resolve: (s: SendState) => void; mix: number; channel: number } | undefined;
client.on(MessageCode.ZLIB, () => {
  state.snapshot(client.dumpState().internal.children);
});
for (const code of [MessageCode.ParamValue, MessageCode.ParamString, MessageCode.ParamChars]) {
  client.on(code, data => {
    const key = state.update(data?.name, data?.value);
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
process.on('message', async (r: { id: number; kind: string; mix: number; channel: number; level: number }) => {
  try {
    if (!ready) throw new ApiError(503, 'NOT_CONNECTED', 'Mixer is not synchronized');
    if (r.kind === 'status') return reply(r.id, { connected: true, mixer: state.name(), checkedAt: new Date().toISOString() });
    if (r.kind === 'mixes') return reply(r.id, state.mixes());
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
