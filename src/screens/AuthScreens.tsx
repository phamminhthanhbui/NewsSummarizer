import React, { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Page, Heading, Action, Panel } from '../components/PremiumUI';
import { Sans, useTheme } from '../constants/theme';
import { useAuth } from '../providers/AuthProvider';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || '';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || '';

function Field({ label, value, onChangeText, placeholder, secure, keyboardType = 'default', autoCapitalize = 'none' }: any) {
  const C = useTheme();
  const [hidden, setHidden] = useState(Boolean(secure));
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontFamily: Sans.medium, fontSize: 12, color: C.text, marginBottom: 7 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, borderRadius: 12, paddingHorizontal: 13 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.textMuted}
          secureTextEntry={secure ? hidden : false}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
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

function authError(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : '';
  const value = raw.toLowerCase();
  if (value.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  if (value.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy mở email xác nhận rồi đăng nhập lại.';
  if (value.includes('user already registered') || value.includes('already been registered')) return 'Email này đã được đăng ký.';
  if (value.includes('email rate limit') || value.includes('rate limit')) return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.';
  if (value.includes('unable to validate email') || value.includes('invalid email')) return 'Địa chỉ email không hợp lệ.';
  if (value.includes('password') && value.includes('characters')) return 'Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 8 ký tự.';
  return raw || fallback;
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
        Giao diện đăng nhập đã sẵn sàng. Thêm EXPO_PUBLIC_SUPABASE_URL và EXPO_PUBLIC_SUPABASE_ANON_KEY vào .env để kích hoạt đăng nhập thật.
      </Text>
    </Panel>
  );
}

export function LoginScreen({ navigation }: any) {
  const C = useTheme();
  const { configured, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) return setError('Nhập email và mật khẩu.');
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      navigation.goBack();
    } catch (e) {
      setError(authError(e, 'Không thể đăng nhập.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Đăng nhập" navigation={navigation} maxWidth={560}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Heading eyebrow="TÀI KHOẢN" title="Đăng nhập để giữ quyền lợi Plus." subtitle="Tài khoản được dùng để đồng bộ quyền mua giữa các thiết bị và nhận diện thuê bao của bạn." />
        {!configured ? <AuthUnavailable /> : (
          <Panel>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="ban@email.com" keyboardType="email-address" />
            <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Ít nhất 8 ký tự" secure />
            <AuthStatus error={error} />
            <Action label={busy ? 'Đang đăng nhập...' : 'Đăng nhập'} icon="log-in-outline" primary disabled={busy} onPress={submit} />
            <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={{ alignSelf: 'center', padding: 12, marginTop: 4 }}>
              <Text style={{ fontFamily: Sans.medium, color: C.hot, fontSize: 12 }}>Quên mật khẩu?</Text>
            </TouchableOpacity>
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
  const { configured, signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!email.trim() || password.length < 8) return setError('Email hợp lệ và mật khẩu từ 8 ký tự là bắt buộc.');
    if (password !== confirm) return setError('Mật khẩu nhập lại chưa khớp.');
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await signUp(email, password, name);
      if (result.session) navigation.goBack();
      else setMessage('Tài khoản đã được tạo. Hãy kiểm tra email để xác nhận rồi đăng nhập.');
    } catch (e) {
      setError(authError(e, 'Không thể tạo tài khoản.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Tạo tài khoản" navigation={navigation} maxWidth={560}>
      <Heading eyebrow="BẮT ĐẦU" title="Một tài khoản cho mọi thiết bị." subtitle="Đăng ký miễn phí. Khi mua Plus, quyền lợi sẽ gắn với tài khoản này." />
      {!configured ? <AuthUnavailable /> : (
        <Panel>
          <Field label="Tên hiển thị" value={name} onChangeText={setName} placeholder="Tên của bạn" autoCapitalize="words" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="ban@email.com" keyboardType="email-address" />
          <Field label="Mật khẩu" value={password} onChangeText={setPassword} placeholder="Ít nhất 8 ký tự" secure />
          <Field label="Nhập lại mật khẩu" value={confirm} onChangeText={setConfirm} placeholder="Nhập lại mật khẩu" secure />
          <AuthStatus message={message} error={error} />
          <Action label={busy ? 'Đang tạo...' : 'Tạo tài khoản'} icon="person-add-outline" primary disabled={busy} onPress={submit} />
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
  const { configured, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    if (!email.trim()) return setError('Nhập email của tài khoản.');
    setBusy(true); setError(''); setMessage('');
    try {
      await requestPasswordReset(email);
      setMessage('Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư của bạn.');
    } catch (e) { setError(authError(e, 'Không thể gửi email.')); }
    finally { setBusy(false); }
  };
  return (
    <Page title="Quên mật khẩu" navigation={navigation} maxWidth={560}>
      <Heading title="Khôi phục quyền truy cập." subtitle="Chúng tôi sẽ gửi liên kết bảo mật để bạn đặt mật khẩu mới." />
      {!configured ? <AuthUnavailable /> : <Panel>
        <Field label="Email" value={email} onChangeText={setEmail} placeholder="ban@email.com" keyboardType="email-address" />
        <AuthStatus message={message} error={error} />
        <Action label={busy ? 'Đang gửi...' : 'Gửi liên kết đặt lại'} icon="mail-outline" primary disabled={busy} onPress={submit} />
      </Panel>}
    </Page>
  );
}

export function ResetPasswordScreen({ navigation }: any) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (password.length < 8) return setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (password !== confirm) return setError('Mật khẩu nhập lại chưa khớp.');
    setBusy(true); setError('');
    try { await updatePassword(password); navigation.navigate('Account'); }
    catch (e) { setError(authError(e, 'Không thể đổi mật khẩu.')); }
    finally { setBusy(false); }
  };
  return (
    <Page title="Mật khẩu mới" navigation={navigation} maxWidth={560}>
      <Heading title="Đặt mật khẩu mới." subtitle="Sau khi lưu, bạn có thể dùng mật khẩu này trên mọi thiết bị." />
      <Panel>
        <Field label="Mật khẩu mới" value={password} onChangeText={setPassword} placeholder="Ít nhất 8 ký tự" secure />
        <Field label="Nhập lại mật khẩu" value={confirm} onChangeText={setConfirm} placeholder="Nhập lại mật khẩu" secure />
        <AuthStatus error={error} />
        <Action label={busy ? 'Đang lưu...' : 'Lưu mật khẩu mới'} icon="key-outline" primary disabled={busy} onPress={submit} />
      </Panel>
    </Page>
  );
}
