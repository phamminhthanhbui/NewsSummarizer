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
import { fetchVideos } from "../services/videos";
import { prefetchArticleContent } from "../services/summarize";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { KEYS } from "../services/storage";
import type { FeedItem, VideoItem } from "../types";
import { Color, Font, Radius, Shadow, useTheme } from "../constants/theme";
import { timeAgo } from "../utils/timeAgo";
import ArticleCardCompact from "../components/ArticleCardCompact";
import FeaturedCard from "../components/FeaturedCard";
import SkeletonCard from "../components/SkeletonCard";
import VideoGrid from "../components/VideoGrid";
import VideoModal from "../components/VideoModal";

type Props = { navigation: NativeStackNavigationProp<any> };

// Cờ E2E — tắt auto-play (marquee, carousel) trong Playwright để click không bị timeout
const E2E =
  typeof globalThis !== "undefined" && (globalThis as any).__E2E__ === true;

const getHeroWidth = (insets: { left: number; right: number }) =>
  Dimensions.get("window").width - insets.left - insets.right;

const CATEGORIES = ["Tất cả", ...new Set(FEEDS.map((f) => f.category))];
const SOURCES = ["Tất cả", ...new Set(FEEDS.map((f) => f.name))];

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

/* ─── Source logo (monogram tile theo màu thương hiệu) ─── */
const SOURCE_ABBR: Record<string, string> = {
  "Tất cả": "TC",
  VNExpress: "VNE",
  "Tuổi Trẻ": "TT",
  "Thanh Niên": "TN",
  VietNamNet: "VNN",
  "Dân Trí": "DT",
  "Người Lao Động": "NLD",
  "Tiền Phong": "TP",
  "Sài Gòn Giải Phóng": "SG",
  CAND: "CA",
  "An ninh Thủ đô": "AN",
  "Sức khỏe & Đời sống": "SK",
  "Báo Chính phủ": "CP",
  "Báo Giao Thông": "GT",
  GenK: "GK",
  Cafebiz: "CF",
  BongDaPlus: "BD",
  Kenh14: "K14",
  HelloBacSi: "HB",
  Soha: "SH",
};

// active = item đang được chọn (nền brand đậm) → tile chuyển nền trắng để tương phản
const SourceLogo = React.memo(
  ({
    source,
    color,
    size = 24,
    active = false,
  }: {
    source: string;
    color: string;
    size?: number;
    active?: boolean;
  }) => {
    const abbr = SOURCE_ABBR[source] || source.slice(0, 2).toUpperCase();
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.32),
          backgroundColor: active ? "#FFFFFF" : color + "22",
          borderWidth: 1,
          borderColor: active ? "rgba(255,255,255,0.4)" : color + "3D",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color,
            fontSize: Math.round(size * 0.42),
            fontWeight: "800",
            letterSpacing: 0.2,
            lineHeight: Math.round(size * 0.42) + 2,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {abbr}
        </Text>
      </View>
    );
  },
);

/* ─── Source dropdown ─── */

const SourceDropdown = React.memo(
  ({
    value,
    onChange,
    styles,
  }: {
    value: string;
    onChange: (s: string) => void;
    styles: ReturnType<typeof makeStyles>;
  }) => {
    const C = useTheme();
    const [open, setOpen] = useState(false);
    // Hiệu ứng mở panel: fade + trượt xuống nhẹ. E2E tắt hẳn để click không đợi ổn định vị trí.
    const panelAnim = useRef(new Animated.Value(0)).current;
    const toggle = useCallback(() => {
      setOpen((o) => {
        if (!o) {
          panelAnim.setValue(0);
          Animated.timing(panelAnim, {
            toValue: 1,
            duration: E2E ? 0 : 180,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
        return !o;
      });
    }, [panelAnim]);
    const currentColor =
      value === "Tất cả" ? C.hot : SOURCE_COLORS[value] || C.hot;
    return (
      <View style={styles.dropdownWrap}>
        <TouchableOpacity
          style={[styles.dropdownButton, { borderColor: currentColor }]}
          onPress={toggle}
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
          <Text
            style={[styles.dropdownValue, { color: currentColor }]}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={14}
            color={C.textMuted}
          />
        </TouchableOpacity>
        {open && (
          <Animated.View
            testID="sourceDropdownPanel"
            style={[
              styles.dropdownPanel,
              {
                opacity: panelAnim,
                transform: [
                  {
                    translateY: panelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-8, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <ScrollView
              style={styles.dropdownList}
              contentContainerStyle={styles.dropdownGrid}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {SOURCES.map((src) => {
                const active = src === value;
                const sc =
                  src === "Tất cả" ? C.hot : SOURCE_COLORS[src] || C.hot;
                return (
                  <TouchableOpacity
                    key={src}
                    style={[
                      styles.sourceChip,
                      active && { backgroundColor: sc, borderColor: sc },
                    ]}
                    onPress={() => {
                      onChange(src);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    testID={"sourceOption-" + src}
                    accessibilityState={{ selected: active }}
                  >
                    {src === "Tất cả" ? (
                      <Ionicons
                        name="flash"
                        size={14}
                        color={active ? "#FFF" : sc}
                      />
                    ) : (
                      <SourceLogo
                        source={src}
                        color={sc}
                        size={22}
                        active={active}
                      />
                    )}
                    <Text
                      style={[
                        styles.sourceChipText,
                        active && styles.sourceChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {src}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}
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
    return (
      <TouchableOpacity
        style={styles.trendSmallCard}
        onPress={() => onPress(item)}
        activeOpacity={0.85}
      >
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
  const [videos, setVideos] = useState<VideoItem[]>([]);
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
  const [headerAnim] = useState(new Animated.Value(0));
  const [categoryAnim] = useState(new Animated.Value(0));
  const flatListRef = useRef<FlatList<FeedItem>>(null);
  // Bấm lại icon tab Trang chủ khi đang ở tab này → scroll về đầu trang
  useScrollToTop(flatListRef);
  const { showAlert } = useAlert();

  useEffect(
    () => () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (idleRefreshRef.current) clearTimeout(idleRefreshRef.current);
    },
    [],
  );
  const load = useCallback(async () => {
    const cached = await readFeedsCache();
    if (cached.length) {
      setItems(cached);
      setLoading(false); // có cache → hiện ngay (stale-while-revalidate), fetch mới chạy nền
    }
    // Video tải nền riêng — không chặn nội dung chính. Có cache hiện ngay,
    // crawl mới xong thì cập nhật qua onFresh.
    fetchVideos(setVideos)
      .then(setVideos)
      .catch(() => {});
    // Cache vừa ghi (< 1 phút) → reload KHÔNG fetch lại 18 feed (reload nhanh,
    // không cạnh tranh mạng với video crawl). Cache cũ/trống mới fetch mạng.
    if (await isFeedsCacheFresh()) {
      if (!cached.length) setItems([]);
      return;
    }
    // Feed xong đến đâu hiện đến đó, không chờ feed chậm nhất
    let shown = cached.length > 0;
    const data = await fetchAllFeeds((partial) => {
      if (!shown && partial.length) {
        shown = true;
        setLoading(false);
      }
      setItems(partial);
    });
    if (data.length) setItems(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    Animated.sequence([
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(categoryAnim, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [load]);

  // ── Tương tác người dùng ──
  // Nếu user đang scroll/lướt/chạm thì TẠM HOÃN auto-refresh data (video nổi bật,
  // feed) để không giật/đổi content giữa lúc đang dùng. Hết tương tác ~10s thì
  // interval chạy lại bình thường (vẫn giữ cơ chế fetch vài phút theo xu hướng).
  const IDLE_THRESHOLD_MS = 10 * 1000;
  const lastInteractRef = useRef(0);
  const idleRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleIdleRefresh = useCallback(() => {
    if (idleRefreshRef.current) clearTimeout(idleRefreshRef.current);
    idleRefreshRef.current = setTimeout(() => {
      fetchVideos(setVideos).catch(() => {});
    }, IDLE_THRESHOLD_MS);
  }, []);
  const markInteract = useCallback(() => {
    lastInteractRef.current = Date.now();
    // user vừa thôi tương tác 10s → fetch video mới ngay (nước đến chân mới nhảy)
    scheduleIdleRefresh();
  }, [scheduleIdleRefresh]);
  const shouldSkipAutoRefresh = useCallback(
    () => Date.now() - lastInteractRef.current < IDLE_THRESHOLD_MS,
    [],
  );

  // Video nổi bật theo xu hướng mới nhất — tự refresh mỗi 3 phút khi ở Home,
  // nhưng bỏ qua nếu user đang tương tác.
  useEffect(() => {
    const t = setInterval(() => {
      if (shouldSkipAutoRefresh()) return;
      fetchVideos(setVideos).catch(() => {});
    }, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [shouldSkipAutoRefresh]);

  // Mở app / quay lại từ nền → crawl video mới ngay (featured xoay vòng theo bucket)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        fetchVideos(setVideos).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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

  const [videoModal, setVideoModal] = useState<VideoItem | null>(null);
  const [videoExpanded, setVideoExpanded] = useState(false);
  const goVideo = useCallback((v: VideoItem) => setVideoModal(v), []);

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
    if (heroes.length < 2 || reduceMotion || E2E) return;
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
  }, [heroes.length, reduceMotion, insets]);

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
    if (heroes.length < 2 || reduceMotion || marqueeCopyW <= 0 || E2E) return;
    const t = setInterval(() => {
      if (!marqueeAutoRef.current) return;
      let x = marqueeXRef.current + 3; // ~66px/s (3px mỗi 45ms) — đỡ gánh JS thread
      if (x >= marqueeCopyW) x = 0; // hết bản copy 1 → quay về đầu (nội dung giống hệt)
      marqueeXRef.current = x;
      marqueeScrollRef.current?.scrollTo({ x, animated: false });
    }, 45);
    return () => clearInterval(t);
  }, [heroes.length, reduceMotion, marqueeCopyW]);

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

  const sortedVideos = useMemo(() => {
    const feat = videos.filter((v) => v.zone === "Video nổi bật");
    return feat.concat(videos.filter((v) => v.zone !== "Video nổi bật"));
  }, [videos]);

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
        const unlocked = (await AsyncStorage.getItem(KEYS.aiUnlocked)) === "1";
        if (unlocked) {
          await AsyncStorage.removeItem(KEYS.aiUnlocked);
          showAlert({
            type: "success",
            message: "Đã ẩn cấu hình AI trong Cài đặt",
          });
        } else {
          await AsyncStorage.setItem(KEYS.aiUnlocked, "1");
          showAlert({
            type: "success",
            message: "Đã mở khóa cấu hình AI trong Cài đặt",
          });
        }
        searchInputRef.current?.clear();
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
    ({ item }: { item: FeedItem }) => (
      <ArticleCardCompact item={item} onPress={goArticle} />
    ),
    [goArticle],
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
        prefetchArticleContent(link, v.item);
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

        {/* SECTION: VIDEO NỔI BẬT — hero + grid 2 cột, không scroll ngang */}
        {sortedVideos.length > 0 && (
          <View style={styles.videoSection}>
            <View style={styles.sectionRow}>
              <View style={[styles.sectionBar, { backgroundColor: C.hot }]} />
              <View style={styles.sectionVideoIcon}>
                <Ionicons name="videocam" size={12} color="#FFF" />
              </View>
              <Text style={[styles.sectionTitle, { color: C.hot }]}>VIDEO NỔI BẬT</Text>
              <View style={styles.sectionLine} />
              {sortedVideos.length > 6 && (
                <TouchableOpacity
                  style={styles.videoToggle}
                  onPress={() => setVideoExpanded((e) => !e)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: videoExpanded }}
                  accessibilityLabel={
                    videoExpanded ? "Thu gọn video" : "Xem thêm video"
                  }
                >
                  <Ionicons
                    name={videoExpanded ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={C.hot}
                  />
                </TouchableOpacity>
              )}
            </View>
            <VideoGrid
              videos={sortedVideos}
              onPress={goVideo}
              expanded={videoExpanded}
            />
          </View>
        )}

        {/* SECTION: LATEST */}
        <View style={styles.sectionRow}>
          <View style={[styles.sectionBar, { backgroundColor: C.accent }]} />
          <Text style={[styles.sectionTitle, { color: C.accent }]}>
            TIN MỚI NHẤT
          </Text>
          <View style={styles.sectionLine} />
        </View>
      </View>
    ),
    [
      sortedVideos,
      heroes,
      trending,
      heroIdx,
      goVideo,
      goHero,
      heroRenderItem,
      handleHeroScroll,
      goArticle,
      videoExpanded,
      styles,
    ],
  );

  return (
    <Animated.View
      style={[styles.root, { opacity: headerAnim }]}
      onTouchStart={markInteract}
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
          data={rest}
          keyExtractor={(item) => item.link}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScroll={markInteract}
          scrollEventThrottle={100}
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

      {videoModal && (
        <VideoModal video={videoModal} onClose={() => setVideoModal(null)} />
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
    sectionVideoIcon: {
      width: 20,
      height: 20,
      borderRadius: 4,
      backgroundColor: Color.hot,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    sectionTrendIcon: {
      width: 20,
      height: 20,
      borderRadius: 4,
      backgroundColor: Color.hot,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 8,
    },
    videoToggle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: Color.surfaceAlt,
      borderWidth: 1,
      borderColor: Color.border,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 6,
    },
    sectionLine: {
      flex: 1,
      height: 1,
      backgroundColor: Color.border,
      marginLeft: 10,
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
    trendSmallImg: {
      width: "100%",
      height: 84,
      backgroundColor: Color.skeleton,
    },
    trendSmallImgPh: { alignItems: "center", justifyContent: "center" },
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

    /* ── Video nổi bật — list dọc ── */
    videoSection: {
      backgroundColor: Color.card,
      marginTop: 2,
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
    dropdownPanel: {
      position: "absolute",
      top: "100%",
      left: 0,
      right: 0,
      marginTop: 6,
      backgroundColor: Color.card,
      borderRadius: Radius.lg,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: Color.border,
      maxHeight: 340,
      zIndex: 100,
      elevation: 24,
      ...Platform.select({
        default: { boxShadow: "0 16px 32px rgba(15, 23, 42, 0.22)" },
      }),
    },
    dropdownList: { maxHeight: 360 },
    // Lưới chip 2 cột — flexGrow để hàng cuối tự giãn đều
    dropdownGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      padding: 10,
    },
    sourceChip: {
      flexGrow: 1,
      flexBasis: "44%",
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
