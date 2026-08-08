import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Color, Font } from '../constants/theme';

interface Props { title: string; }

export default function SectionHeader({ title }: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.accent} />
      <Text style={s.title}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingTop: 22, paddingBottom: 10, backgroundColor: Color.bg },
  accent: { height: 3, width: 36, backgroundColor: Color.primary, borderRadius: 2, marginBottom: 8 },
  title: { fontSize: 14, fontWeight: '700', color: Color.primary, textTransform: 'uppercase', letterSpacing: 1 },
});