import { Action } from '../components/PremiumUI';
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
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem, SummaryRecord } from '../types';
import { Sans, Color, Font, Radius, Shadow, useTheme } from '../constants/theme';
import { KEYS, bumpReadCount } from '../services/storage';
import { fetchArticleContent, summarizeArticle, blocksToText, fetchArticleMedia, fetchArticleTextFast, baseUrlKey, sameImageFile, saveSummaryToHistory, isVideoPageUrl } from '../services/summarize';
import { isCurrentRuleSummary, fingerprintSummaryInput } from '../services/ruleSummary';
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
  // Distinguish a complete article from its short RSS description.
  const [summarySource, setSummarySource] = useState<'article' | 'description'>('description');
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

  // Show available source sentences immediately, then update once full text arrives.
  useEffect(() => {
    let alive = true;
    let displayed = '';
    setBlocks([]);
    setContent('');
    setSummary('');
    setError('');
    setSummarySource('description');
    setSummarizing(true);
    void bumpReadCount(item.link);
    AsyncStorage.getItem(KEYS.saved).then(raw => {
      const saved: FeedItem[] = raw ? JSON.parse(raw) : [];
      if (alive) setIsSaved(saved.some(s => s.link === item.link));
    }).catch(() => {});

    const apply = (text: string, source: 'article' | 'description') => {
      if (!alive) return;
      if (displayed && displayed !== text) {
        speakGenRef.current++;
        cancelledRef.current = true;
        stopSystem();
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        setSpeaking(false);
        resumeRef.current = null;
        resumeSummaryRef.current = '';
      }
      displayed = text;
      setSummary(text);
      setSummarySource(source);
      setError('');
      setSummarizing(false);
    };

    const blocksTask = fetchArticleContent(item.link).catch(() => [] as ArticleBlock[]);
    if (isVideoPage) {
      blocksTask.then(b => { if (alive) { setBlocks(b); setContent(blocksToText(b)); setSummarizing(false); } });
      return () => { alive = false; };
    }
    const fastTextTask = fetchArticleTextFast(item.link).catch(() => '');
    fetchArticleMedia(item.link).then(media => {
      if (alive && media.length) setBlocks(previous => previous.length ? previous : media);
    }).catch(() => {});
    blocksTask.then(b => {
      if (!alive) return;
      if (b.length) setBlocks(b);
      const text = blocksToText(b);
      if (text) setContent(text);
    });
    (async () => {
      let all = await readFeedsCache();
      if (!all.length) all = await fetchAllFeeds().catch(() => [] as FeedItem[]);
      if (alive) setRelated([
        ...all.filter(a => a.source === item.source && a.link !== item.link),
        ...all.filter(a => a.source !== item.source && a.link !== item.link),
      ].slice(0, LIMITS.relatedMax));
    })().catch(() => {});

    (async () => {
      let cached: SummaryRecord | undefined;
      try {
        const raw = await AsyncStorage.getItem(KEYS.history);
        const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
        cached = history.find(h => h.url === item.link && isCurrentRuleSummary(h));
      } catch { }
      if (!alive) return;
      if (cached) apply(cached.summary, cached.summarySource || 'description');
      else if (item.description?.trim()) {
        const short = await summarizeArticle(item.description, item.category, undefined, item.title).catch(() => '');
        if (!alive) return;
        if (short) {
          apply(short, 'description');
          void saveSummaryToHistory(item, short, item.description, 'description');
        }
      }

      // HTML and parsed article race; never wait for a slower fetch to select sentences.
      const fullText = await new Promise<string>(resolve => {
        let done = false;
        const take = (text: string) => {
          if (!done && text.trim().length >= LIMITS.articleMinLength) { done = true; resolve(text); }
        };
        fastTextTask.then(take);
        blocksTask.then(b => take(blocksToText(b)));
        Promise.all([fastTextTask, blocksTask]).then(([htmlText, b]) => {
          if (!done) { done = true; const parsed = blocksToText(b); resolve(parsed.length >= htmlText.length ? parsed : htmlText); }
        });
      });
      if (!alive) return;
      if (fullText.trim().length >= LIMITS.articleMinLength) {
        setContent(previous => previous || fullText);
        const hash = fingerprintSummaryInput(fullText);
        const result = cached?.summarySource === 'article' && cached.summaryInputHash === hash
          ? cached.summary : await summarizeArticle(fullText, item.category, undefined, item.title).catch(() => '');
        if (!alive) return;
        if (result) {
          apply(result, 'article');
          await saveSummaryToHistory(item, result, fullText, 'article');
        }
      }
      if (alive) {
        setSummarizing(false);
        if (!displayed) setError('Chưa tải được nội dung để tóm tắt. Bạn có thể mở bài gốc.');
      }
    })().catch(() => { if (alive) setSummarizing(false); });
    return () => { alive = false; };
  }, [item.link]);

  const summarize = async () => {
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
      const fetched = content ? '' : await fetchArticleTextFast(item.link).catch(() => '');
      const src = content || fetched || item.description || '';
      const source = content || fetched ? 'article' : 'description';
      const result = await summarizeArticle(src, item.category, undefined, item.title);
      setSummary(result);
      setSummarySource(source);
      await saveSummaryToHistory(item, result, src, source);
    } catch { setError('Chưa có đủ nội dung nguồn để tóm tắt.'); }
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

  // Trang video: khối video duy nhất (nếu đã tải về) — render player thay phần tóm tắt
  const videoBlock = isVideoPage ? blocks.find((b) => b.type === 'video') : null;
  // Bản đọc toàn bài của tòa soạn (báo nào có) — thanh nghe ở ĐẦU bài, KHÔNG
  // đan xen vào đoạn như ảnh/video (xem fetchMediaFromHtml trong summarize.ts).
  const audioBlock = blocks.find((b) => b.type === 'audio') ?? null;
  const hasPaperAudio = !!audioBlock?.url;

  // Keep original image captions, including source credits.
  const renderMedia = (b: ArticleBlock, key: string) => {
    if (!b.url) return null;
    if (b.type === 'image') {
      return <SafeImg key={key} url={b.url} caption={b.caption} onPress={() => openImageModal(b.url!)} />;
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

    // Điểm chèn: media chèn TRƯỚC đoạn đầu tiên có tỉ lệ tích lũy >= frac,
    // nhưng KHÔNG BAO GIỜ trước đoạn 0 — TL;DR/lead phải là thứ đầu tiên
    // người đọc thấy. Ảnh mở đầu bài gốc (pos ≈ 0) nếu để tự nhiên sẽ chen
    // lên trước nội dung chính; chỉ có đúng 1 đoạn duy nhất thì chèn SAU nó.
    // Chống dồn cụm: 1 media mỗi đoạn tối đa — media trùng điểm chèn (summary
    // ngắn, pos gần nhau) dời xuống đoạn kế tiếp còn trống, GIỮ nguyên thứ tự
    // pos của bài gốc; media thừa không còn chỗ (slot cuối chỉ chứa 1) → bỏ
    // (tóm tắt không cần full gallery). atIdx ngắn hơn media → media đuôi bỏ.
    const lastPara = Math.max(paras.length - 1, 0);
    const atIdx: number[] = [];
    for (const f of fracs) {
      const base = cumPara.reduce((c, v) => c + (v < f - 1e-9 ? 1 : 0), 0);
      let t = Math.max(Math.min(base, lastPara), 1);
      while (atIdx.includes(t)) t++;
      if (t > lastPara + 1) break;
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
        <Text style={styles.hTitle} numberOfLines={1}>{item.source}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.hBtn}>
          <Ionicons name="share-social-outline" size={21} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyBottom, { paddingBottom: 90 }]}
      >
        <Text style={styles.articleCategory}>{(item.category || 'TIN TỨC').toUpperCase()}</Text>
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

        {item.image ? <Image source={{ uri: item.image }} style={[styles.cardImg, { marginHorizontal: 20, borderRadius: 22, width: undefined, marginBottom: 22 }]} resizeMode="cover" /> : null}
        <View style={styles.summaryCard}>
          <View style={styles.summaryLabelRow}>
            <LinearGradient
              colors={[C.brandSurface, C.brandSurface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.aiBadge}
            >
              <Ionicons name={isVideoPage ? 'videocam' : 'document-text-outline'} size={13} color="#FFF" />
              <Text style={styles.summaryLabel}>{isVideoPage ? 'VIDEO' : 'TÓM TẮT'}</Text>
            </LinearGradient>
            {!isVideoPage && paraWords.length > 0 && (
              <TouchableOpacity
                onPress={toggleSpeak}
                disabled={summarizing || hasPaperAudio}
                accessibilityState={{ disabled: summarizing || hasPaperAudio }}
                style={[styles.speakBtn, speaking && styles.speakBtnOn, (summarizing || hasPaperAudio) && styles.speakBtnDisabled]}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={
                  hasPaperAudio ? 'Bài có bản đọc của tòa soạn, dùng thanh nghe bên dưới'
                    : speaking ? 'Dừng đọc'
                    : summarizing ? 'Đang tóm tắt, chưa đọc được'
                    : 'Nghe tóm tắt'
                }
              >
                <Ionicons name={speaking ? 'stop' : 'volume-high'} size={16} color={speaking ? '#FFF' : C.hot} />
                <Text style={[styles.speakBtnText, speaking && styles.speakBtnTextOn]}>
                  {speaking ? 'Dừng' : 'Nghe'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {!isVideoPage && <Text testID="summary-method" style={styles.summaryMethod}>
            {summarySource === 'article' ? 'Chọn câu từ bài gốc · Không dùng AI' : 'Từ mô tả RSS · Chưa tải đủ bài · Không dùng AI'}
          </Text>}

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
              {audioBlock?.url ? <BlockAudio url={audioBlock.url} source={item.source} /> : null}
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
              <Text style={styles.sourceName}>{item.source}</Text>
            </View>
            <Text style={styles.sourceDate}>{new Date(item.pubDate).toLocaleDateString('vi-VN')}</Text>
          </TouchableOpacity>
        </View>

        {!isVideoPage && <View style={{ marginHorizontal: 16, marginBottom: 18, alignItems: 'flex-start' }}><Action label="Góp ý bản tóm tắt" icon="flag-outline" onPress={() => navigation.navigate('Feedback', { url: item.link })} /></View>}

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
          accessibilityLabel={isVideoPage ? 'Mở video tại nguồn' : 'Tóm tắt lại'}
        >
          <Ionicons
            name={isVideoPage ? 'open-outline' : summarizing ? 'sync' : 'refresh'}
            size={21}
            color={C.hot}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.fabRound, isSaved && styles.fabRoundOn]}
          onPress={handleBookmark}
          activeOpacity={0.7}
          accessibilityLabel={isSaved ? 'Bỏ lưu bài' : 'Lưu bài'}
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

// Trạng thái phát, gom 2 nền tảng về MỘT API: web điều khiển thẻ <audio> ẩn,
// native điều khiển expo-video. Nhờ vậy phần UI bên dưới chỉ viết một lần — và
// web KHÔNG còn dùng <audio controls> mặc định của trình duyệt (thanh xám, cao
// 36px, lệch hẳn tông app; đó là lý do bản trước trông xấu).
function usePaperAudio(url: string) {
  const isWeb = Platform.OS === 'web';
  // Callback ref CHỈ GHI, không bao giờ xoá. Lúc unmount React gỡ ref của host
  // component trước khi chạy cleanup của effect, nên nếu để React quản lý thì
  // ref.current = null và lệnh pause() cuối cùng thành vô hiệu — thẻ <audio> đã
  // tách khỏi DOM vẫn phát tiếp (bỏ phần tử khỏi DOM KHÔNG tự dừng phát).
  const elRef = useRef<any>(null);
  const setEl = useCallback((el: any) => { if (el) elRef.current = el; }, []);
  const player = useVideoPlayer(isWeb ? null : url, (p) => { p.loop = false; });
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  // Dừng khi RỜI màn hình. Không thể chỉ dựa vào cleanup lúc unmount:
  // navigation.push('Article') (bấm bài liên quan, ArticleScreen:321) đẩy màn hình
  // mới lên và GIỮ màn hình cũ trong stack — nó chỉ blur, không unmount, nên thẻ
  // <audio> vẫn nằm trong DOM và trình duyệt phát tiếp. Đúng lỗi "đang nghe rồi mở
  // bài khác vẫn còn tiếng". Cùng cách xử lý với stopSpeaking cho giọng đọc tóm tắt.
  const navigation = useNavigation<any>();
  useEffect(() => {
    const stop = () => {
      if (isWeb) elRef.current?.pause(); else player.pause();
      setPlaying(false);
    };
    const unsub = navigation.addListener('blur', stop);
    return () => { unsub(); stop(); };
    // stop chỉ đọc ref + player (đều ổn định) nên closure của lần render đầu vẫn đúng
  }, [navigation, isWeb, player]);

  // Web: thẻ <audio> tự bắn timeupdate/loadedmetadata/ended → nghe thẳng, khỏi poll.
  useEffect(() => {
    if (!isWeb) return;
    const el = elRef.current;
    if (!el) return;
    const onTime = () => { setPos(el.currentTime || 0); setDur(el.duration || 0); };
    const onEnd = () => setPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onTime);
    el.addEventListener('ended', onEnd);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onTime);
      el.removeEventListener('ended', onEnd);
    };
  }, [isWeb, url]);

  // Native: expo-video không bắn event tiến trình → poll 500ms, chỉ lúc đang phát.
  // Tự phát hiện hết bài, nếu không nút kẹt ở "đang phát" và interval chạy mãi.
  useEffect(() => {
    if (isWeb || !playing) return;
    const id = setInterval(() => {
      const d = player.duration || 0;
      const c = player.currentTime || 0;
      setPos(c);
      setDur(d);
      if (d > 0 && c >= d - 0.3) { player.pause(); setPlaying(false); }
    }, 500);
    return () => clearInterval(id);
  }, [isWeb, playing, player]);

  const ended = dur > 0 && pos >= dur - 0.3;
  const toggle = () => {
    if (playing) {
      if (isWeb) elRef.current?.pause(); else player.pause();
      setPlaying(false);
      return;
    }
    if (ended) { // nghe lại từ đầu
      if (isWeb) { if (elRef.current) elRef.current.currentTime = 0; } else player.currentTime = 0;
      setPos(0);
    }
    if (isWeb) elRef.current?.play().catch(() => {}); else player.play();
    setPlaying(true);
  };
  const seek = (ratio: number) => {
    if (!dur || !isFinite(ratio)) return;
    const t = Math.max(0, Math.min(1, ratio)) * dur;
    if (isWeb) { if (elRef.current) elRef.current.currentTime = t; } else player.currentTime = t;
    setPos(t);
  };

  return { setEl, playing, pos, dur, toggle, seek };
}

// Bản đọc toàn bài của TÒA SOẠN (Tiền Phong…) — KHÁC nút "Nghe" ở header: nút đó
// đọc bản TÓM TẮT bằng expo-speech, thanh này phát file mp3 của chính báo. Có
// thanh này thì nút "Nghe" bị khoá (xem hasPaperAudio ở phần header).
const BlockAudio = memo(function BlockAudio({ url, source }: { url: string; source: string }) {
  const C = useTheme();
  const s = useMemo(() => makeAudioStyles(C), [C]);
  const { setEl, playing, pos, dur, toggle, seek } = usePaperAudio(url);
  const [trackW, setTrackW] = useState(0);
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;

  // Tua bằng hệ RESPONDER, không dùng Pressable.onPress: onPress của
  // react-native-web chỉ bắn ở sự kiện `click` (lúc NHẢ tay) nên kéo thanh không
  // ăn. onResponderGrant = chạm xuống, onResponderMove = kéo → được cả hai.
  // locationX tính theo currentTarget (chính View này) nên lớp vẽ bên trong phải
  // pointerEvents="none"; không thì chạm trúng thanh đã tô sẽ lấy mốc theo thanh
  // đó (rộng bằng pct) và nhảy về sai vị trí.
  const seekAt = (e: any) => {
    const x = e?.nativeEvent?.locationX;
    if (!trackW || typeof x !== 'number') return;
    seek(x / trackW);
  };

  return (
    <LinearGradient
      colors={[C.brandSurface, C.brandSurface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.card}
    >
      <View style={s.head}>
        <Ionicons name="headset" size={13} color="#FFFFFF" />
        <Text style={s.title} numberOfLines={1}>BẢN ĐỌC CỦA {source.toUpperCase()}</Text>
      </View>
      <View style={s.row}>
        <TouchableOpacity
          onPress={toggle}
          style={[s.btn, playing && s.btnOn]}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Dừng bản đọc của báo' : 'Phát bản đọc của báo'}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={20} color={C.hot} />
        </TouchableOpacity>
        <View style={s.right}>
          <View
            style={s.trackHit}
            onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={seekAt}
            onResponderMove={seekAt}
            accessibilityRole="adjustable"
            accessibilityLabel="Tua bản đọc"
          >
            <View style={s.trackWrap} pointerEvents="none">
              <View style={s.trackBg} />
              <View style={[s.trackFill, { width: `${pct}%` }]} />
              {/* Núm kéo — đặt theo px (đã đo được trackW) chứ không theo %, để
                  không phụ thuộc hỗ trợ `left: %` của từng nền tảng. */}
              <View
                style={[s.knob, { left: (pct / 100) * trackW - 5.5, opacity: trackW ? 1 : 0 }]}
              />
            </View>
          </View>
          <Text style={s.time}>
            {fmtClock(pos)} <Text style={s.timeDim}>/ {fmtClock(dur)}</Text>
          </Text>
        </View>
      </View>
      {/* Thẻ <audio> ẩn — chỉ để phát, UI do app vẽ */}
      {Platform.OS === 'web' ? <audio ref={setEl} preload="metadata" src={url} style={{ display: 'none' }} /> : null}
    </LinearGradient>
  );
});

function fmtClock(sec: number): string {
  if (!sec || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}

// Bảng màu riêng theo theme: BlockVideo dùng `styles` cấp module (chỉ có palette
// SÁNG) nên thanh video bị lệch màu ở dark mode — không lặp lại lỗi đó ở đây.
//
// Bản trước là một ô viền xám trên nền C.bg — nhìn ra ngay một ô form, không ra
// một trình phát. Bản này dùng dải GRADIENT màu thương hiệu, cùng tông với badge
// Nhãn tóm tắt và header: nó tự nói "của app", và tách hẳn khỏi khối tóm tắt (nền
// trắng) — đúng vì đây là bản đọc của BÁO, không phải bản tóm tắt của app.
function makeAudioStyles(C: Palette) {
  return StyleSheet.create({
    card: {
      marginBottom: 14,
      borderRadius: Radius.md,
      overflow: 'hidden', // để gradient cắt theo bo góc
      paddingHorizontal: 13,
      paddingVertical: 12,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 },
    title: { flex: 1, fontSize: Font.tiny, fontFamily: Sans.bold, fontWeight: '700', letterSpacing: 0.6, color: '#FFFFFF' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    btn: {
      width: 46, height: 46, borderRadius: 23,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#FFFFFF',
      boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
      elevation: 3,
    },
    btnOn: { backgroundColor: 'rgba(255,255,255,0.86)' },
    right: { flex: 1 },
    trackHit: { paddingVertical: 10 }, // vùng chạm dày cho ngón tay
    // trackWrap cao 12 = đủ chỗ cho núm 11px; thanh 4px canh giữa trong đó.
    // KHÔNG đặt overflow:hidden ở đây — sẽ cắt mất núm.
    trackWrap: { height: 12, justifyContent: 'center' },
    trackBg: { position: 'absolute', left: 0, right: 0, top: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
    trackFill: { position: 'absolute', left: 0, top: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
    knob: { position: 'absolute', top: 0.5, width: 11, height: 11, borderRadius: 5.5, backgroundColor: '#FFFFFF', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' },
    time: { marginTop: 3, fontSize: Font.tiny, fontFamily: Sans.medium, fontWeight: '600', color: '#FFFFFF', fontVariant: ['tabular-nums'] },
    timeDim: { color: 'rgba(255,255,255,0.72)', fontWeight: '400' },
  });
}

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
  container: { flex: 1, backgroundColor: Color.bg },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Color.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  hBtn: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: Color.card, borderWidth: 1, borderColor: Color.border },
  hTitle: { flex: 1, fontSize: Font.caption, fontFamily: Sans.bold, fontWeight: '700', color: Color.textSecondary, textAlign: 'center' },
  // Body
  body: { flex: 1 },
  bodyBottom: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingTop: 12 },
  articleCategory: { paddingHorizontal: 20, paddingTop: 10, fontSize: 11, fontFamily: Sans.bold, color: Color.hot, letterSpacing: 1.1 },
  title: {
    fontSize: 31,
    fontFamily: Sans.bold, fontWeight: '800',
    color: Color.text,
    lineHeight: 42,
    letterSpacing: -0.7,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  metaSource: { fontSize: Font.tiny, fontFamily: Sans.regular, color: Color.hot, fontWeight: '700' },
  metaDot: { fontSize: Font.tiny, fontFamily: Sans.regular, color: Color.textMuted },
  metaTime: { fontSize: Font.tiny, fontFamily: Sans.regular, color: Color.textMuted },
  // Summary — dùng cùng một grid 18px cho header / method / body / source.
  // Card trung tính giúp phần tóm tắt bớt "nghiêng" sang một bên và TL;DR nổi rõ hơn.
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: Color.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Color.border,
    overflow: 'hidden',
    ...Shadow.card,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap', // màn rất hẹp → badge/nút Nghe xuống dòng thay vì tràn card
    rowGap: 8,
    gap: 10,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  summaryLabel: { fontSize: 11, fontFamily: Sans.bold, fontWeight: '800', color: '#FFF', letterSpacing: 0.7 },
  summaryMethod: {
    marginHorizontal: 20,
    marginBottom: 16,
    fontFamily: Sans.regular,
    fontSize: 12,
    lineHeight: 19,
    color: Color.textMuted,
  },
  // Chip "OFFLINE" — summary do fallback extractive tạo khi chưa tải được bài
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
    fontFamily: Sans.bold, fontWeight: '800',
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
  speakBtnText: { fontSize: Font.tiny, fontFamily: Sans.bold, fontWeight: '700', color: Color.hot },
  speakBtnTextOn: { color: '#FFF' },
  // Thanh tiến trình đọc (hiện khi đang Nghe) — mảnh, nằm ngay dưới hàng badge
  speakProgress: {
    height: 3,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 2,
    backgroundColor: Color.hotSoft,
    overflow: 'hidden',
  },
  speakProgressFill: { height: '100%', backgroundColor: Color.hot },
  cardImg: { height: 260, backgroundColor: Color.skeleton },
  summaryBody: { marginHorizontal: 20 },
  summaryLoading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginHorizontal: 18, marginBottom: 16 },
  summaryLoadingText: { fontSize: Font.body, fontFamily: Sans.regular, color: Color.textMuted },
  // Hàng trạng thái "đang hoàn thiện" DƯỚI thân bài — đứng cạnh badge trên
  // hàng summaryLabelRow sẽ chen mất chỗ của nút Nghe
  summarizingFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 14 },
  summarizingFootText: { fontSize: Font.caption, fontFamily: Sans.regular, color: Color.textMuted, fontStyle: 'italic' },
  summaryErr: {
    backgroundColor: Color.dangerSoft,
    padding: 12,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 18,
    marginBottom: 16,
  },
  summaryErrText: { fontSize: Font.body, fontFamily: Sans.regular, color: Color.danger, flex: 1 },
  retryLink: { fontSize: Font.body, fontFamily: Sans.bold, fontWeight: '700', color: Color.hot, marginLeft: 12 },
  summaryText: { fontFamily: Sans.regular, fontSize: 15, lineHeight: 26, color: Color.text, marginBottom: 16 },
  // TL;DR — dòng đầu của summary có cấu trúc: nền tint nổi bật, đậm hơn thân bài
  tldrPara: {
    fontFamily: Sans.bold,
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '700',
    color: Color.text,
    backgroundColor: Color.hotSoft,
    borderRadius: Radius.sm,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 16,
  },
  // Đoạn mở đầu (lead) — đậm hơn, vạch cam bên trái kiểu báo giấy
  summaryLead: {
    fontFamily: Sans.medium,
    fontSize: 16,
    lineHeight: 27,
    fontWeight: '600',
    color: Color.text,
    borderLeftWidth: 3,
    borderLeftColor: Color.hot,
    paddingLeft: 12,
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
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.border,
    backgroundColor: Color.surfaceAlt,
    marginTop: 2,
    marginBottom: 16,
  },
  copyInlineText: { fontSize: Font.caption, fontFamily: Sans.medium, fontWeight: '600', color: Color.textSecondary },
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
    fontFamily: Sans.medium, fontWeight: '600',
    color: Color.accent,
  },
  sourceRow: {
    marginHorizontal: 20,
    marginBottom: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceTextRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginRight: 8 },
  sourceName: { fontSize: Font.caption, fontFamily: Sans.bold, fontWeight: '700', color: Color.hot },
  sourceDate: { fontSize: Font.caption, fontFamily: Sans.regular, color: Color.textMuted },
  // Related — section header cùng ngôn ngữ Home
  relatedSection: {
    borderTopWidth: 1,
    borderColor: Color.border,
    paddingTop: 4,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  sectionBar: { width: 4, height: 16, borderRadius: 2, marginRight: 8 },
  sectionTitle: { fontSize: 13, fontFamily: Sans.bold, fontWeight: '800', letterSpacing: 0.6 },
  sectionLine: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 10 },
  // Floating bar
  floatBar: {
    position: 'absolute',
    width: '92%',
    maxWidth: 720,
    alignSelf: 'center',
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
  fabLabel: { fontSize: Font.caption, fontFamily: Sans.bold, fontWeight: '700', color: '#FFF' },
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
    fontFamily: Sans.bold, fontWeight: '700',
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
    fontFamily: Sans.medium, fontWeight: '600',
  },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const styles = makeStyles(Color);
