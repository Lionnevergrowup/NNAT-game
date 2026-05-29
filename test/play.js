// Play the game like a user and report anything that looks wrong.
const { launch, visibleScreen, click } = require("./harness");

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
  const deck = decks[decks.length - 1];
  const count = parseInt($("q-total").textContent, 10);
  const qs = deck.slice(0, count);

  let expectedScore = 0;
  let expScreenTotal = count;

  for (let i = 0; i < count; i++) {
    // sanity: progress text
    if ($("q-current").textContent !== String(i + 1)) {
      note(`Q${i + 1}: progress shows ${$("q-current").textContent}`);
    }
    const opts = Array.from($("options").children);
    if (opts.length !== 4) note(`Q${i + 1}: expected 4 options, got ${opts.length}`);

    const ans = qs[i].answer;
    let choiceIdx;
    if (strategy === "correct") choiceIdx = ans;
    else if (strategy === "wrong") choiceIdx = (ans + 1) % 4;
    else choiceIdx = i % 4; // mixed

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
  console.log("\n[Playthrough 1] All-correct, 10 questions");
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
  console.log("\n[Playthrough 2] All-wrong, 10 questions");
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
    if (cards !== 4) note(`Expected 4 summary cards, got ${cards}`);
    const bars = d.querySelectorAll("#type-bars .bar-row").length;
    if (bars !== 4) note(`Expected 4 type bars, got ${bars}`);
    ok(`Progress: ${cards} cards, ${bars} type bars, recent rows ${d.querySelectorAll("#recent-list .recent-row").length}`);
  }

  // ---- Playthrough 4: settings round-trip + persistence ----
  console.log("\n[Playthrough 4] Settings changes persist");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  if (visibleScreen(env.document) !== "settings-screen") note("Open settings failed");
  // choose 20 questions, only spatial
  click(env.window, env.document.querySelector('#set-count [data-count="20"]'));
  env.document.querySelectorAll("#set-types .chip").forEach((c) => {
    if (c.dataset.type !== "spatial" && c.classList.contains("active")) click(env.window, c);
  });
  const saved = JSON.parse(env.window.localStorage.getItem("nnat-settings"));
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

  console.log(`\n=== ${findings.length} finding(s) ===`);
  findings.forEach((f) => console.log(" - " + f));
  process.exit(0);
})();
