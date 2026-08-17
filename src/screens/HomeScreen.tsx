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
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FEEDS, fetchAllFeeds } from '../services/feeds';
import { fetchVideos } from '../services/videos';
import type { FeedItem, VideoItem } from '../types';
import { Color, Font, Radius, Shadow } from '../constants/theme';
import ArticleCard from '../components/ArticleCard';
import FeaturedCard from '../components/FeaturedCard';
import SectionHeader from '../components/SectionHeader';
import SkeletonCard from '../components/SkeletonCard';
import VideoCard from '../components/VideoCard';

type Props = { navigation: NativeStackNavigationProp<any> };

// Slide carousel phải width pixel explicit — '100%' trong horizontal FlatList
// là circular (content container tính width theo children) → collapse 0
const HERO_W = Dimensions.get('window').width - 24; // listHeader paddingHorizontal 12

// Unified categories from feeds
const CATEGORIES = ['Tất cả', ...new Set(FEEDS.map((f) => f.category))];
const SOURCES = ['Tất cả', ...new Set(FEEDS.map((f) => f.name))];


const CATEGORY_COLORS: Record<string, string> = {
  'Tất cả': Color.primary,
  'Việt Nam': '#DA1E37',
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

// Chip components ở module scope (KHÔNG trong HomeScreen) — định nghĩa trong
// component tạo type mới mỗi lần render, phá memo và remount toàn bộ chip
// Tab kiểu báo điện tử (CafeBiz): chữ đỏ gạch chân, không icon
const CategoryChip = React.memo(({ category, active, onPress }: { category: string; active: boolean; onPress: (c: string) => void }) => (
  <TouchableOpacity
    style={[styles.categoryTab, active && styles.categoryTabActive]}
    onPress={() => onPress(category)}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <Text style={[styles.categoryTabText, active && styles.categoryTabTextActive]}>{category}</Text>
  </TouchableOpacity>
));

const SourceChip = React.memo(({ source, active, onPress }: { source: string; active: boolean; onPress: (s: string) => void }) => (
  <TouchableOpacity
    style={[styles.sourceChip, active && styles.sourceChipActive]}
    onPress={() => onPress(source)}
    activeOpacity={0.7}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
  >
    <Text style={[styles.sourceChipText, active && styles.sourceChipTextActive]}>{source}</Text>
  </TouchableOpacity>
));

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedSource, setSelectedSource] = useState('Tất cả');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [headerAnim] = useState(new Animated.Value(0));
  const [categoryAnim] = useState(new Animated.Value(0));
  const flatListRef = useRef<FlatList<FeedItem>>(null);

  const load = useCallback(async () => {
    const [data, vids] = await Promise.all([fetchAllFeeds(), fetchVideos()]);
    setItems(data);
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
      const { Haptics } = require('expo-haptics');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [load]);

  const goArticle = useCallback((item: FeedItem) => {
    Keyboard.dismiss();
    navigation.navigate('Article', { item });
  }, [navigation]);

  // CDN chặn phát trực tiếp (mp4 400, hls.mediacdn.vn IP private) nên mở trang gốc
  const goVideo = useCallback((v: VideoItem) => {
    Linking.openURL(v.link);
  }, []);

  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'Tất cả') {
      result = result.filter((i) => i.category === selectedCategory);
    }
    if (selectedSource !== 'Tất cả') {
      result = result.filter((i) => i.source === selectedSource);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return result;
  }, [items, selectedCategory, selectedSource, searchQuery]);

  // Carousel tin nổi bật: top 5 bài mới nhất có ảnh; phần còn lại xuống list
  const { heroes, rest } = useMemo(() => {
    const heroes = filtered.filter((i) => i.image).slice(0, 5);
    const heroSet = new Set(heroes);
    return { heroes, rest: filtered.filter((i) => !heroSet.has(i)) };
  }, [filtered]);
  const [heroIdx, setHeroIdx] = useState(0);
  const heroListRef = useRef<FlatList<FeedItem>>(null);
  const heroIdxRef = useRef(0); // mirror của heroIdx cho interval (đọc state trong setInterval không đáng tin)
  const heroAutoRef = useRef(false); // true khi đang scroll chương trình: onScroll không được ghi heroIdx ngược lại

  // Auto-slide mỗi 4s. Scroll trực tiếp từ interval, KHÔNG qua useEffect([heroIdx]):
  // smooth scroll (web) phát onScroll với offset trung gian → round() ra index cũ
  // → setHeroIdx(index cũ) → scroll ngược lại → oscillation, carousel đứng yên.
  useEffect(() => {
    if (heroes.length < 2) return;
    const t = setInterval(() => {
      const next = (heroIdxRef.current + 1) % heroes.length;
      heroIdxRef.current = next;
      heroAutoRef.current = true;
      setHeroIdx(next);
      heroListRef.current?.scrollToOffset({ offset: next * HERO_W, animated: true });
      setTimeout(() => { heroAutoRef.current = false; }, 600); // > thời gian smooth scroll (~300-400ms)
    }, 4000);
    return () => clearInterval(t);
  }, [heroes.length]);

  const stats = useMemo(() => ({
    total: items.length,
    sources: new Set(items.map((i) => i.source)).size,
    categories: new Set(items.map((i) => i.category).filter(Boolean)).size,
  }), [items]);

  const renderItem = useCallback(({ item }: { item: FeedItem }) => <ArticleCard item={item} onPress={goArticle} />, [goArticle]);

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
              <Ionicons name="flash" size={18} color={Color.hot} />
            </View>
            <View>
              <Text style={styles.brand}>NewsSummarizer</Text>
              <Text style={styles.brandSub}>Tin nhanh · Tóm tắt bằng AI</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => { Keyboard.dismiss(); setShowSearchModal(true); }} activeOpacity={0.7} accessibilityLabel="Tìm kiếm">
              <Ionicons name="search-outline" size={20} color="#FFF" />
            </TouchableOpacity>
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

      {/* Section VIDEO — crawl từ video.kenh14.vn, RSS không có video/live */}
      {videos.length > 0 && (
        <View style={styles.videoSection}>
          <View style={styles.videoHeader}>
            <View style={styles.videoLabel}>
              <Ionicons name="videocam" size={13} color="#FFF" />
              <Text style={styles.videoLabelText}>VIDEO</Text>
            </View>
            <Text style={styles.videoSub}>mở tại nguồn</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.videoScroll}>
            {videos.map((v) => (
              <View key={v.link} style={styles.videoCardWrap}>
                <VideoCard item={v} onPress={goVideo} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Source Modal */}
      {showSourceModal && (
        <Pressable style={styles.modalOverlay} onPress={() => setShowSourceModal(false)} accessibilityElementsHidden={true}>
          <Pressable
            style={[
              styles.modalContent,
              { marginBottom: insets.bottom },
              { transform: [{ translateY: showSourceModal ? 0 : 400 }] },
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
      )}

      {/* Search Modal */}
      {showSearchModal && (
        <Pressable style={styles.modalOverlay} onPress={() => setShowSearchModal(false)} accessibilityElementsHidden={true}>
          <Pressable
            style={[
              styles.modalContent,
              { marginBottom: insets.bottom },
              { transform: [{ translateY: showSearchModal ? 0 : 400 }] },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tìm kiếm</Text>
              <TouchableOpacity onPress={() => setShowSearchModal(false)} style={styles.modalClose} accessibilityLabel="Đóng">
                <Ionicons name="close" size={22} color={Color.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search-outline" size={20} color={Color.textMuted} style={styles.searchInputIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Tìm tiêu đề, nội dung bài viết..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoComplete="off"
                placeholderTextColor={Color.textMuted}
              />
              {searchQuery && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn} accessibilityLabel="Xóa">
                  <Ionicons name="close-circle" size={22} color={Color.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.searchHint}>
              <Ionicons name="information-circle-outline" size={13} color={Color.textMuted} />
              <Text style={styles.searchHintText}>Kết quả: {filtered.length} bài</Text>
            </View>
          </Pressable>
        </Pressable>
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
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {heroes.length > 0 && (
                <View style={styles.heroWrap}>
                  <FlatList
                    ref={heroListRef}
                    data={heroes}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.link}
                    renderItem={({ item }) => (
                      <View style={styles.heroSlide}>
                        <FeaturedCard item={item} onPress={goArticle} />
                      </View>
                    )}
                    // onScroll thay vì onMomentumScrollEnd — web (react-native-web)
                    // không có momentum events, indicator sẽ không bao giờ cập nhật
                    scrollEventThrottle={100}
                    onScroll={(e) => {
                      const w = e.nativeEvent.layoutMeasurement.width || 1;
                      const idx = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.x / w), 0), heroes.length - 1);
                      if (idx !== heroIdx) setHeroIdx(idx);
                    }}
                  />
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

  // Header — gradient cam đỏ kiểu Kenh14 (LinearGradient bọc ngoài)
  header: {
    paddingHorizontal: 16,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
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
  refreshSpin: { transform: [{ rotate: '360deg' }] },

  // Category Bar — tab gạch chân cam kiểu menu báo điện tử
  categoryBar: { backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  categoryContent: { paddingHorizontal: 12 },
  categoryTab: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  categoryTabActive: { borderBottomColor: Color.hot },
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

  // Search Modal
  searchInputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: Color.surfaceAlt, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12 },
  searchInputIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: Font.body, color: Color.text, paddingVertical: 8 },
  searchClearBtn: { padding: 4 },
  searchHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  searchHintText: { fontSize: Font.caption, color: Color.textMuted },

  // Source Chips (in modal)
  sourceChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: Color.surfaceAlt, borderWidth: 1, borderColor: Color.border },
  sourceChipActive: { backgroundColor: Color.primarySoft, borderColor: Color.primary },
  sourceChipText: { fontSize: Font.body, fontWeight: '600', color: Color.text },
  sourceChipTextActive: { color: Color.primary, fontWeight: '700' },

  // List
  listContent: { paddingBottom: 32 },
  listHeader: { paddingHorizontal: 12, paddingTop: 4 },
  heroWrap: { marginBottom: 8 },
  heroSlide: { width: HERO_W },
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