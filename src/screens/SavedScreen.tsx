import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { FeedItem } from '../types';
import { Color, Font, Radius, Shadow } from '../constants/theme';
import { KEYS } from '../services/storage';
import { fetchAllFeeds, SOURCE_COLORS } from '../services/feeds';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = { navigation: NativeStackNavigationProp<any> };

export default function SavedScreen({ navigation }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(KEYS.saved).then(async (raw) => {
        const saved: FeedItem[] = raw ? JSON.parse(raw) : [];
        setItems(saved);
        // Bản lưu cũ có thể thiếu image (hoặc image CDN hết hạn) → vá từ feed hiện tại
        if (saved.some((i) => !i.image)) {
          const feeds = await fetchAllFeeds().catch(() => [] as FeedItem[]);
          if (!feeds.length) return;
          const byLink = new Map(feeds.map((f) => [f.link, f]));
          const merged = saved.map((i) => {
            const f = byLink.get(i.link);
            return f?.image && !i.image ? { ...i, image: f.image } : i;
          });
          if (merged.some((m, idx) => m !== saved[idx])) {
            await AsyncStorage.setItem(KEYS.saved, JSON.stringify(merged));
            setItems(merged);
          }
        }
      });
    }, []),
  );

  const handleDelete = async (link: string) => {
    const next = items.filter((i) => i.link !== link);
    await AsyncStorage.setItem(KEYS.saved, JSON.stringify(next));
    setItems(next);
  };

  const handleClearAll = async () => {
    await AsyncStorage.removeItem(KEYS.saved);
    setItems([]);
  };

  const open = (item: FeedItem) =>
    navigation.navigate('HomeTab', { screen: 'Article', params: { item } });

  return (
    <View style={styles.container}>
      {/* Header — kiểu Kenh14: tiêu đề + vạch đỏ, nút outline vuông */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleBar} />
          <Text style={styles.title}>Bài đã lưu</Text>
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
        keyExtractor={(item) => item.link}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => open(item)} activeOpacity={0.7}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPh]}>
                <Ionicons name="image-outline" size={22} color={Color.textMuted} />
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <Text style={[styles.source, { color: SOURCE_COLORS[item.source] || Color.hot }]} numberOfLines={1}>{item.source}</Text>
                {item.pubDate && (
                  <Text style={styles.dim}>{new Date(item.pubDate).toLocaleString('vi-VN')}</Text>
                )}
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            </View>
            <TouchableOpacity
              style={styles.remove}
              onPress={() => handleDelete(item.link)}
              hitSlop={10}
              activeOpacity={0.6}
              accessibilityLabel="Bỏ lưu bài"
            >
              <Ionicons name="close" size={18} color={Color.textMuted} />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyBadge}>
              <Ionicons name="bookmark-outline" size={36} color={Color.textMuted} />
            </View>
            <Text style={styles.emptyText}>Chưa có bài đã lưu</Text>
            <View style={styles.emptyHintRow}>
              <Text style={styles.emptyHint}>Bấm</Text>
              <Ionicons name="heart" size={14} color={Color.danger} />
              <Text style={styles.emptyHint}>trong bài báo để lưu</Text>
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Color.card,
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Color.border,
  },
  thumb: { width: 84, height: 84, borderRadius: 4, backgroundColor: Color.skeleton, marginRight: 12 },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, marginRight: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  source: { fontSize: Font.tiny, color: Color.hot, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  dim: { fontSize: Font.tiny, color: Color.textMuted },
  cardTitle: { fontSize: Font.body, fontWeight: '700', color: Color.text, lineHeight: 20 },

  // Remove button
  remove: { width: 32, height: 32, borderRadius: 4, backgroundColor: Color.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

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
  emptyHintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  emptyHint: { fontSize: Font.caption, color: Color.textMuted },
});