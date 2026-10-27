# NewsSummarizer — Store release checklist

## Đã chuẩn bị trong source

- Email/password auth bằng Firebase, session persist trên thiết bị.
- Đăng ký, đăng nhập, quên mật khẩu, đặt lại mật khẩu, đăng xuất.
- Google sign-in trên web (Firebase popup) và native Android/iOS (`@react-native-google-signin/google-signin`).
- Apple sign-in đang tắt; có thể bật lại theo `FIREBASE_AUTH_SETUP.md` nếu cần cho App Store.
- Xóa tài khoản trong app và trang web `public/delete-account.html`.
- RevenueCat cho entitlement `plus`, mua/khôi phục/quản lý thuê bao.
- Gắn RevenueCat App User ID với Firebase UID sau khi đăng nhập.
- Gating mẫu: bản tin 10/15 phút dành cho Plus.
- Privacy Policy, Terms, Support và Account Deletion pages trong `public/`.
- Proxy production phục vụ luôn các trang public/legal trên cùng một HTTPS domain.
- Render Blueprint đã đặt `plan: free` cho giai đoạn TestFlight/ban đầu.
- Bundle ID/package: `com.autoship.newssummarizer`.
- Icon iOS 1024×1024 riêng, không có alpha/transparency (`assets/ios-icon.png`).
- iOS Privacy Manifest đã khai báo các Required Reason API đang dùng bởi React Native/Expo dependencies.
- EAS production build/submit config trong `eas.json`.
- Release validation theo nền tảng: `npm run release:check:ios` / `npm run release:check:android`.
- Docker/Render config cho proxy production.

## Cần thông tin/tài khoản thật trước khi có thể submit

1. Đăng nhập Render và deploy Blueprint `render.yaml`; sau deploy lấy domain HTTPS thật rồi điền `EXPO_PUBLIC_PROXY_URL`, Privacy/Terms/Support/Delete URLs.
2. Firebase Auth đã nối bằng public Web App config; bật Email/Password và Google trong Firebase Console.
3. Tạo Google OAuth clients (Web, Android với SHA-1, iOS) và điền `EXPO_PUBLIC_GOOGLE_*` theo `FIREBASE_AUTH_SETUP.md`. Apple đang tắt; chỉ bật lại nếu có Apple Developer account.
4. (Chỉ khi dùng Supabase dự phòng) thay URL/key còn sống và deploy Edge Function `delete-account`.
5. Tạo app iOS trong RevenueCat, entitlement `plus`, Offering mặc định và package tháng/năm; điền `EXPO_PUBLIC_REVENUECAT_IOS_KEY`.
6. Tạo Auto-Renewable Subscription tương ứng trong App Store Connect rồi liên kết RevenueCat.
7. Điền email hỗ trợ thật vào Render/EAS environment; các trang Privacy/Terms/Support/Delete đã được server phục vụ sẵn.
8. Đăng nhập EAS (`npx eas-cli login`); máy hiện chưa đăng nhập EAS.
9. Apple: cần Apple Developer + App Store Connect app record cho bundle ID `com.autoship.newssummarizer`.
10. Khi làm Google Play sau này: tạo Android RevenueCat key + Play Console app record.

## Biến môi trường production

Sao chép `.env.example` thành `.env` hoặc cấu hình EAS environment secrets/public vars tương ứng. Không đưa Firebase service-account key, Supabase service-role key hay RevenueCat secret key vào app.

## Kiểm tra trước build

```bash
npm run release:check:ios
npm run typecheck
npx expo-doctor
npx expo export --platform web --output-dir dist-web-check
```

## Build store

```bash
npm run build:store:android
npm run build:store:ios
```

## Submit

```bash
npm run submit:store:android
npm run submit:store:ios
```

Lưu ý: build iOS có thể được EAS thực hiện từ Windows, nhưng việc submit vẫn cần Apple Developer/App Store Connect credentials hợp lệ. Thanh toán production chỉ hoạt động sau khi sản phẩm subscription trên cửa hàng và RevenueCat được cấu hình đúng.
