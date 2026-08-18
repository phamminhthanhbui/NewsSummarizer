import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VideoItem } from '../types';
import { Color, Font, Radius } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';

interface Props { item: VideoItem; onPress: (item: VideoItem) => void; featured?: boolean; }

// Card video ngang cho strip VIDEO: thumb 16:9 + nút play + thời lượng
function VideoCard({ item, onPress, featured }: Props) {
  const srcColor = SOURCE_COLORS[item.source] || Color.hot;
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.85}>
      <View style={s.thumbWrap}>
        {item.thumb ? (
          <Image source={{ uri: item.thumb }} style={s.thumb} resizeMode="cover" />
        ) : (
          <View style={[s.thumb, s.thumbPh]}>
            <Ionicons name="videocam-outline" size={28} color={Color.textMuted} />
          </View>
        )}
        <View style={s.playBadge}>
          <Ionicons name="play" size={14} color="#FFF" />
        </View>
        {item.duration ? (
          <View style={s.durationBadge}>
            <Text style={s.duration}>{item.duration}</Text>
          </View>
        ) : null}
        <View style={[s.srcBadge, { backgroundColor: srcColor }]}>
          <Text style={s.srcText} numberOfLines={1}>{item.source}</Text>
        </View>
        {featured ? (
          <View style={s.hotBadge}>
            <Ionicons name="flame" size={10} color="#FFF" />
            <Text style={s.hotText}>HOT</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.title} numberOfLines={2}>{item.title}</Text>
      {item.zone ? <Text style={s.zone} numberOfLines={1}>{item.zone}</Text> : null}
    </TouchableOpacity>
  );
}

export default React.memo(VideoCard);

const s = StyleSheet.create({
  card: {
    width: 220,
    backgroundColor: Color.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 2 },
      default: { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)' },
    }),
  },
  thumbWrap: { width: '100%', height: 124, backgroundColor: Color.skeleton },
  thumb: { width: '100%', height: '100%' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute', top: '50%', left: '50%', marginTop: -16, marginLeft: -16,
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute', right: 6, bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  duration: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  srcBadge: {
    position: 'absolute', left: 6, top: 6,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, maxWidth: 100,
  },
  srcText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  hotBadge: {
    position: 'absolute', right: 6, top: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Color.hot, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  hotText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  title: { fontSize: Font.caption, fontWeight: '700', color: Color.text, lineHeight: 18, marginTop: 8, paddingHorizontal: 10 },
  zone: { fontSize: Font.tiny, color: Color.textMuted, marginTop: 4, marginBottom: 10, paddingHorizontal: 10 },
});
