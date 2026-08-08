import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import type { FeedItem } from '../types';
import { Color, Font } from '../constants/theme';
import { timeAgo } from '../utils/timeAgo';

interface Props { item: FeedItem; onPress: (item: FeedItem) => void; }

export default function FeaturedCard({ item, onPress }: Props) {
  const t = timeAgo(item.pubDate);

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.7}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.img} resizeMode="cover" />
      ) : (
        <View style={[styles.img, styles.imgPlaceholder]}>
          <Text style={styles.placeholderText}>📰</Text>
        </View>
      )}
      <View style={styles.overlay}>
        <Text style={styles.badge}>{item.source}</Text>
        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        {t ? <Text style={styles.time}>{t} trước</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', height: 200, borderRadius: 10, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  imgPlaceholder: { backgroundColor: Color.skeleton, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 36 },
  overlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 14, paddingTop: 40,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badge: { fontSize: Font.tiny, color: '#FFD54F', fontWeight: '700', marginBottom: 4, letterSpacing: 0.5 },
  title: { fontSize: Font.hero, fontWeight: '700', color: '#FFF', lineHeight: 26 },
  time: { fontSize: Font.tiny, color: 'rgba(255,255,255,0.75)', marginTop: 6 },
});