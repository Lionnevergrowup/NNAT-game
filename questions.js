/* =====================================================================
   NNAT3 Level A — Question bank & SVG rendering helpers
   ---------------------------------------------------------------------
   Everything is drawn with inline SVG so there are no image assets to
   manage and it stays crisp on every screen. Each question is a plain
   object:
     {
       prompt:   "Which piece completes the picture?",
       stimulus: "<svg ...>",          // the big puzzle with a missing cell
       options:  ["<svg>", "<svg>...], // the answer choices
       answer:   2                     // index of the correct option
     }
   ===================================================================== */

(function (global) {
  "use strict";

  // Bright, friendly palette
  const C = {
    red: "#ff5a5f",
    blue: "#3d8bfd",
    yellow: "#ffd23f",
    green: "#2ec27e",
    purple: "#9b5de5",
    orange: "#ff924c",
    pink: "#ff6fb5",
    teal: "#1fc8db",
    white: "#ffffff",
  };

  // ---- low level shape drawing (returns SVG markup for a single cell) ----
  function shape(kind, color, size) {
    const c = size / 2;
    const r = size * 0.36;
    switch (kind) {
      case "circle":
        return `<circle cx="${c}" cy="${c}" r="${r}" fill="${color}"/>`;
      case "square":
        return `<rect x="${c - r}" y="${c - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.12}" fill="${color}"/>`;
      case "triangle":
        return `<polygon points="${c},${c - r} ${c + r},${c + r} ${c - r},${c + r}" fill="${color}"/>`;
      case "diamond":
        return `<polygon points="${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}" fill="${color}"/>`;
      case "star":
        return star(c, c, r, color);
      case "heart":
        return heart(c, c, r, color);
      case "blank":
        return "";
      default:
        return "";
    }
  }

  // Draw a shape centered inside a cell of `cellSize`, scaled by `scale`.
  function shapeScaled(kind, color, cellSize, scale) {
    const s = cellSize * (scale || 1);
    const off = (cellSize - s) / 2;
    return `<g transform="translate(${off},${off})">${shape(kind, color, s)}</g>`;
  }

  function star(cx, cy, r, color) {
    let pts = "";
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      pts += `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)} `;
    }
    return `<polygon points="${pts.trim()}" fill="${color}"/>`;
  }

  function heart(cx, cy, r, color) {
    const d = `M ${cx} ${cy + r * 0.85}
      C ${cx - r * 1.4} ${cy - r * 0.2}, ${cx - r * 0.5} ${cy - r}, ${cx} ${cy - r * 0.25}
      C ${cx + r * 0.5} ${cy - r}, ${cx + r * 1.4} ${cy - r * 0.2}, ${cx} ${cy + r * 0.85} Z`;
    return `<path d="${d}" fill="${color}"/>`;
  }

  // A single framed cell containing a shape (used for matrix questions)
  function cell(content, size, opts = {}) {
    const bg = opts.bg || "#ffffff";
    const stroke = opts.stroke === false ? "none" : "#d6d9e6";
    const missing = opts.missing
      ? `<text x="${size / 2}" y="${size / 2 + size * 0.12}" font-size="${size * 0.4}" text-anchor="middle" fill="#b9bed1">?</text>`
      : "";
    return `<rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.08}" fill="${bg}" stroke="${stroke}" stroke-width="2"/>${content}${missing}`;
  }

  // ---- pattern-completion (the classic NNAT Level A item) ----------------
  // Build a big square split into a grid that follows a simple visual rule.
  // One cell is cut out (shown white with a ?). The options are candidate
  // tiles and exactly one continues the pattern.

  function patternSVG(grid, n, hole) {
    const S = 300;
    const g = S / n;
    let body = `<rect x="0" y="0" width="${S}" height="${S}" rx="14" fill="#ffffff" stroke="#c7cbe0" stroke-width="3"/>`;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const isHole = hole && hole.x === x && hole.y === y;
        const fill = isHole ? "#ffffff" : grid[y][x];
        body += `<rect x="${x * g}" y="${y * g}" width="${g}" height="${g}" fill="${fill}" stroke="#eef0f8" stroke-width="1"/>`;
        if (isHole) {
          body += `<rect x="${x * g + 3}" y="${y * g + 3}" width="${g - 6}" height="${g - 6}" rx="6" fill="#f4f5fb" stroke="#b9bed1" stroke-width="2" stroke-dasharray="6 5"/>`;
          body += `<text x="${x * g + g / 2}" y="${y * g + g / 2 + g * 0.16}" font-size="${g * 0.5}" text-anchor="middle" fill="#b9bed1">?</text>`;
        }
      }
    }
    return svgWrap(body, S);
  }

  function colorTileSVG(color) {
    const S = 90;
    return svgWrap(
      `<rect x="0" y="0" width="${S}" height="${S}" rx="12" fill="${color}" stroke="#d6d9e6" stroke-width="2"/>`,
      S
    );
  }

  function shapeTileSVG(kind, color, scale) {
    const S = 90;
    return svgWrap(
      `<rect x="0" y="0" width="${S}" height="${S}" rx="12" fill="#ffffff" stroke="#d6d9e6" stroke-width="2"/>${shapeScaled(
        kind,
        color,
        S,
        scale
      )}`,
      S
    );
  }

  function svgWrap(body, size) {
    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  }

  // ---- pattern generators (each returns a full grid of colors) -----------
  function checker(n, a, b) {
    const g = [];
    for (let y = 0; y < n; y++) {
      g.push([]);
      for (let x = 0; x < n; x++) g[y].push((x + y) % 2 === 0 ? a : b);
    }
    return g;
  }
  function vStripes(n, colors) {
    const g = [];
    for (let y = 0; y < n; y++) {
      g.push([]);
      for (let x = 0; x < n; x++) g[y].push(colors[x % colors.length]);
    }
    return g;
  }
  function hStripes(n, colors) {
    const g = [];
    for (let y = 0; y < n; y++) {
      g.push([]);
      for (let x = 0; x < n; x++) g[y].push(colors[y % colors.length]);
    }
    return g;
  }
  function diagStripes(n, colors) {
    const g = [];
    for (let y = 0; y < n; y++) {
      g.push([]);
      for (let x = 0; x < n; x++) g[y].push(colors[(x + y) % colors.length]);
    }
    return g;
  }

  // shuffle helper (Fisher–Yates) used to mix answer order
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Build a color-pattern question: cut a hole, correct = grid color there,
  // distractors = other colors used.
  function makeColorPattern(prompt, grid, n, hole, distractorColors) {
    const correctColor = grid[hole.y][hole.x];
    const opts = [{ color: correctColor, correct: true }];
    distractorColors
      .filter((c) => c !== correctColor)
      .slice(0, 3)
      .forEach((c) => opts.push({ color: c, correct: false }));
    const mixed = shuffle(opts);
    return {
      type: "Pattern Completion",
      prompt,
      stimulus: patternSVG(grid, n, hole),
      options: mixed.map((o) => colorTileSVG(o.color)),
      answer: mixed.findIndex((o) => o.correct),
    };
  }

  // Build a "matrix reasoning" question from an explicit grid of cell specs.
  // cells: 2D array of {kind,color} or null for the missing one.
  // optionSpecs come from shuffleSpecs(): each carries a `correct` flag.
  function makeMatrix(prompt, cells, missingPos, optionSpecs, type) {
    const answerIdx = optionSpecs.findIndex((s) => s.correct);
    const n = cells.length;
    const S = 300;
    const g = S / n;
    let body = `<rect x="0" y="0" width="${S}" height="${S}" rx="14" fill="#f7f8fd" stroke="#c7cbe0" stroke-width="3"/>`;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const isMissing = missingPos.x === x && missingPos.y === y;
        const inner = `<g transform="translate(${x * g + g * 0.12},${y * g + g * 0.12})">`;
        const cs = g * 0.76;
        const spec = cells[y][x];
        const content = isMissing
          ? cell("", cs, { missing: true, bg: "#fffef2" })
          : cell(shapeScaled(spec.kind, spec.color, cs, spec.scale), cs, { bg: "#ffffff" });
        body += inner + content + "</g>";
      }
    }
    return {
      type: type || "Reasoning by Analogy",
      prompt,
      stimulus: svgWrap(body, S),
      options: optionSpecs.map((s) => shapeTileSVG(s.kind, s.color, s.scale)),
      answer: answerIdx,
    };
  }

  // =====================================================================
  // The curated set of questions (easy -> a little harder)
  // =====================================================================
  function buildQuestions() {
    const Q = [];

    const SM = 0.58; // "small" scale for size analogies
    const BG = 1.0; //  "big" scale

    // --- 1. Pattern Completion: simple 2x2 checkerboard ---
    Q.push(
      makeColorPattern(
        "One piece is missing. Which color belongs in the empty box?",
        checker(2, C.red, C.yellow),
        2,
        { x: 1, y: 1 },
        [C.red, C.blue, C.green, C.yellow]
      )
    );

    // --- 2. Reasoning by Analogy: color changes across columns ---
    Q.push(
      makeMatrix(
        "The shapes change color. Which piece is missing?",
        [
          [
            { kind: "circle", color: C.red },
            { kind: "circle", color: C.blue },
          ],
          [{ kind: "square", color: C.red }, null],
        ],
        { x: 1, y: 1 },
        shuffleSpecs([
          { kind: "square", color: C.blue }, // correct
          { kind: "square", color: C.red },
          { kind: "circle", color: C.blue },
          { kind: "square", color: C.green },
        ])
      )
    );

    // --- 3. Pattern Completion: vertical stripes ---
    Q.push(
      makeColorPattern(
        "Look at the stripes. Which color fits in the empty box?",
        vStripes(3, [C.blue, C.white, C.blue]),
        3,
        { x: 1, y: 1 },
        [C.blue, C.white, C.red, C.green]
      )
    );

    // --- 4. Reasoning by Analogy: shapes get bigger ---
    Q.push(
      makeMatrix(
        "The shapes get bigger. Which piece is missing?",
        [
          [
            { kind: "circle", color: C.purple, scale: SM },
            { kind: "circle", color: C.purple, scale: BG },
          ],
          [{ kind: "star", color: C.purple, scale: SM }, null],
        ],
        { x: 1, y: 1 },
        shuffleSpecs([
          { kind: "star", color: C.purple, scale: BG }, // correct
          { kind: "star", color: C.purple, scale: SM },
          { kind: "circle", color: C.purple, scale: BG },
          { kind: "heart", color: C.purple, scale: BG },
        ])
      )
    );

    // --- 5. Pattern Completion: horizontal stripes ---
    Q.push(
      makeColorPattern(
        "Which color completes the pattern?",
        hStripes(3, [C.green, C.yellow, C.green]),
        3,
        { x: 2, y: 0 },
        [C.green, C.yellow, C.purple, C.orange]
      )
    );

    // --- 6. Reasoning by Analogy: shape changes by column ---
    Q.push(
      makeMatrix(
        "Each column is the same shape. What completes the picture?",
        [
          [
            { kind: "triangle", color: C.orange },
            { kind: "diamond", color: C.orange },
          ],
          [{ kind: "triangle", color: C.teal }, null],
        ],
        { x: 1, y: 1 },
        shuffleSpecs([
          { kind: "diamond", color: C.teal }, // correct
          { kind: "triangle", color: C.teal },
          { kind: "diamond", color: C.orange },
          { kind: "circle", color: C.teal },
        ])
      )
    );

    // --- 7. Pattern Completion: 4x4 checkerboard ---
    Q.push(
      makeColorPattern(
        "Find the missing piece of the checkerboard.",
        checker(4, C.purple, C.white),
        4,
        { x: 2, y: 1 },
        [C.purple, C.white, C.pink, C.teal]
      )
    );

    // --- 8. Reasoning by Analogy: shape grows AND keeps its color ---
    Q.push(
      makeMatrix(
        "Look how the shape grows. Which piece fits?",
        [
          [
            { kind: "heart", color: C.pink, scale: SM },
            { kind: "heart", color: C.pink, scale: BG },
          ],
          [{ kind: "square", color: C.blue, scale: SM }, null],
        ],
        { x: 1, y: 1 },
        shuffleSpecs([
          { kind: "square", color: C.blue, scale: BG }, // correct
          { kind: "square", color: C.blue, scale: SM },
          { kind: "square", color: C.pink, scale: BG },
          { kind: "heart", color: C.blue, scale: BG },
        ])
      )
    );

    // --- 9. Pattern Completion: diagonal stripes (3 colors) ---
    Q.push(
      makeColorPattern(
        "The colors march in diagonal lines. Which one fits?",
        diagStripes(4, [C.red, C.yellow, C.blue]),
        4,
        { x: 2, y: 2 },
        [C.red, C.yellow, C.blue, C.green]
      )
    );

    // --- 10. Reasoning by Analogy: 3x3 grid (shape by row, color by column) ---
    Q.push(
      makeMatrix(
        "Which piece completes the grid?",
        [
          [
            { kind: "square", color: C.red },
            { kind: "square", color: C.blue },
            { kind: "square", color: C.green },
          ],
          [
            { kind: "circle", color: C.red },
            { kind: "circle", color: C.blue },
            { kind: "circle", color: C.green },
          ],
          [
            { kind: "triangle", color: C.red },
            { kind: "triangle", color: C.blue },
            null,
          ],
        ],
        { x: 2, y: 2 },
        shuffleSpecs([
          { kind: "triangle", color: C.green }, // correct
          { kind: "triangle", color: C.red },
          { kind: "circle", color: C.green },
          { kind: "square", color: C.green },
        ])
      )
    );

    // --- 11. Pattern Completion: bigger 5x5 checker ---
    Q.push(
      makeColorPattern(
        "Find the missing tile.",
        checker(5, C.teal, C.white),
        5,
        { x: 2, y: 2 },
        [C.teal, C.white, C.pink, C.yellow]
      )
    );

    // --- 12. Pattern Completion: diagonal 5-color final challenge ---
    Q.push(
      makeColorPattern(
        "Last one! Which color finishes the diagonal pattern?",
        diagStripes(5, [C.pink, C.blue, C.yellow, C.green]),
        5,
        { x: 3, y: 1 },
        [C.pink, C.blue, C.yellow, C.green]
      )
    );

    return Q;
  }

  // Shuffle option specs while remembering which is correct (first item).
  function shuffleSpecs(specs) {
    const tagged = specs.map((s, i) => ({ ...s, correct: i === 0 }));
    return shuffle(tagged);
  }

  global.NNAT = { buildQuestions };
})(window);
