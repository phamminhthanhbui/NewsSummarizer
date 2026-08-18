import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { PROVIDERS, type LLMProvider, getModelsForProvider, testProviderConnection } from '../services/summarize';
import { KEYS } from '../services/storage';
import { speakEdge, revokeAudioUrl, resolveWebVoice, markWebVoiceHung, isWebVoiceHung, type EdgeGender } from '../services/edgeTts';
import { Color, Font, Shadow, THEME_COLORS } from '../constants/theme';

const isWeb = Platform.OS === 'web';

const GENDERS: { key: EdgeGender; label: string; icon: string }[] = [
  { key: 'nu', label: 'Giọng nữ (Hoài My)', icon: 'female' },
  { key: 'nam', label: 'Giọng nam (Nam Minh)', icon: 'male' },
];

const PROVIDER_ICONS: Record<LLMProvider, string> = {
  nvidia: 'cube',
  openai: 'logo-github',
  anthropic: 'flame',
  google: 'logo-google',
  openrouter: 'globe',
  custom: 'settings',
};

// Màu nhận diện từng section — lấy trong 7 màu chủ đạo (THEME_COLORS)
const SECTION_COLORS = {
  provider: '#7C3AED', // Tím
  apiKey: '#2563EB',   // Xanh biển
  endpoint: '#D97706', // Vàng đồng
  model: '#059669',    // Xanh lá
  voice: '#DB2777',    // Hồng
  data: '#DC2626',     // Đỏ thời sự
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [provider, setProvider] = useState<LLMProvider>('nvidia');
  const [apiKey, setApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saved, setSaved] = useState(false);
  const [gender, setGender] = useState<EdgeGender>('nu');
  const [pitch, setPitch] = useState(1.0);
  const [rate, setRate] = useState(1.0);
  const [previewing, setPreviewing] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const audioRef = useRef<Audio.Sound | null>(null);
  const webUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cfg = PROVIDERS.find((p) => p.id === provider);
  const models = getModelsForProvider(provider);
  const keyStorageKey = cfg?.keyStorageKey || 'apiKey';
  const showCustomUrl = cfg?.supportsCustomUrl;

  useEffect(() => {
    AsyncStorage.getItem(KEYS.provider).then((val) => {
      if (val && PROVIDERS.some((p) => p.id === val)) {
        setProvider(val as LLMProvider);
      }
    });
    AsyncStorage.getItem(keyStorageKey).then((val) => val && setApiKey(val));
    AsyncStorage.getItem(KEYS.customBaseUrl).then((val) => val && setCustomBaseUrl(val));
    AsyncStorage.getItem(KEYS.model).then((val) => val && setModel(val));
    AsyncStorage.getItem(KEYS.voiceGender).then((val) => {
      if (val === 'nam' || val === 'nu') setGender(val);
    });
    AsyncStorage.getItem(KEYS.pitch).then((val) => setPitch(parseFloat(val || '') || 1.0));
    AsyncStorage.getItem(KEYS.rate).then((val) => setRate(parseFloat(val || '') || 1.0));
  }, []);

  useEffect(() => {
    const m = models[0]?.id || '';
    setModel(m);
    AsyncStorage.getItem(cfg?.keyStorageKey || 'apiKey').then((val) => setApiKey(val || ''));
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
    await AsyncStorage.setItem(KEYS.voiceGender, gender);
    await AsyncStorage.setItem(KEYS.pitch, String(pitch));
    await AsyncStorage.setItem(KEYS.rate, String(rate));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const stopAudio = () => {
    // Web có thể dùng Web Speech HOẶC Edge TTS fallback → dừng cả 2 đường
    if (isWeb) {
      speechSynthesis.cancel();
      webUtteranceRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.stopAsync();
      audioRef.current.unloadAsync();
      audioRef.current = null;
    }
  };

  const previewVoice = async () => {
    if (previewing) {
      stopAudio();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      const text = 'Xin chào, đây là giọng đọc tin tức tiếng Việt.';
      if (isWeb) {
        // Browser có giọng khớp gender và chưa từng bị treo → Web Speech (offline, tức thì)
        const matched = isWebVoiceHung(gender) ? null : await resolveWebVoice(gender);
        if (matched) {
          // Start-guard: một số giọng bị treo (không onstart/onend/onerror) →
          // nếu không bắt đầu phát trong 1.2s thì hủy và fall through xuống Edge TTS.
          const started = await new Promise<boolean>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'vi-VN';
            utterance.rate = rate;
            utterance.pitch = pitch;
            utterance.voice = matched;
            let decided = false; // guard đã quyết định chưa (started | timeout)
            const guard = setTimeout(() => {
              if (!decided) { decided = true; try { speechSynthesis.cancel(); } catch {} resolve(false); }
            }, 1200);
            const cleanup = () => { setPreviewing(false); webUtteranceRef.current = null; };
            utterance.onstart = () => { if (!decided) { decided = true; clearTimeout(guard); resolve(true); } };
            utterance.onend = () => { clearTimeout(guard); cleanup(); if (!decided) { decided = true; resolve(true); } };
            // Lỗi hay 'interrupted'/'canceled' (bị cancel đè) → resolve(false):
            // fall through Edge TTS thay vì im lặng hoặc alert oan.
            utterance.onerror = () => { clearTimeout(guard); cleanup(); if (!decided) { decided = true; resolve(false); } };
            webUtteranceRef.current = utterance;
            // Cancel + chờ engine xả queue trước khi speak: cancel() xong speak()
            // liền tay trên Chrome/Edge dính race — utterance mới bị hủy nhầm hoặc
            // engine kẹt, onstart không kích hoạt → guard 1.2s → Edge TTS chậm.
            speechSynthesis.cancel();
            setTimeout(() => {
              if (decided) return;
              try { speechSynthesis.speak(utterance); }
              catch { if (!decided) { decided = true; clearTimeout(guard); resolve(false); } }
            }, 120);
          });
          if (started) {
            // Utterance tự kết thúc qua onend (cleanup). Timeout chỉ chặn treo giữa
            // chừng; kiểm tra ref thay vì state `previewing` (closure giữ giá trị cũ
            // = true → dừng nhầm UI đang đọc bình thường).
            setTimeout(() => {
              if (webUtteranceRef.current) {
                stopAudio();
                setPreviewing(false);
              }
            }, 15000);
            return;
          }
          // Giọng bị treo → ghi nhận để lần sau đi thẳng Edge TTS, khỏi chờ guard
          markWebVoiceHung(gender);
        }
        // Browser KHÔNG có giọng đúng (vd Chrome chỉ có giọng nam "Microsoft An")
        // → fall through xuống Edge TTS để đảm bảo đúng giọng đã chọn
      }

      // Edge TTS (native + web fallback khi browser thiếu giọng)
      setPreviewing(true); // có thể bị cleanup() của utterance bị cancel reset trước đó
      const url = await speakEdge(text, gender);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { volume: 1.0 },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPreviewing(false);
            revokeAudioUrl(url);
          }
        }
      );
      audioRef.current = sound;
      await sound.setRateAsync(rate, true);
      await sound.playAsync();
      // 60s: câu preview ngắn nhưng Edge TTS upstream có thể chậm; kết thúc thật
      // do didJustFinish xử lý. Kiểm tra ref thay vì state `previewing` (closure cũ).
      setTimeout(() => {
        if (audioRef.current) {
          stopAudio();
          setPreviewing(false);
        }
      }, 60000);
    } catch (e) {
      alert('Lỗi giọng đọc: ' + (e instanceof Error ? e.message : 'Unknown'));
      setPreviewing(false);
    }
  };

  const handleClear = async () => {
    await AsyncStorage.removeItem(KEYS.provider);
    await AsyncStorage.removeItem(keyStorageKey);
    await AsyncStorage.removeItem(KEYS.customBaseUrl);
    await AsyncStorage.removeItem(KEYS.model);
    setProvider('nvidia');
    setApiKey('');
    setCustomBaseUrl('');
    setModel(PROVIDERS[0].models[0].id);
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
              placeholder={cfg?.id === 'custom' ? 'API key (tùy chọn)' : 'sk-... / nvapi-...'}
              placeholderTextColor={Color.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
            />
            <Text style={styles.fieldHint}>
              {cfg?.id === 'nvidia' && 'Lấy key miễn phí tại build.nvidia.com → Any model → Get API Key (1,000 req/ngày)'}
              {cfg?.id === 'openai' && 'Tạo key tại platform.openai.com/api-keys'}
              {cfg?.id === 'anthropic' && 'Tạo key tại console.anthropic.com'}
              {cfg?.id === 'google' && 'Tạo key tại aistudio.google.com → Create API Key → Gemini API'}
              {cfg?.id === 'openrouter' && 'Tạo key tại openrouter.ai/keys → Hỗ trợ nhiều model free/paid'}
              {cfg?.id === 'custom' && 'Endpoint tương thích OpenAI (LM Studio, Ollama, vLLM, LocalAI)'}
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
        <SectionHeader title="Model AI" icon="cpu" color={SECTION_COLORS.model}>
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

        {/* Voice Section */}
        <SectionHeader title="Giọng đọc tiếng Việt" icon="volume-high" color={SECTION_COLORS.voice}>
          <Card>
            {/* Gender selector — 2 thẻ chọn trực tiếp, không dropdown */}
            <View style={styles.genderRow}>
              {GENDERS.map((g) => {
                const active = gender === g.key;
                const gColor = g.key === 'nam' ? Color.accent : '#DB2777';
                return (
                  <TouchableOpacity
                    key={g.key}
                    style={[
                      styles.genderCard,
                      active && { borderColor: gColor, backgroundColor: gColor + '14' },
                    ]}
                    onPress={() => setGender(g.key)}
                    activeOpacity={0.7}
                  >
                    {active ? (
                      <View style={[styles.genderCheck, { backgroundColor: gColor }]}>
                        <Ionicons name="checkmark" size={12} color="#FFF" />
                      </View>
                    ) : (
                      <View style={styles.genderCheckEmpty} />
                    )}
                    <View style={[styles.genderIcon, { backgroundColor: gColor + '20' }]}>
                      <Ionicons name={g.icon as any} size={20} color={gColor} />
                    </View>
                    <Text style={[styles.genderName, active && { color: gColor }]}>
                      {g.key === 'nam' ? 'Nam Minh' : 'Hoài My'}
                    </Text>
                    <Text style={styles.genderSub}>{g.key === 'nam' ? 'Giọng nam' : 'Giọng nữ'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

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
            <Text style={styles.fieldHint}>Edge TTS (Microsoft) — cloud, không cần cài đặt, cần internet.</Text>
          </Card>
        </SectionHeader>

        {/* Data Section */}
        <SectionHeader title="Dữ liệu" icon="trash" color={SECTION_COLORS.data}>
          <Card style={styles.dangerCard}>
            <TouchableOpacity style={styles.dangerBtn} onPress={handleClear} activeOpacity={0.7}>
              <View style={styles.dangerIconBadge}>
                <Ionicons name="trash" size={16} color={Color.danger} />
              </View>
              <Text style={styles.dangerBtnText}>Xoá tất cả cài đặt</Text>
            </TouchableOpacity>
            <Text style={styles.fieldHint}>Xoá API key, model, giọng đọc. Không xoá bài đã lưu & lịch sử.</Text>
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
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: color + '1A' }]}>
          <Ionicons name={icon as any} size={15} color={color} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function ModelItem({ item, active, onPress }: { item: { id: string; label: string }; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.listItem, active && styles.listItemActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.listItemDot, active && styles.listItemDotActive]} />
      <Text style={[styles.listItemText, active && styles.listItemTextActive]} numberOfLines={1}>{item.label}</Text>
      {active && <Ionicons name="checkmark" size={18} color={Color.hot} />}
    </TouchableOpacity>
  );
}

function ProviderCard({ p, active, onPress }: { p: typeof PROVIDERS[0]; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.providerCard, active && styles.providerCardActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.providerCardIcon, active && styles.providerCardIconActive]}>
        <Ionicons name={PROVIDER_ICONS[p.id] as any} size={20} color={active ? '#FFF' : Color.hot} />
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
          <Ionicons name="remove" size={18} color={value <= min ? Color.textMuted : Color.hot} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value.toFixed(1)}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={increment} activeOpacity={0.6} disabled={value >= max}>
          <Ionicons name="add" size={18} color={value >= max ? Color.textMuted : Color.hot} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 4,
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

  // Sections — icon badge màu riêng từng mục
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIcon: { width: 28, height: 28, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: Font.headline, fontWeight: '800', color: Color.text, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Cards — trắng, góc vuông, border mỏng + shadow nhẹ
  card: {
    backgroundColor: Color.card,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Color.border,
    padding: 16,
    ...Shadow.card,
  },
  dangerCard: { borderColor: Color.danger + '40' },

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
    borderRadius: 4,
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
    borderRadius: 4,
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
    borderRadius: 4,
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
    borderRadius: 4,
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
  providerCardIcon: { width: 36, height: 36, borderRadius: 4, backgroundColor: Color.hotSoft, alignItems: 'center', justifyContent: 'center' },
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
    borderRadius: 4,
    backgroundColor: Color.surfaceAlt,
    borderWidth: 1,
    borderColor: Color.border,
  },
  selectFieldLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  selectFieldText: { fontSize: Font.body, fontWeight: '500', color: Color.text, flex: 1 },
  fieldIcon: { width: 30, height: 30, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },

  // Dropdown list
  selectDropdown: {
    marginTop: 8,
    borderRadius: 4,
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

  // Gender selector — 2 thẻ chọn trực tiếp
  genderRow: { flexDirection: 'row', gap: 10 },
  genderCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 4,
    backgroundColor: Color.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Color.border,
    gap: 6,
  },
  genderCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderCheckEmpty: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: Color.border,
  },
  genderIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  genderName: { fontSize: Font.body, fontWeight: '700', color: Color.text, marginTop: 2 },
  genderSub: { fontSize: Font.tiny, color: Color.textMuted },

  // Stepper group
  stepperGroup: { marginTop: 14, gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
  stepperLabel: { fontSize: Font.body, color: Color.textSecondary, flex: 1 },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 36, height: 36, borderRadius: 4, backgroundColor: Color.skeleton, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: Font.headline, fontWeight: '700', color: Color.text, minWidth: 36, textAlign: 'center' },

  // Preview button
  previewBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: Color.hot,
  },
  previewBtnActive: { backgroundColor: Color.danger },
  previewBtnText: { color: '#FFF', fontWeight: '600', fontSize: Font.caption },

  // Danger button
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  dangerIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: Color.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: { color: Color.danger, fontWeight: '600', fontSize: Font.body },

  // Save button — gradient cam→đỏ
  saveWrapper: { paddingTop: 24, paddingBottom: 16 },
  saveBtn: { borderRadius: 4, overflow: 'hidden', ...Shadow.button },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  saveBtnText: { color: '#FFF', fontWeight: '700', fontSize: Font.body, textTransform: 'uppercase', letterSpacing: 0.5 },
});
