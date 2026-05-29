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

There are 22 questions; the order is reshuffled every time you play.

## Audio (English read-aloud)

Every question is read aloud in English using the browser's built-in
text-to-speech, so pre-readers can play on their own.

- 🔊 **Listen** button re-reads the current question.
- The 🔊/🔇 toggle in the top bar turns sound on/off (remembered between visits).

## How to play

- Tap **Start Playing**.
- Listen to the question (or tap **Listen**), look at the puzzle, then tap an answer.
- Get a ⭐ for each correct answer; see how many stars you earn at the end.
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
style.css       # kid-friendly styling, animations
questions.js    # SVG rendering engine + curated question bank
game.js         # game flow: scoring, feedback, results
```
