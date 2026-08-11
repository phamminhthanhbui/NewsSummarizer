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
import { PROVIDERS, type LLMProvider, getModelsForProvider } from '../services/summarize';
import { KEYS } from '../services/storage';
import { speakEdge, revokeAudioUrl, type EdgeGender } from '../services/edgeTts';
import { Color, Font, Radius, Shadow } from '../constants/theme';

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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
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
    if (isWeb) {
      speechSynthesis.cancel();
      webUtteranceRef.current = null;
    } else if (audioRef.current) {
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
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.rate = rate;
        utterance.pitch = pitch;

        const voices = speechSynthesis.getVoices();
        const voiceName = gender === 'nam' ? 'Nam Minh' : 'Hoai My';
        const matched = voices.find((v) => v.name.includes(voiceName) || v.lang === 'vi-VN');
        if (matched) utterance.voice = matched;

        utterance.onend = () => {
          setPreviewing(false);
          webUtteranceRef.current = null;
        };
        utterance.onerror = (e) => {
          console.error('[Web Speech] error:', e);
          setPreviewing(false);
          webUtteranceRef.current = null;
        };
        webUtteranceRef.current = utterance;
        speechSynthesis.speak(utterance);

        setTimeout(() => {
          if (previewing) {
            stopAudio();
            setPreviewing(false);
          }
        }, 15000);
      } else {
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
        setTimeout(() => {
          if (previewing) {
            stopAudio();
            setPreviewing(false);
          }
        }, 15000);
      }
    } catch (e) {
      console.error('[Edge TTS] error:', e);
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

  // Helper: render section header
  const SectionHeader = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={18} color={Color.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );

  // Helper: card wrapper
  const Card = ({ children, style, ...props }: { children: React.ReactNode; style?: any; [key: string]: any }) => (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );

  // Model picker item
  const ModelItem = ({ item, active, onPress }: { item: { id: string; label: string }; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.listItem, active && styles.listItemActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.listItemLeft}>
        <View style={[styles.listItemDot, active && styles.listItemDotActive]} />
      </View>
      <Text style={[styles.listItemText, active && styles.listItemTextActive]} numberOfLines={1}>{item.label}</Text>
      {active && <Ionicons name="checkmark" size={18} color={Color.primary} />}
    </TouchableOpacity>
  );

  // Provider card
  const ProviderCard = ({ p, active, onPress }: { p: typeof PROVIDERS[0]; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.providerCard, active && styles.providerCardActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={styles.providerCardIcon}>
        <Ionicons name={PROVIDER_ICONS[p.id] as any} size={24} color={active ? '#FFF' : Color.primary} />
      </View>
      <View style={styles.providerCardContent}>
        <Text style={[styles.providerCardLabel, active && styles.providerCardLabelActive]}>{p.label}</Text>
        <Text style={[styles.providerCardDesc, active && styles.providerCardDescActive]}>{p.models.length} models</Text>
      </View>
      {active && <View style={styles.providerCardCheck}><Ionicons name="checkmark" size={18} color="#FFF" /></View>}
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cài đặt</Text>
        <Text style={styles.headerSubtitle}>Tùy chỉnh AI, giọng đọc & dữ liệu</Text>
      </View>

      {/* Provider Section */}
      <SectionHeader title="Nhà cung cấp AI" icon="cube">
        <View style={styles.providerGrid}>
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.id} p={p} active={provider === p.id} onPress={() => setProvider(p.id)} />
          ))}
        </View>
      </SectionHeader>

      {/* API Key Section */}
      <SectionHeader title="API Key" icon="key">
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
        </Card>
      </SectionHeader>

      {/* Custom Base URL */}
      {showCustomUrl && (
        <SectionHeader title="Endpoint tùy chỉnh" icon="link">
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
      <SectionHeader title="Model AI" icon="cpu">
        <Card>
          <TouchableOpacity
            style={styles.selectField}
            onPress={() => setModelOpen(!modelOpen)}
            activeOpacity={0.8}
          >
            <View style={styles.selectFieldLeft}>
              <Ionicons name="git-branch" size={18} color={Color.textMuted} />
              <Text style={styles.selectFieldText}>
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
      <SectionHeader title="Giọng đọc tiếng Việt (Cloud)" icon="volume-high">
        <Card>
          {/* Gender selector */}
          <TouchableOpacity
            style={styles.selectField}
            onPress={() => setVoiceOpen(!voiceOpen)}
            activeOpacity={0.8}
          >
            <View style={styles.selectFieldLeft}>
              <View style={[styles.genderIcon, { backgroundColor: gender === 'nam' ? Color.accent + '20' : '#E91E6320' }]}>
                <Ionicons
                  name={gender === 'nam' ? 'male' : 'female'}
                  size={18}
                  color={gender === 'nam' ? Color.accent : '#E91E63'}
                />
              </View>
              <Text style={styles.selectFieldText}>
                {gender === 'nam' ? 'Giọng nam (Nam Minh)' : 'Giọng nữ (Hoài My)'}
              </Text>
            </View>
            <Ionicons name={voiceOpen ? 'chevron-up' : 'chevron-down'} size={20} color={Color.textMuted} />
          </TouchableOpacity>

          {voiceOpen && (
            <View style={styles.selectDropdown}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g.key}
                  style={[styles.listItem, gender === g.key && styles.listItemActive]}
                  onPress={() => { setGender(g.key); setVoiceOpen(false); }}
                  activeOpacity={0.6}
                >
                  <View style={styles.listItemLeft}>
                    <View style={[styles.listItemDot, gender === g.key && styles.listItemDotActive]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Ionicons name={g.icon as any} size={18} color={gender === g.key ? Color.primary : Color.textSecondary} style={{ marginRight: 10 }} />
                    <Text style={[styles.listItemText, gender === g.key && styles.listItemTextActive]}>{g.label}</Text>
                  </View>
                  {gender === g.key && <Ionicons name="checkmark" size={18} color={Color.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

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
      <SectionHeader title="Dữ liệu" icon="trash">
        <Card style={styles.dangerCard}>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleClear} activeOpacity={0.7}>
            <Ionicons name="trash" size={18} color={Color.danger} />
            <Text style={styles.dangerBtnText}>Xoá tất cả cài đặt</Text>
          </TouchableOpacity>
          <Text style={styles.fieldHint}>Xoá API key, model, giọng đọc. Không xoá bài đã lưu & lịch sử.</Text>
        </Card>
      </SectionHeader>

      {/* Save Button */}
      <View style={styles.saveWrapper}>
        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.saveBtnSaved]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={saved}
        >
          {saved ? (
            <Ionicons name="checkmark" size={18} color="#FFF" />
          ) : (
            <>
              <Ionicons name="save" size={18} color="#FFF" />
              <Text style={styles.saveBtnText}>Lưu cài đặt</Text>
            </>
          )}
          {saved && <Text style={styles.saveBtnText}>Đã lưu</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
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
          <Ionicons name="remove" size={18} color={value <= min ? Color.textMuted : Color.primary} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value.toFixed(1)}</Text>
        <TouchableOpacity style={styles.stepperBtn} onPress={increment} activeOpacity={0.6} disabled={value >= max}>
          <Ionicons name="add" size={18} color={value >= max ? Color.textMuted : Color.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },
  content: { padding: 16, paddingBottom: 100 },

  // Header
  header: { marginBottom: 24 },
  headerTitle: { fontSize: Font.hero, fontWeight: '800', color: Color.text },
  headerSubtitle: { fontSize: Font.caption, color: Color.textMuted, marginTop: 4 },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: Font.headline, fontWeight: '700', color: Color.text },

  // Cards
  card: {
    backgroundColor: Color.card,
    borderRadius: Radius.xl,
    padding: 16,
    ...Shadow.card,
  },
  dangerCard: { borderWidth: 1, borderColor: Color.danger + '30' },

  // Labels & hints
  fieldLabel: { fontSize: Font.caption, fontWeight: '600', color: Color.text, marginBottom: 8 },
  fieldHint: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 8, lineHeight: 18 },

  // Input
  input: {
    borderWidth: 1,
    borderColor: Color.border,
    borderRadius: Radius.md,
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
    flex: 1,
    minWidth: '45%',
    maxWidth: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Color.surfaceAlt,
    borderWidth: 1,
    borderColor: Color.border,
    gap: 10,
  },
  providerCardActive: {
    backgroundColor: Color.primary,
    borderColor: Color.primary,
  },
  providerCardIcon: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Color.primarySoft, alignItems: 'center', justifyContent: 'center' },
  providerCardContent: { flex: 1, minWidth: 0 },
  providerCardLabel: { fontSize: Font.body, fontWeight: '600', color: Color.text },
  providerCardLabelActive: { color: '#FFF' },
  providerCardDesc: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 2 },
  providerCardDescActive: { color: 'rgba(255,255,255,0.7)' },
  providerCardCheck: { padding: 4 },

  // Select field (dropdown trigger)
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: Radius.md,
    backgroundColor: Color.surfaceAlt,
    borderWidth: 1,
    borderColor: Color.border,
  },
  selectFieldLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectFieldText: { fontSize: Font.body, fontWeight: '500', color: Color.text, flex: 1 },

  // Dropdown list
  selectDropdown: {
    marginTop: 8,
    borderRadius: Radius.md,
    backgroundColor: Color.card,
    borderWidth: 1,
    borderColor: Color.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  listItemActive: { backgroundColor: Color.primarySoft },
  listItemLeft: { width: 24, alignItems: 'center' },
  listItemDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: Color.border },
  listItemDotActive: { borderColor: Color.primary, backgroundColor: Color.primary },
  listItemText: { fontSize: Font.body, color: Color.text, flex: 1 },
  listItemTextActive: { color: Color.primary, fontWeight: '600' },

  // Gender icon circle
  genderIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // Stepper group
  stepperGroup: { marginTop: 12, gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
  stepperLabel: { fontSize: Font.body, color: Color.textSecondary, flex: 1 },
  stepperControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Color.skeleton, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: Font.headline, fontWeight: '700', color: Color.text, minWidth: 36, textAlign: 'center' },

  // Preview button
  previewBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Color.primary,
  },
  previewBtnActive: { backgroundColor: Color.danger },
  previewBtnText: { color: '#FFF', fontWeight: '600', fontSize: Font.caption },

  // Danger button
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dangerBtnText: { color: Color.danger, fontWeight: '600', fontSize: Font.body },

  // Save button
  saveWrapper: { paddingTop: 8, paddingBottom: 40 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: Radius.md,
    backgroundColor: Color.primary,
    ...Shadow.button,
  },
  saveBtnSaved: { backgroundColor: Color.success },
  saveBtnText: { color: '#FFF', fontWeight: '600', fontSize: Font.body },
});