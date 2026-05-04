import { useState, useEffect } from 'react';
import ColorPicker from './ColorPicker.jsx';
import ColorSwatch from './ColorSwatch.jsx';

const FILTERS = [
  { id: 'fail',       label: 'Fails' },
  { id: 'all',        label: 'All' },
  { id: 'aaa',        label: 'AAA' },
  { id: 'aa',         label: 'AA' },
  { id: 'decorative', label: 'Decorative' },
];

const HEALTH_CATEGORIES = [
  { key: 'accessibility', label: 'Accessibility', max: 35 },
  { key: 'harmony',       label: 'Harmony',       max: 30 },
  { key: 'versatility',   label: 'Versatility',   max: 20 },
  { key: 'balance',       label: 'Balance',       max: 15 },
];

const SEVERITY_ICON  = { error: '✕', warning: '⚠', info: '→' };
const SEVERITY_CLASS = { error: 'issue-severity-error', warning: 'issue-severity-warning', info: 'issue-severity-info' };

function parseHexes(raw) {
  return (raw.match(/#[0-9A-Fa-f]{6}/gi) ?? []).map(h => h.toUpperCase());
}

function healthColor(score) {
  if (score >= 80) return 'var(--green-dk)';
  if (score >= 55) return 'var(--amber-dk)';
  return 'var(--red-dk)';
}

function healthBarColor(score, max) {
  const p = score / max;
  if (p >= 0.75) return 'var(--green)';
  if (p >= 0.45) return 'var(--amber)';
  return 'var(--red)';
}

export default function BuildAndTest({ palette, addColor, addColors, removeColor, updateColor, toggleLock }) {
  const [pickerColor, setPickerColor]     = useState('#3B82F6');
  const [suggestions, setSuggestions]     = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [variant, setVariant]             = useState(0);
  const [suggestBase, setSuggestBase]     = useState(null);
  const [importOpen, setImportOpen]       = useState(false);
  const [importText, setImportText]       = useState('');

  const [analysis, setAnalysis]           = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [filter, setFilter]               = useState('fail');

  async function runAnalysis() {
    if (palette.length < 1) { setAnalysis(null); return; }
    setAnalyzeLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors: palette.map(c => c.hex) }),
      });
      if (!res.ok) throw new Error(await res.text());
      setAnalysis(await res.json());
    } catch (e) { console.error(e); }
    finally { setAnalyzeLoading(false); }
  }

  useEffect(() => {
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.map(c => c.hex).join(',')]);

  async function getSuggestions(nextVariant = 0) {
    setSuggestLoading(true);
    const paletteMode = palette.length >= 2;
    const body = paletteMode
      ? { colors: palette.map(c => c.hex), variant: nextVariant }
      : { color: pickerColor, variant: nextVariant };
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSuggestions(data);
      setSuggestBase(paletteMode ? `palette:${palette.length}` : pickerColor);
      setVariant(nextVariant);
    } catch (err) { console.error(err); }
    finally { setSuggestLoading(false); }
  }

  function handleImport() {
    const hexes = parseHexes(importText);
    if (hexes.length > 0) { addColors(hexes); setImportText(''); setImportOpen(false); }
  }

  const importPreview = parseHexes(importText);

  const pairs            = analysis?.pairs ?? [];
  const issues           = analysis?.issues ?? [];
  const health           = analysis?.health ?? null;
  const funcPairs        = analysis?.functionalPairs ?? null;
  const funcCoverage     = analysis?.functionalCoverage ?? null;

  const stats = {
    total:      pairs.length,
    aaa:        pairs.filter(p => p.normalAAA).length,
    aa:         pairs.filter(p => p.normalAA).length,
    fail:       pairs.filter(p => !p.normalAA && !p.largeAA).length,
    decorative: pairs.filter(p => p.importance === 'decorative').length,
  };

  const filtered = pairs.filter(p => {
    if (filter === 'aaa')        return p.normalAAA;
    if (filter === 'aa')         return p.normalAA;
    if (filter === 'fail')       return !p.normalAA && !p.largeAA;
    if (filter === 'decorative') return p.importance === 'decorative';
    return true;
  });

  return (
    <div className="build-test-layout">
      <div className="section-header">
        <div>
          <h2 className="section-title">Build &amp; Test Your Palette</h2>
          <p className="section-desc">
            Add colors and watch the intelligence panel update live — it detects issues, explains failures, and shows one-click fixes.
          </p>
        </div>
      </div>

      {/* Color input row */}
      <div className="build-input-row">
        <ColorPicker value={pickerColor} onChange={setPickerColor} onAdd={addColor} />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setImportOpen(o => !o)}
          title="Paste multiple hex values at once"
        >
          ⇥ Import
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => getSuggestions(0)}
          disabled={suggestLoading}
          style={{ marginLeft: 'auto' }}
        >
          {suggestLoading ? <span className="spinner" /> : '✦'}
          {suggestLoading ? 'Generating…' : 'Smart Suggestions™'}
        </button>
      </div>

      {importOpen && (
        <div className="import-panel">
          <div className="import-panel-header">
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>Import Colors</span>
            <button className="btn btn-ghost btn-sm" onClick={() => { setImportOpen(false); setImportText(''); }}>✕</button>
          </div>
          <textarea
            className="import-textarea"
            placeholder="Paste hex values — e.g. #3B82F6, #10B981, #F59E0B"
            value={importText}
            onChange={e => setImportText(e.target.value)}
            rows={3}
            spellCheck="false"
          />
          {importPreview.length > 0 && (
            <div className="import-preview">
              {importPreview.map(hex => (
                <div key={hex} className="import-preview-swatch" style={{ background: hex }} title={hex} />
              ))}
              <span style={{ fontSize: '0.775rem', color: 'var(--text-3)', marginLeft: '0.25rem' }}>
                {importPreview.length} color{importPreview.length !== 1 ? 's' : ''} detected
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setImportOpen(false); setImportText(''); }}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleImport}
              disabled={importPreview.length === 0}
            >
              Add {importPreview.length > 0 ? importPreview.length : ''} Color{importPreview.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Two-column: palette (left) + intelligence panel (right) */}
      <div className="build-test-columns">

        {/* Left: palette grid */}
        <div className="bt-palette-col">
          {palette.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="empty-state-icon">🎨</span>
                <p className="empty-state-title">Your palette is empty</p>
                <p className="empty-state-desc">Add a color above, or use Smart Suggestions™ to start instantly.</p>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  Your Palette
                  <span className="badge badge-neutral">{palette.length} color{palette.length !== 1 ? 's' : ''}</span>
                  {palette.some(c => c.locked) && (
                    <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6' }}>
                      🔒 {palette.filter(c => c.locked).length} locked
                    </span>
                  )}
                </h3>
              </div>
              <div className="palette-grid">
                {palette.map(color => (
                  <ColorSwatch
                    key={color.id}
                    hex={color.hex}
                    name={color.name}
                    size="lg"
                    showRemove
                    onRemove={() => removeColor(color.id)}
                    showLock
                    locked={color.locked}
                    onLock={() => toggleLock(color.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Palette Intelligence */}
        <div className="intel-panel">

          {/* ── Health Score ────────────────────────────────── */}
          {palette.length === 0 ? (
            <div className="intel-empty">
              <span className="intel-empty-icon">◎</span>
              <p>Add colors to see palette analysis</p>
            </div>
          ) : (
            <>
              <div className="intel-health">
                <div className="intel-health-header">
                  <span className="intel-panel-title">Palette Intelligence</span>
                  {analyzeLoading && <span className="spinner" style={{ width: 13, height: 13, borderWidth: 1.5 }} />}
                </div>

                {health && (
                  <div className="intel-health-body">
                    <div className="intel-score-row">
                      <div className="intel-score-num" style={{ color: healthColor(health.overall) }}>
                        {health.overall}
                      </div>
                      <div className="intel-score-right">
                        <div className="intel-score-label">
                          Health Score <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>/ 100</span>
                        </div>
                        <div className="intel-score-tagline">
                          {health.overall >= 80 ? 'Great palette — looking good!' :
                           health.overall >= 60 ? 'Some areas to improve below' :
                           'Needs work — check issues below'}
                        </div>
                      </div>
                    </div>

                    <div className="intel-breakdown">
                      {HEALTH_CATEGORIES.map(cat => {
                        const d = health.breakdown[cat.key];
                        return (
                          <div key={cat.key} className="intel-breakdown-row">
                            <span className="intel-breakdown-label">{cat.label}</span>
                            <div className="intel-breakdown-bar-wrap">
                              <div
                                className="intel-breakdown-bar"
                                style={{
                                  width: `${(d.score / cat.max) * 100}%`,
                                  background: healthBarColor(d.score, cat.max),
                                }}
                              />
                            </div>
                            <span className="intel-breakdown-score">{d.score}<span>/{cat.max}</span></span>
                            <span className={`intel-breakdown-tag ${d.label === 'Exceptional' || d.label === 'Excellent' ? 'tag-excellent' : d.label === 'Strong' || d.label === 'Good' ? 'tag-good' : 'tag-needswork'}`}>
                              {d.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Issues ──────────────────────────────────── */}
              {issues.length > 0 && (
                <div className="intel-section">
                  <div className="intel-section-title">
                    Issues detected
                    <span className="badge badge-fail" style={{ fontSize: '0.65rem' }}>{issues.length}</span>
                  </div>
                  <div className="intel-issues-list">
                    {issues.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        palette={palette}
                        addColor={addColor}
                        updateColor={updateColor}
                      />
                    ))}
                  </div>
                </div>
              )}

              {issues.length === 0 && health && health.overall >= 75 && (
                <div className="intel-all-good">
                  <span>✓</span>
                  <span>No major issues — your palette is in good shape!</span>
                </div>
              )}

              {/* ── Functional Pairs ───────────────────────── */}
              {funcPairs && (funcPairs.bestText || funcPairs.bestCTA) && (
                <div className="intel-section">
                  <div className="intel-section-title">Best combinations</div>
                  <div className="intel-func-pairs">
                    {funcPairs.bestText && (
                      <FuncPairCard
                        label="Best for text"
                        pair={funcPairs.bestText}
                        palette={palette}
                      />
                    )}
                    {funcPairs.bestCTA && (
                      <FuncPairCard
                        label="Best CTA button"
                        pair={funcPairs.bestCTA}
                        palette={palette}
                        isCTA
                      />
                    )}
                  </div>
                </div>
              )}

              {/* ── Functional Coverage ────────────────────── */}
              {funcCoverage && palette.length >= 2 && (funcCoverage.critical !== null || funcCoverage.ui !== null) && (
                <div className="intel-section">
                  <div className="intel-section-title">Your palette supports</div>
                  <div className="coverage-summary">
                    {funcCoverage.critical !== null && (
                      <div className={`coverage-row ${funcCoverage.critical === 100 ? 'coverage-pass' : funcCoverage.critical >= 60 ? 'coverage-warn' : 'coverage-fail'}`}>
                        <span className="coverage-icon">{funcCoverage.critical === 100 ? '✓' : funcCoverage.critical >= 60 ? '~' : '✗'}</span>
                        <span>{funcCoverage.critical}% readable body text</span>
                      </div>
                    )}
                    {funcCoverage.ui !== null && (
                      <div className={`coverage-row ${funcCoverage.ui >= 80 ? 'coverage-pass' : funcCoverage.ui >= 50 ? 'coverage-warn' : 'coverage-fail'}`}>
                        <span className="coverage-icon">{funcCoverage.ui >= 80 ? '✓' : funcCoverage.ui >= 50 ? '~' : '✗'}</span>
                        <span>{funcCoverage.ui}% UI-safe combinations</span>
                      </div>
                    )}
                    {funcCoverage.decorativeCount > 0 && (
                      <div className="coverage-row coverage-neutral">
                        <span className="coverage-icon">◌</span>
                        <span>{funcCoverage.decorativeCount} decorative pair{funcCoverage.decorativeCount !== 1 ? 's' : ''} — not required to pass WCAG</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Contrast Pairs ─────────────────────────── */}
              {palette.length >= 2 && (
                <div className="intel-contrast-section">
                  <div className="intel-contrast-header">
                    <div className="intel-section-title" style={{ marginBottom: 0 }}>
                      Contrast pairs
                    </div>
                    <div className="contrast-stats-row" style={{ marginTop: '0.375rem' }}>
                      <span className="contrast-stat contrast-stat-neutral">{stats.total} total</span>
                      {stats.aaa  > 0 && <span className="contrast-stat contrast-stat-pass">✓ {stats.aaa} AAA</span>}
                      {stats.aa   > 0 && <span className="contrast-stat contrast-stat-pass">✓ {stats.aa} AA</span>}
                      {stats.fail > 0
                        ? <span className="contrast-stat contrast-stat-fail">✗ {stats.fail} fail</span>
                        : pairs.length > 0 && <span className="contrast-stat contrast-stat-pass">✓ All pass</span>}
                    </div>
                  </div>

                  <div className="contrast-filter-bar">
                    {FILTERS.map(f => (
                      <button
                        key={f.id}
                        className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                        onClick={() => setFilter(f.id)}
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        {f.label}
                        <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>
                          ({f.id === 'all' ? stats.total : f.id === 'aaa' ? stats.aaa : f.id === 'aa' ? stats.aa : f.id === 'decorative' ? stats.decorative : stats.fail})
                        </span>
                      </button>
                    ))}
                  </div>

                  {filter === 'fail' && stats.fail === 0 ? (
                    <div className="contrast-all-pass">
                      <span style={{ fontSize: '1.1rem' }}>✓</span>
                      <span>All pairs pass AA — great palette!</span>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="contrast-empty">No pairs match this filter</div>
                  ) : (
                    <div className="contrast-pairs-grid">
                      {filtered.map((pair, i) => (
                        <PairCard
                          key={i}
                          pair={pair}
                          palette={palette}
                          updateColor={updateColor}
                          addColor={addColor}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Smart Suggestions — full width below */}
      {suggestions && (
        <div className="smart-suggestions-section">
          <div className="section-header">
            <div>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Smart Palette Suggestions™</h3>
              <p className="section-desc">
                {suggestions.headerMessage ?? (
                  suggestBase?.startsWith('palette:')
                    ? 'Analyzing your palette and surfacing what it needs most'
                    : `Based on ${suggestBase}`
                )}
                {variant > 0 && (
                  <span style={{ color: 'var(--accent)', marginLeft: '0.4rem' }}>· variation {variant}</span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => getSuggestions((variant + 1) % 5)}
                disabled={suggestLoading}
                title="Reshuffle within the same recommendations"
              >
                {suggestLoading ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : '⟳'}
                {' '}Reshuffle
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSuggestions(null)}>Dismiss</button>
            </div>
          </div>

          {/* Adaptive suggestions — palette mode */}
          {suggestions.suggestions ? (
            <div className="suggestions-grid">
              {suggestions.suggestions.map(group => (
                <SuggestionCard
                  key={group.id}
                  group={group}
                  onAddAll={() => addColors(group.colors.map(c => c.hex))}
                  onAddOne={hex => addColor(hex)}
                  palette={palette}
                />
              ))}
            </div>
          ) : (
            /* Single-color harmony mode */
            <>
              {suggestions.neutrals && (
                <div className="neutrals-section" style={{ marginBottom: '1rem' }}>
                  <div className="neutrals-section-header">
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>Neutrals</span>
                      <span style={{ fontSize: '0.775rem', color: 'var(--text-3)', marginLeft: '0.5rem' }}>Tinted with your hue</span>
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => addColors([...suggestions.neutrals.lights.map(c => c.hex), ...suggestions.neutrals.darks.map(c => c.hex)])}
                    >Add All</button>
                  </div>
                  <div className="neutrals-row">
                    <span className="neutrals-row-label">Light</span>
                    <div className="neutrals-swatches">
                      {suggestions.neutrals.lights.map((c, i) => (
                        <NeutralSwatch key={i} color={c} palette={palette} onAdd={() => addColor(c.hex)} />
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => addColors(suggestions.neutrals.lights.map(c => c.hex))}>Add row</button>
                  </div>
                  <div className="neutrals-row">
                    <span className="neutrals-row-label">Dark</span>
                    <div className="neutrals-swatches">
                      {suggestions.neutrals.darks.map((c, i) => (
                        <NeutralSwatch key={i} color={c} palette={palette} onAdd={() => addColor(c.hex)} />
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => addColors(suggestions.neutrals.darks.map(c => c.hex))}>Add row</button>
                  </div>
                </div>
              )}
              <div className="suggestions-grid">
                {suggestions.harmonies?.map(scheme => (
                  <SuggestionCard
                    key={scheme.id}
                    group={{ ...scheme, reason: scheme.description }}
                    onAddAll={() => addColors(scheme.colors.map(c => c.hex))}
                    onAddOne={hex => addColor(hex)}
                    palette={palette}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Issue card ────────────────────────────────────────────────────────────────

function IssueCard({ issue, palette, addColor, updateColor }) {
  const [applied, setApplied] = useState(false);

  const targetEntry = issue.targetHex ? palette.find(c => c.hex.toUpperCase() === issue.targetHex.toUpperCase()) : null;
  const alreadyIn = palette.some(c => c.hex.toUpperCase() === issue.fix.hex.toUpperCase());

  function applyFix() {
    if (targetEntry && !targetEntry.locked && updateColor) {
      updateColor(targetEntry.id, issue.fix.hex);
    } else {
      addColor(issue.fix.hex);
    }
    setApplied(true);
  }

  const isReplace = !!targetEntry && !targetEntry.locked;
  const isLocked  = !!targetEntry && targetEntry.locked;

  return (
    <div className={`issue-card-intel ${SEVERITY_CLASS[issue.severity]}`}>
      <div className="issue-card-top">
        <span className={`issue-severity-dot ${SEVERITY_CLASS[issue.severity]}`}>
          {SEVERITY_ICON[issue.severity]}
        </span>
        <div className="issue-card-meta">
          <span className="issue-card-title">{issue.title}</span>
          <p className="issue-card-explanation">{issue.explanation}</p>
        </div>
      </div>

      <div className="issue-fix-row">
        <div className="issue-fix-swatch" style={{ background: issue.fix.hex }} title={issue.fix.hex} />
        <div className="issue-fix-info">
          <span className="issue-fix-hex">{issue.fix.hex}</span>
          <span className="issue-fix-name">{issue.fix.name}</span>
          <span className="issue-fix-impact">{issue.fix.impact}</span>
          {issue.fix.tradeoff?.note && (
            <span className="fix-tradeoff">{issue.fix.tradeoff.note}</span>
          )}
        </div>
        <div className="issue-fix-action">
          {applied ? (
            <span className="badge badge-pass" style={{ fontSize: '0.7rem' }}>✓ Applied</span>
          ) : alreadyIn ? (
            <span className="badge badge-pass" style={{ fontSize: '0.7rem' }}>✓ In palette</span>
          ) : isLocked ? (
            <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>🔒 Locked</span>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={applyFix} style={{ fontSize: '0.75rem', padding: '0.3rem 0.7rem' }}>
              {isReplace ? '↺ Replace' : '+ Add'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Functional pair card ──────────────────────────────────────────────────────

function FuncPairCard({ label, pair, palette, isCTA }) {
  const fgName = palette.find(c => c.hex === pair.foreground)?.name ?? pair.foreground;
  const bgName = palette.find(c => c.hex === pair.background)?.name ?? pair.background;
  return (
    <div className="func-pair-card">
      <div className="func-pair-label">{label}</div>
      <div
        className="func-pair-preview"
        style={{ background: pair.background, color: pair.foreground }}
      >
        {isCTA ? (
          <span
            className="func-pair-btn-mock"
            style={{ background: pair.foreground, color: pair.background }}
          >{fgName}</span>
        ) : (
          <span className="func-pair-text-mock">Aa {fgName}</span>
        )}
      </div>
      <div className="func-pair-meta">
        <div className="func-pair-swatches">
          <div className="pair-swatch-dot" style={{ background: pair.foreground }} />
          <span className="pair-swatch-sep">on</span>
          <div className="pair-swatch-dot" style={{ background: pair.background }} />
        </div>
        <span className="func-pair-ratio">{pair.ratio.toFixed(1)}:1</span>
        <span className={`badge ${pair.normalAAA ? 'badge-pass' : pair.normalAA ? 'badge-pass' : 'badge-warn'}`}
          style={{ fontSize: '0.65rem' }}
        >
          {pair.normalAAA ? 'AAA' : pair.normalAA ? 'AA' : 'Large AA'}
        </span>
      </div>
    </div>
  );
}

// ── Full pair card ────────────────────────────────────────────────────────────

const IMPORTANCE_LABEL = { critical: 'Critical', important: 'Important', standard: 'Standard', low: 'Low', decorative: 'Decorative' };

function PairCard({ pair, palette, addColor, updateColor }) {
  const fgColor     = palette.find(c => c.hex === pair.foreground);
  const fgName      = fgColor?.name ?? pair.foreground;
  const bgName      = palette.find(c => c.hex === pair.background)?.name ?? pair.background;
  const borderClass = pair.normalAAA ? 'border-pass' : pair.largeAA ? 'border-warn' : 'border-fail';
  const fgLocked    = fgColor?.locked ?? false;
  const isDecorative = pair.importance === 'decorative';

  return (
    <div className={`pair-card ${borderClass}${isDecorative ? ' pair-card-decorative' : ''}`}>
      <div className="pair-preview" style={{ backgroundColor: pair.background }}>
        <div className="pair-preview-lg" style={{ color: pair.foreground }}>Large Text Aa</div>
        <div className="pair-preview-sm" style={{ color: pair.foreground }}>Normal body text at 14px</div>
      </div>

      <div className="pair-swatches">
        <div className="pair-swatch-dot" style={{ background: pair.foreground }} title={`Foreground: ${pair.foreground}`} />
        <span className="pair-swatch-sep">on</span>
        <div className="pair-swatch-dot" style={{ background: pair.background }} title={`Background: ${pair.background}`} />
        <span className="pair-hex" style={{ marginLeft: 'auto' }}>{fgName} / {bgName}</span>
        {pair.importance && (
          <span className={`pair-importance-badge pair-importance-${pair.importance}`}>
            {IMPORTANCE_LABEL[pair.importance] ?? pair.importance}
          </span>
        )}
      </div>

      <div className="pair-details">
        <span className="pair-ratio">{pair.ratio.toFixed(2)}<span>: 1 contrast</span></span>
        <div className="pair-badges">
          <span className={`badge ${pair.normalAA  ? 'badge-pass' : 'badge-fail'}`}>Normal AA</span>
          <span className={`badge ${pair.normalAAA ? 'badge-pass' : 'badge-fail'}`}>Normal AAA</span>
          <span className={`badge ${pair.largeAA   ? 'badge-pass' : 'badge-fail'}`}>Large AA</span>
          <span className={`badge ${pair.largeAAA  ? 'badge-pass' : 'badge-fail'}`}>Large AAA</span>
        </div>
      </div>

      {isDecorative && !pair.normalAA && (
        <div className="pair-decorative-note">Decorative pair — not required to pass WCAG for typical use</div>
      )}

      {!pair.normalAA && pair.why && (
        <div className="pair-why">{pair.why}</div>
      )}

      {!pair.normalAA && pair.fixVariants && (
        <QuickFixPanel
          pair={pair}
          fgColor={fgColor}
          fgLocked={fgLocked}
          palette={palette}
          addColor={addColor}
          updateColor={updateColor}
        />
      )}
    </div>
  );
}

const VARIANT_LABELS = {
  balanced:           { label: 'Balanced',    desc: 'Minimum change, preserves hue & saturation' },
  accessibilityFirst: { label: 'A11y First',  desc: 'Hits 4.5:1 at any cost — may desaturate slightly' },
  aestheticsFirst:    { label: 'Aesthetics',  desc: 'Targets 3:1 (large text) — minimal color change' },
};

function QuickFixPanel({ pair, fgColor, fgLocked, palette, addColor, updateColor }) {
  const [accepted, setAccepted]           = useState(false);
  const [activeVariant, setActiveVariant] = useState('balanced');

  const variant = pair.fixVariants?.[activeVariant];
  const alreadyIn = variant ? palette.some(c => c.hex.toUpperCase() === variant.hex.toUpperCase()) : false;

  function handleAccept() {
    if (!variant) return;
    if (fgColor && updateColor) updateColor(fgColor.id, variant.hex);
    else if (addColor) addColor(variant.hex);
    setAccepted(true);
  }

  return (
    <div className={`qfix-panel ${accepted ? 'qfix-accepted' : ''}`}>
      {!accepted && (
        <div className="qfix-variant-tabs">
          {Object.entries(VARIANT_LABELS).map(([key, { label }]) => (
            pair.fixVariants?.[key] && (
              <button
                key={key}
                className={`qfix-variant-tab ${activeVariant === key ? 'active' : ''}`}
                onClick={() => setActiveVariant(key)}
                title={VARIANT_LABELS[key].desc}
              >
                {label}
              </button>
            )
          ))}
        </div>
      )}

      <div className="qfix-label">
        {accepted ? '✓ Fix applied' : variant?.label ?? 'Use this accessible color instead'}
      </div>

      {!accepted && variant && (
        <div className="qfix-compare">
          <div className="qfix-side">
            <div className="qfix-side-tag">Before</div>
            <div className="qfix-preview" style={{ background: pair.background }}>
              <span style={{ color: pair.foreground }}>Aa</span>
            </div>
            <span className="qfix-ratio qfix-ratio-fail">{pair.ratio.toFixed(1)}:1</span>
          </div>
          <span className="qfix-arrow">→</span>
          <div className="qfix-side">
            <div className="qfix-side-tag">After</div>
            <div className="qfix-preview" style={{ background: pair.background }}>
              <span style={{ color: variant.hex }}>Aa</span>
            </div>
            <span className="qfix-ratio qfix-ratio-pass">{variant.ratio}:1 ✓</span>
          </div>
          <div className="qfix-color-info">
            <div style={{ width: 20, height: 20, borderRadius: 4, background: variant.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 600 }}>{variant.hex}</span>
          </div>
        </div>
      )}

      <div className="qfix-action">
        {accepted ? (
          <span className="badge badge-pass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}>✓ Applied</span>
        ) : fgLocked ? (
          <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>🔒 Color is locked</span>
        ) : alreadyIn ? (
          <span className="badge badge-pass" style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}>✓ Already in palette</span>
        ) : (
          <button className="btn btn-primary btn-sm qfix-btn" onClick={handleAccept} disabled={!variant}>
            ✓ Accept Fix
          </button>
        )}
      </div>
    </div>
  );
}

// ── Neutral swatch ────────────────────────────────────────────────────────────

function NeutralSwatch({ color, palette, onAdd }) {
  const inPalette = palette.some(c => c.hex.toUpperCase() === color.hex.toUpperCase());
  return (
    <div
      className={`neutrals-swatch ${inPalette ? 'in-palette' : ''}`}
      style={{ background: color.hex }}
      onClick={!inPalette ? onAdd : undefined}
      title={`${color.name} — ${color.hex}${inPalette ? ' (in palette)' : ' (click to add)'}`}
    />
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────

const INTENT_ACCENT = {
  accessibility: '#dc2626',
  depth:         '#1d4ed8',
  space:         '#0891b2',
  balance:       '#7c3aed',
  grounding:     '#374151',
  hierarchy:     '#d97706',
  variety:       '#059669',
  contrast:      '#be185d',
  explore:       '#6b7280',
};

function SuggestionCard({ group, onAddAll, onAddOne, palette }) {
  const alreadyIn = hex => palette.some(c => c.hex.toUpperCase() === hex.toUpperCase());
  const accent = INTENT_ACCENT[group.intent] ?? 'var(--accent)';
  const newCount = group.colors.filter(c => !alreadyIn(c.hex)).length;

  return (
    <div className="suggestion-card" style={{ '--card-accent': accent }}>
      <div className="suggestion-card-header">
        <div className="suggestion-card-titles">
          <div className="suggestion-card-name">{group.name}</div>
          {group.reason && (
            <div className="suggestion-card-reason">{group.reason}</div>
          )}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={onAddAll}
          disabled={newCount === 0}
          style={{ flexShrink: 0 }}
        >
          {newCount === 0 ? '✓ All added' : `Add ${newCount > 1 ? `all ${newCount}` : 'color'}`}
        </button>
      </div>
      <div className="suggestion-card-colors">
        {group.colors.map((color, i) => (
          <div
            key={i}
            className={`suggestion-swatch-wrap ${alreadyIn(color.hex) ? 'in-palette' : ''}`}
            title={`${color.name} — ${color.hex}${alreadyIn(color.hex) ? ' · already in palette' : ' · click to add'}`}
            onClick={() => !alreadyIn(color.hex) && onAddOne(color.hex)}
          >
            <div className="suggestion-swatch" style={{ background: color.hex }} />
            {alreadyIn(color.hex) && <span className="suggestion-swatch-check">✓</span>}
            <span className="suggestion-swatch-hex">{color.hex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
