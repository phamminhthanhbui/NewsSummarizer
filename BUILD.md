# Hướng dẫn Build (Developer)

## Yêu cầu

- Node.js 20+
- Android: JDK 17, Android SDK (Gradle tự cài phần thiếu khi build lần đầu)
- iOS: macOS + Xcode (chỉ build được trên Mac)

## Android

### Build lần đầu

```powershell
npx expo prebuild -p android
cd android
.\gradlew.bat assembleRelease
```

APK ra tại: `android/app/build/outputs/apk/release/app-release.apk`

### Build lại sau khi sửa code

Chỉ sửa JS/TS (src, App.tsx...):

```powershell
cd android
.\gradlew.bat assembleRelease
```

Incremental, mất 1-3 phút. Không cần chạy lại `prebuild`.

Sửa app.json, thêm/xóa native plugin, đổi package name:

```powershell
npx expo prebuild -p android
cd android
.\gradlew.bat assembleRelease
```

Prebuild không `--clean` áp dụng config plugin (vd `plugins/with-cleartext.js`) vào manifest. Chỉ khi đổi package name hay native plugin lớn mới cần:

```powershell
npx expo prebuild -p android --clean   # xóa android/, sinh lại từ đầu (5-15 phút)
```

Lưu ý: `--clean` chỉ chạy được khi KHÔNG có tiến trình nào đang mở file trong `android/` (đóng editor/terminal đang cd vào đó).

### Plugin bắt buộc: with-cleartext

`plugins/with-cleartext.js` thêm `android:usesCleartextTraffic="true"` vào manifest. Thiếu flag này, bản release APK bị Android **chặn mọi request http://** → app chết mạng im lặng (không bài báo, không tóm tắt, không giọng đọc). App gọi proxy qua `http://<IP-LAN>:3001` nên bắt buộc phải có. SDK 57 không còn đọc key `android.usesCleartextTraffic` trong app.json.

### Cài vào máy Android

Cắm cáp USB, bật **USB Debugging** (Tuỳ chọn nhà phát triển), rồi:

```powershell
# Cách 1: double-click install-apk.bat ở thư mục gốc dự án
#         (kiểm tra thiết bị, cài, có hướng dẫn khi lỗi)

# Cách 2: lệnh tay
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` = cài đè giữ dữ liệu cũ. Kiểm tra thiết bị đã nối: `adb devices`.

Lỗi thường gặp:

| Lỗi | Xử lý |
|---|---|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Bản cũ ký key khác: `adb uninstall com.autoship.NewsSummarizer` rồi cài lại |
| Không thấy thiết bị | Chọn "Cho phép" trên điện thoại khi được hỏi; thử đổi cáp |

### Quan trọng: địa chỉ proxy bake lúc build

APK standalone **không tự biết** IP máy chạy proxy (`server/proxy.js`) — RSS, tóm tắt AI,
giọng đọc, video HLS đều đi qua proxy này. Địa chỉ lấy từ `.env` lúc bundle:

```
EXPO_PUBLIC_PROXY_URL=http://192.168.1.19:3001
```

- Đổi IP máy PC → sửa `.env` rồi build lại.
- Bẫy Gradle: sửa `.env` mà build lại vẫn ra bundle cũ (task bundle bị coi là up-to-date).
  Ép bundle lại bằng cách xóa file bundle rồi build:
  `android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle`
- Khi cài APK lên máy: PC phải đang chạy proxy (`npm run start`) và cùng mạng Wi-Fi/LAN với điện thoại.

### Debug trên máy thật (dev)

```powershell
npx expo run:android
```

Chạy Metro + cài bản debug, hot reload khi sửa code. Không cần build lại APK khi dev.

## iOS (chỉ macOS)

### Build lần đầu

```bash
npx expo prebuild -p ios
cd ios
pod install
xcodebuild -workspace NewsSummarizer.xcworkspace -scheme NewsSummarizer -configuration Release
```

Hoặc mở `ios/NewsSummarizer.xcworkspace` bằng Xcode, chọn scheme Release, Product > Archive.

### Build lại sau khi sửa code

Chỉ sửa JS: chạy lại lệnh `xcodebuild` trên (incremental).

Sửa app.json/native plugin:

```bash
npx expo prebuild -p ios --clean
cd ios && pod install
```

### Debug

```bash
npx expo run:ios
```

## EAS Build (cloud, không cần cài SDK)

```bash
npm install -g eas-cli
eas login
eas build:configure
```

`eas.json`:

```json
{
  "build": {
    "preview": { "android": { "buildType": "apk" } },
    "production": {}
  }
}
```

```bash
eas build -p android --profile preview   # ra APK
eas build -p android                     # ra AAB signed (lên Play Store)
eas build -p ios                         # cần Apple Developer account
```

EAS trả link tải khi xong. Free tier giới hạn build/tháng.

Biến thể build local qua EAS (không tốn quota cloud):

```powershell
npx eas build -p android --profile preview --local
```

Tự prebuild rồi gọi Gradle trên chính máy này — cần cài `eas-cli`. Trên máy đã có JDK 17 + Android SDK thì dùng `gradlew assembleRelease` trực tiếp cho lẹ (xem mục Android phía trên).

## Ghi chú

- App dùng các module chuẩn SDK (expo-video, expo-notifications, async-storage...) nên **chạy được trong Expo Go**. Chỉ cần prebuild/build APK khi muốn bản standalone (icon/splash/thông báo riêng của app, không phụ thuộc Expo Go).
- Package name: `com.autoship.NewsSummarizer` (set trong app.json).
- APK release được ký bằng debug keystore (build.gradle mặc định), nên cài trực tiếp được. Lên Play Store cần AAB + signing key (EAS tự lo).
- Đổi icon/splash: sửa assets + app.json rồi `prebuild --clean`. Icon màu thông báo Android (`app.json` plugin `expo-notifications`) cũng là build-time — đổi xong phải prebuild lại mới áp dụng.
