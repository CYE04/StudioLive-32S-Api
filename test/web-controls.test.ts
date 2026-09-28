import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// DOM/HTTP unit harness for the actual browser script, not a mixer simulator.
// Server authorization is exercised separately using real AuthService sessions.
class Element {
  value: any = ''; textContent = ''; innerHTML = ''; hidden = false; disabled = false;
  id = ''; className = ''; dataset: any = {}; parentElement: any = null;
  children: any[] = []; attributes = new Map(); listeners = new Map<string, Function[]>();
  style = { setProperty() {} }; classList = { add() {}, remove() {}, toggle() {} };
  get options() { return this.children; }
  setAttribute(k: string, v: any) { this.attributes.set(k, String(v)); }
  addEventListener(k: string, fn: Function) { this.listeners.set(k, [...(this.listeners.get(k) ?? []), fn]); }
  append(...nodes: any[]) { for (const n of nodes) { n.parentElement = this; this.children.push(n); } }
  appendChild(n: any) { this.append(n); }
  replaceChildren(...nodes: any[]) { this.children = []; this.append(...nodes); }
  remove() { this.parentElement?.children.splice(this.parentElement.children.indexOf(this), 1); }
  closest() { return this; }
  async fire(kind: string) { for (const fn of this.listeners.get(kind) ?? []) await fn({ target: this, preventDefault() {} }); }
}
async function harness() {
  const html = readFileSync(new URL('../src/web/index.html', import.meta.url), 'utf8');
  const elements = new Map<string, Element>();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, new Element());
  for (const [tag] of html.matchAll(/<[\w-]+\b[^>]*\bid="[^"]+"[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(tag)![1];
    for (const [, name, value] of tag.matchAll(/([\w-]+)="([^"]*)"/g)) elements.get(id)!.setAttribute(name, value);
  }
  for (const el of elements.values()) el.parentElement = new Element();
  const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const requests: { path: string; options: any }[] = [];
  let responder: (path: string, options: any) => any = () => ({ ok: false, status: 401, body: { error: 'LOGIN_REQUIRED' } });
  const context = createContext({
    document: { getElementById: (id: string) => elements.get(id), createElement: () => new Element(), querySelectorAll: () => [], body: new Element(), documentElement: new Element() },
    window: { scrollY: 0, scrollTo() {} }, localStorage: storage, sessionStorage: storage,
    console: { log() {}, warn() {} }, AbortController, setTimeout, clearTimeout, setInterval() {},
    fetch: async (path: string, options: any) => { requests.push({ path, options }); const res = await responder(path, options); return { ok: res.ok ?? true, status: res.status ?? 200, json: async () => res.body }; }
  });
  const run = (code: string) => runInContext(code, context);
  run(readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8'));
  const flush = () => new Promise<void>(resolve => setImmediate(resolve));
  await flush(); requests.length = 0;
  run("session = {csrf:'unit-csrf',account:{mixes:[13,14],lockedChannels:[]}}; selectedMix = 13; online = true; needsCheck = false;");
  return { run, requests, elements, flush, respond(fn: typeof responder) { responder = fn; } };
}

test('Talkback remains visible but disabled until real-state transport data arrives; Coro stays out', async () => {
  const h = await harness();
  h.run("render([{mix:13,channel:1,level:10,writable:true},{mix:13,channel:5,level:20,writable:true},{mix:13,channel:31,level:10,writable:true}]);");
  assert.equal(h.run('cards.has(1)'), false);
  assert.equal(h.run('cards.has(5)'), true);
  assert.equal(h.run('cards.has(31)'), false);
  for (let id = 1; id <= 4; id++) assert.equal(h.run(`Object.hasOwn(DEFAULT_CHANNEL_CONFIG, '${id}')`), false);
  assert.equal(h.elements.get('talkback-row')!.hidden, false);
  assert.equal(h.elements.get('talkback-range')!.disabled, true);
  assert.equal(h.elements.get('talkback-value')!.textContent, '未同步');
  h.run("demoMode = true; renderAuxControls();");
  assert.equal(h.elements.get('talkback-row')!.hidden, false);
  assert.equal(h.elements.get('talkback-range')!.disabled, true);
  await h.elements.get('talkback-plus')!.fire('click');
  assert.equal(h.requests.length, 0);
});

test('Talkback initial GET, continuous range, fractional PATCH, confirmation, external update and Mix switch', async () => {
  const h = await harness(); let level = 23.45;
  h.respond((path, options) => {
    if (path === '/api/status') return { body: { connected: true } };
    if (path === '/api/mixes') return { body: { mixes: [{ id: 13, name: 'Aux 13', writable: true }, { id: 14, name: 'Aux 14', writable: true }] } };
    if (path.endsWith('/channels')) return { body: { channels: [{ mix: 13, channel: 5, level: 20, writable: true }] } };
    const mix = path.includes('/14/') ? 14 : 13;
    if (path.endsWith('/mute')) return { body: { mix, muted: false, writable: true } };
    if (path.endsWith('/talkback')) {
      if (options.method === 'PATCH') level = JSON.parse(options.body).level;
      return { body: { mix, input: 'talkback', level, writable: true, source: 'device-event' } };
    }
    throw new Error('Unexpected test request: ' + path);
  });
  await h.run('refresh()');
  assert.ok(h.requests.some(r => r.path === '/api/mixes/13/talkback'));
  const range = h.elements.get('talkback-range')!;
  assert.equal(range.attributes.get('type'), 'range');
  assert.equal(range.attributes.get('step'), '0.01');
  assert.equal(Number(range.value), 23.45); assert.equal(range.disabled, false);
  assert.equal(h.elements.get('talkback-row')!.hidden, false);
  range.value = '42.37'; await range.fire('input');
  assert.equal(h.requests.filter(r => r.options.method === 'PATCH').length, 0);
  // Polling does not snap back the thumb during a drag.
  level = 24; await h.run('refresh()'); assert.equal(range.value, '42.37');
  await range.fire('change'); await h.flush();
  const write = h.requests.find(r => r.options.method === 'PATCH')!;
  assert.equal(write.path, '/api/mixes/13/talkback');
  assert.deepEqual(JSON.parse(write.options.body), { level: 42.37 });
  assert.equal(write.options.headers['X-CSRF-Token'], 'unit-csrf');
  assert.equal(Number(range.value), 42.37);
  level = 17.25; await h.run('refresh()'); assert.equal(Number(range.value), 17.25);
  h.elements.get('mix-select')!.value = '14'; await h.elements.get('mix-select')!.fire('change'); await h.flush();
  assert.ok(h.requests.some(r => r.path === '/api/mixes/14/talkback'));
  range.value = '18.15'; await range.fire('change'); await h.flush();
  assert.equal(h.requests.filter(r => r.options.method === 'PATCH').at(-1)!.path, '/api/mixes/14/talkback');
  assert.equal(h.requests.some(r => /channels\/(32|33)/.test(r.path)), false);
});

test('Talkback failures clear state and block writes; ordinary channel send and Aux mute remain distinct', async () => {
  const h = await harness();
  h.respond((path, options) => ({ body: path.endsWith('/mute') ? { mix: 13, muted: true, writable: true } : { mix: 13, channel: 5, level: JSON.parse(options.body).level, writable: true } }));
  h.run("render([{mix:13,channel:5,level:20,writable:true}]); mixMute = {mix:13,muted:false,writable:true};");
  await h.run('send(cards.get(5), 31.2)');
  assert.equal(h.requests.at(-1)!.path, '/api/mixes/13/channels/5');
  await h.elements.get('aux-mute')!.fire('click'); await h.flush();
  assert.equal(h.requests.at(-1)!.path, '/api/mixes/13/mute');
  assert.deepEqual(JSON.parse(h.requests.at(-1)!.options.body), { muted: true });
  h.run("talkbackState = {mix:13,level:20,writable:true}; renderAuxControls();");
  h.respond(() => ({ ok: false, status: 504, body: { error: 'WRITE_UNCONFIRMED' } }));
  const range = h.elements.get('talkback-range')!;
  range.value = '21'; await range.fire('change'); await h.flush();
  assert.equal(h.run('needsCheck'), true); assert.equal(range.disabled, true);
  const count = h.requests.length; await range.fire('change'); await h.flush(); assert.equal(h.requests.length, count);
  h.run("needsCheck = false; online = true; talkbackState = null; renderAuxControls();");
  assert.equal(h.elements.get('talkback-row')!.hidden, false); assert.equal(range.disabled, true);
});


test('missing Talkback GET keeps its disabled row and leaves ordinary channels available', async () => {
  const h = await harness();
  h.respond(path => {
    if (path === '/api/channels/config') return { body: { '1': {name:'Coro 1'}, '5': {name:'S:Verde'} } };
    if (path === '/api/status') return { body: {connected:true} };
    if (path === '/api/mixes') return { body: {mixes:[{id:13,writable:true}]} };
    if (path.endsWith('/channels')) return { body: {channels:[{mix:13,channel:5,level:20,writable:true}]} };
    if (path.endsWith('/mute')) return { body: {mix:13,muted:false,writable:true} };
    return {ok:false,status:503,body:{error:'UNSUPPORTED_STATE'}};
  });
  await h.run('loadChannelConfig()');
  assert.equal(h.run("Object.hasOwn(channelConfig, '1')"), false);
  assert.equal(h.run("channelConfig['5'].name"), 'S:Verde');
  await h.run('refresh()');
  assert.equal(h.elements.get('talkback-row')!.hidden, false);
  assert.equal(h.elements.get('talkback-range')!.disabled, true);
  assert.equal(h.elements.get('aux-mute')!.disabled, false);
  assert.equal(h.run('cards.get(5).range.disabled'), false);
  assert.match(h.elements.get('talkback-note')!.textContent, /尚未读到真实/);
});
