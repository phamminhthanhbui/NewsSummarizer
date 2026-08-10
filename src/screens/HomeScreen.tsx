import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FEEDS, fetchAllFeeds } from '../services/feeds';
import type { FeedItem } from '../types';
import { Color, Font, Radius, Shadow } from '../constants/theme';
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

  const filtered = source === 'Tất cả' ? items : items.filter((i) => i.source === source);
  const withImg = filtered.filter((i) => i.image);
  const hero = withImg[0] || null;
  const rest = filtered.filter((i) => i !== hero);

  const renderSkeleton = () => <SkeletonCard />;
  const renderItem = ({ item: r }: { item: FeedItem }) => <ArticleCard item={r} onPress={goArticle} />;

  // Header with stats
  const stats = {
    total: items.length,
    sources: new Set(items.map((i) => i.source)).size,
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Ionicons name="newspaper" size={20} color="#FFF" />
          </View>
          <Text style={styles.brand}>NewsSummarizer</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.dateWrap}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.date}>{today()}</Text>
          </View>
          <View style={styles.statsPill}>
            <Text style={styles.stat}>{stats.total}</Text>
            <Text style={styles.statDot}>·</Text>
            <Text style={styles.stat}>{stats.sources} nguồn</Text>
          </View>
        </View>
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
            <View style={styles.listHeader}>
              {/* Hero */}
              {hero && (
                <View style={styles.heroWrap}>
                  <FeaturedCard item={hero} onPress={goArticle} />
                </View>
              )}
              <SectionHeader title="TIN MỚI NHẤT" />
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconBadge}>
                <Ionicons name="file-tray-outline" size={32} color={Color.textMuted} />
              </View>
              <Text style={styles.emptyText}>Không có bài báo nào</Text>
              <Text style={styles.emptySub}>Thay đổi nguồn hoặc kéo để tải lại</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={onRefresh} activeOpacity={0.8}>
                <Ionicons name="refresh" size={15} color="#FFF" />
                <Text style={styles.emptyBtnText}>Tải lại</Text>
              </TouchableOpacity>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Color.primary} colors={[Color.primary]} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg },

  // Header
  header: {
    backgroundColor: Color.primary,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.4, marginTop: 8 },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  stat: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  statDot: { color: 'rgba(255,255,255,0.5)' },

  // Skeleton
  skelWrap: { paddingTop: 8 },

  // List
  listContent: { paddingBottom: 24 },
  listHeader: { paddingHorizontal: 12, paddingTop: 8 },
  heroWrap: { marginBottom: 8 },

  // Empty
  empty: { paddingTop: 100, alignItems: 'center', gap: 12 },
  emptyIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 999,
    backgroundColor: Color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '700', color: Color.text },
  emptySub: { fontSize: 13, color: Color.textMuted },
  emptyBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Color.primary,
    ...Shadow.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});