function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    default: h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

export function nameColor(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/i.test(hex)) return 'Color';
  try {
    const [h, s, l] = hexToHsl(hex);
    if (s < 0.08) {
      if (l < 0.20) return 'Black';
      if (l < 0.45) return 'Dark Gray';
      if (l < 0.65) return 'Gray';
      if (l < 0.85) return 'Light Gray';
      return 'White';
    }
    const hue = ((h % 360) + 360) % 360;
    const bands = [
      [15, 'Red'], [30, 'Orange-Red'], [45, 'Orange'], [60, 'Amber'],
      [75, 'Yellow'], [90, 'Yellow-Green'], [120, 'Lime'], [150, 'Green'],
      [165, 'Teal-Green'], [180, 'Teal'], [195, 'Cyan'], [210, 'Sky Blue'],
      [225, 'Light Blue'], [240, 'Blue'], [255, 'Indigo'], [270, 'Blue-Violet'],
      [285, 'Violet'], [300, 'Purple'], [315, 'Magenta'], [330, 'Hot Pink'],
      [345, 'Rose'], [361, 'Red'],
    ];
    const base = (bands.find(([limit]) => hue < limit) ?? [361, 'Red'])[1];
    if (l < 0.25) return `Dark ${base}`;
    if (l > 0.75) return `Light ${base}`;
    return base;
  } catch {
    return 'Color';
  }
}

export function getHue(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/i.test(hex)) return 0;
  try {
    const [h] = hexToHsl(hex);
    return isNaN(h) ? 0 : h;
  } catch { return 0; }
}
