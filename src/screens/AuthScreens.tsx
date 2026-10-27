import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Page, Heading, Action, Panel } from '../components/PremiumUI';
import { Sans, useTheme } from '../constants/theme';
import { useAuth } from '../providers/AuthProvider';
import { AUTH_PROVIDER } from '../services/auth';
import { normalizeEmail, validateEmail, validatePassword, validatePasswordConfirmation } from '../services/authValidation';
import { authErrorMessage } from '../services/authErrors';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || '';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || '';

function Field({
  label, value, onChangeText, placeholder, secure, keyboardType = 'default', autoCapitalize = 'none',
  autoComplete, textContentType, returnKeyType, onSubmitEditing, inputRef, editable = true, maxLength,
}: any) {
  const C = useTheme();
  const [hidden, setHidden] = useState(Boolean(secure));
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: Sans.medium, fontSize: 12, color: C.text, marginBottom: 7 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 13, opacity: editable ? 1 : .6 }}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          secureTextEntry={secure ? hidden : false}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          maxLength={maxLength}
          style={{ flex: 1, minHeight: 48, fontFamily: Sans.regular, fontSize: 13, color: C.text }}
        />
        {secure ? (
          <TouchableOpacity accessibilityLabel={hidden ? 'Hiện mật khẩu' : 'Ẩn mật khẩu'} onPress={() => setHidden((value) => !value)} hitSlop={8}>
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={18} color={C.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function AuthStatus({ message, error }: { message?: string; error?: string }) {
  const C = useTheme();
  if (!message && !error) return null;
  return (
    <View style={{ padding: 12, borderRadius: 11, marginBottom: 14, backgroundColor: error ? C.dangerSoft : C.successSoft }}>
      <Text style={{ fontFamily: Sans.regular, fontSize: 12, lineHeight: 19, color: error ? C.danger : C.success }}>{error || message}</Text>
    </View>
  );
}

function AuthUnavailable() {
  const C = useTheme();
  return (
    <Panel>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.hotSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Ionicons name="construct-outline" size={21} color={C.hot} />
      </View>
      <Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 16 }}>Chưa kết nối máy chủ tài khoản</Text>
      <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 12, lineHeight: 19, marginTop: 7 }}>
        {AUTH_PROVIDER === 'firebase' ? 'Firebase chưa được cấu hình. Thêm Firebase Web App config vào .env và bật Email/Password trên Firebase Console.' : 'Giao diện đăng nhập đã sẵn sàng. Thêm EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_ANON_KEY vào .env để kích hoạt đăng nhập thật.'}
      </Text>
    </Panel>
  );
}

function leaveAuthScreen(navigation: any) {
  if (navigation.canGoBack?.()) navigation.goBack();
  else navigation.navigate('Main');
}

// Closing the Google/Apple sheet is not an error worth a red banner.
function isSocialCancel(error: unknown) {
  const value = error instanceof Error ? error.message.toLowerCase() : '';
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code.toLowerCase() : '';
  return code.includes('err_request_canceled')
    || value.includes('err_request_canceled')
    || value.includes('auth/popup-closed-by-user')
    || value.includes('auth/cancelled-popup-request');
}

function SocialButton({ icon, label, disabled, onPress }: { icon: any; label: string; disabled: boolean; onPress: () => void }) {
  const C = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      activeOpacity={0.8}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surfaceAlt,
        borderRadius: 12,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        opacity: disabled ? .45 : 1,
      }}
    >
      <Ionicons name={icon} size={18} color={C.text} />
      <Text style={{ fontFamily: Sans.medium, fontSize: 13, color: C.text }}>{label}</Text>
    </TouchableOpacity>
  );
}

function SocialSection({ google, apple, disabled, onGoogle, onApple, dividerLabel = 'hoặc tiếp tục với' }: {
  google: boolean; apple: boolean; disabled: boolean; onGoogle: () => void; onApple: () => void; dividerLabel?: string;
}) {
  const C = useTheme();
  if (!google && !apple) return null;
  return (
    <View style={{ marginTop: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
        <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 11 }}>{dividerLabel}</Text>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border }} />
      </View>
      {google ? <SocialButton icon="logo-google" label="Tiếp tục với Google" disabled={disabled} onPress={onGoogle} /> : null}
      {apple ? <SocialButton icon="logo-apple" label="Tiếp tục với Apple" disabled={disabled} onPress={onApple} /> : null}
    </View>
  );
}

export function LoginScreen({ navigation }: any) {
  const C = useTheme();
  const {
    configured, signIn, resendVerification, signInWithGoogle, signInWithApple,
    googleSignInAvailable, appleSignInAvailable,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const changeEmail = (value: string) => {
    setEmail(value);
    if (error) setError('');
    if (message) setMessage('');
  };
  const changePassword = (value: string) => {
    setPassword(value);
    if (error) setError('');
    if (message) setMessage('');
  };

  const resend = async () => {
    const emailIssue = validateEmail(email);
    if (emailIssue) return setError(emailIssue);
    if (AUTH_PROVIDER === 'firebase' && !password) return setError('Nhập mật khẩu để gửi lại email xác minh.');
    setResending(true); setError(''); setMessage('');
    try {
      await resendVerification(normalizeEmail(email), password);
      setMessage('Nếu email chưa được xác minh, liên kết mới đã được gửi. Hãy kiểm tra hộp thư và Spam.');
    }
    catch (e) { setError(authErrorMessage(e, 'Không gửi lại được email xác minh.')); }
    finally { setResending(false); }
  };

  const submit = async () => {
    const emailIssue = validateEmail(email);
    if (emailIssue) return setError(emailIssue);
    if (!password) return setError('Nhập mật khẩu.');
    setBusy(true);
    setError(''); setMessage('');
    try {
      await signIn(normalizeEmail(email), password);
      leaveAuthScreen(navigation);
    } catch (e) {
      setError(authErrorMessage(e, 'Không thể đăng nhập.'));
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider: 'Google' | 'Apple') => {
    setBusy(true); setError(''); setMessage('');
    try {
      await (provider === 'Google' ? signInWithGoogle() : signInWithApple());
      leaveAuthScreen(navigation);
    } catch (e) {
      if (!isSocialCancel(e)) setError(authErrorMessage(e, `Không thể đăng nhập bằng ${provider}.`));
    } finally {
      setBusy(false);
    }
  };

  const canResend = Boolean(email.trim()) && (AUTH_PROVIDER !== 'firebase' || Boolean(password));

  return (
    <Page title="Đăng nhập" navigation={navigation} maxWidth={560}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Heading eyebrow="TÀI KHOẢN" title="Đăng nhập để giữ quyền lợi Plus." subtitle="Tài khoản được dùng để đồng bộ quyền mua giữa các thiết bị và nhận diện thuê bao của bạn." />
        {!configured ? <AuthUnavailable /> : (
          <Panel>
            <Field
              label="Email"
              value={email}
              onChangeText={changeEmail}
              placeholder="ban@email.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              inputRef={emailRef}
              editable={!busy && !resending}
            />
            <Field
              label="Mật khẩu"
              value={password}
              onChangeText={changePassword}
              placeholder="Mật khẩu của bạn"
              secure
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              inputRef={passwordRef}
              editable={!busy && !resending}
            />
            <AuthStatus message={message} error={error} />
            <Action label={busy ? 'Đang đăng nhập...' : 'Đăng nhập'} icon="log-in-outline" primary disabled={busy || resending} onPress={submit} />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={resending ? 'Đang gửi email xác minh' : 'Gửi lại email xác minh'}
              onPress={resend}
              disabled={busy || resending || !canResend}
              style={{ alignSelf: 'center', padding: 12, opacity: busy || resending || !canResend ? .45 : 1 }}
            >
              <Text style={{ fontFamily: Sans.medium, color: C.hot, fontSize: 12 }}>{resending ? 'Đang gửi xác minh...' : 'Gửi lại email xác minh'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={{ alignSelf: 'center', padding: 12, marginTop: 4 }}>
              <Text style={{ fontFamily: Sans.medium, color: C.hot, fontSize: 12 }}>Quên mật khẩu?</Text>
            </TouchableOpacity>
            <SocialSection
              google={googleSignInAvailable}
              apple={appleSignInAvailable}
              disabled={busy || resending}
              onGoogle={() => social('Google')}
              onApple={() => social('Apple')}
            />
          </Panel>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
          <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 12 }}>Chưa có tài khoản?</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Register')}><Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 12 }}>Tạo tài khoản</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}

export function RegisterScreen({ navigation }: any) {
  const C = useTheme();
  const {
    configured, signUp, resendVerification, signInWithGoogle, signInWithApple,
    googleSignInAvailable, appleSignInAvailable, session,
  } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    if (awaitingVerification && session) leaveAuthScreen(navigation);
  }, [awaitingVerification, session, navigation]);

  const clearFeedback = () => {
    if (error) setError('');
    if (message) setMessage('');
  };

  const resend = async () => {
    const emailIssue = validateEmail(email);
    if (emailIssue) return setError(emailIssue);
    if (AUTH_PROVIDER === 'firebase' && !password) return setError('Nhập mật khẩu để gửi lại email xác minh.');
    setResending(true); setError(''); setMessage('');
    try {
      await resendVerification(normalizeEmail(email), password);
      setMessage('Đã gửi lại email xác minh. Kiểm tra Hộp thư đến, Spam và Quảng cáo.');
    } catch (e) {
      setError(authErrorMessage(e, 'Không gửi lại được email xác minh.'));
    } finally {
      setResending(false);
    }
  };

  const social = async (provider: 'Google' | 'Apple') => {
    setBusy(true); setError(''); setMessage('');
    try {
      await (provider === 'Google' ? signInWithGoogle() : signInWithApple());
      leaveAuthScreen(navigation);
    } catch (e) {
      if (!isSocialCancel(e)) setError(authErrorMessage(e, `Không thể đăng ký bằng ${provider}.`));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const emailIssue = validateEmail(email);
    if (emailIssue) return setError(emailIssue);
    const passwordIssue = validatePassword(password);
    if (passwordIssue) return setError(passwordIssue);
    const confirmIssue = validatePasswordConfirmation(password, confirm);
    if (confirmIssue) return setError(confirmIssue);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await signUp(normalizeEmail(email), password, name);
      if (result.session) leaveAuthScreen(navigation);
      else {
        setAwaitingVerification(true);
        setMessage(`Đã gửi liên kết xác minh tới ${normalizeEmail(email)}. Mở liên kết trong email để kích hoạt — ứng dụng sẽ tự đăng nhập lại và mở khóa tài khoản ngay. Bạn vẫn có thể đọc tin ở chế độ khách trong lúc chờ. Nếu chưa thấy email, hãy kiểm tra Spam hoặc bấm Gửi lại email xác minh bên dưới.`);
      }
    } catch (e) {
      setError(authErrorMessage(e, 'Không thể tạo tài khoản.'));
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || resending;

  return (
    <Page title="Tạo tài khoản" navigation={navigation} maxWidth={560}>
      <Heading eyebrow="BẮT ĐẦU" title="Một tài khoản cho mọi thiết bị." subtitle="Đăng ký miễn phí. Khi mua Plus, quyền lợi sẽ gắn với tài khoản này." />
      {!configured ? <AuthUnavailable /> : (
        <Panel>
          <Field
            label="Tên hiển thị"
            value={name}
            onChangeText={(value: string) => { setName(value); clearFeedback(); }}
            placeholder="Tên của bạn"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            editable={!disabled}
          />
          <Field
            label="Email"
            value={email}
            onChangeText={(value: string) => { setEmail(value); clearFeedback(); }}
            placeholder="ban@email.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            inputRef={emailRef}
            editable={!disabled}
          />
          <Field
            label="Mật khẩu"
            value={password}
            onChangeText={(value: string) => { setPassword(value); clearFeedback(); }}
            placeholder="Ít nhất 8 ký tự"
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            inputRef={passwordRef}
            editable={!disabled}
          />
          <Field
            label="Nhập lại mật khẩu"
            value={confirm}
            onChangeText={(value: string) => { setConfirm(value); clearFeedback(); }}
            placeholder="Nhập lại mật khẩu"
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
            inputRef={confirmRef}
            editable={!disabled}
          />
          <AuthStatus message={message} error={error} />
          <Action label={busy ? 'Đang xử lý...' : 'Tạo tài khoản'} icon="person-add-outline" primary disabled={disabled} onPress={submit} />
          {message ? (
            <View style={{ marginTop: 11 }}>
              <Action
                label={resending ? 'Đang gửi lại...' : 'Gửi lại email xác minh'}
                icon="mail-outline"
                disabled={disabled}
                onPress={resend}
              />
            </View>
          ) : null}
          <SocialSection
            google={googleSignInAvailable}
            apple={appleSignInAvailable}
            disabled={disabled}
            onGoogle={() => social('Google')}
            onApple={() => social('Apple')}
          />
        </Panel>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginBottom: 12 }}>
        <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 12 }}>Đã có tài khoản?</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}><Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 12 }}>Đăng nhập</Text></TouchableOpacity>
      </View>
      <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 10, lineHeight: 17, textAlign: 'center' }}>Bằng việc tạo tài khoản, bạn đồng ý với các điều khoản của NewsSummarizer.</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 7 }}>
        {TERMS_URL ? <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}><Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 10 }}>Điều khoản sử dụng</Text></TouchableOpacity> : null}
        {PRIVACY_URL ? <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}><Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 10 }}>Quyền riêng tư</Text></TouchableOpacity> : null}
      </View>
    </Page>
  );
}

export function ForgotPasswordScreen({ navigation }: any) {
  const C = useTheme();
  const { configured, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const emailRef = useRef<TextInput>(null);

  const submit = async () => {
    const emailIssue = validateEmail(email);
    if (emailIssue) return setError(emailIssue);
    setBusy(true); setError(''); setMessage('');
    try {
      await requestPasswordReset(normalizeEmail(email));
      // Same wording for every address so the screen does not reveal which
      // emails have an account.
      setMessage(`Nếu ${normalizeEmail(email)} có tài khoản, liên kết đặt lại mật khẩu đã được gửi. Hãy kiểm tra Hộp thư đến, Spam và Quảng cáo.`);
    } catch (e) {
      setError(authErrorMessage(e, 'Không thể gửi email đặt lại mật khẩu.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Quên mật khẩu" navigation={navigation} maxWidth={560}>
      <Heading title="Khôi phục quyền truy cập." subtitle="Chúng tôi sẽ gửi liên kết bảo mật để bạn đặt mật khẩu mới." />
      {!configured ? <AuthUnavailable /> : (
        <Panel>
          <Field
            label="Email"
            value={email}
            onChangeText={(value: string) => { setEmail(value); if (error) setError(''); if (message) setMessage(''); }}
            placeholder="ban@email.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={submit}
            inputRef={emailRef}
            editable={!busy}
          />
          <AuthStatus message={message} error={error} />
          <Action label={busy ? 'Đang gửi...' : 'Gửi liên kết đặt lại'} icon="mail-outline" primary disabled={busy} onPress={submit} />
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ alignSelf: 'center', padding: 12, marginTop: 4 }}>
            <Text style={{ fontFamily: Sans.medium, color: C.hot, fontSize: 12 }}>Quay lại đăng nhập</Text>
          </TouchableOpacity>
        </Panel>
      )}
    </Page>
  );
}

export function ResetPasswordScreen({ navigation }: any) {
  const C = useTheme();
  const { configured, session, updatePassword, resetPasswordWithCode, passwordResetReady } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef<TextInput>(null);
  const codeReady = passwordResetReady();

  const submit = async () => {
    const passwordIssue = validatePassword(password);
    if (passwordIssue) return setError(passwordIssue);
    const confirmIssue = validatePasswordConfirmation(password, confirm);
    if (confirmIssue) return setError(confirmIssue);
    setBusy(true); setError('');
    try {
      if (codeReady) {
        await resetPasswordWithCode(password);
        navigation.navigate('Login');
      } else {
        await updatePassword(password);
        navigation.navigate('Account');
      }
    } catch (e) {
      setError(authErrorMessage(e, 'Không thể đổi mật khẩu.'));
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <Page title="Mật khẩu mới" navigation={navigation} maxWidth={560}>
        <Heading title="Đặt mật khẩu mới." subtitle="Sau khi lưu, bạn có thể dùng mật khẩu này trên mọi thiết bị." />
        <AuthUnavailable />
      </Page>
    );
  }

  if (!session && !codeReady) {
    return (
      <Page title="Mật khẩu mới" navigation={navigation} maxWidth={560}>
        <Heading title="Liên kết đã hết hạn." subtitle="Liên kết đặt lại mật khẩu chỉ dùng được một lần và có thời hạn." />
        <Panel>
          <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 13, lineHeight: 21 }}>
            Hãy yêu cầu một liên kết mới rồi mở lại từ email trên thiết bị này. Nếu bạn vừa đổi mật khẩu, hãy đăng nhập bằng mật khẩu mới.
          </Text>
          <View style={{ height: 16 }} />
          <Action label="Gửi liên kết mới" icon="mail-outline" primary onPress={() => navigation.navigate('ForgotPassword')} />
          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ alignSelf: 'center', padding: 12, marginTop: 4 }}>
            <Text style={{ fontFamily: Sans.medium, color: C.hot, fontSize: 12 }}>Quay lại đăng nhập</Text>
          </TouchableOpacity>
        </Panel>
      </Page>
    );
  }

  return (
    <Page title="Mật khẩu mới" navigation={navigation} maxWidth={560}>
      <Heading title="Đặt mật khẩu mới." subtitle="Sau khi lưu, bạn có thể dùng mật khẩu này trên mọi thiết bị." />
      <Panel>
        <Field
          label="Mật khẩu mới"
          value={password}
          onChangeText={(value: string) => { setPassword(value); if (error) setError(''); }}
          placeholder="Ít nhất 8 ký tự"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          editable={!busy}
        />
        <Field
          label="Nhập lại mật khẩu"
          value={confirm}
          onChangeText={(value: string) => { setConfirm(value); if (error) setError(''); }}
          placeholder="Nhập lại mật khẩu"
          secure
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          inputRef={confirmRef}
          editable={!busy}
        />
        <AuthStatus error={error} />
        <Action label={busy ? 'Đang lưu...' : 'Lưu mật khẩu mới'} icon="key-outline" primary disabled={busy} onPress={submit} />
      </Panel>
    </Page>
  );
}
