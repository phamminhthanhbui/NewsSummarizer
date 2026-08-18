// Design tokens — palette + type scale + radius
// primary/danger lấy đúng từ 7 màu chủ đạo (THEME_COLORS): cam Kenh14 + đỏ thời sự
export const Color = {
  primary: '#FB512A',        // = THEME_COLORS 'Cam Kenh14'
  primaryDark: '#A70E1A',
  primarySoft: '#FFEEE8',    // pill/tint nền của primary
  // Palette kiểu Kenh14 — cam đỏ trẻ trung, dùng cho HomeScreen
  hot: '#FB512A',            // cam đỏ đặc trưng
  hotDark: '#A70E1A',        // đỏ đậm cuối gradient
  hotSoft: '#FFEEE8',        // tint nền của hot
  amber: '#F0A52B',          // cam vàng nhấn
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
  success: '#059669',        // = THEME_COLORS 'Xanh lá'
  successSoft: '#D1FAE5',
  danger: '#DC2626',         // = THEME_COLORS 'Đỏ thời sự'
  dangerSoft: '#FEE2E2',
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

// 7 màu chủ đạo của app — dải màu trang trí dưới header + màu active của tab bar
export const THEME_COLORS = [
  { key: 'hot', label: 'Cam Kenh14', color: '#FB512A' },
  { key: 'red', label: 'Đỏ thời sự', color: '#DC2626' },
  { key: 'blue', label: 'Xanh biển', color: '#2563EB' },
  { key: 'violet', label: 'Tím', color: '#7C3AED' },
  { key: 'green', label: 'Xanh lá', color: '#059669' },
  { key: 'pink', label: 'Hồng', color: '#DB2777' },
  { key: 'gold', label: 'Vàng đồng', color: '#D97706' },
] as const;

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
    boxShadow: '0 4px 12px rgba(251, 81, 42, 0.15)',
    shadowColor: '#FB512A',
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