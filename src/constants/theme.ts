import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const Sans = {
  regular: 'BeVietnamPro',
  medium: 'BeVietnamPro-Medium',
  bold: 'BeVietnamPro-Bold',
} as const;

// App hiện chỉ bundle Be Vietnam Pro. Giữ alias Serif để tương thích component cũ,
// còn cảm giác editorial đến từ hierarchy/spacing thay vì phụ thuộc font hệ thống.
export const Serif = Sans.bold;

export interface Palette {
  hot: string;
  hotDark: string;
  hotSoft: string;
  brandSurface: string;
  navy: string;
  amber: string;
  accent: string;
  accentSoft: string;
  bg: string;
  card: string;
  surfaceAlt: string;
  elevated: string;
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
}

// Signal Editorial — calm paper + navy + một accent cam duy nhất.
export const Color: Palette = {
  hot: '#F36A2D',
  hotDark: '#D9541D',
  hotSoft: '#FFF0E8',
  brandSurface: '#F36A2D',
  navy: '#17243A',
  amber: '#A25D12',
  accent: '#F36A2D',
  accentSoft: '#FFF0E8',
  bg: '#F7F6F2',
  card: '#FFFFFF',
  surfaceAlt: '#F1F0EB',
  elevated: '#FBFAF7',
  text: '#101828',
  textSecondary: '#475467',
  textMuted: '#667085',
  border: '#E7E5DF',
  skeleton: '#ECEAE4',
  skeletonAnim: '#E2E0D8',
  success: '#27866B',
  successSoft: '#E9F5F0',
  danger: '#D34A4A',
  dangerSoft: '#FFF0F0',
  scrim: 'rgba(13,20,32,0.62)',
};

export const DarkColor: Palette = {
  ...Color,
  hot: '#F47A42',
  hotDark: '#E2652E',
  hotSoft: '#35261F',
  brandSurface: '#F47A42',
  accent: '#F47A42',
  accentSoft: '#35261F',
  navy: '#0D1420',
  bg: '#0D1420',
  card: '#141E2D',
  surfaceAlt: '#192638',
  elevated: '#192638',
  text: '#F5F7FA',
  textSecondary: '#CBD2DC',
  textMuted: '#9AA4B2',
  border: '#293548',
  skeleton: '#202C3D',
  skeletonAnim: '#29374B',
  success: '#75C9A9',
  successSoft: '#14362C',
  danger: '#FF9C9C',
  dangerSoft: '#41262A',
  scrim: 'rgba(0,0,0,0.72)',
};

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = '@theme_mode';
let themeMode: ThemeMode = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
const themeListeners = new Set<() => void>();

AsyncStorage.getItem(THEME_KEY).then((val) => {
  if (val === 'dark' || val === 'light') setThemeMode(val);
});

export function getThemeMode(): ThemeMode { return themeMode; }
export function setThemeMode(mode: ThemeMode) {
  if (mode === themeMode) return;
  themeMode = mode;
  void AsyncStorage.setItem(THEME_KEY, mode);
  themeListeners.forEach((listener) => listener());
}
export function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => { themeListeners.delete(cb); };
}
export function useTheme(): Palette {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode);
  return mode === 'dark' ? DarkColor : Color;
}

export const Font = {
  display: 34,
  hero: 30,
  title: 22,
  headline: 17,
  body: 15,
  caption: 13,
  tiny: 12,
} as const;

export const Space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const Radius = { sm: 10, md: 16, lg: 18, xl: 22, pill: 999 } as const;
export const Layout = { sidebar: 248, reading: 720, content: 1180, settings: 860 } as const;

// Legacy export vẫn giữ để không phá màn cũ; toàn app chỉ dùng cam làm brand accent.
export const THEME_COLORS = [
  { key: 'sky', label: 'Cam', color: Color.hot },
  { key: 'cyan', label: 'Cam', color: Color.hot },
  { key: 'orange', label: 'Cảnh báo', color: Color.amber },
  { key: 'green', label: 'Thành công', color: Color.success },
  { key: 'berry', label: 'Cam', color: Color.hot },
] as const;

export const Shadow = {
  card: { boxShadow: '0 8px 24px rgba(23,36,58,0.055)', elevation: 1 },
  button: { boxShadow: '0 6px 18px rgba(243,106,45,0.18)', elevation: 2 },
  level4: { boxShadow: '0 18px 48px rgba(13,20,32,0.18)', elevation: 8 },
} as const;
