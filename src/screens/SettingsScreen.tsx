import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NIM_MODELS } from '../services/summarize';
import { KEYS } from '../services/storage';
import { Color, Font } from '../constants/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(NIM_MODELS[0].id);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEYS.apiKey).then((val) => val && setApiKey(val));
    AsyncStorage.getItem(KEYS.model).then((val) => val && setModel(val));
  }, []);

  const handleSave = async () => {
    await AsyncStorage.setItem(KEYS.apiKey, apiKey.trim());
    await AsyncStorage.setItem(KEYS.model, model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    Alert.alert('Xác nhận', 'Xoá API key và cài đặt đã lưu?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(KEYS.apiKey);
          await AsyncStorage.removeItem(KEYS.model);
          setApiKey('');
          setModel(NIM_MODELS[0].id);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
      <Text style={styles.title}>⚙ Cài đặt</Text>

      {/* API Key Card */}
      <View style={styles.card}>
        <Text style={styles.label}>NVIDIA NIM API Key</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="nvapi-..."
          placeholderTextColor={Color.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.hint}>
          Lấy key miễn phí tại{' '}
          <Text style={styles.link}>build.nvidia.com</Text>
          {'\n'}→ Any model → "Get API Key"
        </Text>
      </View>

      {/* Model Picker Card */}
      <View style={styles.card}>
        <Text style={styles.label}>Model AI</Text>
        {NIM_MODELS.map((m) => {
          const active = model === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.modelRow, active && styles.modelRowActive]}
              onPress={() => setModel(m.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.radio, active && styles.radioActive]}>
                {active && <View style={styles.radioDot} />}
              </View>
              <Text style={[styles.modelText, active && styles.modelTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* How to get key */}
      <View style={styles.card}>
        <Text style={styles.label}>Cách lấy API key NVIDIA</Text>
        <Text style={styles.body}>
          1. Vào build.nvidia.com{'\n'}
          2. Đăng nhập (có thể dùng Google){'\n'}
          3. Chọn model bất kỳ → Get API Key{'\n'}
          4. Copy key, dán vào đây{'\n'}
          5. Miễn phí 1,000 request/ngày
        </Text>
      </View>

      {/* Save / Clear buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.save, saved && styles.saveSaved]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveText}>{saved ? '✓ Đã lưu' : 'Lưu cài đặt'}</Text>
        </TouchableOpacity>
        {apiKey ? (
          <TouchableOpacity style={styles.clear} onPress={handleClear} activeOpacity={0.7}>
            <Text style={styles.clearText}>Xoá tất cả</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: Font.hero, fontWeight: '700', marginBottom: 20, color: Color.text },
  card: {
    backgroundColor: Color.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: Font.caption, fontWeight: '600', marginBottom: 10, color: Color.text },
  input: {
    borderWidth: 1,
    borderColor: Color.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: Font.body,
    backgroundColor: Color.bg,
    color: Color.text,
  },
  hint: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 6, lineHeight: 17 },
  link: { color: Color.accent },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: Color.bg,
  },
  modelRowActive: { backgroundColor: '#E8F0FE' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Color.textMuted,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioActive: { borderColor: Color.accent },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Color.accent,
  },
  modelText: { fontSize: Font.body, color: Color.textSecondary, flex: 1 },
  modelTextActive: { color: Color.accent, fontWeight: '600' },
  body: { fontSize: Font.body, lineHeight: 22, color: Color.textSecondary },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 40 },
  save: {
    flex: 1,
    backgroundColor: Color.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveSaved: { backgroundColor: Color.success },
  saveText: { color: '#FFF', fontWeight: '600', fontSize: Font.caption },
  clear: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Color.border,
    alignItems: 'center',
    backgroundColor: Color.card,
  },
  clearText: { color: Color.primary, fontWeight: '600', fontSize: Font.caption },
});