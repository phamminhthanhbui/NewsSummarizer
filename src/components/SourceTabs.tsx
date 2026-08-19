import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Color, Font, Shadow, useTheme } from '../constants/theme';

interface Props { sources: string[]; selected: string; onSelect: (s: string) => void; }

export default function SourceTabs({ sources, selected, onSelect }: Props) {
  const s = makeStyles(useTheme()); // styles động theo dark mode
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.wrap} contentContainerStyle={s.inner}>
      {sources.map((src) => {
        const act = src === selected;
        return (
          <TouchableOpacity
            key={src}
            style={[s.tab, act && s.active]}
            onPress={() => onSelect(src)}
            activeOpacity={0.75}
          >
            <Text style={[s.txt, act && s.txtActive]}>{src}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// Palette truyền vào làm shadow biến `Color` cục bộ → styles tự nhận màu dark/light
type Palette = typeof Color;
const makeStyles = (Color: Palette) => StyleSheet.create({
  wrap: { flexShrink: 0, backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  inner: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  tab: {
    paddingHorizontal: 15, paddingVertical: 8, borderRadius: 999,
    backgroundColor: Color.bg, marginVertical: 9, borderWidth: 1, borderColor: Color.border,
  },
  active: { backgroundColor: Color.primary, borderColor: Color.primary, ...Shadow.card },
  txt: { fontSize: 13, fontWeight: '600', color: Color.textSecondary },
  txtActive: { color: '#FFF' },
});

// Mặc định light; component dùng useTheme() sẽ tự nhận palette đúng khi đổi mode
const s = makeStyles(Color);