import { useState, useEffect, useRef } from 'react';

const ROLE_DEFS = [
  {
    id: 'hero',
    label: 'Hero',
    hint: 'Your main brand color — primary buttons, hero sections, key UI elements.',
    badge: 'role-badge-hero',
    cardClass: 'role-card-hero',
  },
  {
    id: 'accent',
    label: 'Accent',
    hint: 'Your highlight color — CTAs, active states, links, badges, interactive elements.',
    badge: 'role-badge-accent',
    cardClass: 'role-card-accent',
  },
  {
    id: 'neutral',
    label: 'Neutral',
    hint: 'Your base color — backgrounds, text, borders, and quiet UI elements that recede.',
    badge: 'role-badge-neutral',
    cardClass: 'role-card-neutral',
  },
];

const GRAY = '#9ca3af';

function getHex(id, palette) { return id ? palette.find(c => c.id === id)?.hex ?? GRAY : GRAY; }
function getName(id, palette) { return id ? palette.find(c => c.id === id)?.name ?? '—' : null; }

function hexToHsl(hex) {
  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h * 360, s, l];
  } catch { return [0, 0, 0.5]; }
}

// Compute rich suggestions with reasons for each role
function computeRoleSuggestions(palette) {
  if (palette.length === 0) return { hero: null, accent: null, neutral: null };
  const analyzed = palette.map(c => {
    const [h, s, l] = hexToHsl(c.hex);
    const heroScore = s * (1 - Math.abs(l - 0.50) * 1.8);
    return { ...c, h, s, l, heroScore };
  });

  const byHeroScore = [...analyzed].sort((a, b) => b.heroScore - a.heroScore);
  const heroColor = byHeroScore[0];

  const byAccentScore = analyzed.filter(c => c.id !== heroColor.id).sort((a, b) => b.s - a.s);
  const accentColor = byAccentScore[0] ?? null;

  const byNeutral = analyzed
    .filter(c => c.id !== heroColor.id && c.id !== accentColor?.id)
    .sort((a, b) => a.s - b.s);
  const neutralColor = byNeutral[0] ?? [...analyzed].sort((a, b) => a.s - b.s)[0];

  function heroReason(c) {
    const sPct = Math.round(c.s * 100), lPct = Math.round(c.l * 100);
    if (c.s >= 0.75)  return `Most vibrant at ${sPct}% saturation — commands attention`;
    if (c.s >= 0.45)  return `Dominant mid-tone — ${sPct}% saturation, ${lPct}% lightness`;
    return `Most colorful in your palette at ${sPct}% saturation`;
  }
  function accentReason(c) {
    const sPct = Math.round(c.s * 100);
    if (c.s >= 0.70) return `High-energy at ${sPct}% saturation — perfect for CTAs and links`;
    if (c.s >= 0.40) return `Good pop at ${sPct}% saturation — works for badges and highlights`;
    return `Best contrast accent at ${sPct}% saturation`;
  }
  function neutralReason(c) {
    const sPct = Math.round(c.s * 100), lPct = Math.round(c.l * 100);
    if (c.s < 0.10)   return `Near-achromatic at ${sPct}% saturation — ideal for backgrounds`;
    if (c.l > 0.78)   return `Light base at ${lPct}% lightness — great for surfaces and borders`;
    if (c.l < 0.22)   return `Dark base at ${lPct}% lightness — great for text and dark UI`;
    return `Quietest color in your palette at ${sPct}% saturation`;
  }

  return {
    hero:    heroColor    ? { color: heroColor,    reason: heroReason(heroColor),       confidence: heroColor.s >= 0.5 ? 'strong' : 'moderate' } : null,
    accent:  accentColor  ? { color: accentColor,  reason: accentReason(accentColor),   confidence: accentColor.s >= 0.5 ? 'strong' : 'moderate' } : null,
    neutral: neutralColor ? { color: neutralColor, reason: neutralReason(neutralColor), confidence: neutralColor.s < 0.20 ? 'strong' : 'moderate' } : null,
  };
}

// Auto-assign: Hero = most saturated mid-lightness, Accent = second most saturated, Neutral = least saturated
function suggestRoles(palette) {
  if (palette.length === 0) return {};
  const scored = palette.map(c => {
    const [, s, l] = hexToHsl(c.hex);
    // Score for hero: high sat + mid lightness (0.3–0.7 range)
    const heroScore = s * (1 - Math.abs(l - 0.5) * 2);
    return { id: c.id, s, l, heroScore };
  }).sort((a, b) => b.heroScore - a.heroScore);

  const heroId   = scored[0]?.id ?? null;
  const rest     = scored.filter(c => c.id !== heroId);
  // Accent: second by heroScore but prefer different enough saturation
  const accentId = rest[0]?.id ?? null;
  // Neutral: lowest saturation overall
  const byS      = [...palette].map(c => { const [,s] = hexToHsl(c.hex); return { id: c.id, s }; }).sort((a, b) => a.s - b.s);
  const neutralId = byS[0]?.id !== heroId && byS[0]?.id !== accentId ? byS[0]?.id : (byS[1]?.id ?? null);
  return { hero: heroId, accent: accentId, neutral: neutralId };
}

function isLight(hex) {
  if (!hex || hex === GRAY) return true;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  } catch { return true; }
}

function hexWithAlpha(hex, a) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

export default function AssignRoles({ palette, roles, setRole }) {
  const [suggested, setSuggested] = useState(null);
  const suggestions = palette.length >= 1 ? computeRoleSuggestions(palette) : null;

  const heroHex    = getHex(roles.hero,    palette);
  const accentHex  = getHex(roles.accent,  palette);
  const neutralHex = getHex(roles.neutral, palette);

  const assignedCount = ROLE_DEFS.filter(r => roles[r.id]).length;

  function handleFixerSuggests() {
    const result = suggestRoles(palette);
    setSuggested(new Set(Object.values(result).filter(Boolean)));
    Object.entries(result).forEach(([role, id]) => setRole(role, id));
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Assign Color Roles</h2>
          <p className="section-desc">
            Give each color a job — Hero, Accent, or Neutral. This turns your palette into a ready-to-use
            brand system so you always know which color goes where.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {palette.length >= 2 && (
            <button className="btn btn-primary btn-sm" onClick={handleFixerSuggests}>
              ⚡ Fixer Suggests
            </button>
          )}
          <span className="badge badge-neutral">{assignedCount}/3 assigned</span>
        </div>
      </div>

      {palette.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">◈</span>
            <p className="empty-state-title">No colors in palette</p>
            <p className="empty-state-desc">Build your palette first, then assign roles.</p>
          </div>
        </div>
      ) : (
        <div className="roles-layout">
          {/* Role assignment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="role-grid">
              {ROLE_DEFS.map(role => (
                <RoleCard
                  key={role.id}
                  role={role}
                  assignedId={roles[role.id]}
                  palette={palette}
                  onSelect={id => { setRole(role.id, id); setSuggested(null); }}
                  isSuggested={suggested && roles[role.id] && suggested.has(roles[role.id])}
                />
              ))}
            </div>

            {/* Role suggestions panel */}
            {suggestions && (
              <RoleSuggestionsPanel
                suggestions={suggestions}
                roles={roles}
                onAssign={(roleId, colorId) => { setRole(roleId, colorId); setSuggested(null); }}
              />
            )}

            {/* Role summary */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="card-header">
                <h3 className="card-title">Brand System Summary</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {ROLE_DEFS.map(role => {
                  const hex = getHex(roles[role.id], palette);
                  const name = getName(roles[role.id], palette);
                  const assigned = !!roles[role.id];
                  return (
                    <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: assigned ? hex : 'var(--bg)',
                        border: assigned ? 'none' : '2px dashed var(--border-2)',
                        boxShadow: assigned ? 'inset 0 0 0 1px rgba(0,0,0,0.1)' : 'none',
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`role-badge ${role.badge}`}>{role.label}</span>
                          {name && <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-2)' }}>{name}</span>}
                          {assigned && <span style={{ fontSize: '0.75rem', color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>{hex}</span>}
                        </div>
                        {!assigned && <span style={{ fontSize: '0.775rem', color: 'var(--text-4)' }}>Unassigned</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <div className="preview-panel">
              <div className="preview-label">Live Preview</div>

              {/* Navbar — hero bg */}
              <div className="preview-navbar" style={{
                background: heroHex,
                color: isLight(heroHex) ? '#111' : '#fff',
              }}>
                <span className="preview-nav-brand">Brand</span>
                <div className="preview-nav-items">
                  <span>Home</span><span>Work</span><span>Contact</span>
                </div>
                {roles.accent && (
                  <span style={{
                    marginLeft: 'auto',
                    padding: '0.25rem 0.75rem',
                    borderRadius: 999,
                    background: accentHex,
                    color: isLight(accentHex) ? '#111' : '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}>Get Started</span>
                )}
              </div>

              {/* Body — neutral bg */}
              <div className="preview-body" style={{ background: neutralHex !== GRAY ? hexWithAlpha(neutralHex, 0.08) : 'var(--bg)' }}>

                {/* Hero section */}
                <div className="preview-hero" style={{
                  background: heroHex,
                  color: isLight(heroHex) ? '#111' : '#fff',
                }}>
                  <div className="preview-hero-title">Your Brand Headline</div>
                  <div className="preview-hero-sub">A short description of your product or service that builds trust.</div>
                  <span className="preview-hero-cta" style={{
                    background: accentHex !== GRAY ? accentHex : 'rgba(255,255,255,0.2)',
                    color: isLight(accentHex) ? '#111' : '#fff',
                  }}>
                    Get Started →
                  </span>
                </div>

                {/* Content card */}
                <div className="preview-card" style={{
                  background: 'white',
                  border: '1px solid',
                  borderColor: neutralHex !== GRAY ? hexWithAlpha(neutralHex, 0.25) : 'var(--border)',
                }}>
                  <div className="preview-card-title" style={{ color: neutralHex !== GRAY ? neutralHex : 'var(--text-1)' }}>
                    Feature Card
                  </div>
                  <div className="preview-card-body" style={{ color: 'var(--text-3)' }}>
                    Supporting text that explains the feature. Neutral colors create readable, calm interfaces.
                  </div>
                  <div className="preview-card-btns">
                    <span className="preview-btn" style={{
                      background: heroHex, color: isLight(heroHex) ? '#111' : '#fff',
                    }}>Hero Button</span>
                    <span className="preview-btn" style={{
                      background: accentHex !== GRAY ? hexWithAlpha(accentHex, 0.12) : 'var(--bg)',
                      color: accentHex !== GRAY ? accentHex : 'var(--text-2)',
                    }}>Accent</span>
                  </div>
                  {roles.accent && (
                    <span className="preview-tag" style={{
                      background: hexWithAlpha(accentHex, 0.12),
                      color: accentHex,
                    }}>Accent Tag</span>
                  )}
                </div>
              </div>

              {/* Footer — neutral */}
              <div className="preview-footer" style={{
                background: neutralHex !== GRAY ? hexWithAlpha(neutralHex, 0.06) : 'var(--surface-2)',
                color: neutralHex !== GRAY ? neutralHex : 'var(--text-3)',
                borderTopColor: neutralHex !== GRAY ? hexWithAlpha(neutralHex, 0.2) : 'var(--border)',
              }}>
                © 2025 Your Brand · Palette Brand System
              </div>
            </div>

            {/* Role legend */}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              {ROLE_DEFS.map(role => (
                <div key={role.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                    background: getHex(roles[role.id], palette),
                    opacity: roles[role.id] ? 1 : 0.35,
                    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)',
                  }} />
                  <span className={`role-badge ${role.badge}`} style={{ fontSize: '0.625rem', padding: '0.1rem 0.35rem' }}>{role.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoleCard({ role, assignedId, palette, onSelect, isSuggested }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const assignedColor = assignedId ? palette.find(c => c.id === assignedId) : null;

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className={`role-card ${role.cardClass}`}>
      <div className="role-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <span className={`role-badge ${role.badge}`}>{role.label}</span>
          {isSuggested && <span className="suggested-badge">⚡ Suggested</span>}
        </div>
        <div className="role-hint">{role.hint}</div>
      </div>

      <div className="role-selector" ref={ref}>
        <button
          className={`role-selector-btn ${open ? 'open' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="role-color-dot" style={{
            background: assignedColor?.hex ?? '#e5e7eb',
            opacity: assignedColor ? 1 : 0.5,
          }} />
          <span className="role-selector-label">{assignedColor ? assignedColor.name : 'Choose…'}</span>
          <span className="role-selector-caret">▾</span>
        </button>

        {open && (
          <div className="role-dropdown" role="listbox">
            <div
              className={`role-dropdown-item clear ${!assignedId ? 'selected' : ''}`}
              onClick={() => { onSelect(null); setOpen(false); }}
            >
              — None
            </div>
            <div className="role-dropdown-divider" />
            {palette.map(color => (
              <div
                key={color.id}
                className={`role-dropdown-item ${assignedId === color.id ? 'selected' : ''}`}
                role="option"
                aria-selected={assignedId === color.id}
                onClick={() => { onSelect(color.id); setOpen(false); }}
              >
                <span className="role-color-dot" style={{ background: color.hex }} />
                <span style={{ flex: 1 }}>{color.name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>{color.hex}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleSuggestionsPanel({ suggestions, roles, onAssign }) {
  const rows = ROLE_DEFS.map(role => ({
    role,
    suggestion: suggestions[role.id],
    currentId: roles[role.id],
  })).filter(r => r.suggestion);

  if (!rows.length) return null;

  return (
    <div className="role-suggestions-panel">
      <div className="role-suggestions-header">
        <span className="role-suggestions-title">⚡ Fixer Recommendations</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Based on your palette's saturation and lightness</span>
      </div>
      <div className="role-suggestions-list">
        {rows.map(({ role, suggestion, currentId }) => {
          const isAssigned = currentId === suggestion.color.id;
          return (
            <div key={role.id} className={`role-suggestion-row ${isAssigned ? 'is-assigned' : ''}`}>
              <span className={`role-badge ${role.badge}`}>{role.label}</span>

              <div className="role-suggestion-swatch" style={{ background: suggestion.color.hex }} title={suggestion.color.hex} />

              <div className="role-suggestion-info">
                <div className="role-suggestion-name">
                  <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{suggestion.color.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-4)' }}>{suggestion.color.hex}</span>
                  {suggestion.confidence === 'strong' && (
                    <span className="role-suggestion-confidence">Perfect fit</span>
                  )}
                </div>
                <div className="role-suggestion-reason">{suggestion.reason}</div>
              </div>

              {isAssigned ? (
                <span className="badge badge-pass" style={{ flexShrink: 0, fontSize: '0.7rem' }}>✓ Assigned</span>
              ) : (
                <button
                  className="btn btn-secondary btn-sm role-suggestion-btn"
                  onClick={() => onAssign(role.id, suggestion.color.id)}
                >
                  Assign
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
