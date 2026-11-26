/** 紙吹雪・火花・花火・星・サイドキャノン。canvas 1枚で描く。外部アセット不要。
 * canvas-confetti の実績レシピ（realistic 5発重ね / side cannons / fireworks / stars）を
 * 依存ゼロのまま自前実装したもの。量は演出レベルで変わる。 */

interface ConfettiPart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  w?: number;
  h?: number;
  rot?: number;
  vr?: number;
  spark?: boolean;
  burst?: boolean;
  star?: boolean;
  grav?: boolean;
  life?: number;
  decay?: number;
  size?: number;
  seed?: number;
}

const BURST_COLORS = ["#ffd34d", "#ff2e4d", "#2ee6ff", "#ff3df0", "#ffffff", "#7dff6a", "#ffe97a"];

export class Confetti {
  /** 演出レベル 1〜5。main から同期される */
  level = 5;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private parts: ConfettiPart[] = [];
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context is not available");
    this.ctx = ctx;
    window.addEventListener("resize", () => this.sizeCanvas());
    this.sizeCanvas();
  }

  private sizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

launchConfetti(): void {
  let colors = ["#ffd34d", "#ff2e4d", "#2ee6ff", "#ff3df0", "#ffffff", "#7dff6a"];
  let count = this.level >= 5 ? 160 : this.level >= 4 ? 110 : 70; // レベルで量を変える
  for(let i = 0; i < count; i++){
    this.parts.push({
      x: Math.random() * this.canvas.width,
      y: -20 - Math.random() * this.canvas.height * 0.35,
      w: 6 + Math.random() * 7, h: 8 + Math.random() * 9,
      vy: 2.2 + Math.random() * 3.4, vx: -1.4 + Math.random() * 2.8,
      rot: Math.random() * Math.PI, vr: -0.12 + Math.random() * 0.24,
      color: colors[i % colors.length]
    });
  }
  if(!this.running){ this.running = true; requestAnimationFrame(this.frame); }
}
addSpark(x: number, y: number): void {
  this.parts.push({
    spark: true,
    x, y,
    vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6,
    life: 1, decay: 0.03, size: 2.5 + Math.random() * 3,
    color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
  });
  if (!this.running) { this.running = true; requestAnimationFrame(this.frame); }
}

launchSparks(): void {
  let colors = ["#ffd34d", "#ffe97a", "#ff2e4d", "#2ee6ff", "#ff3df0", "#ffffff"];
  let cx = this.canvas.width / 2, cy = this.canvas.height * 0.42;
  let count = this.level >= 5 ? 34 : 24;
  for(let i = 0; i < count; i++){
    let ang = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6.5;
    this.parts.push({
      spark: true,
      x: cx + (Math.random() - 0.5) * this.canvas.width * 0.4, y: cy,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.2,
      life: 1, decay: 0.018 + Math.random() * 0.022,
      size: 2 + Math.random() * 3.5,
      color: colors[i % colors.length]
    });
  }
  if(!this.running){ this.running = true; requestAnimationFrame(this.frame); }
}
private burstAt(x: number, y: number, count: number, maxSpeed: number, size: number): void {
  for(let i = 0; i < count; i++){
    let ang = Math.random() * Math.PI * 2, sp = (0.25 + Math.random() * 0.75) * maxSpeed;
    this.parts.push({
      burst: true, x: x, y: y,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      life: 1, decay: 0.008 + Math.random() * 0.014,
      size: (0.5 + Math.random() * 0.9) * size,
      color: BURST_COLORS[i % BURST_COLORS.length]
    });
  }
  if(!this.running){ this.running = true; requestAnimationFrame(this.frame); }
}
/* canvas-confetti "realistic" レシピ：パラメータの違う5発を重ね撃ち */
launchRealistic(): void {
  let cx = this.canvas.width / 2, cy = this.canvas.height * 0.42;
  this.burstAt(cx, cy, 26, 4.2, 3.2);
  this.burstAt(cx, cy, 42, 7.5, 4.2);
  this.burstAt(cx, cy, 30, 10.5, 2.6);
  this.burstAt(cx, cy, 18, 13, 5.2);
  this.burstAt(cx, cy, 55, 5.5, 3.6);
  this.launchConfetti();
}
/* fireworks：ランダム位置に打ち上げ花火 */
launchFirework(): void {
  let x = this.canvas.width * (0.12 + Math.random() * 0.76);
  let y = this.canvas.height * (0.14 + Math.random() * 0.3);
  this.burstAt(x, y, 34 + Math.floor(Math.random() * 22), 6.5, 3.4);
}
/* stars：重力なしで漂う星型スパークル */
launchStars(): void {
  for(let i = 0; i < 26; i++){
    this.parts.push({
      star: true,
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height * 0.75,
      vx: -0.3 + Math.random() * 0.6, vy: 0.15 + Math.random() * 0.45,
      rot: Math.random() * Math.PI, vr: -0.02 + Math.random() * 0.04,
      life: 1, decay: 0.006 + Math.random() * 0.008,
      size: 5 + Math.random() * 8, seed: Math.random() * 100,
      color: BURST_COLORS[i % BURST_COLORS.length]
    });
  }
  if(!this.running){ this.running = true; requestAnimationFrame(this.frame); }
}
/* side cannons：左右下端から 60° / 120° で打ち上げる */
launchSideCannon(side: string): void {
  let fromLeft = side === "left";
  let x0 = fromLeft ? 0 : this.canvas.width, y0 = this.canvas.height;
  let baseAng = fromLeft ? -Math.PI / 3 : -Math.PI * 2 / 3;
  for(let i = 0; i < 16; i++){
    let ang = baseAng + (Math.random() - 0.5) * 0.35, sp = 11 + Math.random() * 8;
    this.parts.push({
      x: x0, y: y0, w: 6 + Math.random() * 7, h: 8 + Math.random() * 9,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, grav: true,
      rot: Math.random() * Math.PI, vr: -0.12 + Math.random() * 0.24,
      color: BURST_COLORS[i % BURST_COLORS.length]
    });
  }
  if(!this.running){ this.running = true; requestAnimationFrame(this.frame); }
}
private frame = (): void => {
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  this.parts = this.parts.filter((p) => (p.spark || p.burst || p.star) ? (p.life ?? 0) > 0 : p.y < this.canvas.height + 30);
  for(let i = 0; i < this.parts.length; i++){
    let p = this.parts[i];
    if(p.burst){
      p.x += p.vx; p.y += p.vy; p.vy += 0.045; p.vx *= 0.985; p.vy *= 0.985; p.life = (p.life ?? 1) - (p.decay ?? 0.01);
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(p.life ?? 0, 0);
      this.ctx.shadowBlur = 16; this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size ?? 3, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.restore();
      continue;
    }
    if(p.star){
      p.x += p.vx + Math.sin((p.y + (p.seed ?? 0)) / 30) * 0.4;
      p.y += p.vy; p.life = (p.life ?? 1) - (p.decay ?? 0.01); p.rot = (p.rot ?? 0) + (p.vr ?? 0);
      let tw = 0.55 + 0.45 * Math.sin((p.seed ?? 0) + p.y / 18);
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(p.life ?? 0, 0) * tw;
      this.ctx.translate(p.x, p.y); this.ctx.rotate(p.rot ?? 0);
      this.ctx.shadowBlur = 12; this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      let s = p.size ?? 6;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -s); this.ctx.lineTo(s * 0.28, -s * 0.28); this.ctx.lineTo(s, 0); this.ctx.lineTo(s * 0.28, s * 0.28);
      this.ctx.lineTo(0, s); this.ctx.lineTo(-s * 0.28, s * 0.28); this.ctx.lineTo(-s, 0); this.ctx.lineTo(-s * 0.28, -s * 0.28);
      this.ctx.closePath(); this.ctx.fill();
      this.ctx.restore();
      continue;
    }
    if(p.spark){
      p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life = (p.life ?? 1) - (p.decay ?? 0.01);
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(p.life ?? 0, 0);
      this.ctx.shadowBlur = 14; this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size ?? 3, 0, Math.PI * 2); this.ctx.fill();
      this.ctx.restore();
      continue;
    }
    if(p.grav){ p.vy += 0.13; p.x += p.vx; p.y += p.vy; }
    else { p.x += p.vx + Math.sin(p.y / 40) * 0.8; p.y += p.vy; }
    p.rot = (p.rot ?? 0) + (p.vr ?? 0);
    this.ctx.save();
    this.ctx.translate(p.x, p.y); this.ctx.rotate(p.rot ?? 0);
    this.ctx.fillStyle = p.color;
    this.ctx.fillRect(-(p.w ?? 6) / 2, -(p.h ?? 8) / 2, p.w ?? 6, (p.h ?? 8) * Math.abs(Math.sin(p.y / 24)) + 1.5);
    this.ctx.restore();
  }
  if(this.parts.length){ requestAnimationFrame(this.frame); }
  else { this.running = false; this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
};
}
