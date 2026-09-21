// Design tokens — palette + type scale + radius
// primary/danger lấy đúng từ 7 màu chủ đạo (THEME_COLORS): cam Kenh14 + đỏ thời sự
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Palette interface — Color/DarkColor cùng shape, đổi giá trị thoải mái không vướng literal type
export interface Palette {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  hot: string;
  hotDark: string;
  hotSoft: string;
  amber: string;
  accent: string;
  accentSoft: string;
  bg: string;
  card: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  skeleton: string;
  skeletonAnim: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
  white: string;
}

export const Color: Palette = {
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
};

// Dark mode — chỉ override màu nền/chữ; màu brand (hot/primary/success...) giữ nguyên
export const DarkColor: Palette = {
  ...Color,
  primarySoft: '#3A1D14',
  hotSoft: '#3A1D14',
  accentSoft: '#16233D',
  bg: '#0F1115',
  card: '#1A1D24',
  surfaceAlt: '#22262F',
  text: '#F2F4F8',
  textSecondary: '#A8AFBC',
  textMuted: '#6B7280',
  border: '#2C313C',
  skeleton: '#232730',
  skeletonAnim: '#2E333E',
  successSoft: '#0D2E22',
  dangerSoft: '#3A1518',
  scrim: 'rgba(0,0,0,0.7)',
};

// ---- Dark mode store (AsyncStorage + useSyncExternalStore) ----
export type ThemeMode = 'light' | 'dark';
const THEME_KEY = '@theme_mode';

let themeMode: ThemeMode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
const themeListeners = new Set<() => void>();

// Giá trị đầu lấy từ system (đồng bộ) → đa số trường hợp frame đầu đã đúng
// màu. AsyncStorage chỉ ghi đè khi user chọn mode KHÁC system trong Settings.
AsyncStorage.getItem(THEME_KEY).then((val) => {
  if (val === 'dark' || val === 'light') setThemeMode(val);
});

export function getThemeMode(): ThemeMode {
  return themeMode;
}

export function setThemeMode(mode: ThemeMode) {
  if (mode === themeMode) return;
  themeMode = mode;
  AsyncStorage.setItem(THEME_KEY, mode);
  themeListeners.forEach((l) => l());
}

export function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => { themeListeners.delete(cb); };
}

// Hook: trả về palette theo mode hiện tại, mọi screen dùng hook này tự rerender khi đổi mode
export function useTheme(): typeof Color {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode);
  return mode === 'dark' ? DarkColor : Color;
}

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
    elevation: 2,
  },
  button: {
    boxShadow: '0 4px 12px rgba(251, 81, 42, 0.15)',
    elevation: 3,
  },
  level4: {
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.1)',
    elevation: 8,
  },
} as const;