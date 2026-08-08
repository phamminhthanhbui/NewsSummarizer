import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SummaryRecord } from '../types';
import { Color, Font } from '../constants/theme';
import { KEYS } from '../services/storage';
import { useFocusEffect } from '@react-navigation/native';

export default function HistoryScreen() {
  const [items, setItems] = useState<SummaryRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(KEYS.history).then((raw) => {
        setItems(raw ? JSON.parse(raw) : []);
      });
    }, []),
  );

  const handleClearAll = () => {
    Alert.alert('Xác nhận', 'Xoá tất cả lịch sử tóm tắt?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá tất cả',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(KEYS.history);
          setItems([]);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📄 Lịch Sử Tóm Tắt</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearBtn}>Xoá tất cả</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item, i) => `${item.url}-${i}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => Linking.openURL(item.url)}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.cardSummary} numberOfLines={2}>{item.summary}</Text>
            <View style={styles.cardMeta}>
              <Text style={styles.src}>{item.source}</Text>
              <Text style={styles.dim}>
                {new Date(item.date).toLocaleString('vi-VN')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyText}>Chưa có lịch sử tóm tắt</Text>
            <Text style={styles.emptyHint}>Tóm tắt bài báo đầu tiên của bạn!</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  title: { fontSize: Font.hero, fontWeight: '700', color: Color.text },
  clearBtn: { fontSize: Font.caption, color: Color.primary, fontWeight: '600' },
  card: { backgroundColor: Color.card, marginHorizontal: 12, marginTop: 8, padding: 14, borderRadius: 10 },
  cardTitle: { fontSize: Font.body, fontWeight: '600', color: Color.text, lineHeight: 20, marginBottom: 4 },
  cardSummary: { fontSize: Font.caption, color: Color.textSecondary, lineHeight: 18, marginBottom: 6 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  src: { fontSize: Font.tiny, color: Color.primary, fontWeight: '700' },
  dim: { fontSize: Font.tiny, color: Color.textMuted },
  empty: { paddingTop: 80, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Color.text },
  emptyHint: { fontSize: Font.caption, color: Color.textMuted },
});