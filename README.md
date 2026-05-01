# Palette — Brand Color Fixer

A full-stack tool for building, testing, and perfecting brand color palettes. Add your colors, see WCAG contrast scores update live, fix accessibility failures in one click, and get smart suggestions that complete your palette.

---

## Features

- **Build & Test** — add colors manually or paste hex values in bulk; live contrast matrix updates as you build
- **Smart Suggestion** — analyzes your whole palette and recommends what it's missing (fill hue gaps, add contrast, balance temperature, anchor light/dark values) with the most accessible colors surfaced first
- **One-click fixes** — every failing contrast pair shows a before/after preview and an Accept Fix button that replaces the color in-palette instantly
- **Harmonize** — color wheel visualization, harmony score, and issue cards (hue deviation, flat lightness, temperature imbalance, no dominant color) with suggested fixes
- **Assign Roles** — map colors to Hero / Accent / Neutral roles with automatic recommendations and a live brand preview
- **Undo / Redo** — full history across all tabs (Ctrl+Z / Ctrl+Y)
- **Lock colors** — lock any palette color so fixes and updates skip it
- **Persistent** — palette and roles saved to localStorage automatically

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
            ├── BuildAndTest.jsx     # Palette builder + live contrast panel
            ├── HarmonizeColors.jsx  # Color wheel + harmony analysis
            ├── AssignRoles.jsx      # Role assignment + brand preview
            ├── ColorSwatch.jsx
            └── ColorPicker.jsx
```

---

## API Endpoints

All endpoints are served by Express on port 3000.

**POST `/api/suggestions`**
- Body: `{ colors: ["#hex", ...], variant: 0–4 }` (2+ colors → palette-aware mode)
- Body: `{ color: "#hex", variant: 0–4 }` (single color → harmony mode)
- Returns: `{ harmonies, neutrals, mode }`

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
