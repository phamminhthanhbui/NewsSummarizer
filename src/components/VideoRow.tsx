import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VideoItem } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';

interface Props { item: VideoItem; onPress: (item: VideoItem) => void; featured?: boolean; }

// Row video dọc — thay cho strip ngang: thumb trái, title + nguồn phải.
// Không cuộn ngang; featured (HOT) nổi bật bằng badge lửa.
function VideoRow({ item, onPress, featured }: Props) {
  const C = useTheme();
  const s = makeStyles(C);
  const srcColor = SOURCE_COLORS[item.source] || C.hot;
  return (
    <TouchableOpacity style={s.row} onPress={() => onPress(item)} activeOpacity={0.7} accessibilityRole="button">
      <View style={s.thumbWrap}>
        {item.thumb ? (
          <Image source={{ uri: item.thumb }} style={s.thumb} resizeMode="cover" />
        ) : (
          <View style={[s.thumb, s.thumbPh]}>
            <Ionicons name="videocam-outline" size={22} color={C.textMuted} />
          </View>
        )}
        <View style={s.playBadge}>
          <Ionicons name="play" size={13} color="#FFF" />
        </View>
        {item.duration ? (
          <View style={s.durationBadge}>
            <Ionicons name="time-outline" size={9} color="#FFF" />
            <Text style={s.durationText}>{item.duration}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.body}>
        <View style={s.metaRow}>
          <View style={[s.srcBadge, { backgroundColor: srcColor }]}>
            <Text style={s.srcText} numberOfLines={1}>{item.source}</Text>
          </View>
          {featured ? (
            <View style={s.hotBadge}>
              <Ionicons name="flame" size={9} color="#FFF" />
              <Text style={s.hotText}>HOT</Text>
            </View>
          ) : null}
        </View>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(VideoRow);

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Color.border,
  },
  thumbWrap: {
    width: 132,
    height: 82,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Color.skeleton,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
      default: { boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
    }),
  },
  thumb: { width: '100%', height: '100%' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: 28, height: 28, marginTop: -14, marginLeft: -14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 2,
  },
  durationBadge: {
    position: 'absolute', right: 5, bottom: 5,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
  },
  durationText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  body: { flex: 1, justifyContent: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  srcBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
    maxWidth: 110,
  },
  srcText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  hotBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Color.hot, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  hotText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  title: {
    fontSize: Font.body,
    fontWeight: '700',
    color: Color.text,
    lineHeight: 20,
  },
});
