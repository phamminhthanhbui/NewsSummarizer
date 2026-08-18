import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, Radius, Shadow } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

function FeaturedCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);
  const srcColor = SOURCE_COLORS[item.source] || Color.hot;

  return (
    <TouchableOpacity style={[s.card, Shadow.card]} onPress={() => onPress(item)} activeOpacity={0.85}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" />
      ) : (
        <View style={[s.img, s.imgPh]}>
          <Ionicons name="image-outline" size={44} color={Color.textMuted} />
        </View>
      )}
      <View style={s.scrim} />
      <View style={s.overlay}>
        {item.featured ? (
          // Tin nổi bật: badge lửa + nhãn NỔI BẬT, giữ tên nguồn ở badge phụ nhỏ
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: Color.hot }]}>
              <Ionicons name="flame" size={11} color="#FFF" />
              <Text style={s.badgeText} numberOfLines={1}>NỔI BẬT</Text>
            </View>
            <View style={[s.badge, s.badgeGhost]}>
              <Text style={s.badgeText} numberOfLines={1}>{item.source}</Text>
            </View>
          </View>
        ) : (
          <View style={[s.badge, { backgroundColor: srcColor }]}>
            <View style={s.badgeDot} />
            <Text style={s.badgeText} numberOfLines={1}>{item.source}</Text>
          </View>
        )}
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {t ? (
          <View style={s.timeWrap}>
            <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.75)" />
            <Text style={s.time}>{t} trước</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(FeaturedCard);

const s = StyleSheet.create({
  card: { width: '100%', height: 210, borderRadius: Radius.lg, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgPh: { backgroundColor: Color.skeleton, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: Color.scrim },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, paddingTop: 30 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Color.hot, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginBottom: 7,
  },
  badgeGhost: { backgroundColor: 'rgba(0,0,0,0.35)', marginBottom: 0 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  badgeText: { fontSize: Font.tiny, color: '#FFF', fontWeight: '800', letterSpacing: 0.4 },
  title: { fontSize: Font.hero, fontWeight: '800', color: '#FFF', lineHeight: 27 },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 7 },
  time: { fontSize: Font.tiny, color: 'rgba(255,255,255,0.75)' },
});