import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { VideoItem } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';

interface Props { item: VideoItem; onPress: (item: VideoItem) => void; featured?: boolean; }

// Card video phủ kín (cùng ngôn ngữ với CompactCard bên HomeScreen):
// thumb full + scrim gradient + title đè lên ảnh. Height cố định 150.
function VideoCard({ item, onPress, featured }: Props) {
  const C = useTheme();
  const s = makeStyles(C); // styles động theo dark mode
  const srcColor = SOURCE_COLORS[item.source] || C.hot;
  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.85}>
      {item.thumb ? (
        <Image source={{ uri: item.thumb }} style={s.thumb} resizeMode="cover" />
      ) : (
        <View style={[s.thumb, s.thumbPh]}>
          <Ionicons name="videocam-outline" size={28} color={C.textMuted} />
        </View>
      )}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.85)']} locations={[0.3, 0.65, 1]} style={s.scrim} />
      <View style={s.playBadge}>
        <Ionicons name="play" size={16} color="#FFF" />
      </View>
      <View style={[s.srcBadge, { backgroundColor: srcColor }]}>
        <Text style={s.srcText} numberOfLines={1}>{item.source}</Text>
      </View>
      {featured ? (
        <View style={s.hotBadge}>
          <Ionicons name="flame" size={10} color="#FFF" />
          <Text style={s.hotText}>HOT</Text>
        </View>
      ) : null}
      {item.duration ? (
        <View style={s.durationBadge}>
          <Ionicons name="time-outline" size={10} color="#FFF" />
          <Text style={s.duration}>{item.duration}</Text>
        </View>
      ) : null}
      <Text style={s.title} numberOfLines={3}>{item.title}</Text>
    </TouchableOpacity>
  );
}

export default React.memo(VideoCard);

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  card: {
    width: '100%', height: 150,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Color.skeleton,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8 },
      android: { elevation: 3 },
      default: { boxShadow: '0 2px 8px rgba(0,0,0,0.12)' },
    }),
  },
  thumb: { width: '100%', height: '100%' },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  playBadge: {
    position: 'absolute', top: '38%', left: '50%', marginTop: -18, marginLeft: -18,
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 3,
  },
  srcBadge: {
    position: 'absolute', left: 8, top: 8,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, maxWidth: 110,
  },
  srcText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  hotBadge: {
    position: 'absolute', right: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Color.hot, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4,
  },
  hotText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },
  durationBadge: {
    position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  duration: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  title: {
    position: 'absolute', left: 10, right: 10, bottom: 10,
    fontSize: Font.caption, fontWeight: '800', color: '#FFF', lineHeight: 17,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const s = makeStyles(Color);
