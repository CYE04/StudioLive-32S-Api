import { isIPv4 } from 'node:net';
export function config(env: NodeJS.ProcessEnv = process.env) {
  const ip = env.MIXER_IP?.trim() || '';
  if (ip && !isIPv4(ip)) throw new Error('MIXER_IP must be a valid IPv4 address');
  if (ip && !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) throw new Error('MIXER_IP must be a private LAN IPv4 address');
  const portText = env.PORT ?? '3000';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const raw = env.ALLOWED_MIXES ?? '';
  if (!/^[1-9]\d*(,[1-9]\d*)*$/.test(raw)) throw new Error('ALLOWED_MIXES must be an explicit comma-separated allowlist');
  const allowed = [...new Set(raw.split(',').map(Number))];
  if (allowed.some(n => !Number.isSafeInteger(n) || n > 16)) throw new Error('32S Phase 1 supports Mix 1–16 only');
  const verifiedText = env.VERIFIED_AUX_MODE_VALUE?.trim() ?? '';
  const verifiedAuxMode = verifiedText === '' ? null : Number(verifiedText);
  if (verifiedAuxMode !== null && (!Number.isFinite(verifiedAuxMode) || verifiedAuxMode < 0 || verifiedAuxMode > 1))
    throw new Error('VERIFIED_AUX_MODE_VALUE must be blank or a verified normalized number from 0 to 1');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('HOST must be 127.0.0.1 or 0.0.0.0');
  return { ip, port, allowed, verifiedAuxMode, host, accountsFile: env.ACCOUNTS_FILE || 'data/accounts.json' };
}
