/* =====================================================================
   NNAT3 Level A — game flow
   Screen switching, one-question-at-a-time rendering, scoring, feedback,
   streaks, sound effects, a separate Settings page, and results.
   ===================================================================== */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Version = the ?v= on the game.js URL that was ACTUALLY loaded (so a stale
  // cached script shows up as an old number).
  const APP_VERSION = (() => {
    try {
      const m = ((document.currentScript && document.currentScript.src) || "").match(/[?&]v=([\w.-]+)/);
      return m ? m[1] : "dev";
    } catch (_) {
      return "dev";
    }
  })();
  const verEl = document.getElementById("app-version");
  if (verEl) verEl.textContent = "v" + APP_VERSION;

  // Screens
  const startScreen = $("start-screen");
  const quizScreen = $("quiz-screen");
  const resultScreen = $("result-screen");
  const settingsScreen = $("settings-screen");
  const progressScreen = $("progress-screen");
  const lockScreen = $("lock-screen");

  const ALL_TYPES = [
    "Pattern Completion",
    "Reasoning by Analogy",
    "Serial Reasoning",
    "Spatial Visualization",
  ];

  // Quiz elements
  const promptEl = $("prompt");
  const stimulusEl = $("stimulus");
  const optionsEl = $("options");
  const feedbackEl = $("feedback");
  const feedbackEmoji = $("feedback-emoji");
  const feedbackText = $("feedback-text");
  const nextBtn = $("next-btn");
  const progressFill = $("progress-fill");
  const qCurrent = $("q-current");
  const qTotal = $("q-total");
  const scoreEl = $("score");
  const streakChip = $("streak-chip");
  const streakEl = $("streak");
  const listenBtn = $("listen-btn");

  // State
  let questions = [];
  let index = 0;
  let score = 0;
  let locked = false;
  let retrying = false; // true after a first wrong answer, while a retry is allowed
  let streak = 0;
  let bestStreak = 0;

  // ---- Settings (persisted) -------------------------------------------
  const DEFAULTS = {
    count: 24,
    level: "A",
    types: ["pattern", "analogy"],
    voice: true,
    speed: "normal",
    sfx: true,
    loud: true, // claim the iOS "playback" audio session so sound ignores the mute switch
    fx: true,
  };
  const levelTypes = (l) => (window.NNAT && NNAT.levelTypes ? NNAT.levelTypes(l) : ["pattern", "analogy"]);

  let settings = loadSettings();

  function sanitizeTypes(s) {
    const avail = levelTypes(s.level);
    let t = (Array.isArray(s.types) ? s.types : []).filter((x) => avail.indexOf(x) !== -1);
    if (!t.length) t = avail.slice();
    s.types = t;
    return s;
  }
  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("nnat-settings")) || {};
      const s = Object.assign({}, DEFAULTS, saved);
      if (!levelTypes(s.level).length) s.level = "A";
      sanitizeTypes(s);
      // one-time forced reset: everyone starts at 24 questions, then may change it
      if (!s.forced24) {
        s.count = 24;
        s.forced24 = true;
        try {
          localStorage.setItem("nnat-settings", JSON.stringify(s));
        } catch (e) {}
      }
      return s;
    } catch (e) {
      return sanitizeTypes(Object.assign({}, DEFAULTS, { types: DEFAULTS.types.slice() }));
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem("nnat-settings", JSON.stringify(settings));
    } catch (e) {}
  }
  const RATE = { slow: 0.8, normal: 0.95, fast: 1.18 };

  // ---- Audio health (read by Settings → Sound check) -------------------
  // The real iPad can fail in ways no test stub can, so keep a small record of
  // what actually happened instead of swallowing every error.
  const diag = {
    speech: { starts: 0, ends: 0, errors: [] },
    audio: { rebuilds: 0, resumeFails: 0, lastError: "", ticking: null },
  };
  function warn(where, e) {
    try {
      console.warn("[sound] " + where, e);
    } catch (_) {}
  }

  // ---- Audio session (iOS) ---------------------------------------------
  // By default WebKit puts Web Audio in the "ambient" session, which obeys the
  // iPad mute switch / Control Center bell. Claiming "playback" makes the game's
  // sounds audible even when muted (feature-detected; older browsers ignore it).
  function applyAudioSession() {
    try {
      const as = navigator.audioSession;
      if (!as) return;
      const want = settings.loud ? "playback" : "auto";
      if (as.type !== want) as.type = want;
    } catch (e) {
      warn("audioSession", e);
    }
  }

  // ---- English text-to-speech -----------------------------------------
  const synth = window.speechSynthesis || null;
  let enVoice = null;
  let curUtter = null; // strong reference: iOS can garbage-collect a live utterance
  let speakSeq = 0; // lets a newer speak()/stop supersede a delayed one

  const PREFERRED_VOICES = ["Samantha", "Ava", "Allison", "Susan", "Karen", "Moira", "Tessa", "Zira", "Google US English"];
  const NOVELTY_VOICES = /Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox/i;
  function pickVoice() {
    if (!synth) return;
    let voices = [];
    try {
      voices = synth.getVoices() || [];
    } catch (e) {
      warn("getVoices", e);
    }
    const en = voices.filter((v) => /^en[-_]/i.test(v.lang || "") && !NOVELTY_VOICES.test(v.name || ""));
    const us = en.filter((v) => /^en[-_]US/i.test(v.lang));
    let best = null;
    for (const n of PREFERRED_VOICES) {
      best = us.find((v) => (v.name || "").indexOf(n) !== -1);
      if (best) break;
    }
    // never fall back to voices[0]: it can be a non-English or silent voice
    enVoice = best || us[0] || en[0] || null;
  }
  if (synth) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener("voiceschanged", pickVoice);
  }

  // `force` lets the Sound check speak even when read-aloud is switched off.
  function speak(text, onend, force) {
    if (!synth || (!force && !settings.voice) || !text) {
      if (onend) onend();
      return;
    }
    const mySeq = ++speakSeq;
    const run = () => {
      if (mySeq !== speakSeq) return; // superseded by a newer speak() or a stop
      try {
        if (!enVoice) pickVoice();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "en-US";
        if (enVoice) u.voice = enVoice;
        u.rate = RATE[settings.speed] || 0.95;
        u.pitch = 1.05;
        let started = false;
        u.onstart = () => {
          started = true;
          diag.speech.starts += 1;
          listenBtn && listenBtn.classList.add("speaking");
        };
        u.onend = () => {
          diag.speech.ends += 1;
          listenBtn && listenBtn.classList.remove("speaking");
          if (curUtter === u) curUtter = null;
          audioDirty = true; // iOS 27 can silence Web Audio after speech: rebuild next tap
          if (onend) onend();
        };
        u.onerror = (ev) => {
          const why = (ev && ev.error) || "error";
          if (why !== "canceled" && why !== "interrupted") diag.speech.errors.push(String(why));
          listenBtn && listenBtn.classList.remove("speaking");
          if (curUtter === u) curUtter = null;
          audioDirty = true;
          if (onend) onend();
        };
        curUtter = u;
        synth.speak(u);
        // un-pause a wedged iOS queue — resume() only helps AFTER speak()
        try {
          synth.resume();
        } catch (_) {}
        // if it never starts, nudge once (don't re-speak: iOS can play without events)
        setTimeout(() => {
          if (mySeq === speakSeq && !started && curUtter === u) {
            try {
              synth.resume();
            } catch (_) {}
          }
        }, 700);
      } catch (e) {
        warn("speak", e);
        diag.speech.errors.push(String(e));
        if (onend) onend();
      }
    };
    // Only cancel when something is queued, and wait a beat afterwards:
    // cancel() immediately followed by speak() is dropped by some WebKit builds.
    let busy = false;
    try {
      busy = !!(synth.speaking || synth.pending || synth.paused);
    } catch (_) {}
    if (busy) {
      try {
        synth.cancel();
      } catch (_) {}
      setTimeout(run, 80);
    } else {
      run();
    }
  }
  function stopSpeaking() {
    speakSeq++;
    try {
      if (synth) synth.cancel();
    } catch (_) {}
    curUtter = null;
    listenBtn && listenBtn.classList.remove("speaking");
  }

  // ---- Sound effects (synthesised, no audio files) --------------------
  const AC = window.AudioContext || window.webkitAudioContext;
  let actx = null;
  let audioDirty = true; // true → build a fresh context at the next user gesture

  function closeCtx(c) {
    try {
      const p = c && c.close && c.close();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }
  function newCtx() {
    closeCtx(actx);
    actx = null;
    if (!AC) return null;
    try {
      const c = new AC();
      actx = c;
      diag.audio.rebuilds += 1;
      if (c.addEventListener)
        c.addEventListener("statechange", () => {
          // iOS flips a context to "interrupted" (call, Siri, backgrounding)
          if (c === actx && (c.state === "interrupted" || c.state === "closed")) audioDirty = true;
        });
    } catch (e) {
      warn("new AudioContext", e);
      diag.audio.lastError = String(e);
      actx = null;
    }
    return actx;
  }
  // Playing one silent sample inside a tap fully unlocks output on iOS.
  function unlockBuffer(c) {
    try {
      if (!c.createBuffer || !c.createBufferSource) return;
      const s = c.createBufferSource();
      s.buffer = c.createBuffer(1, 1, 22050);
      s.connect(c.destination);
      if (s.start) s.start(0);
    } catch (_) {}
  }
  // Make sure a RUNNING AudioContext exists. Call from a user gesture (tap/key)
  // so iOS lets it start. Rebuilds a dead/interrupted/closed context.
  function wakeAudio(forceRebuild) {
    if (!AC) return null;
    try {
      if (forceRebuild || audioDirty || !actx || actx.state === "closed") {
        newCtx();
        audioDirty = false;
      }
      if (!actx) return null;
      if (actx.state === "running") return actx;
      const c = actx;
      const p = c.resume && c.resume();
      if (p && p.catch)
        p.catch((e) => {
          diag.audio.resumeFails += 1;
          diag.audio.lastError = String(e && e.message ? e.message : e);
          warn("resume", e);
          if (c === actx) audioDirty = true;
        });
      unlockBuffer(c);
      // iOS 26 can leave resume() pending forever: if it is still not running, rebuild next tap
      setTimeout(() => {
        if (c === actx && c.state !== "running") audioDirty = true;
      }, 700);
    } catch (e) {
      warn("wakeAudio", e);
      diag.audio.lastError = String(e);
    }
    return actx;
  }
  function tone(c, freq, start, dur, gain, type) {
    const now = c.currentTime + start;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain || 0.22, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  }
  // `force` lets the Sound check play even when fun sounds are switched off.
  function sfx(kind, force) {
    if (!force && !settings.sfx) return;
    try {
      const c = wakeAudio();
      if (!c) return;
      if (kind === "correct") {
        tone(c, 660, 0, 0.13);
        tone(c, 880, 0.1, 0.2);
      } else if (kind === "wrong") {
        tone(c, 220, 0, 0.3, 0.2, "triangle");
      } else if (kind === "streak") {
        tone(c, 784, 0, 0.12);
        tone(c, 1047, 0.1, 0.2);
      } else if (kind === "win") {
        [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.13, 0.28));
      } else if (kind === "tap") {
        tone(c, 440, 0, 0.06, 0.12);
      }
    } catch (e) {
      warn("sfx", e);
      diag.audio.lastError = String(e);
    }
  }
  // Does the audio clock actually advance? (a context can say "running" yet be dead)
  function probeClock() {
    const c = actx;
    if (!c) return;
    const t0 = c.currentTime;
    setTimeout(() => {
      if (c === actx) diag.audio.ticking = c.currentTime - t0 > 0.15;
      renderSoundCheck();
    }, 450);
  }

  // ---- Confetti -------------------------------------------------------
  function burst(big) {
    if (!settings.fx) return;
    const n = big ? 22 : 10;
    const colors = ["#ff5a5f", "#3d8bfd", "#ffd23f", "#2ec27e", "#9b5de5", "#ff924c", "#ff6fb5"];
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "confetti";
      p.style.left = 50 + (Math.random() * 50 - 25) + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.2 + "s";
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1300);
    }
  }

  // ---- Screen switching -----------------------------------------------
  function show(screen) {
    document.querySelectorAll(".fly").forEach((e) => e.remove());
    [startScreen, quizScreen, resultScreen, settingsScreen, progressScreen, lockScreen].forEach((s) =>
      s.classList.add("hidden")
    );
    screen.classList.remove("hidden");
  }

  // ---- Stats / progress (persisted) -----------------------------------
  function freshStats() {
    const byType = {};
    ALL_TYPES.forEach((t) => (byType[t] = { a: 0, c: 0, ms: 0 }));
    return { games: 0, answered: 0, correct: 0, stars: 0, bestStreak: 0, totalMs: 0, byType, recent: [] };
  }
  let stats = loadStats();
  function loadStats() {
    try {
      const saved = JSON.parse(localStorage.getItem("nnat-stats"));
      if (!saved) return freshStats();
      const s = Object.assign(freshStats(), saved);
      const bt = freshStats().byType;
      ALL_TYPES.forEach((t) => {
        if (saved.byType && saved.byType[t])
          bt[t] = { a: saved.byType[t].a || 0, c: saved.byType[t].c || 0, ms: saved.byType[t].ms || 0 };
      });
      s.byType = bt;
      s.totalMs = saved.totalMs || 0;
      s.recent = Array.isArray(saved.recent) ? saved.recent.slice(-10) : [];
      return s;
    } catch (e) {
      return freshStats();
    }
  }
  function saveStats() {
    try {
      localStorage.setItem("nnat-stats", JSON.stringify(stats));
    } catch (e) {}
  }
  function recordAnswer(type, correct, ms) {
    stats.answered += 1;
    if (correct) stats.correct += 1;
    stats.totalMs += ms || 0;
    if (!stats.byType[type]) stats.byType[type] = { a: 0, c: 0, ms: 0 };
    stats.byType[type].a += 1;
    if (correct) stats.byType[type].c += 1;
    stats.byType[type].ms += ms || 0;
    saveStats();
  }
  function recordGame(score, total, starsEarned, best) {
    stats.games += 1;
    stats.stars += starsEarned;
    stats.bestStreak = Math.max(stats.bestStreak, best);
    stats.recent.push({ score, total, stars: starsEarned, ts: Date.now() });
    stats.recent = stats.recent.slice(-10);
    saveStats();
  }

  // ---- Game flow ------------------------------------------------------
  const PRAISE = ["Awesome!", "Great job!", "You got it!", "Nice work!", "Yes!", "Super!", "Brilliant!"];
  const RETRY = ["Not quite — try again!", "Almost! Pick another one.", "Good try! Have another go."];

  let qStart = 0; // timestamp when the current question was shown
  const nowMs = () => (window.performance && performance.now ? performance.now() : Date.now());

  function startGame() {
    stopSpeaking();
    const deck = NNAT.buildQuestions({ count: settings.count, types: settings.types, level: settings.level });
    questions = deck.slice(0, Math.min(settings.count, deck.length));
    index = 0;
    score = 0;
    streak = 0;
    bestStreak = 0;
    scoreEl.textContent = "0";
    updateStreak();
    qTotal.textContent = String(questions.length);
    updateSoundToggleUI();
    show(quizScreen);
    renderQuestion();
  }

  function updateStreak() {
    if (streak >= 2) {
      streakChip.classList.remove("hidden");
      streakEl.textContent = String(streak);
    } else {
      streakChip.classList.add("hidden");
    }
  }

  function renderQuestion() {
    locked = false;
    retrying = false;
    nextBtn.style.display = "";
    document.querySelectorAll(".fly").forEach((e) => e.remove());
    const q = questions[index];

    $("qtype").textContent = q.type || "Puzzle";
    promptEl.textContent = q.prompt;
    stimulusEl.innerHTML = q.stimulus;

    qCurrent.textContent = String(index + 1);
    progressFill.style.width = `${(index / questions.length) * 100}%`;

    feedbackEl.classList.add("hidden");

    optionsEl.innerHTML = "";
    q.options.forEach((optSvg, i) => {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.setAttribute("aria-label", `Choice ${i + 1}`);
      btn.innerHTML = `<span class="option-num">${i + 1}</span><span class="option-art">${optSvg}</span>`;
      btn.addEventListener("click", () => choose(i, btn));
      optionsEl.appendChild(btn);
    });

    speak(q.prompt);
    qStart = nowMs(); // start the per-question timer

    // optional render hook (used by the automated playthrough tests; no-op in
    // production where window.__onRender is undefined)
    if (window.__onRender) window.__onRender(q, index, questions.length);
  }

  function bounceMascot() {
    feedbackEmoji.classList.remove("bounce");
    void feedbackEmoji.offsetWidth; // restart animation
    feedbackEmoji.classList.add("bounce");
  }

  // shows the feedback row + Next button and advances the progress bar
  function finishFeedback() {
    nextBtn.style.display = "";
    nextBtn.textContent = index === questions.length - 1 ? "See My Stars ⭐" : "Next ▶";
    feedbackEl.classList.remove("hidden");
    progressFill.style.width = `${((index + 1) / questions.length) * 100}%`;
  }

  function choose(i, btn) {
    if (locked) return;
    const q = questions[index];
    const correct = i === q.answer;
    const allBtns = Array.from(optionsEl.children);

    if (!retrying) {
      // ---- first attempt: this is the one that counts in the stats ----
      const dt = Math.max(0, nowMs() - qStart);
      recordAnswer(q.type || "Puzzle", correct, dt);

      if (correct) {
        locked = true;
        score += 1;
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        scoreEl.textContent = String(score);
        updateStreak();
        allBtns.forEach((b, bi) => {
          b.disabled = true;
          if (bi === q.answer) b.classList.add("correct");
        });
        btn.classList.add("picked-correct");
        const milestone = streak >= 3 && (streak === 3 || streak % 5 === 0);
        feedbackEmoji.textContent = milestone ? "🔥" : "🌟";
        feedbackText.textContent = milestone ? `${streak} in a row!` : PRAISE[Math.floor(Math.random() * PRAISE.length)];
        sfx(milestone ? "streak" : "correct");
        burst(true);
        bounceMascot();
        animateFill(btn, false);
        speak(feedbackText.textContent);
        finishFeedback();
      } else {
        // first wrong: count it wrong, but DON'T reveal — let them try once more
        streak = 0;
        updateStreak();
        retrying = true;
        btn.classList.add("wrong");
        btn.disabled = true; // can't pick this wrong one again
        feedbackEmoji.textContent = "🤔";
        feedbackText.textContent = RETRY[Math.floor(Math.random() * RETRY.length)];
        sfx("wrong");
        speak(feedbackText.textContent);
        scheduleSimilar(q); // adaptive follow-ups are based on the first (wrong) answer
        nextBtn.style.display = "none"; // no Next yet — they must choose again
        feedbackEl.classList.remove("hidden");
      }
    } else {
      // ---- retry (second) attempt: NOT recorded, NOT scored ----
      locked = true;
      if (correct) {
        allBtns.forEach((b) => (b.disabled = true));
        btn.classList.add("picked-correct");
        allBtns[q.answer].classList.add("correct");
        feedbackEmoji.textContent = "🌟";
        feedbackText.textContent = "You got it!";
        sfx("correct");
        burst(true);
        bounceMascot();
        animateFill(btn, false); // reveal the completed picture
        speak("You got it!");
      } else {
        allBtns.forEach((b, bi) => {
          b.disabled = true;
          if (bi === q.answer) b.classList.add("correct");
        });
        btn.classList.add("wrong");
        feedbackEmoji.textContent = "💡";
        feedbackText.textContent = "That one does not fit. The glowing piece is right.";
        sfx("wrong");
        animateFill(allBtns[q.answer], false); // show the correct answer in the slot
        speak(feedbackText.textContent);
      }
      finishFeedback();
    }
  }

  // Fly the chosen tile into the "?" hole.
  function animateFill(btn, leaveInHole) {
    const q = questions[index];
    const myIndex = index; // guard: don't touch the stimulus if we've moved on
    const svgEl = stimulusEl.querySelector("svg");
    if (!q.hole || !q.vb || !svgEl) {
      if (!leaveInHole && q.solved && index === myIndex) stimulusEl.innerHTML = q.solved;
      return;
    }
    const srect = svgEl.getBoundingClientRect();
    const scale = srect.width / q.vb.w;
    const holeLeft = srect.left + q.hole.x * scale;
    const holeTop = srect.top + q.hole.y * scale;
    const holeW = q.hole.w * scale;
    const holeH = q.hole.h * scale;

    const art = btn.querySelector(".option-art");
    const arect = art.getBoundingClientRect();

    const fly = document.createElement("div");
    fly.className = "fly";
    fly.innerHTML = art.innerHTML;
    fly.style.left = arect.left + "px";
    fly.style.top = arect.top + "px";
    fly.style.width = arect.width + "px";
    fly.style.height = arect.height + "px";
    document.body.appendChild(fly);

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const tx = holeLeft - arect.left;
        const ty = holeTop - arect.top;
        const sx = holeW / arect.width;
        const sy = holeH / arect.height;
        fly.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
      })
    );

    setTimeout(() => {
      // if the player already advanced to the next question, don't repaint it
      if (index === myIndex) {
        if (leaveInHole) {
          const cont = stimulusEl.getBoundingClientRect();
          const ov = document.createElement("div");
          ov.className = "hole-fill";
          ov.innerHTML = art.innerHTML;
          ov.style.left = holeLeft - cont.left + "px";
          ov.style.top = holeTop - cont.top + "px";
          ov.style.width = holeW + "px";
          ov.style.height = holeH + "px";
          stimulusEl.appendChild(ov);
        } else {
          stimulusEl.innerHTML = q.solved;
        }
      }
      fly.classList.add("landed");
      setTimeout(() => fly.remove(), 160);
    }, 620);
  }

  // After a wrong answer, replace a couple of upcoming questions with
  // same-type, same-subtype variations so the child gets another chance to
  // generalise the idea (举一反三). Keeps the total count unchanged.
  function scheduleSimilar(q) {
    if (!q || !q.g || !window.NNAT || !NNAT.makeSimilar) return;
    const existing = new Set(questions.map((x) => x.stimulus));
    [2, 4].forEach((offset) => {
      const target = index + offset;
      if (target >= questions.length) return;
      for (let tries = 0; tries < 8; tries++) {
        const sim = NNAT.makeSimilar(q, settings.level);
        if (!existing.has(sim.stimulus)) {
          existing.delete(questions[target].stimulus);
          questions[target] = sim;
          existing.add(sim.stimulus);
          break;
        }
      }
    });
  }

  function next() {
    index += 1;
    if (index >= questions.length) {
      showResults();
    } else {
      renderQuestion();
    }
  }

  function showResults() {
    show(resultScreen);
    const total = questions.length;
    $("final-score").textContent = String(score);
    $("final-total").textContent = String(total);

    const ratio = total ? score / total : 0;
    const filled = score === 0 ? 0 : Math.max(1, Math.round(ratio * 5));
    let starsHtml = "";
    for (let i = 0; i < 5; i++) starsHtml += i < filled ? "⭐" : "☆";
    $("stars").textContent = starsHtml;

    recordGame(score, total, filled, bestStreak);

    const emoji = ratio >= 0.8 ? "🏆" : ratio >= 0.5 ? "🎉" : "🌱";
    $("result-emoji").textContent = emoji;
    const title = $("result-title");
    if (title) title.textContent = ratio >= 0.8 ? "Amazing!" : ratio >= 0.5 ? "Great Job!" : "Good Try!";

    const bestLine = $("best-streak-line");
    if (bestStreak >= 3) {
      $("best-streak").textContent = String(bestStreak);
      bestLine.classList.remove("hidden");
    } else {
      bestLine.classList.add("hidden");
    }

    if (ratio >= 0.8) {
      burst(true);
      setTimeout(() => burst(true), 250);
      sfx("win");
    } else {
      sfx("correct");
    }

    const msg =
      ratio >= 0.8
        ? `Amazing! You got ${score} out of ${total} right!`
        : ratio >= 0.5
        ? `Great job! You got ${score} out of ${total} right!`
        : `Good try! You got ${score} out of ${total}. Let's play again!`;
    speak(msg);
  }

  // ---- Settings page --------------------------------------------------
  function setActive(containerId, attr, value, multi) {
    const cont = $(containerId);
    if (!cont) return;
    Array.from(cont.children).forEach((chip) => {
      const v = chip.dataset[attr];
      const on = multi ? value.indexOf(v) !== -1 : String(value) === v;
      chip.classList.toggle("active", on);
    });
  }

  const LEVEL_NOTE = {
    A: "Kindergarten · Patterns & Analogies",
    B: "Grade 1 · adds Sequences (Serial Reasoning)",
    C: "Grade 2 · adds Turns & Combine (Spatial)",
  };
  // changing level resets the puzzle types to everything that level offers;
  // keeps the start-screen and settings level pickers in sync.
  function setLevel(L) {
    if (!levelTypes(L).length || L === settings.level) return; // re-tapping the
    // current level keeps your chosen puzzle-type subset instead of resetting it
    settings.level = L;
    settings.types = levelTypes(L);
    saveSettings();
    renderHomeLevel();
    if (!settingsScreen.classList.contains("hidden")) renderSettings();
  }
  function renderHomeLevel() {
    setActive("home-level", "level", settings.level, false);
    const note = $("home-level-note");
    if (note) note.textContent = LEVEL_NOTE[settings.level] || "";
  }
  function renderSettings() {
    setActive("set-level", "level", settings.level, false);
    $("level-note").textContent = LEVEL_NOTE[settings.level] || "";
    // only show puzzle types available at this level
    const avail = levelTypes(settings.level);
    Array.from($("set-types").children).forEach((chip) => {
      const t = chip.dataset.type;
      chip.classList.toggle("hidden", avail.indexOf(t) === -1);
    });
    setActive("set-count", "count", settings.count, false);
    setActive("set-types", "type", settings.types, true);
    setActive("set-voice", "voice", settings.voice ? "on" : "off", false);
    setActive("set-speed", "speed", settings.speed, false);
    setActive("set-sfx", "sfx", settings.sfx ? "on" : "off", false);
    setActive("set-loud", "loud", settings.loud ? "on" : "off", false);
    setActive("set-fx", "fx", settings.fx ? "on" : "off", false);
    renderSoundCheck();
    const locked = !!getPin();
    $("lock-status").textContent = locked
      ? "Lock is ON — a PIN is needed to open Settings & Progress."
      : "No PIN set. Tap “Set / change PIN” to lock Settings & Progress.";
    $("lock-remove").disabled = !locked;
  }

  function updateSoundToggleUI() {
    const t = $("sound-toggle");
    if (t) {
      t.textContent = settings.voice ? "🔊" : "🔇";
      t.classList.toggle("muted", !settings.voice);
    }
    // a "Listen" button is pointless when read-aloud is off
    if (listenBtn) listenBtn.style.display = settings.voice ? "" : "none";
  }

  function wireChips() {
    $("set-level").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      setLevel(c.dataset.level); // enables all types for the level + syncs UIs
      renderSettings();
      sfx("tap");
    });

    $("set-count").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.count = parseInt(c.dataset.count, 10) || settings.count;
      saveSettings();
      renderSettings();
      sfx("tap");
    });

    $("set-types").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      const t = c.dataset.type;
      const has = settings.types.indexOf(t) !== -1;
      if (has && settings.types.length === 1) {
        // keep at least one type selected — nudge instead of empty
        c.classList.add("nudge");
        setTimeout(() => c.classList.remove("nudge"), 400);
        return;
      }
      settings.types = has ? settings.types.filter((x) => x !== t) : settings.types.concat(t);
      saveSettings();
      renderSettings();
      sfx("tap");
    });

    $("set-voice").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.voice = c.dataset.voice === "on";
      saveSettings();
      renderSettings();
      updateSoundToggleUI();
      if (settings.voice) speak("Hello! Let's play.");
      else stopSpeaking();
    });

    $("set-speed").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.speed = c.dataset.speed;
      saveSettings();
      renderSettings();
      speak("This is my talking speed.");
    });

    $("set-sfx").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.sfx = c.dataset.sfx === "on";
      saveSettings();
      renderSettings();
      if (settings.sfx) sfx("correct");
    });

    $("set-loud").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.loud = c.dataset.loud === "on";
      saveSettings();
      applyAudioSession();
      renderSettings();
      sfx("correct", true);
    });

    $("set-fx").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.fx = c.dataset.fx === "on";
      saveSettings();
      renderSettings();
      if (settings.fx) burst(true);
    });
  }

  // ---- Sound check (Settings): shows what the device is REALLY doing ----
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function isStandalone() {
    try {
      return !!(navigator.standalone || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
    } catch (_) {
      return false;
    }
  }
  function deviceInfo() {
    const ua = (navigator.userAgent || "").trim();
    const inParens = (ua.match(/\(([^)]*)\)/) || [])[1] || "";
    const ver = (ua.match(/Version\/([\d.]+)/) || [])[1];
    return (inParens + (ver ? " · Safari " + ver : "")).slice(0, 90) || "unknown";
  }
  function renderSoundCheck() {
    const el = $("sound-check-result");
    if (!el) return;
    const rows = [];
    const add = (kind, text) => rows.push(`<div class="diag-line diag-${kind}">${esc(text)}</div>`);

    // effects (Web Audio)
    if (!AC) add("bad", "Effects: Web Audio is not available in this browser");
    else if (!actx) add("warn", "Effects: not started yet — tap “Chime”");
    else {
      const tick = diag.audio.ticking === false ? " · clock frozen" : diag.audio.ticking ? " · clock running" : "";
      const rb = diag.audio.rebuilds > 1 ? ` · rebuilt ${diag.audio.rebuilds - 1}×` : "";
      const err = diag.audio.lastError ? ` · ${diag.audio.lastError}` : "";
      add(actx.state === "running" && diag.audio.ticking !== false ? "ok" : "bad", `Effects: ${actx.state}${tick}${rb}${err}`);
    }
    // audio channel
    let as = null;
    try {
      as = navigator.audioSession || null;
    } catch (_) {}
    if (!as) add("warn", "Audio channel: not supported here (sound follows the iPad mute switch)");
    else add(as.type === "playback" ? "ok" : "warn", `Audio channel: ${as.type}${as.type === "playback" ? " (plays even when muted)" : " (follows the mute switch)"}`);
    // voice
    if (!synth) add("bad", "Voice: speech is not available in this browser");
    else {
      let n = 0;
      try {
        n = (synth.getVoices() || []).filter((v) => /^en[-_]/i.test(v.lang || "")).length;
      } catch (_) {}
      const sp = diag.speech;
      const errs = sp.errors.length ? ` · errors: ${sp.errors.slice(-2).join(", ")}` : "";
      add(
        sp.errors.length ? "bad" : sp.starts ? "ok" : "warn",
        `Voice: ${n} English voice${n === 1 ? "" : "s"} · using ${enVoice ? enVoice.name : "default"} · started ${sp.starts}, finished ${sp.ends}${errs}`
      );
    }
    add("info", `App version: v${APP_VERSION}`);
    add("info", `Opened as: ${isStandalone() ? "Home-Screen app" : "browser tab"} · ${deviceInfo()}`);
    el.innerHTML =
      rows.join("") +
      `<div class="diag-help">Heard nothing? ① Turn off iPad mute (Control Center 🔔) and raise the volume ② Open this address in a normal Safari tab ③ Delete the Home-Screen icon and add it again ④ Update iPadOS.</div>`;
  }

  function showSettings() {
    renderSettings();
    show(settingsScreen);
  }
  function openSettings() {
    requireUnlock(showSettings);
  }

  // ---- Parent PIN lock ------------------------------------------------
  let pinMode = "enter";
  let pinAfter = null;
  let pinBuffer = "";
  function getPin() {
    try {
      return localStorage.getItem("nnat-pin") || "";
    } catch (e) {
      return "";
    }
  }
  function setPin(v) {
    try {
      if (v) localStorage.setItem("nnat-pin", v);
      else localStorage.removeItem("nnat-pin");
    } catch (e) {}
  }
  function renderDots() {
    const dots = $("pin-dots");
    dots.innerHTML = "";
    for (let i = 0; i < 4; i++) {
      const d = document.createElement("span");
      d.className = "pin-dot" + (i < pinBuffer.length ? " filled" : "");
      dots.appendChild(d);
    }
  }
  function openLock(mode, after) {
    pinMode = mode;
    pinAfter = after || null;
    pinBuffer = "";
    renderDots();
    $("lock-title").textContent = mode === "set" ? "Set a PIN" : "Parents only";
    $("lock-sub").textContent = mode === "set" ? "Choose a 4-digit PIN" : "Enter the 4-digit PIN";
    show(lockScreen);
  }
  function requireUnlock(after) {
    if (getPin()) openLock("enter", after);
    else after();
  }
  function pinPress(k) {
    if (k === "back") {
      pinBuffer = pinBuffer.slice(0, -1);
      renderDots();
      return;
    }
    if (pinBuffer.length >= 4) return;
    pinBuffer += k;
    renderDots();
    sfx("tap");
    if (pinBuffer.length < 4) return;
    const entered = pinBuffer;
    setTimeout(() => {
      if (pinMode === "set") {
        setPin(entered);
        showSettings();
      } else if (entered === getPin()) {
        const cb = pinAfter;
        pinAfter = null;
        if (cb) cb();
      } else {
        const card = lockScreen.querySelector(".lock-card");
        card.classList.add("shakex");
        setTimeout(() => card.classList.remove("shakex"), 400);
        pinBuffer = "";
        renderDots();
      }
    }, 130);
  }

  // ---- Progress dashboard ---------------------------------------------
  const TYPE_SHORT = {
    "Pattern Completion": "🧩 Patterns",
    "Reasoning by Analogy": "🔗 Analogies",
    "Serial Reasoning": "➡️ Sequences",
    "Spatial Visualization": "🔄 Turns",
  };
  function pct(c, a) {
    return a ? Math.round((100 * c) / a) : 0;
  }
  function statCard(icon, val, label) {
    return `<div class="stat-card"><div class="stat-icon">${icon}</div><div class="stat-val">${val}</div><div class="stat-label">${label}</div></div>`;
  }
  function dateLabel(ts) {
    if (!ts) return "Earlier";
    const d = new Date(ts);
    const now = new Date();
    const sameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (sameDay(d, now)) return "Today";
    if (sameDay(d, yest)) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function trendSVG() {
    const games = stats.recent.slice(-10);
    if (games.length < 2) return "";
    const pts = games.map((g) => (g.total ? Math.round((100 * g.score) / g.total) : 0));
    const W = 300,
      H = 120,
      padL = 24,
      padR = 10,
      padT = 12,
      padB = 16;
    const n = pts.length;
    const x = (i) => padL + (i * (W - padL - padR)) / (n - 1);
    const y = (v) => padT + ((100 - v) / 100) * (H - padT - padB);
    const poly = pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const dotsM = pts
      .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="#6c5ce7"/>`)
      .join("");
    const gy = y(50).toFixed(1);
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
        <line x1="${padL}" y1="${y(100).toFixed(1)}" x2="${W - padR}" y2="${y(100).toFixed(1)}" stroke="#eef0f8"/>
        <line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#e6e8f5" stroke-dasharray="4 4"/>
        <line x1="${padL}" y1="${y(0).toFixed(1)}" x2="${W - padR}" y2="${y(0).toFixed(1)}" stroke="#eef0f8"/>
        <text x="2" y="${(y(100) + 4).toFixed(1)}" font-size="9" fill="#b9bed1">100</text>
        <text x="6" y="${(y(50) + 4).toFixed(1)}" font-size="9" fill="#b9bed1">50</text>
        <text x="10" y="${(y(0) + 4).toFixed(1)}" font-size="9" fill="#b9bed1">0</text>
        <polyline points="${poly}" fill="none" stroke="#6c5ce7" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
        ${dotsM}
      </svg>`;
  }

  function renderProgress() {
    const hasData = stats.answered > 0;
    $("stats-empty").classList.toggle("hidden", hasData);
    $("type-section").classList.toggle("hidden", !hasData);
    $("recent-section").classList.toggle("hidden", !hasData);

    const trend = trendSVG();
    $("trend-section").classList.toggle("hidden", !trend);
    $("trend-chart").innerHTML = trend;

    const avgSecs = stats.answered ? (stats.totalMs / stats.answered / 1000).toFixed(1) : "0";
    $("stat-summary").innerHTML = [
      statCard("🎮", stats.games, "Games"),
      statCard("❓", stats.answered, "Answered"),
      statCard("🎯", pct(stats.correct, stats.answered) + "%", "Accuracy"),
      statCard("🔥", stats.bestStreak, "Best streak"),
      statCard("⏱", avgSecs + "s", "Avg time"),
    ].join("");

    // which type is slowest on average? (only types actually attempted)
    let slowest = null;
    let slowAvg = -1;
    ALL_TYPES.forEach((t) => {
      const d = stats.byType[t];
      if (d && d.a) {
        const avg = d.ms / d.a;
        if (avg > slowAvg) {
          slowAvg = avg;
          slowest = t;
        }
      }
    });

    // show a bar only for types that have been practiced; list the rest below
    const practiced = ALL_TYPES.filter((t) => (stats.byType[t] || {}).a > 0);
    let barsHtml = practiced
      .map((t) => {
        const d = stats.byType[t];
        const p = pct(d.c, d.a);
        const avg = (d.ms / d.a / 1000).toFixed(1) + "s";
        const slow = t === slowest && practiced.length > 1;
        return `<div class="bar-row">
          <div class="bar-top"><span>${TYPE_SHORT[t] || t}${slow ? ' <span class="slow-tag">🐢 slowest</span>' : ""}</span><span class="bar-val">${
          p + "% · " + d.c + "/" + d.a + " · " + avg
        }</span></div>
          <div class="bar"><div class="bar-fill" style="width:${p}%"></div></div>
        </div>`;
      })
      .join("");
    const untouched = ALL_TYPES.filter((t) => !((stats.byType[t] || {}).a > 0));
    if (untouched.length) {
      const hints = [];
      if (untouched.indexOf("Serial Reasoning") !== -1) hints.push("➡️ Sequences starts at Level B");
      if (untouched.indexOf("Spatial Visualization") !== -1) hints.push("🔄 Turns starts at Level C");
      barsHtml += `<p class="set-note">Not practiced yet: ${untouched.map((t) => TYPE_SHORT[t] || t).join(", ")}.${
        hints.length ? " " + hints.join("; ") + "." : ""
      }</p>`;
    }
    $("type-bars").innerHTML = barsHtml;

    const rec = stats.recent.slice().reverse();
    if (!rec.length) {
      $("recent-list").innerHTML = `<p class="set-note">No games yet.</p>`;
    } else {
      let html = "";
      let lastLabel = null;
      rec.forEach((r) => {
        const lab = dateLabel(r.ts);
        if (lab !== lastLabel) {
          html += `<div class="recent-date">${lab}</div>`;
          lastLabel = lab;
        }
        html += `<div class="recent-row"><span>${r.score} / ${r.total}</span><span class="recent-stars">${
          "⭐".repeat(r.stars || 0) || "–"
        }</span></div>`;
      });
      $("recent-list").innerHTML = html;
    }
  }
  let progressBack = startScreen;
  function showProgress() {
    renderProgress();
    show(progressScreen);
  }
  function openProgress() {
    requireUnlock(showProgress);
  }

  // ---- Wire up --------------------------------------------------------
  updateSoundToggleUI();
  wireChips();
  renderHomeLevel();
  applyAudioSession();

  // iOS only lets audio start inside a real tap. Wake (or rebuild) the audio
  // engine on EVERY user gesture so it is already running when a sound is needed.
  ["touchend", "click", "keydown"].forEach((ev) =>
    document.addEventListener(
      ev,
      () => {
        if (settings.sfx || settings.voice) wakeAudio();
      },
      true
    )
  );
  // Coming back to the app (iPad Home-Screen apps get suspended): the audio
  // engine and the speech queue can be dead — reset them on return.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopSpeaking();
    } else {
      audioDirty = true;
      try {
        if (synth) {
          synth.cancel();
          synth.resume();
        }
      } catch (_) {}
    }
  });
  window.addEventListener("pageshow", () => {
    audioDirty = true;
  });

  // Sound check buttons (Settings): mirror what happens in real play
  $("test-chime").addEventListener("click", () => {
    sfx("correct", true);
    probeClock();
    setTimeout(renderSoundCheck, 80);
  });
  $("test-voice").addEventListener("click", () => {
    speak("Sound check. Can you hear me?", renderSoundCheck, true);
    setTimeout(renderSoundCheck, 900);
  });

  $("home-level").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    setLevel(c.dataset.level);
    sfx("tap");
  });

  // Refresh button. iOS home-screen apps cache aggressively and a plain
  // reload often re-uses cached JS/CSS, so reload via a fresh URL (cache-bust)
  // to pull the latest version.
  $("refresh-btn").addEventListener("click", () => {
    try {
      const base = location.href.split("#")[0].split("?")[0];
      location.replace(base + "?r=" + Date.now());
    } catch (e) {
      try {
        location.reload();
      } catch (_) {}
    }
  });

  $("start-btn").addEventListener("click", startGame);
  $("open-settings").addEventListener("click", openSettings);
  $("settings-done").addEventListener("click", () => show(startScreen));
  $("open-progress").addEventListener("click", () => {
    progressBack = startScreen;
    openProgress();
  });
  $("open-progress-2").addEventListener("click", () => {
    progressBack = resultScreen;
    openProgress();
  });
  $("progress-done").addEventListener("click", () => show(progressBack));
  $("quit-btn").addEventListener("click", () => {
    stopSpeaking();
    show(startScreen);
  });

  // parent lock
  $("keypad").addEventListener("click", (e) => {
    const k = e.target.closest(".key");
    if (k && k.dataset.k) pinPress(k.dataset.k);
  });
  $("lock-cancel").addEventListener("click", () => show(startScreen));
  $("lock-set").addEventListener("click", () => openLock("set"));
  $("lock-remove").addEventListener("click", () => {
    if (getPin() && window.confirm("Turn off the parent lock?")) {
      setPin("");
      renderSettings();
    }
  });
  $("reset-stats").addEventListener("click", () => {
    if (window.confirm("Clear all progress stats?")) {
      stats = freshStats();
      saveStats();
      renderProgress();
    }
  });
  $("restart-btn").addEventListener("click", () => {
    stopSpeaking();
    show(startScreen);
  });
  nextBtn.addEventListener("click", () => {
    stopSpeaking();
    next();
  });

  listenBtn.addEventListener("click", () => {
    if (questions[index]) speak(questions[index].prompt);
  });

  $("sound-toggle").addEventListener("click", () => {
    settings.voice = !settings.voice;
    saveSettings();
    updateSoundToggleUI();
    if (!settings.voice) stopSpeaking();
    else if (questions[index] && !quizScreen.classList.contains("hidden")) speak(questions[index].prompt);
  });

  // keyboard: 1-5 answer, Enter/Space next
  document.addEventListener("keydown", (e) => {
    if (!lockScreen.classList.contains("hidden")) {
      if (/^[0-9]$/.test(e.key)) pinPress(e.key);
      else if (e.key === "Backspace") {
        e.preventDefault();
        pinPress("back");
      } else if (e.key === "Escape") show(startScreen);
      return;
    }
    if (!quizScreen.classList.contains("hidden")) {
      if (locked && !feedbackEl.classList.contains("hidden") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        stopSpeaking();
        next();
        return;
      }
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= optionsEl.children.length && !locked) {
        optionsEl.children[num - 1].click();
      }
    }
  });
})();
