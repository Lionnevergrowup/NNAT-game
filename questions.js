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
      case "arrow":
        // an upward arrow — clearly asymmetric so rotation is visible
        return (
          `<polygon points="${c},${size * 0.12} ${size * 0.78},${size * 0.52} ${size * 0.22},${size * 0.52}" fill="${color}"/>` +
          `<rect x="${c - size * 0.1}" y="${size * 0.5}" width="${size * 0.2}" height="${size * 0.36}" rx="${size * 0.03}" fill="${color}"/>`
        );
      case "flag":
        // a little flag on a pole — also orientation dependent
        return (
          `<rect x="${size * 0.3}" y="${size * 0.15}" width="${size * 0.06}" height="${size * 0.7}" rx="2" fill="${color}"/>` +
          `<polygon points="${size * 0.36},${size * 0.18} ${size * 0.78},${size * 0.32} ${size * 0.36},${size * 0.46}" fill="${color}"/>`
        );
      case "blank":
        return "";
      default:
        return "";
    }
  }

  // Draw a shape centered inside a cell of `cellSize`, scaled and rotated.
  function shapeScaled(kind, color, cellSize, scale, rot) {
    const s = cellSize * (scale || 1);
    const off = (cellSize - s) / 2;
    const rotate = rot ? `rotate(${rot} ${cellSize / 2} ${cellSize / 2}) ` : "";
    return `<g transform="${rotate}translate(${off},${off})">${shape(kind, color, s)}</g>`;
  }

  // Draw `count` small dots in a row, centered. The radius adapts to the
  // count so the dots always fit inside the cell (even at 4).
  function dots(count, color, cellSize) {
    const usable = cellSize * 0.84;
    const gapRatio = 0.6;
    let r = usable / (count * 2 + (count - 1) * gapRatio);
    r = Math.min(r, cellSize * 0.16);
    const gap = r * gapRatio;
    const totalW = count * (2 * r) + (count - 1) * gap;
    const startX = (cellSize - totalW) / 2 + r;
    let s = "";
    for (let i = 0; i < count; i++) {
      const cx = startX + i * (2 * r + gap);
      s += `<circle cx="${cx}" cy="${cellSize / 2}" r="${r}" fill="${color}"/>`;
    }
    return s;
  }

  // A grey plus sign (used in "combine these shapes" spatial items).
  function plusSign(cellSize) {
    const c = cellSize / 2;
    const a = cellSize * 0.16;
    const t = cellSize * 0.05;
    return `<rect x="${c - a}" y="${c - t}" width="${2 * a}" height="${2 * t}" rx="${t}" fill="#c7cbe0"/><rect x="${c - t}" y="${c - a}" width="${2 * t}" height="${2 * a}" rx="${t}" fill="#c7cbe0"/>`;
  }

  // Render any cell spec:
  //  {kind:'dots',count,color} · {kind:'plus'} · {kind:'combo',shapes:[...]} ·
  //  {kind,color,scale,rot}
  function renderSpec(spec, cellSize) {
    if (spec.kind === "dots") return dots(spec.count, spec.color, cellSize);
    if (spec.kind === "plus") return plusSign(cellSize);
    if (spec.kind === "combo")
      return spec.shapes
        .map((s) => shapeScaled(s.kind, s.color, cellSize, s.scale || 0.92, s.rot))
        .join("");
    return shapeScaled(spec.kind, spec.color, cellSize, spec.scale, spec.rot);
  }

  // White answer tile containing any spec.
  function specTileSVG(spec) {
    const S = 90;
    return svgWrap(
      `<rect x="0" y="0" width="${S}" height="${S}" rx="12" fill="#ffffff" stroke="#d6d9e6" stroke-width="2"/>${renderSpec(
        spec,
        S
      )}`,
      S
    );
  }

  function svgWrapWH(body, w, h) {
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
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
    const S = 300;
    const g = S / n;
    return {
      type: "Pattern Completion",
      prompt,
      stimulus: patternSVG(grid, n, hole),
      solved: patternSVG(grid, n, null),
      hole: { x: hole.x * g, y: hole.y * g, w: g, h: g },
      vb: { w: S, h: S },
      options: mixed.map((o) => colorTileSVG(o.color)),
      answer: mixed.findIndex((o) => o.correct),
    };
  }

  // Build a "matrix reasoning" question from an explicit grid of cell specs.
  // cells: 2D array of {kind,color} or null for the missing one.
  // optionSpecs come from shuffleSpecs(): each carries a `correct` flag.
  // Render an n×n grid of specs (null cell -> a "?" placeholder).
  function renderMatrix(cells) {
    const n = cells.length;
    const S = 300;
    const g = S / n;
    let body = `<rect x="0" y="0" width="${S}" height="${S}" rx="14" fill="#f7f8fd" stroke="#c7cbe0" stroke-width="3"/>`;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cs = g * 0.76;
        const spec = cells[y][x];
        const content =
          spec === null
            ? cell("", cs, { missing: true, bg: "#fffef2" })
            : cell(renderSpec(spec, cs), cs, { bg: "#ffffff" });
        body += `<g transform="translate(${x * g + g * 0.12},${y * g + g * 0.12})">${content}</g>`;
      }
    }
    return svgWrap(body, S);
  }

  function makeMatrix(prompt, cells, missingPos, optionSpecs, type) {
    const answerIdx = optionSpecs.findIndex((s) => s.correct);
    const correctSpec = optionSpecs[answerIdx];
    const n = cells.length;
    const S = 300;
    const g = S / n;
    const solvedCells = cells.map((row) => row.slice());
    solvedCells[missingPos.y][missingPos.x] = correctSpec;
    return {
      type: type || "Reasoning by Analogy",
      prompt,
      stimulus: renderMatrix(cells),
      solved: renderMatrix(solvedCells),
      hole: { x: missingPos.x * g + g * 0.12, y: missingPos.y * g + g * 0.12, w: g * 0.76, h: g * 0.76 },
      vb: { w: S, h: S },
      options: optionSpecs.map((s) => specTileSVG(s)),
      answer: answerIdx,
    };
  }

  // Build a horizontal "series" question: a strip of cells, one is missing
  // (use null), and the answer continues the sequence.
  const SERIES_CS = 76;
  const SERIES_GAP = 12;

  function renderSeries(cellsRow) {
    const n = cellsRow.length;
    const cs = SERIES_CS;
    const gap = SERIES_GAP;
    const W = n * cs + (n - 1) * gap;
    let body = "";
    cellsRow.forEach((spec, i) => {
      const x = i * (cs + gap);
      const content =
        spec === null
          ? cell("", cs, { missing: true, bg: "#fffef2" })
          : cell(renderSpec(spec, cs), cs, { bg: "#ffffff" });
      body += `<g transform="translate(${x},0)">${content}</g>`;
    });
    return svgWrapWH(body, W, cs);
  }

  function makeSeries(prompt, cellsRow, optionSpecs, type) {
    const answerIdx = optionSpecs.findIndex((s) => s.correct);
    const correctSpec = optionSpecs[answerIdx];
    const n = cellsRow.length;
    const cs = SERIES_CS;
    const gap = SERIES_GAP;
    const W = n * cs + (n - 1) * gap;
    const missIdx = cellsRow.indexOf(null);
    const solvedRow = cellsRow.slice();
    solvedRow[missIdx] = correctSpec;
    return {
      type: type || "Serial Reasoning",
      prompt,
      stimulus: renderSeries(cellsRow),
      solved: renderSeries(solvedRow),
      hole: { x: missIdx * (cs + gap), y: 0, w: cs, h: cs },
      vb: { w: W, h: cs },
      options: optionSpecs.map((s) => specTileSVG(s)),
      answer: answerIdx,
    };
  }

  // =====================================================================
  // Procedural question generators — each guarantees a unique correct
  // answer. buildQuestions() assembles a fresh, shuffled set of 48.
  // =====================================================================
  const COLORS = [C.red, C.blue, C.yellow, C.green, C.purple, C.orange, C.pink, C.teal];
  const SHAPES = ["circle", "square", "triangle", "diamond", "star", "heart"];
  const SM = 0.58; // small scale for size questions
  const BG = 1.0; // big scale

  function pick(a) {
    return a[Math.floor(Math.random() * a.length)];
  }
  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }
  // n distinct items from arr, excluding anything in `exclude`
  function pickN(arr, n, exclude) {
    const pool = shuffle(arr.filter((x) => !exclude || exclude.indexOf(x) === -1));
    return pool.slice(0, n);
  }

  // Turn [correct, ...distractors] into 4 distinct, shuffled option specs
  // (the correct one is always first before shuffleSpecs tags it).
  function distinctOptions(correct, distractors) {
    const seen = new Set([JSON.stringify(correct)]);
    const out = [correct];
    for (const d of distractors) {
      const k = JSON.stringify(d);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(d);
      }
      if (out.length === 4) break;
    }
    let guard = 0;
    while (out.length < 4 && guard++ < 80) {
      let base = Object.assign({}, correct);
      if (base.kind === "dots") base.count = randInt(1, 4);
      else if (base.kind === "combo") {
        base = JSON.parse(JSON.stringify(correct));
        if (base.shapes[0]) base.shapes[0].color = pick(COLORS);
      } else {
        base.color = pick(COLORS);
        if (Math.random() < 0.5) base.kind = pick(SHAPES);
      }
      const k = JSON.stringify(base);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(base);
      }
    }
    return shuffleSpecs(out);
  }

  // Shuffle option specs while remembering which is correct (first item).
  function shuffleSpecs(specs) {
    const tagged = specs.map((s, i) => ({ ...s, correct: i === 0 }));
    return shuffle(tagged);
  }

  // tag a built question with its generator + subtype so we can make a
  // "similar but different" follow-up later (adaptive practice).
  function tagify(q, g, sub) {
    q.g = g;
    q.sub = sub;
    return q;
  }
  function nForLevel(level) {
    return level === "A" ? randInt(2, 3) : level === "B" ? randInt(3, 4) : randInt(4, 5);
  }
  function otherColor(c) {
    return pick(COLORS.filter((x) => x !== c));
  }
  function otherShape(exclude) {
    return pick(SHAPES.filter((s) => exclude.indexOf(s) === -1));
  }

  // =====================================================================
  // Pattern Completion  (NNAT levels A–E)
  // =====================================================================
  function patternSubs(level) {
    const base = ["checker", "vstripe", "hstripe"];
    if (level === "A") return base;
    if (level === "B") return base.concat("diag");
    return base.concat("diag", "shapegrid");
  }
  function genPattern(level, forceSub) {
    const subs = patternSubs(level);
    const sub = forceSub && subs.indexOf(forceSub) !== -1 ? forceSub : pick(subs);

    if (sub === "shapegrid") {
      const n = Math.min(nForLevel(level), 4);
      const [sA, sB] = pickN(SHAPES, 2);
      const color = pick(COLORS);
      const cells = [];
      for (let y = 0; y < n; y++) {
        cells.push([]);
        for (let x = 0; x < n; x++) cells[y].push({ kind: (x + y) % 2 === 0 ? sA : sB, color });
      }
      const hole = { x: randInt(0, n - 1), y: randInt(0, n - 1) };
      const correctSpec = cells[hole.y][hole.x];
      cells[hole.y][hole.x] = null;
      const distractors = [
        { kind: correctSpec.kind === sA ? sB : sA, color },
        { kind: correctSpec.kind, color: otherColor(color) },
        { kind: otherShape([sA, sB]), color },
      ];
      return tagify(
        makeMatrix("Find the missing piece of the pattern.", cells, hole, distinctOptions(correctSpec, distractors), "Pattern Completion"),
        "pattern",
        sub
      );
    }

    const n = nForLevel(level);
    let grid;
    if (sub === "checker") {
      const [a, b] = pickN(COLORS, 2);
      grid = checker(n, a, b);
    } else if (sub === "vstripe") grid = vStripes(n, pickN(COLORS, 2));
    else if (sub === "hstripe") grid = hStripes(n, pickN(COLORS, 2));
    else grid = diagStripes(n, pickN(COLORS, level === "C" ? randInt(3, 4) : 3));
    const hole = { x: randInt(0, n - 1), y: randInt(0, n - 1) };
    const correct = grid[hole.y][hole.x];
    const distractors = pickN(COLORS, 3, [correct]);
    const prompt = pick([
      "One piece is missing. Which color belongs in the empty box?",
      "Find the missing tile.",
      "Which color completes the pattern?",
    ]);
    return tagify(makeColorPattern(prompt, grid, n, hole, distractors), "pattern", sub);
  }

  // =====================================================================
  // Reasoning by Analogy  (NNAT levels A–G)  — 2×2 matrix
  // =====================================================================
  function analogySubs(level) {
    const base = ["color", "size", "shape"];
    if (level === "A") return base;
    if (level === "B") return base.concat("rotate");
    return base.concat("rotate", "multi");
  }
  function genAnalogy(level, forceSub) {
    const subs = analogySubs(level);
    const sub = forceSub && subs.indexOf(forceSub) !== -1 ? forceSub : pick(subs);
    let cells, correct, distractors, prompt;

    if (sub === "color") {
      const [c0, c1, c2] = pickN(COLORS, 3);
      const [k0, k1] = pickN(SHAPES, 2);
      cells = [[{ kind: k0, color: c0 }, { kind: k0, color: c1 }], [{ kind: k1, color: c0 }, null]];
      correct = { kind: k1, color: c1 };
      distractors = [{ kind: k1, color: c0 }, { kind: k0, color: c1 }, { kind: k1, color: c2 }];
      prompt = "The shapes change color. Which piece is missing?";
    } else if (sub === "size") {
      const big = Math.random() < 0.5;
      const sA = big ? SM : BG;
      const sB = big ? BG : SM;
      const [c0, c1] = pickN(COLORS, 2);
      const [k0, k1] = pickN(SHAPES, 2);
      cells = [
        [{ kind: k0, color: c0, scale: sA }, { kind: k0, color: c0, scale: sB }],
        [{ kind: k1, color: c1, scale: sA }, null],
      ];
      correct = { kind: k1, color: c1, scale: sB };
      distractors = [
        { kind: k1, color: c1, scale: sA },
        { kind: k0, color: c1, scale: sB },
        { kind: k1, color: otherColor(c1), scale: sB },
      ];
      prompt = big ? "The shapes get bigger. Which piece is missing?" : "The shapes get smaller. Which piece is missing?";
    } else if (sub === "shape") {
      const [s0, s1, s2] = pickN(SHAPES, 3);
      const [c0, c1] = pickN(COLORS, 2);
      cells = [[{ kind: s0, color: c0 }, { kind: s1, color: c0 }], [{ kind: s0, color: c1 }, null]];
      correct = { kind: s1, color: c1 };
      distractors = [{ kind: s0, color: c1 }, { kind: s1, color: c0 }, { kind: s2, color: c1 }];
      prompt = "Each column is the same shape. What completes the picture?";
    } else if (sub === "rotate") {
      const [k0, k1] = pickN(["arrow", "flag"], 2);
      const [c0, c1] = pickN(COLORS, 2);
      const ang = pick([90, 180, 270]);
      cells = [
        [{ kind: k0, color: c0, rot: 0 }, { kind: k0, color: c0, rot: ang }],
        [{ kind: k1, color: c1, rot: 0 }, null],
      ];
      correct = { kind: k1, color: c1, rot: ang };
      distractors = [
        { kind: k1, color: c1, rot: 0 },
        { kind: k1, color: c1, rot: pick([90, 180, 270].filter((a) => a !== ang)) },
        { kind: k0, color: c1, rot: ang },
      ];
      prompt = "The shape is turned. Which piece is missing?";
    } else {
      // multi: shape AND size change across columns; color differs by row
      const [s0, s1] = pickN(SHAPES, 2);
      const [c0, c1] = pickN(COLORS, 2);
      cells = [
        [{ kind: s0, color: c0, scale: SM }, { kind: s1, color: c0, scale: BG }],
        [{ kind: s0, color: c1, scale: SM }, null],
      ];
      correct = { kind: s1, color: c1, scale: BG };
      distractors = [
        { kind: s1, color: c1, scale: SM },
        { kind: s0, color: c1, scale: BG },
        { kind: s1, color: c0, scale: BG },
      ];
      prompt = "Two things change. Which piece is missing?";
    }
    return tagify(makeMatrix(prompt, cells, { x: 1, y: 1 }, distinctOptions(correct, distractors)), "analogy", sub);
  }

  // =====================================================================
  // Serial Reasoning  (NNAT levels B–G)  — 3×3 grid, missing bottom-right
  // =====================================================================
  function serialSubs(level) {
    const base = ["shapeflow", "colorflow", "rotate"];
    return level === "C" ? base.concat("matrix2") : base;
  }
  function grid3(fn) {
    const cells = [];
    for (let r = 0; r < 3; r++) {
      cells.push([]);
      for (let c = 0; c < 3; c++) cells[r].push(r === 2 && c === 2 ? null : fn(r, c));
    }
    return cells;
  }
  function genSerial(level, forceSub) {
    const subs = serialSubs(level);
    const sub = forceSub && subs.indexOf(forceSub) !== -1 ? forceSub : pick(subs);
    let cells, correct, distractors;
    const prompt = "Which piece completes the grid?";

    if (sub === "shapeflow") {
      const order = pickN(SHAPES, 3);
      const color = pick(COLORS);
      cells = grid3((r, c) => ({ kind: order[c], color }));
      correct = { kind: order[2], color };
      distractors = [{ kind: order[0], color }, { kind: order[1], color }, { kind: otherShape(order), color }];
    } else if (sub === "colorflow") {
      const order = pickN(COLORS, 3);
      const k = pick(SHAPES);
      const extra = pick(COLORS.filter((c) => order.indexOf(c) === -1));
      cells = grid3((r, c) => ({ kind: k, color: order[c] }));
      correct = { kind: k, color: order[2] };
      distractors = [
        { kind: k, color: order[0] },
        { kind: k, color: order[1] },
        { kind: k, color: extra },
      ];
    } else if (sub === "rotate") {
      const shp = pick(["arrow", "flag"]);
      const color = pick(COLORS);
      const step = pick([90, 270]);
      cells = grid3((r, c) => ({ kind: shp, color, rot: ((r * 3 + c) * step) % 360 }));
      correct = { kind: shp, color, rot: (8 * step) % 360 };
      distractors = [90, 180, 270]
        .map((a) => ({ kind: shp, color, rot: a }))
        .filter((d) => d.rot !== correct.rot)
        .slice(0, 3);
    } else {
      // matrix2: shape by column AND color by row (two variables)
      const sOrder = pickN(SHAPES, 3);
      const cOrder = pickN(COLORS, 3);
      cells = grid3((r, c) => ({ kind: sOrder[c], color: cOrder[r] }));
      correct = { kind: sOrder[2], color: cOrder[2] };
      distractors = [
        { kind: sOrder[2], color: cOrder[1] },
        { kind: sOrder[1], color: cOrder[2] },
        { kind: sOrder[0], color: cOrder[0] },
      ];
    }
    return tagify(makeMatrix(prompt, cells, { x: 2, y: 2 }, distinctOptions(correct, distractors), "Serial Reasoning"), "serial", sub);
  }

  // =====================================================================
  // Spatial Visualization  (NNAT levels C–G)  — turn / combine shapes
  // =====================================================================
  function spatialSubs() {
    return ["rotate", "combine"];
  }
  function genSpatial(level, forceSub) {
    const subs = spatialSubs();
    const sub = forceSub && subs.indexOf(forceSub) !== -1 ? forceSub : pick(subs);

    if (sub === "combine") {
      const [sA, sB] = pickN(SHAPES, 2);
      const [cA, cB] = pickN(COLORS, 2);
      const big = { scale: 0.95 };
      const small = { scale: 0.5 };
      const row = [
        { kind: sA, color: cA },
        { kind: "plus" },
        { kind: sB, color: cB },
        null,
      ];
      const correct = { kind: "combo", shapes: [{ kind: sA, color: cA, scale: big.scale }, { kind: sB, color: cB, scale: small.scale }] };
      const distractors = [
        { kind: "combo", shapes: [{ kind: sA, color: cA, scale: big.scale }] },
        { kind: "combo", shapes: [{ kind: sB, color: cB, scale: big.scale }] },
        { kind: "combo", shapes: [{ kind: sA, color: cA, scale: big.scale }, { kind: sB, color: cA, scale: small.scale }] },
      ];
      return tagify(
        makeSeries("Put the two shapes together. Which piece do you get?", row, distinctOptions(correct, distractors), "Spatial Visualization"),
        "spatial",
        sub
      );
    }

    // rotate: turn the bottom shape the same way as the top pair
    const angle = pick([90, 180, 270]);
    const [base, target] = shuffle(["arrow", "flag"]);
    const [c0, c1] = pickN(COLORS, 2);
    const cells = [
      [{ kind: base, color: c0, rot: 0 }, { kind: base, color: c0, rot: angle }],
      [{ kind: target, color: c1, rot: 0 }, null],
    ];
    const correct = { kind: target, color: c1, rot: angle };
    const distractors = [
      { kind: target, color: c1, rot: 0 },
      { kind: target, color: c1, rot: pick([90, 180, 270].filter((a) => a !== angle)) },
      { kind: base, color: c1, rot: angle },
    ];
    const prompt =
      angle === 180
        ? "The top shape is flipped over. Do the same to the bottom shape."
        : "The top shape is turned. Turn the bottom shape the same way.";
    return tagify(makeMatrix(prompt, cells, { x: 1, y: 1 }, distinctOptions(correct, distractors), "Spatial Visualization"), "spatial", "rotate");
  }

  // ---- registry & level structure (mirrors the official NNAT3) ----------
  const GENERATORS = { pattern: genPattern, analogy: genAnalogy, serial: genSerial, spatial: genSpatial };
  // Which item types appear at each level (A=K, B=Grade 1, C=Grade 2).
  const LEVEL_TYPES = {
    A: ["pattern", "analogy"],
    B: ["pattern", "analogy", "serial"],
    C: ["pattern", "analogy", "serial", "spatial"],
  };

  // opts: { count?, types?, level? }
  function buildQuestions(opts) {
    opts = opts || {};
    const level = LEVEL_TYPES[opts.level] ? opts.level : "A";
    const avail = LEVEL_TYPES[level];
    let types = (opts.types || []).filter((t) => avail.indexOf(t) !== -1);
    if (!types.length) types = avail.slice();
    const target = Math.max(1, opts.count || 48);

    const Q = [];
    const seen = new Set();
    const add = (t, count) => {
      let made = 0;
      let guard = 0;
      while (made < count && guard++ < count * 120) {
        const q = GENERATORS[t](level);
        if (seen.has(q.stimulus)) continue; // skip an identical puzzle
        seen.add(q.stimulus);
        Q.push(q);
        made++;
      }
    };
    const per = Math.ceil(target / types.length);
    types.forEach((t) => add(t, per));
    return shuffle(Q);
  }

  // Make a "similar but different" question of the same type & subtype —
  // used to give gentle follow-ups after a wrong answer (举一反三).
  function makeSimilar(q, level) {
    const lvl = LEVEL_TYPES[level] ? level : "A";
    if (!q || !GENERATORS[q.g]) return GENERATORS.pattern(lvl);
    return GENERATORS[q.g](lvl, q.sub);
  }

  global.NNAT = {
    buildQuestions,
    makeSimilar,
    levels: Object.keys(LEVEL_TYPES),
    levelTypes: function (l) {
      return (LEVEL_TYPES[l] || []).slice();
    },
  };
})(window);
