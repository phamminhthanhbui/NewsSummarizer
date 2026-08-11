import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Share,
  Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Audio } from 'expo-av';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem, SummaryRecord } from '../types';
import { Color, Font } from '../constants/theme';
import { KEYS } from '../services/storage';
import { fetchArticleContent, summarizeArticle, blocksToText } from '../services/summarize';
import type { ArticleBlock } from '../services/summarize';
import { fetchAllFeeds } from '../services/feeds';
import { speakEdge, revokeAudioUrl, speakSystem, stopSystem, type EdgeGender } from '../services/edgeTts';
import ArticleCard from '../components/ArticleCard';

// Web Speech API (word boundary events) — only on web
const useWebSpeech = () => {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onWordRef = useRef<((wordIndex: number) => void) | null>(null);
  const onEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
    return () => { if (synthRef.current) synthRef.current.cancel(); };
  }, []);

  const speak = (text: string, opts: { lang?: string; rate?: number; pitch?: number; voice?: SpeechSynthesisVoice | null } = {}) => {
    return new Promise<void>((resolve, reject) => {
      if (!synthRef.current) { reject(new Error('Web Speech API not available')); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang || 'vi-VN';
      u.rate = opts.rate ?? 1.0;
      u.pitch = opts.pitch ?? 1.0;
      u.voice = opts.voice || null;
      u.onend = () => { onEndRef.current?.(); resolve(); };
      u.onerror = (e) => reject(e);
      // Word boundary event: gives charIndex, charLength, elapsedTime
      u.onboundary = (e) => {
        if (e.name === 'word' && onWordRef.current) {
          onWordRef.current(e.charIndex);
        }
      };
      utteranceRef.current = u;
      synthRef.current.speak(u);
    });
  };

  const stop = () => {
    if (synthRef.current) { synthRef.current.cancel(); }
  };

  const setWordCallback = (cb: (wordIndex: number) => void) => { onWordRef.current = cb; };
  const setEndCallback = (cb: () => void) => { onEndRef.current = cb; };

  return { speak, stop, setWordCallback, setEndCallback };
};

// ponytail: magic numbers centralized in storage.LIMITS
import { LIMITS } from '../services/storage';

export default function ArticleScreen({ navigation, route }: any) {
  const { item } = route.params as { item: FeedItem };
  const insets = useSafeAreaInsets();

  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [related, setRelated] = useState<FeedItem[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<Audio.Sound | null>(null);
  const [imageModal, setImageModal] = useState<{ visible: boolean; url: string }>({ visible: false, url: '' });

  const openImageModal = (url: string) => { console.log('openImageModal:', url); setImageModal({ visible: true, url }); };
  const closeImageModal = () => setImageModal({ visible: false, url: '' });

  // Auto-fetch article + summarize + load related + saved state
  useEffect(() => {
    // Restore persisted save state (syncs with SavedScreen)
    AsyncStorage.getItem(KEYS.saved)
      .then((raw) => {
        const articles: FeedItem[] = raw ? JSON.parse(raw) : [];
        setIsSaved(articles.some((s) => s.link === item.link));
      })
      .catch(() => {});

    // Tóm tắt nhanh: chạy độc lập, không chặn việc tải bài
    (async () => {
      // Lưu summary vào History (cache để lần sau mở lại là tức thì)
      const saveToHistory = async (summary: string) => {
        const raw = await AsyncStorage.getItem(KEYS.history);
        const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
        history.unshift({
          url: item.link, title: item.title, summary, date: new Date().toISOString(), source: item.source,
        });
        await AsyncStorage.setItem(KEYS.history, JSON.stringify(history.slice(0, LIMITS.historyMax)));
      };

      // Chạy song song không chặn nhau: tóm nhanh từ mô tả + tải toàn bài để render
      const blocksTask = fetchArticleContent(item.link).catch(() => [] as ArticleBlock[]);
      fetchAllFeeds()
        .then((all) => {
          const same = all.filter((a) => a.source === item.source && a.link !== item.link);
          const others = all.filter((a) => a.source !== item.source && a.link !== item.link);
          setRelated([...same, ...others].slice(0, LIMITS.relatedMax));
        })
        .catch(() => {});

      // CACHE: đã tóm tắt bài này rồi → hiện lại ngay, 0 lời gọi API
      const raw = await AsyncStorage.getItem(KEYS.history);
      const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
      const cached = history.find((h) => h.url === item.link);
      if (cached) {
        setSummary(cached.summary);
        const blocks = await blocksTask;
        setBlocks(blocks);
        setContent(blocksToText(blocks));
        return;
      }

      // TÓM NHANH trước từ mô tả (không chờ Jina) — summary hiện trong ~1-2s
      setSummarizing(true);
      const fast = await summarizeArticle(item.description)
        .catch((e: Error) => { setError(e.message || 'Lỗi'); return null; });
      setSummarizing(false);
      if (fast) setSummary(fast);

      // Toàn bài về → hiện bài gốc + NÂNG CẤP summary âm thầm bằng bản đầy đủ
      const articleBlocks = await blocksTask;
      setBlocks(articleBlocks);
      const fullText = blocksToText(articleBlocks);
      setContent(fullText);
      if (fast && fullText.length > item.description.length) {
        const full = await summarizeArticle(fullText).catch(() => null);
        if (full) setSummary(full);
        await saveToHistory(full || fast);
      } else if (fast) {
        await saveToHistory(fast);
      }
    })();
  }, [item.link]);

  const summarize = async () => {
    setError('');
    setSummarizing(true);
    try {
      const src = content || item.description;
      setSummary(await summarizeArticle(src));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Lỗi';
      setError(msg);
      // Nếu lỗi key → dẫn sang Settings
      if (msg.includes('Thiếu API key') || msg.includes('API key')) {
        navigation.navigate('SettingsTab');
      }
    }
    setSummarizing(false);
  };

  const handleBookmark = async () => {
    const raw = await AsyncStorage.getItem(KEYS.saved);
    const articles: FeedItem[] = raw ? JSON.parse(raw) : [];
    const exists = articles.some((s) => s.link === item.link);
    const next = exists
      ? articles.filter((s) => s.link !== item.link)
      : [item, ...articles];
    await AsyncStorage.setItem(KEYS.saved, JSON.stringify(next.slice(0, LIMITS.savedMax)));
    setIsSaved(!exists);
  };

  const handleShare = () => Share.share({ message: `${item.title}\n${item.link}` });

  const copySummary = () => Clipboard.setStringAsync(summary);

  // State for synchronized highlighting - use paragraphs (matches renderSummaryNodes)
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [summaryParas, setSummaryParas] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Split summary into paragraphs for highlighting
  useEffect(() => {
    if (summary) {
      const paras = summary
        .split(/\n+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      setSummaryParas(paras);
    } else {
      setSummaryParas([]);
    }
    setHighlightIndex(-1);
  }, [summary]);

  // Giọng đọc: Chỉ đọc TÓM TẮT, highlight từng đoạn đang đọc
  const toggleSpeak = async () => {
    if (speaking) {
      if (audioRef.current) { await audioRef.current.stopAsync(); await audioRef.current.unloadAsync(); audioRef.current = null; }
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      stopSystem();
      setSpeaking(false);
      setHighlightIndex(-1);
      return;
    }
    if (!summary || summaryParas.length === 0) return;
    setSpeaking(true);
    setHighlightIndex(0);
    try {
      const gender = (await AsyncStorage.getItem(KEYS.voiceGender)) as EdgeGender || 'nu';
      const rate = parseFloat((await AsyncStorage.getItem(KEYS.rate)) || '') || 1.0;
      const pitch = parseFloat((await AsyncStorage.getItem(KEYS.pitch)) || '') || 1.0;
      const text = summary.replace(/\n+/g, '， ');

      // Try Edge TTS first
      try {
        const url = await speakEdge(text, gender);
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { rate, volume: 1.0 },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setSpeaking(false);
              setHighlightIndex(-1);
              if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
              revokeAudioUrl(url);
            }
          }
        );
        audioRef.current = sound;
        // Approximate highlighting by advancing index based on speech progress
        intervalRef.current = setInterval(() => {
          if (!speaking) {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            return;
          }
          sound.getStatusAsync().then(st => {
            if (st.isLoaded && typeof st.durationMillis === 'number' && st.durationMillis > 0) {
              const progress = st.positionMillis / st.durationMillis;
              const targetIdx = Math.min(Math.floor(progress * summaryParas.length), summaryParas.length - 1);
              setHighlightIndex(targetIdx);
            }
          });
        }, 500);
        await sound.playAsync();
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setHighlightIndex(-1);
        setTimeout(() => { if (speaking && audioRef.current) { audioRef.current.stopAsync(); audioRef.current.unloadAsync(); audioRef.current = null; setSpeaking(false); setHighlightIndex(-1); } }, 60000);
        return;
      } catch (edgeErr) {
        console.warn('Edge TTS failed, falling back to system TTS:', edgeErr);
      }

      // Fallback: expo-speech (system TTS) - approximate highlighting by time
      intervalRef.current = setInterval(() => {
        if (!speaking) {
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
          return;
        }
        setHighlightIndex(prev => {
          if (prev >= summaryParas.length - 1) {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            return prev;
          }
          return prev + 1;
        });
      }, 2500);

      await speakSystem(text, { pitch, rate });
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setSpeaking(false);
      setHighlightIndex(-1);
    } catch (e) {
      console.error('[TTS Article] error:', e);
      setSpeaking(false);
      setHighlightIndex(-1);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
  };

  // Dọn dẹp khi rời màn hình: không để giọng nói tiếp tục phát
  useEffect(() => () => {
    if (audioRef.current) { audioRef.current.stopAsync(); audioRef.current.unloadAsync(); }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    stopSystem();
  }, []);

  const goArticle = (feedItem: FeedItem) =>
    navigation.push('Article', { item: feedItem });

  // Read time estimate (chars → minutes); degrades to stub until content loads
  const READ_WPM = 250;
  const readTime = Math.max(1, Math.ceil((content || item.description).length / READ_WPM));

  // Render 1 media block: ảnh/video
  const renderMedia = (b: ArticleBlock, key: string) => {
    if (!b.url) return null; // ponytail: media thiếu url → bỏ qua, tránh thẻ rỗng
    if (b.type === 'image') {
      return <SafeImg key={key} url={b.url} onPress={() => openImageModal(b.url!)} />;
    }
    if (b.type === 'video') {
      return <BlockVideo key={key} block={b} />;
    }
    return null;
  };

  // Đan xen ảnh/video vào giữa các đoạn tóm tắt (theo thứ tự bài gốc), không dồn xuống cuối
  // Bỏ same-host filter: nhiều site để ảnh ở subdomain CDN khác (vd vnecnd.net vs vnexpress.net);
  // isEditorialImage() ở summarize.ts đã chặn svg/gif/icon + thumb w<400, Jina strip aside/sidebar rồi.
  const renderSummaryNodes = () => {
    const media = blocks.filter((b) => b.type === 'video' || b.type === 'image');
    const paras = summary.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const nodes: any[] = [];
    if (!media.length) {
      return paras.map((p, i) =>
        <Text key={'p' + i} style={[
          styles.summaryText,
          highlightIndex === i && { backgroundColor: Color.primarySoft, borderRadius: 3 }
        ]}>{p}</Text>
      );
    }
    let cur = 0;
    media.forEach((mb, mi) => {
      // rải đều: media thứ mi chèn sau ~ (tiến độ) phần tóm tắt
      const at = Math.min(paras.length, Math.round(((mi + 1) * paras.length) / (media.length + 1)));
      while (cur < at) {
        nodes.push(
          <Text key={'p' + cur} style={[
            styles.summaryText,
            highlightIndex === cur && { backgroundColor: Color.primarySoft, borderRadius: 3 }
          ]}>{paras[cur]}</Text>
        );
        cur++;
      }
      nodes.push(renderMedia(mb, 'm' + mi));
    });
    while (cur < paras.length) {
      nodes.push(
        <Text key={'p' + cur} style={[
          styles.summaryText,
          highlightIndex === cur && { backgroundColor: Color.primarySoft, borderRadius: 3 }
        ]}>{paras[cur]}</Text>
      );
      cur++;
    }
    return nodes;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn}>
          <Ionicons name="chevron-back" size={26} color={Color.accent} />
        </TouchableOpacity>
        <Text style={styles.hTitle} numberOfLines={1}>{item.source}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.hBtn}>
          <Ionicons name="share-social-outline" size={21} color={Color.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyBottom, { paddingBottom: 90 + insets.bottom }]}
      >
        <Text style={styles.title}>{item.title}</Text>

        <View style={styles.meta}>
          <Text style={styles.metaSource}>{item.source}</Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.metaTime}>
            {new Date(item.pubDate).toLocaleString('vi-VN')}
          </Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.metaTime}>⏱ ~{readTime} phút đọc</Text>
        </View>

        {/* AI Summary card */}
        <View style={styles.summaryCard}>
          {/* Hình gốc của bài */}
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.cardImg} resizeMode="cover" />
          ) : null}

          <View style={styles.summaryLabelRow}>
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={15} color="#FFF" />
            </View>
            <Text style={styles.summaryLabel}>Tóm tắt bằng AI</Text>
            {summary ? (
              <TouchableOpacity onPress={toggleSpeak} style={styles.speakBtn} activeOpacity={0.7}>
                <Ionicons name={speaking ? 'stop-circle' : 'volume-high'} size={19} color={speaking ? Color.primary : Color.textSecondary} />
              </TouchableOpacity>) : null}
          </View>

          {summarizing ? (
            <View style={styles.summaryLoading}>
              <ActivityIndicator color={Color.accent} size="small" />
              <Text style={styles.summaryLoadingText}>Đang tóm tắt...</Text>
            </View>
          ) : error || !summary ? (
            <View style={styles.summaryErr}>
              <Text style={styles.summaryErrText}>{error || 'Chưa có tóm tắt'}</Text>
              <TouchableOpacity onPress={summarize}>
                <Text style={styles.retryLink}>{summary ? 'Tóm tắt lại →' : '→'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              {renderSummaryNodes()}
              <TouchableOpacity style={styles.copyInline} onPress={copySummary} activeOpacity={0.7}>
                <Ionicons name="copy-outline" size={14} color={Color.textSecondary} />
                <Text style={styles.copyInlineText}>Copy tóm tắt</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Nguồn bài viết */}
          <TouchableOpacity
            style={styles.sourceRow}
            onPress={() => Linking.openURL(item.link)}
            activeOpacity={0.7}
          >
            <View style={styles.sourceTextRow}>
              <Ionicons name="link-outline" size={13} color={Color.textMuted} />
              <Text style={styles.sourceName}>{item.source}</Text>
            </View>
            <Text style={styles.sourceDate}>{new Date(item.pubDate).toLocaleDateString('vi-VN')}</Text>
          </TouchableOpacity>
        </View>

        {/* Related articles */}
        {related.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.relatedTitleRow}>
              <Ionicons name="newspaper-outline" size={17} color={Color.primary} />
              <Text style={styles.relatedTitle}>Bài viết liên quan</Text>
            </View>
            {related.map((r) => (
              <ArticleCard key={r.link} item={r} onPress={goArticle} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Full-screen Image Modal */}
      <Modal visible={imageModal.visible} transparent animationType="fade">
        <TouchableOpacity style={styles.imageModalOverlay} onPress={closeImageModal} activeOpacity={1}>
          <TouchableOpacity style={styles.imageModalContent} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
            <TouchableOpacity onPress={closeImageModal} style={styles.imageModalClose} activeOpacity={0.7}>
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Image
              source={{ uri: imageModal.url }}
              style={styles.imageModalImg}
              resizeMode="contain"
              onLoad={() => console.log('Modal Image loaded:', imageModal.url)}
              onError={(e) => console.warn('Modal Image error:', imageModal.url, e)}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Floating bar */}
      <View style={[styles.floatBar, { bottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => Linking.openURL(item.link)}
          activeOpacity={0.7}
        >
          <Ionicons name="newspaper-outline" size={18} color="#FFF" />
          <Text style={styles.fabLabel}>Bài gốc</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabRound, summarizing && styles.fabRoundOn]}
          onPress={summarize}
          activeOpacity={0.7}
          disabled={summarizing}
        >
          <Ionicons name={summarizing ? 'sync' : 'refresh'} size={21} color={Color.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabRound, isSaved && styles.fabRoundOn]}
          onPress={handleBookmark}
          activeOpacity={0.7}
        >
          <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={21} color={isSaved ? '#E53935' : Color.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Video block: file trực tiếp phát bằng expo-video; YouTube/Vimeo hiện thumb + mở ra ngoài
// (expo-video không phát được YouTube natively — cần nguồn stream trực tiếp)
function BlockVideo({ block }: { block: ArticleBlock }) {
  if (block.kind === 'file') {
    return <FileVideo url={block.url!} />;
  }
  const thumb =
    block.kind === 'youtube' && block.videoId
      ? `https://img.youtube.com/vi/${block.videoId}/hqdefault.jpg`
      : undefined;
  return (
    <TouchableOpacity
      style={styles.videoCard}
      onPress={() => Linking.openURL(block.url!)}
      activeOpacity={0.8}
    >
      {thumb ? <Image source={{ uri: thumb }} style={styles.videoThumb} resizeMode="cover" /> : null}
      <View style={styles.videoPlayRow}>
        <Ionicons name="play-circle" size={16} color={Color.accent} />
        <Text style={styles.videoPlay}>Xem video ({block.kind})</Text>
      </View>
    </TouchableOpacity>
  );
}

function FileVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return <VideoView style={styles.videoThumb} player={player} nativeControls contentFit="cover" />;
}

// Ảnh mà không load được (url hỏng/đổi trang) → trả về null, không để lại ô trống rác
function SafeImg({ url, onPress }: { url: string; onPress?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Image style={styles.blockImg} source={{ uri: url }} resizeMode="cover" onError={() => setFailed(true)} onLoad={() => console.log('SafeImg loaded:', url)} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.card },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  hBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  hTitle: { flex: 1, fontSize: Font.body, fontWeight: '700', color: Color.text, textAlign: 'center' },
  // Body
  body: { flex: 1 },
  bodyBottom: {},
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Color.text,
    lineHeight: 30,
    padding: 16,
    paddingBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  metaSource: { fontSize: Font.tiny, color: Color.primary, fontWeight: '700' },
  metaDot: { fontSize: Font.tiny, color: Color.textMuted },
  metaTime: { fontSize: Font.tiny, color: Color.textMuted },
  // Summary
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Color.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Color.border,
    padding: 16,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  aiBadge: {
    width: 28, height: 28, borderRadius: 9, backgroundColor: Color.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryLabel: { fontSize: Font.body, fontWeight: '800', color: Color.text },
  speakBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Color.skeleton,
    marginLeft: 'auto',
  },
  cardImg: { height: 180, borderRadius: 10, marginBottom: 12, backgroundColor: Color.skeleton },
  summaryLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  summaryLoadingText: { fontSize: Font.body, color: Color.textMuted },
  summaryErr: {
    backgroundColor: '#FFF0F0',
    padding: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryErrText: { fontSize: Font.body, color: '#E53935', flex: 1 },
  retryLink: { fontSize: Font.body, fontWeight: '600', color: Color.accent, marginLeft: 12 },
  summaryText: { fontSize: Font.body, lineHeight: 23, color: Color.text, marginBottom: 10 },
  copyInline: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: Color.skeleton,
  },
  copyInlineText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  // Ảnh/video đan xen trong khung tóm tắt
  blockImg: {
    width: '100%',
    height: 220,
    backgroundColor: Color.skeleton,
    marginBottom: 14,
  },
  videoCard: {
    marginBottom: 14,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Color.skeleton,
    alignItems: 'center',
  },
  videoThumb: { width: '100%', height: 200, backgroundColor: Color.skeleton },
  videoPlayRow: { flexDirection: 'row', alignItems: 'center', gap: 6, margin: 9 },
  videoPlay: {
    fontSize: Font.caption,
    fontWeight: '600',
    color: Color.accent,
  },
  sourceRow: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceTextRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginRight: 8 },
  sourceName: { fontSize: Font.caption, fontWeight: '700', color: Color.primary },
  sourceDate: { fontSize: Font.caption, color: Color.textMuted },
  // Related
  relatedSection: {
    borderTopWidth: 1,
    borderColor: Color.border,
    paddingTop: 12,
  },
  relatedTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, marginBottom: 8,
  },
  relatedTitle: {
    fontSize: Font.headline,
    fontWeight: '700',
    color: Color.text,
  },
  // Floating bar
  floatBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFFF2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    gap: 8,
  },
  fabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Color.accent,
    gap: 6,
  },
  fabLabel: { fontSize: Font.caption, fontWeight: '700', color: '#FFF' },
  fabRound: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000008',
  },
  fabRoundOn: { backgroundColor: '#FFEBEE' },
  fabRoundText: { fontSize: 20 },
  // Image Modal
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  imageModalClose: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImg: {
    width: '100%',
    height: '85%',
    resizeMode: 'contain',
  },
});