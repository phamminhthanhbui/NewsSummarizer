# App Store readiness — 14/10/2026

## PASS
- Supabase Email Auth endpoint hoạt động và app đã nối public URL/publishable key hiện có trên máy.
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
- Supabase hiện dùng project đã có trên máy; trước production nên xác nhận dùng chung project này hay tạo project Free riêng cho NewsSummarizer.
- Supabase Edge Function `delete-account` chưa deploy: máy chưa có `SUPABASE_ACCESS_TOKEN`/CLI login.
- RevenueCat iOS public SDK key chưa có.
- App Store Connect subscription chưa tạo/liên kết RevenueCat.
- Support email production chưa được cung cấp.
- EAS CLI hiện chưa đăng nhập.
- Apple Developer/App Store Connect credentials chưa có trong phiên làm việc.

## Current iOS release check
`npm run release:check:ios` cố ý FAIL cho tới khi các giá trị production ở trên được điền. Không build App Store với `EXPO_PUBLIC_PROXY_URL=http://localhost:3001`.

## Git warning
Git remote hiện tại trỏ tới `https://github.com/bpmthanh/filescanner.git`, không phải repository NewsSummarizer. Không push source App Store vào remote này cho tới khi tạo/đổi đúng repository.
