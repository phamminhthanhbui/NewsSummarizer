import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SummaryRecord } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';
import { KEYS } from '../services/storage';
import { SOURCE_COLORS } from '../services/feeds';

export default function HistoryScreen({ navigation }: any) {
  const [items, setItems] = useState<SummaryRecord[]>([]);
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const styles = makeStyles(C); // styles động theo dark mode

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
      {/* Header — tiêu đề + vạch màu, nút xoá dạng pill tint */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.titleBar} />
          <Text style={styles.title}>Lịch sử tóm tắt</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={14} color={Color.hot} />
            <Text style={styles.clearText}>Xoá tất cả</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(item, i) => `${item.url}-${i}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const srcColor = SOURCE_COLORS[item.source] || Color.hot;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => handlePressItem(item)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.srcBadge, { backgroundColor: srcColor }]}>
                  <Text style={styles.srcText} numberOfLines={1}>{item.source}</Text>
                </View>
                <View style={styles.dateRow}>
                  <Ionicons name="time-outline" size={12} color={C.textMuted} />
                  <Text style={styles.dim}>{new Date(item.date).toLocaleString('vi-VN')}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardSummary} numberOfLines={3}>{item.summary}</Text>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyBadge}>
              <Ionicons name="document-text-outline" size={32} color={C.textMuted} />
            </View>
            <Text style={styles.emptyText}>Chưa có lịch sử tóm tắt</Text>
            <Text style={styles.emptySub}>Mở bài báo đầu tiên để bắt đầu tóm tắt</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },

  // Header — tiêu đề + vạch màu
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleBar: { width: 4, height: 22, borderRadius: 2, backgroundColor: Color.hot },
  title: { fontSize: Font.title, fontWeight: '800', color: Color.text, letterSpacing: -0.2 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Color.hotSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  clearText: { fontSize: Font.caption, color: Color.hot, fontWeight: '700' },

  // List
  listContent: { padding: 12, paddingBottom: 24 },
  separator: { height: 10 },

  // Card — cùng ngôn ngữ với card Home: nền surface, radius md, shadow nhẹ
  card: {
    backgroundColor: Color.card,
    padding: 14,
    borderRadius: Radius.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
      default: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    }),
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  srcBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, maxWidth: 150 },
  srcText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0, marginLeft: 8 },
  dim: { fontSize: Font.tiny, color: Color.textMuted },

  cardTitle: { fontSize: Font.headline, fontWeight: '800', color: Color.text, lineHeight: 22, marginBottom: 6 },
  cardSummary: { fontSize: Font.caption, color: Color.textSecondary, lineHeight: 19 },

  // Empty — cùng kiểu với empty Home
  empty: { paddingTop: 96, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  emptyBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 17, fontWeight: '700', color: Color.text },
  emptySub: { fontSize: 13, color: Color.textMuted, textAlign: 'center' },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);
