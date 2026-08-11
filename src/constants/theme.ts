// Design tokens — palette + type scale + radius
export const Color = {
  primary: '#C62828',        // brand red
  primaryDark: '#A8181F',
  primarySoft: '#FCE9E9',    // pill/tint nền của primary
  accent: '#2563EB',         // link blue
  accentSoft: '#E9F0FE',
  bg: '#F3F4F8',             // page background
  card: '#FFFFFF',           // surface
  surfaceAlt: '#F7F8FC',     // secondary surface (rows)
  text: '#171A23',           // headlines
  textSecondary: '#5B6270',  // descriptions
  textMuted: '#9AA0AE',      // timestamps
  border: '#E8EAF0',         // dividers
  skeleton: '#ECEFF4',       // placeholder bg
  skeletonAnim: '#DFE3EA',   // placeholder pulse
  success: '#2E7D32',
  successSoft: '#E7F4E8',
  danger: '#C62828',
  dangerSoft: '#FCE9E9',
  scrim: 'rgba(10,15,25,0.55)',
  white: '#FFFFFF',
} as const;

export const Font = {
  hero: 22,
  title: 18,
  headline: 16,
  body: 14,
  caption: 13,
  tiny: 12,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
} as const;

export const Shadow = {
  card: {
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  button: {
    boxShadow: '0 4px 12px rgba(198, 40, 40, 0.15)',
    shadowColor: '#C62828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  level4: {
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.1)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;