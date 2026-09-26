export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}
export interface MixerStatus { connected: boolean; mixer: string | null; checkedAt: string; error?: string; }
export interface MixInfo { id: number; name: string | null; mode: string | null; modeRaw: unknown; writable: boolean; }
export interface SendState { mix: number; channel: number; level: number; unit: 'percent'; source: 'device-snapshot' | 'device-event'; readAt: string; name?: string; writable?: boolean; linked?: boolean; }
export interface MixerAdapter {
  connect(): Promise<void>;
  status(): Promise<MixerStatus>;
  channels(mix: number): Promise<SendState[]>;
  mixes(): Promise<MixInfo[]>;
  readSend(mix: number, channel: number): Promise<SendState>;
  setSend(mix: number, channel: number, level: number): Promise<SendState>;
  close(): void;
}
export function assertTarget(allowed: readonly number[], mix: number, channel?: number) {
  if (!Number.isSafeInteger(mix) || mix < 1 || (channel !== undefined && (!Number.isSafeInteger(channel) || channel < 1)))
    throw new ApiError(400, 'INVALID_TARGET', 'Mix and channel must be positive integers');
  if (!allowed.includes(mix)) throw new ApiError(403, 'MIX_FORBIDDEN', 'Mix is not in ALLOWED_MIXES');
}
export function assertLevel(level: unknown): asserts level is number {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 100)
    throw new ApiError(400, 'INVALID_LEVEL', 'level must be a finite number from 0 to 100 (percent, not dB)');
}
