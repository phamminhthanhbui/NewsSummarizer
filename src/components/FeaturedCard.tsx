import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { FeedItem } from '../types';
import { Color, Font, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

// Hero full-bleed: ảnh chạm mép màn, scrim gradient mềm thay cho View phẳng,
// type to hơn — cảm giác báo điện tử lớn. Chỉ dùng cho carousel Home.
function FeaturedCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);
  const C = useTheme();
  const s = makeStyles(C); // styles động theo dark mode
  const srcColor = SOURCE_COLORS[item.source] || C.hot;

  return (
    <TouchableOpacity style={s.card} onPress={() => onPress(item)} activeOpacity={0.9} accessibilityRole="button">
      {item.image ? (
        <Image source={{ uri: item.image }} style={s.img} resizeMode="cover" />
      ) : (
        <View style={[s.img, s.imgPh]}>
          <Ionicons name="image-outline" size={48} color={C.textMuted} />
        </View>
      )}
      {/* Trên trong suốt (để thấy rõ ảnh), dưới đen đậm (chữ đọc được) */}
      <LinearGradient
        style={s.scrim}
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
      />
      <View style={s.overlay}>
        {item.featured ? (
          // Tin nổi bật: badge lửa + nhãn NỔI BẬT, giữ tên nguồn ở badge phụ nhỏ
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: C.hot }]}>
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
            <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={s.time}>{t} trước</Text>
            <View style={s.readCue}>
              <Text style={s.readCueText}>ĐỌC TIẾP</Text>
              <Ionicons name="arrow-forward" size={12} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(FeaturedCard);

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  card: { width: '100%', height: 250, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgPh: { backgroundColor: Color.skeleton, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingTop: 56 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: Color.hot, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  badgeGhost: { backgroundColor: 'rgba(0,0,0,0.38)' },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  badgeText: { fontSize: Font.tiny, color: '#FFF', fontWeight: '800', letterSpacing: 0.4 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFF', lineHeight: 30, letterSpacing: -0.3, marginTop: 9 },
  timeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9 },
  time: { fontSize: Font.tiny, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  readCue: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', opacity: 0.9 },
  readCueText: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.6 },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const s = makeStyles(Color);