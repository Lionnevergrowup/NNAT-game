// Collect every sentence the game can speak -> tools/phrases.json
const path = require("path"), fs = require("fs");
global.window = {};
require(path.join(__dirname, "..", "questions.js"));
const set = new Set();
["A", "B", "C"].forEach((L) => {
  for (let i = 0; i < 400; i++) window.NNAT.buildQuestions({ count: 48, level: L }).forEach((q) => set.add(q.prompt));
});
const fixed = [
  "Awesome!", "Great job!", "You got it!", "Nice work!", "Yes!", "Super!", "Brilliant!",
  "Not quite — try again!", "Almost! Pick another one.", "Good try! Have another go.",
  "That one does not fit. The glowing piece is right.",
  "Amazing! You did great!", "Great job! Keep it up!", "Good try! Let's play again!",
  "Hello! Let's play.", "This is my talking speed.", "Sound check. Can you hear me?",
];
for (let n = 3; n <= 48; n++) if (n === 3 || n % 5 === 0) fixed.push(n + " in a row!");
fixed.forEach((s) => set.add(s));
const list = [...set].sort();
fs.writeFileSync(path.join(__dirname, "phrases.json"), JSON.stringify(list, null, 1));
console.log(list.length + " phrases (" + (list.length - fixed.length) + " question prompts)");
