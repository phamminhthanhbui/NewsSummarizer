import { MIN_PASSWORD_LENGTH } from './authValidation';

// Shared Vietnamese wording for errors surfaced by Firebase and Supabase.
// Screens pass a contextual fallback for unknown failures.
export function authErrorMessage(error: unknown, fallback: string) {
  const raw = error instanceof Error
    ? error.message
    : typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : '';
  const value = raw.toLowerCase();
  // Network failures should win over provider-specific wording because both
  // Firebase and Supabase surface them as generic fetch errors.
  if (value.includes('network request failed') || value.includes('failed to fetch') || value.includes('network error') || value.includes('network-request-failed')) return 'Không có kết nối Internet. Hãy kiểm tra mạng rồi thử lại.';
  if (value.includes('auth/invalid-credential') || value.includes('auth/invalid-login-credentials') || value.includes('auth/wrong-password') || value.includes('auth/user-not-found') || value.includes('invalid login credentials') || value.includes('invalid credentials')) return 'Email hoặc mật khẩu không đúng.';
  if (value.includes('auth/email-not-verified')) return 'Bạn chưa xác minh email. Hãy mở email kích hoạt, hoặc bấm Gửi lại email xác minh bên dưới.';
  if (value.includes('auth/email-already-verified')) return 'Email này đã được xác minh. Bạn có thể đăng nhập bằng mật khẩu hiện tại.';
  if (value.includes('email address not authorized') || value.includes('email not authorized')) return 'Supabase chưa được cấu hình SMTP để gửi email cho địa chỉ này. Hãy cấu hình SMTP trong Supabase → Authentication → Emails.';
  if (value.includes('email rate limit exceeded') || value.includes('over_email_send_rate_limit')) return 'Đã vượt giới hạn gửi email xác minh. Vui lòng đợi hoặc cấu hình SMTP riêng.';
  if (value.includes('auth/email-already-in-use')) return 'Email này đã có tài khoản. Hãy đăng nhập hoặc đặt lại mật khẩu.';
  if (value.includes('auth/too-many-requests')) return 'Quá nhiều lần thử. Vui lòng thử lại sau ít phút.';
  if (value.includes('auth/operation-not-allowed')) return 'Nhà cung cấp đăng nhập này chưa được bật. Hãy kiểm tra Firebase Console → Authentication → Sign-in method.';
  if (value.includes('auth/unauthorized-domain')) return 'Tên miền này chưa được phép trong Firebase Authentication → Settings → Authorized domains.';
  if (value.includes('auth/requires-recent-login') || value.includes('auth/user-token-expired')) return 'Vì lý do bảo mật, hãy đăng xuất và đăng nhập lại rồi thực hiện lại thao tác này.';
  if (value.includes('auth/weak-password')) return `Mật khẩu quá yếu. Hãy sử dụng ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  if (value.includes('auth/invalid-email')) return 'Địa chỉ email không hợp lệ.';
  if (value.includes('auth/missing-password')) return 'Nhập mật khẩu.';
  if (value.includes('auth/user-disabled')) return 'Tài khoản này đã bị khóa. Hãy liên hệ hỗ trợ.';
  if (value.includes('auth/account-exists-with-different-credential')) return 'Email này đã được dùng với phương thức đăng nhập khác. Hãy đăng nhập bằng email/mật khẩu.';
  if (value.includes('auth/popup-closed-by-user') || value.includes('auth/cancelled-popup-request')) return 'Bạn đã đóng cửa sổ đăng nhập.';
  if (value.includes('auth/popup-blocked')) return 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.';
  if (value.includes('auth/social-not-configured')) return 'Đăng nhập Google trên bản cài này chưa được cấu hình. Hãy dùng email và mật khẩu hoặc kiểm tra OAuth client ID.';
  if (value.includes('auth/configuration-not-found')) return 'Phương thức đăng nhập này chưa được bật trong Firebase. Hãy bật Google trong Firebase Console → Authentication → Sign-in method.';
  if (value.includes('auth/in-progress')) return 'Đang có một phiên đăng nhập Google khác. Vui lòng đợi rồi thử lại.';
  if (value.includes('auth/play-services-not-available')) return 'Thiết bị chưa có Google Play Services hoặc đã quá cũ. Hãy cập nhật Google Play Services rồi thử lại.';
  if (value.includes('auth/google-config-error')) return 'Cấu hình Google Sign-In chưa khớp. Kiểm tra package name, SHA-1 và OAuth client ID trong Google Cloud Console.';
  if (value.includes('auth/google-missing-id-token')) return 'Google không trả về ID token. Hãy kiểm tra Web client ID và cấu hình OAuth của ứng dụng.';
  if (value.includes('auth/operation-not-supported-in-this-environment')) return 'Trình duyệt này không hỗ trợ cửa sổ đăng nhập. Hãy dùng email và mật khẩu.';
  if (value.includes('auth/invalid-api-key')) return 'Cấu hình Firebase không hợp lệ. Hãy kiểm tra EXPO_PUBLIC_FIREBASE_API_KEY trong .env.';
  if (value.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy mở email xác nhận rồi đăng nhập lại.';
  if (value.includes('user already registered') || value.includes('already been registered')) return 'Email này đã được đăng ký.';
  if (value.includes('email rate limit') || value.includes('rate limit')) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
  if (value.includes('unable to validate email') || value.includes('invalid email')) return 'Địa chỉ email không hợp lệ.';
  if (value.includes('password') && value.includes('characters')) return `Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  return raw || fallback;
}
