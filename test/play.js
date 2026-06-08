// Play the game like a user and report anything that looks wrong.
const H = require("./harness");
const { visibleScreen, click } = H;
const _envs = [];
function launch(opts) {
  const e = H.launch(opts);
  _envs.push(e);
  return e;
}

const findings = [];
function note(msg) {
  findings.push(msg);
  console.log("  ⚠ " + msg);
}
function ok(msg) {
  console.log("  ✓ " + msg);
}

// Wait for pending timers (animateFill uses 620ms; speak uses 0ms).
function tick(window, ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function playGame(env, strategy) {
  const { window, document, decks } = env;
  const $ = (id) => document.getElementById(id);

  click(window, $("start-btn"));
  if (visibleScreen(document) !== "quiz-screen") {
    note(`After Start, expected quiz-screen but got ${visibleScreen(document)}`);
    return null;
  }
  const count = parseInt($("q-total").textContent, 10);
  let expectedScore = 0;
  let expScreenTotal = count;

  for (let i = 0; i < count; i++) {
    // sanity: progress text
    if ($("q-current").textContent !== String(i + 1)) {
      note(`Q${i + 1}: progress shows ${$("q-current").textContent}`);
    }
    const opts = Array.from($("options").children);
    if (opts.length !== 5) note(`Q${i + 1}: expected 5 options, got ${opts.length}`);

    // read the LIVE current question (adaptive may have swapped it in)
    const ans = env.live.q.answer;
    let choiceIdx;
    if (strategy === "correct") choiceIdx = ans;
    else if (strategy === "wrong") choiceIdx = (ans + 1) % 5;
    else choiceIdx = i % 5; // mixed

    const correct = choiceIdx === ans;
    if (correct) expectedScore++;

    click(window, opts[choiceIdx]);

    // feedback should be visible, and the correct option marked
    if ($("feedback").classList.contains("hidden")) note(`Q${i + 1}: feedback not shown after answering`);
    const markedCorrect = opts.findIndex((o) => o.classList.contains("correct"));
    if (markedCorrect !== ans) note(`Q${i + 1}: correct marker on ${markedCorrect}, expected ${ans}`);

    await tick(window, 700); // let animateFill resolve

    // next
    click(window, $("next-btn"));
  }

  if (visibleScreen(document) !== "result-screen") {
    note(`After last question, expected result-screen, got ${visibleScreen(document)}`);
  }
  const shownScore = parseInt($("final-score").textContent, 10);
  const shownTotal = parseInt($("final-total").textContent, 10);
  if (shownScore !== expectedScore) note(`Result score ${shownScore} != expected ${expectedScore}`);
  if (shownTotal !== expScreenTotal) note(`Result total ${shownTotal} != ${expScreenTotal}`);

  return { expectedScore, count };
}

(async function main() {
  // ---- Playthrough 1: a kid who answers everything correctly (count 10) ----
  console.log("\n[Playthrough 1] All-correct, default count");
  let env = launch();
  let r = await playGame(env, "correct");
  if (r) {
    const stars = env.document.getElementById("stars").textContent;
    ok(`score ${r.expectedScore}/${r.count}, stars "${stars}", title "${env.document.getElementById("result-title").textContent}"`);
    if (!stars.includes("⭐")) note("All-correct game shows no gold stars");
    const bestLine = env.document.getElementById("best-streak-line");
    if (bestLine.classList.contains("hidden")) note("Best-streak line hidden despite a 10-streak");
  }

  // ---- Playthrough 2: all wrong ----
  console.log("\n[Playthrough 2] All-wrong, default count");
  env = launch();
  r = await playGame(env, "wrong");
  if (r) {
    const stars = env.document.getElementById("stars").textContent;
    ok(`score ${r.expectedScore}/${r.count}, stars "${stars}", title "${env.document.getElementById("result-title").textContent}"`);
    if (r.expectedScore !== 0) note("Wrong strategy did not yield 0");
    if (stars.includes("⭐")) note("0-score still shows a gold star");
  }

  // ---- Playthrough 3: mixed, check progress dashboard ----
  console.log("\n[Playthrough 3] Mixed answers, then open Progress");
  env = launch();
  await playGame(env, "mixed");
  const d = env.document;
  click(env.window, d.getElementById("open-progress-2"));
  if (visibleScreen(d) !== "progress-screen") note(`Open progress from results -> ${visibleScreen(d)}`);
  else {
    const cards = d.querySelectorAll("#stat-summary .stat-card").length;
    if (cards !== 5) note(`Expected 5 summary cards, got ${cards}`);
    const bars = d.querySelectorAll("#type-bars .bar-row").length;
    if (bars !== 4) note(`Expected 4 type bars, got ${bars}`);
    ok(`Progress: ${cards} cards, ${bars} type bars, recent rows ${d.querySelectorAll("#recent-list .recent-row").length}`);
  }

  // ---- Playthrough 4: settings round-trip + persistence ----
  console.log("\n[Playthrough 4] Settings changes persist");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  if (visibleScreen(env.document) !== "settings-screen") note("Open settings failed");
  // Level C unlocks spatial; choose 20 questions, only spatial
  click(env.window, env.document.querySelector('#set-level [data-level="C"]'));
  click(env.window, env.document.querySelector('#set-count [data-count="20"]'));
  env.document.querySelectorAll("#set-types .chip").forEach((c) => {
    if (c.dataset.type !== "spatial" && c.classList.contains("active")) click(env.window, c);
  });
  const saved = JSON.parse(env.window.localStorage.getItem("nnat-settings"));
  if (saved.level !== "C") note(`level not saved (got ${saved.level})`);
  if (saved.count !== 20) note(`count not saved (got ${saved.count})`);
  if (!(saved.types.length === 1 && saved.types[0] === "spatial")) note(`types not saved: ${JSON.stringify(saved.types)}`);
  else ok(`settings saved: count=${saved.count}, types=${JSON.stringify(saved.types)}`);
  // cannot disable the last type
  click(env.window, env.document.querySelector('#set-types [data-type="spatial"]'));
  const saved2 = JSON.parse(env.window.localStorage.getItem("nnat-settings"));
  if (saved2.types.length === 0) note("Was able to disable ALL puzzle types");
  else ok("Last puzzle type cannot be turned off");

  // start a game with these settings → all spatial, 20
  click(env.window, env.document.getElementById("settings-done"));
  click(env.window, env.document.getElementById("start-btn"));
  const deck = env.decks[env.decks.length - 1];
  const total = parseInt(env.document.getElementById("q-total").textContent, 10);
  const types = new Set(deck.slice(0, total).map((q) => q.type));
  if (total !== 20) note(`Expected 20 questions, got ${total}`);
  if (!(types.size === 1 && types.has("Spatial Visualization"))) note(`Expected only Spatial, got ${[...types]}`);
  else ok(`Game honored settings: ${total} questions, types ${[...types]}`);

  // ---- Playthrough 5: parent PIN lock ----
  console.log("\n[Playthrough 5] Parent PIN lock");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.getElementById("lock-set")); // -> set mode
  if (visibleScreen(env.document) !== "lock-screen") note("Set PIN did not open lock screen");
  ["1", "2", "3", "4"].forEach((k) => click(env.window, env.document.querySelector(`#keypad [data-k="${k}"]`)));
  await tick(env.window, 200);
  if (env.window.localStorage.getItem("nnat-pin") !== "1234") note("PIN not saved");
  else ok("PIN set to 1234, returned to settings: " + visibleScreen(env.document));
  // now opening progress should require the PIN
  click(env.window, env.document.getElementById("settings-done"));
  click(env.window, env.document.getElementById("open-progress"));
  if (visibleScreen(env.document) !== "lock-screen") note("Progress not gated by PIN");
  else ok("Progress is gated by PIN");
  // wrong pin shakes & stays
  ["0", "0", "0", "0"].forEach((k) => click(env.window, env.document.querySelector(`#keypad [data-k="${k}"]`)));
  await tick(env.window, 200);
  if (visibleScreen(env.document) !== "lock-screen") note("Wrong PIN let user through!");
  else ok("Wrong PIN rejected");
  // correct pin enters
  ["1", "2", "3", "4"].forEach((k) => click(env.window, env.document.querySelector(`#keypad [data-k="${k}"]`)));
  await tick(env.window, 200);
  if (visibleScreen(env.document) !== "progress-screen") note(`Correct PIN did not open progress (got ${visibleScreen(env.document)})`);
  else ok("Correct PIN opens Progress");

  // ---- Playthrough 6: quit mid-game via Home button ----
  console.log("\n[Playthrough 6] Quit mid-game with Home button");
  env = launch();
  click(env.window, env.document.getElementById("start-btn"));
  // answer 2 questions then bail
  for (let i = 0; i < 2; i++) {
    click(env.window, env.document.getElementById("options").children[0]);
    await tick(env.window, 700);
    click(env.window, env.document.getElementById("next-btn"));
  }
  click(env.window, env.document.getElementById("quit-btn"));
  if (visibleScreen(env.document) !== "start-screen") note(`Home button mid-game -> ${visibleScreen(env.document)}`);
  else ok("Home button returns to start mid-game");
  // can start a fresh game afterwards
  click(env.window, env.document.getElementById("start-btn"));
  if (visibleScreen(env.document) !== "quiz-screen") note("Cannot start a new game after quitting");
  else ok("Fresh game starts after quitting; q-current=" + env.document.getElementById("q-current").textContent);

  // ---- Playthrough 7: Progress 'Done' returns to where it was opened ----
  console.log("\n[Playthrough 7] Progress Done returns to origin");
  env = launch();
  await playGame(env, "mixed"); // now on results
  click(env.window, env.document.getElementById("open-progress-2"));
  click(env.window, env.document.getElementById("progress-done"));
  if (visibleScreen(env.document) !== "result-screen") note(`Progress Done from results -> ${visibleScreen(env.document)} (expected result-screen)`);
  else ok("Progress Done returns to results when opened from results");
  // opened from start returns to start
  click(env.window, env.document.getElementById("restart-btn")); // -> start
  click(env.window, env.document.getElementById("open-progress"));
  click(env.window, env.document.getElementById("progress-done"));
  if (visibleScreen(env.document) !== "start-screen") note(`Progress Done from start -> ${visibleScreen(env.document)}`);
  else ok("Progress Done returns to start when opened from start");

  // ---- Playthrough 8: Listen button hidden when read-aloud is off ----
  console.log("\n[Playthrough 8] Listen button visibility follows voice setting");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  // turn voice off
  click(env.window, env.document.querySelector('#set-voice [data-voice="off"]'));
  click(env.window, env.document.getElementById("settings-done"));
  click(env.window, env.document.getElementById("start-btn"));
  let listen = env.document.getElementById("listen-btn");
  if (listen.style.display !== "none") note("Listen button still visible with voice off");
  else ok("Listen hidden when read-aloud off");
  // back home, turn voice on, listen should reappear
  click(env.window, env.document.getElementById("quit-btn"));
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.querySelector('#set-voice [data-voice="on"]'));
  click(env.window, env.document.getElementById("settings-done"));
  click(env.window, env.document.getElementById("start-btn"));
  listen = env.document.getElementById("listen-btn");
  if (listen.style.display === "none") note("Listen button stays hidden after turning voice on");
  else ok("Listen visible when read-aloud on");

  // ---- Playthrough 9: levels gate item types correctly ----
  console.log("\n[Playthrough 9] Levels unlock the right item types");
  const expectByLevel = {
    A: new Set(["Pattern Completion", "Reasoning by Analogy"]),
    B: new Set(["Pattern Completion", "Reasoning by Analogy", "Serial Reasoning"]),
    C: new Set(["Pattern Completion", "Reasoning by Analogy", "Serial Reasoning", "Spatial Visualization"]),
  };
  for (const L of ["A", "B", "C"]) {
    env = launch();
    click(env.window, env.document.getElementById("open-settings"));
    click(env.window, env.document.querySelector(`#set-level [data-level="${L}"]`));
    click(env.window, env.document.querySelector('#set-count [data-count="48"]'));
    click(env.window, env.document.getElementById("settings-done"));
    click(env.window, env.document.getElementById("start-btn"));
    const dk = env.decks[env.decks.length - 1];
    const tot = parseInt(env.document.getElementById("q-total").textContent, 10);
    const tset = new Set(dk.slice(0, tot).map((q) => q.type));
    const within = [...tset].every((t) => expectByLevel[L].has(t));
    // serial must NOT appear in A; spatial must NOT appear in A or B
    const leak = (L === "A" && (tset.has("Serial Reasoning") || tset.has("Spatial Visualization"))) ||
      (L === "B" && tset.has("Spatial Visualization"));
    if (!within || leak) note(`Level ${L} produced types ${[...tset]}`);
    else ok(`Level ${L}: ${[...tset].length} types, all allowed`);
  }

  // ---- Playthrough 10: per-question timer is recorded ----
  console.log("\n[Playthrough 10] Timing recorded per type");
  env = launch();
  await playGame(env, "mixed");
  const st = JSON.parse(env.window.localStorage.getItem("nnat-stats"));
  if (!(st.totalMs >= 0 && typeof st.totalMs === "number")) note("totalMs not tracked");
  const anyTypeMs = Object.values(st.byType).some((d) => d.a > 0 && typeof d.ms === "number");
  if (!anyTypeMs) note("per-type ms not tracked");
  else ok(`timing tracked: totalMs=${Math.round(st.totalMs)}, byType ms present`);
  click(env.window, env.document.getElementById("open-progress-2"));
  const avgCard = [...env.document.querySelectorAll("#stat-summary .stat-card")].some((c) =>
    c.textContent.includes("Avg time")
  );
  if (!avgCard) note("Avg time card missing on Progress");
  else ok("Avg time card shown on Progress");

  // ---- Playthrough 11: all-wrong at Level C still completes at right count ----
  console.log("\n[Playthrough 11] Adaptive follow-ups keep the game stable");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.querySelector('#set-level [data-level="C"]'));
  click(env.window, env.document.querySelector('#set-count [data-count="20"]'));
  click(env.window, env.document.getElementById("settings-done"));
  // play 20 all-wrong (triggers scheduleSimilar repeatedly)
  click(env.window, env.document.getElementById("start-btn"));
  let answered = 0;
  for (let i = 0; i < 20; i++) {
    const optsEl = env.document.getElementById("options");
    if (!optsEl.children.length) break;
    // click option 0 then, if it was correct, it still counts; we just need to advance
    click(env.window, optsEl.children[0]);
    answered++;
    await tick(env.window, 60);
    click(env.window, env.document.getElementById("next-btn"));
  }
  if (answered !== 20) note(`Adaptive run answered ${answered} (expected 20)`);
  if (visibleScreen(env.document) !== "result-screen") note(`Adaptive run ended on ${visibleScreen(env.document)}`);
  else ok(`Adaptive run completed all 20 and reached results`);

  // ---- Playthrough 12: home-screen Level chooser unlocks the other types ----
  console.log("\n[Playthrough 12] Home Level chooser");
  env = launch();
  // default level A → only 2 types
  const homeA = env.document.querySelector("#home-level .chip.active");
  if (!homeA || homeA.dataset.level !== "A") note(`Home level not A by default (got ${homeA && homeA.dataset.level})`);
  // pick Level C on the start screen
  click(env.window, env.document.querySelector('#home-level [data-level="C"]'));
  const sv = JSON.parse(env.window.localStorage.getItem("nnat-settings"));
  if (sv.level !== "C") note(`Home level pick did not save C (got ${sv.level})`);
  if (sv.types.length !== 4) note(`Level C should enable 4 types, got ${sv.types.length}`);
  // and it should reflect in Settings too
  click(env.window, env.document.getElementById("open-settings"));
  const setC = env.document.querySelector("#set-level .chip.active");
  if (!setC || setC.dataset.level !== "C") note("Settings level not synced to C");
  click(env.window, env.document.getElementById("settings-done"));
  // starting now should include Serial + Spatial
  click(env.window, env.document.getElementById("start-btn"));
  const dk = env.decks[env.decks.length - 1];
  const tot = parseInt(env.document.getElementById("q-total").textContent, 10);
  const tset = new Set(dk.slice(0, tot).map((q) => q.type));
  if (!tset.has("Serial Reasoning") || !tset.has("Spatial Visualization"))
    note(`Level C from home missing types: ${[...tset]}`);
  else ok(`Home Level C unlocks all four types: ${[...tset].length} present`);

  // no runtime errors should have surfaced in any handler across all sessions
  const runtimeErrors = _envs.reduce((a, e) => a.concat(e.errors || []), []);
  if (runtimeErrors.length) note("runtime errors: " + runtimeErrors.slice(0, 6).join(" | "));
  else ok(`no runtime errors across ${_envs.length} sessions`);

  console.log(`\n=== ${findings.length} finding(s) ===`);
  findings.forEach((f) => console.log(" - " + f));
  process.exit(0);
})();
