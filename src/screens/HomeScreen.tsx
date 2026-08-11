import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Easing,
  Keyboard,
  Platform,
} from 'react-native';
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

// Unified categories from feeds
const CATEGORIES = ['Tất cả', ...new Set(FEEDS.map((f) => f.category))];
const SOURCES = ['Tất cả', ...new Set(FEEDS.map((f) => f.name))];

const CATEGORY_ICONS: Record<string, string> = {
  'Tất cả': 'grid-outline',
  'Việt Nam': 'flag-outline',
  'Thế giới': 'earth-outline',
  'Công nghệ': 'laptop-outline',
  'Kinh doanh': 'briefcase-outline',
  'Thể thao': 'basketball-outline',
  'Giải trí': 'film-outline',
  'Sức khỏe': 'medkit-outline',
};

const CATEGORY_COLORS: Record<string, string> = {
  'Tất cả': Color.primary,
  'Việt Nam': '#DA1E37',
  'Thế giới': '#1A73E8',
  'Công nghệ': '#6C5CE7',
  'Kinh doanh': '#00C896',
  'Thể thao': '#FFA502',
  'Giải trí': '#E84393',
  'Sức khỏe': '#26DE81',
};

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
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedSource, setSelectedSource] = useState('Tất cả');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [headerAnim] = useState(new Animated.Value(0));
  const [categoryAnim] = useState(new Animated.Value(0));
  const flatListRef = useRef<FlatList<FeedItem>>(null);
  const lastContentOffset = useRef(0);
  const [headerHidden, setHeaderHidden] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchAllFeeds();
    setItems(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Staggered entrance animations
    Animated.sequence([
      Animated.timing(headerAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(categoryAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    // Haptic feedback on refresh complete
    if (Platform.OS !== 'web') {
      const { Haptics } = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [load]);

  const goArticle = (item: FeedItem) => {
    Keyboard.dismiss();
    navigation.navigate('Article', { item });
  };

  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'Tất cả') {
      result = result.filter((i) => FEEDS.find((f) => f.name === i.source)?.category === selectedCategory);
    }
    if (selectedSource !== 'Tất cả') {
      result = result.filter((i) => i.source === selectedSource);
    }
    return result;
  }, [items, selectedCategory, selectedSource]);

  const withImg = filtered.filter((i) => i.image);
  const hero = withImg[0] || null;
  const rest = filtered.filter((i) => i !== hero);

  const stats = useMemo(() => ({
    total: items.length,
    sources: new Set(items.map((i) => i.source)).size,
    categories: new Set(items.map((i) => FEEDS.find((f) => f.name === i.source)?.category).filter(Boolean)).size,
  }), [items]);

  const handleScroll = useCallback(({ nativeEvent }: any) => {
    const offset = nativeEvent.contentOffset.y;
    const delta = offset - lastContentOffset.current;
    if (delta > 10 && !headerHidden) setHeaderHidden(true);
    else if (delta < -10 && headerHidden) setHeaderHidden(false);
    lastContentOffset.current = offset;
  }, [headerHidden]);

  const CategoryChip = ({ category, active, onPress }: { category: string; active: boolean; onPress: () => void }) => {
    const color = CATEGORY_COLORS[category] || Color.primary;
    const icon = CATEGORY_ICONS[category] || 'grid-outline';
    return (
      <TouchableOpacity
        style={[
          styles.categoryChip,
          active && styles.categoryChipActive,
          { backgroundColor: active ? color : Color.surfaceAlt, borderColor: active ? color : Color.border },
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <Ionicons name={icon as any} size={15} color={active ? '#FFF' : color} />
        <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{category}</Text>
      </TouchableOpacity>
    );
  };

  const SourceChip = ({ source, active, onPress }: { source: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity
      style={[styles.sourceChip, active && styles.sourceChipActive]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.sourceChipText, active && styles.sourceChipTextActive]}>{source}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: FeedItem }) => <ArticleCard item={item} onPress={goArticle} />;

  return (
    <Animated.View style={[styles.root, { opacity: headerAnim }]}>
      {/* Sticky Header - Modern Design */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top + 8, paddingBottom: 10 },
        ]}
      >
        {/* Row 1: Brand + Search */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <Ionicons name="newspaper" size={24} color="#FFF" />
            </View>
            <Text style={styles.brand}>NewsSummarizer</Text>
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={() => { /* TODO: search */ }} activeOpacity={0.7} accessibilityLabel="Tìm kiếm">
            <Ionicons name="search-outline" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Row 2: Date + Stats + Refresh */}
        <View style={styles.headerRow2}>
          <View style={styles.dateWrap}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.date}>{today()}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.total}</Text>
              <Text style={styles.statLabel}>bài</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.sources}</Text>
              <Text style={styles.statLabel}>nguồn</Text>
            </View>
            <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7} accessibilityLabel="Làm mới" disabled={refreshing}>
              <Ionicons name={refreshing ? "refresh-circle" : "refresh-outline"} size={20} color="#FFF" style={refreshing ? styles.refreshSpin : {}} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      {/* Category Bar - animated slide up */}
      <Animated.View
        style={[
          styles.categoryBar,
          { opacity: categoryAnim, transform: [{ translateY: categoryAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
        ]}
      >
        <FlatList
          data={CATEGORIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContent}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <CategoryChip
              category={item}
              active={selectedCategory === item}
              onPress={() => {
                setSelectedCategory(item);
                setSelectedSource('Tất cả');
                if (flatListRef.current) flatListRef.current.scrollToOffset({ offset: 0, animated: true });
              }}
            />
          )}
        />
      </Animated.View>

      {/* Source Selector Trigger */}
      <TouchableOpacity style={styles.sourceTrigger} onPress={() => { Keyboard.dismiss(); setShowSourceModal(true); }} activeOpacity={0.8} accessibilityLabel="Chọn nguồn tin">
        <View style={styles.sourceTriggerLeft}>
          <Ionicons name="filter-outline" size={18} color={Color.primary} />
          <Text style={styles.sourceTriggerText}>
            Nguồn: <Text style={styles.sourceTriggerValue}>{selectedSource}</Text>
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={Color.textMuted} />
      </TouchableOpacity>

      {/* Source Modal */}
      {showSourceModal && (
        <View style={styles.modalOverlay} onTouchStart={() => setShowSourceModal(false)} accessible={false}>
          <Animated.View
            style={[
              styles.modalContent,
              { marginBottom: insets.bottom },
              // animate translateY for enter/exit
              { transform: [{ translateY: showSourceModal ? 0 : 400 }] },
            ]}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn nguồn tin</Text>
              <TouchableOpacity onPress={() => setShowSourceModal(false)} style={styles.modalClose} accessibilityLabel="Đóng">
                <Ionicons name="close" size={22} color={Color.textMuted} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={SOURCES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <SourceChip
                  source={item}
                  active={selectedSource === item}
                  onPress={() => { setSelectedSource(item); setShowSourceModal(false); }}
                />
              )}
              contentContainerStyle={styles.modalListContent}
            />
          </Animated.View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.skelWrap} accessibilityLabel="Đang tải">
          {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={rest}
          keyExtractor={(item, i) => `${item.link}-${i}`}
          renderItem={renderItem}
          onScroll={handleScroll}
          scrollEventThrottle={16}
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
            <View style={styles.empty} accessibilityLabel="Không có bài báo">
              <View style={styles.emptyIconBadge}>
                <Ionicons name="file-tray-outline" size={36} color={Color.textMuted} />
              </View>
              <Text style={styles.emptyText}>Không có bài báo</Text>
              <Text style={styles.emptySub}>
                {selectedCategory !== 'Tất cả' || selectedSource !== 'Tất cả'
                  ? 'Thử chọn chủ đề hoặc nguồn khác'
                  : 'Kéo xuống để làm mới'}
              </Text>
              {selectedCategory !== 'Tất cả' || selectedSource !== 'Tất cả' ? (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => { setSelectedCategory('Tất cả'); setSelectedSource('Tất cả'); }} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={16} color="#FFF" />
                  <Text style={styles.emptyBtnText}>Xem tất cả</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Color.primary}
              colors={[Color.primary]}
              progressViewOffset={insets.top + 80}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg },

  // Header
  header: {
    backgroundColor: Color.primary,
    paddingHorizontal: 16,
    paddingBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 4 },
      default: { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.1)' },
    }),
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  headerLeft: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBtn: { padding: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 24, fontWeight: '800', color: '#FFF', letterSpacing: -0.5, marginTop: 6 },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  date: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },
  statDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)' },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stat: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  statDot: { color: 'rgba(255,255,255,0.4)' },
  refreshBtn: { padding: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  refreshSpin: { transform: [{ rotate: '360deg' }] },

  // Category Bar
  categoryBar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Color.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  categoryContent: { paddingHorizontal: 4, gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  categoryChipActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  categoryChipText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  categoryChipTextActive: { color: '#FFF', fontWeight: '700' },

  // Source Trigger
  sourceTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: Color.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  sourceTriggerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceTriggerText: { fontSize: Font.caption, color: Color.textSecondary },
  sourceTriggerValue: { fontWeight: '700', color: Color.text },

  // Modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', zIndex: 100 },
  modalContent: {
    backgroundColor: Color.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    ...Shadow.card,
    maxHeight: '80%',
  },
  modalEnter: { translateY: 0 },
  modalExit: { translateY: 400 },
  modalHandle: { width: 40, height: 5, borderRadius: 3, backgroundColor: Color.border, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  modalTitle: { fontSize: Font.headline, fontWeight: '700', color: Color.text },
  modalClose: { padding: 8 },
  modalListContent: { paddingHorizontal: 4, gap: 8, paddingBottom: 20 },

  // Source Chips (in modal)
  sourceChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: Color.surfaceAlt, borderWidth: 1, borderColor: Color.border },
  sourceChipActive: { backgroundColor: Color.primarySoft, borderColor: Color.primary },
  sourceChipText: { fontSize: Font.body, fontWeight: '600', color: Color.text },
  sourceChipTextActive: { color: Color.primary, fontWeight: '700' },

  // List
  listContent: { paddingBottom: 32 },
  listHeader: { paddingHorizontal: 12, paddingTop: 4 },
  heroWrap: { marginBottom: 8 },

  // Skeletons
  skelWrap: { paddingTop: 8 },

  // Empty
  empty: { paddingTop: 60, alignItems: 'center', gap: 14, paddingHorizontal: 24 },
  emptyIconBadge: {
    width: 88,
    height: 88,
    borderRadius: 999,
    backgroundColor: Color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 18, fontWeight: '700', color: Color.text },
  emptySub: { fontSize: 14, color: Color.textMuted, textAlign: 'center' },
  emptyBtn: {
    marginTop: 6,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Color.primary,
    ...Shadow.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});