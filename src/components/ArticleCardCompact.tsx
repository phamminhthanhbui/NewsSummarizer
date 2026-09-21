import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';
import { isVideoPageUrl } from '../services/summarize';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

// Card ngang gọn — ảnh thumb trái 120×86, chữ phải, tiết kiệm chiều cao
function ArticleCardCompact({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);
  const C = useTheme();
  const s = makeStyles(C);
  const srcColor = SOURCE_COLORS[item.source] || C.hot;
  const isVideo = isVideoPageUrl(item.link);

  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.85}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" />
      ) : (
        <View style={[s.img, s.imgPh]}>
          <Ionicons name="image-outline" size={24} color={C.textMuted} />
        </View>
      )}
      {isVideo ? (
        <View style={s.videoBadge} accessibilityLabel="Video">
          <Ionicons name="play" size={9} color="#FFF" />
        </View>
      ) : null}
      <View style={s.body}>
        <View style={s.meta}>
          <View style={[s.srcBadge, { backgroundColor: srcColor + '1A' }]}>
            <View style={[s.srcDot, { backgroundColor: srcColor }]} />
            <Text style={[s.source, { color: srcColor }]} numberOfLines={1}>{item.source}</Text>
          </View>
          {t ? <Text style={s.time}>{t} trước</Text> : null}
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={s.desc} numberOfLines={1}>{item.description}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(ArticleCardCompact);

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Color.card,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      default: { boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)' },
    }),
  },
  img: { width: 120, alignSelf: 'stretch', backgroundColor: Color.skeleton },
  imgPh: { alignItems: 'center', justifyContent: 'center' },
  // Badge video nằm dưới-trái ảnh (vùng ảnh là cột trái tự co giãn theo hàng).
  // Không bọc thêm layer đề phòng % height không resolve khi flex-stretch.
  videoBadge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 1,
  },
  body: { flex: 1, padding: 10, justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  srcBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, maxWidth: 150,
  },
  srcDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Color.hot },
  source: { fontSize: Font.tiny - 1, color: Color.hot, fontWeight: '800', letterSpacing: 0.2 },
  time: { fontSize: Font.tiny - 1, color: Color.textMuted },
  title: { fontSize: Font.body, fontWeight: '700', color: Color.text, lineHeight: 19, marginBottom: 3 },
  desc: { fontSize: Font.tiny, color: Color.textSecondary, lineHeight: 16 },
});

const s = makeStyles(Color);