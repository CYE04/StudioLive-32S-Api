import { ApiError, assertLevel, assertTarget, type MixerAdapter, type MixerStatus, type MixInfo, type SendState } from './MixerAdapter.ts';

const MOCK_NAMES: Record<number, string> = {
  16: '吉他',
  17: '电吉他',
  18: '贝斯',
  19: '键盘',
  21: '鼓',
  23: '钢琴',
  25: 'Channel 25/26',
  27: 'Channel 27/28',
  29: 'Channel 29/30'
};

const LINKED_CHANNELS = new Set([19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);

export class MockAdapter implements MixerAdapter {
  #allowed: number[];
  #levels = new Map<string, number>();

  constructor(allowed: number[]) {
    this.#allowed = [...allowed];
    for (const mix of allowed) {
      for (let ch = 1; ch <= 32; ch++) {
        const defaultLevel = ch <= 15 ? 50 : ch === 18 ? 45 : ch === 23 ? 0 : 40;
        this.#levels.set(`${mix}:${ch}`, defaultLevel);
      }
    }
  }

  async connect() {}

  async status(): Promise<MixerStatus> {
    return {
      connected: true,
      mixer: 'StudioLive 32S (模拟演示)',
      checkedAt: new Date().toISOString()
    };
  }

  async mixes(): Promise<MixInfo[]> {
    const mixTitles: Record<number, string> = {
      5: '钢琴耳返 (Aux 5)',
      6: '鼓手耳返 (Aux 6)',
      7: '贝斯耳返 (Aux 7)',
      8: '吉他耳返 (Aux 8)',
      9: '电吉他耳返 (Aux 9)',
      10: '键盘耳返 (Aux 10)',
      11: '人声耳返 (Aux 11)',
      13: '测试混音 (Aux 13)'
    };
    return this.#allowed.map(id => ({
      id,
      name: mixTitles[id] || `混音 ${id}`,
      mode: 'Aux',
      modeRaw: 0,
      writable: true
    }));
  }

  async channels(mix: number): Promise<SendState[]> {
    assertTarget(this.#allowed, mix);
    const list: SendState[] = [];
    for (let ch = 1; ch <= 32; ch++) {
      list.push(await this.readSend(mix, ch));
    }
    return list;
  }

  async readSend(mix: number, channel: number): Promise<SendState> {
    assertTarget(this.#allowed, mix, channel);
    const level = this.#levels.get(`${mix}:${channel}`) ?? 0;
    const linked = LINKED_CHANNELS.has(channel);
    const writable = !linked || channel % 2 !== 0;
    return {
      mix,
      channel,
      name: MOCK_NAMES[channel] || `Channel ${channel}`,
      level,
      unit: 'percent',
      source: 'device-event',
      readAt: new Date().toISOString(),
      writable,
      linked
    };
  }

  async setSend(mix: number, channel: number, level: number): Promise<SendState> {
    assertTarget(this.#allowed, mix, channel);
    assertLevel(level);
    this.#levels.set(`${mix}:${channel}`, level);
    const partner = channel % 2 ? channel + 1 : channel - 1;
    if (LINKED_CHANNELS.has(channel) && LINKED_CHANNELS.has(partner)) {
      this.#levels.set(`${mix}:${partner}`, level);
    }
    return this.readSend(mix, channel);
  }

  // New device controls intentionally have no fabricated demo state.
  async readMute(mix: number): Promise<never> { assertTarget(this.#allowed, mix); throw new ApiError(503, 'UNSUPPORTED_STATE', 'Real device required'); }
  async setMute(mix: number, _muted: boolean): Promise<never> { return this.readMute(mix); }
  async readTalkback(mix: number): Promise<never> { return this.readMute(mix); }
  async setTalkback(mix: number, _level: number): Promise<never> { return this.readMute(mix); }
  close() {}
}
