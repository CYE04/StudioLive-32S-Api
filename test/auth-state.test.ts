import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/auth/AuthService.ts';
import { hashPin, verifyPin } from '../src/auth/accounts.ts';
import { ReceivedState } from '../src/mixer/ReceivedState.ts';

test('salted PIN hashes, wrong PIN, account scopes and revoked sessions', async () => {
  const first = await hashPin('12345678'), second = await hashPin('12345678');
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPin('12345678', first), true);
  assert.equal(await verifyPin('87654321', first), false);
  const auth = new AuthService([{ id: 'test', name: 'Test', mixes: [13, 14], lockedChannels: [23, 24], ...first }]);
  await assert.rejects(auth.login('test', '00000000', 'local'), { status: 401 });
  const session = await auth.login('test', '12345678', 'local');
  assert.deepEqual(auth.publicSession(session, [13]).account.mixes, [13]);
  assert.deepEqual(auth.publicSession(session, [13]).account.lockedChannels, [23, 24]);
  assert.equal(auth.isChannelLocked(session, 23), true);
  assert.equal(auth.isChannelLocked(session, 1), false);
  auth.authorize(session, 13, [13]);
  assert.throws(() => auth.authorize(session, 14, [13]), { status: 403 });
  assert.throws(() => auth.authorize(session, 1, [1, 13]), { status: 403 });
  assert.throws(() => auth.csrf(session, 'bad'), { status: 403 });
  const cookie = `cecp_session=${session.token}`;
  assert.equal(auth.session(cookie).account.id, 'test');
  auth.logout(session); assert.throws(() => auth.session(cookie), { status: 401 });
});
test('login attempts limited across remote addresses by account', async () => {
  const auth = new AuthService([{ id: 'test', name: 'Test', mixes: [13], ...await hashPin('12345678') }]);
  for (let i = 0; i < 10; i++) await assert.rejects(auth.login('test', '00000000', `ip${i}`), { status: 401 });
  await assert.rejects(auth.login('test', '12345678', 'newip'), { status: 429 });
});
test('received-state reducer never confuses unknown updates or linked buses with safe sends', () => {
  // Unit fixture for the reducer only, never a mixer server or a hardware acceptance result.
  const state = new ReceivedState([13], 0);
  state.snapshot({ global: { children: { mixer_name: 'fixture' } },
    aux: { children: { ch13: { children: { busmode: { strings: 9, value: 0 }, name: 'Test', link: 0 } }, ch14: { children: { link: 0 } } } },
    line: { children: { ch1: { children: { aux13: 0, link: false, name: 'Input' } }, ch2: { children: { aux13: 0, link: false } } } } });
  assert.equal(state.read(13, 1).writable, true);
  assert.equal(state.read(13, 1).level, 0);
  state.update('line/ch1/aux13', 0.2);
  assert.equal(state.read(13, 1).level, 20);
  assert.equal(state.read(13, 1).source, 'device-event');
  assert.throws(() => state.read(12, 1), { status: 403 });
  state.update('aux/ch14/link', 1);
  assert.equal(state.read(13, 1).writable, false);
  state.update('aux/ch14/link', 0);
  state.update('line/ch2/link', true);
  // Channel 1 is the odd master of stereo pair 1+2, so channel 1 is writable!
  assert.equal(state.read(13, 1).writable, true);
  // Channel 2 is the even slave of stereo pair 1+2, so channel 2 is read-only!
  assert.equal(state.read(13, 2).writable, false);
  // In channels(13), only master channel 1 is writable!
  assert.deepEqual(state.channels(13).filter(c => c.writable).map(c => c.channel), [1]);
  state.update('line/ch2/link', false);
  assert.equal(state.channels(13).length, 2);
  state.update('aux/ch13/busmode', Buffer.from([0, 0, 0, 0]));
  assert.equal(state.mixes()[0].writable, false);
});
