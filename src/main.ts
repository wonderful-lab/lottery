/**
 * lottery メインロジック（スペース版最新仕様の移植）。
 * 候補入力 → スロット回転 → 減速 → スーパーリーチ（扉の先行クローズ）→ 確定演出。
 * 演出は5段階レベル（1静か〜5 MAX）で音量・光・振動まで連動する。
 */
import { Confetti } from "./confetti.js";
import { parseCandidates } from "./parse.js";
import { randomIndex } from "./random.js";
import { SoundEngine } from "./sound.js";

/* ================= 状態 ================= */
interface State {
  pool: string[];
  winner: string | null;
  winnerIndex: number;
  runnerUp: string | null;
  phase: string;
  level: number;
  history: string[];
  timers: number[];
  autoStopTimer: number | null;
}

const state: State = {
  pool: [],          // 現在の候補（重複はそのまま＝くじの枚数）
  winner: null,
  winnerIndex: -1,
  runnerUp: null,    // リーチ演出用の対抗候補
  phase: "idle",     // idle | spinning | decel | reach | done
  level: 5,          // 演出レベル 1(静か)〜5(MAX)：音量と演出の強さをまとめて制御
  history: [],       // このセッションの当選履歴
  timers: [],
  autoStopTimer: null
};
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const LEVEL_NAMES = ["", "静か", "控えめ", "標準", "派手", "MAX"];
function fxOn(){ return state.level >= 3 && !reducedMotion; }   // 紙吹雪・光線などの中〜強演出
function fxHard(){ return state.level >= 4 && !reducedMotion; } // 振動・点滅・フラッシュなどの強演出

/* ================= 要素 ================= */
function $(id: string): HTMLElement { return document.getElementById(id) as HTMLElement; }
const viewSetup = $("view-setup"), viewSlot = $("view-slot");
let textarea = $("candidates") as unknown as HTMLTextAreaElement, chipsEl = $("chips"), countEl = $("cand-count");
let btnDraw = $("btn-draw") as unknown as HTMLButtonElement, setupError = $("setup-error");
const cabinet = $("cabinet"), statusLine = $("status-line"), reelName = $("reel-name");
let btnStop = $("btn-stop") as unknown as HTMLButtonElement, stopZone = $("stop-zone"), resultZone = $("result-zone");
let winSub = $("win-sub"), marqueeTitle = $("marquee-title");
let flashEl = $("flash"), raysEl = $("rays"), strobeEl = $("strobe");
let bannerEl = $("reach-banner"), rbMain = $("rb-main"), rbSub = $("rb-sub");
let lasersEl = $("lasers"), doorsEl = $("doors");
let stripLeft = $("strip-left"), stripRight = $("strip-right");
let doorsPreClosed = false; // リーチ終盤に先行して扉を閉めたかどうか
const sfx = new SoundEngine();
const confetti = new Confetti($("confetti") as unknown as HTMLCanvasElement);
/* ================= 電球マーキー ================= */
let bulbEls: HTMLElement[] = [];
(function buildBulbs(){
  ["bulbs-left", "bulbs-right"].forEach(function(id){
    let wrap = $(id); if(!wrap) return;
    let n = 9;
    for(let i = 0; i < n; i++){
      let b = document.createElement("span");
      b.className = "bulb";
      wrap.appendChild(b);
      bulbEls.push(b);
    }
  });
})();
let bulbTimer: number | null = null, bulbStep = 0;
function startBulbs(speed: number){
  stopBulbs();
  let classes = ["on-a", "on-b", "on-c"];
  bulbTimer = setInterval(function(){
    bulbStep++;
    for(let i = 0; i < bulbEls.length; i++){
      bulbEls[i].className = "bulb" + (((i + bulbStep) % 3 === 0) ? " " + classes[(bulbStep + i) % 3] : "");
    }
  }, speed);
}
function stopBulbs(){ if(bulbTimer){ clearInterval(bulbTimer); bulbTimer = null; } }
function bulbsAllOn(){
  stopBulbs();
  for(let i = 0; i < bulbEls.length; i++) bulbEls[i].className = "bulb " + ["on-a","on-b","on-c"][i % 3];
}
function bulbsOff(){
  stopBulbs();
  for(let i = 0; i < bulbEls.length; i++) bulbEls[i].className = "bulb";
}

function refreshSetup(){
  let list = parseCandidates(textarea.value);
  countEl.textContent = list.length + " 名";
  btnDraw.disabled = list.length < 2;
  chipsEl.innerHTML = "";
  if(!list.length){
    let empty = document.createElement("span");
    empty.className = "chips-empty";
    empty.textContent = "まだ候補がありません";
    chipsEl.appendChild(empty);
  } else {
    list.forEach(function(name){
      let c = document.createElement("span");
      c.className = "chip";
      c.textContent = name;
      chipsEl.appendChild(c);
    });
  }
  if(list.length >= 2) setupError.textContent = "";
  return list;
}
textarea.addEventListener("input", refreshSetup);

$("btn-sample").addEventListener("click", function(){
  textarea.value = "田中太郎, 佐藤花子, 鈴木一郎, 高橋健, 伊藤美咲, 渡辺翔, 山本愛, 中村大輔";
  refreshSetup(); sfx.click();
});
$("btn-clear").addEventListener("click", function(){
  textarea.value = ""; refreshSetup(); textarea.focus();
  state.history = []; renderHistory(); // 当選履歴も一緒にクリア
  sfx.click();
});

/* ================= 演出レベル（5段階・両画面で同期） ================= */
function syncLevelUI(){
  let steps = document.querySelectorAll(".fx-step");
  for(let i = 0; i < steps.length; i++){
    let lv = parseInt(steps[i].getAttribute("data-level") ?? "0", 10);
    steps[i].setAttribute("aria-pressed", lv === state.level ? "true" : "false");
  }
  let names = document.querySelectorAll("[data-fx-name]");
  for(let j = 0; j < names.length; j++) names[j].textContent = LEVEL_NAMES[state.level];
}
function setLevel(lv: number){
  state.level = lv;
  sfx.level = lv;
  confetti.level = lv;
  syncLevelUI();
  if(state.level < 4){ cabinet.classList.remove("shake"); cabinet.classList.remove("shake-hard"); document.body.classList.remove("fever"); strobeEl.classList.remove("on"); lasersEl.classList.remove("on", "fast"); stopContinuousFx(); hideStrips(); }
  if(state.level < 3){ raysEl.classList.remove("show"); cabinet.classList.remove("super"); cabinet.classList.remove("decel"); hideBanner(); stopMascot(); }
  sfx.click(); // レベル2以上ならクリック音で音量感を確認できる
}
let allSteps = document.querySelectorAll(".fx-step");
for(let s = 0; s < allSteps.length; s++){
  const stepEl = allSteps[s] as HTMLElement;
  stepEl.addEventListener("click", function(){
    setLevel(parseInt(stepEl.getAttribute("data-level") ?? "0", 10));
  });
}
syncLevelUI();

/* ================= タイマー管理 ================= */
function later(fn: () => void, ms: number){
  let id = setTimeout(fn, ms);
  state.timers.push(id);
  return id;
}
function clearTimers(){
  state.timers.forEach(clearTimeout);
  state.timers = [];
  if(state.autoStopTimer){ clearTimeout(state.autoStopTimer); state.autoStopTimer = null; }
}

/* ================= リール表示 ================= */
function showName(name: string, blur?: boolean){
  reelName.textContent = name;
  reelName.classList.toggle("blur", !!blur && fxOn());
  reelName.classList.toggle("long", name.length > 10);
  reelName.classList.remove("winner");
}
function setStatus(text: string, cls?: string){
  statusLine.textContent = text;
  statusLine.className = "status-line" + (cls ? " " + cls : "");
}

/* ================= スーパーリーチ・バナー ================= */
let REACH_WORDS = ["FEVER!", "RUSH!", "HOLD ON!", "ALMOST!", "FEVER MAX!", "JACKPOT!?"];
function showBanner(main: string, sub?: string, isWin?: boolean){
  rbMain.textContent = main;
  rbMain.classList.toggle("win", !!isWin);
  rbSub.textContent = sub || "";
  rbSub.style.visibility = sub ? "visible" : "hidden";
  bannerEl.hidden = false;
  rbMain.style.animation = "none";
  void rbMain.offsetWidth; // ポップアニメーションを再発火
  rbMain.style.animation = "";
}
function setBannerSub(text: string){
  rbSub.textContent = text;
  rbSub.style.visibility = "visible";
  rbSub.classList.remove("pop");
  void rbSub.offsetWidth;
  rbSub.classList.add("pop");
}
function hideBanner(){ bannerEl.hidden = true; }

/* ================= 連続演出・期待度ヒート・リング・スクランブル ================= */
let fxInterval: number | null = null;
function startContinuousFx(mode: string){
  stopContinuousFx();
  if(state.level < 4 || reducedMotion) return;
  let tick = 0;
  let every = mode === "spin" ? 430 : 250;
  fxInterval = setInterval(function(){
    tick++;
    confetti.launchSideCannon(tick % 2 ? "left" : "right");
    if(state.level >= 5 && tick % 3 === 0) confetti.launchFirework();
    if(mode !== "spin" && tick % 4 === 0) confetti.launchStars();
  }, every);
}
function stopContinuousFx(){ if(fxInterval){ clearInterval(fxInterval); fxInterval = null; } }
function setHeat(n: number){ cabinet.setAttribute("data-heat", String(n)); }
function spawnGlowRings(){
  let colors = ["#ffd34d", "#ff2e4d", "#2ee6ff", "#ff3df0"];
  for(let i = 0; i < 4; i++){
    (function(k){
      later(function(){
        let ring = document.createElement("div");
        ring.className = "glow-ring";
        ring.style.border = "6px solid " + colors[k % colors.length];
        ring.style.boxShadow = "0 0 34px " + colors[k % colors.length] + ", inset 0 0 34px " + colors[k % colors.length];
        document.body.appendChild(ring);
        setTimeout(function(){ ring.remove(); }, 1300);
      }, k * 160);
    })(i);
  }
}
let SCRAMBLE_CHARS = "★☆#%@!?アイウエオカキクケコサシスセソタチツテト0123456789";
function scrambleReveal(name: string){
  let step = 0, total = 16;
  reelName.classList.remove("winner");
  reelName.classList.toggle("long", name.length > 10);
  (function frame(){
    if(state.phase !== "done") return;
    step++;
    let doneCount = Math.floor(name.length * (step / total));
    let out = "";
    for(let i = 0; i < name.length; i++){
      out += i < doneCount ? name[i] : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }
    reelName.textContent = out;
    if(step < total){ later(frame, 45); return; }
    reelName.innerHTML = "";
    for(let j = 0; j < name.length; j++){
      let sp = document.createElement("span");
      sp.className = "ch";
      sp.textContent = name[j];
      sp.style.animationDelay = (j * 75) + "ms";
      reelName.appendChild(sp);
    }
    reelName.classList.add("winner");
  })();
}
/* ================= 扉・スライドイン帯・マスコット ================= */
function closeDoors(){
  doorsEl.classList.add("active");
  doorsEl.classList.remove("opening", "hold");
  void doorsEl.offsetWidth; // トランジションを確実に発火
  doorsEl.classList.add("closed");
}
function openDoors(){
  doorsEl.classList.add("opening");
  doorsEl.classList.remove("closed", "hold");
  later(function(){ doorsEl.classList.remove("active", "opening"); doorsPreClosed = false; }, 950);
}
function resetDoors(){ doorsEl.classList.remove("active", "closed", "hold", "opening"); doorsPreClosed = false; }
function showStrips(){ stripLeft.classList.add("show"); stripRight.classList.add("show"); }
function hideStrips(){ stripLeft.classList.remove("show"); stripRight.classList.remove("show"); }

/* 星マスコット軍団：サイズ・色・速度の違う5体をJSで生成する */
let MASCOT_CONF = [
  { size: 132, hue: 0, speed: 1 },
  { size: 96, hue: -55, speed: 1.28 },
  { size: 80, hue: 165, speed: 1.5 },
  { size: 108, hue: 95, speed: 1.12 },
  { size: 68, hue: 255, speed: 1.65 }
];
let mascotUnits: MascotUnit[] = [];
let mascotRunning = false, mascotMode = "run", mascotLastTs = 0, mascotT = 0, mascotTrailAcc = 0;
function mascotSvg(i: number){
  return '<svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">'
    + '<defs><linearGradient id="sg' + i + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0" stop-color="#ffe97a" /><stop offset="1" stop-color="#ff9d00" /></linearGradient></defs>'
    + '<path d="M60 6 L74 42 L112 44 L83 68 L92 106 L60 85 L28 106 L37 68 L8 44 L46 42 Z" fill="url(#sg' + i + ')" stroke="#c47f00" stroke-width="3" stroke-linejoin="round" />'
    + '<circle cx="48" cy="58" r="5" fill="#3a1c00" /><circle cx="72" cy="58" r="5" fill="#3a1c00" />'
    + '<circle cx="49.5" cy="56" r="1.8" fill="#ffffff" /><circle cx="73.5" cy="56" r="1.8" fill="#ffffff" />'
    + '<path d="M50 70 Q60 81 70 70" stroke="#3a1c00" stroke-width="3.5" fill="none" stroke-linecap="round" />'
    + '<circle cx="37" cy="68" r="5" fill="#ff8fa3" opacity=".85" /><circle cx="83" cy="68" r="5" fill="#ff8fa3" opacity=".85" />'
    + '</svg>';
}
interface MascotCfg { size: number; hue: number; speed: number }
interface MascotUnit { el: HTMLElement; cfg: MascotCfg; x: number; y: number; dir: number; phase: number; lane: number }
function buildMascots(){
  if(mascotUnits.length) return;
  MASCOT_CONF.forEach(function(cfg, i){
    let el = document.createElement("div");
    el.className = "mascot-unit";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.style.width = cfg.size + "px";
    el.style.height = cfg.size + "px";
    if(cfg.hue) el.style.filter = "hue-rotate(" + cfg.hue + "deg)";
    let inner = document.createElement("div");
    inner.className = "mascot-inner";
    inner.style.animationDelay = (i * 0.08) + "s";
    inner.innerHTML = mascotSvg(i);
    el.appendChild(inner);
    document.body.appendChild(el);
    mascotUnits.push({ el: el, cfg: cfg, x: 0, y: 0, dir: i % 2 ? -1 : 1, phase: i * 1.37, lane: (i % 3) * 18 });
  });
}
function mascotAllowed(){ return state.level >= 3 && !reducedMotion; }
function startMascot(mode: string){
  if(!mascotAllowed()){ stopMascot(); return; }
  buildMascots();
  mascotMode = mode;
  let W = window.innerWidth;
  mascotUnits.forEach(function(u, i){
    u.el.classList.toggle("celebrate", mode === "celebrate");
    u.el.hidden = false;
    if(!mascotRunning && mode !== "celebrate") u.x = (W / mascotUnits.length) * i; // 横一列に散らして登場
  });
  if(!mascotRunning){
    mascotRunning = true;
    mascotLastTs = 0;
    requestAnimationFrame(mascotFrame);
  }
}
function stopMascot(){
  mascotRunning = false;
  mascotUnits.forEach(function(u){ u.el.hidden = true; });
}
function mascotFrame(ts: number){
  if(!mascotRunning) return;
  if(!mascotLastTs) mascotLastTs = ts;
  let dt = Math.min(0.05, (ts - mascotLastTs) / 1000);
  mascotLastTs = ts;
  mascotT += dt;
  let W = window.innerWidth, H = window.innerHeight;
  mascotUnits.forEach(function(u, i){
    let w = u.cfg.size;
    let x, y;
    if(mascotMode === "celebrate"){
      // 中央下に横一列で整列して順番にジャンプ
      x = W / 2 + (i - (mascotUnits.length - 1) / 2) * (w * 0.94) - w / 2;
      y = H - w - 18;
    } else {
      let speed = (mascotMode === "fly" ? 640 : mascotMode === "dash" ? 540 : 330) * u.cfg.speed;
      if(state.level >= 5) speed *= 1.25;
      u.x += speed * u.dir * dt;
      if(u.dir > 0 && u.x > W + 40) u.dir = -1;
      if(u.dir < 0 && u.x < -w - 40) u.dir = 1;
      x = u.x;
      if(mascotMode === "fly"){
        y = H * 0.30 + Math.sin(mascotT * 3.1 + u.phase) * H * 0.17;
      } else {
        y = H - w - 10 - u.lane;
      }
    }
    u.y = y;
    u.el.style.transform = "translate(" + x + "px," + y + "px) scaleX(" + (mascotMode === "celebrate" ? 1 : u.dir) + ")";
  });
  // 飛行中は先頭の星が軌跡に火花を残す
  if(mascotMode === "fly" && state.level >= 4 && mascotUnits.length){
    mascotTrailAcc += dt;
    if(mascotTrailAcc > 0.07){
      mascotTrailAcc = 0;
      let lead = mascotUnits[0];
      confetti.addSpark(lead.x + lead.cfg.size / 2, lead.y + lead.cfg.size / 2);
    }
  }
  requestAnimationFrame(mascotFrame);
}

/* プレミア：扉が閉まって震え、光を漏らしながら開いて確定を見せる。
   扉はリーチ終盤（リールがまだフリップ中）に先行して閉め始めるので、
   ここに来た時点で閉まっている場合はタメの時間だけ短縮する */
function finishReach(){
  if(!fxOn()){ revealWinner(); return; }
  state.phase = "doors";
  stopContinuousFx();
  hideBanner();
  hideStrips();
  stopMascot();
  cabinet.classList.add("freeze");
  let alreadyClosed = doorsPreClosed && doorsEl.classList.contains("closed");
  if(!alreadyClosed){
    closeDoors();
    sfx.tone(75, .35, "sine", .5, 0);       // 扉が閉まる重低音
    sfx.noiseBurst(.3, .18, 0);
    if(navigator.vibrate && state.level >= 4) navigator.vibrate([130, 40, 130]);
  }
  later(function(){ doorsEl.classList.add("hold"); }, alreadyClosed ? 120 : 570); // 閉まった扉が光を漏らして震える
  later(function(){ setupWinnerDisplay(); }, alreadyClosed ? 220 : 640);          // 扉の裏で当選表示をセット
  later(function(){
    cabinet.classList.remove("freeze");
    openDoors();
    sfx.noiseBurst(.4, .14, 0);
    celebrateWinner();
  }, alreadyClosed ? 820 : 1250);
}

/* ================= 抽選フロー ================= */
function startDraw(pool: string[]){
  state.pool = pool.slice();
  state.winnerIndex = randomIndex(state.pool.length);
  state.winner = state.pool[state.winnerIndex];
  // リーチ用の対抗候補（当選者以外から1つ）
  let others = state.pool.filter(function(_, i){ return i !== state.winnerIndex; });
  state.runnerUp = others.length ? others[randomIndex(others.length)] : state.winner;

  viewSetup.hidden = true;
  viewSlot.hidden = false;
  resultZone.hidden = true;
  stopZone.hidden = false;
  hideBanner();
  strobeEl.classList.remove("on");
  cabinet.classList.remove("decel", "super", "shake", "shake-hard");
  resetDoors();
  hideStrips();
  btnStop.disabled = false;
  marqueeTitle.textContent = "★ LUCKY SLOT ★";
  setStatus("回転中…！");
  window.scrollTo({ top: 0, behavior: "smooth" });

  sfx.unlock(); // ユーザー操作の流れで AudioContext を起こす
  sfx.coin();
  startBulbs([0, 300, 220, 150, 100, 90][state.level]); // レベルが高いほど速く点滅
  setHeat(1); // 期待度カラー：青からスタート
  reelName.classList.toggle("glitch", state.level >= 5 && !reducedMotion);
  if(state.level >= 5 && fxOn()) lasersEl.classList.add("on");
  startContinuousFx("spin"); // 回転中からサイドキャノン＆花火を打ち続ける
  startMascot("run"); // 星キャラが画面下を走り回る
  spinLoop(42);
  state.autoStopTimer = setTimeout(function(){ if(state.phase === "spinning") beginDecel(); }, 6000);
}

function spinLoop(interval: number){
  state.phase = "spinning";
  let idx = randomIndex(state.pool.length);
  showName(state.pool[idx], true);
  sfx.tick(idx % 2 === 0);
  later(function(){ if(state.phase === "spinning") spinLoop(interval); }, interval);
}

function beginDecel(){
  if(state.phase !== "spinning") return;
  state.phase = "decel";
  if(state.autoStopTimer){ clearTimeout(state.autoStopTimer); state.autoStopTimer = null; }
  btnStop.disabled = true;
  startMascot("dash"); // 減速で星キャラもダッシュ
  setStatus("おっ、止まるか…！？", fxOn() ? "decel" : "");
  if(fxOn()){
    cabinet.classList.add("decel");
    startBulbs(60);
  }
  let steps = 16, step = 0;
  (function decelStep(){
    if(state.phase !== "decel") return;
    step++;
    let idx = randomIndex(state.pool.length);
    showName(state.pool[idx], step < steps - 3);
    sfx.decelTick(step, steps);
    if(step === 5) setHeat(2);            // 緑へ昇格
    if(step === steps - 5) setHeat(3);    // 赤へ昇格
    // 終盤はストロボと火花で「来るか…！？」の緊張感を上げる
    if(step === steps - 4 && fxHard()) strobeEl.classList.add("on");
    if(step === steps - 2 && fxOn()) confetti.launchSparks();
    if(step >= steps){ beginReach(); return; }
    let delay = 55 + Math.pow(step / steps, 2.1) * 330;
    later(decelStep, delay);
  })();
}

function beginReach(){
  state.phase = "reach";
  cabinet.classList.remove("decel");
  setStatus("SUPER REACH!!", "reach");
  marqueeTitle.textContent = "★ SUPER REACH ★";
  setHeat(4); // 金＝激熱へ昇格
  startContinuousFx("reach"); // キャノン連射を加速
  if(fxHard()){
    lasersEl.classList.add("on", "fast");
    reelName.classList.add("glitch");
  }
  if(fxOn()){
    cabinet.classList.add("super");
    raysEl.classList.add("show");
    showBanner("SUPER REACH", REACH_WORDS[0]);
    confetti.launchSparks();
  }
  if(fxHard()){
    cabinet.classList.add(state.level >= 5 ? "shake-hard" : "shake");
    if(navigator.vibrate) navigator.vibrate([70, 40, 70, 40, 160]);
    document.body.classList.add("fever");
    strobeEl.classList.add("on");
    startBulbs(45);
  } else if(fxOn()){
    startBulbs(80);
  }
  if(fxOn()){ showStrips(); startMascot("fly"); } // 帯がスライドイン＆星キャラが飛び回る
  sfx.siren();
  let flips = 0, totalFlips = [0, 4, 6, 10, 14, 14][state.level]; // レベルでリーチの長さも変わる
  let wordIdx = 0;
  (function flip(){
    if(state.phase !== "reach") return;
    flips++;
    let isWinnerSide = flips % 2 === 0;
    showName(isWinnerSide ? (state.winner ?? "") : (state.runnerUp ?? ""), false);
    if(flips % 4 === 0) sfx.heartbeat(); else sfx.tick(flips % 2 === 0);
    if(flips % 4 === 0 && fxHard() && navigator.vibrate) navigator.vibrate(45); // 鼓動に合わせて端末も震える
    if(fxOn()){
      if(flips % 2 === 0 && flips < totalFlips){ // 煽り文句を切り替え続ける
        wordIdx = (wordIdx + 1) % REACH_WORDS.length;
        setBannerSub(REACH_WORDS[wordIdx]);
      }
      if(flips % 4 === 2) confetti.launchSparks();       // 火花バースト
      if(flips % 5 === 0) sfx.siren();          // サイレンを重ねる
    }
    if(flips === totalFlips - 3) setHeat(5); // 終盤でレインボー（確定級）へ
    // 扉はリールがまだフリップしている間に先行して閉め始める（閉まり際の隙間から確定者が見えないように）
    if(flips === totalFlips - 4 && fxOn() && !doorsPreClosed){
      doorsPreClosed = true;
      closeDoors();
      sfx.tone(75, .35, "sine", .5, 0);
      sfx.noiseBurst(.3, .18, 0);
      if(navigator.vibrate && state.level >= 4) navigator.vibrate([130, 40, 130]);
    }
    if(flips >= totalFlips){ finishReach(); return; }
    // 最後の2フリップだけ間を空けて「タメ」を作る
    let delay = fxOn() ? (flips >= totalFlips - 2 ? 360 : 130) : 200;
    later(flip, delay);
  })();
}

/* 当選表示のセット（扉の裏でも呼べるよう演出と分離） */
function setupWinnerDisplay(){
  state.phase = "done";
  cabinet.classList.remove("shake");
  cabinet.classList.remove("shake-hard");
  cabinet.classList.remove("decel");
  cabinet.classList.remove("super");
  document.body.classList.remove("fever");
  strobeEl.classList.remove("on");
  hideStrips();
  lasersEl.classList.remove("fast");
  reelName.classList.remove("glitch");
  marqueeTitle.textContent = "★ JACKPOT ★";
  setStatus("当選者決定！！", "win");
  if(fxOn()) scrambleReveal(state.winner ?? "");
  else { showName(state.winner ?? "", false); reelName.classList.add("winner"); }
  bulbsAllOn();

  state.history.push(state.winner ?? "");
  winSub.innerHTML = "";
  let strong = document.createElement("strong");
  strong.textContent = state.winner ?? "";
  winSub.appendChild(document.createTextNode("候補 " + state.pool.length + " 名の中から、"));
  winSub.appendChild(strong);
  winSub.appendChild(document.createTextNode(" さんが選ばれました"));

  stopZone.hidden = true;
  resultZone.hidden = false;
  ($("btn-exclude") as unknown as HTMLButtonElement).disabled = state.pool.filter(function(n){ return n !== state.winner; }).length < 1;
}

/* 確定のお祝い演出（フラッシュ・紙吹雪・バナー・マスコット） */
function celebrateWinner(){
  if(fxHard()){
    flashEl.classList.remove("go");
    void flashEl.offsetWidth; // アニメーション再発火
    flashEl.classList.add("go");
  }
  if(fxOn()){
    raysEl.classList.add("show");
    confetti.launchRealistic();   // パラメータ違い5発の重ね撃ち
    confetti.launchStars();       // 星型スパークル
    spawnGlowRings();    // 同心円グロー・リング拡散
    if(state.level >= 5){
      // アナウンサー文字が段階エスカレート
      showBanner("WINNER！", state.winner ?? "", true);
      later(function(){ showBanner("BIG WIN！！", state.winner ?? "", true); }, 400);
      later(function(){ showBanner("MEGA WIN！！", state.winner ?? "", true); }, 820);
      later(function(){ showBanner("★ JACKPOT ★", state.winner ?? "", true); }, 1260);
      later(hideBanner, 2600);
      later(() => confetti.launchRealistic(), 500); // 追い打ちの5連
      startContinuousFx("win");    // 祝砲キャノンをしばらく連射
      later(stopContinuousFx, 1700);
    } else {
      showBanner("BIG WIN!!", state.winner ?? "", true);
      later(hideBanner, 1500);
    }
    startMascot("celebrate"); // 星キャラが中央でジャンプしてお祝い
    later(function(){ if(state.phase === "done") stopMascot(); }, 3200);
  } else {
    hideBanner();
  }
  sfx.fanfare();
  if(navigator.vibrate && state.level >= 4) navigator.vibrate([100, 50, 100, 50, 100, 50, 320]);
}

function revealWinner(){
  clearTimers();
  stopContinuousFx();
  setupWinnerDisplay();
  celebrateWinner();
}

btnStop.addEventListener("click", function(){
  if(state.phase === "spinning"){ sfx.click(); beginDecel(); }
});

btnDraw.addEventListener("click", function(){
  let list = refreshSetup();
  if(list.length < 2){
    setupError.textContent = "抽選には候補が2名以上必要です。カンマ区切りで追加してください。";
    return;
  }
  setupError.textContent = "";
  startDraw(list);
});

/* ================= 結果画面の操作 ================= */
function cleanupSlotFx(){
  clearTimers();
  stopContinuousFx();
  stopBulbs(); bulbsOff();
  cabinet.classList.remove("shake");
  cabinet.classList.remove("shake-hard");
  cabinet.classList.remove("decel");
  cabinet.classList.remove("super");
  cabinet.classList.remove("freeze");
  cabinet.removeAttribute("data-heat");
  document.body.classList.remove("fever");
  raysEl.classList.remove("show");
  strobeEl.classList.remove("on");
  lasersEl.classList.remove("on", "fast");
  resetDoors();
  hideStrips();
  stopMascot();
  reelName.classList.remove("glitch");
  hideBanner();
  state.phase = "idle";
}
$("btn-again").addEventListener("click", function(){
  cleanupSlotFx();
  startDraw(state.pool);
});
$("btn-exclude").addEventListener("click", function(){
  let rest = state.pool.filter(function(n){ return n !== state.winner; });
  if(rest.length < 1) return;
  cleanupSlotFx();
  startDraw(rest);
});
$("btn-back").addEventListener("click", function(){
  cleanupSlotFx();
  viewSlot.hidden = true;
  viewSetup.hidden = false;
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("btn-copy").addEventListener("click", function(){
  let btn = $("btn-copy");
  let text = "抽選結果：当選者は「" + state.winner + "」さんです（候補 " + state.pool.length + " 名）";
  function done(){
    btn.textContent = "コピーしました！";
    setTimeout(function(){ btn.textContent = "結果をコピー"; }, 1800);
  }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done, done);
  } else { done(); }
});

function renderHistory(){
  let box = $("history-box"), list = $("history-list");
  if(!state.history.length){ box.hidden = true; return; }
  box.hidden = false;
  list.innerHTML = "";
  state.history.forEach(function(name, i){
    let item = document.createElement("span");
    item.className = "history-item";
    let n = document.createElement("span");
    n.className = "n";
    n.textContent = (i + 1) + "回目";
    item.appendChild(n);
    item.appendChild(document.createTextNode(name));
    list.appendChild(item);
  });
}

refreshSetup();

    