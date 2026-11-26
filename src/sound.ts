/**
 * 効果音はすべて Web Audio で合成する。外部の音声ファイルは使わない。
 * 依存ゼロ・ブラウザ完結のための設計で、演出レベル1（静か）では何も鳴らさない。
 */
/** レベル別 音量倍率（レベル1は無音） */
const LEVEL_VOL = [0, 0, 0.3, 0.6, 0.85, 1];

export class SoundEngine {
  /** 演出レベル 1(静か)〜5(MAX)。main から同期される */
  level = 5;
  private ctx: AudioContext | null = null;

  private soundOn(): boolean {
    return this.level >= 2;
  }

  private volScale(): number {
    return LEVEL_VOL[this.level] ?? 1;
  }

  private audio(): AudioContext | null {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** ユーザー操作の流れで AudioContext を起こす（自動再生制限の回避）。 */
  unlock(): void {
    this.audio();
  }

  tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    when = 0,
    slideTo?: number,
  ): void {
    if (!this.soundOn()) return;
    const ac = this.audio();
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol * this.volScale(), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noiseBurst(dur: number, vol: number, when = 0): void {
    if (!this.soundOn()) return;
    const ac = this.audio();
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2500;
    const g = ac.createGain();
    g.gain.value = vol * this.volScale();
    src.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    src.start(t0);
  }

  /** コイン投入音（抽選開始） */
  coin(): void {
    this.tone(988, 0.09, "square", 0.1, 0);
    this.tone(1319, 0.28, "square", 0.1, 0.09);
  }

  /** リール回転中のチック音 */
  tick(high: boolean): void {
    this.tone(high ? 1560 : 1180, 0.03, "square", 0.045, 0);
  }

  /** 減速中のチック音。進むほど音程が上がる */
  decelTick(step: number, total: number): void {
    const f = 700 + (step / Math.max(1, total)) * 900;
    this.tone(f, 0.05, "square", 0.07, 0);
  }

  /** リーチ中の心拍音 */
  heartbeat(): void {
    this.tone(68, 0.14, "sine", 0.5, 0);
    this.tone(58, 0.12, "sine", 0.4, 0.18);
  }

  /** リーチ開始のサイレン */
  siren(): void {
    this.tone(520, 0.7, "sawtooth", 0.05, 0, 1180);
  }

  /** 当選ファンファーレ */
  fanfare(): void {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    for (let i = 0; i < seq.length; i++) {
      const last = i === seq.length - 1;
      this.tone(seq[i], last ? 0.7 : 0.16, "square", 0.11, i * 0.13);
      this.tone(seq[i] / 2, last ? 0.7 : 0.16, "triangle", 0.09, i * 0.13);
    }
    this.noiseBurst(0.5, 0.12, 0.2);
    this.noiseBurst(0.4, 0.1, 0.65);
  }

  /** ボタンのクリック音 */
  click(): void {
    this.tone(880, 0.05, "square", 0.06, 0);
  }
}
