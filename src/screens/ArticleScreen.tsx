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
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useVideoPlayer, VideoView } from 'expo-video';
import Hls from 'hls.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem, SummaryRecord } from '../types';
import { Color, Font, Radius, Shadow, useTheme } from '../constants/theme';
import { KEYS } from '../services/storage';
import { fetchArticleContent, summarizeArticle, blocksToText, fetchArticleMedia, baseUrlKey, sameImageFile, buildExtractiveSummary, aiCondenseCaptions, getCachedCaption, CAPTION_AI_MAX, isStaleSummary, peekPendingSummary, saveSummaryToHistory } from '../services/summarize';
import type { ArticleBlock } from '../services/summarize';
import { fetchAllFeeds, readFeedsCache, SOURCE_COLORS } from '../services/feeds';
import { speakSystem, stopSystem, resolveWebVoice, markWebVoiceHung, isWebVoiceHung, clearWebVoiceHung } from '../services/edgeTts';
import { buildWordMap } from '../services/wordMap';
import ArticleCard from '../components/ArticleCard';
import { getGoodProxyBase, getProxyBase } from '../utils/proxy';

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

// ---- TTS theo cụm câu (chunked playback) ----
// Lỗi đồng bộ highlight tích tụ theo độ dài văn bản: đọc cả bài một hơi thì
// lệch 2-3s cuối bài là chuyện thường. Chia cụm ~1-2 câu thì sai số reset sau
// mỗi cụm + hiệu chỉnh ms/ký tự chạy liên tục → bám giọng ở MỌI tốc độ.
type TtsWord = { text: string; flat: number };
type TtsChunk = { text: string; first: number; last: number };

function buildTtsChunks(paras: TtsWord[][]): TtsChunk[] {
  const all = paras.flat();
  const chunks: TtsChunk[] = [];
  let ws: TtsWord[] = [];
  const flush = () => {
    if (!ws.length) return;
    chunks.push({
      text: ws.map((w) => w.text).join(' '),
      first: ws[0].flat,
      last: ws[ws.length - 1].flat,
    });
    ws = [];
  };
  for (let i = 0; i < all.length; i++) {
    const w = all[i];
    if (/^[-–—•*]$/.test(w.text)) continue; // marker gạch đầu dòng — không đọc thành "gạch"
    ws.push(w);
    const endsSentence = /[.!?…]["')]*$/.test(w.text);
    // flat nhảy >1 giữa 2 từ liên tiếp = có \n ở giữa = hết đoạn
    const paraBreak = i + 1 < all.length && all[i + 1].flat - w.flat > 1;
    if (ws.length >= 22 && (endsSentence || paraBreak)) flush();
    else if (ws.length >= 36) flush(); // câu quá dài — cắt cứng cho đều
  }
  flush();
  return chunks;
}

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
  // Summary hiện tại do fallback extractive tạo (không có AI/mất mạng)
  const [offline, setOffline] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [related, setRelated] = useState<FeedItem[]>([]);
  const [speaking, setSpeaking] = useState(false);
  // Guard async continuation: thoát/dừng khi speakSystem đang phát dở
  // thì không cho continuation bật lại trạng thái bài cũ
  const cancelledRef = useRef(false);
  const [imageModal, setImageModal] = useState<{ visible: boolean; url: string }>({ visible: false, url: '' });

  // useCallback: giữ identity ổn định để SafeImg(memo) không re-render theo highlight tick
  // Modal mở bản NÉT NHẤT trong các variant cùng file (SGGP trả /w680/ trong bài
  // nhưng hero là /w800/ — chọn w lớn nhất để xem full-screen không mờ)
  const openImageModal = useCallback((url: string) => {
    const widthOf = (u: string) => {
      const m = u.match(/(?:\/w|thumb_w\/|\bw=)(\d{2,4})/i);
      return m ? parseInt(m[1], 10) : 0;
    };
    let best = url;
    let bestW = widthOf(url);
    for (const b of blocks) {
      if (b.type === 'image' && b.url && b.url !== best && sameImageFile(b.url, url)) {
        const w = widthOf(b.url);
        if (w > bestW) { best = b.url; bestW = w; }
      }
    }
    setImageModal({ visible: true, url: best });
  }, [blocks]);
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
      setOffline(false);
      // Lưu summary vào History (cache để lần sau mở lại là tức thì) — writer
      //chung, dedupe theo URL (bản mới nhất thắng).
      const saveToHistory = (summary: string) => saveSummaryToHistory(item, summary);

      // Chạy song song không chặn nhau: tóm nhanh từ mô tả + tải toàn bài để render
      const blocksTask = fetchArticleContent(item.link).catch(() => [] as ArticleBlock[]);
      // Media bài gốc từ HTML — NHANH (~1-2s), không chờ Jina chậm. Set blocks sớm
      // để ảnh/video hiện cùng lúc với tóm tắt; Jina về sau sẽ thay bằng blocks đầy đủ.
      // Dùng setState functional để KHÔNG đè blocks Jina đã có (Jina trả caption
      // thật, HTML fast-path có thể trả caption tự sinh "Ảnh 1.").
      fetchArticleMedia(item.link)
        .then((media) => {
          if (media.length) setBlocks((prev) => (prev.length ? prev : media));
        })
        .catch(() => {});
      // Bài liên quan: đọc từ cache RSS (Home đã fetch + ghi cache) — KHÔNG gọi lại
      // fetchAllFeeds() mỗi lần mở bài (30 request RSS thừa). Cache trống mới fetch.
      (async () => {
        let all = await readFeedsCache();
        if (!all.length) all = await fetchAllFeeds().catch(() => [] as FeedItem[]);
        const same = all.filter((a) => a.source === item.source && a.link !== item.link);
        const others = all.filter((a) => a.source !== item.source && a.link !== item.link);
        setRelated([...same, ...others].slice(0, LIMITS.relatedMax));
      })().catch(() => {});

      // CACHE: đã tóm tắt bài này rồi → hiện lại ngay, 0 lời gọi API.
      // Summary cũ bị lỗi (metadata/fragment/](url)) → purge record hỏng + tóm lại.
      const raw = await AsyncStorage.getItem(KEYS.history);
      const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
      const cached = history.find((h) => h.url === item.link);
      if (cached && !isStaleSummary(cached.summary)) {
        setSummary(cached.summary);
        const blocks = await blocksTask;
        setBlocks(blocks);
        setContent(blocksToText(blocks));
        return;
      }
      if (cached) {
        const cleaned = history.filter((h) => !(h.url === item.link && isStaleSummary(h.summary)));
        await AsyncStorage.setItem(KEYS.history, JSON.stringify(cleaned));
      }

      // TÓM NHANH trước từ mô tả (không chờ Jina) — summary hiện trong ~1-2s.
      // Lỗi ở đây KHÔNG báo ngay: còn full-text + fallback phía sau.
      let lastErr = '';
      setSummarizing(true);
      // Pre-summarize nền (Home prefetch) đang chạy/chờ xong → await bản
      // FULL TEXT (chất lượng cao) thay vì gọi LLM trùng lần hai.
      const pend = peekPendingSummary(item.link);
      if (pend) {
        const s = await pend.catch(() => null);
        if (s && s.trim().length >= 20 && !isStaleSummary(s)) {
          setSummary(s);
          setSummarizing(false);
          setError('');
          setOffline(false);
          const prefetchedBlocks = await blocksTask;
          setBlocks(prefetchedBlocks);
          setContent(blocksToText(prefetchedBlocks));
          return;
        }
      }
      const fast = await summarizeArticle(item.description, item.category)
        .catch((e: Error) => { lastErr = e.message || ''; return null; });
      setSummarizing(false);
      if (fast) { setSummary(fast); setError(''); setOffline(false); }

      // Toàn bài về → hiện bài gốc + NÂNG CẤP summary âm thầm bằng bản đầy đủ
      const articleBlocks = await blocksTask;
      setBlocks(articleBlocks);
      const fullText = blocksToText(articleBlocks);
      setContent(fullText);

      let finalSummary = fast;
      if (fullText.length > item.description.length) {
        const full = await summarizeArticle(fullText, item.category).catch(() => null);
        if (full) { finalSummary = full; setOffline(false); }
      }
      // AI chết hoàn toàn → fallback extractive (chọn-câu, không cần mạng):
      // app vẫn luôn có tóm tắt hiển thị thay vì ô lỗi.
      if (!finalSummary && articleBlocks.length) {
        const ex = buildExtractiveSummary(item.title, articleBlocks);
        if (ex) { finalSummary = ex; setOffline(true); }
      }
      if (finalSummary) {
        setSummary(finalSummary);
        setError('');
        await saveToHistory(finalSummary);
      } else if (lastErr) {
        setError(lastErr);
      }
    })();
  }, [item.link]);

  // Caption DÀI → AI rút gọn nền (1 request batch, cache theo URL — xem
  // aiCondenseCaptions). captionRev bump để re-render khi bản ngắn về.
  const [captionRev, setCaptionRev] = useState(0);
  useEffect(() => {
    const items = blocks
      .filter((b) => b.type === 'image' && b.url && b.caption && b.caption.length > CAPTION_AI_MAX)
      .map((b) => ({ url: b.url!, caption: b.caption! }));
    if (!items.length) return;
    let alive = true;
    aiCondenseCaptions(items)
      .then((n) => { if (alive && n > 0) setCaptionRev((r) => r + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, [blocks]);

  const summarize = async () => {
    setError('');
    setSummarizing(true);
    try {
      const src = content || item.description;
      const s = await summarizeArticle(src, item.category);
      setSummary(s);
      setOffline(false);
    } catch {
      // AI lỗi → thử fallback extractive từ blocks đã tải
      const ex = blocks.length ? buildExtractiveSummary(item.title, blocks) : '';
      if (ex) { setSummary(ex); setOffline(true); }
      else setError('Không tạo được tóm tắt');
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
  // tránh render lệch khi summary đổi (tóm nhanh → nâng cấp bản đầy đủ).
  // flatToPara: flat index → đoạn chứa từ đó (cho highlight đoạn khi TTS chạy).
  const { wordOffsets, paraWords, flatToPara } = useMemo(() => {
    if (!summary) return { wordOffsets: [] as number[], paraWords: [] as TtsWord[][], flatToPara: [] as number[] };
    const { offsets, paras } = buildWordMap(summary);
    const f2p: number[] = [];
    paras.forEach((pw, pi) => pw.forEach((w) => { f2p[w.flat] = pi; }));
    return { wordOffsets: offsets, paraWords: paras, flatToPara: f2p };
  }, [summary]);

  // Không warm cache Edge TTS nữa — đã bỏ Edge TTS

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Hiệu chỉnh tốc độ đọc thực RIÊNG CHO TỪNG rate (ms/ký tự), cập nhật EMA sau
  // MỖI cụm câu trong lúc đọc → highlight tự bám lại giọng trong vòng vài câu
  // khi user tăng/giảm tốc. Rate TTS không tuyến tính nên không quy đổi chéo.
  const sysCalibRef = useRef<Record<string, number>>({});

  // Reset highlight khi summary đổi
  useEffect(() => {
    setHighlightWordIndex(-1);
    setHighlightParaIndex(-1);
  }, [summary]);

  // Giọng đọc: chia tóm tắt thành cụm câu, đọc lần lượt. Highlight neo theo
  // word-boundary (web + native Android) khi có, nội suy thời gian làm nền giữa
  // các boundary — sai số không vượt quá 1 cụm nên không trôi kể cả đổi tốc độ.
  const clearSpeakTimer = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const toggleSpeak = async () => {
    if (speaking) {
      cancelledRef.current = true; // chặn continuation của cụm đang phát dở
      clearSpeakTimer();
      stopSystem();
      webSpeech.stop();
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
      return;
    }
    if (!summary || !paraWords.length) return;
    cancelledRef.current = false;
    clearWebVoiceHung(); // thử lại Web Speech mỗi lần bấm — mark cũ có thể oan
    setSpeaking(true);
    setHighlightWordIndex(0);
    setHighlightParaIndex(0);
    try {
      const rate = parseFloat((await AsyncStorage.getItem(KEYS.rate)) || '') || 1.0;
      const pitch = parseFloat((await AsyncStorage.getItem(KEYS.pitch)) || '') || 1.0;
      const isWeb = typeof window !== 'undefined' && 'speechSynthesis' in window;

      // Web cần giọng vi resolve trước; thiếu → báo lỗi ngay (không rơi Edge TTS nữa)
      let webVoice: SpeechSynthesisVoice | null = null;
      if (isWeb) {
        webVoice = isWebVoiceHung() ? null : await resolveWebVoice();
        if (!webVoice) throw new Error('Trình duyệt không có giọng đọc tiếng Việt');
      }

      const chunks = buildTtsChunks(paraWords);
      if (!chunks.length) throw new Error('Không có nội dung để đọc');

      // Hiệu chỉnh tốc độ đọc THỰC (ms/ký tự) riêng cho từng rate, cập nhật EMA
      // sau mỗi cụm → highlight tự bám lại giọng ngay cả khi user tăng/giảm tốc.
      const rateKey = rate.toFixed(1);
      let msPerChar = sysCalibRef.current[rateKey] ?? 90 / Math.max(rate, 0.01);

      const applyFlat = (flat: number) => {
        setHighlightWordIndex(flat);
        const pi = flatToPara[flat];
        if (pi !== undefined) setHighlightParaIndex(pi);
      };

      for (const chunk of chunks) {
        if (cancelledRef.current) break;
        const t0 = Date.now();
        // Anchor nội suy: vị trí flat gần nhất + mốc thời gian — boundary cập nhật
        // anchor, timer chiếu tiếp theo msPerChar nên không bao giờ "đứng hình".
        let anchorFlat = chunk.first;
        let anchorTime = t0;
        clearSpeakTimer();
        intervalRef.current = setInterval(() => {
          if (cancelledRef.current) return;
          const projected = anchorFlat + Math.round((Date.now() - anchorTime) / Math.max(msPerChar, 20));
          applyFlat(Math.min(chunk.last, Math.max(chunk.first, projected)));
        }, 200);
        try {
          const onAnchor = (ratio01: number) => {
            anchorFlat = Math.min(chunk.last, chunk.first + Math.round(ratio01 * (chunk.last - chunk.first)));
            anchorTime = Date.now();
          };
          if (isWeb) {
            webSpeech.setWordCallback((charIndex) => {
              onAnchor(Math.min(charIndex / Math.max(chunk.text.length, 1), 1));
            });
            await webSpeech.speak(chunk.text, { lang: 'vi-VN', rate, pitch, voice: webVoice });
          } else {
            await speakSystem(chunk.text, {
              pitch,
              rate,
              onBoundary: (ev) => {
                if (typeof ev?.charIndex !== 'number') return;
                onAnchor(Math.min(ev.charIndex / Math.max(chunk.text.length, 1), 1));
              },
            });
          }
        } catch (e) {
          clearSpeakTimer();
          // Chỉ mark TREO khi đúng lỗi start-guard — lỗi khác là tạm thời
          if (e instanceof Error && e.message === 'Web Speech did not start') markWebVoiceHung();
          throw new Error('Không đọc được giọng Việt trên thiết bị này');
        }
        clearSpeakTimer();
        if (cancelledRef.current) break;
        // Đo tốc độ thực của cụm vừa đọc → EMA (kẹp biên chống nhiễu:
        // tiếng Việt ~45-170ms/ký tự tại rate 1)
        const dur = Date.now() - t0;
        if (dur > 600 && chunk.text.length > 12) {
          const lo = 45 / Math.max(rate, 0.05);
          const hi = 170 / Math.max(rate, 0.05);
          const measured = Math.min(hi, Math.max(lo, dur / chunk.text.length));
          msPerChar = msPerChar * 0.55 + measured * 0.45;
          sysCalibRef.current[rateKey] = msPerChar;
        }
      }
      if (!cancelledRef.current) {
        setSpeaking(false);
        setHighlightWordIndex(-1);
        setHighlightParaIndex(-1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được');
      cancelledRef.current = true; // dừng vòng chunk đang lặp (nếu còn)
      stopSystem();
      webSpeech.stop();
      clearSpeakTimer();
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
    }
  };

  // Dừng đọc khi rời màn hình. Bottom-tabs KHÔNG unmount khi chuyển tab
  // (unmountOnBlur mặc định false) nên phải nghe event 'blur', không chỉ unmount.
  const stopSpeaking = () => {
    cancelledRef.current = true; // chặn continuation của speakSystem đang chờ
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

  // Render 1 media block: ảnh/video — caption ưu tiên bản AI rút gọn (cache
  // trong summarize.ts; captionRev bump khi bản mới về để re-render).
  const renderMedia = (b: ArticleBlock, key: string) => {
    if (!b.url) return null;
    if (b.type === 'image') {
      void captionRev;
      return <SafeImg key={key} url={b.url} caption={getCachedCaption(b.url) ?? b.caption} onPress={() => openImageModal(b.url!)} />;
    }
    if (b.type === 'video') {
      return <BlockVideo key={key} block={b} />;
    }
    return null;
  };

  // Đan xen ảnh/video vào tóm tắt THEO BỐ CỤC BÀI GỐC:
  // - Mỗi media mang pos (0..1) = tỉ lệ nội dung bài gốc đứng TRƯỚC nó
  //   (parser ghi sẵn từ vị trí trong HTML/markdown — xem summarize.ts).
  // - Tính cùng tỉ lệ tích lũy cho các đoạn tóm tắt (theo số ký tự).
  // - Media được chèn TRƯỚC đoạn đầu tiên mà tỉ lệ tích lũy vượt qua pos của nó.
  //   Ảnh cận cạnh nhau trong bài gốc (gallery) tự nhiên đứng cụm lại thay vì
  //   bị ép dãn ra như thuật toán rải đều trước đây.
  const renderSummaryNodes = () => {
    const paras = summary.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    // Summary có cấu trúc mới khi chứa dòng "• dữ kiện": đoạn đầu = TL;DR
    // (style riêng), các dòng • = chip dữ kiện. Summary legacy → lead như cũ.
    const hasFacts = paras.some((p) => /^[-•*]\s/.test(p));
    const nodes: any[] = [];

    // Media: dedupe theo base URL (ảnh VnExpress trả 2 lần với query khác nhau)
    // + trùng FILE với hero (SGGP trả /w800/ hero và /w680/ cùng tấm trong bài)
    // + trừ ảnh đã lên hero, rồi sort theo pos
    const media: ArticleBlock[] = [];
    const seenBase = new Set<string>();
    const heroUrl = item.image || '';
    const heroKey = heroUrl ? baseUrlKey(heroUrl) : '';
    for (const b of blocks) {
      if ((b.type !== 'image' && b.type !== 'video') || !b.url) continue;
      const k = baseUrlKey(b.url);
      if (seenBase.has(k)) continue;
      if ((heroKey && k === heroKey) || (heroUrl && sameImageFile(b.url, heroUrl))) continue;
      seenBase.add(k);
      media.push(b);
    }
    // frac của từng media: ưu tiên pos do parser ghi; thiếu thì tính theo lượng
    // chữ đứng trước media trong blocks (fallback cho block cũ trong cache).
    // Tính TRƯỚC khi sort để media thiếu pos (vd video lead bài) xếp đúng chỗ.
    const totalArtChars = blocks.reduce((s, b) => s + (b.type === 'text' && b.text ? b.text.length : 0), 0);
    let artAcc = 0;
    const fracFallback = new Map<ArticleBlock, number>();
    for (const b of blocks) {
      if (b.type === 'text' && b.text) { artAcc += b.text.length; continue; }
      if ((b.type === 'image' || b.type === 'video') && !fracFallback.has(b)) {
        fracFallback.set(b, totalArtChars ? Math.min(artAcc / totalArtChars, 0.999) : 0);
      }
    }
    const fracOf = (mb: ArticleBlock) => mb.pos ?? fracFallback.get(mb) ?? 0;
    media.sort((a, b) => fracOf(a) - fracOf(b));
    const fracs = media.map(fracOf);

    // Tỉ lệ tích lũy của các đoạn tóm tắt (theo số ký tự)
    const totalSumChars = paras.reduce((s, p) => s + p.length + 1, 0) || 1;
    let sumAcc = 0;
    const cumPara = paras.map((p) => { sumAcc += p.length + 1; return sumAcc / totalSumChars; });

    // Điểm chèn: media chèn TRƯỚC đoạn đầu tiên có tỉ lệ tích lũy >= frac.
    // Chống dồn cụm: 1 media mỗi đoạn tối đa — media trùng điểm chèn (summary
    // ngắn, pos gần nhau) dời xuống đoạn kế tiếp còn trống, GIỮ nguyên thứ tự
    // pos của bài gốc; media thừa không còn chỗ → bỏ (tóm tắt không cần full
    // gallery). atIdx ngắn hơn media → các media đuôi không được render.
    const lastPara = Math.max(paras.length - 1, 0);
    const atIdx: number[] = [];
    for (const f of fracs) {
      const base = cumPara.reduce((c, v) => c + (v < f - 1e-9 ? 1 : 0), 0);
      let t = Math.min(base, lastPara);
      while (atIdx.includes(t)) t++;
      if (t > lastPara) break;
      atIdx.push(t);
    }

    // Phân loại đoạn: dòng gạch đầu dòng (- / • / *) = điểm nhấn, đoạn đầu tiên = lead
    const isBullet = (s: string) => /^[-•*]\s/.test(s);

    if (paraWords.length > 0) {
      // Word-level karaoke highlighting PER PARAGRAPH + interleaved media
      // (cả web lẫn native — highlightWordIndex được applyProgress cập nhật chung)
      const renderPara = (pi: number) => {
        const words = paraWords[pi];
        if (!words) return null; // guard: index lệch (không xảy ra khi wordMap là useMemo, nhưng chặn crash)
        const bullet = isBullet(paras[pi] || '');
        const isTldr = pi === 0 && !bullet && hasFacts;
        const lead = pi === 0 && !bullet && !hasFacts;
        let firstVisible = true;
        const text = (
          <Text style={[styles.summaryText, isTldr && styles.tldrPara, lead && styles.summaryLead, bullet && styles.bulletText]}>
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
            <View style={styles.bulletDot} />
            <View style={styles.bulletBody}>{text}</View>
          </View>
        );
      };
      if (!media.length) return paraWords.map((_, pi) => renderPara(pi));
      // With media: interleave theo bố cục bài gốc, mỗi đoạn vẫn word-highlight
      let cur = 0;
      for (let mi = 0; mi < atIdx.length; mi++) {
        while (cur < atIdx[mi]) { nodes.push(renderPara(cur)); cur++; }
        nodes.push(renderMedia(media[mi], 'm' + mi));
      }
      while (cur < paraWords.length) { nodes.push(renderPara(cur)); cur++; }
      return nodes;
    }

    // Fallback (summary trống/từ vựng rỗng): paragraph-level highlighting với interleaved media
    const renderParaNative = (i: number) => {
      const p = paras[i];
      const bullet = isBullet(p);
      const isTldr = i === 0 && !bullet && hasFacts;
      const lead = i === 0 && !bullet && !hasFacts;
      const text = (
        <Text style={[
          styles.summaryText,
          isTldr && styles.tldrPara,
          lead && styles.summaryLead,
          bullet && styles.bulletText,
          highlightParaIndex === i && { backgroundColor: C.hotSoft, borderRadius: 3 }
        ]}>{bullet ? p.replace(/^[-•*]\s+/, '') : p}</Text>
      );
      if (!bullet) return <React.Fragment key={'p' + i}>{text}</React.Fragment>;
      return (
        <View key={'b' + i} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <View style={styles.bulletBody}>{text}</View>
        </View>
      );
    };
    if (!media.length) return paras.map((_, i) => renderParaNative(i));
    let cur = 0;
    for (let mi = 0; mi < atIdx.length; mi++) {
      while (cur < atIdx[mi]) { nodes.push(renderParaNative(cur)); cur++; }
      nodes.push(renderMedia(media[mi], 'm' + mi));
    }
    while (cur < paras.length) { nodes.push(renderParaNative(cur)); cur++; }
    return nodes;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn} accessibilityLabel="Quay lại">
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
            {offline ? (
              <View style={styles.offlineChip}>
                <Ionicons name="cloud-offline-outline" size={11} color={C.textMuted} />
                <Text style={styles.offlineChipText}>OFFLINE</Text>
              </View>
            ) : null}
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

          {/* Thanh tiến trình đọc — chạy theo word đang được đọc */}
          {speaking && wordOffsets.length > 0 ? (
            <View style={styles.speakProgress}>
              <View
                style={[
                  styles.speakProgressFill,
                  {
                    width: `${Math.min(100, Math.max(2, Math.round(((highlightWordIndex + 1) / wordOffsets.length) * 100)))}%`,
                  },
                ]}
              />
            </View>
          ) : null}

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

const HLS_RE = /\.m3u8(\?|#|$)/i;

// HLS (m3u8, vd video.vnexpress.net): web qua proxy /api/hls + hls.js;
// native expo-video chơi HLS trực tiếp (không cần proxy).
// Tách component vì useVideoPlayer là hook — không được đứng sau early-return.
function FileVideo({ url }: { url: string }) {
  if (!HLS_RE.test(url)) return <ExpoFileVideo url={url} />;
  if (Platform.OS === 'web') return <WebHlsVideo url={url} />;
  return <ExpoFileVideo url={url} />;
}

function ExpoFileVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return <VideoView style={styles.videoThumb} player={player} nativeControls contentFit="cover" />;
}

// Cùng cách phát như WebVideoPlayer trong VideoModal (hls.js + /api/hls)
function WebHlsVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const src = `${getGoodProxyBase() || getProxyBase()}/api/hls?url=${encodeURIComponent(url)}`;
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src; // Safari chơi HLS native qua proxy
    }
    return () => { if (hls) hls.destroy(); };
  }, [url]);
  return (
    <video
      ref={ref}
      controls
      playsInline
      style={{ width: '100%', height: 200, backgroundColor: '#000' }}
    />
  );
}

// Ảnh mà không load được (url hỏng/đổi trang) → trả về null, không để lại ô trống rác.
// memo: highlight tick re-render ArticleScreen liên tục khi đọc; không memo thì
// mỗi tick remount <Image> (refetch + console "Image load at ...") dù props y hệt.
const SafeImg = memo(function SafeImg({ url, caption, onPress }: { url: string; caption?: string; onPress?: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <View style={styles.imgWrap}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <Image style={styles.blockImg} source={{ uri: url }} resizeMode="cover" onError={() => setFailed(true)} />
      </TouchableOpacity>
      {caption ? <Text style={styles.blockCaption}>{caption}</Text> : null}
    </View>
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
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.hot,
    backgroundColor: Color.hotSoft,
    marginLeft: 'auto',
  },
  speakBtnOn: { backgroundColor: Color.hot, borderColor: Color.hot },
  speakBtnText: { fontSize: Font.tiny, fontWeight: '700', color: Color.hot },
  speakBtnTextOn: { color: '#FFF' },
  // Chip "OFFLINE" — summary do fallback extractive tạo khi không tới được AI
  offlineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.border,
    backgroundColor: Color.surfaceAlt,
  },
  offlineChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: Color.textMuted,
  },
  // Thanh tiến trình đọc (hiện khi đang Nghe) — mảnh, nằm ngay dưới hàng badge
  speakProgress: {
    height: 3,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 2,
    backgroundColor: Color.hotSoft,
    overflow: 'hidden',
  },
  speakProgressFill: { height: '100%', backgroundColor: Color.hot },
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
  summaryText: { fontSize: 15, lineHeight: 26, color: Color.text, marginBottom: 14 },
  // TL;DR — dòng đầu của summary có cấu trúc: nền tint nổi bật, đậm hơn thân bài
  tldrPara: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '700',
    color: Color.text,
    backgroundColor: Color.hotSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  // Đoạn mở đầu (lead) — đậm hơn, vạch cam bên trái kiểu báo giấy
  summaryLead: {
    fontSize: 17,
    lineHeight: 27,
    fontWeight: '600',
    color: Color.text,
    borderLeftWidth: 3,
    borderLeftColor: Color.hot,
    paddingLeft: 10,
    paddingVertical: 2,
  },
  // Điểm nhấn gạch đầu dòng — dot màu thay vì ô nền, thoáng và sạch hơn
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Color.hot,
    marginTop: 9,
    marginRight: 10,
  },
  bulletBody: { flex: 1 },
  bulletText: { fontWeight: '600', marginBottom: 0 },
  copyInline: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.border,
    backgroundColor: Color.surfaceAlt,
    marginBottom: 14,
  },
  copyInlineText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  // Ảnh/video đan xen trong khung tóm tắt — tỉ lệ 16:9 theo ảnh báo gốc
  imgWrap: { marginBottom: 14 },
  blockImg: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.sm,
    backgroundColor: Color.skeleton,
  },
  blockCaption: {
    marginTop: 7,
    fontSize: Font.caption,
    lineHeight: 18,
    color: Color.textMuted,
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
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
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