import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';
import { Color, Radius, Shadow, useTheme } from '../constants/theme';

export default function SkeletonCard() {
  const C = useTheme();
  const s = makeStyles(C); // styles động theo dark mode
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // useNativeDriver: chạy UI thread — skeleton không giật khi JS thread bận tải feed
    // (web không có native animated module → chỉ bật native driver trên native)
    const native = Platform.OS !== 'web';
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: native }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  // Native driver không animate được backgroundColor → dùng opacity
  return (
    <View style={s.row}>
      <View style={s.thumb}>
        <Animated.View style={[s.fill, { backgroundColor: C.skeleton }]} />
        <Animated.View style={[s.fill, { backgroundColor: C.skeletonAnim, opacity: pulse }]} />
      </View>
      <View style={s.body}>
        {[s.line88, s.line60, s.lineSm].map((st, i) => (
          <View key={i} style={st}>
            <Animated.View style={[s.fill, { backgroundColor: C.skeleton }]} />
            <Animated.View style={[s.fill, { backgroundColor: C.skeletonAnim, opacity: pulse }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  // Hình dạng phải khớp ArticleCardCompact: lệch thì lúc feed về sẽ "nhảy" bố cục.
  row: { flexDirection: 'row', backgroundColor: Color.card, paddingVertical: 12, paddingHorizontal: 12, marginHorizontal: 12, marginBottom: 10, borderRadius: Radius.lg, ...Shadow.card },
  thumb: { width: 108, height: 76, borderRadius: Radius.sm, marginRight: 10, overflow: 'hidden' },
  body: { flex: 1, gap: 7, justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 4 },
  line88: { height: 12, borderRadius: 4, width: '88%', overflow: 'hidden' },
  line60: { height: 12, borderRadius: 4, width: '60%', overflow: 'hidden' },
  lineSm: { height: 8, borderRadius: 4, width: '35%', overflow: 'hidden' },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const s = makeStyles(Color);