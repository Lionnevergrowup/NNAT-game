// Sound regression tests. The old stubs never failed, so they could not catch
// real-device silence. These drive realistic failure modes: a context that starts
// suspended/interrupted, resume() that rejects or hangs, a frozen clock, speech
// that is busy/dropped/never starts, no English voice, backgrounding, etc.
const H = require("./harness");
const { click, sleep } = H;

const _envs = [];
function launch(opts) {
  const e = H.launch(opts);
  _envs.push(e);
  return e;
}
const findings = [];
const note = (m) => (findings.push(m), console.log("  ⚠ " + m));
const ok = (m) => console.log("  ✓ " + m);

// a plain user gesture anywhere on the page
const tap = (env, el) => click(env.window, el || env.document.body);
const quiet = JSON.stringify({ count: 24, level: "A", types: ["pattern", "analogy"], forced24: true, voice: true, sfx: true });
const withSettings = (extra) => ({ "nnat-settings": JSON.stringify(Object.assign(JSON.parse(quiet), extra || {})) });
const state = (env) => env.audioCtxs.map((c) => c.state).join(",");

(async function () {
  // ---- 1. baseline: start speaks the prompt; a correct answer makes tones + speaks ----
  console.log("\n[Sound 1] Baseline play makes speech and tones");
  let env = launch();
  click(env.window, env.document.getElementById("start-btn"));
  if (!env.spoken.length) note("Start did not speak the question");
  const a = env.live.q.answer;
  click(env.window, env.document.getElementById("options").children[a]);
  await sleep(150); // prompt may still be speaking → feedback waits ~80ms after the cancel
  const osc = env.audioCtxs.reduce((n, c) => n + c.oscStarts, 0);
  if (osc < 1) note("Correct answer produced no tone");
  if (env.audioCtxs.length !== 1) note(`Expected 1 AudioContext after first play, got ${env.audioCtxs.length}`);
  if (env.spoken.length < 2) note("Feedback was not spoken");
  if (osc >= 1 && env.audioCtxs.length === 1 && env.spoken.length >= 2) ok(`speech x${env.spoken.length}, tones x${osc}, 1 context`);

  // ---- 2. iOS audio session ----
  console.log("\n[Sound 2] 'playback' audio session follows the setting");
  env = launch({ audioSession: { type: "auto" } });
  if (env.window.navigator.audioSession.type !== "playback") note("audioSession not claimed as playback by default");
  click(env.window, env.document.querySelector('#set-loud [data-loud="off"]'));
  if (env.window.navigator.audioSession.type !== "auto") note("Turning 'play when muted' off did not release playback");
  click(env.window, env.document.querySelector('#set-loud [data-loud="on"]'));
  if (env.window.navigator.audioSession.type !== "playback") note("Turning it back on did not reclaim playback");
  else ok("playback claimed by default; off→auto; on→playback");
  env = launch({ audioSession: { type: "auto" }, localStorage: withSettings({ loud: false }) });
  if (env.window.navigator.audioSession.type !== "auto") note("Saved loud:false was overridden at load");
  else ok("saved 'loud:false' respected at load");
  env = launch({ localStorage: withSettings() }); // no audioSession API at all
  click(env.window, env.document.getElementById("start-btn"));
  ok("no navigator.audioSession → no crash");

  // ---- 3. AudioContext recovery ----
  console.log("\n[Sound 3] AudioContext recovery");
  env = launch({ audio: { state: "suspended" } });
  tap(env, env.document.getElementById("start-btn"));
  await sleep(20);
  if (env.audioCtxs[0].resumeCalls < 1 || env.audioCtxs[0].state !== "running") note("suspended context not resumed on first tap");
  else ok("suspended → resumed on first tap");

  env = launch({ audio: { state: "interrupted" } });
  tap(env, env.document.getElementById("start-btn"));
  await sleep(20);
  if (env.audioCtxs[0].resumeCalls < 1 || env.audioCtxs[0].state !== "running") note("'interrupted' context was not resumed (old code only handled 'suspended')");
  else ok("'interrupted' → resumed");

  env = launch({ audio: { state: "suspended", resume: "reject" } });
  tap(env, env.document.getElementById("start-btn"));
  await sleep(30);
  tap(env);
  await sleep(30);
  if (env.audioCtxs.length < 2) note("rejected resume() did not trigger a rebuild on the next tap");
  else if (!env.audioCtxs[0].closed) note("old context not closed when rebuilding");
  else ok(`rejected resume() → rebuilt (${env.audioCtxs.length} contexts, old closed)`);

  env = launch({ audio: { state: "suspended", resume: "hang" } });
  tap(env, env.document.getElementById("start-btn"));
  await sleep(800);
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length < 2) note("hung resume() (iOS 26 bug) did not trigger a rebuild");
  else ok("hung resume() → rebuilt on the next tap");

  env = launch();
  tap(env, env.document.getElementById("start-btn"));
  env.audioCtxs[0].setState("interrupted");
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length < 2) note("context that became 'interrupted' was not rebuilt");
  else ok("running → 'interrupted' → rebuilt on the next tap");

  env = launch();
  tap(env, env.document.getElementById("start-btn"));
  env.audioCtxs[0].setState("closed");
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length < 2) note("OS-closed context was not rebuilt");
  else ok("closed by the OS → rebuilt");

  env = launch({ audio: { hasCreateBuffer: false } });
  tap(env, env.document.getElementById("start-btn"));
  ok("no createBuffer support → no crash");

  // ---- 4. speech engine ----
  console.log("\n[Sound 4] Speech engine handling");
  env = launch();
  tap(env, env.document.getElementById("start-btn"));
  await sleep(30); // first utterance ended
  const before = env.audioCtxs.length;
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length !== before) note("context churned just because speech finished (cold-start risk)");
  else ok("speech finished → warm context kept (no churn)");

  env = launch({ speech: { autoEnd: false } });
  tap(env, env.document.getElementById("start-btn"));
  const nb = env.audioCtxs.length;
  const uu = env.utterances[0];
  uu.onerror({ error: "canceled" });
  tap(env);
  if (env.audioCtxs.length !== nb) note("'canceled' error caused a rebuild");
  uu.onerror({ error: "synthesis-failed" });
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length <= nb) note("a real speech error did not refresh audio");
  else if (!/errors: synthesis-failed/.test((env.document.getElementById("open-settings").click(), env.document.getElementById("sound-check-result").textContent))) note("speech error not shown in Sound check");
  else ok("'canceled' ignored; real speech error → refresh + shown in Sound check");

  env = launch({ speech: { autoEnd: false } });
  tap(env, env.document.getElementById("start-btn")); // prompt "speaking" forever
  const n0 = env.speechLog.filter((x) => x.startsWith("speak:")).length;
  click(env.window, env.document.getElementById("listen-btn"));
  const immediately = env.speechLog.filter((x) => x.startsWith("speak:")).length;
  await sleep(160);
  const later = env.speechLog.filter((x) => x.startsWith("speak:")).length;
  const lastCancel = env.speechLog.lastIndexOf("cancel");
  const lastSpeak = env.speechLog.map((x, i) => (x.startsWith("speak:") ? i : -1)).filter((i) => i >= 0).pop();
  if (immediately !== n0) note("speak() was not delayed after a cancel (cancel→speak same tick drops audio on some WebKit)");
  else if (later !== n0 + 1) note("delayed speak() never ran");
  else if (lastCancel > lastSpeak) note("cancel came after speak");
  else ok("busy engine → cancel, brief wait, then speak");

  env = launch();
  tap(env, env.document.getElementById("start-btn"));
  await sleep(30);
  env.speechLog.length = 0;
  click(env.window, env.document.getElementById("listen-btn"));
  if (env.speechLog.includes("cancel")) note("idle engine was cancelled needlessly before speak()");
  else if (env.speechLog[0] === undefined || !env.speechLog[0].startsWith("speak:")) note("idle speak() did not happen immediately");
  else if (env.speechLog[1] !== "resume") note("resume() was not called after speak() (un-pauses a wedged iOS queue)");
  else ok("idle engine → speak immediately (gesture kept), then resume()");

  env = launch({ speech: { voices: [{ name: "Anna", lang: "de-DE" }] } });
  tap(env, env.document.getElementById("start-btn"));
  if (!env.spoken.length || env.utterances[0].voice) note("a non-English voice was selected");
  else if (env.utterances[0].lang !== "en-US") note("utterance lang is not en-US");
  else ok("only a German voice → no voice assigned, lang en-US, still speaks");

  env = launch({ speech: { voices: [{ name: "Zarvox", lang: "en-US" }, { name: "Anna", lang: "de-DE" }, { name: "Samantha", lang: "en-US" }] } });
  tap(env, env.document.getElementById("start-btn"));
  if (!env.utterances[0].voice || env.utterances[0].voice.name !== "Samantha") note(`expected Samantha, got ${env.utterances[0].voice && env.utterances[0].voice.name}`);
  else ok("skips novelty/non-English voices → Samantha");

  env = launch({ speech: { voices: [] } });
  tap(env, env.document.getElementById("start-btn"));
  if (!env.spoken.length) note("no voices at all: nothing was spoken (should use the default voice)");
  else ok("zero voices → speaks with the default voice");

  env = launch({ speech: { throwOnSpeak: true } });
  tap(env, env.document.getElementById("start-btn"));
  click(env.window, env.document.getElementById("open-settings"));
  const errTxt = env.document.getElementById("sound-check-result").textContent;
  if (env.errors.length) note("speak() throwing escaped as an uncaught error: " + env.errors[0]);
  else if (!/errors:/.test(errTxt)) note("speech failure not shown in Sound check");
  else ok("speak() throwing is contained and shown in Sound check");

  env = launch({ speech: { autoStart: false, autoEnd: false } });
  tap(env, env.document.getElementById("start-btn"));
  const r0 = env.synthState.resumeCalls;
  await sleep(800);
  if (env.synthState.resumeCalls <= r0) note("no resume() nudge when speech never starts");
  else ok("speech that never starts is nudged once with resume()");

  // ---- 5. backgrounding ----
  console.log("\n[Sound 5] Background / foreground recovery");
  env = launch();
  tap(env, env.document.getElementById("start-btn"));
  await sleep(30);
  Object.defineProperty(env.document, "hidden", { configurable: true, get: () => true });
  const c0 = env.synthState.cancelCalls;
  env.document.dispatchEvent(new env.window.Event("visibilitychange"));
  if (env.synthState.cancelCalls <= c0) note("going to background did not stop speech");
  Object.defineProperty(env.document, "hidden", { configurable: true, get: () => false });
  const n1 = env.audioCtxs.length;
  env.document.dispatchEvent(new env.window.Event("visibilitychange"));
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length <= n1) note("audio not rebuilt after returning to the app");
  else ok("background → speech stopped; foreground → audio rebuilt on the next tap");
  const n2 = env.audioCtxs.length;
  env.window.dispatchEvent(new env.window.Event("pageshow"));
  tap(env);
  await sleep(20);
  if (env.audioCtxs.length <= n2) note("pageshow did not trigger a rebuild");
  else ok("pageshow → rebuilt on the next tap");

  // ---- 6. Sound check panel ----
  console.log("\n[Sound 6] Sound check panel");
  env = launch({ localStorage: withSettings({ sfx: false, voice: false }) });
  click(env.window, env.document.getElementById("open-settings"));
  const panel = () => env.document.getElementById("sound-check-result").textContent;
  if (!/not started yet/.test(panel())) note("Initial panel should say effects have not started");
  click(env.window, env.document.getElementById("test-chime"));
  await sleep(650);
  const tonesNow = env.audioCtxs.reduce((n, c) => n + c.oscStarts, 0);
  if (tonesNow < 1) note("Chime test must play even when Fun sounds are Off");
  else if (!/Effects: running/.test(panel()) || !/clock running/.test(panel())) note("Panel did not report running + clock running: " + panel());
  else ok("Chime test works with Fun sounds Off; panel: running, clock running");
  click(env.window, env.document.getElementById("test-voice"));
  await sleep(950);
  if (!env.spoken.some((t) => /Sound check/.test(t))) note("Voice test must speak even when read-aloud is Off");
  else if (!/Voice: 1 English voice · using Samantha · started 1/.test(panel())) note("Panel voice line wrong: " + panel());
  else ok("Voice test works with read-aloud Off; panel shows voice + counts");
  if (!/Opened as: browser tab/.test(panel())) note("Panel missing 'Opened as' line");
  if (!/Heard nothing\?/.test(panel())) note("Panel missing the troubleshooting hint");

  env = launch({ audio: { frozen: true }, audioSession: { type: "auto" }, speech: { voices: [] }, localStorage: withSettings() });
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.getElementById("test-chime"));
  await sleep(650);
  const bad = env.document.querySelectorAll("#sound-check-result .diag-bad").length;
  if (!/clock frozen/.test(env.document.getElementById("sound-check-result").textContent) || bad < 1) note("Frozen clock not flagged as a problem");
  else ok("frozen audio clock is flagged in red");
  if (!/0 English voices/.test(env.document.getElementById("sound-check-result").textContent)) note("Zero voices not reported");
  if (!/Audio channel: playback \(plays even when muted\)/.test(env.document.getElementById("sound-check-result").textContent)) note("Audio channel line wrong");
  else ok("panel reports audio channel + zero voices");

  env = launch({ localStorage: withSettings() });
  click(env.window, env.document.getElementById("open-settings"));
  if (!/not supported here/.test(env.document.getElementById("sound-check-result").textContent)) note("Missing 'not supported' audio-channel note");
  else ok("no audioSession API → panel says so");

  // ---- 7. gesture wake rules ----
  console.log("\n[Sound 7] Wake on any gesture; stay quiet when sound is off");
  env = launch({ audio: { state: "suspended" } });
  env.document.querySelector('#home-level [data-level="B"]').dispatchEvent(new env.window.Event("touchend", { bubbles: true }));
  await sleep(20);
  if (!env.audioCtxs.length || env.audioCtxs[0].resumeCalls < 1) note("touchend on a normal control did not wake audio");
  else ok("touchend anywhere wakes the audio engine");
  env = launch({ localStorage: withSettings({ voice: false, sfx: false }) });
  tap(env);
  if (env.audioCtxs.length) note("audio engine created although voice and sounds are both Off");
  else ok("voice+sfx Off → no audio engine created");

  // ---- 8. normal play respects Fun sounds Off ----
  console.log("\n[Sound 8] Fun sounds Off silences effects in play");
  env = launch({ localStorage: withSettings({ sfx: false }) });
  click(env.window, env.document.getElementById("start-btn"));
  click(env.window, env.document.getElementById("options").children[env.live.q.answer]);
  await sleep(30);
  const o2 = env.audioCtxs.reduce((n, c) => n + c.oscStarts, 0);
  if (o2 !== 0) note("tones played although Fun sounds are Off");
  else ok("sfx Off → no tones in play (speech still allowed)");

  // ---- 9. audio-element engine ----
  console.log("\n[Sound 9] Audio-element effects engine");
  env = launch({ standalone: true, localStorage: withSettings() });
  click(env.window, env.document.getElementById("start-btn"));
  click(env.window, env.document.getElementById("options").children[env.live.q.answer]);
  await sleep(150);
  const wavs = env.audioEls.filter((u) => u.startsWith("data:audio/wav;base64,UklGR"));
  if (!wavs.length) note("Home-Screen mode: effects did not use the audio element");
  else if (env.audioCtxs.reduce((n, c) => n + c.oscStarts, 0) !== 0) note("Both engines played (double sound)");
  else ok(`Home-Screen app → audio element engine (${wavs.length} wav), no Web Audio tones`);
  env = launch({ localStorage: withSettings({ engine: "element" }) });
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.getElementById("test-chime"));
  await sleep(100);
  if (!env.audioEls.length) note("engine=element in a tab did not use the audio element");
  else if (!/Effects engine: audio element \(element\)/.test(env.document.getElementById("sound-check-result").textContent)) note("panel does not show the engine");
  else ok("engine=element forced in a tab; panel shows it");
  env = launch({ standalone: true, localStorage: withSettings({ engine: "webaudio" }) });
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.getElementById("test-chime"));
  await sleep(100);
  if (env.audioEls.length || env.audioCtxs.reduce((n, c) => n + c.oscStarts, 0) < 1) note("engine=webaudio override ignored in Home-Screen mode");
  else ok("engine=webaudio override respected even in Home-Screen mode");

  // ---- 10. recorded speech ----
  console.log("\n[Sound 10] Recorded speech clips");
  const fs = require("fs"), pth = require("path");
  const root = pth.join(__dirname, "..");
  env = launch({ clips: true });
  click(env.window, env.document.getElementById("start-btn"));
  await sleep(30);
  const clipUrl = env.audioEls.find((u) => /^speech\/[0-9a-f]{10}\.wav$/.test(u));
  if (!clipUrl) note("question prompt was not played from a recorded clip");
  else if (!fs.existsSync(pth.join(root, clipUrl))) note("clip file missing on disk: " + clipUrl);
  else if (env.spoken.length) note("system voice used although a clip exists");
  else ok("prompt plays from a recorded clip (" + clipUrl + "), system voice untouched");
  env = launch({ clips: true, localStorage: withSettings({ voiceEngine: "system" }) });
  click(env.window, env.document.getElementById("start-btn"));
  if (!env.spoken.length || env.audioEls.some((u) => /^speech\//.test(u))) note("voiceEngine=system must use the system voice");
  else ok("voiceEngine=system → system voice");
  env = launch({ clips: true });
  click(env.window, env.document.getElementById("open-settings"));
  click(env.window, env.document.getElementById("test-voice"));
  await sleep(950);
  if (!env.audioEls.some((u) => /^speech\//.test(u))) note("Voice test did not use a clip");
  else if (!/Voice engine: recorded clips · played 1/.test(env.document.getElementById("sound-check-result").textContent)) note("panel missing recorded-voice line");
  else ok("Voice test plays a clip and the panel shows it");
  env = launch({ clips: true, localStorage: withSettings({ voice: false }) });
  click(env.window, env.document.getElementById("start-btn"));
  if (env.audioEls.some((u) => /^speech\//.test(u))) note("clip played with read-aloud Off");
  else ok("read-aloud Off → no clips");
  // every sentence of full games must have a recording (no silent system-voice fallbacks)
  const clips = (() => { global.window = {}; require(pth.join(root, "speech", "clips.js")); return global.window.SPEECH_CLIPS; })();
  let missing = new Set(), spokenTotal = 0;
  for (const L of ["A", "B", "C"]) {
    env = launch({ clips: true, localStorage: withSettings({ level: L, types: ["pattern", "analogy", "serial", "spatial"], count: 24 }) });
    env.window.localStorage.setItem("nnat-settings", JSON.stringify(Object.assign(JSON.parse(quiet), { level: L, count: 24, types: undefined })));
    await sleep(5);
    click(env.window, env.document.querySelector('#home-level [data-level="' + L + '"]'));
    click(env.window, env.document.getElementById("start-btn"));
    for (let i = 0; i < 24; i++) {
      await H.answerOne(env, i % 3 === 0 ? "wrong" : "mixed", i);
      click(env.window, env.document.getElementById("next-btn"));
    }
    env.spoken.forEach((t) => { spokenTotal++; if (!clips[t]) missing.add(t); });
    env.audioEls.filter((u) => /^speech\//.test(u)).forEach((u) => { if (!fs.existsSync(pth.join(root, u))) missing.add("FILE " + u); });
  }
  if (missing.size) note("sentences without a recording: " + [...missing].slice(0, 5).join(" | "));
  else ok("3 full games (A/B/C): no system-voice fallbacks, all clip files exist");

  const runtimeErrors = _envs.reduce((acc, e) => acc.concat(e.errors || []), []);
  if (runtimeErrors.length) note("runtime errors: " + runtimeErrors.slice(0, 5).join(" | "));
  else ok(`no runtime errors across ${_envs.length} sessions`);

  console.log(`\n=== ${findings.length} finding(s) ===`);
  findings.forEach((f) => console.log(" - " + f));
  process.exit(findings.length ? 1 : 0);
})();
