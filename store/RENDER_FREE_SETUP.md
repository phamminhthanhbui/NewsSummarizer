# Render Free — NewsSummarizer

`render.yaml` đã cấu hình một Docker Web Service tên `newssummarizer-api` với plan `free`.

## Deploy
1. Đẩy source NewsSummarizer lên một Git repository riêng.
2. Trong Render Dashboard chọn **New → Blueprint** và kết nối repository đó.
3. Render đọc `render.yaml`; chọn service `newssummarizer-api`.
4. Điền 3 environment variables được đánh dấu `sync: false`:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_SUPPORT_EMAIL`
5. Deploy và chờ `/health` trả HTTP 200.

## Sau khi có domain
Giả sử domain là `https://YOUR-SERVICE.onrender.com`, đặt cho EAS production:

```env
EXPO_PUBLIC_PROXY_URL=https://YOUR-SERVICE.onrender.com
EXPO_PUBLIC_PRIVACY_URL=https://YOUR-SERVICE.onrender.com/privacy.html
EXPO_PUBLIC_TERMS_URL=https://YOUR-SERVICE.onrender.com/terms.html
EXPO_PUBLIC_SUPPORT_URL=https://YOUR-SERVICE.onrender.com/support.html
EXPO_PUBLIC_DELETE_ACCOUNT_URL=https://YOUR-SERVICE.onrender.com/delete-account.html
```

Kiểm tra các URL:
- `/health`
- `/privacy.html`
- `/terms.html`
- `/support.html`
- `/delete-account.html`

Render Free có thể spin down khi không có traffic, nên phù hợp TestFlight/hobby hơn production có yêu cầu phản hồi tức thì. Có thể nâng plan sau mà không đổi code.
