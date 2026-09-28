// Disposable read-only snapshot client. No write commands exist in this process.
import { Client } from '@featherbear/presonus-studiolive-api';
import { ApiError, assertTarget } from './MixerAdapter.ts';
import { config } from '../config/index.ts';
import { ReceivedState } from './ReceivedState.ts';
process.once('message', async (r: { kind: string; mix: number; channel: number }) => {
  try {
    const { ip, allowed, verifiedAuxMode } = config();
    if (!['read', 'readMute', 'readTalkback'].includes(r.kind)) throw new ApiError(400, 'READ_ONLY', 'Snapshot worker is read-only');
    assertTarget(allowed, r.mix, r.channel);
    const client = new Client({ host: ip }, { autoreconnect: false, logLevel: 'fatal' });
    await client.connect({ clientDescription: 'CECP readback' });
    const state = new ReceivedState(allowed, verifiedAuxMode);
    state.snapshot(client.dumpState().internal.children);
    process.send?.({ ok: true, result: r.kind === 'readMute' ? state.readMute(r.mix) : r.kind === 'readTalkback' ? state.readTalkback(r.mix) : state.read(r.mix, r.channel) }, () => process.exit(0));
  } catch (e) {
    process.send?.({ ok: false, status: e instanceof ApiError ? e.status : 503, code: 'SNAPSHOT_FAILED',
      message: e instanceof Error ? e.message : 'Snapshot failed' }, () => process.exit(1));
  }
});
process.on('disconnect', () => process.exit(0));
