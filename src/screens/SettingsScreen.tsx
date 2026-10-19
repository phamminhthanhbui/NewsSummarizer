import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { KEYS } from '../services/storage';
import { speakSystem, stopSystem, clearVoiceHung } from '../services/edgeTts';
import { ensureSetup as ensureNotifSetup, getSettings as getNotifSettings, setEnabled as persistNotifEnabled, saveTimes as saveNotifTimes, sendTest as sendNotifTest, parseTime, isNotifSupported } from '../services/notifications';
import { useAlert } from '../components/AppAlert';
import { Sans, Color, Font, Radius, getThemeMode, setThemeMode, useTheme, Layout } from '../constants/theme';
import { ScreenHeader, Action } from '../components/PremiumUI';
import { useAuth } from '../providers/AuthProvider';
import { displayName } from '../services/auth';
import { getSubscriptionState } from '../services/subscription';

const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || '';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || '';
const SUPPORT_URL = process.env.EXPO_PUBLIC_SUPPORT_URL?.trim() || '';

const NOTIF_TIMES = ['06:00', '07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];

type Palette = typeof Color;

export default function SettingsScreen({ navigation }: any) {
  const C = useTheme();
  const styles = makeStyles(C);
  const { showAlert } = useAlert();
  const { user } = useAuth();
  const [plus, setPlus] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pitch, setPitch] = useState(1);
  const [rate, setRate] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const [darkMode, setDarkMode] = useState(getThemeMode() === 'dark');
  const [notifOn, setNotifOn] = useState(false);
  const [notifTimes, setNotifTimes] = useState<string[]>([]);
  const [notifCustom, setNotifCustom] = useState('');
  const [notifSending, setNotifSending] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getSubscriptionState().then((state) => { if (alive) setPlus(state.active); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  useEffect(() => {
    AsyncStorage.getItem(KEYS.pitch).then((value) => setPitch(parseFloat(value || '') || 1));
    AsyncStorage.getItem(KEYS.rate).then((value) => setRate(parseFloat(value || '') || 1));
    getNotifSettings().then((settings) => {
      setNotifOn(settings.enabled);
      setNotifTimes(settings.times);
    });
    return () => { stopSystem(); };
  }, []);

  const handleSave = async () => {
    await AsyncStorage.setItem(KEYS.pitch, String(pitch));
    await AsyncStorage.setItem(KEYS.rate, String(rate));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const previewVoice = async () => {
    if (previewing) {
      stopSystem();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      clearVoiceHung();
      await speakSystem('Xin chào, đây là giọng đọc tin tức tiếng Việt.', { pitch, rate });
    } catch (error) {
      showAlert({ type: 'error', message: 'Lỗi giọng đọc: ' + (error instanceof Error ? error.message : 'Unknown') });
    } finally {
      setPreviewing(false);
    }
  };

  const handleNotifToggle = async (value: boolean) => {
    setNotifOn(value);
    if (value) {
      const granted = await ensureNotifSetup();
      if (!granted) {
        setNotifOn(false);
        showAlert({ type: 'warning', title: 'Quyền thông báo', message: 'Cần bật quyền thông báo cho TIN TỨC trong Cài đặt hệ thống.' });
        return;
      }
    }
    await persistNotifEnabled(value, notifTimes);
  };

  const handleNotifTimeToggle = async (time: string) => {
    const next = notifTimes.includes(time) ? notifTimes.filter((value) => value !== time) : [...notifTimes, time];
    setNotifTimes(next);
    await saveNotifTimes(next);
  };

  const handleNotifAddCustom = async () => {
    const time = notifCustom.trim();
    if (!parseTime(time)) {
      showAlert({ type: 'warning', title: 'Giờ không hợp lệ', message: 'Nhập giờ theo định dạng HH:MM (ví dụ 07:30).' });
      return;
    }
    const next = notifTimes.includes(time) ? notifTimes : [...notifTimes, time];
    setNotifTimes(next);
    setNotifCustom('');
    await saveNotifTimes(next);
  };

  const handleNotifTest = async () => {
    if (notifSending) return;
    setNotifSending(true);
    try {
      const granted = await ensureNotifSetup();
      if (!granted) {
        showAlert({ type: 'warning', title: 'Quyền thông báo', message: 'Cần bật quyền thông báo trước khi gửi thử.' });
        return;
      }
      await sendNotifTest();
      showAlert({ type: 'success', message: 'Đã gửi thông báo thử.' });
    } finally {
      setNotifSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Cài đặt" subtitle="Tùy chỉnh trải nghiệm đọc và nghe" />
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.profileCard} onPress={() => navigation.navigate('Account')} activeOpacity={0.82}>
          <View style={styles.avatar}><Ionicons name="person-outline" size={22} color={C.hot} /></View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.profileTitle}>{user ? displayName(user) : 'Không gian của bạn'}</Text>
            <Text numberOfLines={1} style={styles.profileSub}>{user?.email || 'Chế độ khách · đăng nhập để giữ quyền lợi'}</Text>
          </View>
          <View style={styles.planPill}><Text style={styles.planText}>{plus ? 'PLUS' : 'FREE'}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
        </TouchableOpacity>

        <SettingGroup title="Trải nghiệm">
          <SettingRow icon="moon-outline" title="Chế độ tối" subtitle={darkMode ? 'Đang bật' : 'Đang tắt'} trailing={
            <Switch value={darkMode} onValueChange={(value) => { setDarkMode(value); setThemeMode(value ? 'dark' : 'light'); }} trackColor={{ false: C.border, true: C.hot }} thumbColor="#fff" testID="dark-mode-switch" />
          } />
          <SettingRow icon="volume-high-outline" title="Giọng đọc" subtitle="Điều chỉnh cao độ và tốc độ" expanded>
            <View style={styles.inlinePanel}>
              <Stepper label="Cao độ" value={pitch} min={0.5} max={2} step={0.1} onChange={setPitch} />
              <View style={styles.divider} />
              <Stepper label="Tốc độ" value={rate} min={0.5} max={1.5} step={0.1} onChange={setRate} />
              <View style={{ marginTop: 14 }}><Action label={previewing ? 'Dừng nghe thử' : 'Nghe thử giọng đọc'} icon={previewing ? 'stop' : 'play'} primary onPress={previewVoice} /></View>
            </View>
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Thông báo">
          <SettingRow icon="notifications-outline" title="Bản tin hằng ngày" subtitle={isNotifSupported ? 'Nhận tin nổi bật vào giờ bạn chọn' : 'Không hỗ trợ trên môi trường hiện tại'} trailing={
            <Switch value={notifOn} onValueChange={handleNotifToggle} disabled={!isNotifSupported} trackColor={{ false: C.border, true: C.hot }} thumbColor="#fff" testID="notif-switch" />
          } expanded={notifOn}>
            {notifOn ? (
              <View style={styles.inlinePanel}>
                <Text style={styles.miniLabel}>GIỜ GỬI</Text>
                <View style={styles.chipRow}>
                  {NOTIF_TIMES.map((time) => {
                    const active = notifTimes.includes(time);
                    return <TouchableOpacity key={time} onPress={() => handleNotifTimeToggle(time)} style={[styles.timeChip, active && styles.timeChipActive]}><Text style={[styles.timeText, active && styles.timeTextActive]}>{time}</Text></TouchableOpacity>;
                  })}
                  {notifTimes.filter((time) => !NOTIF_TIMES.includes(time)).map((time) => (
                    <TouchableOpacity key={time} onPress={() => handleNotifTimeToggle(time)} style={[styles.timeChip, styles.timeChipActive, { flexDirection: 'row', gap: 4 }]}><Text style={styles.timeTextActive}>{time}</Text><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
                  ))}
                </View>
                <View style={styles.customRow}>
                  <TextInput value={notifCustom} onChangeText={setNotifCustom} placeholder="HH:MM" placeholderTextColor={C.textMuted} keyboardType="numbers-and-punctuation" maxLength={5} onSubmitEditing={handleNotifAddCustom} style={styles.input} />
                  <Action label="Thêm" icon="add" onPress={handleNotifAddCustom} />
                </View>
                <View style={{ marginTop: 12 }}><Action label={notifSending ? 'Đang gửi...' : 'Gửi thông báo thử'} icon="paper-plane-outline" disabled={notifSending} onPress={handleNotifTest} /></View>
              </View>
            ) : null}
          </SettingRow>
        </SettingGroup>

        <SettingGroup title="Nội dung & tài khoản">
          <SettingRow icon="options-outline" title="Nguồn tin & chủ đề" subtitle="Chọn những gì xuất hiện trong bản tin" onPress={() => navigation.navigate('Sources')} />
          <SettingRow icon="sparkles-outline" title="NewsSummarizer Plus" subtitle={plus ? "Đang hoạt động trên tài khoản này" : "Xem gói và quyền lợi cao cấp"} onPress={() => navigation.navigate('Plans')} />
          <SettingRow icon="chatbox-ellipses-outline" title="Góp ý" subtitle="Phản hồi về trải nghiệm sản phẩm" onPress={() => navigation.navigate('Feedback')} />
          {SUPPORT_URL ? <SettingRow icon="help-circle-outline" title="Hỗ trợ" subtitle="Trợ giúp về tài khoản, nội dung và Plus" onPress={() => Linking.openURL(SUPPORT_URL)} /> : null}
          {PRIVACY_URL ? <SettingRow icon="shield-checkmark-outline" title="Chính sách quyền riêng tư" subtitle="Cách NewsSummarizer xử lý dữ liệu" onPress={() => Linking.openURL(PRIVACY_URL)} /> : null}
          {TERMS_URL ? <SettingRow icon="document-text-outline" title="Điều khoản sử dụng" subtitle="Điều khoản tài khoản và thuê bao" onPress={() => Linking.openURL(TERMS_URL)} last /> : null}
        </SettingGroup>

        <View style={{ marginTop: 8 }}><Action label={saved ? 'Đã lưu cài đặt' : 'Lưu cài đặt giọng đọc'} icon={saved ? 'checkmark' : 'save-outline'} primary onPress={handleSave} disabled={saved} /></View>
        <Text style={styles.footer}>NewsSummarizer · Signal Editorial</Text>
      </ScrollView>
    </View>
  );
}

function SettingGroup({ title, children }: any) {
  const C = useTheme();
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ fontFamily: Sans.bold, fontSize: 12, color: C.textMuted, letterSpacing: .8, marginBottom: 9, marginLeft: 4 }}>{title.toUpperCase()}</Text>
      <View style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.md, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

function SettingRow({ icon, title, subtitle, trailing, onPress, children, expanded = false, last = false }: any) {
  const C = useTheme();
  return (
    <View>
      <TouchableOpacity disabled={!onPress} onPress={onPress} activeOpacity={0.76} style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.hotSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={18} color={C.hot} /></View>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: Sans.medium, fontSize: 14, color: C.text }}>{title}</Text>{subtitle ? <Text style={{ fontFamily: Sans.regular, fontSize: 11, color: C.textMuted, marginTop: 3 }}>{subtitle}</Text> : null}</View>
        {trailing || (onPress ? <Ionicons name="chevron-forward" size={18} color={C.textMuted} /> : null)}
      </TouchableOpacity>
      {expanded && children ? <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View> : null}
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 64 }} /> : null}
    </View>
  );
}

function Stepper({ label, value, min, max, step, onChange }: any) {
  const C = useTheme();
  const change = (delta: number) => onChange(Math.max(min, Math.min(max, Math.round((value + delta) * 10) / 10)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
      <Text style={{ fontFamily: Sans.regular, fontSize: 13, color: C.textSecondary }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <TouchableOpacity onPress={() => change(-step)} disabled={value <= min} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="remove" size={17} color={value <= min ? C.textMuted : C.hot} /></TouchableOpacity>
        <Text style={{ minWidth: 38, textAlign: 'center', fontFamily: Sans.bold, color: C.text, fontSize: 14 }}>{value.toFixed(1)}</Text>
        <TouchableOpacity onPress={() => change(step)} disabled={value >= max} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={17} color={value >= max ? C.textMuted : C.hot} /></TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 56, width: '100%', maxWidth: Layout.settings, alignSelf: 'center' },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.navy, borderRadius: Radius.lg, padding: 18, marginBottom: 28 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(243,106,45,.16)', alignItems: 'center', justifyContent: 'center' },
  profileTitle: { fontFamily: Sans.bold, color: '#fff', fontSize: 16 },
  profileSub: { fontFamily: Sans.regular, color: '#AEB8C8', fontSize: 11, marginTop: 4 },
  planPill: { backgroundColor: 'rgba(255,255,255,.08)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
  planText: { fontFamily: Sans.bold, color: '#D6DCE5', fontSize: 9, letterSpacing: .8 },
  inlinePanel: { backgroundColor: C.surfaceAlt, borderRadius: 13, padding: 12 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 4 },
  miniLabel: { fontFamily: Sans.bold, color: C.textMuted, fontSize: 10, letterSpacing: .8, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  timeChipActive: { backgroundColor: C.hot, borderColor: C.hot },
  timeText: { fontFamily: Sans.medium, fontSize: 11, color: C.textSecondary },
  timeTextActive: { fontFamily: Sans.bold, fontSize: 11, color: '#fff' },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontFamily: Sans.regular, fontSize: 13, color: C.text, backgroundColor: C.card },
  footer: { textAlign: 'center', marginTop: 24, fontFamily: Sans.regular, fontSize: 10, color: C.textMuted },
});
