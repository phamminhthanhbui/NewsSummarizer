import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { FeedItem } from '../types';
import { Sans, Color, Radius, useTheme, Layout } from '../constants/theme';
import { KEYS } from '../services/storage';
import { fetchAllFeeds } from '../services/feeds';
import { LibraryTabs, ScreenHeader, Empty } from '../components/PremiumUI';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = { navigation: NativeStackNavigationProp<any> };
type Palette = typeof Color;

export default function SavedScreen({ navigation }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [query, setQuery] = useState('');
  const C = useTheme();
  const styles = makeStyles(C);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(KEYS.saved).then(async (raw) => {
      const saved: FeedItem[] = raw ? JSON.parse(raw) : [];
      setItems(saved);
      if (saved.some((item) => !item.image)) {
        const feeds = await fetchAllFeeds().catch(() => [] as FeedItem[]);
        if (!feeds.length) return;
        const byLink = new Map(feeds.map((feed) => [feed.link, feed]));
        const merged = saved.map((item) => {
          const feed = byLink.get(item.link);
          return feed?.image && !item.image ? { ...item, image: feed.image } : item;
        });
        if (merged.some((item, index) => item !== saved[index])) {
          await AsyncStorage.setItem(KEYS.saved, JSON.stringify(merged));
          setItems(merged);
        }
      }
    });
  }, []));

  const filtered = items.filter((item) => `${item.title} ${item.source}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const handleDelete = async (link: string) => {
    const next = items.filter((item) => item.link !== link);
    await AsyncStorage.setItem(KEYS.saved, JSON.stringify(next));
    setItems(next);
  };
  const handleClearAll = async () => {
    await AsyncStorage.removeItem(KEYS.saved);
    setItems([]);
  };
  const open = (item: FeedItem) => navigation.navigate('HomeTab', { screen: 'Article', params: { item } });

  return (
    <View style={styles.container} testID="savedScreen">
      <ScreenHeader
        title="Thư viện"
        subtitle={`${items.length} bài đã lưu`}
        action={items.length ? <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}><Ionicons name="trash-outline" size={16} color={C.danger} /><Text style={styles.clearText}>Xóa tất cả</Text></TouchableOpacity> : null}
      />
      <View style={styles.tabsWrap}><LibraryTabs active="Saved" navigation={navigation} /></View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.link}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={C.textMuted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Tìm trong bài đã lưu" placeholderTextColor={C.textMuted} style={styles.searchInput} />
            {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={C.textMuted} /></TouchableOpacity> : null}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => open(item)} activeOpacity={0.82}>
            {item.image ? <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="cover" /> : <View style={[styles.thumb, styles.thumbPh]}><Ionicons name="bookmark-outline" size={22} color={C.textMuted} /></View>}
            <View style={styles.rowBody}>
              <Text style={styles.meta} numberOfLines={1}>{item.source} · {item.category || 'Tin mới'}</Text>
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              {item.pubDate ? <Text style={styles.date}>{new Date(item.pubDate).toLocaleDateString('vi-VN')}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.link)} accessibilityLabel="Bỏ lưu bài" hitSlop={10} style={styles.remove}><Ionicons name="close" size={16} color={C.textMuted} /></TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Empty title={query ? 'Không có kết quả' : 'Chưa có bài đã lưu'} subtitle={query ? 'Thử tìm bằng từ khóa khác.' : 'Lưu những bài quan trọng để đọc lại nhanh trong Thư viện.'} icon="bookmark-outline" />}
      />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  tabsWrap: { paddingTop: 14, width: '100%', maxWidth: Layout.content, alignSelf: 'center' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: C.dangerSoft },
  clearText: { fontFamily: Sans.medium, color: C.danger, fontSize: 11 },
  listContent: { padding: 18, paddingBottom: 44, width: '100%', maxWidth: 900, alignSelf: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 13, marginBottom: 16 },
  searchInput: { flex: 1, paddingVertical: 13, fontFamily: Sans.regular, fontSize: 13, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  thumb: { width: 92, height: 76, borderRadius: 11, backgroundColor: C.surfaceAlt },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0 },
  meta: { fontFamily: Sans.bold, fontSize: 10, color: C.hot, marginBottom: 5 },
  rowTitle: { fontFamily: Sans.bold, fontSize: 14, lineHeight: 20, color: C.text },
  date: { fontFamily: Sans.regular, fontSize: 10, color: C.textMuted, marginTop: 6 },
  remove: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
});
