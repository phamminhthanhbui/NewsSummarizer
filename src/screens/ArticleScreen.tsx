import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedItem, SummaryRecord } from '../types';
import { Color, Font } from '../constants/theme';
import { KEYS } from '../services/storage';
import { fetchArticleContent, summarizeWithNvidia } from '../services/summarize';
import { fetchAllFeeds } from '../services/feeds';
import ArticleCard from '../components/ArticleCard';

export default function ArticleScreen({ navigation, route }: any) {
  const { item } = route.params as { item: FeedItem };
  const insets = useSafeAreaInsets();

  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [related, setRelated] = useState<FeedItem[]>([]);

  // Auto-fetch article + summarize + load related
  useEffect(() => {
    (async () => {
      // 1. Fetch full article
      let text = '';
      try { text = await fetchArticleContent(item.link); } catch { /* use stub */ }
      setContent(text);

      // 2. Auto-summarize
      const apiKey = await AsyncStorage.getItem(KEYS.apiKey);
      if (apiKey) {
        setSummarizing(true);
        try {
          const model = (await AsyncStorage.getItem(KEYS.model)) || 'meta/llama-3.1-8b-instruct';
          const src = text || item.description;
          const result = await summarizeWithNvidia(src, apiKey, model);
          setSummary(result);

          const raw = await AsyncStorage.getItem(KEYS.history);
          const history: SummaryRecord[] = raw ? JSON.parse(raw) : [];
          history.unshift({
            url: item.link,
            title: item.title,
            summary: result,
            date: new Date().toISOString(),
            source: item.source,
          });
          await AsyncStorage.setItem(KEYS.history, JSON.stringify(history.slice(0, 50)));
        } catch (e: any) {
          setError(e.message || 'Lỗi');
        }
        setSummarizing(false);
      } else {
        setError('Vui lòng nhập NVIDIA NIM API key trong Cài đặt');
      }

      // 3. Fetch related articles (same source first, backfill from others)
      try {
        const all = await fetchAllFeeds();
        const same = all.filter((a) => a.source === item.source && a.link !== item.link);
        const others = all.filter((a) => a.source !== item.source && a.link !== item.link);
        setRelated([...same, ...others].slice(0, 8));
      } catch { /* non-critical */ }
    })();
  }, [item.link]);

  const handleRetry = async () => {
    setError('');
    setSummarizing(true);
    try {
      const apiKey = await AsyncStorage.getItem(KEYS.apiKey);
      if (!apiKey) {
        navigation.navigate('SettingsTab');
        throw new Error('Vui lòng thêm NVIDIA API key');
      }
      const model = (await AsyncStorage.getItem(KEYS.model)) || 'meta/llama-3.1-8b-instruct';
      const src = content || item.description;
      const result = await summarizeWithNvidia(src, apiKey, model);
      setSummary(result);
    } catch (e: any) {
      setError(e.message || 'Lỗi');
    }
    setSummarizing(false);
  };

  const handleBookmark = async () => {
    const raw = await AsyncStorage.getItem(KEYS.saved);
    const articles: FeedItem[] = raw ? JSON.parse(raw) : [];
    if (!articles.find((s) => s.link === item.link)) {
      articles.unshift(item);
      await AsyncStorage.setItem(KEYS.saved, JSON.stringify(articles.slice(0, 100)));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleShare = () => Share.share({ message: `${item.title}\n${item.link}` });
  const goArticle = (feedItem: FeedItem) =>
    navigation.push('Article', { item: feedItem });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.hBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle} numberOfLines={1}>{item.source}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.hBtn}>
          <Text style={styles.shareIcon}>↗</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyBottom, { paddingBottom: 90 + insets.bottom }]}
      >
        {/* Hero */}
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.hero} resizeMode="cover" />
        ) : null}

        <Text style={styles.title}>{item.title}</Text>

        <View style={styles.meta}>
          <Text style={styles.metaSource}>{item.source}</Text>
          <Text style={styles.metaDot}> · </Text>
          <Text style={styles.metaTime}>
            {new Date(item.pubDate).toLocaleString('vi-VN')}
          </Text>
        </View>

        {/* AI Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>🤖 Tóm tắt bằng AI</Text>

          {summarizing ? (
            <View style={styles.summaryLoading}>
              <ActivityIndicator color={Color.accent} size="small" />
              <Text style={styles.summaryLoadingText}>Đang tóm tắt...</Text>
            </View>
          ) : error ? (
            <View style={styles.summaryErr}>
              <Text style={styles.summaryErrText}>{error}</Text>
              <TouchableOpacity onPress={handleRetry}>
                <Text style={styles.retryLink}>Thử lại →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.summaryText}>{summary}</Text>
              <TouchableOpacity
                style={styles.copyInline}
                onPress={() => Share.share({ message: summary })}
              >
                <Text style={styles.copyInlineText}>📋 Copy</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>


        {/* Related articles */}
        {related.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>📰 Bài viết liên quan</Text>
            {related.map((r) => (
              <ArticleCard key={r.link} item={r} onPress={goArticle} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating bar — Đọc gốc + Lưu only */}
      <View style={[styles.floatBar, { bottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => Linking.openURL(item.link)}
          activeOpacity={0.7}
        >
          <Text style={styles.fabLabel}>📰 Đọc bài gốc</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.fabSave}
          onPress={handleBookmark}
          activeOpacity={0.7}
        >
          <Text style={styles.fabSaveIcon}>{saved ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  hBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 22, color: Color.accent, fontWeight: '700' },
  hTitle: { flex: 1, fontSize: Font.body, fontWeight: '700', color: Color.text, textAlign: 'center' },
  shareIcon: { fontSize: 18, color: Color.textSecondary },
  // Body
  body: { flex: 1 },
  bodyBottom: {},
  hero: { width: '100%', height: 240, backgroundColor: Color.skeleton },
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
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  metaSource: { fontSize: Font.tiny, color: Color.primary, fontWeight: '700' },
  metaDot: { fontSize: Font.tiny, color: Color.textMuted },
  metaTime: { fontSize: Font.tiny, color: Color.textMuted },
  // Summary card (inline)
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Color.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Color.border,
    padding: 16,
  },
  summaryLabel: { fontSize: Font.body, fontWeight: '700', color: Color.text, marginBottom: 10 },
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Color.skeleton,
  },
  copyInlineText: { fontSize: Font.caption, fontWeight: '600', color: Color.textSecondary },
  // Related
  relatedSection: {
    borderTopWidth: 1,
    borderColor: Color.border,
    paddingTop: 12,
  },
  relatedTitle: {
    fontSize: Font.headline,
    fontWeight: '700',
    color: Color.text,
    paddingHorizontal: 16,
    marginBottom: 8,
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
    gap: 4,
  },
  fabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Color.accent,
  },
  fabLabel: { fontSize: Font.caption, fontWeight: '700', color: '#FFF' },
  fabSave: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000008',
  },
  fabSaveIcon: { fontSize: 20 },
});