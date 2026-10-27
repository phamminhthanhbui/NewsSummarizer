# App Store Connect — NewsSummarizer

## Thông tin app
- Tên: NewsSummarizer
- Bundle ID: `com.autoship.newssummarizer`
- Phiên bản đầu: `1.0.0`
- Category: News
- Subtitle: `Đọc ít hơn. Hiểu nhiều hơn.`
- Keywords: `news,tin tức,tóm tắt,bản tin,đọc báo,nghe tin,RSS,Việt Nam`

## URL cần điền sau khi deploy Render
- Support URL: `https://<render-domain>/support.html`
- Privacy Policy URL: `https://<render-domain>/privacy.html`
- Terms URL: `https://<render-domain>/terms.html`
- Account deletion: `https://<render-domain>/delete-account.html`

## App Review notes
Ứng dụng có thể dùng ở chế độ khách. Tài khoản email/password dùng Firebase để giữ quyền lợi Plus giữa các thiết bị. Nếu reviewer cần kiểm tra tài khoản, tạo một tài khoản test riêng trong Firebase và điền credential chỉ trong App Store Connect. Không đưa credential test vào source code.

Vị trí là tùy chọn và chỉ dùng để hiển thị thời tiết/khu vực. Thông báo là tùy chọn và dùng cho bản tin theo giờ người dùng chọn. Ứng dụng không dùng quảng cáo hoặc tracking trong phiên bản hiện tại.

## App Privacy — dữ liệu cần rà soát khi khai báo
- Contact Info: email; tên hiển thị nếu người dùng cung cấp.
- Identifiers: Firebase UID / RevenueCat App User ID.
- Purchases: trạng thái thuê bao Plus được Apple/RevenueCat xử lý.
- Location: chỉ khi người dùng cấp quyền để lấy thời tiết/khu vực.
- User Content / Usage Data: bài lưu, lịch sử đọc và lựa chọn chủ đề hiện chủ yếu lưu cục bộ; xác minh lại trước khi khai báo nếu logic thay đổi.
- Tracking: No, nếu không thêm quảng cáo/analytics theo dõi trước khi submit.

## Plus / Auto-Renewable Subscription
- Subscription Group: `NewsSummarizer Plus`
- Entitlement RevenueCat: `plus`
- Tạo ít nhất 1 sản phẩm tháng hoặc năm trong App Store Connect.
- Liên kết sản phẩm vào RevenueCat Offering mặc định.
- Purchase screen phải tiếp tục hiển thị giá từ StoreKit/RevenueCat, nút Restore Purchases, Privacy Policy và Terms.

## Trước Submit
1. `npm run release:check:ios`
2. `npx expo-doctor`
3. Test đăng ký → xác nhận email → đăng nhập → đăng xuất → reset password.
4. Test xóa tài khoản thật.
5. Test mua/restore Plus trên sandbox/TestFlight.
6. `npm run build:store:ios`
7. `npm run submit:store:ios`
8. Test TestFlight rồi mới Submit for Review.
