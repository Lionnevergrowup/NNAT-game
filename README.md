# NNAT3 Level A — Practice Game 🧩

A free, kid-friendly web game for practicing **NNAT3® Level A** style nonverbal
reasoning. Questions are presented **one at a time** with instant feedback,
stars, and a final score. No reading required — great for ages 4–6.

> Not affiliated with or endorsed by NCS Pearson. "NNAT" is a trademark of its
> respective owner. This is an independent practice tool for educational use.

## Question types

The game covers all four NNAT3 item types, with the difficulty kept at Level A:

| Type | What the child does |
| --- | --- |
| **Pattern Completion** | A big picture has a missing square — pick the tile that completes the pattern (checkerboards, stripes, diagonals). |
| **Reasoning by Analogy** | Shapes change in a consistent way (color, size, or shape) across a small grid — pick the piece that follows the same rule. |
| **Serial Reasoning** | A row of pictures changes step by step (counting up, repeating colors, an arrow turning) — pick what comes next. |
| **Spatial Visualization** | A shape is turned (a quarter turn or flipped over) — pick the option that shows the same turn. |

Questions are **generated procedurally** from a large parameter space (shapes ×
colors × patterns × sizes × rotations × positions), so every round is different
and no puzzle repeats within a round. On the start screen you pick how many to
play: **10 / 20 / Half (24) / All (48)**.

When a child answers **correctly**, the chosen piece **slides into the empty "?"
spot** to reveal the completed picture. When they answer **incorrectly**, their
pick drops into the slot too — so they can see it does *not* fit — while the
correct option glows.

The layout fits on a single screen across phones and tablets, in both portrait
and landscape (no scrolling to reach the Next button).

## Settings page

A ⚙️ **Settings** button on the start screen opens a dedicated page where every
option lives (all choices are remembered between visits):

- **How many questions** — 10 / 20 / Half (24) / All (48).
- **Which puzzles** — turn each of the four puzzle types on or off (pick one or more).
- **Read questions aloud** — English text-to-speech on/off.
- **Voice speed** — 🐢 Slow / Normal / 🐇 Fast.
- **Fun sounds** — playful answer sound effects on/off.
- **Confetti & celebration** — turn the celebration effects on/off.

## Fun

- 🔥 **Streaks** — a streak counter appears for consecutive correct answers, with
  a little fanfare and extra confetti at milestones (3, 5, 10, …).
- 🎵 **Sound effects** — happy chimes for correct, a soft buzz for wrong, and a
  victory jingle on a great score (synthesised in the browser, no audio files).
- A bouncy mascot reaction and confetti bursts celebrate good answers.

## Progress dashboard

A 📊 **Progress** page (on the start and results screens) gives a parent/learner
view of play history, stored locally in the browser:

- Summary cards: games played, questions answered, overall accuracy, best streak.
- **Accuracy trend** — a small SVG line chart of accuracy over recent games.
- **Accuracy by puzzle type** bars for each of the four types.
- Recent games **grouped by date** (Today / Yesterday / date) with score and stars.
- A **Reset stats** button to clear the history.

### Parent lock 🔒

Set an optional 4-digit PIN (in Settings → Parent lock). When set, opening
**Settings** or **Progress** asks for the PIN first via a child-friendly keypad,
so little ones can't change settings or clear stats. Turn it off any time from
Settings. The PIN is stored locally in the browser.

## Audio (English read-aloud)

Every question is read aloud in English using the browser's built-in
text-to-speech, so pre-readers can play on their own. The 🔊/🔇 button in the top
bar is a quick mute; finer control (speed, effects) is on the Settings page.

## How to play

- Pick how many questions, then tap **Start Playing**.
- Listen to the question (or tap **Listen**), look at the puzzle, then tap an answer.
- Get a ⭐ for each correct answer; see how many stars you earn at the end.
- **Play Again** returns to the start screen so you can choose a new amount.
- Keyboard friendly: press **1–4** to choose, **Enter/Space** for the next question.

## Run locally

It's a static site — just open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Hosting on GitHub Pages

This repo includes a workflow (`.github/workflows/pages.yml`) that publishes the
site automatically on every push to `main`.

To turn it on once:

1. Go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site will be available at
   `https://<your-username>.github.io/<repo-name>/`.

## Project structure

```
index.html      # screens & layout
style.css       # kid-friendly styling, animations, responsive layout
questions.js    # SVG rendering engine + procedural question generators
game.js         # game flow: count picker, scoring, feedback, audio, results
```
