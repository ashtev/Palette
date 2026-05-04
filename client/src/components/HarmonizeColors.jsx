import { useState, useEffect, useMemo } from 'react';
import ColorSwatch from './ColorSwatch.jsx';
import { getHue } from '../utils/colorName.js';

const CX = 200, CY = 200, OUTER_R = 180, INNER_R = 118, DOT_R = 149;
const TO_RAD = Math.PI / 180;

function polarToXY(angleDeg, r) {
  const a = (angleDeg - 90) * TO_RAD;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

const WHEEL_SEGMENTS = Array.from({ length: 360 }, (_, d) => {
  const sa = (d - 90) * TO_RAD, ea = (d - 89) * TO_RAD;
  const ox1 = CX + OUTER_R * Math.cos(sa), oy1 = CY + OUTER_R * Math.sin(sa);
  const ox2 = CX + OUTER_R * Math.cos(ea), oy2 = CY + OUTER_R * Math.sin(ea);
  const ix2 = CX + INNER_R * Math.cos(ea), iy2 = CY + INNER_R * Math.sin(ea);
  const ix1 = CX + INNER_R * Math.cos(sa), iy1 = CY + INNER_R * Math.sin(sa);
  return (
    <path
      key={d}
      d={`M ${ox1} ${oy1} A ${OUTER_R} ${OUTER_R} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${INNER_R} ${INNER_R} 0 0 0 ${ix1} ${iy1} Z`}
      fill={`hsl(${d},100%,50%)`}
    />
  );
});

const ISSUE_META = {
  harmony:              { label: 'Harmony',         icon: '◑', cls: 'type-harmony' },
  'too-dark':           { label: 'Too Dark',         icon: '◼', cls: 'type-too-dark' },
  'too-vibrant':        { label: 'Too Vibrant',      icon: '◉', cls: 'type-too-vibrant' },
  'too-similar':        { label: 'Too Similar',      icon: '⊕', cls: 'type-too-similar' },
  'no-dominant':        { label: 'No Dominant',      icon: '◎', cls: 'type-no-dominant' },
  'flat-lightness':     { label: 'Flat Lightness',   icon: '≡', cls: 'type-flat-lightness' },
};

export default function HarmonizeColors({ palette, updateColor }) {
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [fixed, setFixed]     = useState(new Set());
  const [showMetrics, setShowMetrics] = useState(false);

  async function runFixer() {
    if (palette.length < 2) return;
    setLoading(true);
    setError(null);
    setFixed(new Set());
    try {
      const res = await fetch('/api/harmonize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colors: palette.map(c => c.hex) }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResult(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (palette.length >= 2) runFixer();
    else setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.map(c => c.hex).join(',')]);

  function applyFix(issue) {
    const color = palette.find(c => c.hex === issue.color);
    if (!color) return;
    if (color.locked) return;
    updateColor(color.id, issue.suggestion);
    setFixed(prev => new Set([...prev, issue.color]));
  }

  const dots = useMemo(() => {
    return palette.map(color => {
      const apiEntry = result?.colorData?.find(d => d.hex === color.hex);
      const hue = apiEntry ? apiEntry.hue : getHue(color.hex);
      const { x, y } = polarToXY(hue, DOT_R);
      return { ...color, hue, x, y };
    });
  }, [palette, result]);

  const lines = useMemo(() => {
    const out = [];
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        out.push(
          <line key={`${i}-${j}`} x1={dots[i].x} y1={dots[i].y} x2={dots[j].x} y2={dots[j].y}
            stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="4 3" />
        );
      }
    }
    return out;
  }, [dots]);

  const totalIssues = result ? (result.issues?.length ?? 0) + (result.balanceIssues?.length ?? 0) : 0;
  const scoreColor = result
    ? result.score >= 80 ? 'var(--green)' : result.score >= 50 ? 'var(--amber)' : 'var(--red)'
    : 'var(--border-2)';

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">The Fixer</h2>
          <p className="section-desc">
            Run a harmony scan to spot the troublemakers — then fix them with one click.
          </p>
        </div>
        {palette.length >= 2 && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowMetrics(m => !m)}>
              {showMetrics ? '↑ Hide Metrics' : '↓ Palette Metrics'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={runFixer} disabled={loading}>
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Scanning…</> : '⚡ Run Fixer'}
            </button>
          </div>
        )}
      </div>

      {palette.length < 2 ? (
        <div className="card">
          <div className="empty-state">
            <span className="empty-state-icon">⚡</span>
            <p className="empty-state-title">Need at least 2 colors</p>
            <p className="empty-state-desc">Add more colors in Build to run The Fixer.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Metrics panel */}
          {showMetrics && result?.metrics && (
            <MetricsPanel metrics={result.metrics} />
          )}

          <div className="fixer-layout">
            {/* Results panel — primary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {error && (
                <div style={{ padding: '1rem', background: 'var(--red-bg)', borderRadius: 'var(--r-md)', color: 'var(--red-dk)', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}

              {result && !loading && (
                <>
                  {/* Summary banner */}
                  {totalIssues === 0 ? (
                    <div className="fixer-summary clean">
                      <span className="fixer-summary-icon">✓</span>
                      <div className="fixer-summary-text">
                        <strong>Palette looks great!</strong>
                        <span>No issues found — your colors are in harmony.</span>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '1.25rem', fontWeight: 800, color: 'var(--green-dk)' }}>
                        {result.score}/100
                      </span>
                    </div>
                  ) : (
                    <div className="fixer-summary issues">
                      <span className="fixer-summary-icon">⚠</span>
                      <div className="fixer-summary-text">
                        <strong>Found {totalIssues} issue{totalIssues !== 1 ? 's' : ''}</strong>
                        <span>Fix them below for a polished, professional palette.</span>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '1.25rem', fontWeight: 800 }}>
                        {result.score}/100
                      </span>
                    </div>
                  )}

                  {/* Health score breakdown */}
                  <div className="health-score-card">
                    <div className="health-score-overall">
                      <span className="health-score-num" style={{ color: scoreColor }}>{result.score}</span>
                      <div>
                        <div className="health-score-title">Overall Health</div>
                        <div className="harmony-type-row" style={{ marginTop: '0.25rem' }}>
                          <span className="harmony-type-label">Detected harmony</span>
                          <span className="badge badge-info">{result.detectedType}</span>
                        </div>
                      </div>
                    </div>
                    <div className="health-score-metrics">
                      <ScoreMetric label="Harmony" value={result.healthScore?.harmony ?? result.score} />
                      <ScoreMetric label="Balance" value={result.healthScore?.balance ?? 100} />
                    </div>
                  </div>

                  {/* Balance issues (palette-level) */}
                  {result.balanceIssues?.map((bi, i) => (
                    <div key={i} className="balance-card">
                      <span className="balance-card-icon">⊞</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                          <span className={`issue-type-badge ${bi.type === 'temperature-imbalance' ? 'type-temperature' : bi.type === 'too-many-saturated' ? 'type-too-vibrant' : 'type-missing-neutral'}`}>
                            {bi.type === 'temperature-imbalance' ? '◑ Temperature' : bi.type === 'too-many-saturated' ? '◉ Saturation' : '⬡ Balance'}
                          </span>
                        </div>
                        {bi.fixLabel && <p className="issue-fix-label">{bi.fixLabel}</p>}
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '0.625rem' }}>
                          {bi.description}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <ColorSwatch hex={bi.suggestion} name="Suggested" size="sm" />
                          <span style={{ fontSize: '0.775rem', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{bi.suggestion}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Individual issues */}
                  {result.issues.map((issue, i) => {
                    const paletteColor = palette.find(c => c.hex === issue.color);
                    return (
                      <IssueCard
                        key={i}
                        issue={issue}
                        palette={palette}
                        wasFixed={fixed.has(issue.color)}
                        isLocked={paletteColor?.locked ?? false}
                        onFix={() => applyFix(issue)}
                      />
                    );
                  })}
                </>
              )}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }}>
                  <span className="spinner" style={{ width: 22, height: 22 }} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-3)' }}>Running Fixer scan…</span>
                </div>
              )}
            </div>

            {/* Color wheel — secondary */}
            <div className="wheel-container">
              <p className="wheel-title">Harmony Wheel</p>
              <svg viewBox="0 0 400 400" aria-label="Color harmony wheel">
                <g>{WHEEL_SEGMENTS}</g>
                <circle cx={CX} cy={CY} r={INNER_R - 2} fill="#1a1a2e" />
                {result && (
                  <>
                    <text x={CX} y={CY - 8}  textAnchor="middle" fill="white" fontSize="11" fontWeight="600" opacity="0.85">{result.detectedType}</text>
                    <text x={CX} y={CY + 12} textAnchor="middle" fill="white" fontSize="24" fontWeight="800">{result.score}</text>
                    <text x={CX} y={CY + 28} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="10">score</text>
                  </>
                )}
                {loading && <text x={CX} y={CY + 6} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="12">Scanning…</text>}
                {lines}
                {dots.map((dot, i) => (
                  <g key={dot.id}>
                    <circle cx={dot.x} cy={dot.y} r="13" fill={dot.hex} stroke={dot.locked ? '#a78bfa' : 'white'} strokeWidth={dot.locked ? '3' : '2.5'} />
                    <text x={dot.x} y={dot.y + 4} textAnchor="middle" fontSize="8" fill={isLight(dot.hex) ? '#111' : '#fff'} fontWeight="700">{i + 1}</text>
                  </g>
                ))}
              </svg>

              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                {dots.map((dot, i) => (
                  <div key={dot.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: dot.hex, flexShrink: 0, boxShadow: dot.locked ? '0 0 0 2px #a78bfa' : 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{i + 1}. {dot.name}{dot.locked ? ' 🔒' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricsPanel({ metrics }) {
  const total = metrics.total;
  const satTotal = metrics.saturation.low + metrics.saturation.mid + metrics.saturation.high || 1;
  const tempTotal = metrics.temperature.warm + metrics.temperature.cool + metrics.temperature.neutral || 1;

  return (
    <div className="metrics-panel">
      <div className="metrics-panel-header">
        <span className="metrics-panel-title">Palette Metrics</span>
        <span className="badge badge-neutral">{total} color{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="metrics-grid">
        {/* Saturation */}
        <div className="metric-card">
          <div className="metric-card-label">Saturation</div>
          <div className="metric-card-value">{metrics.saturation.label}</div>
          <div className="metric-bar-stack">
            {metrics.saturation.low > 0 && (
              <div className="metric-bar-seg seg-low" style={{ flex: metrics.saturation.low }} title={`Low (muted): ${metrics.saturation.low}`} />
            )}
            {metrics.saturation.mid > 0 && (
              <div className="metric-bar-seg seg-mid" style={{ flex: metrics.saturation.mid }} title={`Mid: ${metrics.saturation.mid}`} />
            )}
            {metrics.saturation.high > 0 && (
              <div className="metric-bar-seg seg-high" style={{ flex: metrics.saturation.high }} title={`High (vivid): ${metrics.saturation.high}`} />
            )}
          </div>
          <div className="metric-legend">
            <span><span className="metric-dot seg-low" />Muted ({metrics.saturation.low})</span>
            <span><span className="metric-dot seg-mid" />Mid ({metrics.saturation.mid})</span>
            <span><span className="metric-dot seg-high" />Vivid ({metrics.saturation.high})</span>
          </div>
        </div>

        {/* Lightness */}
        <div className="metric-card">
          <div className="metric-card-label">Lightness Range</div>
          <div className="metric-card-value">{metrics.lightness.label}</div>
          <div className="metric-lightness-track">
            <div
              className="metric-lightness-range"
              style={{
                left: `${metrics.lightness.min}%`,
                width: `${metrics.lightness.spread}%`,
              }}
            />
          </div>
          <div className="metric-legend">
            <span>Min {metrics.lightness.min}%</span>
            <span style={{ marginLeft: 'auto' }}>Max {metrics.lightness.max}%</span>
          </div>
        </div>

        {/* Temperature */}
        <div className="metric-card">
          <div className="metric-card-label">Temperature</div>
          <div className="metric-card-value">{metrics.temperature.label}</div>
          <div className="metric-bar-stack">
            {metrics.temperature.warm > 0 && (
              <div className="metric-bar-seg seg-warm" style={{ flex: metrics.temperature.warm }} title={`Warm: ${metrics.temperature.warm}`} />
            )}
            {metrics.temperature.neutral > 0 && (
              <div className="metric-bar-seg seg-neutral-t" style={{ flex: metrics.temperature.neutral }} title={`Neutral: ${metrics.temperature.neutral}`} />
            )}
            {metrics.temperature.cool > 0 && (
              <div className="metric-bar-seg seg-cool" style={{ flex: metrics.temperature.cool }} title={`Cool: ${metrics.temperature.cool}`} />
            )}
          </div>
          <div className="metric-legend">
            <span><span className="metric-dot seg-warm" />Warm ({metrics.temperature.warm})</span>
            <span><span className="metric-dot seg-cool" />Cool ({metrics.temperature.cool})</span>
            <span><span className="metric-dot seg-neutral-t" />Neutral ({metrics.temperature.neutral})</span>
          </div>
        </div>

        {/* Hue diversity */}
        <div className="metric-card">
          <div className="metric-card-label">Hue Diversity</div>
          <div className="metric-card-value" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent)' }}>
            {metrics.hueDiversity}<span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-3)', marginLeft: '0.25rem' }}>/6 zones</span>
          </div>
          <div className="metric-hue-zones">
            {['Red/Orange', 'Yellow/Green', 'Green', 'Teal/Cyan', 'Blue/Indigo', 'Violet/Purple'].map((label, i) => (
              <div key={i} className={`hue-zone-dot ${metrics.hueDiversity > i ? 'active' : ''}`} title={label} style={{ background: `hsl(${i * 60 + 10}, 80%, 55%)` }} />
            ))}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-4)', marginTop: '0.25rem' }}>
            {metrics.hueDiversity <= 2 ? 'Narrow — consider adding more hue variety' : metrics.hueDiversity >= 5 ? 'Broad hue range' : 'Good variety'}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreMetric({ label, value }) {
  const color = value >= 80 ? 'var(--green)' : value >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <div className="health-metric">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{value}</span>
      </div>
      <div className="harmony-score-bar">
        <div className="harmony-score-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function IssueCard({ issue, palette, wasFixed, isLocked, onFix }) {
  const meta = ISSUE_META[issue.type] ?? { label: issue.type, icon: '!', cls: 'type-harmony' };
  const colorEntry = palette.find(c => c.hex === issue.color);

  return (
    <div className={`issue-card severity-${issue.severity} ${wasFixed ? 'was-fixed' : ''}`}
      style={{ opacity: wasFixed ? 0.6 : 1, transition: 'opacity 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`issue-type-badge ${meta.cls}`}>{meta.icon} {meta.label}</span>
          {isLocked && <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', fontSize: '0.65rem' }}>🔒 Locked</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className={`badge ${issue.severity === 'error' ? 'badge-fail' : 'badge-warn'}`}>
            {issue.severity === 'error' ? 'Error' : 'Warning'}
          </span>
        </div>
      </div>

      {issue.fixLabel && <p className="issue-fix-label">{issue.fixLabel}</p>}

      <div className="issue-colors">
        <ColorSwatch hex={issue.color}      name={colorEntry?.name ?? 'Current'} size="md" locked={isLocked} />
        <span className="issue-arrow">→</span>
        <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
          <ColorSwatch hex={issue.suggestion} name="Fixed" size="md" />
          {issue.accessibilityAdjusted && (
            <span className="a11y-adjusted-tag">Adjusted for readability</span>
          )}
        </div>
      </div>

      <p className="issue-desc">{issue.description}</p>

      <div className="issue-footer">
        <span style={{ fontSize: '0.75rem', color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
          {issue.color} → {issue.suggestion}
        </span>
        {isLocked ? (
          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>🔒 Can't fix — locked</span>
        ) : wasFixed ? (
          <span className="badge badge-pass">✓ Fixed</span>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={onFix}>Apply Fix</button>
        )}
      </div>
    </div>
  );
}

function isLight(hex) {
  if (!hex) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
