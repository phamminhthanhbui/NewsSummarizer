import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Sans, Color, Radius, useTheme } from '../constants/theme';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

function ArticleCard({ item, onPress }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const ago = timeAgo(item.pubDate);
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.82} accessibilityRole="button">
      {item.image ? <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" /> : <View style={[s.img, s.imgPh]}><Ionicons name="newspaper-outline" size={22} color={C.textMuted} /></View>}
      <View style={s.body}>
        <View style={s.meta}><Text style={s.source} numberOfLines={1}>{item.source}</Text>{ago ? <Text style={s.time}>· {ago} trước</Text> : null}</View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? <Text style={s.desc} numberOfLines={1}>{item.description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.border} />
    </TouchableOpacity>
  );
}

export default React.memo(ArticleCard);

type Palette = typeof Color;
const makeStyles = (C: Palette) => StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 10, padding: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.md },
  img: { width: 104, height: 82, borderRadius: 11, backgroundColor: C.surfaceAlt },
  imgPh: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', gap: 5, alignItems: 'center', marginBottom: 5 },
  source: { fontFamily: Sans.bold, fontSize: 10, color: C.hot, maxWidth: 120 },
  time: { fontFamily: Sans.regular, fontSize: 10, color: C.textMuted },
  title: { fontFamily: Sans.bold, fontSize: 14, lineHeight: 20, color: C.text },
  desc: { fontFamily: Sans.regular, fontSize: 11, lineHeight: 17, color: C.textMuted, marginTop: 5 },
});
