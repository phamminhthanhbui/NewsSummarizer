import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  Easing,
  Keyboard,
  Platform,
  TextInput,
  Pressable,
  Dimensions,
  AccessibilityInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FEEDS, fetchAllFeeds, readFeedsCache, SOURCE_COLORS } from '../services/feeds';
import { fetchVideos } from '../services/videos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS } from '../services/storage';
import type { FeedItem, VideoItem } from '../types';
import { Color, Font, Radius, Shadow, useTheme } from '../constants/theme';
import ArticleCard from '../components/ArticleCard';
import FeaturedCard from '../components/FeaturedCard';
import SkeletonCard from '../components/SkeletonCard';
import VideoCard from '../components/VideoCard';
import VideoModal from '../components/VideoModal';

type Props = { navigation: NativeStackNavigationProp<any> };

const getHeroWidth = (insets: { left: number; right: number }) =>
  Dimensions.get('window').width - insets.left - insets.right;

const CATEGORIES = ['Tất cả', ...new Set(FEEDS.map((f) => f.category))];
const SOURCES = ['Tất cả', ...new Set(FEEDS.map((f) => f.name))];

const CATEGORY_COLORS: Record<string, string> = {
  'Tất cả': '#FB512A',
  'Việt Nam': '#DC2626',
  'Công nghệ': '#7C3AED',
  'Kinh doanh': '#D97706',
  'Thể thao': '#059669',
  'Giải trí': '#DB2777',
  'Sức khỏe': '#2563EB',
};

const CATEGORY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  'Tất cả': 'apps',
  'Việt Nam': 'flag',
  'Công nghệ': 'hardware-chip',
  'Kinh doanh': 'briefcase',
  'Thể thao': 'football',
  'Giải trí': 'film',
  'Sức khỏe': 'medkit',
};

const today = () => {
  const d = new Date();
  const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const months = ['Th 1', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7', 'Th 8', 'Th 9', 'Th 10', 'Th 11', 'Th 12'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
};

/* ─── Category chip ─── */

const CategoryChip = React.memo(({ category, active, onPress, styles }: { category: string; active: boolean; onPress: (c: string) => void; styles: ReturnType<typeof makeStyles> }) => {
  const C = useTheme();
  const c = CATEGORY_COLORS[category] || C.hot;
  return (
    <TouchableOpacity
      style={[styles.pill, active && { backgroundColor: c, borderColor: c }]}
      onPress={() => onPress(category)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={CATEGORY_ICONS[category] || 'newspaper'}
        size={13}
        color={active ? '#FFF' : c}
        style={styles.pillIcon}
      />
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{category}</Text>
    </TouchableOpacity>
  );
});

/* ─── Source chip (modal) ─── */

const SourceChip = React.memo(({ source, active, onPress, styles }: { source: string; active: boolean; onPress: (s: string) => void; styles: ReturnType<typeof makeStyles> }) => {
  const C = useTheme();
  const c = source === 'Tất cả' ? C.hot : SOURCE_COLORS[source] || C.hot;
  return (
    <TouchableOpacity
      style={[styles.sourceChip, active && { backgroundColor: c, borderColor: c }]}
      onPress={() => onPress(source)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.sourceChipText, active && styles.sourceChipTextActive]}>{source}</Text>
    </TouchableOpacity>
  );
});

/* ─── Compact horizontal card ─── */

// Card phủ kín: ảnh full + scrim gradient + title đè lên ảnh.
// Height cố định 150 — không đổi theo số dòng title.
const CompactCard = React.memo(({ item, onPress, styles }: { item: FeedItem; onPress: (i: FeedItem) => void; styles: ReturnType<typeof makeStyles> }) => {
  const C = useTheme();
  const srcColor = SOURCE_COLORS[item.source] || C.hot;
  return (
    <TouchableOpacity style={styles.compactCard} onPress={() => onPress(item)} activeOpacity={0.85}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.compactImg} resizeMode="cover" />
      ) : (
        <View style={[styles.compactImg, styles.compactImgPh]}>
          <Ionicons name="image-outline" size={26} color={C.textMuted} />
        </View>
      )}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']} locations={[0.3, 0.65, 1]} style={styles.compactScrim} />
      <View style={[styles.compactSrcBadge, { backgroundColor: srcColor }]}>
        <Text style={styles.compactSrcText} numberOfLines={1}>{item.source}</Text>
      </View>
      <Text style={styles.compactTitle} numberOfLines={3}>{item.title}</Text>
    </TouchableOpacity>
  );
});

/* ─── Main screen ─── */

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C, insets), [C, insets]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedSource, setSelectedSource] = useState('Tất cả');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [hasSearchText, setHasSearchText] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const searchTextRef = useRef('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerAnim] = useState(new Animated.Value(0));
  const [categoryAnim] = useState(new Animated.Value(0));
  const flatListRef = useRef<FlatList<FeedItem>>(null);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const load = useCallback(async () => {
    const cached = await readFeedsCache();
    if (cached.length) setItems(cached);
    const [data, vids] = await Promise.all([fetchAllFeeds(), fetchVideos()]);
    if (data.length) setItems(data);
    setVideos(vids);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    Animated.sequence([
      Animated.timing(headerAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(categoryAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    if (Platform.OS !== 'web') {
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [load]);

  const goArticle = useCallback((item: FeedItem) => {
    Keyboard.dismiss();
    navigation.navigate('Article', { item });
  }, [navigation]);

  const [videoModal, setVideoModal] = useState<VideoItem | null>(null);
  const goVideo = useCallback((v: VideoItem) => setVideoModal(v), []);

  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'Tất cả') result = result.filter((i) => i.category === selectedCategory);
    if (selectedSource !== 'Tất cả') result = result.filter((i) => i.source === selectedSource);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return result;
  }, [items, selectedCategory, selectedSource, debouncedQuery]);

  const { heroes, rest } = useMemo(() => {
    const withImg = filtered.filter((i) => i.image);
    const feat = withImg.filter((i) => i.featured);
    const heroes = feat.concat(withImg.filter((i) => !i.featured)).slice(0, 5);
    const heroSet = new Set(heroes);
    return { heroes, rest: filtered.filter((i) => !heroSet.has(i)) };
  }, [filtered]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const heroListRef = useRef<FlatList<FeedItem>>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
  }, []);
  const heroIdxRef = useRef(0);
  const heroAutoRef = useRef(false);
  const lastManualRef = useRef(0);

  useEffect(() => {
    if (heroes.length < 2 || reduceMotion) return;
    const heroW = getHeroWidth(insets);
    const t = setInterval(() => {
      if (Date.now() - lastManualRef.current < 4000) return;
      const next = (heroIdxRef.current + 1) % heroes.length;
      heroIdxRef.current = next;
      heroAutoRef.current = true;
      setHeroIdx(next);
      heroListRef.current?.scrollToOffset({ offset: next * heroW, animated: true });
      setTimeout(() => { heroAutoRef.current = false; }, 600);
    }, 4000);
    return () => clearInterval(t);
  }, [heroes.length, reduceMotion, insets]);

  const goHero = useCallback((delta: number) => {
    const n = heroes.length;
    if (n < 2) return;
    const next = (heroIdxRef.current + delta + n) % n;
    heroIdxRef.current = next;
    heroAutoRef.current = true;
    lastManualRef.current = Date.now();
    setHeroIdx(next);
    heroListRef.current?.scrollToOffset({ offset: next * getHeroWidth(insets), animated: true });
    setTimeout(() => { heroAutoRef.current = false; }, 600);
  }, [heroes.length, insets]);

  const sortedVideos = useMemo(() => {
    const feat = videos.filter((v) => v.zone === 'Video nổi bật');
    return feat.concat(videos.filter((v) => v.zone !== 'Video nổi bật'));
  }, [videos]);

  const handleCategoryPress = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedSource('Tất cả');
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  const handleSourcePress = useCallback((source: string) => {
    setSelectedSource(source);
    setShowSourceModal(false);
  }, []);

  const handleSearchChange = useCallback(async (text: string) => {
    searchTextRef.current = text;
    const had = text.length > 0;
    setHasSearchText((prev) => (prev === had ? prev : had));
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(text), 600);
    if (text.trim() === '016527') {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      const unlocked = (await AsyncStorage.getItem(KEYS.aiUnlocked)) === '1';
      if (unlocked) {
        await AsyncStorage.removeItem(KEYS.aiUnlocked);
        alert('Đã ẩn cấu hình AI trong Cài đặt');
      } else {
        await AsyncStorage.setItem(KEYS.aiUnlocked, '1');
        alert('Đã mở khóa cấu hình AI trong Cài đặt');
      }
      searchInputRef.current?.clear();
      searchTextRef.current = '';
      setHasSearchText(false);
      setDebouncedQuery('');
      Keyboard.dismiss();
    }
  }, []);

  const handleSearchToggle = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        searchInputRef.current?.clear();
        searchTextRef.current = '';
        setHasSearchText(false);
        setDebouncedQuery('');
        Keyboard.dismiss();
      }
      return !prev;
    });
  }, []);

  const heroRenderItem = useCallback(({ item }: { item: FeedItem }) => (
    <View style={styles.heroSlide}>
      <FeaturedCard item={item} onPress={goArticle} />
    </View>
  ), [goArticle, styles]);

  const handleHeroScroll = useCallback((e: any) => {
    const w = e.nativeEvent.layoutMeasurement.width || 1;
    const idx = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.x / w), 0), 4);
    setHeroIdx((prev) => (prev === idx ? prev : idx));
  }, []);

  const renderItem = useCallback(({ item }: { item: FeedItem }) => <ArticleCard item={item} onPress={goArticle} />, [goArticle]);

  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
      {/* HERO CAROUSEL */}
      {heroes.length > 0 && (
        <View style={styles.heroSection}>
          <FlatList
            ref={heroListRef}
            data={heroes}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.link}
            renderItem={heroRenderItem}
            scrollEventThrottle={100}
            onScroll={handleHeroScroll}
          />
          {heroes.length > 1 && (
            <>
              <TouchableOpacity style={[styles.heroArrow, styles.heroArrowL]} onPress={() => goHero(-1)} activeOpacity={0.7} accessibilityLabel="Tin trước">
                <Ionicons name="chevron-back" size={18} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.heroArrow, styles.heroArrowR]} onPress={() => goHero(1)} activeOpacity={0.7} accessibilityLabel="Tin sau">
                <Ionicons name="chevron-forward" size={18} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.heroDots}>
                {heroes.map((h, i) => (
                  <View key={h.link} style={[styles.heroDot, i === heroIdx && styles.heroDotActive]} />
                ))}
              </View>
            </>
          )}
        </View>
      )}

      {/* SECTION: TOP STORIES */}
      {heroes.length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <View style={[styles.sectionBar, { backgroundColor: C.hot }]} />
            <Text style={[styles.sectionTitle, { color: C.hot }]}>TIN NỔI BẬT</Text>
            <View style={styles.sectionLine} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topStoriesScroll}>
            {heroes.map((h) => (
              <CompactCard key={h.link} item={h} onPress={goArticle} styles={styles} />
            ))}
          </ScrollView>
        </>
      )}

      {/* SECTION: VIDEO */}
      {sortedVideos.length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <View style={[styles.sectionBar, { backgroundColor: C.hot }]} />
            <View style={styles.sectionVideoIcon}>
              <Ionicons name="videocam" size={12} color="#FFF" />
            </View>
            <Text style={[styles.sectionTitle, { color: C.hot }]}>VIDEO</Text>
            <View style={styles.sectionLine} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.videoScroll}>
            {sortedVideos.map((v) => (
              <View key={v.link} style={styles.videoCardWrap}>
                <VideoCard item={v} onPress={goVideo} featured={v.zone === 'Video nổi bật'} />
              </View>
            ))}
          </ScrollView>
        </>
      )}

      {/* SECTION: LATEST */}
      <View style={styles.sectionRow}>
        <View style={[styles.sectionBar, { backgroundColor: C.accent }]} />
        <Text style={[styles.sectionTitle, { color: C.accent }]}>TIN MỚI NHẤT</Text>
        <View style={styles.sectionLine} />
      </View>
    </View>
  ), [sortedVideos, heroes, heroIdx, goVideo, goHero, heroRenderItem, handleHeroScroll, goArticle, styles]);

  return (
    <Animated.View style={[styles.root, { opacity: headerAnim }]}>
      {/* HEADER — masthead */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.masthead}>
              <Image source={require('../../assets/icon.png')} style={styles.mastheadImg} resizeMode="cover" />
            </View>
            <View>
              <Text style={styles.brand}>TIN TỨC</Text>
              <Text style={styles.brandDate}>{today()}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIcon} onPress={handleSearchToggle} activeOpacity={0.7} accessibilityLabel="Tìm kiếm">
              <Ionicons name={showSearch ? 'close' : 'search-outline'} size={19} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIcon} onPress={onRefresh} activeOpacity={0.7} accessibilityLabel="Làm mới" disabled={refreshing}>
              <Ionicons name={refreshing ? 'refresh-circle' : 'refresh-outline'} size={19} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* SEARCH BAR */}
        {showSearch && (
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={16} color={C.hot} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Tìm tiêu đề, nội dung..."
              placeholderTextColor={C.textMuted}
              value={searchText}
              onChangeText={(t) => {
                setSearchText(t);
                handleSearchChange(t);
              }}
              autoFocus
              accessibilityLabel="Nhập từ khóa tìm kiếm"
            />
            {hasSearchText && (
              <TouchableOpacity onPress={() => { searchInputRef.current?.clear(); setSearchText(''); setHasSearchText(false); setDebouncedQuery(''); }} accessibilityLabel="Xóa">
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* CATEGORY PILLS */}
      <Animated.View style={[styles.categoryWrap, { opacity: categoryAnim, transform: [{ translateY: categoryAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {CATEGORIES.map((cat) => (
            <CategoryChip key={cat} category={cat} active={selectedCategory === cat} onPress={handleCategoryPress} styles={styles} />
          ))}
        </ScrollView>
      </Animated.View>

      {/* BREAKING NEWS TICKER */}
      {heroes.length > 0 && (
        <View style={styles.breakingStrip}>
          <View style={styles.breakingBadge}>
            <Ionicons name="flash" size={10} color="#FFF" />
            <Text style={styles.breakingText}>NÓNG</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breakingScroll}>
            {heroes.map((h) => (
              <TouchableOpacity key={h.link} style={styles.breakingItem} onPress={() => goArticle(h)} activeOpacity={0.7}>
                <Text style={styles.breakingItemText} numberOfLines={1}>{h.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* SOURCE MODAL */}
      {showSourceModal && (
        <View style={styles.modalOverlay} pointerEvents="box-none">
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSourceModal(false)} accessibilityElementsHidden={true} />
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Chọn nguồn tin</Text>
              <TouchableOpacity onPress={() => setShowSourceModal(false)} style={styles.modalClose} accessibilityLabel="Đóng">
                <Ionicons name="close" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={SOURCES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <SourceChip source={item} active={selectedSource === item} onPress={handleSourcePress} styles={styles} />
              )}
              contentContainerStyle={styles.modalListContent}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      )}

      {/* CONTENT */}
      {loading ? (
        <View style={styles.skelWrap} accessibilityLabel="Đang tải">
          {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={rest}
          keyExtractor={(item) => item.link}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.empty} accessibilityLabel="Không có bài báo">
              <View style={styles.emptyIcon}>
                <Ionicons name="file-tray-outline" size={32} color={C.textMuted} />
              </View>
              <Text style={styles.emptyText}>Không có bài báo</Text>
              <Text style={styles.emptySub}>
                {selectedCategory !== 'Tất cả' || selectedSource !== 'Tất cả'
                  ? 'Thử chọn chủ đề hoặc nguồn khác'
                  : 'Kéo xuống để làm mới'}
              </Text>
              {selectedCategory !== 'Tất cả' || selectedSource !== 'Tất cả' ? (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => { setSelectedCategory('Tất cả'); setSelectedSource('Tất cả'); }} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={14} color="#FFF" />
                  <Text style={styles.emptyBtnText}>Xem tất cả</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={C.primary}
              colors={[C.primary]}
              progressViewOffset={insets.top + 80}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}

      {videoModal && <VideoModal video={videoModal} onClose={() => setVideoModal(null)} />}
    </Animated.View>
  );
}

/* ─── Styles ─── */

type Palette = typeof Color;
const makeStyles = (Color: Palette, insets: { top: number; bottom: number; left: number; right: number }) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg, paddingBottom: insets.bottom },

  /* ── Header ── */
  header: { backgroundColor: Color.card, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Color.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  masthead: { width: 34, height: 34, borderRadius: Radius.sm, backgroundColor: Color.hot, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mastheadImg: { width: 34, height: 34 },
  brand: { fontSize: Font.title, fontWeight: '900', color: Color.text, letterSpacing: 0.8 },
  brandDate: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 1, letterSpacing: 0.1 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  /* ── Search bar ── */
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: Color.surfaceAlt, borderRadius: Radius.md, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: Font.body, color: Color.text, paddingVertical: 0 },

  /* ── Category pills ── */
  categoryWrap: { backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Color.border },
  categoryScroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: Color.surfaceAlt, borderWidth: 1, borderColor: Color.border },
  pillIcon: { marginRight: 4 },
  pillText: { fontSize: 13, fontWeight: '600', color: Color.textSecondary },
  pillTextActive: { color: '#FFF', fontWeight: '700' },

  /* ── Breaking news ── */
  breakingStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Color.border, paddingVertical: 6 },
  breakingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Color.hot, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm, marginLeft: 12 },
  breakingText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  breakingScroll: { gap: 14, paddingLeft: 12, paddingRight: 16, alignItems: 'center' },
  breakingItem: { maxWidth: 260, flexShrink: 1 },
  breakingItemText: { fontSize: Font.caption, fontWeight: '600', color: Color.text },

  /* ── Hero carousel ── */
  heroSection: { marginBottom: 0 },
  heroSlide: { width: getHeroWidth(insets) },
  heroArrow: { position: 'absolute', top: 100, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  heroArrowL: { left: 8 },
  heroArrowR: { right: 8 },
  heroDots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Color.border },
  heroDotActive: { width: 18, backgroundColor: Color.primary },

  /* ── Section headers ── */
  sectionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 },
  sectionBar: { width: 4, height: 16, borderRadius: 2, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  sectionVideoIcon: { width: 20, height: 20, borderRadius: 4, backgroundColor: Color.hot, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 10 },

  /* ── Top stories strip — card phủ kín, height cố định 150 ── */
  topStoriesScroll: { paddingHorizontal: 12, paddingBottom: 4, gap: 10 },
  compactCard: {
    width: 200, height: 150, borderRadius: Radius.md, overflow: 'hidden',
    backgroundColor: Color.skeleton,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 }, android: { elevation: 3 }, default: { boxShadow: '0 2px 8px rgba(0,0,0,0.12)' } }),
  },
  compactImg: { width: '100%', height: '100%' },
  compactImgPh: { backgroundColor: Color.skeleton, alignItems: 'center', justifyContent: 'center' },
  compactScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  compactSrcBadge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, maxWidth: 110 },
  compactSrcText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  compactTitle: {
    position: 'absolute', left: 10, right: 10, bottom: 10,
    fontSize: Font.caption, fontWeight: '800', color: '#FFF', lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  /* ── Video strip — cùng width 200 để height khớp strip trên ── */
  videoScroll: { paddingHorizontal: 12, paddingBottom: 4, gap: 10 },
  videoCardWrap: { width: 200, flexShrink: 0 },

  /* ── Modal ── */
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Color.scrim },
  modalContent: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Color.card, paddingHorizontal: 16, paddingTop: 10, maxHeight: '75%', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, ...Shadow.level4 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Color.border, alignSelf: 'center', marginBottom: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: Font.title, fontWeight: '800', color: Color.text, letterSpacing: -0.3 },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: Color.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  modalListContent: { paddingHorizontal: 2, paddingTop: 2, paddingBottom: 8, gap: 8 },
  sourceChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: Color.surfaceAlt, borderWidth: 1, borderColor: Color.border },
  sourceChipText: { fontSize: Font.body, fontWeight: '600', color: Color.text },
  sourceChipTextActive: { color: '#FFF', fontWeight: '700' },

  /* ── List ── */
  listContent: { paddingBottom: 32 },
  listHeader: { paddingTop: 0 },

  /* ── Skeletons ── */
  skelWrap: { paddingTop: 8 },

  /* ── Empty ── */
  empty: { paddingTop: 52, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Color.border, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 17, fontWeight: '700', color: Color.text },
  emptySub: { fontSize: 13, color: Color.textMuted, textAlign: 'center' },
  emptyBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, backgroundColor: Color.primary, flexDirection: 'row', alignItems: 'center', gap: 6, ...Shadow.card },
  emptyBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
