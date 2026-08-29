import React from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VideoItem } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';

interface Props { videos: VideoItem[]; onPress: (v: VideoItem) => void; expanded: boolean; }

// Video nổi bật — 2 chế độ:
// - collapsed: strip ngang gọn 1 hàng, 6 video (ảnh 16:9 + play + duration + title 1 dòng).
// - expanded: lưới 2 cột, tối đa 12 video.
function VideoGrid({ videos, onPress, expanded }: Props) {
  if (!videos.length) return null;
  const C = useTheme();
  const s = makeStyles(C);
  const show = videos.slice(0, expanded ? 12 : 6);

  const renderCard = (v: VideoItem) => (
    <TouchableOpacity
      key={v.link}
      style={[s.card, !expanded ? s.cardFixed : s.cardGrow]}
      onPress={() => onPress(v)}
      activeOpacity={0.85}
    >
      <View style={s.thumb}>
        {v.thumb ? (
          <Image source={{ uri: v.thumb }} style={s.img} resizeMode="cover" />
        ) : (
          <View style={[s.img, s.ph]}>
            <Ionicons name="videocam-outline" size={20} color={C.textMuted} />
          </View>
        )}
        <View style={s.play}>
          <Ionicons name="play" size={14} color="#FFF" />
        </View>
        {v.duration ? (
          <View style={s.dur}>
            <Ionicons name="time-outline" size={9} color="#FFF" />
            <Text style={s.durText}>{v.duration}</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.title} numberOfLines={1}>{v.title}</Text>
    </TouchableOpacity>
  );

  if (expanded) {
    return <View style={s.grid}>{show.map(renderCard)}</View>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.strip}
    >
      {show.map(renderCard)}
    </ScrollView>
  );
}

export default React.memo(VideoGrid);

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  strip: { paddingHorizontal: 12, paddingBottom: 4, gap: 10 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  card: {
    backgroundColor: Color.card,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
      default: { boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)' },
    }),
  },
  cardFixed: { width: 170 },
  cardGrow: { flexBasis: '47%', flexGrow: 1 },
  thumb: { width: '100%', aspectRatio: 16 / 9, backgroundColor: Color.skeleton },
  img: { width: '100%', height: '100%' },
  ph: { alignItems: 'center', justifyContent: 'center' },
  play: {
    position: 'absolute', top: '50%', left: '50%',
    width: 30, height: 30, marginTop: -15, marginLeft: -15,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 2,
  },
  dur: {
    position: 'absolute', right: 5, bottom: 5,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
  },
  durText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  title: {
    fontSize: Font.caption,
    fontWeight: '700',
    color: Color.text,
    lineHeight: 17,
    marginTop: 6,
    paddingHorizontal: 2,
  },
});
