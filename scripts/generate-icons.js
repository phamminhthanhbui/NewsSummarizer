// Logo AI: nền gradient cam→đỏ + sparkle 4 cánh (nhận dạng AI).
// Render SVG qua Chromium (Playwright). Chạy: node scripts/generate-icons.js
const { chromium } = require('@playwright/test');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets');

const spark = (cx, cy, r, fill, o = 1) => {
  const k = 0.22;
  return `<path d="M ${cx} ${cy - r} Q ${cx + r * k} ${cy - r * k} ${cx + r} ${cy} Q ${cx + r * k} ${cy + r * k} ${cx} ${cy + r} Q ${cx - r * k} ${cy + r * k} ${cx - r} ${cy} Q ${cx - r * k} ${cy - r * k} ${cx} ${cy - r} Z" fill="${fill}" opacity="${o}"/>`;
};

// Tia lớn giữa + tia nhỏ góc phải-trên, tự scale theo size
const mark = (size, fill) => {
  const s = size / 1024;
  return spark(512 * s, 540 * s, 300 * s, fill) + spark(800 * s, 250 * s, 95 * s, fill, 0.9);
};

const svg = (size, bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FB512A"/><stop offset="1" stop-color="#A70E1A"/>
  </linearGradient></defs>
  ${bg ? `<rect width="${size}" height="${size}" fill="url(#g)"/>` : ''}${body}
</svg>`;

// Android adaptive: thu 72% vào safe zone
const safe = (fill) => `<g transform="translate(512 512) scale(0.72) translate(-512 -512)">${mark(1024, fill)}</g>`;

const ICONS = [
  { file: 'icon.png', size: 1024, bg: true, body: mark(1024, '#FFF') },
  { file: 'favicon.png', size: 48, bg: true, body: mark(48, '#FFF') },
  { file: 'splash-icon.png', size: 512, bg: false, body: mark(512, 'url(#g)') },
  { file: 'android-icon-background.png', size: 1024, bg: true, body: '' },
  { file: 'android-icon-foreground.png', size: 1024, bg: false, body: safe('#FFF') },
  { file: 'android-icon-monochrome.png', size: 1024, bg: false, body: safe('#FFF') },
];

(async () => {
  const page = await (await chromium.launch()).newPage();
  for (const { file, size, bg, body } of ICONS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size, bg, body)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: !bg });
    console.log(`OK assets/${file}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
