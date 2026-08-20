import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FEEDS, fetchAllFeeds, readFeedsCache, SOURCE_COLORS } from '../services/feeds';
import { fetchVideos } from '../services/videos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { KEYS } from '../services/storage';
import type { FeedItem, VideoItem } from '../types';
import { Color, Font, Radius, Shadow, THEME_COLORS, useTheme } from '../constants/theme';
import ArticleCard from '../components/ArticleCard';
import FeaturedCard from '../components/FeaturedCard';
import SectionHeader from '../components/SectionHeader';
import SkeletonCard from '../components/SkeletonCard';
import VideoCard from '../components/VideoCard';
import VideoModal from '../components/VideoModal';

type Props = { navigation: NativeStackNavigationProp<any> };

// Slide carousel phải width pixel explicit — '100%' trong horizontal FlatList
// là circular (content container tính width theo children) → collapse 0
const HERO_W = Dimensions.get('window').width - 24; // listHeader paddingHorizontal 12

// Unified categories from feeds
const CATEGORIES = ['Tất cả', ...new Set(FEEDS.map((f) => f.category))];
const SOURCES = ['Tất cả', ...new Set(FEEDS.map((f) => f.name))];


// Mỗi category đúng 1 trong 7 màu chủ đạo (THEME_COLORS) — 7 mục, 7 màu, không trùng
const CATEGORY_COLORS: Record<string, string> = {
  'Tất cả': '#FB512A',      // Cam Kenh14
  'Việt Nam': '#DC2626',    // Đỏ thời sự
  'Công nghệ': '#7C3AED',   // Tím
  'Kinh doanh': '#D97706',  // Vàng đồng
  'Thể thao': '#059669',    // Xanh lá
  'Giải trí': '#DB2777',    // Hồng
  'Sức khỏe': '#2563EB',    // Xanh biển
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
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return `${days[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

// Chip components ở module scope (KHÔNG trong HomeScreen) — định nghĩa trong
// component tạo type mới mỗi lần render, phá memo và remount toàn bộ chip
// Tab kiểu báo điện tử (CafeBiz): gạch chân + icon theo màu riêng từng category
const CategoryChip = React.memo(({ category, active, onPress }: { category: string; active: boolean; onPress: (c: string) => void }) => {
  const c = CATEGORY_COLORS[category] || Color.hot;
  return (
  <TouchableOpacity
    style={[styles.categoryTab, active && { borderBottomColor: c }]}
    onPress={() => onPress(category)}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <Ionicons
      name={CATEGORY_ICONS[category] || 'newspaper'}
      size={15}
      color={active ? c : Color.textSecondary}
      style={styles.categoryTabIcon}
    />
    <Text style={[styles.categoryTabText, active && { color: c, fontWeight: '800' }]}>{category}</Text>
  </TouchableOpacity>
  );
});

// Chip nguồn báo: mỗi báo 1 màu thương hiệu (SOURCE_COLORS) — đồng bộ badge trên card
const SourceChip = React.memo(({ source, active, onPress }: { source: string; active: boolean; onPress: (s: string) => void }) => {
  const c = source === 'Tất cả' ? Color.hot : SOURCE_COLORS[source] || Color.hot;
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

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const styles = makeStyles(useTheme()); // styles động theo dark mode
  const [items, setItems] = useState<FeedItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedSource, setSelectedSource] = useState('Tất cả');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [hasSearchText, setHasSearchText] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const searchTextRef = useRef('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerAnim] = useState(new Animated.Value(0));
  const [categoryAnim] = useState(new Animated.Value(0));
  const flatListRef = useRef<FlatList<FeedItem>>(null);

  // Dọn debounce timer khi unmount
  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const load = useCallback(async () => {
    // Cache trước: có tin cũ hiện ngay (vài ms), fetch mạng chạy tiếp rồi thay
    const cached = await readFeedsCache();
    if (cached.length) setItems(cached);
    const [data, vids] = await Promise.all([fetchAllFeeds(), fetchVideos()]);
    if (data.length) setItems(data);
    setVideos(vids);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    // Staggered entrance animations — native driver: chạy UI thread, không giật khi JS bận
    Animated.sequence([
      Animated.timing(headerAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(categoryAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    // Haptic feedback on refresh complete
    if (Platform.OS !== 'web') {
      const Haptics = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [load]);

  const goArticle = useCallback((item: FeedItem) => {
    Keyboard.dismiss();
    navigation.navigate('Article', { item });
  }, [navigation]);

  // Mọi video đều mở popup: có stream HLS (VNExpress) thì phát trong app,
  // không có (Kenh14/Soha — CDN DRM) thì popup hiện thumb + nút mở tại nguồn
  const [videoModal, setVideoModal] = useState<VideoItem | null>(null);
  const goVideo = useCallback((v: VideoItem) => setVideoModal(v), []);

  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'Tất cả') {
      result = result.filter((i) => i.category === selectedCategory);
    }
    if (selectedSource !== 'Tất cả') {
      result = result.filter((i) => i.source === selectedSource);
    }
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return result;
  }, [items, selectedCategory, selectedSource, debouncedQuery]);

  // Carousel TIN NỔI BẬT: bài từ feed nổi bật (featured) trước, sau đó bài mới nhất
  // có ảnh lấp đầy cho đủ 5. "Nhiều người đọc nhất" không có RSS (đã dò các báo đều
  // 404) nên dùng feed nổi bật của tòa soạn làm proxy. Phần còn lại xuống list.
  const { heroes, rest } = useMemo(() => {
    const withImg = filtered.filter((i) => i.image);
    const feat = withImg.filter((i) => i.featured);
    const heroes = feat.concat(withImg.filter((i) => !i.featured)).slice(0, 5);
    const heroSet = new Set(heroes);
    return { heroes, rest: filtered.filter((i) => !heroSet.has(i)) };
  }, [filtered]);
  const [heroIdx, setHeroIdx] = useState(0);
  const heroListRef = useRef<FlatList<FeedItem>>(null);
  const heroIdxRef = useRef(0); // mirror của heroIdx cho interval (đọc state trong setInterval không đáng tin)
  const heroAutoRef = useRef(false); // true khi đang scroll chương trình: onScroll không được ghi heroIdx ngược lại
  const lastManualRef = useRef(0); // thời điểm bấm mũi tên — interval nhường người dùng 4s

  // Auto-slide mỗi 4s. Scroll trực tiếp từ interval, KHÔNG qua useEffect([heroIdx]):
  // smooth scroll (web) phát onScroll với offset trung gian → round() ra index cũ
  // → setHeroIdx(index cũ) → scroll ngược lại → oscillation, carousel đứng yên.
  useEffect(() => {
    if (heroes.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() - lastManualRef.current < 4000) return; // vừa bấm mũi tên xong
      const next = (heroIdxRef.current + 1) % heroes.length;
      heroIdxRef.current = next;
      heroAutoRef.current = true;
      setHeroIdx(next);
      heroListRef.current?.scrollToOffset({ offset: next * HERO_W, animated: true });
      setTimeout(() => { heroAutoRef.current = false; }, 600); // > thời gian smooth scroll (~300-400ms)
    }, 4000);
    return () => clearInterval(t);
  }, [heroes.length]);

  // Mũi tên qua lại: modulo để slide cuối quay về slide đầu (và ngược lại)
  const goHero = useCallback((delta: number) => {
    const n = heroes.length;
    if (n < 2) return;
    const next = (heroIdxRef.current + delta + n) % n;
    heroIdxRef.current = next;
    heroAutoRef.current = true;
    lastManualRef.current = Date.now();
    setHeroIdx(next);
    heroListRef.current?.scrollToOffset({ offset: next * HERO_W, animated: true });
    setTimeout(() => { heroAutoRef.current = false; }, 600);
  }, [heroes.length]);

  // Video nổi bật lên đầu strip: video từ box "Video nổi bật" (VNExpress) trước,
  // còn lại giữ thứ tự crawl. Một strip duy nhất, không nhân đôi section.
  const sortedVideos = useMemo(() => {
    const feat = videos.filter((v) => v.zone === 'Video nổi bật');
    return feat.concat(videos.filter((v) => v.zone !== 'Video nổi bật'));
  }, [videos]);

  const stats = useMemo(() => ({
    total: items.length,
    sources: new Set(items.map((i) => i.source)).size,
    categories: new Set(items.map((i) => i.category).filter(Boolean)).size,
  }), [items]);

  const renderItem = useCallback(({ item }: { item: FeedItem }) => <ArticleCard item={item} onPress={goArticle} />, [goArticle]);
  const heroRenderItem = useCallback(({ item }: { item: FeedItem }) => (
    <View style={styles.heroSlide}>
      <FeaturedCard item={item} onPress={goArticle} />
    </View>
  ), [goArticle]);

  // onScroll carousel — useCallback để listHeader memo không đổi identity mỗi render
  const handleHeroScroll = useCallback((e: any) => {
    const w = e.nativeEvent.layoutMeasurement.width || 1;
    const idx = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.x / w), 0), 4);
    setHeroIdx((prev) => (prev === idx ? prev : idx));
  }, []);

  // Header của list (video + hero carousel + section) — memo để FlatList không
  // rebuild lại cả khối mỗi lần re-render (nguyên nhân VirtualizedList slow update)
  const listHeader = useMemo(() => (
    <View style={styles.listHeader}>
      {/* Section VIDEO NỔI BẬT — crawl từ video.kenh14.vn / soha / video.vnexpress.net,
          RSS không có video/live. Video từ box "Video nổi bật" gắn badge HOT, lên đầu.
          Nằm trong ListHeaderComponent để cuộn cùng danh sách tin. */}
      {sortedVideos.length > 0 && (
        <View style={styles.videoSection}>
          <View style={styles.videoHeader}>
            <View style={styles.videoLabel}>
              <Ionicons name="videocam" size={13} color="#FFF" />
              <Text style={styles.videoLabelText}>VIDEO NỔI BẬT</Text>
            </View>
            <Text style={styles.videoSub}>mở tại nguồn</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.videoScroll}>
            {sortedVideos.map((v) => (
              <View key={v.link} style={styles.videoCardWrap}>
                <VideoCard item={v} onPress={goVideo} featured={v.zone === 'Video nổi bật'} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      {heroes.length > 0 && (
        <View style={styles.heroWrap}>
          <FlatList
            ref={heroListRef}
            data={heroes}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.link}
            renderItem={heroRenderItem}
            // onScroll thay vì onMomentumScrollEnd — web (react-native-web)
            // không có momentum events, indicator sẽ không bao giờ cập nhật
            scrollEventThrottle={100}
            onScroll={handleHeroScroll}
          />
          {heroes.length > 1 && (
            <>
              <TouchableOpacity style={[styles.heroArrow, styles.heroArrowLeft]} onPress={() => goHero(-1)} activeOpacity={0.7} accessibilityLabel="Tin trước">
                <Ionicons name="chevron-back" size={20} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.heroArrow, styles.heroArrowRight]} onPress={() => goHero(1)} activeOpacity={0.7} accessibilityLabel="Tin sau">
                <Ionicons name="chevron-forward" size={20} color="#FFF" />
              </TouchableOpacity>
            </>
          )}
          {heroes.length > 1 && (
            <View style={styles.heroDots}>
              {heroes.map((h, i) => (
                <View key={h.link} style={[styles.heroDot, i === heroIdx && styles.heroDotActive]} />
              ))}
            </View>
          )}
        </View>
      )}
      <SectionHeader title={filtered.length ? 'TIN MỚI NHẤT' : 'KHÔNG CÓ DỮ LIỆU'} />
    </View>
  ), [sortedVideos, heroes, heroIdx, filtered.length, goVideo, goHero, heroRenderItem, handleHeroScroll]);

  // Callback ổn định cho chip (memo chỉ hiệu quả khi onPress không đổi)
  const handleCategoryPress = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedSource('Tất cả');
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  const handleSourcePress = useCallback((source: string) => {
    setSelectedSource(source);
    setShowSourceModal(false);
  }, []);

  // Uncontrolled input + ref: gõ không re-render cả màn hình, hết khựng.
  // Ngừng gõ 600ms mới lọc (debounce kiểu TikTok).
  const handleSearchChange = useCallback(async (text: string) => {
    searchTextRef.current = text;
    const had = text.length > 0;
    setHasSearchText((prev) => (prev === had ? prev : had));
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(text), 600);
    if (text.trim() === '016527') {
      // Hủy debounce timer vừa đặt ở trên — không thì 600ms sau nó set
      // debouncedQuery='016527' đè lên reset bên dưới → lọc ra 0 bài
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

  return (
    <Animated.View style={[styles.root, { opacity: headerAnim }]}>
      {/* Sticky Header — gradient cam đỏ kiểu Kenh14, trẻ trung nổi bật */}
      <LinearGradient
        colors={[Color.hot, Color.hotDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}
      >
        {/* Row 1: Brand + actions */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.logoBadge}>
              <Ionicons name="sparkles" size={18} color={Color.hot} />
            </View>
            <View>
              <Text style={styles.brand}>NewsSummarizer</Text>
              <Text style={styles.brandSub}>Tin nhanh · Tóm tắt bằng AI</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={onRefresh} activeOpacity={0.7} accessibilityLabel="Làm mới" disabled={refreshing}>
              <Ionicons name={refreshing ? "refresh-circle" : "refresh-outline"} size={20} color="#FFF" style={refreshing ? styles.refreshSpin : {}} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Row 2: Date + stats */}
        <View style={styles.headerRow2}>
          <View style={styles.dateWrap}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={styles.date}>{today()}</Text>
          </View>
          <Text style={styles.statsText}>{stats.total} bài · {stats.sources} nguồn</Text>
        </View>

        {/* Dải 7 màu chủ đạo — signature của app */}
        <View style={styles.themeStrip}>
          {THEME_COLORS.map((t) => (
            <View key={t.key} style={[styles.themeStripSeg, { backgroundColor: t.color }]} />
          ))}
        </View>

        {/* Search inline — gõ lọc trực tiếp, không modal (input nằm trên cao
            nên keyboard không che). Uncontrolled + debounce 600ms như cũ */}
        <View style={styles.searchPill}>
          <Ionicons name="search" size={17} color={Color.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInputInline}
            placeholder="Tìm kiếm tin tức..."
            placeholderTextColor={Color.textMuted}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Tìm kiếm"
          />
          {hasSearchText && (
            <Pressable onPress={() => { searchInputRef.current?.clear(); searchTextRef.current = ''; setHasSearchText(false); setDebouncedQuery(''); }} hitSlop={8} accessibilityLabel="Xóa tìm kiếm">
              <Ionicons name="close-circle" size={18} color={Color.textMuted} />
            </Pressable>
          )}
        </View>

      </LinearGradient>

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
            <CategoryChip category={item} active={selectedCategory === item} onPress={handleCategoryPress} />
          )}
        />
      </Animated.View>

      {/* Source Selector Trigger */}
      <TouchableOpacity style={styles.sourceTrigger} onPress={() => { Keyboard.dismiss(); setShowSourceModal(true); }} activeOpacity={0.8} accessibilityLabel="Chọn nguồn tin">
        <View style={styles.sourceTriggerLeft}>
          <Ionicons name="funnel-outline" size={15} color={Color.hot} />
          <Text style={styles.sourceTriggerText}>Nguồn:</Text>
          <View style={[styles.sourceTriggerDot, { backgroundColor: selectedSource === 'Tất cả' ? Color.hot : SOURCE_COLORS[selectedSource] || Color.hot }]} />
          <Text style={styles.sourceTriggerValue}>{selectedSource}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={Color.textMuted} />
      </TouchableOpacity>

      {/* Strip TIN NÓNG — ticker bài mới nhất, kiểu breaking news */}
      {heroes.length > 0 && (
        <View style={styles.hotStrip}>
          <View style={styles.hotLabel}>
            <Ionicons name="flash" size={12} color="#FFF" />
            <Text style={styles.hotLabelText}>TIN NÓNG</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hotScroll}>
            {heroes.map((h) => (
              <TouchableOpacity key={h.link} style={styles.hotItem} onPress={() => goArticle(h)} activeOpacity={0.7}>
                <Text style={styles.hotItemText} numberOfLines={1}>{h.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Source Modal */}
      {showSourceModal && (
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSourceModal(false)} accessibilityElementsHidden={true}>
            <Pressable
              style={[
                styles.modalContent,
                { marginBottom: insets.bottom },
              ]}
              onPress={(e) => e.stopPropagation()}
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
                <SourceChip source={item} active={selectedSource === item} onPress={handleSourcePress} />
              )}
              contentContainerStyle={styles.modalListContent}
            />
            </Pressable>
          </Pressable>
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
          keyExtractor={(item) => item.link}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={listHeader}
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
          // Perf: render vừa đủ + window nhỏ, card đã memo → scroll nhẹ
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}

      {/* Popup phát video nổi bật (HLS) trong app */}
      {videoModal && <VideoModal video={videoModal} onClose={() => setVideoModal(null)} />}
    </Animated.View>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg },

  // Header — gradient cam đỏ kiểu Kenh14 (LinearGradient bọc ngoài)
  header: {
    paddingHorizontal: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  searchPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, backgroundColor: Color.card, paddingHorizontal: 16, marginTop: 12, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 }, android: { elevation: 4 } }) },
  searchInputInline: { flex: 1, fontSize: Font.body, color: Color.text, paddingVertical: 0, maxHeight: 44 },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: -0.5 },
  brandSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600', marginTop: 1 },
  dateWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  date: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  statsText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  // Dải 7 màu chủ đạo ở đáy header
  themeStrip: { flexDirection: 'row', marginTop: 12, marginHorizontal: -16, marginBottom: -12, height: 4 },
  themeStripSeg: { flex: 1 },
  refreshSpin: { transform: [{ rotate: '360deg' }] },

  // Category Bar — tab gạch chân cam kiểu menu báo điện tử
  categoryBar: { backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  categoryContent: { paddingHorizontal: 12 },
  categoryTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  categoryTabActive: { borderBottomColor: Color.hot },
  categoryTabIcon: { marginRight: 5 },
  categoryTabText: { fontSize: Font.body, fontWeight: '600', color: Color.textSecondary },
  categoryTabTextActive: { color: Color.hot, fontWeight: '800' },

  // Source Trigger
  sourceTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  sourceTriggerLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sourceTriggerDot: { width: 8, height: 8, borderRadius: 4 },
  sourceTriggerText: { fontSize: Font.caption, color: Color.textSecondary },
  sourceTriggerValue: { fontWeight: '700', color: Color.hot },

  // Strip TIN NÓNG
  hotStrip: { flexDirection: 'row', alignItems: 'center', backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border, paddingVertical: 8 },
  hotLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Color.hot, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm, marginHorizontal: 12 },
  hotLabelText: { fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  hotScroll: { gap: 16, paddingRight: 16, alignItems: 'center' },
  hotItem: { maxWidth: 260 },
  hotItemText: { fontSize: Font.caption, fontWeight: '600', color: Color.text },

  // Section VIDEO
  videoSection: { backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border, paddingTop: 12, paddingBottom: 14 },
  videoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginBottom: 10 },
  videoLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Color.hotDark, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.sm },
  videoLabelText: { fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  videoSub: { fontSize: Font.tiny, color: Color.textMuted },
  videoScroll: { paddingHorizontal: 12, gap: 10 },
  videoCardWrap: { width: 220 },

  // Modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
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

  // Source Chips (in modal) — màu active theo thương hiệu báo (inline style)
  sourceChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: Color.surfaceAlt, borderWidth: 1, borderColor: Color.border },
  sourceChipText: { fontSize: Font.body, fontWeight: '600', color: Color.text },
  sourceChipTextActive: { color: '#FFF', fontWeight: '700' },

  // List
  listContent: { paddingBottom: 32 },
  listHeader: { paddingHorizontal: 12, paddingTop: 4 },
  heroWrap: { marginBottom: 8 },
  heroSlide: { width: HERO_W },
  heroArrow: {
    position: 'absolute', top: 87, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  heroArrowLeft: { left: 8 },
  heroArrowRight: { right: 8 },
  heroDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  heroDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Color.border },
  heroDotActive: { width: 18, backgroundColor: Color.primary },

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

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);