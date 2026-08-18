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
import { Color, Font } from '../constants/theme';
import { KEYS } from '../services/storage';
import { SOURCE_COLORS } from '../services/feeds';

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
      {/* Header — kiểu Kenh14: tiêu đề + vạch đỏ, nút outline vuông */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleBar} />
          <Text style={styles.title}>Lịch sử tóm tắt</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={15} color={Color.hot} />
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
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => handlePressItem(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.src, { color: SOURCE_COLORS[item.source] || Color.hot }]} numberOfLines={1}>{item.source}</Text>
              <Text style={styles.dim}>{new Date(item.date).toLocaleString('vi-VN')}</Text>
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>
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

  // Header — tiêu đề + vạch đỏ kiểu Kenh14
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleBar: { width: 4, height: 22, borderRadius: 2, backgroundColor: Color.hot },
  title: { fontSize: Font.hero, fontWeight: '800', color: Color.text },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Color.hotSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: Color.hot,
  },
  clearText: { fontSize: Font.caption, color: Color.hot, fontWeight: '700' },

  // List
  listContent: { padding: 16, paddingBottom: 24 },
  separator: { height: 10 },

  // Card — trắng, góc vuông, border mỏng
  card: {
    backgroundColor: Color.card,
    padding: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Color.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  src: { fontSize: Font.tiny, color: Color.hot, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  dim: { fontSize: Font.tiny, color: Color.textMuted },

  cardTitle: { fontSize: Font.headline, fontWeight: '700', color: Color.text, lineHeight: 22, marginBottom: 6 },
  cardSummary: { fontSize: Font.caption, color: Color.textSecondary, lineHeight: 19 },

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