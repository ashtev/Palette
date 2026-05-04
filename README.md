# Palette — Brand Color Builder v2

A full-stack tool for building, testing, and perfecting brand color palettes. Add colors, get real-time intelligent analysis, fix accessibility failures in one click, and receive smart suggestions that adapt to exactly what your palette is missing.

---

## What's New in v2

### Palette Intelligence Panel
The right panel is now a live intelligent assistant. As you add colors it automatically:

- Calculates a **Palette Health Score** (0–100) with a 5-category breakdown
- Detects **specific structural issues** and explains why each one matters
- Surfaces **one-click fixes** for every issue — add a missing anchor or replace a redundant color
- Identifies your **best color combinations** for text and CTA buttons
- Shows **why** each contrast pair fails in plain English (not just the ratio)

### Smart Suggestion — Fully Rebuilt
The suggestion system now analyzes your palette before generating anything, then surfaces only what actually needs fixing:

| Scenario | What triggers it |
|---|---|
| Improve accessibility | No pair achieves 4.5:1 contrast |
| Add a dark anchor | No color dark enough for text |
| Add a light anchor | No color light enough for backgrounds |
| Balance your saturation | Every color is heavily saturated |
| Your palette needs grounding | No neutral tones at all |
| Strengthen visual hierarchy | Has dark + light but no vibrant accent |
| Fill the hue gap | Large unoccupied zone in the hue spectrum |
| Add a contrasting hue | No complementary color exists |
| Balance the temperature | 80%+ warm or cool dominance |
| Complete the triad | Two colors are near-triadic — third is missing |

Each suggestion card shows *why it exists* and what problem it solves. The **Reshuffle** button generates different color options for the same detected issues — it stays within the recommendation intent rather than producing unrelated results.

---

## Features

- **Palette Intelligence** — live health score, issue detection, and one-click fixes as you build
- **Smart Suggestions™** — context-aware recommendations that solve specific detected gaps
- **Real contrast explanations** — every failing pair explains *why* in plain English
- **Best combinations** — automatically identifies your best text pair and best CTA button combo
- **One-click fixes** — before/after preview with Accept Fix button on every failing pair
- **Harmonize** — color wheel visualization, harmony score, and issue cards with suggested fixes
- **Assign Roles** — map colors to Hero / Accent / Neutral roles with live brand preview
- **Undo / Redo** — full history across all tabs (Ctrl+Z / Ctrl+Y)
- **Lock colors** — lock any palette color so fixes and suggestions skip it
- **Persistent** — palette and roles saved to localStorage automatically
- **Import** — paste multiple hex values at once to bulk-add colors

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or later
- npm (bundled with Node)

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/ashtev/Palette.git
cd Palette

# 2. Install backend dependencies
npm install

# 3. Install frontend dependencies
npm install --prefix client

# 4. Start dev servers (backend :3000 + frontend :5173)
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start both Express API (port 3000) and Vite dev server (port 5173) with hot reload |
| `npm run build` | Build the React frontend into `client/dist/` |
| `npm start` | Serve the production build from Express on port 3000 |

### Production deployment

```bash
npm install
npm install --prefix client
npm run build
npm start
```

The app is then fully served from **http://localhost:3000** — no separate frontend server needed.

---

## Project Structure

```
Palette/
├── server.js                  # Express API — color algorithms via chroma-js
├── package.json
└── client/
    ├── index.html
    ├── vite.config.js         # Proxies /api → localhost:3000 in dev
    └── src/
        ├── App.jsx            # Global state, undo/redo, tab nav
        ├── App.css            # Design system + all styles
        └── components/
            ├── BuildAndTest.jsx     # Palette builder + intelligence panel
            ├── HarmonizeColors.jsx  # Color wheel + harmony analysis
            ├── AssignRoles.jsx      # Role assignment + brand preview
            ├── ColorSwatch.jsx
            └── ColorPicker.jsx
```

---

## API Endpoints

All endpoints are served by Express on port 3000.

**POST `/api/analyze`** *(v2)*
- Body: `{ colors: ["#hex", ...] }` (1+ colors)
- Returns: `{ health, issues, pairs, functionalPairs }`
  - `health` — overall score (0–100) + 5-category breakdown (Accessibility, Tonal Balance, Functional Variety, Cohesion, Neutral Support)
  - `issues` — array of detected problems, each with `{ id, severity, title, explanation, fix: { hex, name, impact }, targetHex? }`
  - `pairs` — all color pairs with ratio, WCAG badges, quickFix, and `why` explanation for failures
  - `functionalPairs` — `{ bestText, bestCTA }` — highest-contrast combos for text and buttons

**POST `/api/suggestions`**
- Body: `{ colors: ["#hex", ...], variant: 0–4 }` (2+ colors → smart palette mode)
- Body: `{ color: "#hex", variant: 0–4 }` (single color → harmony mode)
- Palette mode returns: `{ suggestions, headerMessage, mode: "palette" }`
  - `suggestions` — up to 4 context-aware groups, each with `{ id, intent, name, reason, colors }`
  - `headerMessage` — adaptive copy describing what the palette needs
- Single-color mode returns: `{ harmonies, neutrals }`

**POST `/api/harmonize`**
- Body: `{ colors: ["#hex", ...] }`
- Returns: `{ detectedType, score, issues, healthScore, metrics }`

**POST `/api/accessibility`**
- Body: `{ colors: ["#hex", ...] }`
- Returns: `{ pairs: [{ foreground, background, ratio, normalAA, normalAAA, largeAA, largeAAA, quickFix }] }`

---

## Tech Stack

- **Backend** — Node.js, Express, [chroma-js](https://gka.github.io/chroma.js/) (color math + WCAG contrast)
- **Frontend** — React 18, Vite 5
- **Styling** — Plain CSS with custom properties (no framework)
- **Persistence** — localStorage (no database)
