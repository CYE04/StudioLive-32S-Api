import { fork, type ChildProcess } from 'node:child_process';
import { ApiError, assertLevel, assertTarget, type MixerAdapter, type MixerStatus, type MixInfo, type SendState } from './MixerAdapter.ts';
export class StudioLiveAdapter implements MixerAdapter {
  #ip: string; #allowed: number[]; #child?: ChildProcess; #closed = false; #ready = false;
  #nextId = 0; #starting?: Promise<void>; #lastAttempt = 0; #error = 'Not connected';
  #pending = new Map<number, { resolve: (value: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  constructor(ip: string, allowed: number[]) { this.#ip = ip; this.#allowed = [...allowed]; }
  #stop(error: string) {
    this.#ready = false; this.#error = error;
    const child = this.#child; this.#child = undefined; child?.kill();
    for (const p of this.#pending.values()) { clearTimeout(p.timer); p.reject(new ApiError(503, 'DISCONNECTED', error)); }
    this.#pending.clear();
  }
  async connect() {
    if (this.#closed) throw new ApiError(503, 'STOPPED', 'Service is stopping');
    if (this.#ready) return;
    if (this.#starting) return this.#starting;
    if (!this.#ip) throw new ApiError(503, 'MIXER_NOT_CONFIGURED', 'Set MIXER_IP');
    if (Date.now() - this.#lastAttempt < 10000) throw new ApiError(429, 'RECONNECT_COOLDOWN', 'Wait 10 seconds between connection attempts');
    this.#lastAttempt = Date.now();
    console.log('StudioLive connecting...');
    this.#starting = new Promise<void>((resolve, reject) => {
      const child = fork(new URL('./device-worker.ts', import.meta.url), [], {
        execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, MIXER_IP: this.#ip, ALLOWED_MIXES: this.#allowed.join(',') },
      });
      this.#child = child;
      const fail = (message: string) => {
        if (this.#child !== child) return;
        clearTimeout(timer); this.#stop(message); reject(new ApiError(503, 'DISCONNECTED', message));
        console.error(`StudioLive: ${message}`);
      };
      const timer = setTimeout(() => fail('Connection timed out; no automatic restart'), 8000);
      child.on('error', () => fail('Device process failed'));
      child.on('exit', () => fail('Connection lost; use Reconnect. Pending writes are not retried.'));
      child.on('message', (r: any) => {
        if (this.#child !== child) return;
        if (r.event === 'ready') {
          clearTimeout(timer); this.#ready = true; this.#error = '';
          console.log('StudioLive connected'); console.log(`Mixer: ${r.mixer ?? 'unknown'}`); resolve(); return;
        }
        if (r.event === 'disconnected') { fail('Mixer disconnected'); return; }
        const p = this.#pending.get(r.id);
        if (!p) return;
        this.#pending.delete(r.id); clearTimeout(p.timer);
        r.ok ? p.resolve(r.result) : p.reject(new ApiError(r.status, r.code, r.message));
      });
    });
    try { await this.#starting; } finally { this.#starting = undefined; }
  }
  async #request<T>(request: object): Promise<T> {
    if (!this.#ready || !this.#child) throw new ApiError(503, 'DISCONNECTED', this.#error || 'Not connected');
    if (this.#pending.size >= 64) throw new ApiError(429, 'DEVICE_BUSY', 'Too many pending requests');
    return new Promise((resolve, reject) => {
      const id = ++this.#nextId;
      const timer = setTimeout(() => this.#stop('Device operation timed out. A send may have changed; reconnect before retrying.'), 12000);
      this.#pending.set(id, { resolve, reject, timer });
      this.#child!.send({ ...request, id }, error => { if (error) this.#stop('Device IPC disconnected'); });
    });
  }
  async status(): Promise<MixerStatus> {
    if (!this.#ready) return { connected: false, mixer: null, checkedAt: new Date().toISOString(), error: this.#error };
    try { return await this.#request<MixerStatus>({ kind: 'status' }); }
    catch { return { connected: false, mixer: null, checkedAt: new Date().toISOString(), error: this.#error }; }
  }
  mixes() { return this.#request<MixInfo[]>({ kind: 'mixes' }); }
  channels(mix: number) { assertTarget(this.#allowed, mix); return this.#request<SendState[]>({ kind: 'channels', mix }); }
  readSend(mix: number, channel: number) {
    assertTarget(this.#allowed, mix, channel); return this.#request<SendState>({ kind: 'read', mix, channel });
  }
  async setSend(mix: number, channel: number, level: number) {
    assertTarget(this.#allowed, mix, channel); assertLevel(level);
    console.log(`Validating send request: Mix ${mix} / Channel ${channel} → ${level}%`);
    const actual = await this.#request<SendState>({ kind: 'write', mix, channel, level });
    console.log(`Confirmed Mix ${mix} / Channel ${channel}: ${actual.level}% (${actual.source})`);
    return actual;
  }
  close() { this.#closed = true; this.#stop('Service stopped'); }
}
