// A small harness that loads the real game in jsdom and lets us "play" it
// like a user (clicking buttons/options) to find UX/logic problems.
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function launch(opts = {}) {
  // capture any runtime errors (thrown in handlers, console.error, jsdomError)
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e && e.message ? e.message : e)));
  vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.com/",
    virtualConsole: vc,
  });
  const { window } = dom;
  const { document } = window;
  window.addEventListener("error", (e) => errors.push("window.error: " + (e.error && e.error.message)));

  // --- stubs the game expects ---
  window.localStorage.clear();
  if (opts.localStorage) {
    Object.entries(opts.localStorage).forEach(([k, v]) => window.localStorage.setItem(k, v));
  }

  // speechSynthesis stub — configurable and able to FAIL (the old always-OK stub
  // is why real-device silence never showed up in tests).
  const spoken = [];
  const utterances = [];
  const speechLog = []; // "cancel" | "resume" | "speak:<text>"
  const speechCfg = Object.assign(
    { voices: [{ name: "Samantha", lang: "en-US" }], autoStart: true, autoEnd: true, throwOnSpeak: false },
    opts.speech || {}
  );
  const synthState = { speaking: false, pending: false, paused: false, cancelCalls: 0, resumeCalls: 0 };
  window.speechSynthesis = {
    getVoices: () => speechCfg.voices,
    get speaking() {
      return synthState.speaking;
    },
    get pending() {
      return synthState.pending;
    },
    get paused() {
      return synthState.paused;
    },
    speak: (u) => {
      speechLog.push("speak:" + u.text);
      if (speechCfg.throwOnSpeak) throw new Error("speak failed");
      spoken.push(u.text);
      utterances.push(u);
      synthState.speaking = true;
      if (speechCfg.autoStart && u.onstart) u.onstart();
      if (speechCfg.autoEnd)
        setTimeout(() => {
          synthState.speaking = false;
          if (u.onend) u.onend();
        }, 0);
    },
    cancel: () => {
      speechLog.push("cancel");
      synthState.cancelCalls++;
      synthState.speaking = false;
      synthState.pending = false;
    },
    resume: () => {
      speechLog.push("resume");
      synthState.resumeCalls++;
      synthState.paused = false;
    },
    pause: () => {},
    addEventListener: () => {},
  };
  window.SpeechSynthesisUtterance = function (t) {
    this.text = t;
  };

  // Web Audio stub — records every context, can start suspended/interrupted,
  // reject or hang resume(), freeze its clock, and lack createBuffer.
  const tones = [];
  const audioCtxs = [];
  const audioCfg = Object.assign(
    { state: "running", resume: "ok", frozen: false, hasCreateBuffer: true },
    opts.audio || {}
  );
  function FakeAudio() {
    const self = this;
    const t0 = Date.now();
    audioCtxs.push(self);
    this.index = audioCtxs.length - 1;
    this.state = audioCfg.state;
    this.resumeCalls = 0;
    this.closed = false;
    this.oscStarts = 0;
    this.bufferStarts = 0;
    this._listeners = {};
    Object.defineProperty(this, "currentTime", { get: () => (audioCfg.frozen ? 0 : (Date.now() - t0) / 1000) });
    this.destination = {};
    this.addEventListener = (ev, fn) => {
      (self._listeners[ev] = self._listeners[ev] || []).push(fn);
    };
    this.setState = (st) => {
      self.state = st;
      (self._listeners.statechange || []).forEach((f) => f());
    };
    this.resume = () => {
      self.resumeCalls++;
      if (audioCfg.resume === "reject") return Promise.reject(new Error("InvalidStateError"));
      if (audioCfg.resume === "hang") return new Promise(() => {});
      return new Promise((res) => {
        self.state = "running";
        res();
      });
    };
    this.close = () => {
      self.closed = true;
      self.state = "closed";
      return Promise.resolve();
    };
    this.createBuffer = audioCfg.hasCreateBuffer ? () => ({}) : undefined;
    this.createBufferSource = audioCfg.hasCreateBuffer
      ? () => ({ connect() {}, start() { self.bufferStarts++; } })
      : undefined;
    this.createOscillator = () => ({
      type: "sine",
      frequency: { value: 0 },
      connect: () => ({ connect: () => {} }),
      start: () => {
        self.oscStarts++;
        tones.push({ ctx: self.index });
      },
      stop: () => {},
    });
    this.createGain = () => ({
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      connect: () => ({ connect: () => {} }),
    });
  }
  const audioEls = [];
  window.Audio = function (src) {
    this.src = src;
    this.play = () => {
      audioEls.push(src);
      return Promise.resolve();
    };
  };
  if (opts.standalone) Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
  window.AudioContext = FakeAudio;
  window.webkitAudioContext = FakeAudio;
  if (opts.audioSession)
    Object.defineProperty(window.navigator, "audioSession", { value: opts.audioSession, configurable: true, writable: true });

  // rAF + getBoundingClientRect (jsdom returns zeros; give plausible boxes)
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.confirm = () => true;
  window.Element.prototype.getBoundingClientRect = function () {
    // crude: give the stimulus/options non-zero boxes so animateFill runs
    return { left: 10, top: 10, width: 200, height: 200, right: 210, bottom: 210 };
  };

  // run the scripts in order
  const qjs = fs.readFileSync(path.join(ROOT, "questions.js"), "utf8");
  const gjs = fs.readFileSync(path.join(ROOT, "game.js"), "utf8");
  window.eval(qjs);
  if (opts.clips) window.eval(fs.readFileSync(path.join(ROOT, "speech", "clips.js"), "utf8"));

  // capture the deck the game will use so the test knows the answers
  const decks = [];
  const _bq = window.NNAT.buildQuestions;
  window.NNAT.buildQuestions = function (o) {
    const d = _bq.call(this, o);
    decks.push(d);
    return d;
  };

  // capture the live current question (survives adaptive queue mutations)
  const live = { q: null, i: -1, total: 0 };
  window.__onRender = (q, i, total) => {
    live.q = q;
    live.i = i;
    live.total = total;
  };

  window.eval(gjs);

  return { dom, window, document, spoken, tones, decks, live, errors, audioCtxs, audioEls, audioCfg, speechCfg, speechLog, utterances, synthState };
}

// helpers --------------------------------------------------------------
function visibleScreen(document) {
  const screens = ["start-screen", "quiz-screen", "result-screen", "settings-screen", "progress-screen", "lock-screen"];
  return screens.find((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
}
function click(window, el) {
  if (!el) throw new Error("click: element not found");
  el.dispatchEvent(new window.Event("click", { bubbles: true }));
}
function byId(document, id) {
  return document.getElementById(id);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Answer the current question, handling the two-attempt retry flow:
//  - "correct": pick the answer (resolves on first try)
//  - "wrong":   pick wrong, then a different wrong (reveals the answer)
//  - "mixed":   pick i%n; if wrong, get it right on the retry
// Returns { firstCorrect } so callers can tally score (only first tries count).
async function answerOne(env, strategy, i) {
  const d = env.document;
  const w = env.window;
  const opts = () => d.getElementById("options").children;
  const ans = env.live.q.answer;
  const n = opts().length;
  const firstIdx = strategy === "correct" ? ans : strategy === "wrong" ? (ans + 1) % n : i % n;
  const firstCorrect = firstIdx === ans;
  click(w, opts()[firstIdx]);
  if (!firstCorrect) {
    await sleep(20);
    let second = strategy === "wrong" ? (ans + 2) % n : ans;
    if (second === firstIdx) second = (firstIdx + 1) % n;
    click(w, opts()[second]);
  }
  await sleep(700); // let animateFill resolve
  return { firstCorrect };
}

module.exports = { launch, visibleScreen, click, byId, sleep, answerOne };
