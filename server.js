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

// ── Smart adaptive palette suggestions ───────────────────────────────────────
function getSmartSuggestions(hexes, variant = 0) {
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

  // ── Palette state analysis ────────────────────────────────────────────────
  const hasLight        = colorData.some(c => c.l > 0.78);
  const hasDark         = colorData.some(c => c.l < 0.22);
  const hasNeutral      = colorData.some(c => c.s < 0.12);
  const hasVibrantAccent = colorData.some(c => c.s > 0.55 && c.l > 0.30 && c.l < 0.72);
  const overSaturated   = avgS > 0.60 && colorData.every(c => c.s > 0.45);

  let hasAAContrast = false;
  for (let i = 0; i < colorData.length && !hasAAContrast; i++) {
    for (let j = i + 1; j < colorData.length && !hasAAContrast; j++) {
      if (chroma.contrast(colorData[i].hex, colorData[j].hex) >= 4.5) hasAAContrast = true;
    }
  }

  const chromatic = colorData.filter(c => c.s >= 0.15);
  const warmCount = chromatic.filter(c => c.h < 65 || c.h > 295).length;
  const coolCount = chromatic.filter(c => c.h >= 165 && c.h <= 265).length;
  const isWarmDom = chromatic.length >= 3 && warmCount / chromatic.length >= 0.80;
  const isCoolDom = chromatic.length >= 3 && coolCount / chromatic.length >= 0.80;
  const tempSkew  = isWarmDom || isCoolDom;

  const hues = colorData.map(c => c.h).sort((a, b) => a - b);
  let maxGap = 0, gapStart = 0;
  for (let i = 0; i < hues.length; i++) {
    const gap = i < hues.length - 1 ? hues[i + 1] - hues[i] : (hues[0] + 360) - hues[i];
    if (gap > maxGap) { maxGap = gap; gapStart = hues[i]; }
  }
  const gapMid    = (gapStart + maxGap / 2) % 360;
  const compHue   = (meanHue + 180) % 360;
  const hasComp   = hues.some(h => angDistDeg(h, compHue) < 35);

  // ── Color generation helpers ──────────────────────────────────────────────
  function pc(hue, sat, lBase) {
    return toObj(mkColor(hue, clamp(sat * v.sMulti, 0.02, 1), clamp(lBase + v.lOff, 0.04, 0.97)));
  }

  function a11yScore(hex) {
    try {
      const existing = hexes.reduce((sum, ex) => {
        const r = chroma.contrast(hex, ex);
        return sum + (r >= 4.5 ? 2 : r >= 3 ? 1 : 0);
      }, 0);
      const vsW = chroma.contrast(hex, '#FFFFFF');
      const vsB = chroma.contrast(hex, '#000000');
      return existing + Math.max(vsW >= 4.5 ? 4 : vsW >= 3 ? 2 : 0, vsB >= 4.5 ? 4 : vsB >= 3 ? 2 : 0);
    } catch { return 0; }
  }

  function best(pool) {
    return [...pool].sort((a, b) => a11yScore(b.hex) - a11yScore(a.hex)).slice(0, 6);
  }

  // ── Scenario detection + suggestion generation ────────────────────────────
  const suggestions = [];

  // 1. No AA contrast anywhere → accessibility emergency
  if (!hasAAContrast) {
    suggestions.push({
      id: 'improve-accessibility', intent: 'accessibility',
      name: 'Improve accessibility',
      reason: "No two colors in your palette achieve 4.5:1 contrast — you can't create readable text yet.",
      colors: best([
        ...[0.94, 0.90, 0.85, 0.80].map(l => pc(meanHue, 0.05, l)),
        ...[0.08, 0.12, 0.16, 0.20].map(l => pc(meanHue, 0.12, l)),
      ]),
    });
  }

  // 2. No dark anchor → can't do text or depth
  if (!hasDark) {
    suggestions.push({
      id: 'add-dark', intent: 'depth',
      name: 'Add a dark anchor',
      reason: "Your palette has no color dark enough for headings, body text, or depth. This is a functional gap.",
      colors: best([0.07, 0.10, 0.14, 0.17, 0.20, 0.24].flatMap(l => [
        pc(meanHue, 0.06, l), pc(meanHue, 0.12, l),
      ])),
    });
  }

  // 3. No light anchor → can't do backgrounds or surfaces
  if (!hasLight) {
    suggestions.push({
      id: 'add-light', intent: 'space',
      name: 'Add a light anchor',
      reason: "Your palette has no light color for backgrounds or surfaces. Without one, UI layouts have nowhere to breathe.",
      colors: best([0.95, 0.91, 0.87, 0.83, 0.79, 0.75].flatMap(l => [
        pc(meanHue, 0.04, l), pc(meanHue, 0.07, l),
      ])),
    });
  }

  // 4. Over-saturated → needs muted support colors
  if (overSaturated && suggestions.length < 4) {
    suggestions.push({
      id: 'reduce-saturation', intent: 'balance',
      name: 'Balance your saturation',
      reason: `Your palette averages ${Math.round(avgS * 100)}% saturation — it needs softer, muted tones so the eye has somewhere to rest.`,
      colors: best([0.90, 0.78, 0.58, 0.38, 0.18].flatMap(l => [
        pc(meanHue, 0.05, l), pc(meanHue, 0.08, l),
      ])),
    });
  }

  // 5. No neutral at all (and not already covered by over-saturated)
  if (!hasNeutral && !overSaturated && colorData.length >= 3 && suggestions.length < 4) {
    suggestions.push({
      id: 'add-neutral', intent: 'grounding',
      name: 'Your palette needs grounding',
      reason: "Every color in your palette is saturated. Neutral tones are essential for backgrounds, borders, and resting areas in any real UI.",
      colors: best([0.96, 0.88, 0.72, 0.50, 0.28, 0.12].flatMap(l => [
        pc(meanHue, 0.05, l), pc(meanHue, 0.08, l),
      ])),
    });
  }

  // 6. Has light + dark but no vibrant accent → needs hierarchy
  if (hasLight && hasDark && !hasVibrantAccent && suggestions.length < 4) {
    suggestions.push({
      id: 'strengthen-hierarchy', intent: 'hierarchy',
      name: 'Strengthen visual hierarchy',
      reason: "You have light and dark values but no vibrant accent. Nothing stands out as a CTA, link color, or brand anchor.",
      colors: best([0.42, 0.48, 0.54, 0.60, 0.50, 0.44].flatMap(l => [
        pc(meanHue, 0.78, l), pc(compHue, 0.75, l),
      ])),
    });
  }

  // 7. Large hue gap (only if no structural issues dominate)
  if (maxGap > 70 && suggestions.filter(s => ['improve-accessibility','add-dark','add-light'].includes(s.id)).length === 0 && suggestions.length < 4) {
    suggestions.push({
      id: 'fill-gap', intent: 'variety',
      name: 'Fill the hue gap',
      reason: `There's a ${Math.round(maxGap)}° gap in your palette's hue spectrum. These colors bridge it and add visual variety.`,
      colors: best([
        pc(gapMid, avgS, avgL),
        pc(gapMid, avgS, clamp(avgL + 0.22, 0.08, 0.92)),
        pc(gapMid, avgS * 0.65, clamp(avgL + 0.15, 0.08, 0.92)),
        pc(gapMid, avgS, clamp(avgL - 0.15, 0.08, 0.92)),
        pc(gapMid, avgS, 0.90), pc(gapMid, avgS, 0.10),
        pc((gapMid + 22) % 360, avgS, avgL), pc((gapMid - 22 + 360) % 360, avgS, avgL),
      ]),
    });
  }

  // 8. No complementary hue
  if (!hasComp && !suggestions.some(s => s.id === 'fill-gap') && suggestions.length < 4) {
    suggestions.push({
      id: 'add-complement', intent: 'contrast',
      name: 'Add a contrasting hue',
      reason: "None of your colors contrast sharply in hue. A complementary tone makes accents, CTAs, and callouts pop.",
      colors: best([
        pc(compHue, avgS, avgL),
        pc(compHue, avgS, clamp(avgL + 0.22, 0.08, 0.92)),
        pc(compHue, avgS, clamp(avgL - 0.20, 0.08, 0.92)),
        pc(compHue, avgS, 0.90), pc(compHue, avgS, 0.10),
        pc((compHue + 25) % 360, avgS, avgL), pc((compHue - 25 + 360) % 360, avgS, avgL),
      ]),
    });
  }

  // 9. Temperature skew
  if (tempSkew && suggestions.length < 4) {
    const balHue = isWarmDom ? 210 : 30;
    suggestions.push({
      id: 'balance-temperature', intent: 'balance',
      name: 'Balance the temperature',
      reason: `Your palette is ${isWarmDom ? 'warm' : 'cool'}-heavy. A ${isWarmDom ? 'cool' : 'warm'} tone adds range and prevents visual monotony.`,
      colors: best([avgL, clamp(avgL + 0.22, 0.08, 0.92), clamp(avgL - 0.22, 0.08, 0.92), 0.90, 0.10].map(l =>
        pc(balHue, avgS, l)
      )),
    });
  }

  // 10. Complete a near-triad
  if (suggestions.length < 3) {
    for (let i = 0; i < colorData.length; i++) {
      for (let j = i + 1; j < colorData.length; j++) {
        const d = angDistDeg(colorData[i].h, colorData[j].h);
        if (d >= 90 && d <= 150) {
          const thirdH = (colorData[i].h + 120) % 360;
          if (hues.every(h => angDistDeg(h, thirdH) > 30)) {
            suggestions.push({
              id: 'complete-triad', intent: 'variety',
              name: 'Complete the triad',
              reason: `${colorData[i].hex} and ${colorData[j].hex} are near-triadic — the third hue would complete a harmonically balanced set.`,
              colors: best([
                pc(thirdH, avgS, avgL),
                pc(thirdH, avgS, 0.90), pc(thirdH, avgS, 0.10),
                pc(thirdH, avgS, clamp(avgL + 0.22, 0.08, 0.92)),
              ]),
            });
          }
          break;
        }
      }
      if (suggestions.some(s => s.id === 'complete-triad')) break;
    }
  }

  // Fallback — palette is solid, suggest optional refinements
  if (suggestions.length === 0) {
    suggestions.push({
      id: 'explore', intent: 'explore',
      name: 'Explore refinements',
      reason: "Your palette looks well-balanced. Here are some optional variations to consider.",
      colors: best([
        pc(meanHue, avgS * 0.45, clamp(avgL + 0.14, 0.08, 0.92)),
        pc((meanHue + 30) % 360, avgS, avgL),
        pc((meanHue - 30 + 360) % 360, avgS, avgL),
        pc((meanHue + 60) % 360, avgS, avgL),
        pc(meanHue, avgS * 0.18, 0.94),
        pc(meanHue, avgS * 0.18, 0.08),
      ]),
    });
  }

  // ── Adaptive header message ───────────────────────────────────────────────
  let headerMessage;
  const ids = suggestions.map(s => s.id);
  if (ids.includes('improve-accessibility')) {
    headerMessage = 'These suggestions improve readability and accessibility';
  } else if (ids.includes('add-dark') && ids.includes('add-light')) {
    headerMessage = 'Your palette is missing functional anchor colors';
  } else if (ids.includes('add-dark') || ids.includes('add-light')) {
    headerMessage = 'Your palette could use one more functional anchor';
  } else if (ids.includes('reduce-saturation') || ids.includes('add-neutral')) {
    headerMessage = 'Your palette needs more balance and breathing room';
  } else if (ids.includes('strengthen-hierarchy')) {
    headerMessage = 'Your palette has structure — these sharpen it';
  } else if (ids.length === 1 && ids[0] === 'explore') {
    headerMessage = 'Your palette is solid — here are optional refinements';
  } else {
    headerMessage = 'These suggestions address specific gaps in your palette';
  }

  return { suggestions: suggestions.slice(0, 4), headerMessage, mode: 'palette' };
}

// ── POST /api/suggestions ─────────────────────────────────────────────────────

app.post('/api/suggestions', (req, res) => {
  const { color, colors: colorsArr, variant = 0 } = req.body;

  // Palette-aware mode when 2+ colors are provided
  if (Array.isArray(colorsArr) && colorsArr.length >= 2) {
    const result = getSmartSuggestions(colorsArr, variant);
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

// ── POST /api/analyze ─────────────────────────────────────────────────────────

function explainContrastFailure(fg, bg) {
  try {
    const fgL = chroma(fg).hsl()[2];
    const bgL = chroma(bg).hsl()[2];
    const fgMid = fgL > 0.3 && fgL < 0.7;
    const bgMid = bgL > 0.3 && bgL < 0.7;
    if (fgMid && bgMid) {
      return `Both colors are mid-toned (${Math.round(fgL*100)}% and ${Math.round(bgL*100)}% lightness) — need one dark and one light to achieve readable contrast.`;
    }
    if (fgMid) {
      const dir = bgL > 0.5 ? 'darker' : 'lighter';
      return `Foreground is mid-toned at ${Math.round(fgL*100)}% lightness — needs to be ${dir} to contrast against this ${bgL > 0.5 ? 'light' : 'dark'} background.`;
    }
    if (bgMid) {
      return `Background at ${Math.round(bgL*100)}% lightness is in the mid-tone danger zone — difficult for any foreground to achieve 4.5:1 against it.`;
    }
    if (Math.abs(fgL - bgL) < 0.2) {
      return `Colors are too similar in lightness (${Math.round(fgL*100)}% vs ${Math.round(bgL*100)}%) — need greater lightness difference for readable text.`;
    }
    return `Contrast falls short of the 4.5:1 threshold required for normal-sized text (WCAG AA).`;
  } catch { return 'Contrast is too low for readable text.'; }
}

function analyzeIssues(colorData, meanHue, avgS) {
  const issues = [];

  if (!colorData.some(c => c.l < 0.25)) {
    const hex = mkColor(meanHue, Math.min(avgS * 0.15, 0.10), 0.09);
    issues.push({
      id: 'no-dark', severity: 'error',
      title: 'No dark color for text',
      explanation: "You have no colors dark enough for body text. This means you can't create readable text on light backgrounds — a core requirement for any brand palette.",
      fix: { hex, name: nameColor(hex), impact: 'A text/heading color that achieves 14:1+ contrast on white backgrounds' },
    });
  }

  if (!colorData.some(c => c.l > 0.75)) {
    const hex = mkColor(meanHue, Math.min(avgS * 0.06, 0.05), 0.96);
    issues.push({
      id: 'no-light', severity: 'error',
      title: 'No light color for backgrounds',
      explanation: "You have no colors light enough for backgrounds or surfaces. Without a light base, your palette can't support standard UI layouts.",
      fix: { hex, name: nameColor(hex), impact: 'A clean background that makes all your other colors readable' },
    });
  }

  const lValues = colorData.map(c => c.l);
  const lSpread = colorData.length > 1 ? Math.max(...lValues) - Math.min(...lValues) : 0;
  if (lSpread < 0.30 && colorData.length >= 3) {
    const avgLv = lValues.reduce((s, v) => s + v, 0) / lValues.length;
    const fixL = avgLv > 0.5 ? 0.08 : 0.94;
    const hex = mkColor(meanHue, avgS * 0.10, fixL);
    issues.push({
      id: 'flat-lightness', severity: 'warning',
      title: 'Flat lightness — missing depth',
      explanation: `All colors are within a ${Math.round(lSpread * 100)}% lightness range. A palette with no dark-to-light contrast can't support both text and backgrounds at the same time.`,
      fix: { hex, name: nameColor(hex), impact: `Adds a ${fixL < 0.3 ? 'dark' : 'light'} anchor, expanding your usable lightness range` },
    });
  }

  if (colorData.length >= 3 && !colorData.some(c => c.s < 0.15)) {
    const hex = mkColor(meanHue, 0.06, 0.92);
    issues.push({
      id: 'no-neutral', severity: 'warning',
      title: 'No neutral colors',
      explanation: "Every color in your palette is saturated. Without a neutral, your UI will feel overwhelming — neutrals give the eye somewhere to rest and handle backgrounds, borders, and text.",
      fix: { hex, name: nameColor(hex), impact: 'A palette-tinted neutral — harmonious, and usable for any surface or border' },
    });
  }

  const satCount = colorData.filter(c => c.s > 0.60).length;
  if (colorData.length >= 3 && satCount / colorData.length > 0.75 && !issues.some(i => i.id === 'no-neutral')) {
    const hex = mkColor(meanHue, 0.07, 0.90);
    issues.push({
      id: 'all-saturated', severity: 'warning',
      title: 'Too many saturated colors',
      explanation: `${satCount} of your ${colorData.length} colors are highly saturated. This creates visual noise — the eye has nowhere to rest.`,
      fix: { hex, name: nameColor(hex), impact: 'A soft palette-tinted neutral that reduces visual noise without breaking the hue theme' },
    });
  }

  const maxSat = colorData.length > 0 ? Math.max(...colorData.map(c => c.s)) : 0;
  if (maxSat < 0.50 && colorData.length >= 3) {
    const mostSat = colorData.reduce((a, b) => a.s > b.s ? a : b);
    const hex = mkColor(mostSat.h, Math.min(mostSat.s + 0.35, 0.85), mostSat.l);
    issues.push({
      id: 'no-dominant', severity: 'warning',
      title: 'No dominant brand color',
      explanation: `Your most saturated color is only ${Math.round(maxSat * 100)}% saturated. Without a dominant hue nothing draws the eye — no clear CTA or brand anchor.`,
      fix: { hex, name: nameColor(hex), impact: 'A vibrant version of your palette\'s lead color, ready to serve as a CTA or hero accent' },
      targetHex: mostSat.hex,
    });
  }

  const chromatic = colorData.filter(c => c.s > 0.15);
  if (chromatic.length >= 3) {
    const warm = chromatic.filter(c => c.h < 65 || c.h > 295).length;
    const cool = chromatic.filter(c => c.h >= 165 && c.h <= 265).length;
    const wR = warm / chromatic.length;
    const cR = cool / chromatic.length;
    if (wR >= 0.80 || cR >= 0.80) {
      const isWarm = wR >= 0.80;
      const hex = mkColor(isWarm ? 210 : 30, avgS * 0.70, 0.55);
      issues.push({
        id: 'temperature-skew', severity: 'warning',
        title: `${isWarm ? 'Warm' : 'Cool'}-heavy temperature`,
        explanation: `${Math.round((isWarm ? wR : cR) * 100)}% of your chromatic colors are ${isWarm ? 'warm' : 'cool'}. Mixing temperatures adds visual interest and range.`,
        fix: { hex, name: nameColor(hex), impact: `A ${isWarm ? 'cool' : 'warm'} tone to balance the palette's temperature` },
      });
    }
  }

  for (let i = 0; i < colorData.length && !issues.some(x => x.id === 'redundant-pair'); i++) {
    for (let j = i + 1; j < colorData.length; j++) {
      if (angDistDeg(colorData[i].h, colorData[j].h) < 15 && Math.abs(colorData[i].l - colorData[j].l) < 0.12) {
        const hex = mkColor(colorData[j].h, colorData[j].s, clamp(colorData[j].l + 0.28, 0.08, 0.95));
        issues.push({
          id: 'redundant-pair', severity: 'info',
          title: 'Redundant colors detected',
          explanation: `${colorData[i].hex} and ${colorData[j].hex} are nearly identical — same hue, similar lightness. They take up two palette slots without adding visual range.`,
          fix: { hex, name: nameColor(hex), impact: 'Differentiates this color by shifting its lightness away from its duplicate' },
          targetHex: colorData[j].hex,
        });
        break;
      }
    }
  }

  return issues;
}

function labelScore(score, max) {
  const p = score / max;
  if (p >= 0.85) return 'Excellent';
  if (p >= 0.65) return 'Good';
  if (p >= 0.40) return 'Fair';
  return 'Needs Work';
}

function computeHealth(colorData, pairs, issues) {
  const n = colorData.length;

  // Accessibility (0–30)
  let accessibility = n < 2 ? 15 : 0;
  if (pairs.length > 0) {
    const pct = pairs.filter(p => p.normalAA).length / pairs.length;
    if (pct === 1)       accessibility = 30;
    else if (pct >= 0.75) accessibility = 22;
    else if (pct >= 0.5)  accessibility = 15;
    else if (pct >= 0.25) accessibility = 8;
    else                  accessibility = 3;
  }

  // Tonal Balance (0–20)
  const lVals = colorData.map(c => c.l);
  const lSpread = n > 1 ? Math.max(...lVals) - Math.min(...lVals) : 0;
  let tonalBalance = 0;
  if      (lSpread > 0.65) tonalBalance = 20;
  else if (lSpread > 0.45) tonalBalance = 15;
  else if (lSpread > 0.30) tonalBalance = 10;
  else if (lSpread > 0.15) tonalBalance = 5;
  if (colorData.some(c => c.l > 0.75) && colorData.some(c => c.l < 0.25) && tonalBalance < 20)
    tonalBalance = Math.min(tonalBalance + 5, 20);

  // Functional Variety (0–20)
  let zones = 0;
  if (colorData.some(c => c.l < 0.25))                           zones++;
  if (colorData.some(c => c.l > 0.75))                           zones++;
  if (colorData.some(c => c.s > 0.5 && c.l > 0.35 && c.l < 0.65)) zones++;
  if (colorData.some(c => c.s < 0.15))                           zones++;
  const functionalVariety = Math.round((zones / 4) * 20);

  // Cohesion (0–15)
  let cohesion = 15;
  cohesion -= issues.filter(i => i.id === 'redundant-pair' || i.id === 'temperature-skew').length * 5;
  const hueDiversity = new Set(colorData.filter(c => c.s > 0.15).map(c => Math.floor(c.h / 60))).size;
  if (hueDiversity > 4) cohesion -= 4;
  cohesion = Math.max(0, cohesion);

  // Neutral Support (0–15)
  const nc = colorData.filter(c => c.s < 0.15).length;
  const neutralSupport = nc >= 3 ? 15 : nc === 2 ? 11 : nc === 1 ? 7 : 0;

  const overall = accessibility + tonalBalance + functionalVariety + cohesion + neutralSupport;
  return {
    overall,
    breakdown: {
      accessibility:     { score: accessibility,    max: 30, label: labelScore(accessibility, 30) },
      tonalBalance:      { score: tonalBalance,      max: 20, label: labelScore(tonalBalance, 20) },
      functionalVariety: { score: functionalVariety, max: 20, label: labelScore(functionalVariety, 20) },
      cohesion:          { score: cohesion,          max: 15, label: labelScore(cohesion, 15) },
      neutralSupport:    { score: neutralSupport,    max: 15, label: labelScore(neutralSupport, 15) },
    },
  };
}

function getFunctionalPairs(pairs, colorData) {
  if (pairs.length === 0) return null;
  const sorted = [...pairs].sort((a, b) => b.ratio - a.ratio);
  const bestText = sorted[0] ?? null;
  const ctaPairs = pairs
    .filter(p => {
      const bg = colorData.find(c => c.hex === p.background);
      return bg && bg.s > 0.35 && bg.l > 0.25 && bg.l < 0.75;
    })
    .sort((a, b) => b.ratio - a.ratio);
  return { bestText, bestCTA: ctaPairs[0] ?? null };
}

app.post('/api/analyze', (req, res) => {
  const { colors } = req.body;
  if (!Array.isArray(colors) || colors.length < 1)
    return res.status(400).json({ error: 'colors required' });

  const valid = colors.filter(c => { try { chroma(c); return true; } catch { return false; } });
  if (valid.length < 1)
    return res.status(400).json({ error: 'No valid colors' });

  const colorData = valid.map(hex => {
    const [h, s, l] = chroma(hex).hsl();
    return { hex: hex.toUpperCase(), h: (isNaN(h) || h == null) ? 0 : h, s, l };
  });

  const totalSat = colorData.reduce((sum, c) => sum + c.s, 0) || 1;
  const sinSum = colorData.reduce((sum, c) => sum + c.s * Math.sin(c.h * Math.PI / 180), 0);
  const cosSum = colorData.reduce((sum, c) => sum + c.s * Math.cos(c.h * Math.PI / 180), 0);
  const meanHue = ((Math.atan2(sinSum / totalSat, cosSum / totalSat) * 180 / Math.PI) + 360) % 360;
  const avgS = colorData.reduce((s, c) => s + c.s, 0) / colorData.length;

  const pairs = [];
  if (valid.length >= 2) {
    for (let i = 0; i < valid.length; i++) {
      for (let j = 0; j < valid.length; j++) {
        if (i === j) continue;
        const ratio = Math.round(chroma.contrast(valid[i], valid[j]) * 100) / 100;
        const normalAA = ratio >= 4.5;
        const rawFix = !normalAA ? findAccessibleForeground(valid[i], valid[j], 4.5) : null;
        const quickFix = rawFix ? { ...rawFix, label: makeFixLabel(valid[i], rawFix.hex) } : null;
        const why = !normalAA ? explainContrastFailure(valid[i], valid[j]) : null;
        pairs.push({
          foreground: valid[i].toUpperCase(), background: valid[j].toUpperCase(),
          ratio, normalAA, normalAAA: ratio >= 7, largeAA: ratio >= 3, largeAAA: ratio >= 4.5,
          quickFix, why,
        });
      }
    }
    pairs.sort((a, b) => b.ratio - a.ratio);
  }

  const issues = analyzeIssues(colorData, meanHue, avgS);
  const health = computeHealth(colorData, pairs, issues);
  const functionalPairs = valid.length >= 2 ? getFunctionalPairs(pairs, colorData) : null;

  res.json({ health, issues, pairs, functionalPairs });
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
