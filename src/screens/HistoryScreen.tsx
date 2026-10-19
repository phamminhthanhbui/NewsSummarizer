import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { SummaryRecord } from '../types';
import { Sans, Color, Radius, useTheme, Layout } from '../constants/theme';
import { KEYS } from '../services/storage';
import { LibraryTabs, ScreenHeader, Empty } from '../components/PremiumUI';

type Palette = typeof Color;

export default function HistoryScreen({ navigation }: any) {
  const [items, setItems] = useState<SummaryRecord[]>([]);
  const [query, setQuery] = useState('');
  const C = useTheme();
  const styles = makeStyles(C);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(KEYS.history).then((raw) => {
      if (!raw) {
        setItems([]);
        return;
      }
      const all: SummaryRecord[] = JSON.parse(raw);
      const cleaned = all.filter((record) => (record.summary || '').trim().length > 0);
      if (cleaned.length !== all.length) void AsyncStorage.setItem(KEYS.history, JSON.stringify(cleaned));
      setItems(cleaned);
    });
  }, []));

  const filtered = items.filter((item) => `${item.title} ${item.source} ${item.summary}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));

  const handleClearAll = async () => {
    await AsyncStorage.removeItem(KEYS.history);
    setItems([]);
  };

  const handlePressItem = (item: SummaryRecord) => {
    navigation.navigate('HomeTab', {
      screen: 'Article',
      params: { item: { title: item.title, link: item.url, description: item.summary, pubDate: item.date, source: item.source } },
    });
  };

  return (
    <View style={styles.container} testID="historyScreen">
      <ScreenHeader
        title="Thư viện"
        subtitle={`${items.length} bản tóm tắt gần đây`}
        action={items.length ? (
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={16} color={C.danger} />
            <Text style={styles.clearText}>Xóa tất cả</Text>
          </TouchableOpacity>
        ) : null}
      />
      <View style={styles.tabsWrap}><LibraryTabs active="History" navigation={navigation} /></View>
      <FlatList
        data={filtered}
        keyExtractor={(item, index) => `${item.url}-${index}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={C.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm trong lịch sử"
              placeholderTextColor={C.textMuted}
              style={styles.searchInput}
            />
            {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={C.textMuted} /></TouchableOpacity> : null}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} activeOpacity={0.82} onPress={() => handlePressItem(item)}>
            <View style={styles.iconTile}><Ionicons name="document-text-outline" size={20} color={C.hot} /></View>
            <View style={styles.rowBody}>
              <View style={styles.metaRow}>
                <Text style={styles.source} numberOfLines={1}>{item.source || 'Nguồn tin'}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.date}>{new Date(item.date).toLocaleDateString('vi-VN')}</Text>
              </View>
              <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.summary} numberOfLines={2}>{item.summary}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color={C.border} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Empty
            title={query ? 'Không có kết quả' : 'Chưa có lịch sử tóm tắt'}
            subtitle={query ? 'Thử tìm bằng từ khóa khác.' : 'Mở một bài viết để NewsSummarizer lưu lại bản tóm tắt gần đây.'}
            icon="document-text-outline"
          />
        }
      />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  tabsWrap: { paddingTop: 14, width: '100%', maxWidth: Layout.content, alignSelf: 'center' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: C.dangerSoft },
  clearText: { fontFamily: Sans.medium, color: C.danger, fontSize: 11 },
  listContent: { padding: 18, paddingBottom: 44, width: '100%', maxWidth: 900, alignSelf: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 13, marginBottom: 16 },
  searchInput: { flex: 1, paddingVertical: 13, fontFamily: Sans.regular, fontSize: 13, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.md, padding: 12, marginBottom: 10 },
  iconTile: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.hotSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  rowBody: { flex: 1, minWidth: 0 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  source: { fontFamily: Sans.bold, fontSize: 10, color: C.hot, maxWidth: 130 },
  metaDot: { fontFamily: Sans.regular, fontSize: 10, color: C.textMuted },
  date: { fontFamily: Sans.regular, fontSize: 10, color: C.textMuted },
  rowTitle: { fontFamily: Sans.bold, fontSize: 14, color: C.text, lineHeight: 20 },
  summary: { fontFamily: Sans.regular, fontSize: 11, color: C.textSecondary, lineHeight: 17, marginTop: 5 },
});
