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
npx expo prebuild -p android --clean
cd android
.\gradlew.bat assembleRelease
```

`--clean` xóa folder android cũ, sinh lại từ app.json. Build lại từ đầu (5-15 phút).

### Cài vào máy Android

```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` = ghi đè bản cũ. Máy cần bật USB Debugging.

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

## Ghi chú

- App dùng các module chuẩn SDK (expo-video, expo-notifications, async-storage...) nên **chạy được trong Expo Go**. Chỉ cần prebuild/build APK khi muốn bản standalone (icon/splash/thông báo riêng của app, không phụ thuộc Expo Go).
- Package name: `com.autoship.NewsSummarizer` (set trong app.json).
- APK release được ký bằng debug keystore (build.gradle mặc định), nên cài trực tiếp được. Lên Play Store cần AAB + signing key (EAS tự lo).
- Đổi icon/splash: sửa assets + app.json rồi `prebuild --clean`. Icon màu thông báo Android (`app.json` plugin `expo-notifications`) cũng là build-time — đổi xong phải prebuild lại mới áp dụng.
