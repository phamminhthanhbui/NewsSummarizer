import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Color, Radius } from '../constants/theme';

export default function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // useNativeDriver: chạy UI thread — skeleton không giật khi JS thread bận tải feed
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  // Native driver không animate được backgroundColor → dùng opacity
  return (
    <View style={s.row}>
      <View style={s.thumb}>
        <Animated.View style={[s.fill, { backgroundColor: Color.skeleton }]} />
        <Animated.View style={[s.fill, { backgroundColor: Color.skeletonAnim, opacity: pulse }]} />
      </View>
      <View style={s.body}>
        {[s.line88, s.line60, s.lineSm].map((st, i) => (
          <View key={i} style={st}>
            <Animated.View style={[s.fill, { backgroundColor: Color.skeleton }]} />
            <Animated.View style={[s.fill, { backgroundColor: Color.skeletonAnim, opacity: pulse }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: Color.card, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  thumb: { width: 118, height: 84, borderRadius: Radius.sm, marginRight: 12, overflow: 'hidden' },
  body: { flex: 1, gap: 7, justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 4 },
  line88: { height: 12, borderRadius: 4, width: '88%', overflow: 'hidden' },
  line60: { height: 12, borderRadius: 4, width: '60%', overflow: 'hidden' },
  lineSm: { height: 8, borderRadius: 4, width: '35%', overflow: 'hidden' },
});