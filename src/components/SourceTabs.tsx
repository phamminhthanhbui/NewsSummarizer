import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Color, Font, Shadow } from '../constants/theme';

interface Props { sources: string[]; selected: string; onSelect: (s: string) => void; }

export default function SourceTabs({ sources, selected, onSelect }: Props) {
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

const s = StyleSheet.create({
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