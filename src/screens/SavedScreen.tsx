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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = { navigation: NativeStackNavigationProp<any> };

export default function SavedScreen({ navigation }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(KEYS.saved).then((raw) => {
        setItems(raw ? JSON.parse(raw) : []);
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
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleBadge}>
            <Ionicons name="heart" size={18} color="#E53935" />
          </View>
          <Text style={styles.title}>Bài Đã Lưu</Text>
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
        keyExtractor={(item) => item.link}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, Shadow.card]} onPress={() => open(item)} activeOpacity={0.7}>
            {item.image ? (
              <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPh]}>
                <Ionicons name="image-outline" size={22} color={Color.textMuted} />
              </View>
            )}
            <View style={styles.cardBody}>
              <View style={styles.cardHeader}>
                <View style={styles.srcPill}>
                  <View style={styles.srcDot} />
                  <Text style={styles.source} numberOfLines={1}>{item.source}</Text>
                </View>
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
              <Ionicons name="heart" size={14} color="#E53935" />
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
    backgroundColor: '#FDEBEF',
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Color.card,
    padding: 12,
    borderRadius: Radius.xl,
  },
  thumb: { width: 80, height: 80, borderRadius: Radius.md, backgroundColor: Color.skeleton, marginRight: 12 },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, marginRight: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  srcPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Color.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Color.primary },
  source: { fontSize: Font.tiny, color: Color.primary, fontWeight: '700', letterSpacing: 0.3 },
  dim: { fontSize: Font.tiny, color: Color.textMuted },
  cardTitle: { fontSize: Font.body, fontWeight: '700', color: Color.text, lineHeight: 20 },

  // Remove button
  remove: { width: 32, height: 32, borderRadius: 16, backgroundColor: Color.surfaceAlt, alignItems: 'center', justifyContent: 'center' },

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