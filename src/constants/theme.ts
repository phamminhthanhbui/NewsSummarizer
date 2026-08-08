export const Color = {
  primary: '#B71C1C',       // brand red (VnExpress)
  accent: '#1565C0',        // link blue
  bg: '#F2F2F2',            // page bg
  card: '#FFFFFF',          // surface
  text: '#222222',          // headlines
  textSecondary: '#555555', // descriptions
  textMuted: '#999999',     // timestamps
  border: '#E0E0E0',       // dividers
  skeleton: '#E9ECEF',      // placeholder bg
  skeletonAnim: '#DEE2E6',  // placeholder pulse
  error: '#FFF3E0',         // error bg
  errorText: '#E65100',
  success: '#2E7D32',
} as const;

export const Font = {
  hero: 20,
  headline: 16,
  body: 14,
  caption: 13,
  tiny: 12,
} as const;