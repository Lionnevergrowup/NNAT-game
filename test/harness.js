// A small harness that loads the real game in jsdom and lets us "play" it
// like a user (clicking buttons/options) to find UX/logic problems.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

function launch(opts = {}) {
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.com/",
  });
  const { window } = dom;
  const { document } = window;

  // --- stubs the game expects ---
  window.localStorage.clear();
  if (opts.localStorage) {
    Object.entries(opts.localStorage).forEach(([k, v]) => window.localStorage.setItem(k, v));
  }

  // speechSynthesis stub (records what was spoken)
  const spoken = [];
  window.speechSynthesis = {
    getVoices: () => [{ name: "Samantha", lang: "en-US" }],
    speak: (u) => {
      spoken.push(u.text);
      if (u.onstart) u.onstart();
      if (u.onend) setTimeout(u.onend, 0);
    },
    cancel: () => {},
    addEventListener: () => {},
  };
  window.SpeechSynthesisUtterance = function (t) {
    this.text = t;
  };

  // Web Audio stub
  const tones = [];
  function FakeAudio() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
    this.resume = () => {};
    this.createOscillator = () => ({
      type: "sine",
      frequency: { value: 0 },
      connect: () => ({ connect: () => {} }),
      start: () => {},
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
  window.AudioContext = FakeAudio;
  window.webkitAudioContext = FakeAudio;

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

  // capture the deck the game will use so the test knows the answers
  const decks = [];
  const _bq = window.NNAT.buildQuestions;
  window.NNAT.buildQuestions = function (o) {
    const d = _bq.call(this, o);
    decks.push(d);
    return d;
  };

  window.eval(gjs);

  return { dom, window, document, spoken, tones, decks };
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

module.exports = { launch, visibleScreen, click, byId };
