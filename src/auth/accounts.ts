import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export interface Account { id: string; name: string; mixes: number[]; salt: string; hash: string; lockedChannels?: number[]; }
export async function hashPin(pin: string, salt = randomBytes(16).toString('hex')) {
  const hash = await derive(pin, salt, 64) as Buffer;
  return { salt, hash: hash.toString('hex') };
}
export async function verifyPin(pin: string, account: Pick<Account, 'salt' | 'hash'>) {
  const result = await hashPin(pin, account.salt);
  return timingSafeEqual(Buffer.from(result.hash, 'hex'), Buffer.from(account.hash, 'hex'));
}
export async function loadAccounts(path: string): Promise<Account[]> {
  const data: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(data) || !data.length || data.length > 100) throw new Error('Accounts file must contain 1–100 accounts. Run npm run account.');
  const seen = new Set<string>();
  return data.map((a: any) => {
    if (!a || !/^[a-z0-9_-]{1,32}$/.test(a.id) || seen.has(a.id) || typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80 ||
      !Array.isArray(a.mixes) || !a.mixes.length || a.mixes.some((n: unknown) => !Number.isInteger(n) || Number(n) < 1 || Number(n) > 16) ||
      !/^[a-f0-9]{32}$/.test(a.salt) || !/^[a-f0-9]{128}$/.test(a.hash) ||
      (a.lockedChannels !== undefined && (!Array.isArray(a.lockedChannels) || a.lockedChannels.some((n: unknown) => !Number.isInteger(n) || Number(n) < 1 || Number(n) > 32))))
      throw new Error('Invalid account configuration');
    seen.add(a.id);
    return {
      id: a.id,
      name: a.name,
      mixes: [...new Set<number>(a.mixes)],
      salt: a.salt,
      hash: a.hash,
      lockedChannels: Array.isArray(a.lockedChannels) ? [...new Set<number>(a.lockedChannels)] : undefined
    };
  });
}
