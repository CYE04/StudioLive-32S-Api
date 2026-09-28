import { createServer, type IncomingMessage } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { ApiError, assertMuted, assertLevel, assertTarget, type MixerAdapter } from '../mixer/MixerAdapter.ts';
import { AuthService } from '../auth/AuthService.ts';
export function isLocalAddress(address: string) {
  const ip = address.replace(/^::ffff:/, '');
  return ip === '::1' || ip.startsWith('127.') || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}
export function localHosts(extraHosts: readonly string[] = []) {
  const hn = hostname().toLowerCase();
  const hnBase = hn.replace(/\.local$/, '');
  const envHosts = (process.env.ALLOWED_HOSTS ?? 'modem.cecp.it')
    .split(',')
    .map(h => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([
    'localhost',
    '127.0.0.1',
    hn,
    `${hnBase}.local`,
    ...extraHosts.map(h => h.toLowerCase()),
    ...envHosts,
    ...Object.values(networkInterfaces()).flatMap(items => (items ?? [])
      .filter(i => i.family === 'IPv4' && isLocalAddress(i.address)).map(i => i.address))
  ]);
}
async function body(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new ApiError(415, 'JSON_REQUIRED', 'Use application/json');
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024) throw new ApiError(413, 'BODY_TOO_LARGE', 'Request exceeds 1024 bytes');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(400, 'INVALID_JSON', 'Invalid JSON body'); }
}
function fields(input: any, names: string[]) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length !== names.length || names.some(k => !Object.hasOwn(input, k)))
    throw new ApiError(400, 'INVALID_FIELDS', `Only ${names.join(', ')} fields are accepted`);
}
export function createApi(adapter: MixerAdapter, allowed: readonly number[], auth: AuthService) {
  const files = new Map([
    ['/', { type: 'text/html; charset=utf-8', path: new URL('../web/index.html', import.meta.url) }],
    ['/app.js', { type: 'text/javascript; charset=utf-8', path: new URL('../web/app.js', import.meta.url) }],
    ['/styles.css', { type: 'text/css; charset=utf-8', path: new URL('../web/styles.css', import.meta.url) }],
    ['/logo.png', { type: 'image/png', path: new URL('../web/logo.png', import.meta.url) }],
    ['/watermark.png', { type: 'image/png', path: new URL('../web/watermark.png', import.meta.url) }],
    ['/mixer-background.jpg', { type: 'image/jpeg', path: new URL('../web/mixer-background.jpg', import.meta.url) }],
  ]);
  const writes = new Map<string, number>();
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host ?? '';
      const matchHost = /^([a-z0-9.-]+)(?::(\d+))?$/.exec(host);
      const hosts = localHosts();
      const origin = req.headers.origin;
      const originMatch = origin ? /^https?:\/\/([a-z0-9.-]+)(?::(\d+))?$/.exec(origin) : null;
      const originAllowed = !origin || origin === `http://${host}` || origin === `https://${host}` || (originMatch ? hosts.has(originMatch[1].toLowerCase()) : false);
      if (!isLocalAddress(req.socket.remoteAddress ?? '') || !matchHost || !hosts.has(matchHost[1].toLowerCase()) ||
        !originAllowed || req.headers['sec-fetch-site'] === 'cross-site')
        throw new ApiError(403, 'LOCAL_ONLY', 'Use this service directly on the local network or allowed domain');
      const path = req.url ?? '';
      const file = files.get(path);
      if (file && req.method === 'GET') {
        res.setHeader('Content-Type', file.type);
        res.end(readFileSync(file.path));
        return;
      }
      let result: unknown;
      if (path === '/api/login' && req.method === 'POST') {
        const input = await body(req); fields(input, ['account', 'pin']);
        const session = await auth.login(input.account, input.pin, req.socket.remoteAddress ?? 'unknown');
        // HTTP is limited to the trusted LAN (including the restricted local proxy).
        res.setHeader('Set-Cookie', `cecp_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        result = auth.publicSession(session, allowed);
      } else {
        const session = auth.session(req.headers.cookie);
        if (!['GET', 'HEAD'].includes(req.method ?? '')) auth.csrf(session, req.headers['x-csrf-token']);
        if (path === '/api/session' && req.method === 'GET') result = auth.publicSession(session, allowed);
        else if (path === '/api/logout' && req.method === 'POST') {
          auth.logout(session); res.setHeader('Set-Cookie', 'cecp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); result = { ok: true };
        } else if (path === '/api/status' && req.method === 'GET') result = await adapter.status();
        else if (path === '/api/reconnect' && req.method === 'POST') { await adapter.connect(); result = await adapter.status(); }
        else if (path === '/api/mixes' && req.method === 'GET') result = { mixes: (await adapter.mixes()).filter(m => allowed.includes(m.id) && session.account.mixes.includes(m.id)) };
        else if (path === '/api/channels/config' && req.method === 'GET') {
          try {
            const channelConfigFile = new URL('../../data/channels.json', import.meta.url);
            result = JSON.parse(readFileSync(channelConfigFile, 'utf8'));
          } catch {
            result = {};
          }
        } else if (path === '/api/channels/config' && req.method === 'POST') {
          const input = await body(req);
          if (typeof input !== 'object' || input === null) throw new ApiError(400, 'INVALID_BODY', 'Invalid channel configuration');
          const channelConfigFile = new URL('../../data/channels.json', import.meta.url);
          let current: Record<string, any> = {};
          try { current = JSON.parse(readFileSync(channelConfigFile, 'utf8')); } catch {}
          const merged = { ...current, ...input };
          writeFileSync(channelConfigFile, JSON.stringify(merged, null, 2) + '\n', 'utf8');
          result = { ok: true, config: merged };
        } else if (/^\/api\/mixes\/([1-9]\d*)\/(mute|talkback)$/.test(path)) {
          const match = /^\/api\/mixes\/([1-9]\d*)\/(mute|talkback)$/.exec(path)!;
          const mix = Number(match[1]), mute = match[2] === 'mute';
          auth.authorize(session, mix, allowed); assertTarget(allowed, mix);
          if (req.method === 'GET') result = mute ? await adapter.readMute(mix) : await adapter.readTalkback(mix);
          else if (req.method === 'PATCH') {
            const input = await body(req); fields(input, [mute ? 'muted' : 'level']);
            if (mute) assertMuted(input.muted); else assertLevel(input.level);
            const now = Date.now();
            if (now - (writes.get(session.account.id) ?? 0) < 150) throw new ApiError(429, 'SEND_RATE_LIMIT', 'Adjust more slowly');
            writes.set(session.account.id, now);
            result = mute ? await adapter.setMute(mix, input.muted) : await adapter.setTalkback(mix, input.level);
          } else throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET or PATCH');
        } else {
          const match = /^\/api\/mixes\/([1-9]\d*)\/channels(?:\/([1-9]\d*))?$/.exec(path);
          if (!match) throw new ApiError(404, 'NOT_FOUND', 'Unknown endpoint');
          const mix = Number(match[1]), channel = match[2] ? Number(match[2]) : undefined;
          // Both checks happen before contacting the adapter, for reads as well as writes.
          auth.authorize(session, mix, allowed); assertTarget(allowed, mix, channel);
          if (req.method === 'GET') {
            if (channel === undefined) {
              const list = await adapter.channels(mix);
              result = {
                channels: list.map(c => {
                  const locked = auth.isChannelLocked(session, c.channel) ||
                    Boolean(c.linked && auth.isChannelLocked(session, c.channel % 2 ? c.channel + 1 : c.channel - 1));
                  return locked ? { ...c, writable: false, locked: true } : c;
                })
              };
            } else {
              const state = await adapter.readSend(mix, channel);
              const locked = auth.isChannelLocked(session, channel) ||
                Boolean(state.linked && auth.isChannelLocked(session, channel % 2 ? channel + 1 : channel - 1));
              result = locked ? { ...state, writable: false, locked: true } : state;
            }
          } else if (req.method === 'PATCH' && channel !== undefined) {
            const locked = auth.isChannelLocked(session, channel) ||
              auth.isChannelLocked(session, channel % 2 ? channel + 1 : channel - 1);
            if (locked) throw new ApiError(403, 'CHANNEL_LOCKED', 'This channel is locked for your account');
            const input = await body(req); fields(input, ['level']); assertLevel(input.level);
            const now = Date.now();
            if (now - (writes.get(session.account.id) ?? 0) < 150) throw new ApiError(429, 'SEND_RATE_LIMIT', 'Adjust more slowly');
            writes.set(session.account.id, now);
            console.log(`Send request by ${session.account.id}: Mix ${mix} / Channel ${channel}`);
            result = await adapter.setSend(mix, channel, input.level);
          } else throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use GET or PATCH on a channel');
        }
      }
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = error instanceof ApiError ? error.status : 500;
      if (res.statusCode === 429) res.setHeader('Retry-After', error instanceof ApiError && error.code === 'LOGIN_LIMIT' ? '900' : '10');
      if (!(error instanceof ApiError)) console.error('Request failed:', error instanceof Error ? error.message : 'unknown');
      res.end(JSON.stringify({ error: error instanceof ApiError ? error.code : 'INTERNAL_ERROR', message: error instanceof ApiError ? error.message : 'Internal service error' }));
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000; server.maxConnections = 100;
  return server;
}
