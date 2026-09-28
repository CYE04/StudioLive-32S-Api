import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@featherbear/presonus-studiolive-api';
import { ApiError, type MixerAdapter } from '../src/mixer/MixerAdapter.ts';
import { StudioLiveAdapter } from '../src/mixer/StudioLiveAdapter.ts';
import { ReceivedState } from '../src/mixer/ReceivedState.ts';
import { AuthService } from '../src/auth/AuthService.ts';
import { hashPin } from '../src/auth/accounts.ts';
import { createApi } from '../src/api/app.ts';

test('installed library maps Aux master mute and built-in Talkback to distinct paths', () => {
  // Invoke the installed library's own selector mapping; no transport or fake device.
  const client = Object.create(Client.prototype) as any;
  assert.equal(client._getMuteTargetString({ type: 'AUX', channel: 13 }), 'aux/ch13/mute');
  assert.equal(client._getLevelString({ type: 'TALKBACK', mixType: 'AUX', mixNumber: 13 }), 'talkback/ch1/aux13');
  const reads: string[] = [];
  client.state = { get(path: string) { reads.push(path); return null; } };
  assert.equal(client.getMute({ type: 'AUX', channel: 13 }), null);
  assert.equal(client.getLevel({ type: 'TALKBACK', mixType: 'AUX', mixNumber: 13 }), null);
  assert.deepEqual(reads, ['aux/ch13/mute', 'talkback/ch1/aux13']);
});

test('received master mute and Talkback track external events, fail closed and enforce scope', () => {
  const state = new ReceivedState([13], 0);
  // Unit fixture only; not a mixer simulation or onsite acceptance test.
  state.snapshot({ aux: { children: {
    ch13: { children: { mute: 0, busmode: { value: 0, strings: 9 }, link: 0 } },
    ch14: { children: { link: 0 } }
  } }, talkback: { children: { ch1: { children: { aux13: 0.25 } } } } });
  assert.equal(state.readMute(13).muted, false);
  assert.equal(state.readTalkback(13).level, 25);
  assert.equal(state.readTalkback(13).input, 'talkback');
  assert.equal(state.readMute(13).writable, true);
  state.update('aux/ch13/mute', true);
  state.update(['talkback', 'ch1', 'aux13'], 0.5);
  assert.equal(state.readMute(13).muted, true);
  assert.equal(state.readMute(13).source, 'device-event');
  assert.equal(state.readTalkback(13).level, 50);
  assert.equal(state.readTalkback(13).source, 'device-event');
  assert.equal(state.update('talkback/ch1/volume', 1), null);
  assert.equal(state.update('talkback/ch33/aux13', 1), null);
  for (const read of [() => state.readMute(14), () => state.readTalkback(14)]) assert.throws(read, { status: 403 });
  state.update('aux/ch14/link', 1);
  assert.equal(state.readMute(13).writable, false);
  assert.equal(state.readTalkback(13).writable, false);
  state.update('aux/ch14/link', 0);
  state.update('aux/ch13/busmode', 0.5);
  assert.equal(state.readMute(13).writable, false);
  for (const bad of [null, '1', 0.5, Buffer.alloc(4)]) {
    state.update('aux/ch13/mute', bad);
    assert.throws(() => state.readMute(13), { status: 503 });
  }
  for (const bad of [null, '0.5', NaN, -0.1, 1.1]) {
    state.update('talkback/ch1/aux13', bad);
    assert.throws(() => state.readTalkback(13), { status: 503 });
  }
  state.snapshot({});
  assert.throws(() => state.readMute(13), { status: 503 });
  assert.throws(() => state.readTalkback(13), { status: 503 });
});

test('new adapter operations validate scope and values before any connection', () => {
  const adapter = new StudioLiveAdapter('', [13]);
  for (const call of [() => adapter.readMute(1), () => adapter.setMute(1, true), () => adapter.readTalkback(1), () => adapter.setTalkback(1, 25)]) assert.throws(call, { status: 403 });
  for (const bad of [1, 'true', null, 'toggle']) assert.throws(() => adapter.setMute(13, bad as any), { status: 400 });
  assert.throws(() => adapter.setTalkback(13, -1), { status: 400 });
  adapter.close();
});

test('HTTP Aux controls use real login, CSRF, both scope checks, validation and shared rate limits', async () => {
  const calls: unknown[][] = [];
  // Sentinel records dispatch then fails: never fabricates a mixer response.
  const hit = (name: string) => async (...args: unknown[]): Promise<never> => { calls.push([name, ...args]); throw new ApiError(503, 'NO_DEVICE', 'No hardware in test'); };
  const adapter: MixerAdapter = {
    connect: hit('connect'), status: hit('status'), mixes: hit('mixes'), channels: hit('channels'),
    readSend: hit('readSend'), setSend: hit('setSend'), readMute: hit('readMute'), setMute: hit('setMute'),
    readTalkback: hit('readTalkback'), setTalkback: hit('setTalkback'), close() {}
  };
  const auth = new AuthService([{ id: 'aux13', name: 'Test', mixes: [13, 15], ...await hashPin('12345678') }]);
  const server = createApi(adapter, [13, 14], auth);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const route of ['mute', 'talkback']) assert.equal((await fetch(`${base}/api/mixes/13/${route}`)).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account: 'aux13', pin: '12345678' }) });
    assert.equal(login.status, 200);
    const session = await login.json();
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const headers = { Cookie: cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json' };
    for (const route of ['mute', 'talkback']) {
      for (const mix of [1, 14, 15]) for (const method of ['GET', 'PATCH']) {
        assert.equal((await fetch(`${base}/api/mixes/${mix}/${route}`, { method, headers })).status, 403);
      }
      assert.equal((await fetch(`${base}/api/mixes/13/${route}`, { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
      assert.equal((await fetch(`${base}/api/mixes/13/${route}`, { method: 'POST', headers })).status, 405);
    }
    for (const body of ['{"muted":"true"}', '{"muted":1}', '{"muted":"toggle"}', '{"muted":true,"mix":14}', '{"mute":true}', 'null'])
      assert.equal((await fetch(`${base}/api/mixes/13/mute`, { method: 'PATCH', headers, body })).status, 400);
    for (const body of ['{"level":-1}', '{"level":101}', '{"level":"25"}', '{"level":10,"channel":33}', '{"gain":10}'])
      assert.equal((await fetch(`${base}/api/mixes/13/talkback`, { method: 'PATCH', headers, body })).status, 400);
    for (const path of ['/api/mixes/13/channels/1/mute', '/api/main/mute', '/api/talkback/gain'])
      assert.equal((await fetch(`${base}${path}`, { method: 'PATCH', headers, body: '{}' })).status, 404);
    assert.equal(calls.length, 0);
    for (const route of ['mute', 'talkback']) assert.equal((await fetch(`${base}/api/mixes/13/${route}`, { headers })).status, 503);
    for (const [route, body] of [['mute', '{"muted":true}'], ['mute', '{"muted":false}'], ['talkback', '{"level":25}']]) {
      await new Promise(r => setTimeout(r, 160));
      assert.equal((await fetch(`${base}/api/mixes/13/${route}`, { method: 'PATCH', headers, body })).status, 503);
      assert.equal((await fetch(`${base}/api/mixes/13/channels/1`, { method: 'PATCH', headers, body: '{"level":5}' })).status, 429);
    }
    assert.deepEqual(calls, [['readMute', 13], ['readTalkback', 13], ['setMute', 13, true], ['setMute', 13, false], ['setTalkback', 13, 25]]);
    await fetch(`${base}/api/logout`, { method: 'POST', headers });
    assert.equal((await fetch(`${base}/api/mixes/13/mute`, { headers })).status, 401);
  } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
});
