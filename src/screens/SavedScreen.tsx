import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedItem } from '../types';
import { Color, Font } from '../constants/theme';
import { KEYS } from '../services/storage';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type Props = { navigation: NativeStackNavigationProp<any> };

export default function SavedScreen({ navigation }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(KEYS.saved).then((raw) => {
        setItems(raw ? JSON.parse(raw) : []);
      });
    }, []),
  );

  const handleDelete = (link: string) => {
    Alert.alert('Xoá', 'Bỏ lưu bài này?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          const next = items.filter((i) => i.link !== link);
          await AsyncStorage.setItem(KEYS.saved, JSON.stringify(next));
          setItems(next);
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('Xác nhận', 'Xoá tất cả bài đã lưu?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá tất cả',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(KEYS.saved);
          setItems([]);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>❤ Bài Đã Lưu</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearBtn}>Xoá tất cả</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.link}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('HomeTab', { screen: 'Article', params: { item } })}
            onLongPress={() => handleDelete(item.link)}
            activeOpacity={0.7}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            <View style={styles.cardMeta}>
              <Text style={styles.source}>{item.source}</Text>
              <Text style={styles.dim}>
                {new Date(item.pubDate).toLocaleDateString('vi-VN')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📌</Text>
            <Text style={styles.emptyText}>Chưa có bài đã lưu</Text>
            <Text style={styles.emptyHint}>Nhấn "❤ Lưu" trong bài báo để lưu</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Color.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: Color.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  title: { fontSize: Font.hero, fontWeight: '700', color: Color.text },
  clearBtn: { fontSize: Font.caption, color: Color.primary, fontWeight: '600' },
  card: {
    backgroundColor: Color.card,
    marginHorizontal: 12,
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Color.border,
  },
  cardTitle: { fontSize: Font.body, fontWeight: '600', color: Color.text, lineHeight: 20, marginBottom: 6 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  source: { fontSize: Font.tiny, color: Color.primary, fontWeight: '700' },
  dim: { fontSize: Font.tiny, color: Color.textMuted },
  empty: { paddingTop: 80, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Color.text },
  emptyHint: { fontSize: Font.caption, color: Color.textMuted },
});