// Shared, provider-independent validation for the email/password login flow.
// Keep messages in Vietnamese because they are rendered directly in AuthScreens.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD_LENGTH = 8;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const value = normalizeEmail(email);
  if (!value) return 'Nhập email của bạn.';
  if (!EMAIL_PATTERN.test(value)) return 'Địa chỉ email không hợp lệ.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Nhập mật khẩu.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) return 'Nhập lại mật khẩu để xác nhận.';
  if (password !== confirmation) return 'Mật khẩu nhập lại chưa khớp.';
  return null;
}
