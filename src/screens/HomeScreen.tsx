import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
  Dimensions,
  AccessibilityInfo,
  AppState,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useScrollToTop } from "@react-navigation/native";
import {
  FEEDS,
  fetchAllFeeds,
  readFeedsCache,
  isFeedsCacheFresh,
  SOURCE_COLORS,
} from "../services/feeds";
import { useAlert } from "../components/AppAlert";
import { prefetchArticleContent, isVideoPageUrl } from "../services/summarize";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KEYS } from "../services/storage";
import type { FeedItem } from "../types";
import { Color, Font, Radius, Shadow, useTheme } from "../constants/theme";
import { timeAgo } from "../utils/timeAgo";
import ArticleCardCompact from "../components/ArticleCardCompact";
import FeaturedCard from "../components/FeaturedCard";
import SkeletonCard from "../components/SkeletonCard";
import SourceLogo from "../components/SourceLogo";

type Props = { navigation: NativeStackNavigationProp<any> };

// Cờ E2E — tắt auto-play (marquee, carousel) trong Playwright để click không bị timeout
const E2E =
  typeof globalThis !== "undefined" && (globalThis as any).__E2E__ === true;

const getHeroWidth = (insets: { left: number; right: number }) =>
  Dimensions.get("window").width - insets.left - insets.right;

const CATEGORIES = ["Tất cả", ...new Set(FEEDS.map((f) => f.category))];

const CATEGORY_COLORS: Record<string, string> = {
  "Tất cả": "#FB512A",
  "Việt Nam": "#DC2626",
  "Công nghệ": "#7C3AED",
  "Kinh doanh": "#D97706",
  "Thể thao": "#059669",
  "Giải trí": "#DB2777",
  "Sức khỏe": "#2563EB",
};


const CATEGORY_ICONS: Record<
  string,
  React.ComponentProps<typeof Ionicons>["name"]
> = {
  "Tất cả": "apps",
  "Việt Nam": "flag",
  "Công nghệ": "hardware-chip",
  "Kinh doanh": "briefcase",
  "Thể thao": "football",
  "Giải trí": "film",
  "Sức khỏe": "medkit",
};

// Row trộn loại trong FlatList TIN MỚI NHẤT ở chế độ lướt: header chủ đề /
// bài báo / nút "Xem thêm". FeedItem thường vẫn là một loại hợp lệ.
type HomeRow =
  | FeedItem
  | { kind: "h"; cat: string }
  | { kind: "more"; cat: string; hidden: number };
const LIST_COLLAPSED = 3; // số bài mỗi chủ đề trước khi "Xem thêm"

const today = () => {
  const d = new Date();
  const days = [
    "Chủ nhật",
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
  ];
  const months = [
    "Th 1",
    "Th 2",
    "Th 3",
    "Th 4",
    "Th 5",
    "Th 6",
    "Th 7",
    "Th 8",
    "Th 9",
    "Th 10",
    "Th 11",
    "Th 12",
  ];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
};

/* ─── Category chip ─── */

const CategoryChip = React.memo(
  ({
    category,
    active,
    onPress,
    styles,
  }: {
    category: string;
    active: boolean;
    onPress: (c: string) => void;
    styles: ReturnType<typeof makeStyles>;
  }) => {
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
          name={CATEGORY_ICONS[category] || "newspaper"}
          size={13}
          color={active ? "#FFF" : c}
          style={styles.pillIcon}
        />
        <Text style={[styles.pillText, active && styles.pillTextActive]}>
          {category}
        </Text>
      </TouchableOpacity>
    );
  },
);

/* ─── Source dropdown ─── */

const SourceDropdown = React.memo(
  ({
    value,
    onChange,
    styles,
    options,
  }: {
    value: string;
    onChange: (s: string) => void;
    styles: ReturnType<typeof makeStyles>;
    options: string[];
  }) => {
    const C = useTheme();
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
    const triggerRef = useRef<View>(null);
    const openDropdown = useCallback(() => {
      triggerRef.current?.measureInWindow((x, y, w, h) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      });
    }, []);
    const currentColor =
      value === "Tất cả" ? C.hot : SOURCE_COLORS[value] || C.hot;
    return (
      <View style={styles.dropdownWrap}>
        <TouchableOpacity
          ref={triggerRef as any}
          style={[styles.dropdownButton, { borderColor: currentColor }]}
          onPress={openDropdown}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="Lọc theo nguồn tin"
        >
          {value === "Tất cả" ? (
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                backgroundColor: currentColor + "22",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="funnel-outline" size={12} color={currentColor} />
            </View>
          ) : (
            <SourceLogo source={value} color={currentColor} size={20} />
          )}
          <Text style={[styles.dropdownValue, { color: currentColor }]} numberOfLines={1}>{value}</Text>
          <Ionicons name="chevron-down" size={14} color={C.textMuted} />
        </TouchableOpacity>

        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <View style={styles.sourceModalOverlay}>
            <TouchableOpacity style={styles.sourceModalBackdrop} activeOpacity={1} onPress={() => setOpen(false)} accessibilityLabel="Đóng chọn nguồn" />
            <View style={[styles.sourceModalSheet, anchor && { position: "absolute", top: anchor.y + anchor.h + 6, left: Math.max(8, anchor.x), right: undefined, width: Math.max(220, anchor.w), maxWidth: 360 }]} testID="sourceDropdownPanel">
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.sourceModalGrid} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {options.map((src) => {
                  const active = src === value;
                  const sc = src === "Tất cả" ? C.hot : SOURCE_COLORS[src] || C.hot;
                  return (
                    <TouchableOpacity key={src} style={[styles.sourceChip, active && { backgroundColor: sc, borderColor: sc }]}
                      onPress={() => { onChange(src); setOpen(false); }}
                      activeOpacity={0.7} accessibilityRole="button" testID={"sourceOption-" + src} accessibilityState={{ selected: active }}>
                      {src === "Tất cả" ? <Ionicons name="flash" size={14} color={active ? "#FFF" : sc} /> : <SourceLogo source={src} color={sc} size={22} active={active} />}
                      <Text style={[styles.sourceChipText, active && styles.sourceChipTextActive]} numberOfLines={1}>{src}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    );
  },
);

/* ─── Trend small card (strip ngang) ─── */

// Card dọc gọn cho strip ngang: ảnh 16:9 + meta (nguồn, giờ) + title 2 dòng.
// Nội dung lấy từ `rest` — khác hẳn hero carousel.
const TrendSmallCard = React.memo(
  ({
    item,
    onPress,
    styles,
  }: {
    item: FeedItem;
    onPress: (i: FeedItem) => void;
    styles: ReturnType<typeof makeStyles>;
  }) => {
    const C = useTheme();
    const t = timeAgo(item.pubDate);
    const srcColor = SOURCE_COLORS[item.source] || C.hot;
    const isVideo = isVideoPageUrl(item.link);
    return (
      <TouchableOpacity
        style={styles.trendSmallCard}
        onPress={() => onPress(item)}
        activeOpacity={0.85}
      >
        <View style={styles.trendSmallImgWrap}>
          {item.image ? (
            <Image
              source={{ uri: item.image }}
              style={styles.trendSmallImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.trendSmallImg, styles.trendSmallImgPh]}>
              <Ionicons name="image-outline" size={20} color={C.textMuted} />
            </View>
          )}
          {isVideo ? (
            <View style={styles.videoBadge} accessibilityLabel="Video">
              <Ionicons name="play" size={9} color="#FFF" />
            </View>
          ) : null}
        </View>
        <View style={styles.trendSmallBody}>
          <View style={styles.trendSmallMeta}>
            <View style={[styles.trendSmallSrcBadge, { backgroundColor: srcColor + "1A" }]}>
              <View style={[styles.trendSmallSrcDot, { backgroundColor: srcColor }]} />
              <Text style={[styles.trendSmallSrc, { color: srcColor }]} numberOfLines={1}>
                {item.source}
              </Text>
            </View>
            {t ? <Text style={styles.trendSmallTime}>{t} trước</Text> : null}
          </View>
          <Text style={styles.trendSmallTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
);

/* ─── Main screen ─── */

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const styles = useMemo(() => makeStyles(C, insets), [C, insets]);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Tất cả");
  const [selectedSource, setSelectedSource] = useState("Tất cả");
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [hasSearchText, setHasSearchText] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchInputRef = useRef<TextInput>(null);
  const searchTextRef = useRef("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Toggle luôn đọc storage (nguồn sự thật) — ref cache 1-lần-lúc-mount bị stale
  // khi tab/phiên khác bật/tắt cờ → nhập mã lần nào cũng "Đã mở khóa".
  // Chain nối tiếp các lần toggle: 2 press liên tiếp không interleave (read-old-write).
  const unlockChainRef = useRef<Promise<void>>(Promise.resolve());
  const [headerAnim] = useState(new Animated.Value(0));
  const [categoryAnim] = useState(new Animated.Value(0));
  const flatListRef = useRef<FlatList<HomeRow>>(null);
  // Bấm lại icon tab Trang chủ khi đang ở tab này → scroll về đầu trang
  useScrollToTop(flatListRef);
  const { showAlert } = useAlert();

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    },
    [],
  );
  const load = useCallback(async () => {
    const cached = await readFeedsCache();
    if (cached.length) {
      setItems(cached);
      setLoading(false); // có cache → hiện ngay (stale-while-revalidate), fetch mới chạy nền
    }
    // Cache vừa ghi (< 1 phút) → KHÔNG fetch lại 44 feed
    if (await isFeedsCacheFresh()) {
      if (!cached.length) setItems([]);
      return;
    }
    if (!cached.length) {
      // COLD: màn hình đang skeleton → stream partial, hiện sớm từng phần
      const data = await fetchAllFeeds((partial) => {
        if (partial.length) {
          setLoading(false);
        }
        setItems(partial);
      });
      if (data.length) setItems(data);
      return;
    }
    // WARM: nội dung cache đang hiện → fetch nền IM LẶNG, chỉ setItems MỘT
    // lần khi fetch xong. Trước đây mỗi partial (350ms) đều setItems → content
    // tự xáo/tái render liên tục ~8s (nhìn như app "tự reload") và tap bị nuốt
    // tới khi load xong.
    const data = await fetchAllFeeds();
    if (data.length) setItems(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    Animated.sequence([
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(categoryAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Hiện cache ngay — không chờ 18 feed xong (reload cảm nhận nhanh).
    const cached = await readFeedsCache();
    if (cached.length) setItems(cached);
    // Refresh nền: cập nhật dần qua partial; spinner tắt khi có partial đầu
    // tiên HOẶC tối đa 5s (không để spinner treo tới feed chậm nhất 24s).
    let done = false;
    const finish = () => { if (!done) { done = true; setRefreshing(false); } };
    load().then(finish).catch(finish);
    setTimeout(finish, 5000);
    if (Platform.OS !== "web") {
      const Haptics = require("expo-haptics");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [load]);

  const goArticle = useCallback(
    (item: FeedItem) => {
      Keyboard.dismiss();
      navigation.navigate("Article", { item });
    },
    [navigation],
  );


  // Dropdown nguồn build từ item THẬT đang có (không từ FEEDS tĩnh) — nguồn
  // nào feed chết/hết bài sẽ tự biến mất, feed sống lại thì tự hiện lại.
  // Luôn giữ selectedSource trong list dù đang rỗng (tránh mất lựa chọn khi reload).
  const sources = useMemo(() => {
    const withItems = new Set(items.map((i) => i.source).filter(Boolean));
    if (selectedSource !== "Tất cả") withItems.add(selectedSource);
    return ["Tất cả", ...withItems];
  }, [items, selectedSource]);

  const filtered = useMemo(() => {
    let result = items;
    if (selectedCategory !== "Tất cả")
      result = result.filter((i) => i.category === selectedCategory);
    if (selectedSource !== "Tất cả")
      result = result.filter((i) => i.source === selectedSource);
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q),
      );
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
  // "ĐỌC NHIỀU NHẤT" — lấy từ rest (có ảnh), LOẠI 8 bài mới nhất (đang nằm đầu
  // TIN MỚI NHẤT) rồi xáo ngẫu nhiên lấy 6 → không trùng với danh sách mới nhất.
  const trending = useMemo(() => {
    const pool = rest.filter((i) => i.image);
    const beyond = pool.slice(8); // bỏ 8 bài mới nhất = phần đầu TIN MỚI NHẤT
    const source = beyond.length >= 6 ? beyond : pool;
    const shuffled = [...source];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 6);
  }, [rest]);
  // ── Section hóa TIN MỚI NHẤT theo chủ đề ──
  // Chỉ khi lướt tự do (không lọc nguồn/chủ đề, không tìm kiếm): mỗi chủ đề hiện
  // LIST_COLLAPSED bài + "Xem thêm N tin" (mở rộng inline). Khi lọc, list đã ngắn
  // → giữ phẳng như cũ. Một FlatList duy nhất, rows trộn loại — không thêm list comp.
  const isBrowsing =
    selectedCategory === "Tất cả" &&
    selectedSource === "Tất cả" &&
    !debouncedQuery.trim();
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => new Set());
  const listData = useMemo<HomeRow[]>(() => {
    if (!isBrowsing) return rest;
    const byCat = new Map<string, FeedItem[]>();
    for (const i of rest) {
      const c = i.category || "Khác";
      let arr = byCat.get(c);
      if (!arr) byCat.set(c, (arr = []));
      arr.push(i);
    }
    // thứ tự theo CATEGORIES của FEEDS, chủ đề lạ xếp sau
    const order = [...new Set([...CATEGORIES.slice(1), ...byCat.keys()])];
    const out: HomeRow[] = [];
    for (const c of order) {
      const arr = byCat.get(c);
      if (!arr?.length) continue;
      out.push({ kind: "h", cat: c });
      const shown = expandedCats.has(c) ? arr : arr.slice(0, LIST_COLLAPSED);
      out.push(...shown);
      const hidden = arr.length - shown.length;
      if (hidden > 0) out.push({ kind: "more", cat: c, hidden });
    }
    return out;
  }, [rest, isBrowsing, expandedCats]);

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

  // Đợi load xong mới tự chạy: interval 45ms/4s chạy giữa bão parse lúc cold-start
  // tranh JS thread với tap (nguyên nhân khựng cảm nhận thêm).
  useEffect(() => {
    if (loading || heroes.length < 2 || reduceMotion || E2E) return;
    const heroW = getHeroWidth(insets);
    const t = setInterval(() => {
      if (Date.now() - lastManualRef.current < 4000) return;
      const next = (heroIdxRef.current + 1) % heroes.length;
      heroIdxRef.current = next;
      heroAutoRef.current = true;
      setHeroIdx(next);
      heroListRef.current?.scrollToOffset({
        offset: next * heroW,
        animated: true,
      });
      setTimeout(() => {
        heroAutoRef.current = false;
      }, 600);
    }, 4000);
    return () => clearInterval(t);
  }, [loading, heroes.length, reduceMotion, insets]);

  const goHero = useCallback(
    (delta: number) => {
      const n = heroes.length;
      if (n < 2) return;
      const next = (heroIdxRef.current + delta + n) % n;
      heroIdxRef.current = next;
      heroAutoRef.current = true;
      lastManualRef.current = Date.now();
      setHeroIdx(next);
      heroListRef.current?.scrollToOffset({
        offset: next * getHeroWidth(insets),
        animated: true,
      });
      setTimeout(() => {
        heroAutoRef.current = false;
      }, 600);
    },
    [heroes.length, insets],
  );

  /* Marquee ticker "NÓNG" — tự chạy liên tục; chạm/kéo thì dừng để lướt qua lại,
     thả ra ~2.5s sau tự chạy tiếp. Loop mượt nhờ nhân đôi nội dung. */
  const marqueeScrollRef = useRef<ScrollView>(null);
  const marqueeXRef = useRef(0);
  const marqueeAutoRef = useRef(true);
  const marqueeResumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [marqueeCopyW, setMarqueeCopyW] = useState(0);

  useEffect(() => {
    if (loading || heroes.length < 2 || reduceMotion || marqueeCopyW <= 0 || E2E) return;
    const t = setInterval(() => {
      if (!marqueeAutoRef.current) return;
      let x = marqueeXRef.current + 3; // ~66px/s (3px mỗi 45ms) — đỡ gánh JS thread
      if (x >= marqueeCopyW) x = 0; // hết bản copy 1 → quay về đầu (nội dung giống hệt)
      marqueeXRef.current = x;
      marqueeScrollRef.current?.scrollTo({ x, animated: false });
    }, 45);
    return () => clearInterval(t);
  }, [loading, heroes.length, reduceMotion, marqueeCopyW]);

  useEffect(
    () => () => {
      if (marqueeResumeRef.current) clearTimeout(marqueeResumeRef.current);
    },
    [],
  );

  const marqueePause = useCallback(() => {
    marqueeAutoRef.current = false;
    if (marqueeResumeRef.current) clearTimeout(marqueeResumeRef.current);
  }, []);
  const marqueeResume = useCallback(() => {
    if (marqueeResumeRef.current) clearTimeout(marqueeResumeRef.current);
    marqueeResumeRef.current = setTimeout(() => {
      marqueeAutoRef.current = true;
    }, 2500);
  }, []);
  const marqueeScroll = useCallback((e: any) => {
    marqueeXRef.current = e.nativeEvent.contentOffset.x;
  }, []);

  const handleCategoryPress = useCallback((category: string) => {
    setSelectedCategory(category);
    setSelectedSource("Tất cả");
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);
  const handleSourcePress = useCallback((source: string) => {
    setSelectedSource(source);
    setSelectedCategory("Tất cả");
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleSearchChange = useCallback(
    async (text: string) => {
      searchTextRef.current = text;
      const had = text.length > 0;
      setHasSearchText((prev) => (prev === had ? prev : had));
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(
        () => setDebouncedQuery(text),
        600,
      );
      if (text.trim() === "016527") {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        // Đọc storage mỗi lần bấm — await ở đây an toàn vì chain dưới đây serialized:
        // press #2 xếp hàng sau khi #1 ghi xong, không interleave read-old-write.
        unlockChainRef.current = unlockChainRef.current
          .catch(() => {})
          .then(async () => {
            const on = (await AsyncStorage.getItem(KEYS.aiUnlocked)) === "1";
            if (on) await AsyncStorage.removeItem(KEYS.aiUnlocked);
            else await AsyncStorage.setItem(KEYS.aiUnlocked, "1");
            showAlert({
              type: "success",
              message: on ? "Đã ẩn cấu hình AI trong Cài đặt" : "Đã mở khóa cấu hình AI trong Cài đặt",
            });
          })
          .catch(() => {});
        searchInputRef.current?.clear();
        setSearchText("");
        searchTextRef.current = "";
        setHasSearchText(false);
        setDebouncedQuery("");
        Keyboard.dismiss();
      }
    },
    [showAlert],
  );

  const handleSearchToggle = useCallback(() => {
    setShowSearch((prev) => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        searchInputRef.current?.clear();
        setSearchText("");
        searchTextRef.current = "";
        setHasSearchText(false);
        setDebouncedQuery("");
        Keyboard.dismiss();
      }
      return !prev;
    });
  }, []);

  const heroRenderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <View style={styles.heroSlide}>
        <FeaturedCard item={item} onPress={goArticle} />
      </View>
    ),
    [goArticle, styles],
  );

  const handleHeroScroll = useCallback((e: any) => {
    const w = e.nativeEvent.layoutMeasurement.width || 1;
    const idx = Math.min(
      Math.max(Math.round(e.nativeEvent.contentOffset.x / w), 0),
      4,
    );
    setHeroIdx((prev) => (prev === idx ? prev : idx));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: HomeRow }) => {
      if ("kind" in item) {
        if (item.kind === "h") {
          const color = CATEGORY_COLORS[item.cat] || C.accent;
          return (
            <View style={[styles.sectionRow, styles.catSectionRow]}>
              <View style={[styles.sectionBar, { backgroundColor: color }]} />
              <Text style={[styles.sectionTitle, { color }]}>
                {item.cat.toUpperCase()}
              </Text>
              <View style={styles.sectionLine} />
            </View>
          );
        }
        return (
          <TouchableOpacity
            style={styles.seeMore}
            activeOpacity={0.7}
            onPress={() =>
              setExpandedCats((prev) => {
                const n = new Set(prev);
                n.add(item.cat);
                return n;
              })
            }
          >
            <Ionicons name="chevron-down-circle-outline" size={16} color={C.accent} />
            <Text style={styles.seeMoreText}>
              Xem thêm {item.hidden} tin {item.cat.toLowerCase()}
            </Text>
          </TouchableOpacity>
        );
      }
      return <ArticleCardCompact item={item} onPress={goArticle} />;
    },
    [goArticle, styles, C],
  );

  // Prefetch content bài đang hiện rõ trên màn hình (>60%, tối thiểu 1.2s):
  // bấm vào là article đã tải sẵn trong cache — tóm tắt chạy ngay, không chờ network.
  // Kèm PRE-SUMMARIZE nền: tóm tắt luôn bằng full text, mở bài = hiện tức thì.
  // GIỚI HẠN lần đầu: chỉ prefetch 1 bài (hero) để không cạnh tranh với feed/video load.
  const prefetchCountRef = useRef(0);
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any }) => {
    for (const v of viewableItems) {
      const link = v?.item?.link;
      if (link) {
        if (prefetchCountRef.current >= 3) return; // tối đa 3 bài prefetch
        prefetchCountRef.current++;
        // Prefetch cách nhau 600ms — 3 bài fetch + parse HTML cùng lúc đúng
        // 1.2s sau launch là nguyên nhân khựng ~2s; giãn ra để không dồn cục.
        // +2000ms gốc: nhường trọn 2s đầu sau launch cho tap (parse HTML bài báo
        // nặng), sau đó vẫn cách nhau 600ms để không dồn cục.
        const delay = 2000 + prefetchCountRef.current * 600;
        setTimeout(() => prefetchArticleContent(link, v.item), delay);
      }
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 1200 }).current;

  const listHeader = useMemo(
    () => (
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
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
            />
            {heroes.length > 1 && (
              <>
                <TouchableOpacity
                  style={[styles.heroArrow, styles.heroArrowL]}
                  onPress={() => goHero(-1)}
                  activeOpacity={0.7}
                  accessibilityLabel="Tin trước"
                >
                  <Ionicons name="chevron-back" size={18} color="#FFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.heroArrow, styles.heroArrowR]}
                  onPress={() => goHero(1)}
                  activeOpacity={0.7}
                  accessibilityLabel="Tin sau"
                >
                  <Ionicons name="chevron-forward" size={18} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.heroDots}>
                  {heroes.map((h, i) => (
                    <View
                      key={h.link}
                      style={[
                        styles.heroDot,
                        i === heroIdx && styles.heroDotActive,
                      ]}
                    />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* SECTION: ĐỌC NHIỀU NHẤT — lưới 2 cột từ rest, khác nội dung carousel */}
        {trending.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <View style={[styles.sectionBar, { backgroundColor: C.hot }]} />
              <View style={styles.sectionTrendIcon}>
                <Ionicons name="trending-up" size={12} color="#FFF" />
              </View>
              <Text style={[styles.sectionTitle, { color: C.hot }]}>
                ĐỌC NHIỀU NHẤT
              </Text>
              <View style={styles.sectionLine} />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.trendStrip}
            >
              {trending.map((h) => (
                <TrendSmallCard
                  key={h.link}
                  item={h}
                  onPress={goArticle}
                  styles={styles}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* SECTION: LATEST — khi lướt đã có header chủ đề từng khối nên bỏ hẳn
            nhãn "TIN MỚI NHẤT" (2 header chồng nhau = rối); chỉ giữ khi list phẳng */}
        {!isBrowsing && (
          <View style={styles.sectionRow}>
            <View style={[styles.sectionBar, { backgroundColor: C.accent }]} />
            <Text style={[styles.sectionTitle, { color: C.accent }]}>
              TIN MỚI NHẤT
            </Text>
            <View style={styles.sectionLine} />
          </View>
        )}
      </View>
    ),
    [
      isBrowsing,
      heroes,
      trending,
      heroIdx,
      goHero,
      heroRenderItem,
      handleHeroScroll,
      goArticle,
      styles,
    ],
  );

  return (
    <Animated.View
      style={[styles.root, { opacity: headerAnim }]}
    >
      {/* HEADER — masthead */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.masthead}>
              <Image
                source={require("../../assets/icon.png")}
                style={styles.mastheadImg}
                resizeMode="cover"
              />
            </View>
            <View>
              <Text style={styles.brand}>TIN TỨC</Text>
              <Text style={styles.brandDate}>{today()}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={handleSearchToggle}
              activeOpacity={0.7}
              accessibilityLabel="Tìm kiếm"
            >
              <Ionicons
                name={showSearch ? "close" : "search-outline"}
                size={19}
                color={C.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIcon}
              onPress={onRefresh}
              activeOpacity={0.7}
              accessibilityLabel="Làm mới"
              disabled={refreshing}
            >
              <Ionicons
                name={refreshing ? "refresh-circle" : "refresh-outline"}
                size={19}
                color={C.text}
              />
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
              <TouchableOpacity
                onPress={() => {
                  // Hủy timer debounce đang treo — không nó sẽ set lại query cũ
                  // 600ms sau khi đã Xóa (danh sách tự lọc lại "kỳ diệu")
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  searchInputRef.current?.clear();
                  setSearchText("");
                  setHasSearchText(false);
                  setDebouncedQuery("");
                }}
                accessibilityLabel="Xóa"
              >
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* CATEGORY PILLS */}
      <Animated.View
        style={[
          styles.categoryWrap,
          {
            opacity: categoryAnim,
            transform: [
              {
                translateY: categoryAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, 0],
                }),
              },
            ],
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map((cat) => (
            <CategoryChip
              key={cat}
              category={cat}
              active={selectedCategory === cat}
              onPress={handleCategoryPress}
              styles={styles}
            />
          ))}
        </ScrollView>
      </Animated.View>

      {/* SOURCE FILTER — dropdown các trang báo trong config */}
      <View style={styles.sourceWrap}>
        <View style={styles.sourceRow}>
          <Ionicons name="funnel-outline" size={14} color={C.textMuted} />
          <Text style={styles.sourceLabel}>Nguồn</Text>
          <SourceDropdown
            value={selectedSource}
            onChange={handleSourcePress}
            options={sources}
            styles={styles}
          />
        </View>
      </View>

      {/* BREAKING NEWS TICKER — nền đỏ đặc, chữ trắng, tự chạy + cho lướt */}
      {heroes.length > 0 && (
        <View style={styles.breakingStrip}>
          <View style={styles.breakingBadge}>
            <Ionicons name="flash" size={11} color={C.danger} />
            <Text style={styles.breakingText}>NÓNG</Text>
          </View>
          <ScrollView
            ref={marqueeScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.breakingViewport}
            contentContainerStyle={styles.breakingRow}
            onContentSizeChange={(w) => setMarqueeCopyW(w / 2)}
            onScroll={marqueeScroll}
            scrollEventThrottle={16}
            onScrollBeginDrag={marqueePause}
            onScrollEndDrag={marqueeResume}
            onMomentumScrollEnd={marqueeResume}
            onTouchStart={marqueePause}
            onTouchEnd={marqueeResume}
          >
            {[...heroes, ...heroes].map((h, i) => (
              <React.Fragment key={`${h.link}-${i}`}>
                {i > 0 && <Text style={styles.breakingDot}>•</Text>}
                <TouchableOpacity
                  style={styles.breakingItem}
                  onPress={() => goArticle(h)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.breakingItemText} numberOfLines={1}>
                    {h.title}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      )}

      {/* CONTENT */}
      {loading ? (
        <View style={styles.skelWrap} accessibilityLabel="Đang tải">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listData}
          keyExtractor={(item) => ("link" in item ? item.link : `${item.kind}:${item.cat}`)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          scrollEventThrottle={100}
          nestedScrollEnabled
          ListEmptyComponent={
            <View style={styles.empty} accessibilityLabel="Không có bài báo">
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="file-tray-outline"
                  size={32}
                  color={C.textMuted}
                />
              </View>
              <Text style={styles.emptyText}>Không có bài báo</Text>
              <Text style={styles.emptySub}>
                {selectedCategory !== "Tất cả" || selectedSource !== "Tất cả"
                  ? "Thử chọn chủ đề hoặc nguồn khác"
                  : "Kéo xuống để làm mới"}
              </Text>
              {selectedCategory !== "Tất cả" || selectedSource !== "Tất cả" ? (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => {
                    setSelectedCategory("Tất cả");
                    setSelectedSource("Tất cả");
                  }}
                  activeOpacity={0.8}
                >
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
          removeClippedSubviews={Platform.OS !== "web"}
        />
      )}

    </Animated.View>
  );
}

/* ─── Styles ─── */

type Palette = typeof Color;
const makeStyles = (
  Color: Palette,
  insets: { top: number; bottom: number; left: number; right: number },
) =>
  StyleSheet.create({
    // KHÔNG cộng insets.bottom — Tab Bar đã tự xử lý safe area (xem App.tsx tabBarStyle)
    root: { flex: 1, backgroundColor: Color.bg },

    /* ── Header ── */
    header: {
      backgroundColor: Color.card,
      paddingHorizontal: 16,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Color.border,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 2 },
    masthead: {
      width: 34,
      height: 34,
      borderRadius: Radius.sm,
      backgroundColor: Color.hot,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    mastheadImg: { width: 34, height: 34 },
    brand: {
      fontSize: Font.title,
      fontWeight: "900",
      color: Color.text,
      letterSpacing: 0.8,
    },
    brandDate: {
      fontSize: Font.tiny,
      color: Color.textMuted,
      marginTop: 1,
      letterSpacing: 0.1,
    },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    /* ── Search bar ── */
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
      backgroundColor: Color.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: 12,
      height: 40,
    },
    searchInput: {
      flex: 1,
      fontSize: Font.body,
      color: Color.text,
      paddingVertical: 0,
    },

    /* ── Category pills ── */
    categoryWrap: {
      backgroundColor: Color.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Color.border,
    },
    categoryScroll: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    pill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: Color.surfaceAlt,
      borderWidth: 1,
      borderColor: Color.border,
    },
    pillIcon: { marginRight: 4 },
    pillText: { fontSize: 13, fontWeight: "600", color: Color.textSecondary },
    pillTextActive: { color: "#FFF", fontWeight: "700" },

    /* ── Breaking news — ticker truyền hình nền đỏ + chữ trắng chạy marquee ── */
    breakingStrip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Color.danger,
      paddingVertical: 8,
    },
    breakingBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: "#FFF",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      marginLeft: 12,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 3,
        },
        android: { elevation: 2 },
        default: { boxShadow: "0 2px 6px rgba(0,0,0,0.25)" },
      }),
    },
    breakingText: {
      fontSize: 11,
      fontWeight: "900",
      color: Color.danger,
      letterSpacing: 0.6,
    },
    breakingViewport: { flex: 1 },
    breakingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    breakingItem: { maxWidth: 260 },
    breakingDot: { fontSize: 8, color: "rgba(255,255,255,0.7)" },
    breakingItemText: {
      fontSize: Font.caption,
      fontWeight: "700",
      color: "#FFF",
    },

    /* ── Hero carousel ── */
    heroSection: { marginBottom: 0 },
    heroSlide: { width: getHeroWidth(insets) },
    heroArrow: {
      position: "absolute",
      top: 100,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(0,0,0,0.35)",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    heroArrowL: { left: 8 },
    heroArrowR: { right: 8 },
    heroDots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 5,
      marginTop: 10,
    },
    heroDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: Color.border,
    },
    heroDotActive: { width: 18, backgroundColor: Color.primary },

    /* ── Section headers ── */
    sectionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 10,
    },
    sectionBar: { width: 4, height: 16, borderRadius: 2, marginRight: 8 },
    sectionTitle: { fontSize: 13, fontWeight: "800", letterSpacing: 0.6 },
    sectionTrendIcon: {
      width: 20,
      height: 20,
      borderRadius: 4,
      backgroundColor: Color.hot,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    sectionLine: {
      flex: 1,
      height: 1,
      backgroundColor: Color.border,
      marginLeft: 10,
    },
    catSectionRow: { paddingTop: 26 },
    seeMore: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 14,
      gap: 6,
    },
    seeMoreText: {
      fontSize: 13,
      fontWeight: "700",
      color: Color.accent,
    },

    /* ── Đọc nhiều nhất — strip ngang gọn ── */
    trendStrip: { paddingHorizontal: 12, paddingBottom: 2, gap: 10 },
    trendSmallCard: {
      width: 150,
      backgroundColor: Color.card,
      borderRadius: Radius.sm,
      overflow: "hidden",
      ...Platform.select({
        ios: {
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
        },
        android: { elevation: 2 },
        default: { boxShadow: "0 2px 6px rgba(15, 23, 42, 0.08)" },
      }),
    },
    trendSmallImgWrap: {
      width: "100%",
      height: 84,
      backgroundColor: Color.skeleton,
    },
    trendSmallImg: { width: "100%", height: "100%" },
    trendSmallImgPh: { alignItems: "center", justifyContent: "center" },
    videoBadge: {
      position: "absolute",
      left: 5,
      bottom: 5,
      width: 20,
      height: 20,
      borderRadius: 6,
      backgroundColor: "rgba(0,0,0,0.65)",
      alignItems: "center",
      justifyContent: "center",
      paddingLeft: 1,
    },
    trendSmallBody: { padding: 8 },
    trendSmallMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
    trendSmallSrcBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 20,
      maxWidth: 90,
    },
    trendSmallSrcDot: { width: 4, height: 4, borderRadius: 2 },
    trendSmallSrc: {
      fontSize: Font.tiny - 1,
      color: Color.hot,
      fontWeight: "800",
      letterSpacing: 0.2,
    },
    trendSmallTime: { fontSize: Font.tiny - 1, color: Color.textMuted },
    trendSmallTitle: {
      fontSize: Font.caption,
      fontWeight: "700",
      color: Color.text,
      lineHeight: 16,
    },

    /* ── Source dropdown ── */
    // zIndex/elevation trên wrapper (không phải panel) → dropdown nổi trên breaking strip + carousel
    sourceWrap: {
      backgroundColor: Color.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Color.border,
      zIndex: 10,
      elevation: 10,
    },
    sourceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    sourceLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: Color.textSecondary,
      letterSpacing: 0.2,
    },
    dropdownWrap: { flex: 1, position: "relative", zIndex: 100 },
    dropdownButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radius.md,
      backgroundColor: Color.surfaceAlt,
      borderWidth: 1,
    },
    dropdownValue: { flex: 1, fontSize: Font.body, fontWeight: "700" },
    // Modal drop-down nguồn — ScrollView độc lập cuộn ổn định trên Android/iOS
    sourceModalOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)" },
    sourceModalBackdrop: { ...StyleSheet.absoluteFillObject },
    sourceModalSheet: {
      backgroundColor: Color.card,
      borderRadius: Radius.lg,
      paddingVertical: 8,
      maxWidth: 360,
      ...Shadow.card,
      zIndex: 200,
      elevation: 24,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: Color.border,
    },
    sourceModalGrid: { padding: 10, gap: 8 },
    sourceChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: Radius.md,
      backgroundColor: Color.surfaceAlt,
      borderWidth: 1,
      borderColor: Color.border,
    },
    sourceChipText: {
      fontSize: Font.caption,
      fontWeight: "600",
      color: Color.text,
      flexShrink: 1,
    },
    sourceChipTextActive: { color: "#FFF", fontWeight: "800" },

    /* ── List ── */
    listContent: { paddingBottom: 32 },
    listHeader: { paddingTop: 0 },

    /* ── Skeletons ── */
    skelWrap: { paddingTop: 8 },

    /* ── Empty ── */
    empty: {
      paddingTop: 52,
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 24,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: Color.border,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: { fontSize: 17, fontWeight: "700", color: Color.text },
    emptySub: { fontSize: 13, color: Color.textMuted, textAlign: "center" },
    emptyBtn: {
      marginTop: 4,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: Color.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      ...Shadow.card,
    },
    emptyBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  });
