export default function ColorSwatch({
  hex,
  name,
  size = 'md',
  showRemove = false,
  onRemove,
  showLock = false,
  locked = false,
  onLock,
  onClick,
  selected = false,
  title,
}) {
  const showInfo = size === 'md' || size === 'lg';

  return (
    <div
      className={`swatch swatch-${size} ${selected ? 'selected' : ''} ${onClick ? 'clickable' : ''} ${locked ? 'locked' : ''}`}
      onClick={onClick}
      title={title ?? hex}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
    >
      <div className="swatch-color" style={{ backgroundColor: hex }} />

      {showRemove && !locked && (
        <button
          className="swatch-remove"
          onClick={e => { e.stopPropagation(); onRemove?.(); }}
          title={`Remove ${hex}`}
          aria-label={`Remove ${name ?? hex}`}
        >
          ✕
        </button>
      )}

      {(showLock || locked) && (
        <button
          className={`swatch-lock ${locked ? 'is-locked' : ''}`}
          onClick={e => { e.stopPropagation(); onLock?.(); }}
          title={locked ? 'Unlock color' : 'Lock color'}
          aria-label={locked ? 'Unlock color' : 'Lock color'}
          aria-pressed={locked}
        >
          {locked ? '🔒' : '🔓'}
        </button>
      )}

      {showInfo && (
        <div className="swatch-info">
          {name && <span className="swatch-name">{name}{locked && <span className="swatch-lock-tag">locked</span>}</span>}
          <span className="swatch-hex">{hex}</span>
        </div>
      )}
    </div>
  );
}
