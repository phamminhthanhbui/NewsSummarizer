import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, Radius, Serif, Shadow, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';
import { isVideoPageUrl } from '../services/summarize';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

// Hero: KHÔNG overlay chữ lên ảnh. Ảnh 16:9 trên, thân card trắng dưới gồm hàng
// badge (NỔI BẬT + nguồn), tít serif đen to, meta giờ. Card bo mềm + bóng nhẹ,
// nổi hẳn trên nền xám mát.
function FeaturedCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);
  const C = useTheme();
  const s = makeStyles(C);
  const srcColor = SOURCE_COLORS[item.source] || C.hot;
  const isVideo = isVideoPageUrl(item.link);

  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.9} accessibilityRole="button">
      <View style={s.imgWrap}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" />
        ) : (
          <View style={[s.img, s.imgPh]}>
            <Ionicons name="image-outline" size={44} color={C.textMuted} />
          </View>
        )}
        {isVideo ? (
          <View style={s.videoBadge} accessibilityLabel="Video">
            <Ionicons name="play" size={11} color="#FFF" />
          </View>
        ) : null}
        {item.featured ? (
          <View style={s.hotBadge}>
            <Ionicons name="flame" size={11} color="#FFF" />
            <Text style={s.hotBadgeText}>NỔI BẬT</Text>
          </View>
        ) : null}
      </View>
      <View style={s.body}>
        <View style={s.meta}>
          <Text style={[s.source, { color: srcColor }]} numberOfLines={1}>{item.source}</Text>
          {t ? (
            <>
              <View style={s.metaDot} />
              <Ionicons name="time-outline" size={12} color={C.textMuted} />
              <Text style={s.time}>{t} trước</Text>
            </>
          ) : null}
          <View style={s.readCue}>
            <Text style={s.readCueText}>ĐỌC TIẾP</Text>
            <Ionicons name="arrow-forward" size={12} color={C.hot} />
          </View>
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(FeaturedCard);

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  card: {
    marginHorizontal: 12,
    backgroundColor: Color.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.card,
  },
  // maxHeight chặn trần: trên màn rộng (web/tablet) 16:9 không có trần sẽ cao
  // bằng 0.56×bề ngang → ảnh hero nuốt trọn viewport, đẩy mọi row ra ngoài
  // cửa sổ render của FlatList. Mobile 375px ra 211px nên không đổi gì.
  imgWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 220,
    backgroundColor: Color.skeleton,
  },
  img: { width: '100%', height: '100%' },
  imgPh: { alignItems: 'center', justifyContent: 'center' },
  videoBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 24,
    height: 24,
    borderRadius: 6, // khớp videoBadge 18px bên ArticleCardCompact — cùng hình dạng
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  // Tag NỔI BẬT neo mép trái ảnh, chỉ bo hai góc phải cho khớp cạnh card
  hotBadge: {
    position: 'absolute',
    left: 0,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Color.hot,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopRightRadius: Radius.sm,
    borderBottomRightRadius: Radius.sm,
  },
  hotBadgeText: { fontSize: Font.tiny, color: '#FFF', fontWeight: '800', letterSpacing: 0.6 },
  body: { padding: 14 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  source: { fontSize: Font.caption, fontWeight: '800', letterSpacing: 0.2, flexShrink: 1 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: Color.textMuted },
  time: { fontSize: Font.tiny, color: Color.textMuted, fontWeight: '600' },
  readCue: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  readCueText: { fontSize: 10, fontWeight: '800', color: Color.hot, letterSpacing: 0.6 },
  title: {
    fontFamily: Serif,
    fontSize: 21,
    fontWeight: '700',
    color: Color.text,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
});
