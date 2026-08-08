import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { FeedItem } from '../types';
import { Color, Font } from '../constants/theme';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

export default function ArticleCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(item)} activeOpacity={0.7}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.thumb} resizeMode="cover" />
      ) : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {item.description ? (
          <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
        ) : null}
        <View style={styles.meta}>
          <Text style={styles.source}>{item.source}</Text>
          {t ? <Text style={styles.metaSep}> · </Text> : null}
          {t ? <Text style={styles.time}>{t} trước</Text> : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: Color.card,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  thumb: { width: 120, height: 80, borderRadius: 6, marginRight: 12, backgroundColor: Color.skeleton },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontSize: Font.headline, fontWeight: '600', color: Color.text, lineHeight: 22, marginBottom: 4 },
  desc: { fontSize: Font.body, color: Color.textSecondary, lineHeight: 19, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center' },
  source: { fontSize: Font.tiny, color: Color.primary, fontWeight: '700' },
  metaSep: { fontSize: Font.tiny, color: Color.textMuted },
  time: { fontSize: Font.tiny, color: Color.textMuted },
});