import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FEEDS, fetchAllFeeds } from '../services/feeds';
import type { FeedItem } from '../types';
import { Color, Font, Radius, Shadow } from '../constants/theme';
import ArticleCard from '../components/ArticleCard';
import FeaturedCard from '../components/FeaturedCard';
import SectionHeader from '../components/SectionHeader';
import SkeletonCard from '../components/SkeletonCard';

type Props = { navigation: NativeStackNavigationProp<any> };

// Extract unique categories from feeds
const CATEGORIES = ['Tất cả', ...new Set(FEEDS.map((f) => f.category))];
const SOURCES = ['Tất cả', ...new Set(FEEDS.map((f) => f.name))];

// Trending topics (derived from feed categories + manual curation)
const TRENDING_TOPICS = [
  { id: 'hot', label: 'Nổi bật', icon: 'flame', color: '#FF4757' },
  { id: 'vietnam', label: 'Việt Nam', icon: 'flag', color: '#DA1E37' },
  { id: 'world', label: 'Thế giới', icon: 'earth', color: '#1A73E8' },
  { id: 'tech', label: 'Công nghệ', icon: 'laptop', color: '#6C5CE7' },
  { id: 'business', label: 'Kinh doanh', icon: 'briefcase', color: '#00C896' },
  { id: 'sports', label: 'Thể thao', icon: 'basketball', color: '#FFA502' },
  { id: 'entertainment', label: 'Giải trí', icon: 'film', color: '#E84393' },
  { id: 'health', label: 'Sức khỏe', icon: 'medkit', color: '#26DE81' },
];

const today = () => {
  const d = new Date();
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${days[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
  'Việt Nam': '#DA1E37',
  'Thế giới': '#1A73E8',
  'Công nghệ': '#6C5CE7',
  'Kinh doanh': '#00C896',
  'Thể thao': '#FFA502',
  'Giải trí': '#E84393',
  'Sức khỏe': '#26DE81',
};

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedSource, setSelectedSource] = useState('Tất cả');
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [trendingAnim] = useState(new Animated.Value(0));

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

  // Animate trending bar on mount
  useEffect(() => {
    Animated.timing(trendingAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, []);

  const goArticle = (item: FeedItem) => navigation.navigate('Article', { item });

  // Filter logic
  let filtered = items;
  if (selectedCategory !== 'Tất cả') {
    filtered = filtered.filter((i) => FEEDS.find((f) => f.name === i.source)?.category === selectedCategory);
  }
  if (selectedSource !== 'Tất cả') {
    filtered = filtered.filter((i) => i.source === selectedSource);
  }

  const withImg = filtered.filter((i) => i.image);
  const hero = withImg[0] || null;
  const rest = filtered.filter((i) => i !== hero);

  // Stats
  const stats = useMemo(() => ({
    total: items.length,
    sources: new Set(items.map((i) => i.source)).size,
    categories: new Set(items.map((i) => FEEDS.find((f) => f.name === i.source)?.category).filter(Boolean)).size,
  }), [items]);

  // Render helpers
  const renderSkeleton = () => <SkeletonCard />;
  const renderItem = ({ item: r }: { item: FeedItem }) => <ArticleCard item={r} onPress={goArticle} />;

  const CategoryChip = ({ topic, active, onPress }: { topic: typeof TRENDING_TOPICS[0]; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.categoryChip, active && styles.categoryChipActive, { backgroundColor: active ? topic.color : Color.surfaceAlt }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons name={topic.icon as "flame" | "flag" | "earth" | "laptop" | "briefcase" | "basketball" | "film" | "medkit"} size={16} color={active ? '#FFF' : topic.color} />
      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{topic.label}</Text>
    </TouchableOpacity>
  );

  const SourceChip = ({ source, active, onPress }: { source: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.sourceChip, active && styles.sourceChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.sourceChipText, active && styles.sourceChipTextActive]}>{source}</Text>
    </TouchableOpacity>
  );

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

      {/* Trending Topics Bar */}
      <Animated.View
        style={[
          styles.trendingBar,
          {
            opacity: trendingAnim,
            transform: [{ translateY: trendingAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          },
        ]}
      >
        <View style={styles.trendingHeader}>
          <Ionicons name="trending-up" size={16} color={Color.primary} />
          <Text style={styles.trendingTitle}>XU HƯỚNG</Text>
        </View>
        <FlatList
          data={TRENDING_TOPICS}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingContent}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CategoryChip
              topic={item}
              active={selectedCategory === 'Tất cả' && item.id === 'hot' || selectedCategory !== 'Tất cả' && item.label === selectedCategory}
              onPress={() => {
                setSelectedCategory(item.label === 'Nổi bật' ? 'Tất cả' : item.label);
                setSelectedSource('Tất cả');
                setShowSourcePicker(false);
              }}
            />
          )}
        />
      </Animated.View>

      {/* Source Picker (expandable) */}
      <TouchableOpacity style={styles.sourceTrigger} onPress={() => setShowSourcePicker(!showSourcePicker)} activeOpacity={0.8}>
        <View style={styles.sourceTriggerLeft}>
          <Ionicons name="filter-outline" size={16} color={Color.primary} />
          <Text style={styles.sourceTriggerText}>Nguồn: <Text style={styles.sourceTriggerValue}>{selectedSource}</Text></Text>
        </View>
        <Animated.View
          style={[
            styles.chevron,
            { transform: [{ rotate: showSourcePicker ? '180deg' : '0deg' }] },
          ]}
        >
          <Ionicons name="chevron-down" size={18} color={Color.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      {showSourcePicker && (
        <View style={styles.sourceDropdown}>
          <FlatList
            data={SOURCES}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sourceDropdownContent}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <SourceChip
                source={item}
                active={selectedSource === item}
                onPress={() => { setSelectedSource(item); setShowSourcePicker(false); }}
              />
            )}
          />
        </View>
      )}

      {/* Content */}
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
              {hero && (
                <View style={styles.heroWrap}>
                  <FeaturedCard item={hero} onPress={goArticle} />
                </View>
              )}
              <SectionHeader title={filtered.length ? 'TIN MỚI NHẤT' : 'KHÔNG CÓ DỮ LIỆU'} />
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconBadge}>
                <Ionicons name="file-tray-outline" size={32} color={Color.textMuted} />
              </View>
              <Text style={styles.emptyText}>Không có bài báo</Text>
              <Text style={styles.emptySub}>Thử chọn chủ đề hoặc nguồn khác</Text>
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

  // Trending Bar
  trendingBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  trendingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 4 },
  trendingTitle: { fontSize: Font.tiny, fontWeight: '700', color: Color.primary, letterSpacing: 0.5 },
  trendingContent: { paddingHorizontal: 4, gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  categoryChipActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  categoryChipText: { fontSize: Font.caption, fontWeight: '600' },
  categoryChipTextActive: { color: '#FFF' },

  // Category Pills
  categorySection: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Color.bg },
  categoryContent: { paddingHorizontal: 4, gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  pillActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 3 },
  pillText: { fontSize: Font.caption, fontWeight: '600' },
  pillTextActive: { fontWeight: '700' },

  // Source Trigger
  sourceTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Color.card, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  sourceTriggerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceTriggerText: { fontSize: Font.caption, color: Color.textSecondary },
  sourceTriggerValue: { fontWeight: '700', color: Color.text },
  chevron: { padding: 4 },

  // Source Dropdown
  sourceDropdown: { paddingHorizontal: 16, paddingBottom: 12, backgroundColor: Color.bg },
  sourceDropdownContent: { paddingHorizontal: 4, gap: 8 },
  sourceChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: Color.surfaceAlt, borderWidth: 1, borderColor: Color.border },
  sourceChipActive: { backgroundColor: Color.primary, borderColor: Color.primary },
  sourceChipText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  sourceChipTextActive: { color: '#FFF', fontWeight: '700' },

  // List
  listContent: { paddingBottom: 24 },
  listHeader: { paddingHorizontal: 12, paddingTop: 8 },
  heroWrap: { marginBottom: 8 },

  // Skeletons
  skelWrap: { paddingTop: 8 },

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