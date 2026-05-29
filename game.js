/* =====================================================================
   NNAT3 Level A — game flow
   Handles screen switching, rendering one question at a time, scoring,
   feedback, and the results screen.
   ===================================================================== */

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Screens
  const startScreen = $("start-screen");
  const quizScreen = $("quiz-screen");
  const resultScreen = $("result-screen");

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

  let questions = [];
  let index = 0;
  let score = 0;
  let locked = false; // prevents double answering

  // ---- English text-to-speech (Web Speech API) ----
  const synth = window.speechSynthesis || null;
  let soundOn = localStorage.getItem("nnat-sound") !== "off";
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
    synth.addEventListener && synth.addEventListener("voiceschanged", pickVoice);
  }

  const listenBtn = $("listen-btn");

  function speak(text, onend) {
    if (!synth || !soundOn || !text) {
      if (onend) onend();
      return;
    }
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      if (enVoice) u.voice = enVoice;
      u.rate = 0.92; // a touch slower for young kids
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

  function updateSoundUI() {
    const t = $("sound-toggle");
    if (!t) return;
    t.textContent = soundOn ? "🔊" : "🔇";
    t.classList.toggle("muted", !soundOn);
  }

  const PRAISE = ["Awesome!", "Great job!", "You got it!", "Nice work!", "Yes! 🎉", "Super!"];
  const TRY_AGAIN = ["Good try!", "Almost!", "Keep going!"];

  function show(screen) {
    [startScreen, quizScreen, resultScreen].forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
  }

  function startGame() {
    stopSpeaking();
    questions = NNAT.buildQuestions();
    index = 0;
    score = 0;
    scoreEl.textContent = "0";
    qTotal.textContent = String(questions.length);
    show(quizScreen);
    renderQuestion();
  }

  function renderQuestion() {
    locked = false;
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

    // read the question aloud (English)
    speak(q.prompt);
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
      scoreEl.textContent = String(score);
      btn.classList.add("picked-correct");
      feedbackEmoji.textContent = "🌟";
      feedbackText.textContent = PRAISE[Math.floor(Math.random() * PRAISE.length)];
      burst(true);
      animateFill(btn);
      speak(feedbackText.textContent.replace("🎉", ""));
    } else {
      btn.classList.add("wrong");
      feedbackEmoji.textContent = "💡";
      feedbackText.textContent =
        TRY_AGAIN[Math.floor(Math.random() * TRY_AGAIN.length)] + " The glowing one was right.";
      speak(feedbackText.textContent);
    }

    nextBtn.textContent = index === questions.length - 1 ? "See My Stars ⭐" : "Next ▶";
    feedbackEl.classList.remove("hidden");
    progressFill.style.width = `${((index + 1) / questions.length) * 100}%`;
  }

  // Fly the chosen tile into the "?" hole, then reveal the completed picture.
  function animateFill(btn) {
    const q = questions[index];
    const svgEl = stimulusEl.querySelector("svg");
    if (!q.solved || !q.hole || !q.vb || !svgEl) {
      if (q.solved) stimulusEl.innerHTML = q.solved;
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

    // next frame: animate toward the hole position & size
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
      stimulusEl.innerHTML = q.solved; // reveal completed picture beneath
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

    const ratio = score / total;
    const filled = Math.max(1, Math.round(ratio * 5));
    let starsHtml = "";
    for (let i = 0; i < 5; i++) starsHtml += i < filled ? "⭐" : "☆";
    $("stars").textContent = starsHtml;

    const emoji = ratio >= 0.8 ? "🏆" : ratio >= 0.5 ? "🎉" : "🌱";
    $("result-emoji").textContent = emoji;
    if (ratio >= 0.8) burst(true);

    const msg =
      ratio >= 0.8
        ? `Amazing! You got ${score} out of ${total} right!`
        : ratio >= 0.5
        ? `Great job! You got ${score} out of ${total} right!`
        : `Good try! You got ${score} out of ${total}. Let's play again!`;
    speak(msg);
  }

  // tiny confetti burst for correct answers / great score
  function burst(big) {
    const n = big ? 18 : 8;
    const colors = ["#ff5a5f", "#3d8bfd", "#ffd23f", "#2ec27e", "#9b5de5", "#ff924c"];
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "confetti";
      p.style.left = 50 + (Math.random() * 40 - 20) + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.2 + "s";
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  // wire up buttons
  $("start-btn").addEventListener("click", startGame);
  $("restart-btn").addEventListener("click", startGame);
  nextBtn.addEventListener("click", () => {
    stopSpeaking();
    next();
  });

  // re-read the current question on demand
  listenBtn.addEventListener("click", () => {
    if (questions[index]) speak(questions[index].prompt);
  });

  // sound on/off (remembered between visits)
  updateSoundUI();
  $("sound-toggle").addEventListener("click", () => {
    soundOn = !soundOn;
    localStorage.setItem("nnat-sound", soundOn ? "on" : "off");
    if (!soundOn) stopSpeaking();
    updateSoundUI();
    if (soundOn && questions[index] && !quizScreen.classList.contains("hidden")) {
      speak(questions[index].prompt);
    }
  });

  // keyboard: 1-4 to answer, Enter/Space for next
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
