import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Color, Font, Radius } from '../constants/theme';

interface Props { title: string; }

export default function SectionHeader({ title }: Props) {
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

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10, backgroundColor: Color.bg },
  mark: { width: 5, height: 20, backgroundColor: Color.primary, borderRadius: Radius.sm, marginRight: 10 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: Color.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
  line: { flex: 1, height: 1, backgroundColor: Color.border, marginLeft: 12 },
});