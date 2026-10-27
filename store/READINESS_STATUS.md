# App Store readiness — 14/10/2026

## PASS
- Firebase Email/Password Auth hoạt động; app đã nối public Web App config hiện có trên máy.
- Login/Register mobile smoke test: pass ở viewport 360×780.
- `npx expo install --check`: dependencies up to date.
- `npx expo-doctor`: 18/18 checks passed.
- Web production export: pass (`dist-web-check`).
- Proxy network test: pass.
- Render Docker service đọc `$PORT`, có `/health` và Blueprint `plan: free`.
- Privacy, Terms, Support, Delete Account pages đều được proxy phục vụ HTTP 200 khi test local.
- iOS icon riêng 1024×1024, RGB/opaque, không alpha.
- iOS Privacy Manifest đã khai báo required-reason APIs từ dependencies hiện tại.
- EAS production profile dùng environment `production` và auto-increment build number.

## BLOCKED BY EXTERNAL ACCOUNT / REAL VALUES
- Render chưa deploy: chưa có public HTTPS domain thật.
- Firebase project `newssummarizer-8ccc5` đã dùng cho auth; cần bật Google provider trong Firebase Console.
- Google native đã tích hợp sẵn; cần OAuth client IDs (Web/Android/iOS), SHA-1 và build native theo `FIREBASE_AUTH_SETUP.md`.
- Apple sign-in đang tắt; muốn bật cần Apple Developer + Firebase Apple provider.
- RevenueCat iOS public SDK key chưa có.
- App Store Connect subscription chưa tạo/liên kết RevenueCat.
- Support email production chưa được cung cấp.
- EAS CLI hiện chưa đăng nhập.
- Apple Developer/App Store Connect credentials chưa có trong phiên làm việc.

## Current iOS release check
`npm run release:check:ios` cố ý FAIL cho tới khi các giá trị production ở trên được điền. Không build App Store với `EXPO_PUBLIC_PROXY_URL=http://localhost:3001`.

## Git warning
Git remote hiện tại trỏ tới `https://github.com/bpmthanh/filescanner.git`, không phải repository NewsSummarizer. Không push source App Store vào remote này cho tới khi tạo/đổi đúng repository.
