/* =====================================================================
   NNAT3 Level A — game flow
   Screen switching, one-question-at-a-time rendering, scoring, feedback,
   streaks, sound effects, a separate Settings page, and results.
   ===================================================================== */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Screens
  const startScreen = $("start-screen");
  const quizScreen = $("quiz-screen");
  const resultScreen = $("result-screen");
  const settingsScreen = $("settings-screen");

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
  let streak = 0;
  let bestStreak = 0;

  // ---- Settings (persisted) -------------------------------------------
  const DEFAULTS = {
    count: 10,
    types: ["pattern", "analogy", "serial", "spatial"],
    voice: true,
    speed: "normal",
    sfx: true,
    fx: true,
  };
  let settings = loadSettings();

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem("nnat-settings")) || {};
      const s = Object.assign({}, DEFAULTS, saved);
      if (!Array.isArray(s.types) || !s.types.length) s.types = DEFAULTS.types.slice();
      return s;
    } catch (e) {
      return Object.assign({}, DEFAULTS, { types: DEFAULTS.types.slice() });
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem("nnat-settings", JSON.stringify(settings));
    } catch (e) {}
  }
  const RATE = { slow: 0.8, normal: 0.95, fast: 1.18 };

  // ---- English text-to-speech -----------------------------------------
  const synth = window.speechSynthesis || null;
  let enVoice = null;
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    enVoice =
      voices.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|zira|google/i.test(v.name)) ||
      voices.find((v) => /^en[-_]/i.test(v.lang)) ||
      voices[0] ||
      null;
  }
  if (synth) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener("voiceschanged", pickVoice);
  }

  function speak(text, onend) {
    if (!synth || !settings.voice || !text) {
      if (onend) onend();
      return;
    }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      if (enVoice) u.voice = enVoice;
      u.rate = RATE[settings.speed] || 0.95;
      u.pitch = 1.05;
      u.onstart = () => listenBtn && listenBtn.classList.add("speaking");
      u.onend = () => {
        listenBtn && listenBtn.classList.remove("speaking");
        if (onend) onend();
      };
      synth.speak(u);
    } catch (e) {
      if (onend) onend();
    }
  }
  function stopSpeaking() {
    if (synth) synth.cancel();
    listenBtn && listenBtn.classList.remove("speaking");
  }

  // ---- Sound effects (synthesised, no audio files) --------------------
  let actx = null;
  function tone(freq, start, dur, gain, type) {
    const now = actx.currentTime + start;
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(actx.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  }
  function sfx(kind) {
    if (!settings.sfx) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      if (kind === "correct") {
        tone(660, 0, 0.13);
        tone(880, 0.1, 0.2);
      } else if (kind === "wrong") {
        tone(196, 0, 0.28, 0.16, "triangle");
      } else if (kind === "streak") {
        tone(784, 0, 0.12);
        tone(1047, 0.1, 0.2);
      } else if (kind === "win") {
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.28));
      } else if (kind === "tap") {
        tone(440, 0, 0.06, 0.1);
      }
    } catch (e) {}
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
    [startScreen, quizScreen, resultScreen, settingsScreen].forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
  }

  // ---- Game flow ------------------------------------------------------
  const PRAISE = ["Awesome!", "Great job!", "You got it!", "Nice work!", "Yes!", "Super!", "Brilliant!"];
  const TRY_AGAIN = ["Good try!", "Almost!", "Keep going!"];

  function startGame() {
    stopSpeaking();
    const deck = NNAT.buildQuestions({ count: settings.count, types: settings.types });
    questions = deck.slice(0, Math.min(settings.count, deck.length));
    index = 0;
    score = 0;
    streak = 0;
    bestStreak = 0;
    scoreEl.textContent = "0";
    updateStreak();
    qTotal.textContent = String(questions.length);
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
  }

  function bounceMascot() {
    feedbackEmoji.classList.remove("bounce");
    void feedbackEmoji.offsetWidth; // restart animation
    feedbackEmoji.classList.add("bounce");
  }

  function choose(i, btn) {
    if (locked) return;
    locked = true;

    const q = questions[index];
    const correct = i === q.answer;
    const allBtns = Array.from(optionsEl.children);

    allBtns.forEach((b, bi) => {
      b.disabled = true;
      if (bi === q.answer) b.classList.add("correct");
    });

    if (correct) {
      score += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      scoreEl.textContent = String(score);
      updateStreak();
      btn.classList.add("picked-correct");

      const milestone = streak >= 3 && (streak === 3 || streak % 5 === 0);
      feedbackEmoji.textContent = milestone ? "🔥" : "🌟";
      feedbackText.textContent = milestone
        ? `${streak} in a row!`
        : PRAISE[Math.floor(Math.random() * PRAISE.length)];
      sfx(milestone ? "streak" : "correct");
      burst(true);
      bounceMascot();
      animateFill(btn, false);
      speak(feedbackText.textContent);
    } else {
      streak = 0;
      updateStreak();
      btn.classList.add("wrong");
      feedbackEmoji.textContent = "💡";
      feedbackText.textContent =
        TRY_AGAIN[Math.floor(Math.random() * TRY_AGAIN.length)] + " That piece does not fit. The glowing one is right.";
      sfx("wrong");
      animateFill(btn, true);
      speak(feedbackText.textContent);
    }

    nextBtn.textContent = index === questions.length - 1 ? "See My Stars ⭐" : "Next ▶";
    feedbackEl.classList.remove("hidden");
    progressFill.style.width = `${((index + 1) / questions.length) * 100}%`;
  }

  // Fly the chosen tile into the "?" hole.
  function animateFill(btn, leaveInHole) {
    const q = questions[index];
    const svgEl = stimulusEl.querySelector("svg");
    if (!q.hole || !q.vb || !svgEl) {
      if (!leaveInHole && q.solved) stimulusEl.innerHTML = q.solved;
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
      fly.classList.add("landed");
      setTimeout(() => fly.remove(), 160);
    }, 620);
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

  function renderSettings() {
    setActive("set-count", "count", settings.count, false);
    setActive("set-types", "type", settings.types, true);
    setActive("set-voice", "voice", settings.voice ? "on" : "off", false);
    setActive("set-speed", "speed", settings.speed, false);
    setActive("set-sfx", "sfx", settings.sfx ? "on" : "off", false);
    setActive("set-fx", "fx", settings.fx ? "on" : "off", false);
  }

  function updateSoundToggleUI() {
    const t = $("sound-toggle");
    if (!t) return;
    t.textContent = settings.voice ? "🔊" : "🔇";
    t.classList.toggle("muted", !settings.voice);
  }

  function wireChips() {
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

    $("set-fx").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      settings.fx = c.dataset.fx === "on";
      saveSettings();
      renderSettings();
      if (settings.fx) burst(true);
    });
  }

  function openSettings() {
    renderSettings();
    show(settingsScreen);
  }

  // ---- Wire up --------------------------------------------------------
  updateSoundToggleUI();
  wireChips();

  $("start-btn").addEventListener("click", startGame);
  $("open-settings").addEventListener("click", openSettings);
  $("settings-done").addEventListener("click", () => show(startScreen));
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

  // keyboard: 1-4 answer, Enter/Space next
  document.addEventListener("keydown", (e) => {
    if (!quizScreen.classList.contains("hidden")) {
      if (!feedbackEl.classList.contains("hidden") && (e.key === "Enter" || e.key === " ")) {
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
