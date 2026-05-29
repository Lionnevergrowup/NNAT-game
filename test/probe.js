// Edge-case probes beyond the happy-path playthrough.
const { launch, visibleScreen, click } = require("./harness");
const findings = [];
const note = (m) => (findings.push(m), console.log("  ⚠ " + m));
const ok = (m) => console.log("  ✓ " + m);
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function playAll(env, strategy) {
  const d = env.document;
  click(env.window, d.getElementById("start-btn"));
  const deck = env.decks[env.decks.length - 1];
  const total = parseInt(d.getElementById("q-total").textContent, 10);
  const qs = deck.slice(0, total);
  return (async () => {
    for (let i = 0; i < total; i++) {
      const ans = qs[i].answer;
      const idx = strategy === "correct" ? ans : strategy === "wrong" ? (ans + 1) % 4 : i % 4;
      click(env.window, d.getElementById("options").children[idx]);
      await tick(50);
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
  const other = env.document.getElementById("options").children[(ans0 + 1) % 4];
  click(env.window, other);
  if (env.document.getElementById("score").textContent !== "1") note("Post-answer click changed score");
  else ok("Locked after first answer");

  // Probe 2: defaults render active in Settings
  console.log("\n[Probe 2] Settings reflect current values");
  env = launch();
  click(env.window, env.document.getElementById("open-settings"));
  const activeCount = env.document.querySelector("#set-count .chip.active");
  const activeTypes = env.document.querySelectorAll("#set-types .chip.active").length;
  const voiceOn = env.document.querySelector('#set-voice [data-voice="on"]').classList.contains("active");
  const speedNormal = env.document.querySelector('#set-speed [data-speed="normal"]').classList.contains("active");
  if (!activeCount || activeCount.dataset.count !== "10") note("Default count chip not active=10");
  if (activeTypes !== 4) note(`Default active types=${activeTypes} (expected 4)`);
  if (!voiceOn) note("Voice not shown On by default");
  if (!speedNormal) note("Speed not shown Normal by default");
  if (activeCount && activeCount.dataset.count === "10" && activeTypes === 4 && voiceOn && speedNormal)
    ok("Defaults render correctly (10, 4 types, voice On, Normal)");

  // Probe 3: only-one-type game leaves other types at "—" in progress
  console.log("\n[Probe 3] Untouched type shows —");
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
  const dashed = bars.filter((b) => b.querySelector(".bar-val").textContent.trim() === "—").length;
  if (dashed !== 3) note(`Expected 3 untouched type bars showing —, got ${dashed}`);
  else ok("Untouched puzzle types correctly show — (played only Patterns)");

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

  console.log(`\n=== ${findings.length} finding(s) ===`);
  findings.forEach((f) => console.log(" - " + f));
})();
