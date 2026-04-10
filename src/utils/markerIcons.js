// SVG icon definitions for map pin markers.
// Each icon is a function: (pinColor) => SVG inner elements string
// Icons are designed for a 28×38 viewBox, placed inside the circle portion (~y 3–21, center ~14,12)

const ICONS = {
  // Simple filled dot — used when no other icon matches
  pin: () => `
    <circle cx="14" cy="14" r="5" fill="white" opacity="0.85"/>
  `,

  // Multi-story apartment/office building — custom icon
  building: () => `
    <image href="/icons/building.svg" x="5" y="5" width="18" height="18"/>
  `,

  // Construction — custom hammer icon
  construction: () => `
    <image href="/icons/hammer.svg" x="5" y="5" width="18" height="18"/>
  `,

  // Proposed — custom notebook-pen icon
  proposed: () => `
    <image href="/icons/notebook-pen.svg" x="5" y="5" width="18" height="18"/>
  `,

  // Dollar — custom circle-dollar-sign icon (used for Sites)
  dollar: () => `
    <image href="/icons/circle-dollar-sign.svg" x="5" y="5" width="18" height="18"/>
  `,

  // Mountain/terrain silhouette — represents land
  land: () => `
    <path d="M5 20 L9.5 11 L14 16 L18.5 8 L23 20 Z" fill="white"/>
  `,

  // Simple house shape
  home: () => `
    <polygon points="14,4 22,11.5 6,11.5" fill="white"/>
    <rect x="8" y="11" width="12" height="9" fill="white"/>
    <rect x="12" y="14" width="4" height="6" fill="rgba(0,0,0,0.2)"/>
  `,

  // Checkmark — "Yes" / approved
  check: () => `
    <path d="M6 12.5 L11 18 L22 6" stroke="white" stroke-width="3"
          fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // X mark — "No" / not approved
  cross: () => `
    <line x1="7.5"  y1="7.5"  x2="20.5" y2="18.5" stroke="white" stroke-width="3" stroke-linecap="round"/>
    <line x1="20.5" y1="7.5"  x2="7.5"  y2="18.5" stroke="white" stroke-width="3" stroke-linecap="round"/>
  `,
};

/**
 * Returns the SVG string for a circular marker with an icon inside.
 * @param {string} color    - Fill color for the circle (hex or CSS color)
 * @param {string} iconName - Key from ICONS (falls back to 'pin')
 * @param {number} opacity  - Overall marker opacity (0–1)
 * @param {number} scale    - Scale factor relative to base 28×28 size (default 1)
 */
export function createPinSvg(color, iconName = 'pin', opacity = 1, scale = 1) {
  const iconFn = ICONS[iconName] || ICONS.pin;
  const size = Math.round(28 * scale);
  return `<svg width="${size}" height="${size}" viewBox="0 0 28 28"
               xmlns="http://www.w3.org/2000/svg"
               style="display:block;opacity:${opacity};">
    <circle cx="14" cy="14" r="12" fill="${color}" stroke="black" stroke-width="2"/>
    ${iconFn(color)}
  </svg>`;
}

/**
 * Resolves the icon name for a feature based on the layer's iconColumn / iconMap / defaultIcon config.
 * @param {object} feature - The map feature ({ data: {...} })
 * @param {object} layer   - The layer object ({ style: { iconColumn, iconMap, defaultIcon } })
 * @returns {string} icon name
 */
export function getFeatureIconName(feature, layer) {
  const { iconColumn, iconMap, defaultIcon } = layer.style || {};
  if (iconColumn && iconMap) {
    const value = feature.data[iconColumn];
    if (value && iconMap[value]) return iconMap[value];
  }
  return defaultIcon || 'pin';
}
