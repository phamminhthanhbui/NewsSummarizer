# NewsSummarizer: Free / Plus — phát hành thu phí

## Đã triển khai trong app
- Khách xem tin miễn phí; Firebase đăng ký/đăng nhập, xác minh email và lưu session.
- Free: đọc/lưu/khám phá tin, nguồn tùy chỉnh, bản nghe ngắn tối đa 3 tin.
- Plus: kế thừa Free, chọn bản nghe dài tối đa 5 hoặc 8 tin tương ứng tùy chọn 10/15 phút (thời gian thực tế tùy giọng, tốc độ và chiều dài tin).
- Chỉ mở Plus khi **đã đăng nhập** và RevenueCat trả entitlement `plus` active cho đúng Firebase UID. Không có switch local hay giả giao dịch.
- Đăng xuất/đổi tài khoản và quay lại app -> cập nhật quyền; khi chưa xác minh được thì không mở tính năng Plus.
- Paywall: hiển thị gói + giá và chu kỳ thực từ store, nút mua, khôi phục, điều khoản và quyền riêng tư; web / Expo Go không có native checkout.

## Bạn cần thực hiện trước khi thu tiền thật
1. Apple Developer (iOS) hoặc Google Play Console (Android). Tạo app với bundle/package `com.autoship.newssummarizer`.
2. Trong App Store Connect và Google Play Console tạo 2 auto-renewable subscriptions:
   - `com.autoship.newssummarizer.plus.monthly`
   - `com.autoship.newssummarizer.plus.yearly`
   Tự đặt tên, giá, mô tả và chu kỳ. Hoàn tất thỏa thuận thu phí, thuế, ngân hàng.
3. Trong RevenueCat tạo project NewsSummarizer; thêm app iOS/Android, liên kết store credentials, import subscription, tạo entitlement đúng ID `plus`, gắn cả hai sản phẩm và đưa vào Offering mặc định.
4. Lấy **public SDK keys** từ RevenueCat (không lấy secret/admin key). Trong môi trường build EAS production đặt:
   ```
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
   EXPO_PUBLIC_REVENUECAT_ENTITLEMENT=plus
   EXPO_PUBLIC_AUTH_PROVIDER=firebase
   EXPO_PUBLIC_FIREBASE_API_KEY=...
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=PROJECT.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=PROJECT_ID
   EXPO_PUBLIC_FIREBASE_APP_ID=1:...:web:...
   EXPO_PUBLIC_PRIVACY_URL=https://YOUR_DOMAIN/privacy.html
   EXPO_PUBLIC_TERMS_URL=https://YOUR_DOMAIN/terms.html
   ```
   Các URL privacy/terms **phải hoạt động công khai**; nếu thiếu app cố ý khóa nút mua.
5. Build iOS/Android **development build hoặc TestFlight/Internal Testing** bằng EAS, KHÔNG dùng Expo Go/web để test thanh toán.
6. Test với tài khoản cửa hàng sandbox/tester: tạo tài khoản Free -> mua tháng/năm -> mở bản dài -> kill/restart app -> vẫn Plus -> Restore Purchases -> đổi tài khoản/đăng xuất -> không lộ Plus của tài khoản trước -> hủy/gia hạn -> trạng thái đồng bộ sau khi quay lại app.
7. Bật Email/Password và Google trong Firebase Console; cấu hình Google OAuth client ID + SHA-1 theo `FIREBASE_AUTH_SETUP.md`. Apple đang tắt.

## Kiểm tra local
```powershell
npm run typecheck
npx playwright test e2e/auth-store-smoke.spec.ts e2e/membership.spec.ts
```
**Lưu ý:** quyền Plus được xác nhận bởi RevenueCat trên thiết bị và tính năng Plus của app hiện là bản tin dài hơn. Dữ liệu bookmark, lịch sử đọc hiện chưa đồng bộ giữa các thiết bị. Không được tuyên bố thanh toán đã hoạt động cho đến khi có store products, RevenueCat keys và test sandbox thành công.
