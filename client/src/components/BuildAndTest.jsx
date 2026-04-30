import { useState, useEffect } from 'react';
import ColorPicker from './ColorPicker.jsx';
import ColorSwatch from './ColorSwatch.jsx';

const FILTERS = [
  { id: 'fail', label: 'Fails' },
  { id: 'all',  label: 'All' },
  { id: 'aaa',  label: 'AAA' },
  { id: 'aa',   label: 'AA' },
];

function parseHexes(raw) {
  return (raw.match(/#[0-9A-Fa-f]{6}/gi) ?? []).map(h => h.toUpperCase());
}

export default function BuildAndTest({ palette, addColor, addColors, removeColor, updateColor, toggleLock }) {
  const [pickerColor, setPickerColor]   = useState('#3B82F6');
  const [suggestions, setSuggestions]   = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [variant, setVariant]           = useState(0);
  const [suggestBase, setSuggestBase]   = useState(null);
  const [importOpen, setImportOpen]     = useState(false);
  const [importText, setImportText]     = useState('');

  const [pairs, setPairs]         = useState([]);
  const [testLoading, setTestLoading] = useState(false);
  const [filter, setFilter]       = useState('fail');
  const [testError, setTestError] = useState(null);

  async function runTest() {
    if (palette.length < 2) { setPairs([]); return; }
    setTestLoading(true);
    setTestError(null);
    try {
      const res = await fetch('/api/accessibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors: palette.map(c => c.hex) }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPairs((await res.json()).pairs);
    } catch (e) { setTestError(e.message); }
    finally { setTestLoading(false); }
  }

  useEffect(() => {
    runTest();
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

  const stats = {
    total: pairs.length,
    aaa:   pairs.filter(p => p.normalAAA).length,
    aa:    pairs.filter(p => p.normalAA).length,
    fail:  pairs.filter(p => !p.normalAA && !p.largeAA).length,
  };

  const filtered = pairs.filter(p => {
    if (filter === 'aaa')  return p.normalAAA;
    if (filter === 'aa')   return p.normalAA;
    if (filter === 'fail') return !p.normalAA && !p.largeAA;
    return true;
  });

  return (
    <div className="build-test-layout">
      <div className="section-header">
        <div>
          <h2 className="section-title">Build &amp; Test Your Palette</h2>
          <p className="section-desc">
            Add colors and watch contrast scores update live. Smart Suggestions™ analyzes your whole palette and surfaces the most accessible completions first.
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

      {/* Two-column: palette (left) + live contrast (right) */}
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

        {/* Right: live contrast panel */}
        <div className="contrast-panel">
          <div className="contrast-panel-header">
            <div className="contrast-panel-title-row">
              <span className="contrast-panel-title">Live Contrast</span>
              {testLoading && <span className="spinner" style={{ width: 13, height: 13, borderWidth: 1.5 }} />}
              {!testLoading && pairs.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={runTest}
                  style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem', marginLeft: 'auto' }}
                >↺</button>
              )}
            </div>
            {palette.length < 2 ? (
              <p className="contrast-panel-hint">Add at least 2 colors to see results.</p>
            ) : !testLoading && pairs.length > 0 ? (
              <div className="contrast-stats-row">
                <span className="contrast-stat contrast-stat-neutral">{stats.total} pairs</span>
                {stats.aaa  > 0 && <span className="contrast-stat contrast-stat-pass">✓ {stats.aaa} AAA</span>}
                {stats.aa   > 0 && <span className="contrast-stat contrast-stat-pass">✓ {stats.aa} AA</span>}
                {stats.fail > 0
                  ? <span className="contrast-stat contrast-stat-fail">✗ {stats.fail} Fail</span>
                  : <span className="contrast-stat contrast-stat-pass">✓ All pass</span>
                }
              </div>
            ) : null}
          </div>

          {palette.length >= 2 && !testLoading && pairs.length > 0 && (
            <>
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
                      ({f.id === 'all' ? stats.total : f.id === 'aaa' ? stats.aaa : f.id === 'aa' ? stats.aa : stats.fail})
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
            </>
          )}

          {palette.length < 2 && (
            <div className="contrast-empty-large">
              <span className="contrast-empty-icon">◎</span>
              <p>Add at least 2 colors to test contrast</p>
            </div>
          )}

          {testError && (
            <div style={{ padding: '0.875rem 1.125rem', fontSize: '0.8rem', color: 'var(--red-dk)' }}>
              {testError}
            </div>
          )}
        </div>
      </div>

      {/* Smart Suggestions — full width below */}
      {suggestions && (
        <div>
          <div className="section-header">
            <div>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Smart Palette Suggestions™</h3>
              <p className="section-desc">
                {suggestBase?.startsWith('palette:') ? (
                  <>
                    Completing your{' '}
                    <strong style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                      {suggestBase.split(':')[1]}-color palette
                    </strong>
                    {' '}· most accessible colors shown first
                    {variant > 0 && <span style={{ color: 'var(--accent)', marginLeft: '0.35rem' }}>· Shuffle {variant}</span>}
                  </>
                ) : (
                  <>
                    Based on{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-1)' }}>
                      {suggestBase}
                    </span>
                    {variant > 0 && <span style={{ color: 'var(--accent)', marginLeft: '0.35rem' }}>· Shuffle {variant}</span>}
                  </>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => getSuggestions((variant + 1) % 5)} disabled={suggestLoading}>
                ⟳ Shuffle
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSuggestions(null)}>Dismiss</button>
            </div>
          </div>

          <div className="neutrals-section" style={{ marginBottom: '1rem' }}>
            <div className="neutrals-section-header">
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>Neutrals</span>
                <span style={{ fontSize: '0.775rem', color: 'var(--text-3)', marginLeft: '0.5rem' }}>Tinted with your palette hue</span>
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

          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {suggestions.mode === 'palette' ? 'Completion Suggestions' : 'Harmony Colors'}
            </span>
          </div>
          <div className="suggestions-grid">
            {suggestions.harmonies.map(scheme => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                onAddAll={() => addColors(scheme.colors.map(c => c.hex))}
                onAddOne={hex => addColor(hex)}
                palette={palette}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full pair card (same fidelity as standalone Test tab) ────────────────────

function PairCard({ pair, palette, addColor, updateColor }) {
  const fgColor     = palette.find(c => c.hex === pair.foreground);
  const fgName      = fgColor?.name ?? pair.foreground;
  const bgName      = palette.find(c => c.hex === pair.background)?.name ?? pair.background;
  const borderClass = pair.normalAAA ? 'border-pass' : pair.largeAA ? 'border-warn' : 'border-fail';
  const fgLocked    = fgColor?.locked ?? false;

  return (
    <div className={`pair-card ${borderClass}`}>
      <div className="pair-preview" style={{ backgroundColor: pair.background }}>
        <div className="pair-preview-lg" style={{ color: pair.foreground }}>Large Text Aa</div>
        <div className="pair-preview-sm" style={{ color: pair.foreground }}>Normal body text at 14px</div>
      </div>

      <div className="pair-swatches">
        <div className="pair-swatch-dot" style={{ background: pair.foreground }} title={`Foreground: ${pair.foreground}`} />
        <span className="pair-swatch-sep">on</span>
        <div className="pair-swatch-dot" style={{ background: pair.background }} title={`Background: ${pair.background}`} />
        <span className="pair-hex" style={{ marginLeft: 'auto' }}>{fgName} / {bgName}</span>
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

      {!pair.normalAA && pair.quickFix && (
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

function QuickFixPanel({ pair, fgColor, fgLocked, palette, addColor, updateColor }) {
  const [accepted, setAccepted] = useState(false);
  const alreadyIn = palette.some(c => c.hex.toUpperCase() === pair.quickFix.hex.toUpperCase());

  function handleAccept() {
    if (fgColor && updateColor) updateColor(fgColor.id, pair.quickFix.hex);
    else if (addColor) addColor(pair.quickFix.hex);
    setAccepted(true);
  }

  return (
    <div className={`qfix-panel ${accepted ? 'qfix-accepted' : ''}`}>
      <div className="qfix-label">
        {accepted ? '✓ Fix applied' : pair.quickFix.label ?? 'Use this accessible color instead'}
      </div>

      {!accepted && (
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
              <span style={{ color: pair.quickFix.hex }}>Aa</span>
            </div>
            <span className="qfix-ratio qfix-ratio-pass">{pair.quickFix.ratio}:1 ✓</span>
          </div>
          <div className="qfix-color-info">
            <div style={{ width: 20, height: 20, borderRadius: 4, background: pair.quickFix.hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 600 }}>{pair.quickFix.hex}</span>
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
          <button className="btn btn-primary btn-sm qfix-btn" onClick={handleAccept}>
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

// ── Scheme card ───────────────────────────────────────────────────────────────

function SchemeCard({ scheme, onAddAll, onAddOne, palette }) {
  const alreadyIn = hex => palette.some(c => c.hex.toUpperCase() === hex.toUpperCase());
  return (
    <div className="scheme-card">
      <div className="scheme-card-header">
        <div>
          <div className="scheme-name">{scheme.name}</div>
          <div className="scheme-desc">{scheme.description}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onAddAll}>Add All</button>
      </div>
      <div className="scheme-colors">
        {scheme.colors.map((color, i) => (
          <div key={i} style={{ position: 'relative', display: 'inline-block' }} title={`${color.name} — ${color.hex}`}>
            <ColorSwatch hex={color.hex} size="sm" onClick={() => onAddOne(color.hex)} />
            {alreadyIn(color.hex) && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 13, height: 13, borderRadius: '50%',
                background: 'var(--green)', border: '2px solid white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 7, color: 'white', fontWeight: 800, pointerEvents: 'none',
              }}>✓</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
