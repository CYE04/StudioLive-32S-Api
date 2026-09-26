import { randomInt } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { hashPin } from '../src/auth/accounts.ts';
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const id = option('--id'), name = option('--name'), mixText = option('--mixes');
if (!id || !/^[a-z0-9_-]{1,32}$/.test(id) || !name || !mixText || !/^[1-9]\d*(,[1-9]\d*)*$/.test(mixText)) {
  console.error('Usage: npm run account -- --id aux13 --name "Aux 13" --mixes 13 [--reset]'); process.exit(1);
}
const mixes = [...new Set(mixText.split(',').map(Number))];
if (mixes.some(m => m > 16)) throw new Error('Mix must be 1–16');
const file = resolve(process.env.ACCOUNTS_FILE || 'data/accounts.json');
let accounts: any[] = [];
try { accounts = JSON.parse(await readFile(file, 'utf8')); } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
if (!Array.isArray(accounts)) throw new Error('Invalid accounts file');
if (accounts.some(a => a.id === id) && !args.includes('--reset')) throw new Error('Account exists. Use --reset to replace its PIN and assignment.');
const customPin = option('--pin');
if (customPin && !/^\d{8}$/.test(customPin)) {
  console.error('Error: --pin must be exactly 8 digits (e.g. --pin 12345678)'); process.exit(1);
}
const lockText = option('--lock');
let lockedChannels: number[] | undefined;
if (lockText) {
  if (!/^[1-9]\d*(,[1-9]\d*)*$/.test(lockText)) {
    console.error('Error: --lock must be comma-separated channel numbers 1–32 (e.g. --lock 23,24)');
    process.exit(1);
  }
  lockedChannels = [...new Set(lockText.split(',').map(Number))];
  if (lockedChannels.some(c => c > 32)) {
    console.error('Error: Locked channels must be 1–32');
    process.exit(1);
  }
}
const pin = customPin || String(randomInt(0, 100000000)).padStart(8, '0');
const account = { id, name, mixes, ...(lockedChannels ? { lockedChannels } : {}), ...await hashPin(pin) };
accounts = accounts.filter(a => a.id !== id); accounts.push(account);
await mkdir(dirname(file), { recursive: true, mode: 0o700 });
const temp = `${file}.${process.pid}.tmp`;
await writeFile(temp, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
await rename(temp, file);
console.log(`Account: ${id}\nPIN (shown once): ${pin}\nMixes: ${mixes.join(',')}${lockedChannels ? `\nLocked: ${lockedChannels.join(',')}` : ''}\nRestart the service to load accounts and invalidate old sessions.`);
