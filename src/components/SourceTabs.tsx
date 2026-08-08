import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Color, Font } from '../constants/theme';

interface Props { sources: string[]; selected: string; onSelect: (s: string) => void; }

export default function SourceTabs({ sources, selected, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.wrap} contentContainerStyle={s.inner}>
      {sources.map((src) => {
        const act = src === selected;
        return (
          <TouchableOpacity key={src} style={[s.tab, act && s.active]} onPress={() => onSelect(src)} activeOpacity={0.7}>
            <Text style={[s.txt, act && s.txtActive]}>{src}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flexShrink: 0, backgroundColor: Color.card, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  inner: { paddingHorizontal: 10, gap: 6, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, backgroundColor: Color.skeleton, marginVertical: 7 },
  active: { backgroundColor: Color.primary },
  txt: { fontSize: 13, fontWeight: '600', color: '#555' },
  txtActive: { color: '#FFF' },
});