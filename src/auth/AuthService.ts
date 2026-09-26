import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../mixer/MixerAdapter.ts';
import { type Account, hashPin, verifyPin, loadAccounts } from './accounts.ts';
export interface Session { account: Account; token: string; csrf: string; expires: number; }
export class AuthService {
  #accounts: Account[]; #sessions = new Map<string, Session>();
  #attempts = new Map<string, { count: number; expires: number }>();
  #dummy: Promise<{ salt: string; hash: string }>; #active = 0;
  #accountsFile?: string;
  constructor(accounts: Account[], accountsFile?: string) {
    this.#accounts = structuredClone(accounts);
    this.#accountsFile = accountsFile;
    this.#dummy = hashPin(randomBytes(16).toString('hex'));
  }
  #take(key: string, maximum: number) {
    const now = Date.now();
    for (const [key, item] of this.#attempts) if (item.expires <= now) this.#attempts.delete(key);
    let entry = this.#attempts.get(key);
    if (!entry) {
      if (this.#attempts.size >= 10000) throw new ApiError(429, 'LOGIN_LIMIT', 'Too many login attempts. Try later.');
      entry = { count: 0, expires: now + 15 * 60 * 1000 }; this.#attempts.set(key, entry);
    }
    if (++entry.count > maximum) throw new ApiError(429, 'LOGIN_LIMIT', 'Too many login attempts. Wait 15 minutes.');
  }
  async login(id: unknown, pin: unknown, ip: string): Promise<Session> {
    this.#take(`ip:${ip}`, 20);
    const text = typeof id === 'string' ? id.trim() : '';
    if (!text || text.length > 32 || typeof pin !== 'string' || !/^\d{8}$/.test(pin))
      throw new ApiError(401, 'LOGIN_FAILED', 'Incorrect account or PIN');
    this.#take(`account:${text}`, 10);
    if (this.#accountsFile) {
      try { this.#accounts = await loadAccounts(this.#accountsFile); } catch {}
    }
    if (this.#active >= 4) throw new ApiError(429, 'LOGIN_BUSY', 'Login busy. Try shortly.');
    this.#active++;
    try {
      const lower = text.toLowerCase();
      const account = this.#accounts.find(a => a.id.toLowerCase() === lower || a.name.trim().toLowerCase() === lower);
      const valid = await verifyPin(pin, account ?? await this.#dummy);
      if (!valid || !account) throw new ApiError(401, 'LOGIN_FAILED', 'Incorrect account or PIN');
      for (const [token, session] of this.#sessions) if (session.expires <= Date.now()) this.#sessions.delete(token);
      if (this.#sessions.size >= 1000) throw new ApiError(429, 'SESSION_LIMIT', 'Too many sessions');
      const session = { account, token: randomBytes(32).toString('hex'), csrf: randomBytes(32).toString('hex'), expires: Date.now() + 8 * 60 * 60 * 1000 };
      this.#sessions.set(session.token, session); return session;
    } finally { this.#active--; }
  }
  session(cookie?: string): Session {
    const token = /(?:^|;\s*)cecp_session=([a-f0-9]{64})(?:;|$)/.exec(cookie ?? '')?.[1];
    const session = token ? this.#sessions.get(token) : undefined;
    if (!session || session.expires <= Date.now()) {
      if (token) this.#sessions.delete(token);
      throw new ApiError(401, 'LOGIN_REQUIRED', 'Please sign in');
    }
    return session;
  }
  csrf(session: Session, token: unknown) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf)))
      throw new ApiError(403, 'CSRF_FAILED', 'Invalid request token. Reload the page.');
  }
  authorize(session: Session, mix: number, allowed: readonly number[]) {
    if (!allowed.includes(mix) || !session.account.mixes.includes(mix)) throw new ApiError(403, 'MIX_FORBIDDEN', 'This mix is not assigned to your account');
  }
  logout(session: Session) { this.#sessions.delete(session.token); }
  isChannelLocked(session: Session, channel: number): boolean {
    return (session.account.lockedChannels ?? []).includes(channel);
  }
  publicSession(session: Session, allowed: readonly number[]) {
    return {
      account: {
        id: session.account.id,
        name: session.account.name,
        mixes: session.account.mixes.filter(m => allowed.includes(m)),
        lockedChannels: session.account.lockedChannels ?? []
      },
      csrf: session.csrf,
      expiresAt: new Date(session.expires).toISOString()
    };
  }
}
