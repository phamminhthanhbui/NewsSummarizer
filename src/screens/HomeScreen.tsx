import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FEEDS, fetchAllFeeds } from '../services/feeds';
import type { FeedItem } from '../types';
import { Color, Font } from '../constants/theme';
import ArticleCard from '../components/ArticleCard';
import FeaturedCard from '../components/FeaturedCard';
import SourceTabs from '../components/SourceTabs';
import SectionHeader from '../components/SectionHeader';
import SkeletonCard from '../components/SkeletonCard';

type Props = { navigation: NativeStackNavigationProp<any> };
const SOURCES = ['Tất cả', ...new Set(FEEDS.map((f) => f.name))];

const today = () => {
  const d = new Date();
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${days[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState('Tất cả');

  const load = useCallback(async () => {
    const data = await fetchAllFeeds();
    setItems(data);
  }, []);

  useEffect(() => { load().finally(() => setLoading(false)); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const goArticle = (item: FeedItem) => navigation.navigate('Article', { item });

  // Filter by source
  const filtered = source === 'Tất cả' ? items : items.filter((i) => i.source === source);

  // Rhythm: separate items with images and items without
  const withImg = filtered.filter((i) => i.image);
  const withoutImg = filtered.filter((i) => !i.image);

  // Hero = first with-image item
  const hero = withImg[0] || null;
  // Rest for interleaved list
  const rest = filtered.filter((i) => i !== hero);

  // Render item: interleave thumbnail cards every ~5 items
  const renderItem = ({ item: r, index }: { item: FeedItem; index: number }) => (
    <ArticleCard item={r} onPress={goArticle} />
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <View style={styles.brandRow}>
          <Text style={styles.logo}>📰</Text>
          <Text style={styles.brand}>NewsSummarizer</Text>
        </View>
        <Text style={styles.date}>{today()}</Text>
      </View>

      {/* Source tabs */}
      <SourceTabs sources={SOURCES} selected={source} onSelect={setSource} />

      {loading ? (
        <View style={styles.skelWrap}>
          {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item, i) => `${item.link}-${i}`}
          renderItem={renderItem}
          ListHeaderComponent={
            <View>
              {/* Hero */}
              {hero && (
                <>
                  <View style={{ paddingTop: 10, paddingHorizontal: 12 }}>
                    <FeaturedCard item={hero} onPress={goArticle} />
                  </View>
                  <View style={{ height: 4 }} />
                </>
              )}
              <SectionHeader title="TIN MỚI NHẤT" />
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Color.primary} colors={[Color.primary]} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>Không có bài báo nào</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={load}>
                <Text style={styles.emptyBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg },
  header: {
    backgroundColor: Color.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { fontSize: 22 },
  brand: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  date: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  skelWrap: { paddingTop: 4 },
  empty: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 32 },
  emptyText: { fontSize: 14, color: Color.textMuted },
  emptyBtn: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, backgroundColor: Color.primary },
  emptyBtnText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
});