import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { Color, Radius } from '../constants/theme';

export default function SkeletonCard() {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: false }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  const bg = pulse.interpolate({ inputRange: [0, 1], outputRange: [Color.skeleton, Color.skeletonAnim] });

  return (
    <View style={s.row}>
      <Animated.View style={[s.thumb, { backgroundColor: bg }]} />
      <View style={s.body}>
        <Animated.View style={[s.line, { backgroundColor: bg, width: '88%' }]} />
        <Animated.View style={[s.line, { backgroundColor: bg, width: '60%' }]} />
        <Animated.View style={[s.lineSm, { backgroundColor: bg }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: Color.card, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  thumb: { width: 118, height: 84, borderRadius: Radius.sm, marginRight: 12 },
  body: { flex: 1, gap: 7, justifyContent: 'center' },
  line: { height: 12, borderRadius: 4 },
  lineSm: { height: 8, borderRadius: 4, width: '35%' },
});