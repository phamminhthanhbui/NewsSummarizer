import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PROVIDERS, type LLMProvider, getModelsForProvider, testProviderConnection, DEFAULT_NVIDIA_KEY, DEFAULT_PROVIDER } from '../services/summarize';
import { KEYS } from '../services/storage';
import { speakSystem, stopSystem, clearVoiceHung } from '../services/edgeTts';
import { ensureSetup as ensureNotifSetup, getSettings as getNotifSettings, setEnabled as persistNotifEnabled, saveTimes as saveNotifTimes, sendTest as sendNotifTest, parseTime, isNotifSupported } from '../services/notifications';
import { useAlert } from '../components/AppAlert';
import { Color, Font, Radius, Shadow, THEME_COLORS, getThemeMode, setThemeMode, useTheme } from '../constants/theme';

const PROVIDER_ICONS: Record<LLMProvider, string> = {
  nvidia: 'cube',
};

// Màu nhận diện từng section — lấy trong 7 màu chủ đạo (THEME_COLORS)
const SECTION_COLORS = {
  provider: '#7C3AED', // Tím
  apiKey: '#2563EB',   // Xanh biển
  endpoint: '#D97706', // Vàng đồng
  model: '#059669',    // Xanh lá
  voice: '#DB2777',    // Hồng
  security: '#DC2626', // Đỏ thời sự
  notif: '#F0A52B',    // Vàng cam (thông báo)
};

// Giờ gửi bản tin hằng ngày — chọn nhanh từ preset
const NOTIF_TIMES = ['06:00', '07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const C = useTheme(); // palette theo dark mode — styles dùng C thay vì Color tĩnh
  const styles = makeStyles(C); // styles động: đổi mode là cả màn hình đổi màu ngay
  const { showAlert } = useAlert();
  const [provider, setProvider] = useState<LLMProvider>(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saved, setSaved] = useState(false);
  const [pitch, setPitch] = useState(1.0);
  const [rate, setRate] = useState(1.0);
  const [previewing, setPreviewing] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [aiUnlocked, setAiUnlocked] = useState(false); // ẩn mục AI mặc định; mở bằng mã 016527 ở ô tìm kiếm home
  const [darkMode, setDarkMode] = useState(getThemeMode() === 'dark');
  const [notifOn, setNotifOn] = useState(false);
  const [notifTimes, setNotifTimes] = useState<string[]>([]);
  const [notifCustom, setNotifCustom] = useState('');
  const [notifSending, setNotifSending] = useState(false);

  const cfg = PROVIDERS.find((p) => p.id === provider);
  const models = getModelsForProvider(provider);
  const keyStorageKey = cfg?.keyStorageKey ? KEYS[cfg.keyStorageKey] : KEYS.apiKey;
  const showCustomUrl = cfg?.supportsCustomUrl;

  useEffect(() => {
    AsyncStorage.getItem(KEYS.provider).then((val) => {
      if (val && PROVIDERS.some((p) => p.id === val)) {
        setProvider(val as LLMProvider);
      }
    });
    AsyncStorage.getItem(keyStorageKey).then((val) => val && setApiKey(val));
    AsyncStorage.getItem(KEYS.customBaseUrl).then((val) => val && setCustomBaseUrl(val));
    AsyncStorage.getItem(KEYS.model).then((val) => {
      setModel(models.find((m) => m.id === val)?.id || models[0]?.id || '');
    });
    AsyncStorage.getItem(KEYS.pitch).then((val) => setPitch(parseFloat(val || '') || 1.0));
    AsyncStorage.getItem(KEYS.rate).then((val) => setRate(parseFloat(val || '') || 1.0));

  }, []);

  // Load trạng thái thông báo
  useEffect(() => {
    getNotifSettings().then((s) => {
      setNotifOn(s.enabled);
      setNotifTimes(s.times);
    });
  }, []);

  // Tab navigator giữ screen mounted sẵn — đọc lại cờ unlock mỗi lần focus
  // để toggle từ Home có hiệu lực ngay khi quay lại tab này, không cần F5
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(KEYS.aiUnlocked).then((val) => setAiUnlocked(val === '1'));
    }, [])
  );

  useEffect(() => {
    const m = models[0]?.id || '';
    setModel(m);
    // Storage trống thì điền key mặc định vào ô (chạy được ngay khi start)
    AsyncStorage.getItem(keyStorageKey).then((val) => setApiKey(val || DEFAULT_NVIDIA_KEY));
    if (showCustomUrl) {
      AsyncStorage.getItem(KEYS.customBaseUrl).then((val) => setCustomBaseUrl(val || ''));
    }
    setSaved(false);
    setModelOpen(false);
    setTestResult(null); // đổi provider → kết quả test cũ không còn đúng
  }, [provider]);

  const handleSave = async () => {
    await AsyncStorage.setItem(KEYS.provider, provider);
    await AsyncStorage.setItem(keyStorageKey, apiKey.trim());
    if (showCustomUrl) await AsyncStorage.setItem(KEYS.customBaseUrl, customBaseUrl.trim());
    await AsyncStorage.setItem(KEYS.model, model);
    await AsyncStorage.setItem(KEYS.pitch, String(pitch));
    await AsyncStorage.setItem(KEYS.rate, String(rate));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const stopAudio = () => {
    // expo-speech xử lý cả web lẫn native
    stopSystem();
  };
  const previewVoice = async () => {
    if (previewing) {
      stopAudio();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      clearVoiceHung(); // mark treo cũ có thể oan — cho thử lại ngay
      // expo-speech: native đọc offline; web bọc sẵn Web Speech API của browser
      await speakSystem('Xin chào, đây là giọng đọc tin tức tiếng Việt.', { pitch, rate });
      setPreviewing(false);
    } catch (e) {
      showAlert({ type: 'error', message: 'Lỗi giọng đọc: ' + (e instanceof Error ? e.message : 'Unknown') });
      setPreviewing(false);
    }
  };

  const handleTest = async () => {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      await testProviderConnection(provider, apiKey.trim(), model, showCustomUrl ? customBaseUrl.trim() : undefined);
      setTestResult({ ok: true, msg: `Kết nối ${cfg?.label || 'AI'} thành công` });
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : 'Lỗi không xác định' });
    } finally {
      setTesting(false);
    }
  };

  const handleNotifToggle = async (v: boolean) => {
    setNotifOn(v);
    if (v) {
      const granted = await ensureNotifSetup();
      if (!granted) {
        setNotifOn(false);
        showAlert({ type: 'warning', title: 'Quyền thông báo', message: 'Cần bật quyền thông báo cho TIN TỨC trong Cài đặt hệ thống.' });
        return;
      }
    }
    await persistNotifEnabled(v, notifTimes);
  };

  const handleNotifTimeToggle = async (t: string) => {
    const next = notifTimes.includes(t) ? notifTimes.filter((x) => x !== t) : [...notifTimes, t];
    setNotifTimes(next);
    await saveNotifTimes(next);
  };

  const handleNotifAddCustom = async () => {
    const t = notifCustom.trim();
    if (!parseTime(t)) {
      showAlert({ type: 'warning', title: 'Giờ không hợp lệ', message: 'Nhập giờ theo định dạng HH:MM (ví dụ 07:30, 18:00).' });
      return;
    }
    const next = notifTimes.includes(t) ? notifTimes : [...notifTimes, t];
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
        showAlert({ type: 'warning', title: 'Quyền thông báo', message: 'Cần bật quyền thông báo cho TIN TỨC trước khi gửi thử.' });
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
      {/* Header gradient cam→đỏ đậm + dải 7 màu chủ đạo */}
      <LinearGradient
        colors={[Color.hot, Color.hotDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerIconBadge}>
            <Ionicons name="settings" size={22} color="#FFF" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Cài đặt</Text>
            <Text style={styles.headerSubtitle}>Tùy chỉnh AI, giọng đọc & dữ liệu</Text>
          </View>
        </View>
        <View style={styles.themeStrip}>
          {THEME_COLORS.map((t) => (
            <View key={t.key} style={[styles.themeStripSeg, { backgroundColor: t.color }]} />
          ))}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Provider + API Key + Endpoint + Model — ẩn mặc định, mở bằng mã bí mật */}
        {aiUnlocked && (
          <>
        {/* Provider Section */}
        <SectionHeader title="Nhà cung cấp AI" icon="cube" color={SECTION_COLORS.provider}>
          <View style={styles.providerGrid}>
            {PROVIDERS.map((p) => (
              <ProviderCard key={p.id} p={p} active={provider === p.id} onPress={() => setProvider(p.id)} />
            ))}
          </View>
        </SectionHeader>

        {/* API Key Section */}
        <SectionHeader title="API Key" icon="key" color={SECTION_COLORS.apiKey}>
          <Card>
            <Text style={styles.fieldLabel}>{cfg?.label || 'API'} Key</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="nvapi-..."
              placeholderTextColor={Color.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
            />
            <Text style={styles.fieldHint}>
              {cfg?.id === 'nvidia' && 'Lấy key miễn phí tại build.nvidia.com → Any model → Get API Key (1,000 req/ngày)'}
            </Text>

            {/* Test kết nối — gọi thật với request nhỏ nhất */}
            <TouchableOpacity
              style={[styles.testBtn, testing && styles.testBtnBusy]}
              onPress={handleTest}
              activeOpacity={0.8}
              disabled={testing}
            >
              {testing ? (
                <Ionicons name="sync" size={16} color={Color.accent} />
              ) : (
                <Ionicons name="flash" size={16} color={Color.accent} />
              )}
              <Text style={styles.testBtnText}>{testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}</Text>
            </TouchableOpacity>

            {testResult && (
              <View style={[styles.testResult, testResult.ok ? styles.testResultOk : styles.testResultFail]}>
                <Ionicons
                  name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={testResult.ok ? Color.success : Color.danger}
                />
                <Text style={[styles.testResultText, testResult.ok ? styles.testResultTextOk : styles.testResultTextFail]}>
                  {testResult.msg}
                </Text>
              </View>
            )}
          </Card>
        </SectionHeader>

        {/* Custom Base URL */}
        {showCustomUrl && (
          <SectionHeader title="Endpoint tùy chỉnh" icon="link" color={SECTION_COLORS.endpoint}>
            <Card>
              <Text style={styles.fieldLabel}>Base URL</Text>
              <TextInput
                style={styles.input}
                value={customBaseUrl}
                onChangeText={setCustomBaseUrl}
                placeholder="https://your-server.com/v1"
                placeholderTextColor={Color.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
              />
              <Text style={styles.fieldHint}>
                Ví dụ: http://localhost:1234/v1 (LM Studio), http://localhost:11434/v1 (Ollama)
              </Text>
            </Card>
          </SectionHeader>
        )}

        {/* Model Section */}
        <SectionHeader title="Model AI" icon="hardware-chip" color={SECTION_COLORS.model}>
          <Card>
            <TouchableOpacity
              style={styles.selectField}
              onPress={() => setModelOpen(!modelOpen)}
              activeOpacity={0.8}
            >
              <View style={styles.selectFieldLeft}>
                <View style={[styles.fieldIcon, { backgroundColor: SECTION_COLORS.model + '1A' }]}>
                  <Ionicons name="git-branch" size={16} color={SECTION_COLORS.model} />
                </View>
                <Text style={styles.selectFieldText} numberOfLines={1}>
                  {models.find((m) => m.id === model)?.label || model}
                </Text>
              </View>
              <Ionicons
                name={modelOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={Color.textMuted}
              />
            </TouchableOpacity>

            {modelOpen && (
              <View style={styles.selectDropdown}>
                {models.map((m) => (
                  <ModelItem
                    key={m.id}
                    item={m}
                    active={model === m.id}
                    onPress={() => { setModel(m.id); setModelOpen(false); }}
                  />
                ))}
              </View>
            )}
          </Card>
        </SectionHeader>
          </>
        )}

        {/* Voice Section */}
        <SectionHeader title="Giọng đọc tiếng Việt" icon="volume-high" color={SECTION_COLORS.voice}>
          <Card>
            {/* Pitch & Rate Steppers */}
            <View style={styles.stepperGroup}>
              <Stepper
                label="Cao độ (pitch)"
                value={pitch}
                min={0.5}
                max={2}
                step={0.1}
                onChange={(v) => setPitch(v)}
              />
              <Stepper
                label="Tốc độ (rate)"
                value={rate}
                min={0.5}
                max={1.5}
                step={0.1}
                onChange={(v) => setRate(v)}
              />
            </View>

            {/* Preview button */}
            <TouchableOpacity
              style={[styles.previewBtn, previewing && styles.previewBtnActive]}
              onPress={previewVoice}
              activeOpacity={0.8}
            >
              <Ionicons name={previewing ? 'stop-circle' : 'play-circle'} size={18} color="#FFF" />
              <Text style={styles.previewBtnText}>{previewing ? 'Đang phát...' : 'Nghe thử giọng đọc'}</Text>
            </TouchableOpacity>
            <Text style={styles.fieldHint}>Điện thoại đọc offline bằng giọng máy; trên web dùng giọng tiếng Việt của trình duyệt.</Text>
          </Card>
        </SectionHeader>

        {/* Thông báo Section — bản tin hằng ngày (local push) */}
        <SectionHeader title="Thông báo" icon="notifications" color={SECTION_COLORS.notif}>
          <Card>
            <View style={styles.appearanceRow}>
              <View style={styles.appearanceLeft}>
                <View style={[styles.fieldIcon, { backgroundColor: SECTION_COLORS.notif + '1A' }]}>
                  <Ionicons name={notifOn ? 'notifications' : 'notifications-outline'} size={16} color={SECTION_COLORS.notif} />
                </View>
                <View style={styles.appearanceTextWrap}>
                  <Text style={styles.fieldLabel}>Bản tin hằng ngày</Text>
                  <Text style={styles.fieldHint}>Gửi tin nổi bật mỗi ngày vào giờ đã chọn</Text>
                </View>
              </View>
              <Switch
                value={notifOn}
                onValueChange={handleNotifToggle}
                trackColor={{ false: Color.border, true: SECTION_COLORS.notif }}
                thumbColor="#FFF"
                disabled={!isNotifSupported}
                testID="notif-switch"
              />
            </View>

            {notifOn && (
              <>
                <Text style={styles.notifTimeLabel}>Giờ gửi (chọn nhiều khung giờ)</Text>
                <View style={styles.notifTimesRow}>
                  {NOTIF_TIMES.map((t) => {
                    const active = notifTimes.includes(t);
                    return (
                      <TouchableOpacity
                        key={t}
                        style={[styles.notifTimeChip, active && { backgroundColor: SECTION_COLORS.notif, borderColor: SECTION_COLORS.notif }]}
                        onPress={() => handleNotifTimeToggle(t)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.notifTimeText, active && styles.notifTimeTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Custom time */}
                <View style={styles.notifCustomRow}>
                  <TextInput
                    style={styles.notifCustomInput}
                    value={notifCustom}
                    onChangeText={setNotifCustom}
                    placeholder="HH:MM"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    maxLength={5}
                    onSubmitEditing={handleNotifAddCustom}
                  />
                  <TouchableOpacity style={[styles.notifAddBtn, { backgroundColor: SECTION_COLORS.notif }]} onPress={handleNotifAddCustom} activeOpacity={0.8}>
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={styles.notifAddBtnText}>Thêm</Text>
                  </TouchableOpacity>
                </View>

                {/* Custom chips đã thêm (bấm X để xóa) */}
                {notifTimes.filter((t) => !NOTIF_TIMES.includes(t)).length > 0 && (
                  <View style={styles.notifTimesRow}>
                    {notifTimes.filter((t) => !NOTIF_TIMES.includes(t)).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.notifTimeChip, styles.notifCustomChip, { backgroundColor: SECTION_COLORS.notif, borderColor: SECTION_COLORS.notif }]}
                        onPress={() => handleNotifTimeToggle(t)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.notifTimeTextActive}>{t}</Text>
                        <Ionicons name="close" size={13} color="#FFF" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}

            <TouchableOpacity
              style={[styles.previewBtn, { backgroundColor: SECTION_COLORS.notif }, notifSending && styles.testBtnBusy]}
              onPress={handleNotifTest}
              activeOpacity={0.8}
              disabled={!isNotifSupported || notifSending}
            >
              <Ionicons name="paper-plane" size={16} color="#FFF" />
              <Text style={styles.previewBtnText}>{notifSending ? 'Đang gửi...' : 'Gửi thông báo thử'}</Text>
            </TouchableOpacity>

            {!isNotifSupported && (
              <Text style={styles.fieldHint}>Thông báo không hỗ trợ trên web và trong Expo Go — dùng bản APK cài trực tiếp để bật.</Text>
            )}
          </Card>
        </SectionHeader>

        {/* Appearance Section — giao diện sáng/tối */}
        <SectionHeader title="Giao diện" icon="moon" color={SECTION_COLORS.security}>
          <Card>
            <View style={styles.appearanceRow}>
              <View style={styles.appearanceLeft}>
                <View style={[styles.fieldIcon, { backgroundColor: SECTION_COLORS.security + '1A' }]}>
                  <Ionicons name={darkMode ? 'moon' : 'sunny'} size={16} color={SECTION_COLORS.security} />
                </View>
                <View style={styles.appearanceTextWrap}>
                  <Text style={styles.fieldLabel}>Chế độ tối</Text>
                  <Text style={styles.fieldHint}>{darkMode ? 'Đang bật' : 'Đang tắt'}</Text>
                </View>
              </View>
              <Switch
                value={darkMode}
                onValueChange={(v) => { setDarkMode(v); setThemeMode(v ? 'dark' : 'light'); }}
                trackColor={{ false: Color.border, true: Color.hot }}
                thumbColor="#FFF"
                testID="dark-mode-switch"
              />
            </View>
          </Card>
        </SectionHeader>

        {/* Save Button */}
        <View style={styles.saveWrapper}>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saved}
          >
            <LinearGradient
              colors={saved ? [Color.success, Color.success] : [Color.hot, Color.hotDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveBtnGradient}
            >
              <Ionicons name={saved ? 'checkmark-circle' : 'save'} size={18} color="#FFF" />
              <Text style={styles.saveBtnText}>{saved ? 'Đã lưu' : 'Lưu cài đặt'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// Helper components khai báo ở module scope — định nghĩa trong thân component
// khiến React remount cả subtree mỗi lần render (TextInput mất focus khi gõ).
function SectionHeader({ title, icon, color, children }: { title: string; icon: string; color: string; children: React.ReactNode }) {
  const styles = makeStyles(useTheme());
  return (
    <View style={styles.section}>
      {/* Header section đồng bộ Home: thanh màu + icon vuông nhỏ + title + vạch kẻ */}
      <View style={styles.sectionRow}>
        <View style={[styles.sectionBar, { backgroundColor: color }]} />
        <View style={[styles.sectionIcon, { backgroundColor: color }]}>
          <Ionicons name={icon as any} size={12} color="#FFF" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionLine} />
      </View>
      {children}
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const styles = makeStyles(useTheme());
  return <View style={[styles.card, style]}>{children}</View>;
}

function ModelItem({ item, active, onPress }: { item: { id: string; label: string }; active: boolean; onPress: () => void }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <TouchableOpacity
      style={[styles.listItem, active && styles.listItemActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.listItemDot, active && styles.listItemDotActive]} />
      <Text style={[styles.listItemText, active && styles.listItemTextActive]} numberOfLines={1}>{item.label}</Text>
      {active && <Ionicons name="checkmark" size={18} color={C.hot} />}
    </TouchableOpacity>
  );
}

function ProviderCard({ p, active, onPress }: { p: typeof PROVIDERS[0]; active: boolean; onPress: () => void }) {
  const C = useTheme();
  const styles = makeStyles(C);
  return (
    <TouchableOpacity
      style={[styles.providerCard, active && styles.providerCardActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.providerCardIcon, active && styles.providerCardIconActive]}>
        <Ionicons name={PROVIDER_ICONS[p.id] as any} size={20} color={active ? '#FFF' : C.hot} />
      </View>
      <View style={styles.providerCardContent}>
        <Text style={[styles.providerCardLabel, active && styles.providerCardLabelActive]} numberOfLines={1}>{p.label}</Text>
        <Text style={[styles.providerCardDesc, active && styles.providerCardDescActive]}>{p.models.length} models</Text>
      </View>
      {active && <Ionicons name="checkmark-circle" size={18} color="#FFF" />}
    </TouchableOpacity>
  );
}

// Stepper component
function Stepper({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const C = useTheme();
  const styles = makeStyles(C);
  const increment = () => {
    const next = Math.round((value + step) * 10) / 10;
    if (next <= max) onChange(next);
  };
  const decrement = () => {
    const next = Math.round((value - step) * 10) / 10;
    if (next >= min) onChange(next);
  };

  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControl}>
        <TouchableOpacity style={styles.stepperBtn} onPress={decrement} activeOpacity={0.6} disabled={value <= min}>
          <Ionicons name="remove" size={18} color={value <= min ? C.textMuted : C.hot} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value.toFixed(1)}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={increment} activeOpacity={0.6} disabled={value >= max}>
          <Ionicons name="add" size={18} color={value >= max ? C.textMuted : C.hot} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → khối styles tự nhận màu
// theo dark/light mà không phải sửa từng `Color.X`
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },
  content: { padding: 16, paddingBottom: 120 },

  // Header gradient kiểu Kenh14
  header: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  headerIconBadge: {
    width: 42,
    height: 42,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: Font.hero, fontWeight: '800', color: '#FFF' },
  headerSubtitle: { fontSize: Font.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  themeStrip: { flexDirection: 'row', marginHorizontal: -16, height: 4 },
  themeStripSeg: { flex: 1 },

  // Sections — header kiểu Home (thanh màu + icon vuông + title + vạch kẻ), màu riêng từng mục
  section: { marginTop: 20 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionBar: { width: 4, height: 16, borderRadius: 2, marginRight: 8 },
  sectionIcon: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: Color.text, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 10 },

  // Cards — nền surface, radius md đồng bộ card Home, border mỏng + shadow nhẹ
  card: {
    backgroundColor: Color.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Color.border,
    padding: 16,
    ...Shadow.card,
  },

  // Labels & hints
  fieldLabel: { fontSize: Font.caption, fontWeight: '600', color: Color.text, marginBottom: 8 },
  fieldHint: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 8, lineHeight: 18 },

  // Test kết nối
  testBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: Radius.sm,
    backgroundColor: Color.accentSoft,
    borderWidth: 1,
    borderColor: Color.accent,
  },
  testBtnBusy: { opacity: 0.6 },
  testBtnText: { color: Color.accent, fontWeight: '700', fontSize: Font.caption },
  testResult: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: Radius.sm,
  },
  testResultOk: { backgroundColor: Color.successSoft },
  testResultFail: { backgroundColor: Color.dangerSoft },
  testResultText: { flex: 1, fontSize: Font.tiny, lineHeight: 18 },
  testResultTextOk: { color: Color.success, fontWeight: '600' },
  testResultTextFail: { color: Color.danger, fontWeight: '600' },

  // Input
  input: {
    borderWidth: 1,
    borderColor: Color.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: Font.body,
    backgroundColor: Color.surfaceAlt,
    color: Color.text,
  },

  // Provider grid
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  providerCard: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Color.card,
    borderWidth: 1,
    borderColor: Color.border,
    gap: 10,
    ...Shadow.card,
  },
  providerCardActive: {
    backgroundColor: Color.hot,
    borderColor: Color.hot,
    ...Shadow.button,
  },
  providerCardIcon: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Color.hotSoft, alignItems: 'center', justifyContent: 'center' },
  providerCardIconActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  providerCardContent: { flex: 1, minWidth: 0 },
  providerCardLabel: { fontSize: Font.body, fontWeight: '600', color: Color.text },
  providerCardLabelActive: { color: '#FFF' },
  providerCardDesc: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 2 },
  providerCardDescActive: { color: 'rgba(255,255,255,0.7)' },

  // Select field (dropdown trigger)
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: Radius.sm,
    backgroundColor: Color.surfaceAlt,
    borderWidth: 1,
    borderColor: Color.border,
  },
  selectFieldLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  selectFieldText: { fontSize: Font.body, fontWeight: '500', color: Color.text, flex: 1 },
  fieldIcon: { width: 30, height: 30, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },

  // Dropdown list
  selectDropdown: {
    marginTop: 8,
    borderRadius: Radius.sm,
    backgroundColor: Color.card,
    borderWidth: 1,
    borderColor: Color.border,
    overflow: 'hidden',
  },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  listItemActive: { backgroundColor: Color.hotSoft },
  listItemDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: Color.border },
  listItemDotActive: { borderColor: Color.hot, backgroundColor: Color.hot },
  listItemText: { fontSize: Font.body, color: Color.text, flex: 1 },
  listItemTextActive: { color: Color.hot, fontWeight: '600' },

  // Stepper group
  stepperGroup: { gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
  stepperLabel: { fontSize: Font.body, color: Color.textSecondary, flex: 1 },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Color.skeleton, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: Font.headline, fontWeight: '700', color: Color.text, minWidth: 36, textAlign: 'center' },

  // Preview button
  previewBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    backgroundColor: Color.hot,
  },
  previewBtnActive: { backgroundColor: Color.danger },
  previewBtnText: { color: '#FFF', fontWeight: '600', fontSize: Font.caption },

  // Appearance row (dark mode switch)
  appearanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appearanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  appearanceTextWrap: { flex: 1 },

  // Thông báo — giờ gửi chips
  notifTimeLabel: { fontSize: Font.caption, fontWeight: '700', color: Color.text, marginTop: 14, marginBottom: 8 },
  notifTimesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notifTimeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Color.surfaceAlt,
    borderWidth: 1,
    borderColor: Color.border,
  },
  notifTimeText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  notifTimeTextActive: { color: '#FFF', fontWeight: '700' },
  notifCustomRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  notifCustomInput: {
    flex: 1, borderWidth: 1, borderColor: Color.border, borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 9, fontSize: Font.body, backgroundColor: Color.surfaceAlt, color: Color.text,
  },
  notifAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 16, borderRadius: Radius.sm },
  notifAddBtnText: { color: '#FFF', fontWeight: '700', fontSize: Font.caption },
  notifCustomChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Save button — gradient cam→đỏ
  saveWrapper: { paddingTop: 24, paddingBottom: 16 },
  saveBtn: { borderRadius: Radius.md, overflow: 'hidden', ...Shadow.button },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: Font.body, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);
