import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Color, Font, Radius, useTheme } from '../constants/theme';

interface Props { title: string; }

export default function SectionHeader({ title }: Props) {
  const s = makeStyles(useTheme()); // styles động theo dark mode
  return (
    <View style={s.wrap}>
      <View style={s.mark} />
      <View style={s.titleWrap}>
        <Text style={s.title}>{title}</Text>
        <View style={s.line} />
      </View>
    </View>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, backgroundColor: Color.bg },
  mark: { width: 5, height: 20, backgroundColor: Color.hot, borderRadius: Radius.sm, marginRight: 10 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: Color.hot, textTransform: 'uppercase', letterSpacing: 0.8 },
  line: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 12 },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const s = makeStyles(Color);