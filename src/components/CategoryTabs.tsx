import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}

export default function CategoryTabs({ categories, selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {categories.map((cat) => {
        const active = cat === selected;
        return (
          <TouchableOpacity
            key={cat}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onSelect(cat)}
            activeOpacity={0.7}
          >
            <Text style={[styles.text, active && styles.textActive]}>{cat}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8e8e8',
    maxHeight: 48,
  },
  content: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f3f5',
    marginVertical: 8,
  },
  tabActive: {
    backgroundColor: '#4263eb',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: '#495057',
  },
  textActive: {
    color: '#fff',
  },
});