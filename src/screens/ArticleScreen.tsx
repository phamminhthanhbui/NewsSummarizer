import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
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
  Animated,
  Easing,
  Pressable,
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
import { fetchArticleContent, summarizeArticle, blocksToText, fetchArticleMedia, fetchArticleTextFast, baseUrlKey, sameImageFile, buildExtractiveSummary, aiCondenseCaptions, getCachedCaption, CAPTION_AI_MAX, isStaleSummary, peekPendingSummary, saveSummaryToHistory, isVideoPageUrl } from '../services/summarize';
import type { ArticleBlock } from '../services/summarize';
import { fetchAllFeeds, readFeedsCache, SOURCE_COLORS } from '../services/feeds';
import ArticleCard from '../components/ArticleCard';
import { getGoodProxyBase, getProxyBase } from '../utils/proxy';
import { speakSystem, stopSystem, clearVoiceHung } from '../services/edgeTts';
import { buildWordMap } from '../services/wordMap';
import { buildTtsChunks, type TtsWord } from '../services/ttsChunks';


// ponytail: magic numbers centralized in storage.LIMITS
import { LIMITS } from '../services/storage';

export default function ArticleScreen({ navigation, route }: any) {
  const { item } = route.params as { item: FeedItem };
  const insets = useSafeAreaInsets();
  const C = useTheme();
  const styles = makeStyles(C); // styles động theo dark mode
  // Trang video (video.xxx.vn / /video/...): thân là clip, không có bài văn để tóm
  const isVideoPage = isVideoPageUrl(item.link);

  const [blocks, setBlocks] = useState<ArticleBlock[]>([]);
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  // true từ đầu: nút "Nghe" disable cho tới khi chuỗi tóm tắt thật sự kết thúc
  // (cache hit / pend về / final), không phải khi mới có placeholder mô tả
  const [summarizing, setSummarizing] = useState(true);
  // Đếm số lần summary đổi — làm key word-span. Không có thì ReactReconciler
  // reuse span cũ theo index → mất highlight mỗi token stream về.
  const summaryKeyRef = useRef(0);
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
  // Modal xem ảnh: spinner khi đang tải, animation scale+fade lúc mở
  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const imgAnim = useRef(new Animated.Value(0)).current;

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
    setImgLoading(true);
    setImgError(false);
    setImageModal({ visible: true, url: best });
  }, [blocks]);
  const closeImageModal = () => setImageModal({ visible: false, url: '' });

  // Scale + fade vào mỗi lần mở modal (Modal unmount khi đóng nên luôn chạy từ 0)
  useEffect(() => {
    if (!imageModal.visible) return;
    imgAnim.setValue(0);
    Animated.timing(imgAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [imageModal.visible, imgAnim]);

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

      // Trang VIDEO (video.xxx.vn, /video/...): nội dung là clip, không có bài
      // văn — AI tóm tắt vô nghĩa. Chỉ tải blocks (đã nhận diện video + stream),
      // render player; bỏ qua mọi chuỗi summarize/upgrade.
      if (isVideoPageUrl(item.link)) {
        const b = (await fetchArticleContent(item.link).catch(() => [] as ArticleBlock[])) || [];
        setBlocks(b);
        setContent(blocksToText(b));
        setSummarizing(false);
        return;
      }

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
        setSummarizing(false);
        const blocks = await blocksTask;
        setBlocks(blocks);
        setContent(blocksToText(blocks));
        return;
      }
      if (cached) {
        const cleaned = history.filter((h) => !(h.url === item.link && isStaleSummary(h.summary)));
        await AsyncStorage.setItem(KEYS.history, JSON.stringify(cleaned));
      }

      let lastErr = '';
      // Pre-summarize nền (Home prefetch) — KHÔNG await chặn fast path: nó về
      // tới đâu dùng tới đó (bản full-text, chất lượng cao hơn), flag chặn
      // fast/upgrade đè lại sau.
      let fullArrived = false;
      let pendText: string | null = null;
      const pend = peekPendingSummary(item.link);
      if (pend) {
        pend.then((s) => {
          if (s && s.trim().length >= 20 && !isStaleSummary(s)) {
            fullArrived = true;
            pendText = s;
            setSummary(s);
            setSummarizing(false);
            setError('');
            setOffline(false);
          }
        }).catch(() => { /* thất bại → fast/upgrade thường sẽ lo */ });
      }

      // HIỆN NGAY mô tả RSS làm placeholder tóm tắt (0ms) — AI về sau thay thế.
      if (!pend && item.description) {
        setSummary(item.description.trim());
      }

      // TÓM NHANH từ mô tả — chạy SONG SONG với tải toàn bài, KHÔNG await chặn
      // chuỗi nâng cấp (chuỗi fast→await→full cũ cộng thêm ~2-4s tổng thời gian).
      // Request nhỏ (~vài trăm ký tự) nên chạy cạnh pend/fast khác cũng chẳng
      // đáng kể; đổi lại chữ AI-quality xuất hiện sau ~2-3s thay vì mô tả thô.
      const descSrc = (item.description || '').trim();
      const fastTask: Promise<string | null> = descSrc.length < 80
        ? Promise.resolve(null)
        : summarizeArticle(descSrc, item.category, (partial) => {
            if (!fullArrived && partial) setSummary(partial);
          }).catch((e: Error) => { lastErr = e.message || ''; return null; });

      // Bài gốc + text đầy đủ do Jina trả: render đủ caption/media nhưng r.jina.ai
      // mất 10-20s. KHÔNG chờ Jina để nâng cấp summary — nguồn text bóc thẳng từ
      // HTML trang báo (~1-2s, vốn đã fetch cho ảnh) thường sẵn sàng trước;
      // Jina về tới đâu cập nhật phần bài đọc tới đó.
      blocksTask.then((b) => {
        if (b.length) setBlocks(b);
        const t = blocksToText(b);
        if (t) setContent(t);
      });
      const htmlTextP = fetchArticleTextFast(item.link);
      const srcReady: Promise<string> = new Promise<string>((resolve) => {
        let done = false;
        // 400 ký tự = ngưỡng "có nội dung thật" (nav/breadcrumb ngắn hơn nhiều)
        const take = (t: string) => {
          if (!done && t && t.trim().length >= 400) { done = true; resolve(t.trim()); }
        };
        htmlTextP.then((t) => take(t), () => {});
        blocksTask.then((b) => take(blocksToText(b)), () => {});
        // cả hai nguồn xong mà không đủ dài → dùng bản dài nhất (có thể rỗng)
        Promise.all([htmlTextP.catch(() => ''), blocksTask.then(blocksToText)]).then(([a, b]) => {
          if (!done) { done = true; resolve((b.length >= a.length ? b : a).trim()); }
        });
      });

      // NÂNG CẤP summary bằng bản full-text (stream)
      let upgradeFull: string | null = null;
      let upgradeSrc = '';
      if (!fullArrived) {
        if (pend) {
          // Home đã gọi LLM full-text cho đúng bài này → CHỜ bản đó (cap 25s)
          // thay vì gọi trùng lần 2 — 2 request song song cùng bài chỉ làm
          // chậm lẫn nhau.
          upgradeFull = await Promise.race([
            pend.catch(() => null as string | null),
            new Promise<null>((r) => setTimeout(r, 25000)),
          ]);
          if (upgradeFull && (upgradeFull.trim().length < 20 || isStaleSummary(upgradeFull))) upgradeFull = null;
        }
        if (!upgradeFull) {
          upgradeSrc = await srcReady;
          if (upgradeSrc.length >= 400 && upgradeSrc.length > descSrc.length) {
            upgradeFull = await summarizeArticle(upgradeSrc, item.category, (partial) => {
              if (!fullArrived && partial) setSummary(partial);
            }).catch(() => null);
            if (upgradeFull) setOffline(false);
          }
        }
      }

      const fast = await fastTask;
      let finalSummary = upgradeFull || pendText || fast;
      // AI chết hoàn toàn → fallback extractive (chọn-câu, không cần mạng):
      // app vẫn luôn có tóm tắt hiển thị thay vì ô lỗi. Jina chưa về thì tóm
      // bằng chính nguồn text nhanh đã tải.
      if (!finalSummary) {
        const jinaBlocks = await Promise.race([
          blocksTask,
          new Promise<null>((r) => setTimeout(() => r(null), 1500)),
        ]);
        const exBlocks: ArticleBlock[] = jinaBlocks && jinaBlocks.length
          ? jinaBlocks
          : upgradeSrc ? [{ type: 'text', text: upgradeSrc }] : [];
        if (exBlocks.length) {
          const ex = buildExtractiveSummary(item.title, exBlocks);
          if (ex) { finalSummary = ex; setOffline(true); }
        }
      }
      if (finalSummary) {
        setSummary(finalSummary);
        setError('');
        if (!fullArrived) await saveToHistory(finalSummary); // nền đã tự ghi history
      } else if (lastErr) {
        setError(lastErr);
      }
      setSummarizing(false);
    })().catch(() => setSummarizing(false));
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
    // Đang đọc mà bấm tóm tắt lại → tắt giọng trước, kẻo voice cũ + bản tóm
    // tắt mới đọc đè lên nhau
    speakGenRef.current++;
    cancelledRef.current = true;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    stopSystem();
    setSpeaking(false);
    setError('');
    setSummarizing(true);
    resumeRef.current = null;
    resumeSummaryRef.current = '';
    try {
      const src = content || item.description;
      // stream: chữ refresh cũng hiện dần thay vì chờ xong cả câu
      const s = await summarizeArticle(src, item.category, (partial) => { if (partial) setSummary(partial); });
      setSummary(s);
      setOffline(false);
      await saveSummaryToHistory(item, s);
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


  const goArticle = useCallback((feedItem: FeedItem) =>
    navigation.push('Article', { item: feedItem }), [navigation]);

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
    summaryKeyRef.current++; // summary đổi → word-span phải remount (xem renderSummaryNodes)
    return { wordOffsets: offsets, paraWords: paras, flatToPara: f2p };
  }, [summary]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Thế hệ phiên đọc: stop/resume tăng gen → loop cũ chết hẳn, không ghi đè
  // UI của phiên mới (bug cũ: loop zombie của phiên trước làm mờ highlight +
  // xóa resumeRef giữa chừng)
  const speakGenRef = useRef(0);
  // Hiệu chỉnh tốc độ đọc thực RIÊNG CHO TỪNG rate (ms/ký tự), cập nhật EMA sau
  // MỖI cụm câu trong lúc đọc → highlight tự bám lại giọng trong vòng vài câu
  // khi user tăng/giảm tốc. Rate TTS không tuyến tính nên không quy đổi chéo.
  const sysCalibRef = useRef<Record<string, number>>({});
  // Chunk index + offset ký tự TRONG chunk cho resume: stop → lưu lại, bấm
  // Nghe lần sau → slice đúng chỗ dừng đọc tiếp (kể cả giữa câu), không đọc
  // lại từ đầu.
  const resumeRef = useRef<{ chunkIdx: number; charPos: number } | null>(null);
  // Resume chỉ hợp lệ khi summary không đổi kể từ lúc stop (summary nâng cấp
  // full-text làm TtsChunk cũ vô nghĩa)
  const resumeSummaryRef = useRef('');

  // Reset highlight khi summary đổi
  useEffect(() => {
    setHighlightWordIndex(-1);
    setHighlightParaIndex(-1);
    resumeRef.current = null;
    resumeSummaryRef.current = '';
  }, [summary]);

  // Giọng đọc: chia tóm tắt thành cụm câu, đọc lần lượt. Highlight neo theo
  // word-boundary (web + native Android) khi có, nội suy thời gian làm nền giữa
  // các boundary — sai số không vượt quá 1 cụm nên không trôi kể cả đổi tốc độ.
  const clearSpeakTimer = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const toggleSpeak = async () => {
    if (speaking) {
      // Dừng → increased gen giết loop cũ (kể cả loop đang await giữa chunk),
      // lưu vị trí hiện tại để resume
      speakGenRef.current++;
      cancelledRef.current = true;
      clearSpeakTimer();
      stopSystem();
      setSpeaking(false);
      // Giữ highlight nguyên (không reset về -1) để biết đã đọc tới đâu
      return;
    }
    if (!summary || !paraWords.length || summarizing) return;
    cancelledRef.current = false;
    clearVoiceHung();
    const gen = ++speakGenRef.current;
    setSpeaking(true);
    // Resume chỉ hợp lệ khi summary không đổi từ lúc stop
    if (resumeRef.current && resumeSummaryRef.current !== summary) resumeRef.current = null;
    const startChunk = resumeRef.current?.chunkIdx ?? 0;
    const startChar = resumeRef.current?.charPos ?? 0;
    resumeRef.current = null;
    resumeSummaryRef.current = summary;
    const resuming = startChunk > 0 || startChar > 0;
    if (!resuming) {
      // Lần đầu: highlight từ đầu
      setHighlightWordIndex(0);
      setHighlightParaIndex(0);
    }
    try {
      const rate = parseFloat((await AsyncStorage.getItem(KEYS.rate)) || '') || 1.0;
      const pitch = parseFloat((await AsyncStorage.getItem(KEYS.pitch)) || '') || 1.0;
      const chunks = buildTtsChunks(paraWords);
      if (!chunks.length) throw new Error('Không có nội dung để đọc');
      if (startChunk >= chunks.length) { // resume sau khi đã đọc tới cuối
        resumeSummaryRef.current = '';
        setSpeaking(false);
        return;
      }

      const rateKey = rate.toFixed(1);
      let msPerChar = sysCalibRef.current[rateKey] ?? 90 / Math.max(rate, 0.01);

      const applyFlat = (flat: number) => {
        setHighlightWordIndex(flat);
        const pi = flatToPara[flat];
        if (pi !== undefined) setHighlightParaIndex(pi);
      };

      for (let ci = startChunk; ci < chunks.length; ci++) {
        if (cancelledRef.current || speakGenRef.current !== gen) break;
        const chunk = chunks[ci];
        const t0 = Date.now();
        // Resume giữa câu: giọng đọc slice từ charPos → audio tiếp đúng chỗ dừng,
        // mọi charIndex của chunk này quy về tuyệt đối bằng base + rel
        const isResumeChunk = ci === startChunk && startChar > 0;
        const base = isResumeChunk ? Math.min(startChar, chunk.text.length - 1) : 0;
        const speakText = base > 0 ? chunk.text.slice(base) : chunk.text;
        let anchorChar = base; // vị trí ký tự từ boundary cuối (tương đối chunk.text)
        let anchorTime = 0;

        const applyWordAtChar = (charPos: number) => {
          let lo = 0, hi = chunk.starts.length - 1, i = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (chunk.starts[mid] <= charPos) { i = mid; lo = mid + 1; } else { hi = mid - 1; }
          }
          applyFlat(chunk.flats[Math.max(0, Math.min(i, chunk.flats.length - 1))]);
        };
        const mark = (pos: number) => {
          resumeRef.current = { chunkIdx: ci, charPos: Math.max(0, Math.min(pos, chunk.text.length - 1)) };
        };

        applyWordAtChar(anchorChar);
        mark(anchorChar);
        clearSpeakTimer();
        intervalRef.current = setInterval(() => {
          if (cancelledRef.current || speakGenRef.current !== gen || !anchorTime) return;
          const projectedChar = anchorChar + Math.round((Date.now() - anchorTime) / Math.max(msPerChar, 20));
          // Giới hạn: không vượt quá độ dài chunk để tránh nhảy quá xa
          const clamped = Math.min(projectedChar, chunk.text.length);
          applyWordAtChar(clamped);
        }, 100); // 100ms thay vì 200ms — bám sát giọng hơn

        let tSpeak = 0;
        try {
          await speakSystem(speakText, {
            pitch,
            rate,
            onStart: () => {
              tSpeak = Date.now();
              anchorTime = tSpeak;
              if (base === 0) applyWordAtChar(0);
            },
            onBoundary: (ev) => {
              if (typeof ev?.charIndex !== 'number') return;
              anchorChar = base + ev.charIndex;
              anchorTime = Date.now();
              applyWordAtChar(anchorChar);
              mark(anchorChar); // stop giữa câu → resume đúng từ đang đọc
            },
          });
        } catch (e) {
          clearSpeakTimer();
          throw e instanceof Error ? e : new Error('Không đọc được giọng Việt trên thiết bị này');
        }
        clearSpeakTimer();
        // Stop/phiên mới giữa chunk → speakSystem resolve sớm: KHÔNG đánh dấu
        // chunk xong, nếu không resume sẽ bỏ qua cả câu đang đọc dở
        if (cancelledRef.current || speakGenRef.current !== gen) break;
        // Chunk đọc trọn vẹn → nếu stop từ đây, resume từ ĐẦU CHUNK KẾ
        resumeRef.current = ci + 1 < chunks.length ? { chunkIdx: ci + 1, charPos: 0 } : null;
        // Đo tốc độ đọc THỰC của cụm
        const dur = tSpeak ? Date.now() - tSpeak : Date.now() - t0;
        if (dur > 600 && speakText.length > 12) {
          const lo = 45 / Math.max(rate, 0.05);
          const hi = 170 / Math.max(rate, 0.05);
          const measured = Math.min(hi, Math.max(lo, dur / speakText.length));
          msPerChar = msPerChar * 0.55 + measured * 0.45;
          sysCalibRef.current[rateKey] = msPerChar;
        }
      }
      if (!cancelledRef.current && speakGenRef.current === gen) {
        setSpeaking(false);
        setHighlightWordIndex(-1);
        setHighlightParaIndex(-1);
        resumeRef.current = null; // đọc xong hết → xóa resume
        resumeSummaryRef.current = '';
      }
      // stopped giữa chừng → resumeRef đã lưu vị trí chính xác, không làm gì thêm
    } catch (e) {
      if (speakGenRef.current !== gen) return; // stop/race — không phải lỗi thật
      setError(e instanceof Error ? e.message : 'Không đọc được');
      cancelledRef.current = true;
      stopSystem();
      clearSpeakTimer();
      setSpeaking(false);
      setHighlightWordIndex(-1);
      setHighlightParaIndex(-1);
      resumeRef.current = null;
      resumeSummaryRef.current = '';
    }
  };

  // Dừng đọc khi rời màn hình. Bottom-tabs KHÔNG unmount khi chuyển tab
  // (unmountOnBlur mặc định false) nên phải nghe event 'blur', không chỉ unmount.
  const stopSpeaking = () => {
    speakGenRef.current++; // giết loop + chặn catch của phiên cũ
    cancelledRef.current = true; // chặn continuation của speakSystem đang chờ
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    stopSystem();
    setSpeaking(false);
    setHighlightWordIndex(-1);
    setHighlightParaIndex(-1);
  };

  useEffect(() => {
    const unsub = navigation.addListener('blur', stopSpeaking);
    return () => { unsub(); stopSpeaking(); };
    // stopSpeaking được tạo lại mỗi render — đăng ký lại theo item.link (stale
    // closure không sao vì nó chỉ đọc ref + setter)
  }, [item.link]);

  // Read time estimate (chars → minutes); degrades to stub until content loads
  const READ_WPM = 250;
  const readTime = Math.max(1, Math.ceil((content || item.description).length / READ_WPM));

  // Trang video: khối video duy nhất (nếu đã tải về) — render player thay AI tóm tắt
  const videoBlock = isVideoPage ? blocks.find((b) => b.type === 'video') : null;

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
      // sp = số thứ tự của bản summary hiện tại: summary đổi (stream/nâng cấp)
      // làm key word khác đi → span REMOUNT, nếu không React reuse span cũ theo
      // index khiến highlight biến mất giữa lúc đang đọc
      const sp = summaryKeyRef.current;
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
                  key={'w' + sp + '_' + pi + '_' + wi}
                  style={[w.flat === highlightWordIndex && { backgroundColor: C.hotSoft, borderRadius: 3, fontWeight: '700', color: C.hot }]}
                >{spacer}{w.text}</Text>
              );
            })}
          </Text>
        );
        if (!bullet) return <React.Fragment key={'wp' + sp + '_' + pi}>{text}</React.Fragment>;
        return (
          <View key={'b' + sp + '_' + pi} style={styles.bulletRow}>
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
    const renderPara = (i: number) => {
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
          highlightParaIndex === i && { backgroundColor: C.hotSoft },
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
    if (!media.length) return paras.map((_, i) => renderPara(i));
    let cur = 0;
    for (let mi = 0; mi < atIdx.length; mi++) {
      while (cur < atIdx[mi]) { nodes.push(renderPara(cur)); cur++; }
      nodes.push(renderMedia(media[mi], 'm' + mi));
    }
    while (cur < paras.length) { nodes.push(renderPara(cur)); cur++; }
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
              <Ionicons name={isVideoPage ? 'videocam' : 'sparkles'} size={13} color="#FFF" />
              <Text style={styles.summaryLabel}>{isVideoPage ? 'VIDEO' : 'AI TÓM TẮT'}</Text>
            </LinearGradient>
            {offline ? (
              <View style={styles.offlineChip}>
                <Ionicons name="cloud-offline-outline" size={11} color={C.textMuted} />
                <Text style={styles.offlineChipText}>OFFLINE</Text>
              </View>
            ) : null}
            {!isVideoPage && paraWords.length > 0 && (
              <TouchableOpacity
                onPress={toggleSpeak}
                disabled={summarizing}
                accessibilityState={{ disabled: summarizing }}
                style={[styles.speakBtn, speaking && styles.speakBtnOn, summarizing && styles.speakBtnDisabled]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={speaking ? 'Dừng đọc' : summarizing ? 'Đang tóm tắt, chưa đọc được' : 'Nghe tóm tắt'}
              >
                <Ionicons name={speaking ? 'stop' : 'volume-high'} size={16} color={speaking ? '#FFF' : C.hot} />
                <Text style={[styles.speakBtnText, speaking && styles.speakBtnTextOn]}>
                  {speaking ? 'Dừng' : 'Nghe'}
                </Text>
              </TouchableOpacity>
            )}
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

          {isVideoPage ? (
            <View style={styles.summaryBody}>
              {videoBlock ? (
                <BlockVideo key="block-video" block={videoBlock} />
              ) : item.image ? (
                <Image source={{ uri: item.image }} style={styles.cardImg} resizeMode="cover" />
              ) : (
                <View style={styles.summaryErr}>
                  <Text style={styles.summaryErrText}>Đang tải video…</Text>
                </View>
              )}
            </View>
          ) : summarizing && !summary ? (
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
              {summarizing ? (
                // Trạng thái "chưa tóm tắt xong" đặt DƯỚI thân bài — để cạnh
                // badge thì nó đẩy nút Nghe (marginLeft:auto) tràn ra ngoài
                <View style={styles.summarizingFoot}>
                  <ActivityIndicator size="small" color={C.textMuted} />
                  <Text style={styles.summarizingFootText}>Đang hoàn thiện tóm tắt…</Text>
                </View>
              ) : (
                <TouchableOpacity style={styles.copyInline} onPress={copySummary} activeOpacity={0.7}>
                  <Ionicons name="copy-outline" size={14} color={C.hot} />
                  <Text style={styles.copyInlineText}>Copy tóm tắt</Text>
                </TouchableOpacity>
              )}
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
      <Modal
        visible={imageModal.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeImageModal}
      >
        <View style={styles.imageModalOverlay}>
          {/* Backdrop — bấm ra ngoài ảnh là đóng */}
          <Pressable style={StyleSheet.absoluteFill} onPress={closeImageModal} accessibilityLabel="Đóng hình ảnh" />
          {/* Header: nguồn + nút đóng kính mờ trên gradient mờ dần */}
          <LinearGradient
            colors={['rgba(0,0,0,0.75)', 'rgba(0,0,0,0)']}
            style={[styles.imageModalHeader, { paddingTop: insets.top + 8 }]}
          >
            <Text style={styles.imageModalSource} numberOfLines={1}>{item.source}</Text>
            <TouchableOpacity
              style={styles.imageModalCloseBtn}
              onPress={closeImageModal}
              accessibilityLabel="Đóng hình ảnh"
              hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
            >
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
          </LinearGradient>
          {/* Ảnh thẻ bo góc — scale + fade vào */}
          <Animated.View
            style={[styles.imageModalContent, { opacity: imgAnim, transform: [{ scale: imgAnim }] }]}
          >
            <View style={styles.imageModalCard}>
              <Image
                source={{ uri: imageModal.url }}
                style={styles.imageModalImg}
                resizeMode="contain"
                onLoadEnd={() => setImgLoading(false)}
                onError={() => { setImgLoading(false); setImgError(true); }}
              />
              {imgLoading && !imgError && (
                <View style={styles.imageModalSpinner}>
                  <ActivityIndicator size="large" color="#FFF" />
                </View>
              )}
              {imgError && (
                <View style={styles.imageModalSpinner}>
                  <Ionicons name="cloud-offline-outline" size={36} color="rgba(255,255,255,0.65)" />
                  <Text style={styles.imageModalErrorText}>Không tải được ảnh</Text>
                </View>
              )}
            </View>
          </Animated.View>
          {/* Footer: hành động trên gradient mờ dần */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
            style={[styles.imageModalFooter, { paddingBottom: insets.bottom + 14 }]}
          >
            <TouchableOpacity
              style={styles.imageModalAction}
              onPress={() => Linking.openURL(imageModal.url).catch(() => {})}
              accessibilityLabel="Mở ảnh gốc"
            >
              <Ionicons name="open-outline" size={19} color="#FFF" />
              <Text style={styles.imageModalActionText}>Mở ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.imageModalAction}
              onPress={() => Share.share({ message: imageModal.url })}
              accessibilityLabel="Chia sẻ ảnh"
            >
              <Ionicons name="share-social-outline" size={19} color="#FFF" />
              <Text style={styles.imageModalActionText}>Chia sẻ</Text>
            </TouchableOpacity>
          </LinearGradient>
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
          onPress={isVideoPage ? () => Linking.openURL(item.link) : summarize}
          activeOpacity={0.7}
          disabled={summarizing && !isVideoPage}
          accessibilityLabel={isVideoPage ? 'Mở video tại nguồn' : undefined}
        >
          <Ionicons
            name={isVideoPage ? 'open-outline' : summarizing ? 'sync' : 'refresh'}
            size={21}
            color={C.primary}
          />
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
  // 16:9 theo width thật (tránh h cứng 200 crop video dọc) — đo qua onLayout
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={styles.videoThumbWrap}>
      <VideoView style={{ width: '100%', height: w ? Math.round((w * 9) / 16) : 200 }} player={player} nativeControls contentFit="contain" />
    </View>
  );
}

// HLS web: hls.js + /api/hls (Chrome không chơi HLS native)
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
      style={{ width: '100%', aspectRatio: '16 / 9', backgroundColor: '#000' }}
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
    flexWrap: 'wrap', // màn rất hẹp → badge/chips xuống dòng, không nuốt nút Nghe
    rowGap: 6,
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
  // Nút Nghe/Dừng trong hàng badge của thẻ tóm tắt
  speakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.hot,
    marginLeft: 'auto',
  },
  speakBtnOn: { backgroundColor: Color.hot, borderColor: Color.hot },
  // Chưa summarize xong → nút Nghe_DISABLED (vẫn thấy vị trí nút, không mất layout)
  speakBtnDisabled: { opacity: 0.45 },
  speakBtnText: { fontSize: Font.tiny, fontWeight: '700', color: Color.hot },
  speakBtnTextOn: { color: '#FFF' },
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
  // Hàng trạng thái "đang hoàn thiện" DƯỚI thân bài — đứng cạnh badge trên
  // hàng summaryLabelRow sẽ chen mất chỗ của nút Nghe
  summarizingFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 14 },
  summarizingFootText: { fontSize: Font.caption, color: Color.textMuted, fontStyle: 'italic' },
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
  videoThumbWrap: { width: '100%', backgroundColor: Color.skeleton },
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
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  imageModalHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 28,
    zIndex: 10,
  },
  imageModalSource: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  imageModalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  imageModalContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  imageModalCard: {
    width: '100%',
    height: '74%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  imageModalImg: {
    width: '100%',
    height: '100%',
  },
  imageModalSpinner: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageModalErrorText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    marginTop: 10,
  },
  imageModalFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 36,
    paddingHorizontal: 16,
  },
  imageModalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  imageModalActionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);