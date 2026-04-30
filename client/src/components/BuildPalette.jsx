import { useState } from 'react';
import ColorPicker from './ColorPicker.jsx';
import ColorSwatch from './ColorSwatch.jsx';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function parseHexes(raw) {
  return (raw.match(/#[0-9A-Fa-f]{6}/gi) ?? []).map(h => h.toUpperCase());
}

export default function BuildPalette({ palette, addColor, addColors, removeColor, toggleLock }) {
  const [pickerColor, setPickerColor] = useState('#3B82F6');
  const [result, setResult]           = useState(null);
  const [loading, setLoading]         = useState(false);
  const [variant, setVariant]         = useState(0);
  const [suggestBase, setSuggestBase] = useState(null);
  const [importOpen, setImportOpen]   = useState(false);
  const [importText, setImportText]   = useState('');

  async function getSuggestions(nextVariant = 0) {
    setLoading(true);
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
      setResult(data);
      setSuggestBase(paletteMode ? `palette:${palette.length}` : pickerColor);
      setVariant(nextVariant);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleShuffle() {
    const next = (variant + 1) % 5;
    getSuggestions(next);
  }

  function handleImport() {
    const hexes = parseHexes(importText);
    if (hexes.length > 0) {
      addColors(hexes);
      setImportText('');
      setImportOpen(false);
    }
  }

  const importPreview = parseHexes(importText);

  return (
    <div className="build-layout">
      {/* Input row */}
      <div>
        <div className="section-header">
          <div>
            <h2 className="section-title">Build Your Color Palette</h2>
            <p className="section-desc">
              Drop in your brand colors. Smart Palette Suggestions™ will instantly recommend light neutrals,
              dark neutrals, and harmony colors to round things out.
            </p>
          </div>
        </div>

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
            disabled={loading}
            style={{ marginLeft: 'auto' }}
          >
            {loading ? <span className="spinner" /> : '✦'}
            {loading ? 'Generating…' : 'Smart Suggestions™'}
          </button>
        </div>

        {/* Import panel */}
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
      </div>

      {/* Palette grid */}
      {palette.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">🎨</span>
            <p className="empty-state-title">Your palette is empty</p>
            <p className="empty-state-desc">
              Add your first brand color above, or generate Smart Suggestions™ to get a full palette instantly.
            </p>
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

      {/* Smart Palette Suggestions™ */}
      {result && (
        <div>
          <div className="section-header">
            <div>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>
                Smart Palette Suggestions™
              </h3>
              <p className="section-desc">
                {suggestBase?.startsWith('palette:') ? (
                  <>
                    Completing your{' '}
                    <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                      {suggestBase.split(':')[1]}-color palette
                    </span>
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
              <button className="btn btn-ghost btn-sm" onClick={handleShuffle} disabled={loading}>
                ⟳ Shuffle
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}>
                Dismiss
              </button>
            </div>
          </div>

          {/* Neutrals panel */}
          <div className="neutrals-section" style={{ marginBottom: '1rem' }}>
            <div className="neutrals-section-header">
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>Neutrals</span>
                <span style={{ fontSize: '0.775rem', color: 'var(--text-3)', marginLeft: '0.5rem' }}>
                  Tinted with your brand hue
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => addColors([...result.neutrals.lights.map(c => c.hex), ...result.neutrals.darks.map(c => c.hex)])}
              >
                Add All
              </button>
            </div>

            <div className="neutrals-row">
              <span className="neutrals-row-label">Light</span>
              <div className="neutrals-swatches">
                {result.neutrals.lights.map((c, i) => (
                  <NeutralSwatch key={i} color={c} palette={palette} onAdd={() => addColor(c.hex)} />
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => addColors(result.neutrals.lights.map(c => c.hex))}>
                Add row
              </button>
            </div>

            <div className="neutrals-row">
              <span className="neutrals-row-label">Dark</span>
              <div className="neutrals-swatches">
                {result.neutrals.darks.map((c, i) => (
                  <NeutralSwatch key={i} color={c} palette={palette} onAdd={() => addColor(c.hex)} />
                ))}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => addColors(result.neutrals.darks.map(c => c.hex))}>
                Add row
              </button>
            </div>
          </div>

          {/* Harmony / completion schemes */}
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-2)' }}>
              {result.mode === 'palette' ? 'Completion Suggestions' : 'Harmony Colors'}
            </span>
          </div>
          <div className="suggestions-grid">
            {result.harmonies.map(scheme => (
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
          <div
            key={i}
            style={{ position: 'relative', display: 'inline-block' }}
            title={`${color.name} — ${color.hex}`}
          >
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
