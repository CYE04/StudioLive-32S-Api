import { ApiError, assertTarget, type MixInfo, type SendState, type MixMuteState, type TalkbackState } from './MixerAdapter.ts';
import { resolveMode } from './mode.ts';
const value = (node: any): any => node && typeof node === 'object' && 'value' in node ? node.value : node;
const off = (v: unknown) => v === 0 || v === false;
// Holds only received state. Never reads the library's optimistic cache.
export class ReceivedState {
  #tree: any; #at = ''; #updates = new Map<string, { at: string; source: 'device-event' | 'device-snapshot' }>();
  #allowed: number[]; #mode: number | null;
  constructor(allowed: number[], mode: number | null) { this.#allowed = [...allowed]; this.#mode = mode; }
  snapshot(tree: any) { this.#tree = tree; this.#at = new Date().toISOString(); this.#updates.clear(); }
  update(name: unknown, incoming: unknown) {
    const key = Array.isArray(name) ? name.join('.') : typeof name === 'string' ? name.replaceAll('/', '.') : '';
    if (!/^(?:(line|aux)\.ch[1-9]\d*\.(aux[1-9]\d*|name|username|busmode|link|mute)|talkback\.ch1\.aux[1-9]\d*)$/.test(key)) return null;
    const [type, ch, prop] = key.split('.');
    const node = this.#tree?.[type]?.children?.[ch]?.children;
    if (!node || !Object.hasOwn(node, prop)) return null;
    // Upstream leaves some parameters as raw buffers. Do not decode or guess.
    const accepted = typeof incoming === 'number' || typeof incoming === 'string' || typeof incoming === 'boolean' ? incoming : null;
    node[prop] = node[prop] && typeof node[prop] === 'object' ? { ...node[prop], value: accepted } : accepted;
    this.#updates.set(key, { at: new Date().toISOString(), source: 'device-event' });
    return key;
  }
  name() { const name = value(this.#tree?.global?.children?.mixer_name); return typeof name === 'string' ? name : null; }
  mixes(): MixInfo[] {
    return this.#allowed.flatMap(id => {
      const props = this.#tree?.aux?.children?.[`ch${id}`]?.children;
      if (!props) return [];
      const mode = resolveMode(value(props.busmode), props.busmode?.strings, this.#mode);
      const partner = id % 2 ? id + 1 : id - 1;
      const partnerProps = this.#tree?.aux?.children?.[`ch${partner}`]?.children;
      const linkedSafe = off(value(props.link)) && (!partnerProps || off(value(partnerProps.link)));
      const raw = value(props.busmode);
      return [{ id, name: typeof value(props.name) === 'string' ? value(props.name) : null,
        mode, modeRaw: typeof raw === 'number' || typeof raw === 'string' ? raw : null,
        writable: mode?.toLowerCase() === 'aux' && linkedSafe }];
    });
  }
  isLinked(channel: number): boolean {
    const props = this.#tree?.line?.children?.[`ch${channel}`]?.children;
    const partner = channel % 2 ? channel + 1 : channel - 1;
    const other = this.#tree?.line?.children?.[`ch${partner}`]?.children;
    return (!off(value(props?.link))) || (other && !off(value(other.link)));
  }
  read(mix: number, channel: number): SendState {
    assertTarget(this.#allowed, mix, channel);
    const info = this.mixes().find(m => m.id === mix);
    const props = this.#tree?.line?.children?.[`ch${channel}`]?.children;
    if (!info || !props) throw new ApiError(404, 'TARGET_NOT_FOUND', 'Mix or input channel not found');
    const raw = value(props[`aux${mix}`]);
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) throw new ApiError(503, 'UNSUPPORTED_STATE', 'No reliable received AUX send');
    const partner = channel % 2 ? channel + 1 : channel - 1;
    const other = this.#tree?.line?.children?.[`ch${partner}`]?.children;
    const linked = (!off(value(props.link))) || (other && !off(value(other.link)));
    const update = this.#updates.get(`line.ch${channel}.aux${mix}`);
    const name = value(props.username) || value(props.name);
    const writable = Boolean(info.writable && (!linked || channel % 2 !== 0));
    return { mix, channel, name: typeof name === 'string' ? name : `Channel ${channel}`,
      level: raw * 100, unit: 'percent', source: update?.source ?? 'device-snapshot', readAt: update?.at ?? this.#at,
      writable, linked };
  }
  channels(mix: number): SendState[] {
    assertTarget(this.#allowed, mix);
    if (!this.mixes().some(m => m.id === mix)) throw new ApiError(404, 'TARGET_NOT_FOUND', 'Mix not found');
    return Object.keys(this.#tree?.line?.children ?? {}).filter(k => /^ch[1-9]\d*$/.test(k))
      .map(k => Number(k.slice(2)))
      .filter(ch => ch >= 1 && ch <= 32)
      .map(ch => this.read(mix, ch)).sort((a, b) => a.channel - b.channel);
  }
  readMute(mix: number): MixMuteState {
    assertTarget(this.#allowed, mix);
    const info = this.mixes().find(m => m.id === mix);
    const raw = value(this.#tree?.aux?.children?.[`ch${mix}`]?.children?.mute);
    if (!info || ![0, 1, false, true].includes(raw)) throw new ApiError(503, 'UNSUPPORTED_STATE', 'No reliable received AUX master mute');
    const update = this.#updates.get(`aux.ch${mix}.mute`);
    return { mix, muted: raw === 1 || raw === true, writable: info.writable,
      source: update?.source ?? 'device-snapshot', readAt: update?.at ?? this.#at };
  }
  readTalkback(mix: number): TalkbackState {
    assertTarget(this.#allowed, mix);
    const info = this.mixes().find(m => m.id === mix);
    const raw = value(this.#tree?.talkback?.children?.ch1?.children?.[`aux${mix}`]);
    if (!info || typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1)
      throw new ApiError(503, 'UNSUPPORTED_STATE', 'No reliable received built-in Talkback AUX send');
    const update = this.#updates.get(`talkback.ch1.aux${mix}`);
    return { mix, input: 'talkback', level: raw * 100, unit: 'percent', writable: info.writable,
      source: update?.source ?? 'device-snapshot', readAt: update?.at ?? this.#at };
  }
  confirmControl(state: MixMuteState | TalkbackState) {
    const key = 'muted' in state ? `aux.ch${state.mix}.mute` : `talkback.ch1.aux${state.mix}`;
    const previous = this.#updates.get(key);
    if (previous && Date.parse(previous.at) > Date.parse(state.readAt)) return;
    this.update(key, 'muted' in state ? state.muted : state.level / 100);
    this.#updates.set(key, { at: state.readAt, source: 'device-snapshot' });
  }
  confirm(state: SendState) {
    // Only called with a separate device snapshot, never with a requested level.
    const previous = this.#updates.get(`line.ch${state.channel}.aux${state.mix}`);
    if (previous && Date.parse(previous.at) > Date.parse(state.readAt)) return;
    this.update(`line.ch${state.channel}.aux${state.mix}`, state.level / 100);
    this.#updates.set(`line.ch${state.channel}.aux${state.mix}`, { at: state.readAt, source: 'device-snapshot' });
  }
}
