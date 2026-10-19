import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, Image, FlatList, ScrollView, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FEEDS, readFeedsCache, fetchAllFeeds } from '../services/feeds';
import { getPreferences } from '../services/preferences';
import { useTheme, Sans, Radius, Layout } from '../constants/theme';
import { ScreenHeader, Heading, Action, Empty, IconButton, SectionTitle } from '../components/PremiumUI';
import ArticleCardCompact from '../components/ArticleCardCompact';
import type { FeedItem } from '../types';
import { useAuth } from '../providers/AuthProvider';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export default function HomeScreen({ navigation, route }: any) {
  const C = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const wide = width >= 1180;
  const discover = route.name === 'Discover';
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(discover);
  const [category, setCategory] = useState('Tất cả');
  const [source, setSource] = useState('Tất cả nguồn');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [prefs, setPrefs] = useState({ categories: [] as string[], sources: [] as string[] });
  const alive = useRef(true);
  const busy = useRef(false);
  const list = useRef<any>(null);
  useScrollToTop(list);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    setError('');
    try {
      const result = await fetchAllFeeds((partial) => {
        if (alive.current && partial.length) setItems(partial);
      });
      if (alive.current) {
        if (result.length) setItems(result);
        else setError('Chưa thể kết nối nguồn tin. Bạn vẫn có thể đọc dữ liệu đã lưu.');
      }
    } catch {
      if (alive.current) setError('Không thể tải tin lúc này.');
    } finally {
      busy.current = false;
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    readFeedsCache().then((cached) => {
      if (!alive.current) return;
      setItems(cached);
      setLoading(!cached.length);
      if (!cached.length) void refresh();
    });
    return () => { alive.current = false; };
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getPreferences().then((p) => { if (active) setPrefs(p); });
    return () => { active = false; };
  }, []));

  const categories = useMemo(() => ['Tất cả', ...new Set(FEEDS.map((f) => f.category))], []);
  const sourceNames = useMemo(() => ['Tất cả nguồn', ...new Set(FEEDS.map((f) => f.name))], []);
  const visible = useMemo(() => items.filter((item) =>
    (category === 'Tất cả' || item.category === category) &&
    (source === 'Tất cả nguồn' || item.source === source) &&
    (!prefs.sources.length || prefs.sources.includes(item.source)) &&
    (!prefs.categories.length || prefs.categories.includes(item.category || '')) &&
    `${item.title} ${item.description}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))
  ), [items, category, source, query, prefs]);

  const hero = !discover && !query && category === 'Tất cả' && source === 'Tất cả nguồn'
    ? visible.find((item) => item.featured && item.image) || visible.find((item) => item.image) || visible[0]
    : undefined;
  const data = hero ? visible.filter((item) => item.link !== hero.link) : visible;
  const trends = visible.slice(0, 8);
  const sourceHighlights = [...new Set(items.map((item) => item.source))].slice(0, 6);
  const open = (item: FeedItem) => discover
    ? navigation.navigate('HomeTab', { screen: 'Article', params: { item } })
    : navigation.navigate('Article', { item });

  const searchField = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, paddingHorizontal: 14, minHeight: 48 }}>
      <Ionicons name="search-outline" size={19} color={C.textMuted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Nhập từ khóa tìm kiếm"
        placeholder={discover ? 'Tìm chủ đề, nguồn tin hoặc từ khóa' : 'Tìm trong dòng tin hôm nay'}
        placeholderTextColor={C.textMuted}
        style={{ flex: 1, minWidth: 0, paddingVertical: 13, fontFamily: Sans.regular, fontSize: 13, color: C.text }}
      />
      {query ? <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Xóa tìm kiếm"><Ionicons name="close-circle" size={19} color={C.textMuted} /></TouchableOpacity> : null}
    </View>
  );

  const topicChips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
      {categories.map((name) => {
        const active = category === name;
        return (
          <TouchableOpacity
            key={name}
            onPress={() => setCategory(name)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{ paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: active ? C.hotSoft : C.card, borderWidth: 1, borderColor: active ? C.hot : C.border }}
          >
            <Text style={{ fontFamily: active ? Sans.bold : Sans.medium, fontSize: 12, color: active ? C.hot : C.textSecondary }}>{name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  if (discover) {
    return (
      <View testID="discoverScreen" style={{ flex: 1, backgroundColor: C.bg }}>
        <ScreenHeader
          title="Khám phá"
          subtitle="Tìm chủ đề, nguồn tin và câu chuyện đáng theo dõi"
          action={user ? (
            <IconButton icon="person-outline" label="Tài khoản" onPress={() => navigation.navigate('Account')} />
          ) : (
            <Action label="Đăng nhập" icon="log-in-outline" onPress={() => navigation.navigate('Login')} />
          )}
        />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: desktop ? 30 : 18, paddingBottom: 48, maxWidth: Layout.content, width: '100%', alignSelf: 'center' }}>
          <Heading eyebrow="DISCOVER" title="Đi sâu vào điều bạn quan tâm." subtitle="Khám phá xu hướng, chủ đề và nguồn tin thay vì lướt thêm một dòng feed giống Hôm nay." />
          <View style={{ marginBottom: 24 }}>{searchField}</View>
          <View style={{ marginBottom: 28 }}>{topicChips}</View>

          {query || category !== 'Tất cả' || source !== 'Tất cả nguồn' ? (
            <>
              <SectionTitle title="Kết quả" subtitle={`${visible.length} bài viết phù hợp`} />
              <View style={{ gap: 2 }}>
                {visible.slice(0, 30).map((item) => <ArticleCardCompact key={item.link} item={item} onPress={open} />)}
              </View>
              {!visible.length ? <Empty title="Chưa tìm thấy kết quả" subtitle="Thử một từ khóa khác hoặc bỏ bộ lọc chủ đề." icon="search-outline" action={<Action label="Bỏ bộ lọc" onPress={() => { setQuery(''); setCategory('Tất cả'); }} />} /> : null}
            </>
          ) : (
            <>
              <SectionTitle title="Đang nổi" subtitle="Những câu chuyện mới nhất đang được nhiều nguồn nhắc tới" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
                {trends.map((item, index) => (
                  <TouchableOpacity key={item.link} onPress={() => open(item)} activeOpacity={0.82} style={{ flexBasis: wide ? '48%' : '100%', flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.md, padding: 16, flexDirection: 'row', gap: 14 }}>
                    <Text numberOfLines={1} style={{ fontFamily: Sans.bold, fontSize: 24, lineHeight: 30, color: index < 3 ? C.hot : C.border, width: 40, flexShrink: 0, textAlign: 'center' }}>{String(index + 1).padStart(2, '0')}</Text>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={{ fontFamily: Sans.bold, fontSize: 15, lineHeight: 22, color: C.text }}>{item.title}</Text>
                      <Text style={{ fontFamily: Sans.regular, fontSize: 11, color: C.textMuted, marginTop: 7 }}>{item.source} · {item.category || 'Tin mới'}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              <SectionTitle title="Chủ đề dành cho bạn" subtitle="Chọn một chủ đề để thu hẹp góc nhìn" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
                {categories.filter((name) => name !== 'Tất cả').slice(0, 8).map((name, index) => (
                  <TouchableOpacity key={name} onPress={() => setCategory(name)} activeOpacity={0.8} style={{ minWidth: wide ? 210 : '46%', flexGrow: 1, backgroundColor: index === 0 ? C.navy : C.card, borderWidth: index === 0 ? 0 : 1, borderColor: C.border, borderRadius: Radius.md, padding: 18 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: index === 0 ? 'rgba(255,255,255,.1)' : C.hotSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                      <Ionicons name={['hardware-chip-outline', 'business-outline', 'globe-outline', 'heart-outline', 'football-outline', 'school-outline'][index % 6] as any} size={18} color={index === 0 ? '#fff' : C.hot} />
                    </View>
                    <Text style={{ fontFamily: Sans.bold, color: index === 0 ? '#fff' : C.text, fontSize: 15 }}>{name}</Text>
                    <Text style={{ fontFamily: Sans.regular, color: index === 0 ? '#AEB9CA' : C.textMuted, fontSize: 11, marginTop: 5 }}>Khám phá tin mới →</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <SectionTitle title="Nguồn đáng theo dõi" subtitle="Điều chỉnh nguồn tin trong hồ sơ cá nhân" action={<TouchableOpacity onPress={() => navigation.navigate('Sources')}><Text style={{ color: C.hot, fontFamily: Sans.bold, fontSize: 12 }}>Quản lý →</Text></TouchableOpacity>} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {sourceHighlights.map((name) => (
                  <TouchableOpacity key={name} onPress={() => { setSource(name); setQuery(''); }} style={{ minWidth: 150, flexGrow: 1, flexBasis: wide ? '30%' as any : '45%' as any, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: C.hotSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: Sans.bold, fontSize: 12, color: C.hot }}>{name.slice(0, 1).toUpperCase()}</Text></View>
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: Sans.medium, color: C.text, fontSize: 12 }}>{name}</Text>
                    <Ionicons name="chevron-forward" size={15} color={C.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View testID="homeScreen" style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader
        title="Hôm nay"
        subtitle={new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
        action={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton icon="search-outline" label="Tìm kiếm" active={searchOpen} onPress={() => setSearchOpen((value) => !value)} />
            <IconButton icon="refresh-outline" label="Làm mới" onPress={refresh} />
            <IconButton icon="person-outline" label="Tài khoản" onPress={() => navigation.navigate('Account')} />
          </View>
        }
      />

      <FlatList
        ref={list}
        data={data}
        keyExtractor={(item) => item.link}
        renderItem={({ item }) => <ArticleCardCompact item={item} onPress={open} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.hot} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: desktop ? 30 : 18, paddingBottom: 48, maxWidth: 1040, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <>
            <Heading eyebrow="BẢN TIN CỦA BẠN" title={`${greeting()}.`} subtitle="Tin đáng đọc từ những nguồn bạn tin tưởng, được sắp xếp để bạn nắm nhanh điều quan trọng." />
            {searchOpen ? <View style={{ marginBottom: 20 }}>{searchField}</View> : null}
            <View style={{ marginBottom: 20 }}>{topicChips}</View>

            <TouchableOpacity onPress={() => setSourcesOpen((value) => !value)} style={{ flexDirection: 'row', gap: 7, alignItems: 'center', alignSelf: 'flex-start', marginBottom: 18 }}>
              <Ionicons name="options-outline" size={16} color={C.textMuted} />
              <Text style={{ fontFamily: Sans.medium, color: C.textMuted, fontSize: 12 }}>{source}</Text>
              <Ionicons name={sourcesOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.textMuted} />
            </TouchableOpacity>
            {sourcesOpen ? (
              <View testID="sourceDropdownPanel" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {sourceNames.map((name) => <Action key={name} testID={`sourceOption-${name}`} label={name} primary={source === name} onPress={() => { setSource(name); setSourcesOpen(false); }} />)}
              </View>
            ) : null}

            {error ? (
              <View style={{ padding: 16, backgroundColor: C.dangerSoft, borderRadius: Radius.md, marginBottom: 18, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontFamily: Sans.regular, fontSize: 13, color: C.text, lineHeight: 21 }}>{error}</Text>
                <View style={{ alignSelf: 'flex-start', marginTop: 10 }}><Action label="Thử lại" onPress={refresh} /></View>
              </View>
            ) : null}

            {hero ? (
              <TouchableOpacity onPress={() => open(hero)} activeOpacity={0.88} style={{ backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.xl, overflow: 'hidden', marginBottom: 18, flexDirection: desktop ? 'row' : 'column' }}>
                <View style={{ flex: desktop ? 1.2 : undefined, height: desktop ? 350 : 230, backgroundColor: C.surfaceAlt }}>
                  {hero.image ? <Image source={{ uri: hero.image }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
                </View>
                <View style={{ flex: 1, padding: desktop ? 28 : 20, justifyContent: 'center' }}>
                  <Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 11, letterSpacing: 1.1, marginBottom: 12 }}>{(hero.category || 'ĐÁNG CHÚ Ý').toUpperCase()}</Text>
                  <Text numberOfLines={4} style={{ fontFamily: Sans.bold, color: C.text, fontSize: desktop ? 26 : 22, lineHeight: desktop ? 35 : 30, letterSpacing: -0.5 }}>{hero.title}</Text>
                  <Text numberOfLines={2} style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 13, lineHeight: 21, marginTop: 13 }}>{hero.description || 'Mở bài để xem tóm tắt và nội dung nguồn.'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18 }}>
                    <Text style={{ fontFamily: Sans.medium, fontSize: 11, color: C.textSecondary }}>{hero.source}</Text>
                    <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: C.textMuted }} />
                    <Text style={{ fontFamily: Sans.medium, fontSize: 11, color: C.hot }}>Đọc bài →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : null}

            {!query && visible.length > 0 ? (
              <View style={{ backgroundColor: C.navy, borderRadius: Radius.xl, padding: desktop ? 24 : 20, marginBottom: 30 }}>
                <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 20, alignItems: desktop ? 'center' : 'stretch' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Sans.bold, color: '#F59A70', fontSize: 11, letterSpacing: 1 }}>5 PHÚT NẮM TIN</Text>
                    <Text style={{ fontFamily: Sans.bold, color: '#fff', fontSize: 21, marginTop: 8 }}>Điều đáng biết lúc này</Text>
                    <View style={{ marginTop: 14, gap: 10 }}>
                      {visible.slice(0, 3).map((item) => (
                        <View key={item.link} style={{ flexDirection: 'row', gap: 9 }}>
                          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.hot, marginTop: 7 }} />
                          <Text numberOfLines={2} style={{ flex: 1, fontFamily: Sans.regular, color: '#CFD6E1', fontSize: 12, lineHeight: 19 }}>{item.title}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={{ minWidth: desktop ? 185 : undefined }}><Action label="Nghe bản tin" icon="headset-outline" primary onPress={() => navigation.navigate('Briefing')} /></View>
                </View>
              </View>
            ) : null}

            <SectionTitle title={query ? 'Kết quả tìm kiếm' : 'Dòng tin mới'} subtitle={`${visible.length} bài viết`} />
          </>
        }
        ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Đang tải" color={C.hot} size="large" /> : !hero ? <View accessibilityLabel="Không có bài báo"><Empty title="Chưa tìm thấy bài viết" subtitle="Thử đổi từ khóa hoặc bộ lọc nguồn tin." icon="search-outline" action={<Action label="Bỏ bộ lọc" onPress={() => { setQuery(''); setCategory('Tất cả'); setSource('Tất cả nguồn'); }} />} /></View> : null}
      />
    </View>
  );
}
