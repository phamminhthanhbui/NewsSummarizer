import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, Radius } from '../constants/theme';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

function ArticleCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);

  return (
    <TouchableOpacity style={s.row} onPress={() => onPress(item)} activeOpacity={0.7}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.thumb} resizeMode="cover" />
      ) : (
        <View style={[s.thumb, s.thumbPh]}>
          <Ionicons name="image-outline" size={26} color={Color.textMuted} />
        </View>
      )}
      <View style={s.body}>
        {/* Nhãn chuyên mục đỏ kiểu CafeBiz */}
        {item.category ? <Text style={s.category}>{item.category}</Text> : null}
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? (
          <Text style={s.desc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={s.meta}>
          <Text style={s.source} numberOfLines={1}>{item.source}</Text>
          {t ? <Text style={s.time}>· {t} trước</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// memo: FlatList re-render (scroll, filter đổi) không kéo theo re-render từng card
export default React.memo(ArticleCard);

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Color.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  thumb: { width: 118, height: 84, borderRadius: Radius.sm, marginRight: 12, backgroundColor: Color.skeleton },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center' },
  category: { fontSize: Font.tiny, fontWeight: '800', color: Color.primary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  title: { fontSize: Font.headline, fontWeight: '700', color: Color.text, lineHeight: 22, marginBottom: 4 },
  desc: { fontSize: Font.body, color: Color.textSecondary, lineHeight: 19, marginBottom: 7 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  source: { fontSize: Font.tiny, color: Color.textSecondary, fontWeight: '600', maxWidth: 150 },
  time: { fontSize: Font.tiny, color: Color.textMuted },
});