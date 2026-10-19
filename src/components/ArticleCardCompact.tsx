import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, Radius, Sans, useTheme } from '../constants/theme';
import { isVideoPageUrl } from '../services/summarize';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

function ArticleCardCompact({ item, onPress }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const t = timeAgo(item.pubDate);
  const isVideo = isVideoPageUrl(item.link);

  return (
    <TouchableOpacity testID="feedCard" style={s.card} onPress={() => onPress(item)} activeOpacity={0.82} accessibilityRole="button">
      <View style={[s.thumbWrap, desktop && { width: 144, minHeight: 100 }]}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" />
        ) : (
          <View style={[s.img, s.imgPh]}><Ionicons name="newspaper-outline" size={24} color={C.textMuted} /></View>
        )}
        {isVideo ? <View style={s.videoBadge}><Ionicons name="play" size={10} color="#fff" /></View> : null}
      </View>
      <View style={s.body}>
        <View style={s.meta}>
          <Text style={s.category} numberOfLines={1}>{item.category || 'TIN MỚI'}</Text>
          <Text style={s.metaText}>·</Text>
          <Text style={s.metaText} numberOfLines={1}>{item.source}</Text>
          {t ? <><Text style={s.metaText}>·</Text><Text style={s.metaText}>{t} trước</Text></> : null}
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={s.desc} numberOfLines={desktop ? 2 : 1}>{item.description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.border} style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

export default React.memo(ArticleCardCompact);

type Palette = typeof Color;
const makeStyles = (C: Palette) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: C.card,
    padding: 11,
    gap: 13,
    marginBottom: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  thumbWrap: { width: 112, minHeight: 86, borderRadius: 12, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  img: { width: '100%', height: '100%', flex: 1, backgroundColor: C.skeleton },
  imgPh: { alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', left: 7, bottom: 7, width: 22, height: 22, borderRadius: 7, backgroundColor: 'rgba(13,20,32,.72)', alignItems: 'center', justifyContent: 'center', paddingLeft: 1 },
  body: { flex: 1, minWidth: 0, justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5, flexWrap: 'nowrap' },
  category: { fontFamily: Sans.bold, fontSize: 10, color: C.hot, maxWidth: 95, letterSpacing: .3 },
  metaText: { fontFamily: Sans.regular, fontSize: 10, color: C.textMuted, flexShrink: 1 },
  title: { fontFamily: Sans.bold, fontSize: Font.headline, color: C.text, lineHeight: 23, letterSpacing: -.2 },
  desc: { fontFamily: Sans.regular, fontSize: 12, color: C.textSecondary, lineHeight: 18, marginTop: 5 },
});
