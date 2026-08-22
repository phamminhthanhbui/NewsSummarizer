import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
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
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem, SummaryRecord } from '../types';
import { Color, Font, Radius, Shadow, useTheme } from '../constants/theme';
import { KEYS } from '../services/storage';
import { fetchArticleContent, summarizeArticle, blocksToText } from '../services/summarize';
import type { ArticleBlock } from '../services/summarize';
import { fetchAllFeeds, readFeedsCache, SOURCE_COLORS } from '../services/feeds';
import { speakEdge, warmEdgeTts, revokeAudioUrl, speakSystem, stopSystem, resolveWebVoice, markWebVoiceHung, isWebVoiceHung, clearWebVoiceHung } from '../services/edgeTts';
import { buildWordMap } from '../services/wordMap';
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
      const synth = synthRef.current;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts.lang || 'vi-VN';
      u.rate = opts.rate ?? 1.0;
      u.pitch = opts.pitch ?? 1.0;
      u.voice = opts.voice || null;
      // Start-guard: một số giọng (vd giọng nữ cloud) bị treo — không kích hoạt
      // onstart/onend/onerror → promise treo vĩnh viễn, không fallback được.
      // Giọng hoạt động thì onstart kích hoạt gần như tức thì (<300ms) nên chỉ
      // chờ 1.2s rồi hủy + reject để caller rơi xuống Edge TTS cho nhanh.
      // Cờ `settled` chặn callback muộn của utterance đã bị cancel (tránh tắt nhầm
      // trạng thái đang đọc khi Edge TTS đã tiếp quản).
      let started = false;
      let settled = false;
      const fail = (e: any) => { if (settled) return; settled = true; clearTimeout(startGuard); reject(e); };
      const ok = () => { if (settled) return; settled = true; clearTimeout(startGuard); onEndRef.current?.(); resolve(); };
      const startGuard = setTimeout(() => {
        if (!started) {
          try { synth.cancel(); } catch {}
          fail(new Error('Web Speech did not start'));
        }
      }, 1200);
      u.onstart = () => { started = true; clearTimeout(startGuard); };
      u.onend = ok;
      u.onerror = (e: any) => {
        // 'interrupted'/'canceled' = bình thường khi cancel() hoặc giọng mới đè
        // giọng cũ — resolve KHÔNG kèm onEndRef: onEndRef bây giờ trỏ về callback
        // của lần đọc MỚI (set trước khi speak), gọi nó sẽ tắt nhầm trạng thái
        // đang đọc. Cũng KHÔNG reject: reject sẽ chạy vào catch →
        // markWebVoiceHung() → bấm NÚT DỪNG cũng thành "giọng treo", lần sau
        // mất word-highlight Web Speech oan. (Fix ở commit cũ 05fa5b0c, bị mất.)
        if (e && (e.error === 'interrupted' || e.error === 'canceled')) {
          if (settled) return; settled = true; clearTimeout(startGuard); resolve(); return;
        }
        fail(e);
      };
      // Word boundary event: gives charIndex, charLength, elapsedTime
      u.onboundary = (e) => {
        if (e.name === 'word' && onWordRef.current) {
          onWordRef.current(e.charIndex);
        }
      };
      utteranceRef.current = u;
      // Cancel giọng đang đọc/đang TREO trong queue trước khi speak. Web Speech xếp
      // utterance mới SAU utterance cũ; utterance cũ mà treo (vd giọng nữ cloud trên
      // Edge) thì utterance mới KHÔNG BAO GIỜ chạy → bấm đọc im lặng. Cancel sạch
      // queue để lần nào cũng phát được. (Fix này có ở commit cũ 05fa5b0c, bị mất.)
      // KHÔNG cancel NGAY TRƯỚC speak(): Chrome/Edge có race — cancel() xong speak()
      // liền thì utterance mới bị hủy nhầm hoặc engine kẹt cứng, onstart không bao
      // giờ kích hoạt → guard 1.2s reject → Edge TTS chậm. Cancel SỚM, chờ engine
      // xả queue rồi mới speak.
      synth.cancel();
      setTimeout(() => {
        if (settled) return; // đã dừng/hết hạn trong lúc chờ
        try { synth.speak(u); } catch { fail(new Error('Web Speech speak failed')); }
      }, 120);
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
  const C = useTheme();
  const styles = makeStyles(C); // styles động theo dark mode

  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [related, setRelated] = useState<FeedItem[]>([]);
  const [speaking, setSpeaking] = useState(false);
  // Guard async continuation: thoát/dừng khi speakEdge đang fetch dở
  // thì không cho continuation phát audio bài cũ sau khi fetch xong
  const cancelledRef = useRef(false);
  // TTS audio (blob Edge TTS) phát qua expo-video player — expo-av đã bỏ
  // (không tương thích expo-modules-core SDK 57). Không cần VideoView:
  // player không gắn surface vẫn buffer + phát audio bình thường.
  const ttsPlayer = useVideoPlayer(null, (p) => {
    p.audioMixingMode = 'doNotMix';
    p.addListener('playToEnd', () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
      if (ttsUrlRef.current) { revokeAudioUrl(ttsUrlRef.current); ttsUrlRef.current = null; }
    });
  });
  const ttsUrlRef = useRef<string | null>(null);
  const [imageModal, setImageModal] = useState<{ visible: boolean; url: string }>({ visible: false, url: '' });

  // useCallback: giữ identity ổn định để SafeImg(memo) không re-render theo highlight tick
  const openImageModal = useCallback((url: string) => setImageModal({ visible: true, url }), []);
  const closeImageModal = () => setImageModal({ visible: false, url: '' });

  // Web Speech API hook for word-level highlighting (web only)
  const webSpeech = useWebSpeech();

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
      // Bài liên quan: đọc từ cache RSS (Home đã fetch + ghi cache) — KHÔNG gọi lại
      // fetchAllFeeds() mỗi lần mở bài (30 request RSS thừa). Cache trống mới fetch.
      (async () => {
        let all = await readFeedsCache();
        if (!all.length) all = await fetchAllFeeds().catch(() => [] as FeedItem[]);
        const same = all.filter((a) => a.source === item.source && a.link !== item.link);
        const others = all.filter((a) => a.source !== item.source && a.link !== item.link);
        setRelated([...same, ...others].slice(0, LIMITS.relatedMax));
      })().catch(() => {});

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

  // State for synchronized highlighting - word-level on web, paragraph-level on native
  const [highlightWordIndex, setHighlightWordIndex] = useState(-1);
  const [highlightParaIndex, setHighlightParaIndex] = useState(-1);
  // wordMap tính đồng bộ theo summary (useMemo, KHÔNG phải state+effect) —
  // tránh render lệch khi summary đổi (tóm nhanh → nâng cấp bản đầy đủ)
  const { wordOffsets, paraWords } = useMemo(() => {
    if (!summary) return { wordOffsets: [] as number[], paraWords: [] as { text: string; flat: number }[][] };
    const { offsets, paras } = buildWordMap(summary);
    return { wordOffsets: offsets, paraWords: paras };
  }, [summary]);

  // Pre-warm cache TTS: summary vừa hiện là tổng hợp NGẦM ngay (fire-and-forget),
  // user click Nghe sau đó = cache hit tức thì, khỏi chờ 5-30s tổng hợp.
  // Text phải giống hệt toggleSpeak (replace \n) để key cache khớp.
  useEffect(() => {
    if (!summary) return;
    const text = summary.replace(/\n+/g, '， ');
    warmEdgeTts(text);
  }, [summary]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tự hiệu chỉnh tốc độ đọc thực RIÊNG CHO TỪNG rate (ms/ký tự đo được). Không quy đổi
  // về rate=1 rồi chia lại: rate TTS không tuyến tính (nén pause nhanh hơn ở tốc độ cao)
  // nên ước lượng tuyến tính bị dài → highlight trễ hơn giọng. Đo thẳng tại rate đang dùng,
  // lần sau cùng tốc độ sẽ khớp ngay.
  const sysCalibRef = useRef<Record<string, number>>({});

  // Reset highlight khi summary đổi
  useEffect(() => {
    setHighlightWordIndex(-1);
    setHighlightParaIndex(-1);
  }, [summary]);

  // Giọng đọc: Word-level highlight on web, paragraph fallback on native
  const toggleSpeak = async () => {
    if (speaking) {
      cancelledRef.current = true; // chặn continuation của speakEdge đang fetch dở
      try { const r: any = ttsPlayer.pause(); r?.catch?.(() => {}); } catch {} // player có thể đã release khi unmount
      if (ttsUrlRef.current) { revokeAudioUrl(ttsUrlRef.current); ttsUrlRef.current = null; }
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      stopSystem();
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
      return;
    }
    if (!summary) return;
    cancelledRef.current = false;
    clearWebVoiceHung(); // thử lại Web Speech mỗi lần bấm — mark cũ có thể oan
    setSpeaking(true);
    setHighlightWordIndex(0);
    setHighlightParaIndex(0);
    try {
      const rate = parseFloat((await AsyncStorage.getItem(KEYS.rate)) || '') || 1.0;
      const pitch = parseFloat((await AsyncStorage.getItem(KEYS.pitch)) || '') || 1.0;
      const isWeb = typeof window !== 'undefined' && 'speechSynthesis' in window;

      // Nội suy progress (0..1) → flat word + đoạn. Dùng chung cho Web Speech
      // fallback lẫn Edge TTS (cả hai đều không có word timing tin cậy).
      const applyProgress = (progress: number) => {
        const flat = Math.min(Math.floor(progress * wordOffsets.length), Math.max(wordOffsets.length - 1, 0));
        setHighlightWordIndex(flat);
        for (let pi = 0; pi < paraWords.length; pi++) {
          const pw = paraWords[pi];
          if (pw.length && flat >= pw[0].flat && flat <= pw[pw.length - 1].flat) {
            setHighlightParaIndex(pi);
            break;
          }
        }
      };

      if (isWeb) {
        // WEB: true word-level sync via Web Speech API.
        // Đọc `summary` nguyên bản (KHÔNG replace \n) để charIndex của onboundary
        // khớp 1:1 với wordOffsets build từ chính `summary`.
        // Browser không có giọng vi hoặc giọng đã biết bị treo (markWebVoiceHung)
        // → bỏ qua Web Speech, fall through xuống Edge TTS bên dưới.
        const webVoice = isWebVoiceHung() ? null : await resolveWebVoice();
        if (webVoice) try {
          // onboundary KHÔNG đáng tin với giọng vi (nhiều browser không bắn
          // word event) → fallback nội suy theo thời gian. Có boundary thì
          // charIndex chính xác hơn: quy đổi sang progress rồi dùng applyProgress.
          let boundarySeen = false;
          webSpeech.setWordCallback((charIndex) => {
            boundarySeen = true;
            applyProgress(Math.min(charIndex / Math.max(summary.length, 1), 1));
          });
          const estMs = Math.max((summary.length / 10) * 1000, 3000) / rate; // ~10 ký tự/giây tiếng Việt đọc thực
          const t0 = Date.now();
          intervalRef.current = setInterval(() => {
            if (boundarySeen) return; // boundary đang dẫn highlight rồi
            applyProgress(Math.min((Date.now() - t0) / estMs, 0.98));
          }, 400);
          webSpeech.setEndCallback(() => {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            setSpeaking(false);
            setHighlightWordIndex(-1);
            setHighlightParaIndex(-1);
          });
          // Truyền voice vi đã resolve (không truyền = giọng mặc định)
          await webSpeech.speak(summary, { lang: 'vi-VN', rate, pitch, voice: webVoice });
          return;
        } catch (e) {
          // Web Speech failed → fall through to Edge TTS.
          // Chỉ ghi nhận TREO khi đúng lỗi start-guard (không onstart trong 1.2s).
          // Lỗi engine khác (engine kẹt sau khi đổi giọng ở Settings...) là tạm thời —
          // đánh dấu oan thì giọng đó MÃI MÃI mất word-highlight Web Speech.
          if (e instanceof Error && e.message === 'Web Speech did not start') markWebVoiceHung();
          if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        }
      }

      // Native + web fallback: Edge TTS blob audio — không có word timing,
      // highlight nội suy từ tiến trình phát (position/duration): từ đang đọc
      // suy ra đoạn. (ponytail: muốn timing chính xác phải parse WordBoundary
      // events từ Edge TTS websocket — chưa cần)
      const text = summary.replace(/\n+/g, '， ');

      // Try Edge TTS (native + web fallback). Cache đã được warm ngầm khi summary
      // hiện (warmEdgeTts) nên thường là cache hit tức thì.
      try {
        const url = await speakEdge(text);
        // Đã dừng/thoát trong lúc fetch → bỏ kết quả, không phát nữa
        if (cancelledRef.current) { revokeAudioUrl(url); return; }
        ttsUrlRef.current = url;
        await ttsPlayer.replaceAsync(url);
        ttsPlayer.playbackRate = rate;
        // Highlight theo tiến trình phát (currentTime/duration).
        // Kiểm tra cancelledRef thay vì state `speaking` (closure giữ giá trị cũ)
        intervalRef.current = setInterval(() => {
          if (cancelledRef.current) { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } return; }
          const dur = ttsPlayer.duration;
          if (dur > 0) applyProgress(Math.min(ttsPlayer.currentTime / dur, 1));
        }, 500);
        ttsPlayer.play();
        return;
      } catch {
        // Edge TTS failed → fall back to system TTS
      }

      // Fallback: expo-speech (system TTS) — không có timing, nội suy theo thời gian ước tính.
      // Ước lượng ưu tiên ms/ký tự đã đo TẠI rate này (sysCalibRef); chưa có thì mặc định
      // 90ms/char ở rate 1 và chia tuyến tính theo rate (tạm, lần sau sẽ hiệu chỉnh).
      if (cancelledRef.current) return; // Edge TTS fail nhưng đã dừng/thoát rồi
      const rateKey = rate.toFixed(1);
      let sysMsPerChar = sysCalibRef.current[rateKey];
      if (!sysMsPerChar) {
        // Chưa đo tại rate này: seed từ bản đo ở rate gần nhất, co giãn phi tuyến nhẹ
        // (rate cao nén pause nhanh hơn tuyến tính) để đỡ trễ ngay lần đọc đầu.
        const keys = Object.keys(sysCalibRef.current).map(Number);
        if (keys.length) {
          const near = keys.reduce((a, b) => Math.abs(a - rate) < Math.abs(b - rate) ? a : b);
          sysMsPerChar = sysCalibRef.current[near.toFixed(1)] * Math.pow(near / rate, 1.15);
        } else {
          sysMsPerChar = 90 / Math.max(rate, 0.01);
        }
      }
      const sysEstMs = Math.max(text.length * sysMsPerChar, 3000);
      const sysT0 = Date.now();
      intervalRef.current = setInterval(() => {
        if (cancelledRef.current) { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } return; }
        applyProgress(Math.min((Date.now() - sysT0) / sysEstMs, 0.98));
      }, 400);

      await speakSystem(text, { pitch, rate });
      // Đo tốc độ THỰC tại rate này và lưu riêng — lần sau cùng tốc độ highlight khớp chính xác
      const measuredMs = Date.now() - sysT0;
      if (text.length > 20 && measuredMs > 500) sysCalibRef.current[rateKey] = measuredMs / text.length;
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
    } catch {
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
  };

  // Dừng đọc khi rời màn hình. Bottom-tabs KHÔNG unmount khi chuyển tab
  // (unmountOnBlur mặc định false) nên phải nghe event 'blur', không chỉ unmount.
  const stopSpeaking = () => {
    cancelledRef.current = true; // chặn continuation của speakEdge/speakSystem đang chờ
    try { const r: any = ttsPlayer.pause(); r?.catch?.(() => {}); } catch {} // player có thể đã release khi unmount
    if (ttsUrlRef.current) { revokeAudioUrl(ttsUrlRef.current); ttsUrlRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    stopSystem();
    webSpeech.stop();
    setSpeaking(false);
    setHighlightWordIndex(-1);
    setHighlightParaIndex(-1);
  };

  useEffect(() => {
    const unsub = navigation.addListener('blur', stopSpeaking);
    return () => { unsub(); stopSpeaking(); };
  }, []);

  const goArticle = useCallback((feedItem: FeedItem) =>
    navigation.push('Article', { item: feedItem }), [navigation]);

  // Read time estimate (chars → minutes); degrades to stub until content loads
  const READ_WPM = 250;
  const readTime = Math.max(1, Math.ceil((content || item.description).length / READ_WPM));

  const isWeb = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Render 1 media block: ảnh/video
  const renderMedia = (b: ArticleBlock, key: string) => {
    if (!b.url) return null;
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

    // Shared interpolation logic: distribute media evenly across paragraphs
    const getInsertPoints = () => {
      const points: number[] = [];
      media.forEach((_, mi) => {
        const at = Math.min(paras.length, Math.round(((mi + 1) * paras.length) / (media.length + 1)));
        points.push(at);
      });
      return points;
    };

    // Phân loại đoạn: dòng gạch đầu dòng (- / • / *) = điểm nhấn, đoạn đầu tiên = lead
    const isBullet = (s: string) => /^[-•*]\s/.test(s);

    if (paraWords.length > 0) {
      // Word-level karaoke highlighting PER PARAGRAPH + interleaved media
      // (cả web lẫn native — highlightWordIndex được applyProgress cập nhật chung)
      const renderPara = (pi: number) => {
        const words = paraWords[pi];
        if (!words) return null; // guard: index lệch (không xảy ra khi wordMap là useMemo, nhưng chặn crash)
        const bullet = isBullet(paras[pi] || '');
        const lead = pi === 0 && !bullet;
        let firstVisible = true;
        const text = (
          <Text style={[styles.summaryText, lead && styles.summaryLead, bullet && styles.bulletText]}>
            {words.map((w, wi) => {
              // Ẩn marker "-" đầu dòng (thay bằng vạch màu); flat index vẫn khớp summary gốc
              if (bullet && wi === 0 && /^[-•*]$/.test(w.text)) return null;
              const spacer = firstVisible ? '' : ' ';
              firstVisible = false;
              return (
                <Text
                  key={'w' + pi + '_' + wi}
                  style={[w.flat === highlightWordIndex && { backgroundColor: C.hotSoft, borderRadius: 3, fontWeight: '700', color: C.hot }]}
                >{spacer}{w.text}</Text>
              );
            })}
          </Text>
        );
        if (!bullet) return <React.Fragment key={'wp' + pi}>{text}</React.Fragment>;
        return (
          <View key={'b' + pi} style={styles.bulletRow}>
            <View style={styles.bulletBar} />
            <View style={styles.bulletBody}>{text}</View>
          </View>
        );
      };
      if (!media.length) return paraWords.map((_, pi) => renderPara(pi));
      // With media: interleave like native, but each paragraph has word-level highlighting
      const insertPoints = getInsertPoints();
      let cur = 0;
      media.forEach((mb, mi) => {
        const at = insertPoints[mi];
        while (cur < at) { nodes.push(renderPara(cur)); cur++; }
        nodes.push(renderMedia(mb, 'm' + mi));
      });
      while (cur < paraWords.length) { nodes.push(renderPara(cur)); cur++; }
      return nodes;
    }

    // Fallback (summary trống/từ vựng rỗng): paragraph-level highlighting với interleaved media
    const renderParaNative = (i: number) => {
      const p = paras[i];
      const bullet = isBullet(p);
      const lead = i === 0 && !bullet;
      const text = (
        <Text style={[
          styles.summaryText,
          lead && styles.summaryLead,
          bullet && styles.bulletText,
          highlightParaIndex === i && { backgroundColor: C.hotSoft, borderRadius: 3 }
        ]}>{bullet ? p.replace(/^[-•*]\s+/, '') : p}</Text>
      );
      if (!bullet) return <React.Fragment key={'p' + i}>{text}</React.Fragment>;
      return (
        <View key={'b' + i} style={styles.bulletRow}>
          <View style={styles.bulletBar} />
          <View style={styles.bulletBody}>{text}</View>
        </View>
      );
    };
    if (!media.length) return paras.map((_, i) => renderParaNative(i));
    let cur = 0;
    media.forEach((mb, mi) => {
      const at = Math.min(paras.length, Math.round(((mi + 1) * paras.length) / (media.length + 1)));
      while (cur < at) { nodes.push(renderParaNative(cur)); cur++; }
      nodes.push(renderMedia(mb, 'm' + mi));
    });
    while (cur < paras.length) { nodes.push(renderParaNative(cur)); cur++; }
    return nodes;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn}>
          <Ionicons name="chevron-back" size={26} color={C.accent} />
        </TouchableOpacity>
        <Text style={[styles.hTitle, { color: SOURCE_COLORS[item.source] || C.text }]} numberOfLines={1}>{item.source}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.hBtn}>
          <Ionicons name="share-social-outline" size={21} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyBottom, { paddingBottom: 90 }]}
      >
        <Text style={styles.title}>{item.title}</Text>

        <View style={styles.meta}>
          <Text style={[styles.metaSource, { color: SOURCE_COLORS[item.source] || C.primary }]}>{item.source}</Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.metaTime}>
            {new Date(item.pubDate).toLocaleString('vi-VN')}
          </Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.metaTime}>⏱ ~{readTime} phút đọc</Text>
        </View>

        {/* AI Summary card — kiểu Kenh14: ảnh full-bleed, badge đỏ, góc vuông, nền trắng */}
        <View style={styles.summaryCard}>
          {/* Hình gốc của bài */}
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.cardImg} resizeMode="cover" />
          ) : null}

          <View style={styles.summaryLabelRow}>
            <LinearGradient
              colors={[C.hot, C.hotDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.aiBadge}
            >
              <Ionicons name="sparkles" size={13} color="#FFF" />
              <Text style={styles.summaryLabel}>AI TÓM TẮT</Text>
            </LinearGradient>
            {summary ? (
              <TouchableOpacity
                onPress={toggleSpeak}
                style={[styles.speakBtn, speaking && styles.speakBtnOn]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={speaking ? 'Dừng đọc' : 'Nghe tóm tắt'}
              >
                <Ionicons name={speaking ? 'stop' : 'volume-high'} size={16} color={speaking ? '#FFF' : C.hot} />
                <Text style={[styles.speakBtnText, speaking && styles.speakBtnTextOn]}>
                  {speaking ? 'Dừng' : 'Nghe'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {summarizing ? (
            <View style={styles.summaryLoading}>
              <ActivityIndicator color={C.hot} size="small" />
              <Text style={styles.summaryLoadingText}>Đang tóm tắt...</Text>
            </View>
          ) : error || !summary ? (
            <View style={styles.summaryErr}>
              <Text style={styles.summaryErrText}>{error || 'Chưa có tóm tắt'}</Text>
              <TouchableOpacity onPress={summarize} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.retryLink}>{summary ? 'Tóm tắt lại' : 'Tóm tắt'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.summaryBody}>
              {renderSummaryNodes()}
              <TouchableOpacity style={styles.copyInline} onPress={copySummary} activeOpacity={0.7}>
                <Ionicons name="copy-outline" size={14} color={C.hot} />
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
              <Ionicons name="link-outline" size={13} color={C.textMuted} />
              <Text style={[styles.sourceName, { color: SOURCE_COLORS[item.source] || C.primary }]}>{item.source}</Text>
            </View>
            <Text style={styles.sourceDate}>{new Date(item.pubDate).toLocaleDateString('vi-VN')}</Text>
          </TouchableOpacity>
        </View>

        {/* Related articles — section header cùng ngôn ngữ với Home (vạch màu + title + line) */}
        {related.length > 0 && (
          <View style={styles.relatedSection}>
            <View style={styles.sectionRow}>
              <View style={[styles.sectionBar, { backgroundColor: C.hot }]} />
              <Text style={[styles.sectionTitle, { color: C.hot }]}>BÀI VIẾT LIÊN QUAN</Text>
              <View style={styles.sectionLine} />
            </View>
            {related.map((r) => (
              <ArticleCard key={r.link} item={r} onPress={goArticle} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Full-screen Image Modal */}
      <Modal visible={imageModal.visible} transparent animationType="fade">
        <View style={styles.imageModalOverlay}>
          {/* Close button - top right */}
          <TouchableOpacity
            style={styles.imageModalCloseBtn}
            onPress={closeImageModal}
            accessibilityLabel="Đóng hình ảnh"
            hitSlop={{ top: 20, left: 20, right: 20, bottom: 20 }}
          >
            <Ionicons name="close-sharp" size={28} color="#FFF" />
          </TouchableOpacity>
          {/* Image content */}
          <View style={styles.imageModalContent}>
            <Image
              source={{ uri: imageModal.url }}
              style={styles.imageModalImg}
              resizeMode="contain"
            />
          </View>
        </View>
      </Modal>

      {/* Floating bar — KHÔNG cộng insets.bottom: ArticleScreen nằm trong Tab,
          tab bar đã chiếm safe area dưới cùng rồi, cộng thêm = thanh bị đẩy cao */}
      <View style={[styles.floatBar, { bottom: 12 }]}>
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
          <Ionicons name={summarizing ? 'sync' : 'refresh'} size={21} color={C.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabRound, isSaved && styles.fabRoundOn]}
          onPress={handleBookmark}
          activeOpacity={0.7}
        >
          <Ionicons name={isSaved ? 'heart' : 'heart-outline'} size={21} color={isSaved ? C.danger : C.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Video block: file trực tiếp phát bằng expo-video; YouTube/Vimeo hiện thumb + mở ra ngoài
// (expo-video không phát được YouTube natively — cần nguồn stream trực tiếp)
const BlockVideo = memo(function BlockVideo({ block }: { block: ArticleBlock }) {
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
});

function FileVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return <VideoView style={styles.videoThumb} player={player} nativeControls contentFit="cover" />;
}

// Ảnh mà không load được (url hỏng/đổi trang) → trả về null, không để lại ô trống rác.
// memo: highlight tick re-render ArticleScreen liên tục khi đọc; không memo thì
// mỗi tick remount <Image> (refetch + console "Image load at ...") dù props y hệt.
const SafeImg = memo(function SafeImg({ url, onPress }: { url: string; onPress?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Image style={styles.blockImg} source={{ uri: url }} resizeMode="cover" onError={() => setFailed(true)} />
    </TouchableOpacity>
  );
});

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
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
  // Summary — card phủ kiểu mới: nền surface, radius md, ảnh full-bleed, badge gradient
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Color.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Color.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 12,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  summaryLabel: { fontSize: 11, fontWeight: '800', color: '#FFF', letterSpacing: 0.6 },
  speakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Color.hot,
    backgroundColor: Color.hotSoft,
    marginLeft: 'auto',
  },
  speakBtnOn: { backgroundColor: Color.hot, borderColor: Color.hot },
  speakBtnText: { fontSize: Font.tiny, fontWeight: '700', color: Color.hot },
  speakBtnTextOn: { color: '#FFF' },
  cardImg: { height: 200, backgroundColor: Color.skeleton },
  summaryBody: { marginHorizontal: 14 },
  summaryLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginHorizontal: 14, marginBottom: 14 },
  summaryLoadingText: { fontSize: Font.body, color: Color.textMuted },
  summaryErr: {
    backgroundColor: Color.dangerSoft,
    padding: 12,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 14,
  },
  summaryErrText: { fontSize: Font.body, color: Color.danger, flex: 1 },
  retryLink: { fontSize: Font.body, fontWeight: '700', color: Color.hot, marginLeft: 12 },
  summaryText: { fontSize: 15, lineHeight: 25, color: Color.text, marginBottom: 12 },
  // Đoạn mở đầu (lead) — đậm hơn, vạch cam bên trái kiểu Kenh14
  summaryLead: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '600',
    color: Color.text,
    borderLeftWidth: 3,
    borderLeftColor: Color.hot,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  // Điểm nhấn gạch đầu dòng — nền tint, vạch cam, chữ đậm
  bulletRow: { flexDirection: 'row', marginBottom: 10 },
  bulletBar: { width: 3, borderRadius: 2, backgroundColor: Color.hot, marginRight: 10 },
  bulletBody: {
    flex: 1,
    backgroundColor: Color.hotSoft,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  bulletText: { fontWeight: '600', marginBottom: 0 },
  copyInline: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Color.border,
    backgroundColor: Color.surfaceAlt,
    marginBottom: 14,
  },
  copyInlineText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  // Ảnh/video đan xen trong khung tóm tắt
  blockImg: {
    width: '100%',
    height: 220,
    borderRadius: Radius.sm,
    backgroundColor: Color.skeleton,
    marginBottom: 14,
  },
  videoCard: {
    marginBottom: 14,
    borderRadius: Radius.sm,
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
    marginHorizontal: 14,
    marginBottom: 14,
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
  // Related — section header cùng ngôn ngữ Home
  relatedSection: {
    borderTopWidth: 1,
    borderColor: Color.border,
    paddingTop: 4,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  sectionBar: { width: 4, height: 16, borderRadius: 2, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 10 },
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
    backgroundColor: Color.card,
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
  fabRoundOn: { backgroundColor: Color.dangerSoft },
  fabRoundText: { fontSize: 20 },
  // Image Modal
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  imageModalContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  imageModalImg: {
    width: '100%',
    height: '85%',
    resizeMode: 'contain',
  },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);