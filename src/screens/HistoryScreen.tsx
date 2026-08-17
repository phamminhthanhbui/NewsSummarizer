import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { SummaryRecord } from '../types';
import { Color, Font, Radius, Shadow } from '../constants/theme';
import { KEYS } from '../services/storage';

export default function HistoryScreen({ navigation }: any) {
  const [items, setItems] = useState<SummaryRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(KEYS.history).then((raw) => {
        if (!raw) return setItems([]);
        const all: SummaryRecord[] = JSON.parse(raw);
        const cleaned = all.filter((r) => (r.summary || '').trim().length > 0);
        if (cleaned.length !== all.length) {
          AsyncStorage.setItem(KEYS.history, JSON.stringify(cleaned));
        }
        setItems(cleaned);
      });
    }, []),
  );

  const handleClearAll = async () => {
    await AsyncStorage.removeItem(KEYS.history);
    setItems([]);
  };

  // Mở màn Article (summary cache hiện ngay, không gọi lại API) thay vì mở link gốc
  const handlePressItem = (item: SummaryRecord) => {
    // 'Article' nằm trong stack của HomeTab (nested navigator) — giống SavedScreen
    navigation.navigate('HomeTab', {
      screen: 'Article',
      params: { item: { title: item.title, link: item.url, description: item.summary, pubDate: item.date, source: item.source } },
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleBadge}>
            <Ionicons name="time-outline" size={18} color={Color.primary} />
          </View>
          <Text style={styles.title}>Lịch Sử Tóm Tắt</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={15} color={Color.primary} />
            <Text style={styles.clearText}>Xoá tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(item, i) => `${item.url}-${i}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, Shadow.card]}
            activeOpacity={0.7}
            onPress={() => handlePressItem(item)}
          >
            <View style={styles.cardHeader}>
              <View style={styles.srcPill}>
                <View style={styles.srcDot} />
                <Text style={styles.src} numberOfLines={1}>{item.source}</Text>
              </View>
              <Text style={styles.dim}>{new Date(item.date).toLocaleString('vi-VN')}</Text>
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>
            <View style={styles.cardFooter}>
              <Ionicons name="chevron-forward" size={16} color={Color.textMuted} />
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyBadge}>
              <Ionicons name="document-text-outline" size={36} color={Color.textMuted} />
            </View>
            <Text style={styles.emptyText}>Chưa có lịch sử tóm tắt</Text>
            <Text style={styles.emptySub}>Mở bài báo đầu tiên để bắt đầu tóm tắt</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleBadge: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Color.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: Font.hero, fontWeight: '800', color: Color.text },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Color.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  clearText: { fontSize: Font.caption, color: Color.primary, fontWeight: '700' },

  // List
  listContent: { padding: 16, paddingBottom: 24 },
  separator: { height: 10 },

  // Card
  card: {
    backgroundColor: Color.card,
    padding: 16,
    borderRadius: Radius.xl,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  srcPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Color.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Color.accent },
  src: { fontSize: Font.tiny, color: Color.accent, fontWeight: '700', letterSpacing: 0.3 },
  dim: { fontSize: Font.tiny, color: Color.textMuted },

  cardTitle: { fontSize: Font.headline, fontWeight: '700', color: Color.text, lineHeight: 22, marginBottom: 8 },
  cardSummary: { fontSize: Font.caption, color: Color.textSecondary, lineHeight: 19 },
  cardFooter: { marginTop: 12, alignItems: 'flex-end' },

  // Empty
  empty: { paddingTop: 120, alignItems: 'center', gap: 12 },
  emptyBadge: {
    width: 88,
    height: 88,
    borderRadius: 999,
    backgroundColor: Color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyText: { fontSize: 16, fontWeight: '700', color: Color.text },
  emptySub: { fontSize: Font.caption, color: Color.textMuted, textAlign: 'center', paddingHorizontal: 24 },
});