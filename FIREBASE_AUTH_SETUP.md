# NewsSummarizer — Đăng nhập Firebase + Google native

## Hiện trạng

- **Firebase là provider mặc định** (`EXPO_PUBLIC_AUTH_PROVIDER=firebase`).
- Đã có đầy đủ: đăng ký, đăng nhập email/mật khẩu, xác minh email, gửi lại xác minh,
  quên mật khẩu và đăng xuất trong app. Nút xóa tài khoản trong app đã gỡ; luồng xóa
  tài khoản nằm ở trang web `public/delete-account.html`.
- **Google web:** hoạt động qua popup của Firebase sau khi bật Google provider.
- **Google native:** đã tích hợp `@react-native-google-signin/google-signin` cho
  Android/iOS. Nút Google chỉ hiện trên native khi đã điền OAuth client ID.
- **Apple đang tắt** (`EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=false`). `app.json` không còn
  bật Sign in with Apple capability. Muốn bật lại, xem mục 5.
- **Supabase** vẫn còn trong code để dự phòng. Chỉ dùng khi có project URL/key còn sống:
  đặt `EXPO_PUBLIC_AUTH_PROVIDER=supabase` và điền `EXPO_PUBLIC_SUPABASE_*`.
- Quyền Plus dùng UID Firebase để nhận diện RevenueCat. Nếu đã có thuê bao Plus gắn với
  Supabase UID, phải **giữ nguyên UID** khi import sang Firebase.

> Project Supabase hiện tại trong `.env` (`odmszifdfqucfenbaigi.supabase.co`) không còn
> phân giải DNS, nên nhánh Supabase không đăng nhập được cho tới khi thay URL/key mới.

## 1) Bật provider trong Firebase Console

1. Vào https://console.firebase.google.com/ → chọn project `newssummarizer-8ccc5`.
2. **Authentication → Sign-in method**:
   - **Email/Password**: bật. Không cần bật “Email link”.
   - **Google**: bật, chọn email hỗ trợ, lưu.
   - **Apple**: để tắt (ứng dụng đang không hiện nút Apple).
3. **Authentication → Settings → Authorized domains**: thêm domain web thật (ví dụ
   `app.example.com`) và `localhost` nếu chạy web cục bộ.
4. **Authentication → Templates**: sửa tên người gửi, email xác minh và đặt lại mật khẩu.

## 2) Cấu hình Firebase Web App trong `.env`

Firebase Console → Project settings → Your apps → Web app → SDK setup and configuration.

```dotenv
EXPO_PUBLIC_AUTH_PROVIDER=firebase
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=newssummarizer-8ccc5.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=newssummarizer-8ccc5
EXPO_PUBLIC_FIREBASE_APP_ID=1:...:web:...
```

Đây là **public client config**, không phải service account/private key. Không đưa
`firebase-admin` credentials vào app.

Kiểm tra nhanh:

```powershell
node scripts/check-firebase-config.cjs
```

Script sẽ gọi Firebase Auth API và xác nhận project khớp cấu hình.

## 3) Google native (Android + iOS)

### 3.1 Tạo OAuth client trong Google Cloud Console

Mở https://console.cloud.google.com/apis/credentials?project=newssummarizer-8ccc5
(chọn đúng project Firebase). Tạo các OAuth 2.0 Client ID:

1. **Web application** — thường đã có sẵn tên
   “Web client (auto created by Google Service)”. Dùng client ID này cho
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Android dùng nó để lấy `idToken`.
2. **Android**:
   - Package name: `com.autoship.newssummarizer`
   - SHA-1: thêm cả debug và release (hoặc tạo 2 client Android riêng).
   - Debug SHA-1: chạy `cd android; .\gradlew.bat signingReport` sau khi prebuild.
   - Release SHA-1: lấy trong EAS credentials (`npx eas-cli credentials`) hoặc
     Google Play Console → Setup → App signing.
3. **iOS**:
   - Bundle ID: `com.autoship.newssummarizer`
   - Dùng client ID này cho `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
4. **OAuth consent screen**: điền tên app, email hỗ trợ và scopes `email`, `profile`.
   Khi app chưa publish, thêm tài khoản test vào **Test users**, nếu không Google sẽ chặn
   đăng nhập.

Không cần tải `google-services.json` / `GoogleService-Info.plist` cho cách tích hợp này:
app dùng Firebase JS SDK, còn Google Sign-In native nhận client ID qua env. Config plugin
`plugins/with-google-signin.js` tự thêm reversed iOS client ID vào `Info.plist`.

### 3.2 Điền biến môi trường

```dotenv
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=448365047445-xxxxxxxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=448365047445-yyyyyyyy.apps.googleusercontent.com
# Không bắt buộc — plugin tự suy ra từ iOS client ID.
# EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.448365047445-yyyyyyyy
EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=false
```

`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` là bắt buộc trên Android. Trên iOS cần thêm
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Nếu thiếu, nút Google native tự ẩn và email/mật khẩu
vẫn hoạt động bình thường.

### 3.3 Build lại native app

Google Sign-In là native module, **không chạy trong Expo Go**. Sau khi đổi env/app.json:

```powershell
npx expo prebuild --clean
npx expo run:android
# iOS cần macOS:
npx expo run:ios
```

Hoặc build development build/TestFlight bằng EAS. Kiểm tra config trước khi build:

```powershell
npx expo config --type prebuild
npx expo-doctor
```

### 3.4 Lỗi thường gặp

| Lỗi | Nguyên nhân thường gặp |
| --- | --- |
| `DEVELOPER_ERROR` / code `10` | SHA-1, package name hoặc Android OAuth client không khớp |
| `PLAY_SERVICES_NOT_AVAILABLE` / `12500` | Máy chưa có/cũ Google Play Services |
| `SIGN_IN_CANCELLED` / `12501` | Người dùng đóng hộp thoại; app bỏ qua, không hiện lỗi đỏ |
| `auth/configuration-not-found` | Chưa bật Google provider trong Firebase |
| `auth/social-not-configured` | Thiếu client ID trong `.env` hoặc chưa build lại native |
| `auth/google-missing-id-token` | Sai Web client ID; Android phải dùng Web client ID |

## 4) Google web

Chỉ cần bật Google trong Firebase Console (mục 1) và thêm domain vào Authorized domains.
Popup dùng `authDomain` của Firebase nên app không cần OAuth client ID cho web.

Nếu popup bị chặn, trình duyệt sẽ hiện hướng dẫn cho phép popup; lỗi được ánh xạ sang
tiếng Việt trong màn đăng nhập.

## 5) Bật lại Apple (đang tắt)

Chỉ làm khi có Apple Developer account và thực sự muốn dùng Apple login:

1. Apple Developer → Identifiers → App ID `com.autoship.newssummarizer`: bật
   **Sign in with Apple**. Nếu dùng Apple trên web, tạo **Services ID** và thêm return URL
   `https://newssummarizer-8ccc5.firebaseapp.com/__/auth/handler`.
2. Tạo **Key** có Sign in with Apple, điền Team ID/Key ID/Service ID/private key vào
   provider Apple của Firebase.
3. Thêm lại vào `app.json`:
   - `ios.usesAppleSignIn: true`
   - plugin `expo-apple-authentication`
4. Đặt `EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=true` và build lại native app.
5. Kiểm tra `npm run release:check:ios` — script yêu cầu `usesAppleSignIn` khi cờ này bật.

Lưu ý App Store: nếu app có Google login, Apple có thể yêu cầu bổ sung Sign in with Apple
theo guideline 4.8. Cân nhắc bật Apple trước khi gửi bản iOS.

## 6) Chuyển tài khoản Supabase mà không mất Plus

1. Sao lưu Supabase Auth users trong môi trường được bảo vệ. Không đưa admin password,
   service-role key hay password hash vào source, `.env` có `EXPO_PUBLIC_`, GitHub.
2. Nếu Supabase dùng bcrypt, Firebase Admin SDK hỗ trợ `importUsers` với
   `hash: { algorithm: 'BCRYPT' }`. Dùng `uid` đúng bằng Supabase `auth.users.id`, kèm
   email, emailVerified và displayName.
3. **Dừng đăng ký trên Supabase trong cửa sổ cutover**, backup mới nhất và kiểm tra trùng
   email/UID trước khi import.
4. Test tài khoản Free và Plus trên build Firebase thử nghiệm: đăng nhập, quyền Plus,
   đăng xuất, khôi phục mật khẩu, xác minh email, xóa tài khoản.
5. Chỉ sau đó mới phát hành build có `EXPO_PUBLIC_AUTH_PROVIDER=firebase`. Không xóa
   project Supabase trước khi chắc chắn không còn dữ liệu/code dùng nó.

## 7) Kiểm thử

```powershell
npm run typecheck
node scripts/check-firebase-config.cjs
npx playwright test e2e/auth-store-smoke.spec.ts
npx expo export --platform web --output-dir dist-web-check
```

Kiểm tra thủ công trên thiết bị:

- Đăng ký → nhận email xác minh → mở link → đăng nhập.
- Đăng nhập sai mật khẩu → thấy “Email hoặc mật khẩu không đúng.”
- Gửi lại xác minh khi chưa nhập mật khẩu → nút bị khóa và có hướng dẫn.
- Quên mật khẩu → mở link Firebase → đặt mật khẩu mới → đăng nhập.
- Google web: popup mở, đóng popup không hiện lỗi đỏ.
- Google Android: chọn tài khoản, quay lại app, thấy đúng email; thử cả debug và release.
- Google iOS: hộp thoại hệ thống, hủy giữa chừng không hiện lỗi.
- Đăng xuất → đăng nhập lại → cùng UID; kill/restart app vẫn giữ session.
- Tài khoản email chưa xác minh **không** được coi là đã đăng nhập.
- Xóa tài khoản có thể yêu cầu đăng nhập lại gần đây (`auth/requires-recent-login`).

## Lưu ý an toàn

- Không tự đổi Supabase UID sang Firebase UID ngẫu nhiên: sẽ mất liên kết RevenueCat Plus.
- Firebase/Google có quota, giới hạn email và chống lạm dụng.
- Firebase password reset và xác minh email dùng trang do Firebase host; muốn deep-link
  về app phải cấu hình thêm email action handler/deep links.
- `public/delete-account.html` hiện là luồng Supabase; cập nhật trước khi phát hành nếu
  chuyển hẳn sang Firebase.
- Không đưa service-role key, Apple private key hay RevenueCat secret key vào app.

Tài liệu chính thức:

- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/web/google-signin
- https://react-native-google-signin.github.io/docs/setting-up/expo
- https://developers.google.com/identity/sign-in/android/start
- https://firebase.google.com/docs/auth/admin/import-users
