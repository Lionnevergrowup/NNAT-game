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

  const PRAISE = ["Awesome!", "Great job!", "You got it!", "Nice work!", "Yes! 🎉", "Super!"];
  const TRY_AGAIN = ["Good try!", "Almost!", "Keep going!"];

  function show(screen) {
    [startScreen, quizScreen, resultScreen].forEach((s) => s.classList.add("hidden"));
    screen.classList.remove("hidden");
  }

  function startGame() {
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
    } else {
      btn.classList.add("wrong");
      feedbackEmoji.textContent = "💡";
      feedbackText.textContent =
        TRY_AGAIN[Math.floor(Math.random() * TRY_AGAIN.length)] + " The glowing one was right.";
    }

    nextBtn.textContent = index === questions.length - 1 ? "See My Stars ⭐" : "Next ▶";
    feedbackEl.classList.remove("hidden");
    progressFill.style.width = `${((index + 1) / questions.length) * 100}%`;
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
  nextBtn.addEventListener("click", next);

  // keyboard: 1-4 to answer, Enter/Space for next
  document.addEventListener("keydown", (e) => {
    if (!quizScreen.classList.contains("hidden")) {
      if (!feedbackEl.classList.contains("hidden") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
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
