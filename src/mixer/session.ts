import { fork } from 'node:child_process';
import { ApiError } from './MixerAdapter.ts';
// Read-only recovery snapshots use a bounded, disposable upstream process.
export function snapshotRead(mix: number, channel?: number, kind: 'read' | 'readMute' | 'readTalkback' = 'read'): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = fork(new URL('./snapshot-worker.ts', import.meta.url), [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let done = false;
    const finish = (error?: Error, value?: unknown) => {
      if (done) return; done = true; clearTimeout(timer); child.kill();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new ApiError(504, 'READBACK_TIMEOUT', 'Device readback timed out')), 8000);
    child.once('error', e => finish(e));
    child.once('exit', () => finish(new ApiError(503, 'READBACK_FAILED', 'Device snapshot process stopped')));
    child.once('message', (r: any) => r.ok ? finish(undefined, r.result) : finish(new ApiError(r.status, r.code, r.message)));
    child.send({ kind, mix, channel });
  });
}
