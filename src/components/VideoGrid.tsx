import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { VideoItem } from '../types';
import { Color, Font, Radius, useTheme } from '../constants/theme';
import { SOURCE_COLORS } from '../services/feeds';

interface Props { videos: VideoItem[]; onPress: (v: VideoItem) => void; }

// Video grid kiểu báo điện tử: hero lớn 16:9 + 2 cột.
// Không scroll ngang — featured lên đầu, tối đa 7 video.
function VideoGrid({ videos, onPress }: Props) {
  if (!videos.length) return null;
  const C = useTheme();
  const s = makeStyles(C);
  const hero = videos[0];
  const rest = videos.slice(1, 7);
  const heroColor = SOURCE_COLORS[hero.source] || C.hot;
  const isHeroFeat = hero.zone === 'Video nổi bật';

  return (
    <View style={s.wrap}>
      {/* Hero */}
      <TouchableOpacity style={s.hero} onPress={() => onPress(hero)} activeOpacity={0.9}>
        <View style={s.heroThumb}>
          {hero.thumb ? (
            <Image source={{ uri: hero.thumb }} style={s.heroImg} resizeMode="cover" />
          ) : (
            <View style={[s.heroImg, s.heroPh]}>
              <Ionicons name="videocam-outline" size={40} color={C.textMuted} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.5, 1]}
            style={s.heroScrim}
            pointerEvents="none"
          />
          <View style={s.heroPlay}>
            <Ionicons name="play" size={24} color="#FFF" />
          </View>
          <View style={[s.heroSrc, { backgroundColor: heroColor }]}>
            <Text style={s.heroSrcText} numberOfLines={1}>{hero.source}</Text>
          </View>
          {isHeroFeat ? (
            <View style={s.heroHot}>
              <Ionicons name="flame" size={11} color="#FFF" />
              <Text style={s.heroHotText}>HOT</Text>
            </View>
          ) : null}
          {hero.duration ? (
            <View style={s.heroDur}>
              <Ionicons name="time-outline" size={11} color="#FFF" />
              <Text style={s.heroDurText}>{hero.duration}</Text>
            </View>
          ) : null}
          <Text style={s.heroTitle} numberOfLines={2}>{hero.title}</Text>
        </View>
      </TouchableOpacity>

      {/* Grid 2 cột */}
      {rest.length > 0 && (
        <View style={s.grid}>
          {rest.map((v) => {
            const sc = SOURCE_COLORS[v.source] || C.hot;
            const feat = v.zone === 'Video nổi bật';
            return (
              <TouchableOpacity key={v.link} style={s.card} onPress={() => onPress(v)} activeOpacity={0.85}>
                <View style={s.cardThumb}>
                  {v.thumb ? (
                    <Image source={{ uri: v.thumb }} style={s.cardImg} resizeMode="cover" />
                  ) : (
                    <View style={[s.cardImg, s.cardPh]}>
                      <Ionicons name="videocam-outline" size={22} color={C.textMuted} />
                    </View>
                  )}
                  <View style={s.cardPlay}>
                    <Ionicons name="play" size={14} color="#FFF" />
                  </View>
                  {v.duration ? (
                    <View style={s.cardDur}>
                      <Ionicons name="time-outline" size={9} color="#FFF" />
                      <Text style={s.cardDurText}>{v.duration}</Text>
                    </View>
                  ) : null}
                  {feat ? (
                    <View style={[s.cardSrc, { backgroundColor: sc }]}>
                      <Text style={s.cardSrcText} numberOfLines={1}>{v.source}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.cardBody}>
                  <Text style={s.cardTitle} numberOfLines={2}>{v.title}</Text>
                  {!feat ? (
                    <Text style={[s.cardSource, { color: sc }]} numberOfLines={1}>{v.source}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default React.memo(VideoGrid);

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  wrap: { marginBottom: 6 },

  /* ── Hero ── */
  hero: { marginBottom: 0 },
  heroThumb: { width: '100%', aspectRatio: 16 / 9, overflow: 'hidden' },
  heroImg: { width: '100%', height: '100%' },
  heroPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: Color.skeleton },
  heroScrim: { ...StyleSheet.absoluteFillObject },
  heroPlay: {
    position: 'absolute', top: '50%', left: '50%',
    width: 52, height: 52, marginTop: -26, marginLeft: -26,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 3,
  },
  heroSrc: {
    position: 'absolute', left: 12, top: 12,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4,
    maxWidth: 140,
  },
  heroSrcText: { fontSize: Font.tiny, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  heroHot: {
    position: 'absolute', right: 12, top: 12,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Color.hot, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  heroHotText: { fontSize: Font.tiny, fontWeight: '800', color: '#FFF', letterSpacing: 0.2 },
  heroDur: {
    position: 'absolute', right: 12, bottom: 56,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4,
  },
  heroDurText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  heroTitle: {
    position: 'absolute', left: 12, right: 12, bottom: 12,
    fontSize: Font.headline,
    fontWeight: '800', color: '#FFF',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },

  /* ── 2-column grid ── */
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  card: { flexBasis: '47%', flexGrow: 1 },
  cardThumb: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.sm, overflow: 'hidden', backgroundColor: Color.skeleton },
  cardImg: { width: '100%', height: '100%' },
  cardPh: { alignItems: 'center', justifyContent: 'center' },
  cardPlay: {
    position: 'absolute', top: '50%', left: '50%',
    width: 30, height: 30, marginTop: -15, marginLeft: -15,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1.2, borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center', paddingLeft: 2,
  },
  cardDur: {
    position: 'absolute', right: 5, bottom: 5,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3,
  },
  cardDurText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  cardSrc: {
    position: 'absolute', left: 5, top: 5,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
    maxWidth: 100,
  },
  cardSrcText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  cardBody: { paddingTop: 6, paddingBottom: 2 },
  cardTitle: { fontSize: Font.caption, fontWeight: '700', color: Color.text, lineHeight: 18, marginBottom: 2 },
  cardSource: { fontSize: Font.tiny - 1, fontWeight: '600', letterSpacing: 0.1 },
});