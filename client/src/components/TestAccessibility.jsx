import { useState, useEffect } from 'react';

const FILTERS = [
  { id: 'all',     label: 'All Pairs' },
  { id: 'aaa',     label: 'AAA Pass' },
  { id: 'aa',      label: 'AA Pass' },
  { id: 'fail',    label: 'Fail' },
];

export default function TestAccessibility({ palette, addColor, updateColor }) {
  const [pairs, setPairs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState('all');
  const [error, setError]       = useState(null);

  async function runTest() {
    if (palette.length < 2) { setPairs([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/accessibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors: palette.map(c => c.hex) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPairs(data.pairs);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.map(c => c.hex).join(',')]);

  const filtered = pairs.filter(p => {
    if (filter === 'aaa')  return p.normalAAA;
    if (filter === 'aa')   return p.normalAA;
    if (filter === 'fail') return !p.normalAA && !p.largeAA;
    return true;
  });

  const stats = {
    aaa:  pairs.filter(p => p.normalAAA).length,
    aa:   pairs.filter(p => p.normalAA).length,
    fail: pairs.filter(p => !p.normalAA && !p.largeAA).length,
  };

  return (
    <div className="a11y-layout">
      <div className="section-header">
        <div>
          <h2 className="section-title">Test Your Palette</h2>
          <p className="section-desc">
            Run every color combo through WCAG 2.1 contrast testing. See the exact scores, check which pairs
            pass AA/AAA standards, and feel confident your palette works everywhere.
          </p>
        </div>
        {palette.length >= 2 && (
          <button className="btn btn-ghost btn-sm" onClick={runTest} disabled={loading}>
            {loading ? <span className="spinner" /> : '↺'} Refresh
          </button>
        )}
      </div>

      {palette.length < 2 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">◎</span>
            <p className="empty-state-title">Need at least 2 colors</p>
            <p className="empty-state-desc">Build your palette first, then run a contrast test.</p>
          </div>
        </div>
      ) : error ? (
        <div style={{ padding: '1rem', background: 'var(--red-bg)', borderRadius: 'var(--r-md)', color: 'var(--red-dk)', fontSize: '0.875rem' }}>
          {error}
        </div>
      ) : (
        <>
          {/* Summary stats */}
          {pairs.length > 0 && (
            <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
              <StatPill label="Total pairs" value={pairs.length} variant="neutral" />
              <StatPill label="AAA Pass"    value={stats.aaa}     variant="pass" />
              <StatPill label="AA Pass"     value={stats.aa}      variant="pass" />
              <StatPill label="Fail"        value={stats.fail}    variant="fail" />
            </div>
          )}

          {/* Filter bar */}
          <div className="filter-bar">
            {FILTERS.map(f => (
              <button
                key={f.id}
                className={`filter-btn ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                {f.id !== 'all' && pairs.length > 0 && (
                  <span style={{ marginLeft: '0.375rem', opacity: 0.75 }}>
                    ({f.id === 'aaa' ? stats.aaa : f.id === 'aa' ? stats.aa : stats.fail})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Pairs grid */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <span className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <span className="empty-state-icon">○</span>
                <p className="empty-state-title">No pairs match this filter</p>
              </div>
            </div>
          ) : (
            <div className="pairs-grid">
              {filtered.map((pair, i) => (
                <PairCard key={i} pair={pair} palette={palette} addColor={addColor} updateColor={updateColor} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PairCard({ pair, palette, addColor, updateColor }) {
  const fgColor = palette.find(c => c.hex === pair.foreground);
  const fgName  = fgColor?.name ?? pair.foreground;
  const bgName  = palette.find(c => c.hex === pair.background)?.name ?? pair.background;
  const borderClass  = pair.normalAAA ? 'border-pass' : pair.largeAA ? 'border-warn' : 'border-fail';
  const fgLocked     = fgColor?.locked ?? false;

  return (
    <div className={`pair-card ${borderClass}`}>
      {/* Color preview */}
      <div className="pair-preview" style={{ backgroundColor: pair.background }}>
        <div className="pair-preview-lg" style={{ color: pair.foreground }}>Large Text Aa</div>
        <div className="pair-preview-sm" style={{ color: pair.foreground }}>Normal body text at 14px</div>
      </div>

      {/* Swatches row */}
      <div className="pair-swatches">
        <div className="pair-swatch-dot" style={{ background: pair.foreground }} title={`Foreground: ${pair.foreground}`} />
        <span className="pair-swatch-sep">on</span>
        <div className="pair-swatch-dot" style={{ background: pair.background }} title={`Background: ${pair.background}`} />
        <span className="pair-hex" style={{ marginLeft: 'auto' }}>{fgName} / {bgName}</span>
      </div>

      {/* Details */}
      <div className="pair-details">
        <span className="pair-ratio">{pair.ratio.toFixed(2)}<span>: 1 contrast</span></span>
        <div className="pair-badges">
          <span className={`badge ${pair.normalAA  ? 'badge-pass' : 'badge-fail'}`}>Normal AA</span>
          <span className={`badge ${pair.normalAAA ? 'badge-pass' : 'badge-fail'}`}>Normal AAA</span>
          <span className={`badge ${pair.largeAA   ? 'badge-pass' : 'badge-fail'}`}>Large AA</span>
          <span className={`badge ${pair.largeAAA  ? 'badge-pass' : 'badge-fail'}`}>Large AAA</span>
        </div>
      </div>

      {/* One-click fix for failing pairs */}
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
    if (fgColor && updateColor) {
      updateColor(fgColor.id, pair.quickFix.hex);
    } else if (addColor) {
      addColor(pair.quickFix.hex);
    }
    setAccepted(true);
  }

  return (
    <div className={`qfix-panel ${accepted ? 'qfix-accepted' : ''}`}>
      {/* Label */}
      <div className="qfix-label">
        {accepted
          ? '✓ Fix applied'
          : pair.quickFix.label ?? 'Use this accessible color instead'}
      </div>

      {/* Before / After comparison */}
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

      {/* Action */}
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

function StatPill({ label, value, variant }) {
  const cls = variant === 'pass' ? 'badge-pass' : variant === 'fail' ? 'badge-fail' : 'badge-neutral';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.5rem 0.875rem',
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--r-full)', fontSize: '0.8125rem',
    }}>
      <span className={`badge ${cls}`} style={{ padding: '0.1rem 0.45rem' }}>{value}</span>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
    </div>
  );
}
