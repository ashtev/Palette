import { useState, useEffect, useRef } from 'react';
import BuildAndTest from './components/BuildAndTest.jsx';
import HarmonizeColors from './components/HarmonizeColors.jsx';
import AssignRoles from './components/AssignRoles.jsx';
import { nameColor } from './utils/colorName.js';

const STORAGE_KEY = 'palette-app-v2';
const MAX_HISTORY = 60;

const DEFAULT_STATE = {
  palette: [],
  roles: { hero: null, accent: null, neutral: null },
};

const TABS = [
  { id: 'build',     step: '01', label: 'Build & Test' },
  { id: 'harmonize', step: '02', label: 'Harmonize' },
  { id: 'roles',     step: '03', label: 'Assign Roles' },
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_STATE, ...parsed, roles: { ...DEFAULT_STATE.roles, ...(parsed.roles ?? {}) } };
    }
  } catch { /* ignore */ }
  return DEFAULT_STATE;
}

// ── History hook ──────────────────────────────────────────────────────────────
function useHistory(initial) {
  const [hist, setHist] = useState({ past: [], present: initial, future: [] });

  const push = (next) => setHist(h => ({
    past: [...h.past, h.present].slice(-MAX_HISTORY),
    present: next,
    future: [],
  }));

  const undo = () => setHist(h =>
    h.past.length === 0 ? h : {
      past: h.past.slice(0, -1),
      present: h.past[h.past.length - 1],
      future: [h.present, ...h.future],
    }
  );

  const redo = () => setHist(h =>
    h.future.length === 0 ? h : {
      past: [...h.past, h.present],
      present: h.future[0],
      future: h.future.slice(1),
    }
  );

  return {
    palette:  hist.present.palette,
    roles:    hist.present.roles,
    present:  hist.present,
    push,
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    histLen: hist.past.length,
  };
}

export default function App() {
  const {
    palette, roles, present, push, undo, redo, canUndo, canRedo,
  } = useHistory(loadState());

  const [activeTab, setActiveTab] = useState('build');

  // Persist to localStorage whenever present changes
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(present)); } catch { /* ignore */ }
  }, [present]);

  // Keyboard shortcuts — use refs so the effect never needs to re-run
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoRef.current(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ── Mutations ─────────────────────────────────────────────────────────────

  function addColor(hex) {
    const norm = hex.toUpperCase();
    if (palette.some(c => c.hex.toUpperCase() === norm)) return;
    push({ palette: [...palette, { id: crypto.randomUUID(), hex: norm, name: nameColor(norm), locked: false }], roles });
  }

  function addColors(hexes) {
    const filtered = hexes.map(h => h.toUpperCase()).filter(h => !palette.some(c => c.hex.toUpperCase() === h));
    if (!filtered.length) return;
    push({
      palette: [...palette, ...filtered.map(hex => ({ id: crypto.randomUUID(), hex, name: nameColor(hex), locked: false }))],
      roles,
    });
  }

  function removeColor(id) {
    const newRoles = { ...roles };
    Object.keys(newRoles).forEach(k => { if (newRoles[k] === id) newRoles[k] = null; });
    push({ palette: palette.filter(c => c.id !== id), roles: newRoles });
  }

  function updateColor(id, newHex) {
    const color = palette.find(c => c.id === id);
    if (color?.locked) return;
    const norm = newHex.toUpperCase();
    push({ palette: palette.map(c => c.id === id ? { ...c, hex: norm, name: nameColor(norm) } : c), roles });
  }

  function toggleLock(id) {
    push({ palette: palette.map(c => c.id === id ? { ...c, locked: !c.locked } : c), roles });
  }

  function setRole(roleName, colorId) {
    push({ palette, roles: { ...roles, [roleName]: colorId } });
  }

  const props = { palette, roles, addColor, addColors, removeColor, updateColor, toggleLock, setRole };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <div className="app-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <circle cx="14" cy="14" r="14" fill="#4f46e5" />
              <circle cx="9"  cy="14" r="4.5" fill="white" />
              <circle cx="19" cy="14" r="4.5" fill="white" />
              <circle cx="14" cy="9"  r="3.5" fill="rgba(255,255,255,0.65)" />
            </svg>
          </div>
          <span className="app-brand">Palette</span>
          <span className="app-tagline">Brand Color Fixer</span>

          <div className="undo-redo-bar">
            <button
              className="undo-redo-btn"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
            >
              ↩
            </button>
            <button
              className="undo-redo-btn"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Y)"
              aria-label="Redo"
            >
              ↪
            </button>
          </div>
        </div>

        <nav className="tab-bar" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="tab-step">{t.step}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="tab-content">
        {activeTab === 'build'     && <BuildAndTest    {...props} />}
        {activeTab === 'harmonize' && <HarmonizeColors {...props} />}
        {activeTab === 'roles'     && <AssignRoles     {...props} />}
      </main>
    </div>
  );
}
