// Edge-case probes beyond the happy-path playthrough.
const H = require("./harness");
const { visibleScreen, click } = H;
const _envs = [];
function launch(opts) {
  const e = H.launch(opts);
  _envs.push(e);
  return e;
}
const findings = [];
const note = (m) => (findings.push(m), console.log("  ⚠ " + m));
const ok = (m) => console.log("  ✓ " + m);
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function playAll(env, strategy) {
  const d = env.document;
  click(env.window, d.getElementById("start-btn"));
  const total = parseInt(d.getElementById("q-total").textContent, 10);
  return (async () => {
    for (let i = 0; i < total; i++) {
      await H.answerOne(env, strategy, i); // handles the two-attempt retry flow
      click(env.window, d.getElementById("next-btn"));
    }
  })();
}

(async function () {
  // Probe 1: double/triple click an option must not double-count score
  console.log("\n[Probe 1] Double-tap an answer");
  let env = launch();
  click(env.window, env.document.getElementById("start-btn"));
  let deck = env.decks[env.decks.length - 1];
  const ans0 = deck[0].answer;
  const opt = env.document.getElementById("options").children[ans0];
  click(env.window, opt);
  click(env.window, opt);
  click(env.window, opt);
  await tick(50);
  const sc = env.document.getElementById("score").textContent;
  if (sc !== "1") note(`Triple-tap correct gave score=${sc} (expected 1)`);
  else ok("Triple-tap counts once");
  // clicking a different (wrong) option after answering shouldn't change anything
  const other = env.document.getElementById("options").children[(ans0 + 1) % 5];
  click(env.window, other);
  if (env.document.getElementById("score").textContent !== "1") note("Post-answer click changed score");
  else ok("Locked after first answer");

  // Probe 2: defaults render active in Settings (Level A → 2 types visible)
  console.log("\n[Probe 2] Settings reflect current values");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  const activeLevel = env.document.querySelector("#set-level .chip.active");
  const activeCount = env.document.querySelector("#set-count .chip.active");
  const activeTypes = env.document.querySelectorAll("#set-types .chip.active").length;
  const hiddenTypes = [...env.document.querySelectorAll("#set-types .chip")].filter((c) =>
    c.classList.contains("hidden")
  ).length;
  const voiceOn = env.document.querySelector('#set-voice [data-voice="on"]').classList.contains("active");
  const speedNormal = env.document.querySelector('#set-speed [data-speed="normal"]').classList.contains("active");
  if (!activeLevel || activeLevel.dataset.level !== "A") note("Default level chip not active=A");
  if (!activeCount || activeCount.dataset.count !== "24") note("Default count chip not active=24");
  if (activeTypes !== 2) note(`Default active types=${activeTypes} (expected 2 at Level A)`);
  if (hiddenTypes !== 2) note(`Expected 2 hidden type chips at Level A, got ${hiddenTypes}`);
  if (!voiceOn) note("Voice not shown On by default");
  if (!speedNormal) note("Speed not shown Normal by default");
  if (activeLevel && activeCount && activeTypes === 2 && hiddenTypes === 2 && voiceOn && speedNormal)
    ok("Defaults render correctly (Level A, 24, 2 visible types, voice On, Normal)");

  // Probe 3: only-one-type game shows one bar; the rest are listed as "not practiced"
  console.log("\n[Probe 3] Only practiced types get a bar");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  env.document.querySelectorAll("#set-types .chip").forEach((c) => {
    if (c.dataset.type !== "pattern" && c.classList.contains("active")) click(env.window, c);
  });
  click(env.window, env.document.querySelector('#set-count [data-count="10"]'));
  click(env.window, env.document.getElementById("settings-done"));
  await playAll(env, "mixed");
  click(env.window, env.document.getElementById("open-progress-2"));
  const bars = Array.from(env.document.querySelectorAll("#type-bars .bar-row"));
  const noteTxt = env.document.getElementById("type-bars").textContent;
  if (bars.length !== 1) note(`Expected 1 bar (Patterns only), got ${bars.length}`);
  else if (!/Not practiced yet/.test(noteTxt)) note("Missing 'Not practiced yet' note");
  else if (!/Turns/.test(noteTxt) || !/Sequences/.test(noteTxt)) note("Untouched types not listed in note");
  else ok("Only Patterns charted; others listed as not practiced (Turns@C, Sequences@B)");

  // Probe 4: Reset stats -> empty state
  console.log("\n[Probe 4] Reset stats");
  click(env.window, env.document.getElementById("reset-stats")); // confirm() stubbed true
  const emptyHidden = env.document.getElementById("stats-empty").classList.contains("hidden");
  const typeHidden = env.document.getElementById("type-section").classList.contains("hidden");
  if (emptyHidden) note("Empty-state not shown after reset");
  if (!typeHidden) note("Type section still shown after reset");
  if (!emptyHidden && typeHidden) ok("Reset clears stats and shows empty state");
  if (env.window.localStorage.getItem("nnat-stats")) {
    const s = JSON.parse(env.window.localStorage.getItem("nnat-stats"));
    if (s.games !== 0 || s.answered !== 0) note("Stats not actually zeroed after reset");
  }

  // Probe 5: confetti OFF must not create .confetti and must not error
  console.log("\n[Probe 5] Confetti off");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.querySelector('#set-fx [data-fx="off"]'));
  click(env.window, env.document.getElementById("settings-done"));
  await playAll(env, "correct");
  const confetti = env.document.querySelectorAll(".confetti").length;
  if (confetti !== 0) note(`Confetti created (${confetti}) despite FX off`);
  else ok("No confetti when FX off; game finished on " + visibleScreen(env.document));

  // Probe 6: a wrong answer injects same-subtype follow-ups a few items later
  console.log("\n[Probe 6] Adaptive follow-ups after a wrong answer");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.querySelector('#set-level [data-level="C"]'));
  click(env.window, env.document.querySelector('#set-count [data-count="20"]'));
  click(env.window, env.document.getElementById("settings-done"));
  click(env.window, env.document.getElementById("start-btn"));
  const seq = [];
  const missed = { g: env.live.q.g, sub: env.live.q.sub };
  for (let i = 0; i < 6; i++) {
    seq.push({ g: env.live.q.g, sub: env.live.q.sub });
    // miss Q1 entirely (wrong both tries -> records wrong, triggers follow-ups);
    // answer the rest correctly on the first try
    await H.answerOne(env, i === 0 ? "wrong" : "correct", i);
    click(env.window, env.document.getElementById("next-btn"));
  }
  const matchAt2 = seq[2] && seq[2].g === missed.g && seq[2].sub === missed.sub;
  const matchAt4 = seq[4] && seq[4].g === missed.g && seq[4].sub === missed.sub;
  if (matchAt2 || matchAt4)
    ok(`Missed ${missed.g}:${missed.sub} → follow-ups injected at +2/+4 (` +
      `pos2=${seq[2].g}:${seq[2].sub}, pos4=${seq[4].g}:${seq[4].sub})`);
  else
    note(`No same-subtype follow-up after wrong answer (missed ${missed.g}:${missed.sub}; ` +
      `pos2=${seq[2].g}:${seq[2].sub}, pos4=${seq[4].g}:${seq[4].sub})`);

  // Probe 7: recent games show a timestamp, and old (no-ts) records still work
  console.log("\n[Probe 7] Recent-game timestamps + backward compatibility");
  // (a) a freshly played game shows a date header and NO time
  env = launch();
  await playAll(env, "mixed");
  click(env.window, env.document.getElementById("open-progress-2"));
  const recentList = env.document.getElementById("recent-list");
  if (recentList.querySelectorAll(".recent-time").length !== 0) note("Time shown though only date wanted");
  else if (!recentList.querySelector(".recent-date")) note("No date header shown for recent games");
  else ok("Recent games show date only (no time): " + recentList.querySelector(".recent-date").textContent);

  // (b) an old stats record saved WITHOUT a ts must render without crashing
  const legacy = {
    games: 1, answered: 10, correct: 6, stars: 4, bestStreak: 2, totalMs: 12000,
    byType: { "Pattern Completion": { a: 10, c: 6, ms: 12000 } },
    recent: [{ score: 6, total: 10, stars: 4 }], // no ts (legacy)
  };
  env = launch({ localStorage: { "nnat-stats": JSON.stringify(legacy) } });
  click(env.window, env.document.getElementById("open-progress"));
  const rl = env.document.getElementById("recent-list");
  if (!rl.textContent.includes("6 / 10")) note("Legacy recent record not rendered");
  else if (rl.querySelectorAll(".recent-time").length !== 0) note("Legacy record (no ts) showed a time");
  else if (!rl.textContent.includes("Earlier")) note("Legacy record not grouped under 'Earlier'");
  else ok("Legacy record (no ts) renders safely under 'Earlier' with no time");

  // Probe 8: one-time forced reset to 24 for existing users
  console.log("\n[Probe 8] Forced reset to 24 questions");
  // legacy settings with count 48 and no forced24 flag
  env = launch({ localStorage: { "nnat-settings": JSON.stringify({ count: 48, level: "A", types: ["pattern", "analogy"] }) } });
  let sv = JSON.parse(env.window.localStorage.getItem("nnat-settings"));
  if (sv.count !== 24) note(`Existing count 48 not forced to 24 (got ${sv.count})`);
  else if (!sv.forced24) note("forced24 flag not persisted");
  else ok("Existing user reset to 24 (flag persisted)");
  // after the forced reset the user can still choose a different count, and it sticks
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.querySelector('#set-count [data-count="48"]'));
  sv = JSON.parse(env.window.localStorage.getItem("nnat-settings"));
  if (sv.count !== 48) note("User change after reset did not persist");
  // a brand-new reload with that saved (forced24:true, count:48) must KEEP 48
  const env2 = launch({ localStorage: { "nnat-settings": JSON.stringify(sv) } });
  _envs.push(env2);
  const sv2 = JSON.parse(env2.window.localStorage.getItem("nnat-settings"));
  if (sv2.count !== 48) note(`Reset re-applied (should only happen once); got ${sv2.count}`);
  else ok("After the one-time reset, user's choice is respected on later loads");

  // Probe 9: retry flow — first wrong gives a second chance; stats keep the wrong
  console.log("\n[Probe 9] Retry on wrong answer + stats stay 'wrong'");
  env = launch();
  const d = env.document;
  const optsOf = () => d.getElementById("options").children;
  click(env.window, d.getElementById("start-btn"));
  // Q1: pick wrong first
  let ans = env.live.q.answer;
  const wrong1 = (ans + 1) % 5;
  click(env.window, optsOf()[wrong1]);
  await tick(30);
  if (d.getElementById("next-btn").style.display !== "none") note("Next not hidden during retry");
  if ([...optsOf()].some((o) => o.classList.contains("correct"))) note("Answer revealed on first wrong (should not)");
  if (!optsOf()[wrong1].disabled) note("Tried wrong option not disabled for the retry");
  // retry: pick correct
  click(env.window, optsOf()[ans]);
  await tick(700);
  if (!/got it/i.test(d.getElementById("feedback-text").textContent)) note("No 'You got it' on retry-correct");
  if (d.getElementById("score").textContent !== "0") note("Retry-correct incremented the score (should not)");
  let st = JSON.parse(env.window.localStorage.getItem("nnat-stats"));
  if (!(st.answered === 1 && st.correct === 0)) note(`Stats after retry-correct: a=${st.answered} c=${st.correct} (want 1/0)`);
  click(env.window, d.getElementById("next-btn"));
  // Q2: wrong twice -> reveal the answer
  ans = env.live.q.answer;
  click(env.window, optsOf()[(ans + 1) % 5]);
  await tick(30);
  click(env.window, optsOf()[(ans + 2) % 5]);
  await tick(700);
  const marked = [...optsOf()].findIndex((o) => o.classList.contains("correct"));
  if (marked !== ans) note("Answer not revealed after second wrong");
  st = JSON.parse(env.window.localStorage.getItem("nnat-stats"));
  if (!(st.answered === 2 && st.correct === 0)) note(`Stats after two wrongs: a=${st.answered} c=${st.correct} (want 2/0)`);
  ok("Retry checks done (first wrong recorded; retry-correct unscored; 2nd wrong reveals)");

  // Probe 10: tapping Next before the reveal animation finishes must not
  // overwrite the next question's picture (stale animateFill timeout)
  console.log("\n[Probe 10] Fast Next does not corrupt the next question");
  env = launch();
  const dd = env.document;
  click(env.window, dd.getElementById("start-btn"));
  const a0 = env.live.q.answer;
  click(env.window, dd.getElementById("options").children[a0]); // correct -> schedules a 620ms reveal
  click(env.window, dd.getElementById("next-btn")); // advance immediately (before 620ms)
  await tick(700); // let the stale reveal timeout fire
  const stim = dd.getElementById("stimulus").innerHTML;
  if (!stim.includes(">?<")) note("Stale reveal overwrote the next question's stimulus");
  else ok("Next question still shows its '?' after a fast Next");

  const runtimeErrors = _envs.reduce((a, e) => a.concat(e.errors || []), []);
  if (runtimeErrors.length) note("runtime errors: " + runtimeErrors.slice(0, 6).join(" | "));
  else ok(`no runtime errors across ${_envs.length} sessions`);

  console.log(`\n=== ${findings.length} finding(s) ===`);
  findings.forEach((f) => console.log(" - " + f));
})();
