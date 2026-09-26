import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config/index.ts';
import { assertLevel, assertTarget, type MixerAdapter } from '../src/mixer/MixerAdapter.ts';
import { StudioLiveAdapter } from '../src/mixer/StudioLiveAdapter.ts';
import { createApi } from '../src/api/app.ts';
import { AuthService } from '../src/auth/AuthService.ts';
import { hashPin } from '../src/auth/accounts.ts';
import { resolveMode } from '../src/mixer/mode.ts';

test('mode calibration fails closed and respects explicit device labels', () => {
  assert.equal(resolveMode(0, 9, null), null);
  assert.equal(resolveMode(0, 9, 0), 'Aux');
  assert.equal(resolveMode(0.5, 9, 0), null);
  assert.equal(resolveMode(1, 9, 0), null);
  assert.equal(resolveMode(0, ['Sub'], 0), 'Sub');
  assert.equal(resolveMode(null, 9, 0), null);
  assert.throws(() => config({ ALLOWED_MIXES: '13', VERIFIED_AUX_MODE_VALUE: 'oops' }));
});

test('configuration fails closed for invalid IP and allowlist', () => {
  for (const MIXER_IP of ['192.168.5138', 'example.com', '8.8.8.8']) assert.throws(() => config({ MIXER_IP, ALLOWED_MIXES: '1,2' }));
  for (const ALLOWED_MIXES of ['', '0', '1,', '1,2x', '17', '-1']) assert.throws(() => config({ ALLOWED_MIXES }));
  assert.deepEqual(config({ ALLOWED_MIXES: '1,2' }).allowed, [1, 2]);
});
test('strict target and percent validation', () => {
  assert.throws(() => assertTarget([1, 2], 10, 5), { status: 403 });
  for (const n of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => assertTarget([1], 1, n));
  for (const n of [-12.5, 101, NaN, Infinity, '50', null]) assert.throws(() => assertLevel(n));
  assertLevel(0); assertLevel(100);
});
test('adapter rejects forbidden calls before connecting', async () => {
  const adapter = new StudioLiveAdapter('', [1]);
  assert.throws(() => adapter.readSend(10, 5), { status: 403 });
  await assert.rejects(adapter.setSend(10, 5, 20), { status: 403 });
  await assert.rejects(adapter.setSend(1, 1, -12.5), { status: 400 });
  adapter.close();
});
test('HTTP rejects unsafe requests without invoking mixer', async () => {
  let calls = 0;
  const forbidden = async (): Promise<never> => { calls++; throw new Error('Must not access mixer'); };
  // Guard-only test sentinel, never returns a simulated mixer response.
  const adapter: MixerAdapter = { connect: forbidden, channels: forbidden, status: forbidden, mixes: forbidden, readSend: forbidden, setSend: forbidden, close() {} };
  const auth = new AuthService([{ id: 'test', name: 'Test', mixes: [1], ...await hashPin('12345678') }]);
  const server = createApi(adapter, [1, 2], auth);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/api/status`)).status, 401);
    assert.equal((await fetch(`${base}/api/mixes/1/channels/1`)).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'test', pin: '12345678' }) });
    assert.equal(login.status, 200);
    const session = await login.json();
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'X-CSRF-Token': session.csrf };
    for (const method of ['GET', 'PATCH', 'POST']) assert.equal((await fetch(`${base}/api/mixes/10/channels/5`, { method, headers })).status, 403);
    for (const body of ['{"level":-12.5}', '{"level":20,"mute":true}', '{"command":"Main"}', 'null', '{']) {
      assert.equal((await fetch(`${base}/api/mixes/1/channels/1`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body })).status, 400);
    }
    assert.equal((await fetch(`${base}/api/mixes/1/channels/1`, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ level: 'x'.repeat(2000) }) })).status, 413);
    assert.equal((await fetch(`${base}/api/status`, { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(`${base}/api/command`, { method: 'POST', headers })).status, 404);
    for (const method of ['GET', 'PATCH']) assert.equal((await fetch(`${base}/api/mixes/2/channels/1`, { method, headers })).status, 403);
    assert.equal((await fetch(`${base}/api/mixes/1/channels/1`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{"level":5}' })).status, 403);
    assert.equal((await fetch(`${base}/api/session`, { headers })).status, 200);
    const cfgGet = await fetch(`${base}/api/channels/config`, { headers });
    assert.equal(cfgGet.status, 200);
    const cfgPost = await fetch(`${base}/api/channels/config`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ '11': { name: 'S: verde', color: '#22c55e', icon: 'mic', textColor: '#000000' } })
    });
    assert.equal(cfgPost.status, 200);
    assert.equal((await fetch(`${base}/api/logout`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${base}/api/session`, { headers })).status, 401);
    assert.equal(calls, 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
