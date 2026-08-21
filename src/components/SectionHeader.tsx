import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Color, Font, Radius, useTheme } from '../constants/theme';

interface Props { title: string; accent?: string; }

export default function SectionHeader({ title, accent }: Props) {
  const s = makeStyles(useTheme());
  const barColor = accent || Color.hot;
  return (
    <View style={s.wrap}>
      <View style={[s.bar, { backgroundColor: barColor }]} />
      <Text style={[s.title, { color: barColor }]}>{title}</Text>
      <View style={s.line} />
    </View>
  );
}

type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, backgroundColor: Color.bg },
  bar: { width: 4, height: 18, borderRadius: 2, marginRight: 8 },
  title: { fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  line: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 10 },
});

const s = makeStyles(Color);