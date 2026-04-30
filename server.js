import express from 'express';
import cors from 'cors';
import chroma from 'chroma-js';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

// ── Utilities ─────────────────────────────────────────────────────────────────

function nameColor(hex) {
  try {
    const [h, s, l] = chroma(hex).hsl();
    if (s < 0.08) {
      if (l < 0.20) return 'Black';
      if (l < 0.45) return 'Dark Gray';
      if (l < 0.65) return 'Gray';
      if (l < 0.85) return 'Light Gray';
      return 'White';
    }
    const hue = ((h ?? 0) % 360 + 360) % 360;
    const bands = [
      [15, 'Red'], [30, 'Orange-Red'], [45, 'Orange'], [60, 'Amber'],
      [75, 'Yellow'], [90, 'Yellow-Green'], [120, 'Lime'], [150, 'Green'],
      [165, 'Teal-Green'], [180, 'Teal'], [195, 'Cyan'], [210, 'Sky Blue'],
      [225, 'Light Blue'], [240, 'Blue'], [255, 'Indigo'], [270, 'Blue-Violet'],
      [285, 'Violet'], [300, 'Purple'], [315, 'Magenta'], [330, 'Hot Pink'],
      [345, 'Rose'], [361, 'Red'],
    ];
    const base = (bands.find(([limit]) => hue < limit) ?? [361, 'Red'])[1];
    if (l < 0.25) return `Dark ${base}`;
    if (l > 0.75) return `Light ${base}`;
    return base;
  } catch {
    return 'Color';
  }
}

function safeHue(hex) {
  try {
    const h = chroma(hex).hsl()[0];
    return isNaN(h) || h == null ? 0 : h;
  } catch { return 0; }
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function mkColor(h, s, l) {
  return chroma.hsl(((h % 360) + 360) % 360, clamp(s, 0.02, 1), clamp(l, 0.06, 0.95)).hex();
}

function toObj(hex) { return { hex: hex.toUpperCase(), name: nameColor(hex) }; }

function makeFixLabel(origHex, fixHex) {
  try {
    const [, , origL] = chroma(origHex).hsl();
    const [fixH, fixS, fixL] = chroma(fixHex).hsl();
    const lDelta = fixL - origL;
    let colorName;
    if (fixS < 0.12) {
      colorName = fixL > 0.82 ? 'white' : fixL < 0.22 ? 'black' : 'gray';
    } else {
      const hue = ((fixH ?? 0) + 360) % 360;
      if      (hue < 20 || hue >= 340) colorName = 'red';
      else if (hue < 45)               colorName = 'orange';
      else if (hue < 70)               colorName = 'yellow';
      else if (hue < 150)              colorName = 'green';
      else if (hue < 195)              colorName = 'teal';
      else if (hue < 250)              colorName = 'blue';
      else if (hue < 290)              colorName = 'purple';
      else                             colorName = 'pink';
    }
    if (lDelta > 0.18)  return `Use this lighter ${colorName} instead`;
    if (lDelta < -0.18) return `Use this darker ${colorName} instead`;
    if (lDelta > 0.07)  return `Use this brighter ${colorName} instead`;
    if (lDelta < -0.07) return `Use this deeper ${colorName} instead`;
    return `Use this ${colorName} instead`;
  } catch { return 'Use this accessible color instead'; }
}

// Adjust fg lightness until contrast vs bg meets targetRatio; returns best hex found
function findAccessibleForeground(fg, bg, targetRatio = 4.5) {
  try {
    const bgL = chroma(bg).hsl()[2];
    const [h, s] = chroma(fg).hsl();
    // Move toward black (dark bg) or white (light bg)
    const lightTarget = bgL < 0.5 ? 0.94 : 0.06;
    let best = fg;
    let bestRatio = chroma.contrast(fg, bg);
    for (let step = 0; step <= 20; step++) {
      const t = step / 20;
      const l = clamp(chroma(fg).hsl()[2] + (lightTarget - chroma(fg).hsl()[2]) * t, 0.04, 0.96);
      const candidate = chroma.hsl((h ?? 0), s, l).hex();
      const ratio = chroma.contrast(candidate, bg);
      if (ratio > bestRatio) { best = candidate; bestRatio = ratio; }
      if (ratio >= targetRatio) return { hex: candidate.toUpperCase(), ratio: Math.round(ratio * 100) / 100 };
    }
    return { hex: best.toUpperCase(), ratio: Math.round(bestRatio * 100) / 100 };
  } catch { return null; }
}

// Variant shifts for Shuffle (5 distinct "feels")
const VARIANTS = [
  { sMulti: 1.00, lOff:  0.00 }, // 0: default
  { sMulti: 0.85, lOff:  0.10 }, // 1: muted + lighter
  { sMulti: 1.00, lOff: -0.10 }, // 2: same sat, darker
  { sMulti: 0.70, lOff:  0.08 }, // 3: desaturated + lighter
  { sMulti: 1.12, lOff: -0.06 }, // 4: more vibrant + darker
];

function angDistDeg(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

// ── Palette-aware completion suggestions ─────────────────────────────────────
function getPaletteCompletionSuggestions(hexes, variant = 0) {
  const v = VARIANTS[Math.max(0, Math.min(4, Number(variant) || 0))];

  const colorData = hexes
    .filter(h => { try { chroma(h); return true; } catch { return false; } })
    .map(h => {
      const [hue, s, l] = chroma(h).hsl();
      return { hex: h.toUpperCase(), h: (isNaN(hue) || hue == null) ? 0 : hue, s, l };
    });

  if (colorData.length < 2) return null;

  // Circular mean hue weighted by saturation
  const totalSat = colorData.reduce((sum, c) => sum + c.s, 0) || 1;
  const sinSum = colorData.reduce((sum, c) => sum + c.s * Math.sin(c.h * Math.PI / 180), 0);
  const cosSum = colorData.reduce((sum, c) => sum + c.s * Math.cos(c.h * Math.PI / 180), 0);
  const meanHue = ((Math.atan2(sinSum / totalSat, cosSum / totalSat) * 180 / Math.PI) + 360) % 360;

  const avgS = colorData.reduce((s, c) => s + c.s, 0) / colorData.length;
  const avgL = colorData.reduce((s, c) => s + c.l, 0) / colorData.length;

  function pc(hue, sOvr, lOvr) {
    const s = clamp((sOvr ?? avgS) * v.sMulti, 0.06, 1);
    const l = clamp((lOvr ?? avgL) + v.lOff, 0.08, 0.90);
    return toObj(mkColor(hue, s, l));
  }

  const hues = colorData.map(c => c.h).sort((a, b) => a - b);

  // Score a candidate: contrast vs existing palette + bonus for passing AA against white or black.
  // This penalises mid-tone colours (L ~0.4–0.6) that fail both white and black backgrounds.
  function a11yScore(hex) {
    try {
      const existingScore = hexes.reduce((sum, ex) => {
        const r = chroma.contrast(hex, ex);
        return sum + (r >= 4.5 ? 2 : r >= 3 ? 1 : 0);
      }, 0);
      const vsWhite = chroma.contrast(hex, '#FFFFFF');
      const vsBlack = chroma.contrast(hex, '#000000');
      const bgBonus = Math.max(
        vsWhite >= 4.5 ? 4 : vsWhite >= 3 ? 2 : 0,
        vsBlack >= 4.5 ? 4 : vsBlack >= 3 ? 2 : 0,
      );
      return existingScore + bgBonus;
    } catch { return 0; }
  }

  // From a pool of candidates, sort by accessibility score and keep best 6
  function bestColors(pool) {
    return [...pool].sort((a, b) => a11yScore(b.hex) - a11yScore(a.hex)).slice(0, 6);
  }

  const groups = [];

  // 1. Fill the largest hue gap (if > 60°)
  let maxGap = 0, gapStart = 0;
  for (let i = 0; i < hues.length; i++) {
    const next = hues[(i + 1) % hues.length];
    const gap = i < hues.length - 1 ? next - hues[i] : (hues[0] + 360) - hues[i];
    if (gap > maxGap) { maxGap = gap; gapStart = hues[i]; }
  }
  const gapMid = (gapStart + maxGap / 2) % 360;
  // Extra lightness levels added to every pool so a11y sorting has room to work
  function pool(hue, sat, extras = []) {
    return [
      pc(hue, sat, clamp(avgL, 0.08, 0.90)),
      pc(hue, sat, clamp(avgL + 0.18, 0.08, 0.90)),
      pc(hue, sat * 0.70, clamp(avgL + 0.12, 0.08, 0.90)),
      pc(hue, sat, clamp(avgL - 0.15, 0.08, 0.90)),
      pc(hue, sat, 0.88),  // light extreme
      pc(hue, sat, 0.10),  // dark extreme
      ...extras,
    ];
  }

  if (maxGap > 60) {
    const desc = maxGap > 150
      ? `There's a ${Math.round(maxGap)}° gap in your palette hues — these colors would bridge it nicely.`
      : `Fill the ${Math.round(maxGap)}° hue gap to add variety and visual range.`;
    groups.push({
      id: 'fill-gap', name: 'Fill the Gap', description: desc,
      colors: bestColors(pool(gapMid, avgS, [pc((gapMid + 20) % 360, avgS), pc((gapMid - 20 + 360) % 360, avgS)])),
    });
  }

  // 2. Add a complement (if no color sits within 35° of the mean complement)
  const compHue = (meanHue + 180) % 360;
  const hasComplement = hues.some(h => angDistDeg(h, compHue) < 35);
  if (!hasComplement) {
    groups.push({
      id: 'add-complement', name: 'Add Contrast',
      description: 'None of your colors contrast sharply with the others. A complementary hue would make accents and CTAs pop.',
      colors: bestColors(pool(compHue, avgS, [pc((compHue + 25) % 360, avgS), pc((compHue - 25 + 360) % 360, avgS)])),
    });
  }

  // 3. Temperature balance — warm: h < 65 || h > 295; cool: h >= 165 && h <= 265
  const isWarm = h => h < 65 || h > 295;
  const isCool = h => h >= 165 && h <= 265;
  const chromatic = colorData.filter(c => c.s > 0.15);
  if (chromatic.length >= 2) {
    const warmC = chromatic.filter(c => isWarm(c.h)).length;
    const coolC = chromatic.filter(c => isCool(c.h)).length;
    const total = chromatic.length;
    const tooWarm = warmC / total > 0.75;
    const tooCool = coolC / total > 0.75;
    if (tooWarm || tooCool) {
      const balHue = tooWarm ? 210 : 30;
      groups.push({
        id: 'balance-temp', name: 'Balance the Temperature',
        description: `Your palette skews ${tooWarm ? 'warm' : 'cool'}. A ${tooWarm ? 'cool' : 'warm'} tone would balance it out.`,
        colors: bestColors(pool(balHue, avgS, [pc((balHue + 20) % 360, avgS), pc((balHue - 20 + 360) % 360, avgS)])),
      });
    }
  }

  // 4. Complete the triad — if two colors are ~90–150° apart, suggest the third vertex
  let triadDone = false;
  for (let i = 0; i < colorData.length && !triadDone; i++) {
    for (let j = i + 1; j < colorData.length && !triadDone; j++) {
      const d = angDistDeg(colorData[i].h, colorData[j].h);
      if (d >= 90 && d <= 150) {
        const thirdH = (colorData[i].h + 120) % 360;
        const altH   = (colorData[i].h + 240) % 360;
        if (hues.every(h => angDistDeg(h, thirdH) > 30 && angDistDeg(h, altH) > 30)) {
          triadDone = true;
          groups.push({
            id: 'complete-triad', name: 'Complete the Triad',
            description: `${colorData[i].hex} and ${colorData[j].hex} are almost triadic — add the third hue to complete the set.`,
            colors: bestColors(pool(thirdH, avgS, [pc(altH, avgS), pc(altH, avgS, 0.88), pc(altH, avgS, 0.10)])),
          });
        }
      }
    }
  }

  // 5. Add a light anchor (L > 0.75) if missing
  if (!colorData.some(c => c.l > 0.75)) {
    groups.push({
      id: 'add-light-anchor', name: 'Add a Light Anchor',
      description: 'Your palette has no light base color. Add one for backgrounds, surfaces, or airy accents.',
      colors: bestColors([0.96, 0.90, 0.84, 0.78, 0.72, 0.66, 0.62, 0.58].map(l => pc(meanHue, avgS * 0.08, l))),
    });
  }

  // 6. Add a dark anchor (L < 0.25) if missing
  if (!colorData.some(c => c.l < 0.25)) {
    groups.push({
      id: 'add-dark-anchor', name: 'Add a Dark Anchor',
      description: 'Your palette has no dark color. Add one for text, shadows, or depth.',
      colors: bestColors([0.08, 0.12, 0.17, 0.22, 0.28, 0.35, 0.40, 0.45].map(l => pc(meanHue, avgS * 0.12, l))),
    });
  }

  // Fallback: palette is already well-balanced
  if (groups.length === 0) {
    groups.push({
      id: 'explore', name: 'Explore Variations',
      description: 'Your palette looks well-balanced! Here are some variations to explore.',
      colors: bestColors(pool(meanHue, avgS * 0.45, [
        pc((meanHue + 30) % 360, avgS), pc((meanHue - 30 + 360) % 360, avgS),
        pc((meanHue + 60) % 360, avgS), pc((meanHue - 60 + 360) % 360, avgS),
      ])),
    });
  }

  // Neutrals anchored to the palette's mean hue
  const nSatL = clamp(avgS * 0.07, 0.01, 0.07);
  const nSatD = clamp(avgS * 0.12, 0.02, 0.12);
  const neutrals = {
    lights: [0.96, 0.88, 0.80, 0.72, 0.64].map(l => toObj(mkColor(meanHue, nSatL, l))),
    darks:  [0.08, 0.13, 0.20, 0.28, 0.36].map(l => toObj(mkColor(meanHue, nSatD, l))),
  };

  return { harmonies: groups.slice(0, 4), neutrals, mode: 'palette' };
}

// ── POST /api/suggestions ─────────────────────────────────────────────────────

app.post('/api/suggestions', (req, res) => {
  const { color, colors: colorsArr, variant = 0 } = req.body;

  // Palette-aware mode when 2+ colors are provided
  if (Array.isArray(colorsArr) && colorsArr.length >= 2) {
    const result = getPaletteCompletionSuggestions(colorsArr, variant);
    if (!result) return res.status(400).json({ error: 'Need at least 2 valid colors' });
    return res.json(result);
  }

  if (!color) return res.status(400).json({ error: 'color required' });

  let c;
  try { c = chroma(color); } catch { return res.status(400).json({ error: 'invalid color' }); }

  const [, rawS, rawL] = c.hsl();
  const H = safeHue(color);

  // Apply variant shift to harmony colors (not neutrals)
  const v = VARIANTS[Math.max(0, Math.min(4, Number(variant) || 0))];
  const vs = clamp(rawS * v.sMulti, 0.06, 1);
  const vl = clamp(rawL + v.lOff, 0.08, 0.90);

  function vm(h, s = vs, l = vl) {
    return mkColor(h, clamp(s * v.sMulti, 0.06, 1), clamp(l + v.lOff, 0.08, 0.90));
  }

  const harmonies = [
    {
      id: 'complementary',
      name: 'Complementary',
      description: 'The opposite hue — bold contrast for CTAs and hero elements.',
      colors: [color, vm(H + 180), vm(H, vs, clamp(vl + 0.18, 0.08, 0.90)), vm(H + 180, vs, clamp(vl + 0.18, 0.08, 0.90)), vm(H, vs, clamp(vl - 0.15, 0.08, 0.90)), vm(H + 180, vs, clamp(vl - 0.15, 0.08, 0.90))].map(toObj),
    },
    {
      id: 'analogous',
      name: 'Analogous',
      description: 'Adjacent hues for a cohesive, natural brand feel.',
      colors: [vm(H - 40), vm(H - 20), color, vm(H + 20), vm(H + 40), vm(H + 60)].map(toObj),
    },
    {
      id: 'triadic',
      name: 'Triadic',
      description: 'Three evenly spaced hues — vibrant and well-balanced.',
      colors: [color, vm(H + 120), vm(H + 240), vm(H, vs, clamp(vl + 0.15, 0.08, 0.90)), vm(H + 120, vs, clamp(vl + 0.15, 0.08, 0.90)), vm(H + 240, vs, clamp(vl + 0.15, 0.08, 0.90))].map(toObj),
    },
    {
      id: 'split-complementary',
      name: 'Split-Complementary',
      description: 'Richer contrast than complementary, softer than triadic.',
      colors: [color, vm(H + 150), vm(H + 210), vm(H, vs, clamp(vl - 0.12, 0.08, 0.90)), vm(H + 150, vs, clamp(vl - 0.12, 0.08, 0.90)), vm(H + 210, vs, clamp(vl - 0.12, 0.08, 0.90))].map(toObj),
    },
    {
      id: 'tetradic',
      name: 'Tetradic',
      description: 'Four colors in a rectangle — versatile, rich options.',
      colors: [color, vm(H + 90), vm(H + 180), vm(H + 270), vm(H, vs, clamp(vl + 0.15, 0.08, 0.90)), vm(H + 180, vs, clamp(vl + 0.15, 0.08, 0.90))].map(toObj),
    },
    {
      id: 'monochromatic',
      name: 'Monochromatic',
      description: 'Tints and shades of one hue — elegant, unified, safe.',
      colors: [0.90, 0.74, 0.58, rawL, clamp(rawL - 0.18, 0.08, 0.90), clamp(rawL - 0.35, 0.08, 0.90)]
        .map(l => mkColor(H, rawS, l))
        .map(toObj),
    },
  ];

  // Neutrals — always derived from base hue at near-zero saturation (not affected by variant)
  const nSatL = clamp(rawS * 0.07, 0.01, 0.07);
  const nSatD = clamp(rawS * 0.12, 0.02, 0.12);
  const neutrals = {
    lights: [0.96, 0.88, 0.80, 0.72, 0.64].map(l => toObj(mkColor(H, nSatL, l))),
    darks:  [0.08, 0.13, 0.20, 0.28, 0.36].map(l => toObj(mkColor(H, nSatD, l))),
  };

  res.json({ harmonies, neutrals });
});

// ── POST /api/harmonize ───────────────────────────────────────────────────────

app.post('/api/harmonize', (req, res) => {
  const { colors } = req.body;
  if (!Array.isArray(colors) || colors.length < 2)
    return res.status(400).json({ error: 'Need at least 2 colors' });

  const valid = colors.filter(c => { try { chroma(c); return true; } catch { return false; } });
  if (valid.length < 2)
    return res.status(400).json({ error: 'Need at least 2 valid colors' });

  const angDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  const colorData = valid.map(hex => {
    const [h, s, l] = chroma(hex).hsl();
    return { hex: hex.toUpperCase(), h: (isNaN(h) || h == null) ? 0 : h, s, l };
  });

  const baseHue = colorData[0].h;
  const intervals = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
  const issues = [];

  // ── Harmony check (hue angles) ────────────────────────────────────────────
  colorData.forEach((c, i) => {
    if (i === 0) return;
    const fromBase = ((c.h - baseHue) + 360) % 360;
    const nearest = intervals.reduce(
      (best, angle) => { const dist = angDist(fromBase, angle); return dist < best.dist ? { angle, dist } : best; },
      { angle: 0, dist: Infinity }
    );
    if (nearest.dist > 20) {
      const fixedHue = (baseHue + nearest.angle + 360) % 360;
      issues.push({
        type: 'harmony',
        color: c.hex,
        index: i,
        deviation: Math.round(nearest.dist),
        severity: nearest.dist > 40 ? 'error' : 'warning',
        suggestion: chroma.hsl(fixedHue, c.s, c.l).hex().toUpperCase(),
        description: `${Math.round(nearest.dist)}° off from the nearest harmony point — it clashes with the rest of your palette.`,
        fixLabel: 'Color feels off → Swap with this harmony-based alternative',
      });
    }
  });

  // ── Too dark ──────────────────────────────────────────────────────────────
  colorData.forEach((c, i) => {
    if (c.l < 0.13) {
      const targetL = clamp(c.l + 0.20, 0.18, 0.92);
      issues.push({
        type: 'too-dark',
        color: c.hex,
        index: i,
        deviation: Math.round((0.13 - c.l) * 100),
        severity: c.l < 0.07 ? 'error' : 'warning',
        suggestion: chroma.hsl(c.h, c.s, targetL).hex().toUpperCase(),
        description: `Very dark at ${Math.round(c.l * 100)}% lightness — it'll disappear on dark backgrounds and limit where you can use it.`,
        fixLabel: 'Too dark to use → Lighten it up for more versatility',
      });
    }
  });

  // ── Too vibrant ───────────────────────────────────────────────────────────
  colorData.forEach((c, i) => {
    if (c.s > 0.92 && c.l > 0.35 && c.l < 0.78) {
      issues.push({
        type: 'too-vibrant',
        color: c.hex,
        index: i,
        deviation: Math.round((c.s - 0.75) * 100),
        severity: c.s > 0.98 ? 'error' : 'warning',
        suggestion: chroma.hsl(c.h, 0.76, c.l).hex().toUpperCase(),
        description: `Extremely saturated at ${Math.round(c.s * 100)}% — causes eye strain and clashes with neutrals.`,
        fixLabel: 'Too vibrant → Tone it down with this softer variant',
      });
    }
  });

  // ── Too similar to another palette color ──────────────────────────────────
  for (let i = 0; i < colorData.length; i++) {
    for (let j = i + 1; j < colorData.length; j++) {
      const hueDist = angDist(colorData[i].h, colorData[j].h);
      const lDist   = Math.abs(colorData[i].l - colorData[j].l);
      if (hueDist < 18 && lDist < 0.12) {
        if (!issues.some(iss => iss.color === colorData[j].hex && iss.type === 'too-similar')) {
          const newL = clamp(colorData[j].l + 0.24, 0.08, 0.92);
          issues.push({
            type: 'too-similar',
            color: colorData[j].hex,
            index: j,
            deviation: Math.round(15 - hueDist),
            severity: 'warning',
            suggestion: chroma.hsl(colorData[j].h, colorData[j].s, newL).hex().toUpperCase(),
            description: `Nearly identical to color #${i + 1} — they'll blend together and reduce your palette's range.`,
            fixLabel: 'Too similar to another color → Differentiate with this variant',
          });
        }
      }
    }
  }

  // ── No dominant color ─────────────────────────────────────────────────────
  const maxSat = Math.max(...colorData.map(c => c.s));
  if (maxSat < 0.55 && colorData.length >= 3) {
    const mostSat = colorData.reduce((a, b) => a.s > b.s ? a : b);
    issues.push({
      type: 'no-dominant',
      color: mostSat.hex,
      index: colorData.indexOf(mostSat),
      deviation: Math.round((0.65 - mostSat.s) * 100),
      severity: 'warning',
      suggestion: chroma.hsl(mostSat.h, clamp(mostSat.s + 0.30, 0.50, 0.90), mostSat.l).hex().toUpperCase(),
      description: `No color stands out — max saturation is only ${Math.round(mostSat.s * 100)}%. Boost one color to create a clear visual anchor.`,
      fixLabel: 'No clear hero color → Boost this one to lead the palette',
    });
  }

  // ── Flat lightness distribution ───────────────────────────────────────────
  const lValues = colorData.map(c => c.l);
  const lMax = Math.max(...lValues), lMin = Math.min(...lValues);
  const lSpread = lMax - lMin;
  if (lSpread < 0.28 && colorData.length >= 3) {
    const avgL = lValues.reduce((s, v) => s + v, 0) / lValues.length;
    const targetL = avgL > 0.55 ? 0.10 : 0.92;
    const baseHue = colorData[0].h;
    const flatSuggestion = chroma.hsl(baseHue, 0.06, targetL).hex().toUpperCase();
    issues.push({
      type: 'flat-lightness',
      color: colorData[0].hex,
      index: 0,
      deviation: Math.round((0.35 - lSpread) * 100),
      severity: 'warning',
      suggestion: flatSuggestion,
      description: `All colors fall within a ${Math.round(lSpread * 100)}% lightness range — no light or dark anchor. Adding contrast depth makes the palette more versatile.`,
      fixLabel: 'Flat lightness range → Add this depth anchor',
    });
  }

  // ── Palette-level balance issues ──────────────────────────────────────────
  const balanceIssues = [];
  const hasNeutral = colorData.some(c => c.s < 0.15);
  if (!hasNeutral && colorData.length >= 3) {
    const lightNeutral = chroma.hsl(colorData[0].h, 0.05, 0.92).hex().toUpperCase();
    balanceIssues.push({
      type: 'missing-neutral',
      description: 'No neutral found. A light or dark neutral grounds your palette and is essential for backgrounds, text, and borders.',
      suggestion: lightNeutral,
      fixLabel: 'Palette feels unbalanced → Add this grounding neutral',
    });
  }

  // Temperature imbalance
  const nonNeutrals = colorData.filter(c => c.s >= 0.15);
  if (nonNeutrals.length >= 3) {
    const warm    = nonNeutrals.filter(c => c.h < 75 || c.h >= 300);
    const cool    = nonNeutrals.filter(c => c.h >= 150 && c.h < 285);
    const wRatio  = warm.length / nonNeutrals.length;
    const cRatio  = cool.length / nonNeutrals.length;
    if (wRatio >= 0.80 || cRatio >= 0.80) {
      const isWarmDom = wRatio >= 0.80;
      const balancingH = isWarmDom
        ? ((colorData[0].h + 180) % 360)
        : ((colorData[0].h + 30 + 360) % 360);
      balanceIssues.push({
        type: 'temperature-imbalance',
        description: `${isWarmDom ? 'Warm' : 'Cool'}-heavy palette — ${Math.round((isWarmDom ? wRatio : cRatio) * 100)}% of your colors lean ${isWarmDom ? 'warm' : 'cool'}. A balancing ${isWarmDom ? 'cool' : 'warm'} tone adds visual depth.`,
        suggestion: chroma.hsl(balancingH, 0.55, 0.55).hex().toUpperCase(),
        fixLabel: `${isWarmDom ? 'Too warm' : 'Too cool'} → Add this balancing ${isWarmDom ? 'cool' : 'warm'} tone`,
      });
    }
  }

  const saturatedCount = colorData.filter(c => c.s > 0.60).length;
  if (colorData.length >= 3 && saturatedCount / colorData.length > 0.60) {
    const softNeutral = chroma.hsl(colorData[0].h, 0.08, 0.88).hex().toUpperCase();
    balanceIssues.push({
      type: 'too-many-saturated',
      description: `${saturatedCount} of ${colorData.length} colors are highly saturated — this creates visual noise. A soft neutral will give the eye somewhere to rest.`,
      suggestion: softNeutral,
      fixLabel: 'Too many bright colors → Try adding this soft neutral',
    });
  }

  // ── Detect harmony type ───────────────────────────────────────────────────
  const diffs = colorData.slice(1).map(c => ((c.h - baseHue) + 360) % 360);
  let detectedType = 'Custom';
  if (valid.length === 2) {
    const d = diffs[0];
    if (angDist(d, 180) <= 20) detectedType = 'Complementary';
    else if (angDist(d, 30) <= 20 || angDist(d, 330) <= 20) detectedType = 'Analogous';
  } else if (valid.length === 3) {
    if (diffs.every(d => angDist(d, 120) <= 25 || angDist(d, 240) <= 25)) detectedType = 'Triadic';
    else if (diffs.every(d => angDist(d, 150) <= 25 || angDist(d, 210) <= 25)) detectedType = 'Split-Complementary';
    else if (diffs.every(d => d <= 60)) detectedType = 'Analogous';
  } else if (valid.length === 4) {
    if (diffs.every(d => [90, 180, 270].some(i => angDist(d, i) <= 25))) detectedType = 'Tetradic';
  } else if (colorData.every(c => angDist(c.h, baseHue) < 15)) {
    detectedType = 'Monochromatic';
  }

  const penaltyPerIssue = { error: 25, warning: 12 };
  const harmonyScore  = Math.max(0, 100 - issues.reduce((s, i) => s + (penaltyPerIssue[i.severity] ?? 10), 0));
  const balanceScore  = Math.max(0, 100 - balanceIssues.length * 20);
  const overallScore  = Math.round((harmonyScore + balanceScore) / 2);
  const score = overallScore;

  const healthScore = { harmony: harmonyScore, balance: balanceScore, overall: overallScore };

  // ── Palette metrics ────────────────────────────────────────────────────────
  const sValues   = colorData.map(c => c.s);
  const allL      = colorData.map(c => c.l);
  const lMin2     = Math.min(...allL), lMax2 = Math.max(...allL);
  const lSpread2  = lMax2 - lMin2;
  const satLow    = colorData.filter(c => c.s < 0.25).length;
  const satMid    = colorData.filter(c => c.s >= 0.25 && c.s < 0.65).length;
  const satHigh   = colorData.filter(c => c.s >= 0.65).length;
  const warmC     = colorData.filter(c => c.s >= 0.15 && (c.h < 75 || c.h >= 300)).length;
  const coolC     = colorData.filter(c => c.s >= 0.15 && c.h >= 150 && c.h < 285).length;
  const neutralC  = colorData.filter(c => c.s < 0.15).length;
  const tempLabel = warmC > coolC * 1.5 ? 'Warm-dominant' : coolC > warmC * 1.5 ? 'Cool-dominant' : 'Balanced';
  const hueZones  = new Set(colorData.filter(c => c.s >= 0.15).map(c => Math.floor(c.h / 60)));
  const avgSat    = sValues.reduce((a, b) => a + b, 0) / sValues.length;

  const metrics = {
    saturation: {
      low: satLow, mid: satMid, high: satHigh,
      avgPct: Math.round(avgSat * 100),
      label: avgSat < 0.25 ? 'Muted' : avgSat < 0.55 ? 'Balanced' : 'Vivid',
    },
    lightness: {
      min: Math.round(lMin2 * 100),
      max: Math.round(lMax2 * 100),
      spread: Math.round(lSpread2 * 100),
      label: lSpread2 > 0.55 ? 'Wide' : lSpread2 > 0.30 ? 'Moderate' : 'Narrow',
    },
    temperature: { warm: warmC, cool: coolC, neutral: neutralC, label: tempLabel },
    hueDiversity: hueZones.size,
    total: colorData.length,
  };

  res.json({
    detectedType,
    score,
    healthScore,
    metrics,
    issues,
    balanceIssues,
    colorData: colorData.map(c => ({
      hex: c.hex,
      hue: Math.round(c.h),
      angle: Math.round(((c.h - baseHue) + 360) % 360),
    })),
  });
});

// ── POST /api/accessibility ───────────────────────────────────────────────────

app.post('/api/accessibility', (req, res) => {
  const { colors } = req.body;
  if (!Array.isArray(colors) || colors.length < 2)
    return res.status(400).json({ error: 'Need at least 2 colors' });

  const valid = colors.filter(c => { try { chroma(c); return true; } catch { return false; } });
  if (valid.length < 2)
    return res.status(400).json({ error: 'Need at least 2 valid colors' });

  const pairs = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = 0; j < valid.length; j++) {
      if (i === j) continue;
      const ratio = Math.round(chroma.contrast(valid[i], valid[j]) * 100) / 100;
      const normalAA = ratio >= 4.5;
      const rawFix   = !normalAA ? findAccessibleForeground(valid[i], valid[j], 4.5) : null;
      const quickFix = rawFix ? { ...rawFix, label: makeFixLabel(valid[i], rawFix.hex) } : null;
      pairs.push({
        foreground: valid[i].toUpperCase(),
        background: valid[j].toUpperCase(),
        ratio,
        normalAA,
        normalAAA: ratio >= 7,
        largeAA:   ratio >= 3,
        largeAAA:  ratio >= 4.5,
        quickFix,
      });
    }
  }

  pairs.sort((a, b) => b.ratio - a.ratio);
  res.json({ pairs });
});

// ── Static files (production) ─────────────────────────────────────────────────

const distPath = join(__dirname, 'client', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n  Palette  →  http://localhost:${PORT}\n`);
});
