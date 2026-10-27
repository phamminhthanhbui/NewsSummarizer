# NewsSummarizer

Ứng dụng đọc và tóm tắt tin tức: đọc tới bằng TTS, đăng nhập Email/Password + Google (Firebase Auth), gói thành viên (RevenueCat) và bản web deploy trên Firebase Hosting.

## Stack

- Expo / React Native (iOS, Android, Web) + React Navigation
- Firebase Auth (Email/Password, Google), Supabase, RevenueCat
- Express proxy (`server/proxy.js`) cho summarize và Edge TTS
- Firebase Hosting cho bản web (`dist-web`)

## Scripts

| Lệnh | Mô tả |
| --- | --- |
| `npm start` | Chạy dev server (Expo + proxy) |
| `npm run web` | Expo web dev server |
| `npm run proxy` | Chạy API proxy |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run test:e2e` | Playwright e2e tests |
| `npm run export:web:release` | Build web production vào `dist-web` |
| `npm run release:check` | Kiểm tra cấu hình release |

## Deploy web

```bash
npm run export:web:release
npx firebase deploy --only hosting --project newssummarizer-8ccc5
```

Hosting URL: https://newssummarizer-8ccc5.web.app
