import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

// Thẻ dọc kiểu Kenh14 mobile: ảnh to trên, tiêu đề đậm, hợp giới trẻ
function ArticleCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);
  const C = useTheme();
  const s = makeStyles(C); // styles động theo dark mode
  // Mỗi tờ báo 1 màu đặc trưng; '1A' = 10% alpha cho nền tint
  const srcColor = SOURCE_COLORS[item.source] || C.hot;

  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.85}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" />
      ) : (
        <View style={[s.img, s.imgPh]}>
          <Ionicons name="image-outline" size={40} color={C.textMuted} />
        </View>
      )}
      <View style={s.body}>
        <View style={s.meta}>
          <View style={[s.srcBadge, { backgroundColor: srcColor + '1A' }]}>
            <View style={[s.srcDot, { backgroundColor: srcColor }]} />
            <Text style={[s.source, { color: srcColor }]} numberOfLines={1}>{item.source}</Text>
          </View>
          {t ? <Text style={s.time}>{t} trước</Text> : null}
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? (
          <Text style={s.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// memo: FlatList re-render (scroll, filter đổi) không kéo theo re-render từng card
export default React.memo(ArticleCard);

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  card: {
    backgroundColor: Color.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
      default: { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)' },
    }),
  },
  img: { width: '100%', height: 190, backgroundColor: Color.skeleton },
  imgPh: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  srcBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Color.hotSoft,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    maxWidth: 170,
  },
  srcDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Color.hot },
  source: { fontSize: Font.tiny, color: Color.hot, fontWeight: '800', letterSpacing: 0.2 },
  time: { fontSize: Font.tiny, color: Color.textMuted },
  title: { fontSize: Font.title, fontWeight: '800', color: Color.text, lineHeight: 24, marginBottom: 6 },
  desc: { fontSize: Font.body, color: Color.textSecondary, lineHeight: 20 },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const s = makeStyles(Color);