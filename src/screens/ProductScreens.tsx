import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput, StyleSheet, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Sans, Color, Radius } from '../constants/theme';
import { Page, Heading, Panel, Action, Empty, Wave, SectionTitle } from '../components/PremiumUI';
import { readFeedsCache, fetchAllFeeds, FEEDS } from '../services/feeds';
import { getPreferences, savePreferences } from '../services/preferences';
import { KEYS } from '../services/storage';
import { speakSystem, stopSystem, clearVoiceHung } from '../services/edgeTts';
import { buildWordMap } from '../services/wordMap';
import { buildTtsChunks } from '../services/ttsChunks';
import type { FeedItem, SummaryRecord } from '../types';
import { isCurrentRuleSummary, buildRuleSummary } from '../services/ruleSummary';
import { useAuth } from '../providers/AuthProvider';
import { displayName } from '../services/auth';
import { getStorePlans, getSubscriptionState, purchasePlan, purchaseWasCancelled, restorePurchases, type StorePlan, type SubscriptionState } from '../services/subscription';

type Palette = typeof Color;

function Copy({ children, muted = false, style }: any) {
  const C = useTheme();
  return <Text style={[{ fontFamily: Sans.regular, fontSize: 13, lineHeight: 22, color: muted ? C.textMuted : C.text }, style]}>{children}</Text>;
}

function StoryRow({ item, index, onPress }: { item: FeedItem; index: number; onPress: () => void }) {
  const C = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ flexDirection: 'row', gap: 13, paddingVertical: 15, borderBottomWidth: 1, borderColor: C.border }}>
      <Text style={{ width: 30, fontFamily: Sans.bold, fontSize: 19, color: index < 3 ? C.hot : C.border }}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 15, lineHeight: 22 }}>{item.title}</Text>
        <Text numberOfLines={2} style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 11, lineHeight: 17, marginTop: 6 }}>{item.description || item.source}</Text>
        <Text style={{ fontFamily: Sans.medium, color: C.hot, fontSize: 10, marginTop: 7 }}>{item.source} · Mở bài →</Text>
      </View>
    </TouchableOpacity>
  );
}

export function BriefingScreen({ navigation }: any) {
  const C = useTheme();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [summaries, setSummaries] = useState<SummaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(5);
  const [plus, setPlus] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getSubscriptionState().then((state) => { if (alive) setPlus(state.active); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const [cached, preferences, raw] = await Promise.all([readFeedsCache(), getPreferences(), AsyncStorage.getItem(KEYS.history)]);
        const feeds = cached.length ? cached : await fetchAllFeeds();
        if (!alive) return;
        setItems(feeds.filter((item) =>
          item.category !== 'Video' &&
          (!preferences.sources.length || preferences.sources.includes(item.source)) &&
          (!preferences.categories.length || preferences.categories.includes(item.category || ''))
        ).slice(0, 8));
        setSummaries(raw ? JSON.parse(raw) : []);
      } catch {
        // Empty state handles an unavailable feed.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []));

  const count = minutes === 5 ? 3 : minutes === 10 ? 5 : 8;
  const selected = items.slice(0, count);
  const queue = selected.map((item) => ({
    title: item.title,
    text: summaries.find((summary) => summary.url === item.link && isCurrentRuleSummary(summary))?.summary || buildRuleSummary(item.description || '', item.title) || item.title,
    source: item.source,
  }));

  return (
    <Page title="Bản tin" navigation={navigation} back={false} maxWidth={980}>
      <Heading eyebrow="BẢN TIN CỦA BẠN" title="Tin mới, theo nhịp của bạn." subtitle="Một bản nghe ngắn từ các nguồn bạn theo dõi. Nội dung dùng câu chọn từ bài hoặc mô tả RSS đã có — không dùng AI tạo nội dung." />

      <View style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 999, backgroundColor: C.surfaceAlt, marginBottom: 18 }}>
        {[5, 10, 15].map((value) => {
          const active = minutes === value;
          return (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${value} phút${value > 5 && !plus ? ' · Plus' : ''}`} accessibilityState={{ selected: active }} key={value} onPress={() => { if (value > 5 && !plus) navigation.navigate('Plans'); else setMinutes(value); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: active ? C.card : 'transparent' }}>
              <Text style={{ fontFamily: active ? Sans.bold : Sans.medium, fontSize: 12, color: active ? C.text : C.textMuted }}>{value} phút</Text>{value > 5 && !plus ? <Ionicons name="lock-closed" size={11} color={C.textMuted} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <Panel dark style={{ padding: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(243,106,45,.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="headset" size={22} color="#F59A70" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Sans.bold, fontSize: 23, color: '#fff', lineHeight: 31 }}>Nắm bắt điều quan trọng.</Text>
            <Text style={{ fontFamily: Sans.regular, fontSize: 12, color: '#AEB8C8', lineHeight: 19, marginTop: 5 }}>{queue.length} câu chuyện · khoảng {minutes} phút</Text>
          </View>
        </View>
        <Wave />
        <Action label="Nghe bản tin" primary icon="play" disabled={!queue.length} onPress={() => navigation.navigate('Player', { queue })} />
      </Panel>

      {loading ? <ActivityIndicator color={C.hot} style={{ marginVertical: 30 }} /> : selected.length ? (
        <>
          <SectionTitle title="Cần biết" subtitle="Những câu chuyện đáng chú ý nhất lúc này" />
          <Panel style={{ paddingVertical: 2 }}>
            {selected.slice(0, Math.min(3, selected.length)).map((item, index) => (
              <StoryRow key={item.link} item={item} index={index} onPress={() => navigation.navigate('HomeTab', { screen: 'Article', params: { item } })} />
            ))}
          </Panel>

          {selected.length > 3 ? (
            <>
              <SectionTitle title="Theo dõi tiếp" subtitle="Các diễn biến khác trong bản tin của bạn" />
              <Panel style={{ paddingVertical: 2 }}>
                {selected.slice(3).map((item, index) => (
                  <StoryRow key={item.link} item={item} index={index + 3} onPress={() => navigation.navigate('HomeTab', { screen: 'Article', params: { item } })} />
                ))}
              </Panel>
            </>
          ) : null}
        </>
      ) : <Empty title="Chưa có bản tin" subtitle="Làm mới trang Hôm nay hoặc chọn thêm nguồn tin để tạo bản tin của bạn." icon="headset-outline" />}

      <View style={{ alignSelf: 'flex-start' }}><Action label="Tùy chỉnh nguồn tin" icon="options-outline" onPress={() => navigation.navigate('Sources')} /></View>
    </Page>
  );
}

export function PlayerScreen({ navigation, route }: any) {
  const queue = route.params?.queue || [];
  const C = useTheme();
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const session = useRef(0);
  const alive = useRef(true);

  useEffect(() => () => {
    alive.current = false;
    session.current++;
    stopSystem();
  }, []);

  const stop = () => {
    session.current++;
    stopSystem();
    setPlaying(false);
  };

  const play = async () => {
    const id = ++session.current;
    clearVoiceHung();
    setPlaying(true);
    setError('');
    try {
      const raw = await AsyncStorage.multiGet([KEYS.pitch, KEYS.rate]);
      const pitch = Number(raw[0][1] || 1);
      const rate = Number(raw[1][1] || 1);
      for (let i = index; i < queue.length; i++) {
        if (id !== session.current) break;
        setIndex(i);
        const chunks = buildTtsChunks(buildWordMap(`${queue[i].title}. ${queue[i].text}`).paras);
        for (const chunk of chunks) {
          if (id !== session.current) break;
          await speakSystem(chunk.text, { pitch, rate });
        }
      }
    } catch {
      if (alive.current && id === session.current) setError('Không thể đọc lúc này. Hãy kiểm tra giọng đọc trong Cài đặt.');
    } finally {
      if (alive.current && id === session.current) setPlaying(false);
    }
  };

  const progress = queue.length ? ((index + 1) / queue.length) * 100 : 0;

  return (
    <Page title="Trình nghe" navigation={navigation} maxWidth={760}>
      <Panel dark style={{ padding: 26 }}>
        <Text style={{ fontFamily: Sans.bold, fontSize: 10, letterSpacing: 1.2, color: '#F59A70' }}>ĐANG NGHE · BẢN TIN</Text>
        <Text style={{ fontFamily: Sans.bold, fontSize: 24, lineHeight: 33, color: '#fff', marginTop: 14 }}>{queue[index]?.title || 'Chưa có nội dung nghe'}</Text>
        <Text style={{ fontFamily: Sans.regular, color: '#AEB8C8', fontSize: 12, marginTop: 8 }}>{queue[index]?.source || 'NewsSummarizer'}</Text>
        <Wave />
        <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
          <View style={{ width: `${progress}%`, height: '100%', backgroundColor: C.hot }} />
        </View>
        <Text style={{ fontFamily: Sans.regular, color: '#8F9CB0', fontSize: 10 }}>Tin {queue.length ? index + 1 : 0} / {queue.length}</Text>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 22 }}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tin trước" disabled={index === 0} onPress={() => { stop(); setIndex((value) => value - 1); }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center', opacity: index === 0 ? .35 : 1 }}>
            <Ionicons name="play-skip-back" size={19} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={playing ? "Dừng đọc" : "Phát bản tin"} disabled={!queue.length} onPress={playing ? stop : play} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center', paddingLeft: playing ? 0 : 3 }}>
            <Ionicons name={playing ? 'stop' : 'play'} size={27} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tin sau" disabled={index >= queue.length - 1} onPress={() => { stop(); setIndex((value) => value + 1); }} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,.08)', alignItems: 'center', justifyContent: 'center', opacity: index >= queue.length - 1 ? .35 : 1 }}>
            <Ionicons name="play-skip-forward" size={19} color="#fff" />
          </TouchableOpacity>
        </View>
      </Panel>

      {error ? <View style={{ backgroundColor: C.dangerSoft, borderRadius: Radius.md, padding: 14, marginBottom: 18 }}><Copy>{error}</Copy></View> : null}

      <SectionTitle title="Nội dung đang đọc" subtitle="Bản chọn câu từ nguồn đã có" />
      <Panel><Copy style={{ lineHeight: 24 }}>{queue[index]?.text || 'Chưa có transcript.'}</Copy></Panel>
      <Text style={{ fontFamily: Sans.regular, fontSize: 10, color: C.textMuted, textAlign: 'center' }}>Giọng đọc sử dụng công cụ TTS của thiết bị/trình duyệt.</Text>
    </Page>
  );
}

export function SourcesScreen({ navigation, route }: any) {
  const onboarding = route.name === 'Onboarding';
  const C = useTheme();
  const [categories, setCategories] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPreferences().then((preferences) => {
      setCategories(preferences.categories);
      setSources(preferences.sources);
    });
  }, []);

  const toggle = (value: string, values: string[], set: (value: string[]) => void) => {
    set(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
    setSaved(false);
  };

  const optionGrid = (values: string[], selected: string[], set: (value: string[]) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
      {values.map((value) => {
        const active = selected.includes(value);
        return (
          <TouchableOpacity key={value} onPress={() => toggle(value, selected, set)} activeOpacity={0.75} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 999, backgroundColor: active ? C.hotSoft : C.surfaceAlt, borderWidth: 1, borderColor: active ? C.hot : C.border }}>
            {active ? <Ionicons name="checkmark" size={14} color={C.hot} /> : null}
            <Text style={{ fontFamily: active ? Sans.bold : Sans.medium, fontSize: 12, color: active ? C.hot : C.textSecondary }}>{value}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <Page title={onboarding ? 'Chào mừng bạn' : 'Nguồn tin & chủ đề'} navigation={navigation} maxWidth={860}>
      <Heading eyebrow="CÁ NHÂN HÓA" title="Tạo một góc nhìn phù hợp với bạn." subtitle="Không chọn mục nào nghĩa là theo dõi tất cả. Lựa chọn chỉ được lưu trên thiết bị này." />
      <Panel>
        <SectionTitle title="Chủ đề quan tâm" subtitle={`${categories.length || 'Tất cả'} lựa chọn`} />
        {optionGrid([...new Set(FEEDS.map((feed) => feed.category))], categories, setCategories)}
      </Panel>
      <Panel>
        <SectionTitle title="Nguồn tin theo dõi" subtitle={`${sources.length || 'Tất cả'} lựa chọn`} />
        {optionGrid([...new Set(FEEDS.map((feed) => feed.name))], sources, setSources)}
      </Panel>
      <Action label={saved ? 'Đã lưu lựa chọn' : 'Lưu lựa chọn'} icon={saved ? 'checkmark' : 'save-outline'} primary disabled={saved} onPress={async () => {
        try {
          await savePreferences({ categories, sources });
          setSaved(true);
          setError('');
        } catch {
          setError('Chưa lưu được. Vui lòng thử lại.');
        }
      }} />
      {error ? <Text style={{ color: C.danger, fontFamily: Sans.regular, fontSize: 12, marginTop: 12 }}>{error}</Text> : null}
    </Page>
  );
}

function AccountRow({ icon, title, subtitle, onPress, danger = false }: any) {
  const C = useTheme();
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress} activeOpacity={0.76} style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: danger ? C.dangerSoft : C.hotSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={18} color={danger ? C.danger : C.hot} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontFamily: Sans.medium, fontSize: 14, color: danger ? C.danger : C.text }}>{title}</Text><Text style={{ fontFamily: Sans.regular, fontSize: 11, color: C.textMuted, marginTop: 3 }}>{subtitle}</Text></View>
      {onPress ? <Ionicons name="chevron-forward" size={17} color={danger ? C.danger : C.textMuted} /> : null}
    </TouchableOpacity>
  );
}

const EMPTY_SUBSCRIPTION: SubscriptionState = { configured: false, active: false, entitlement: 'plus', managementURL: null, expirationDate: null };
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() || '';
const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL?.trim() || '';

function periodLabel(period: string | null) {
  const labels: Record<string, string> = { P1W: 'Mỗi tuần', P1M: 'Mỗi tháng', P2M: 'Mỗi 2 tháng', P3M: 'Mỗi 3 tháng', P6M: 'Mỗi 6 tháng', P1Y: 'Mỗi năm' };
  return period ? labels[period] || period : 'Theo chu kỳ cửa hàng';
}


export function AccountScreen({ navigation }: any) {
  const C = useTheme();
  const { user, configured, signOut, deleteAccount } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionState>(EMPTY_SUBSCRIPTION);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    getSubscriptionState().then((value) => { if (alive) setSubscription(value); }).catch(() => {});
    return () => { alive = false; };
  }, []));

  const logout = async () => {
    setBusy('logout'); setError('');
    try { await signOut(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể đăng xuất.'); }
    finally { setBusy(''); }
  };

  const removeAccount = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setBusy('delete'); setError('');
    try { await deleteAccount(); navigation.goBack(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể xóa tài khoản.'); }
    finally { setBusy(''); setConfirmDelete(false); }
  };

  const planLabel = subscription.active ? 'PLUS' : 'FREE';
  return (
    <Page title="Tài khoản" navigation={navigation} maxWidth={760}>
      <Panel dark>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 58, height: 58, borderRadius: 19, backgroundColor: 'rgba(243,106,45,.17)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={user ? 'person' : 'person-outline'} size={26} color="#F59A70" /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: Sans.bold, color: '#fff', fontSize: 19 }}>{user ? displayName(user) : 'Bạn đọc'}</Text>
            <Text numberOfLines={1} style={{ fontFamily: Sans.regular, color: '#AEB8C8', fontSize: 11, marginTop: 4 }}>{user?.email || 'Chế độ khách · Đăng nhập để giữ quyền lợi Plus'}</Text>
          </View>
          <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: subscription.active ? 'rgba(243,106,45,.22)' : 'rgba(255,255,255,.08)' }}><Text style={{ fontFamily: Sans.bold, color: subscription.active ? '#F7A47F' : '#DCE1E9', fontSize: 9 }}>{planLabel}</Text></View>
        </View>
      </Panel>

      {!user ? (
        <Panel>
          <Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 17 }}>Giữ quyền lợi trên mọi thiết bị</Text>
          <Copy muted style={{ marginTop: 7, marginBottom: 15 }}>Tạo tài khoản để gắn thuê bao Plus với bạn. App vẫn cho phép đọc tin ở chế độ khách.</Copy>
          <View style={{ gap: 9 }}>
            <Action label="Đăng nhập" icon="log-in-outline" primary onPress={() => navigation.navigate('Login')} />
            <Action label="Tạo tài khoản miễn phí" icon="person-add-outline" onPress={() => navigation.navigate('Register')} />
          </View>
          {!configured ? <Copy muted style={{ marginTop: 12 }}>Máy chủ đăng nhập chưa được cấu hình trong .env.</Copy> : null}
        </Panel>
      ) : (
        <Panel>
          <AccountRow icon="card-outline" title={subscription.active ? 'NewsSummarizer Plus đang hoạt động' : 'Gói miễn phí'} subtitle={subscription.active ? 'Quyền lợi được xác nhận từ cửa hàng ứng dụng' : 'Nâng cấp để mở bản tin dài và quyền lợi cao cấp'} onPress={() => navigation.navigate('Subscription')} />
          <View style={{ height: 1, backgroundColor: C.border }} />
          <AccountRow icon="cloud-done-outline" title="Tài khoản đã kết nối" subtitle="Quyền mua Plus được gắn với tài khoản này" />
        </Panel>
      )}

      <Panel>
        <AccountRow icon="options-outline" title="Nguồn tin & chủ đề" subtitle="Quản lý nội dung bạn theo dõi" onPress={() => navigation.navigate('Sources')} />
        <View style={{ height: 1, backgroundColor: C.border }} />
        <AccountRow icon="shield-checkmark-outline" title="Dữ liệu trên thiết bị" subtitle="Bài lưu và lịch sử hiện vẫn được lưu cục bộ" />
      </Panel>

      <Action label={subscription.active ? 'Quản lý gói Plus' : 'Khám phá NewsSummarizer Plus'} icon="sparkles-outline" primary onPress={() => navigation.navigate(subscription.active ? 'Subscription' : 'Plans')} />

      {user ? <Panel style={{ marginTop: 18 }}>
        <AccountRow icon="log-out-outline" title={busy === 'logout' ? 'Đang đăng xuất...' : 'Đăng xuất'} subtitle="Giữ tài khoản, thoát khỏi thiết bị này" onPress={busy ? undefined : logout} />
        <View style={{ height: 1, backgroundColor: C.border }} />
        <AccountRow danger icon="trash-outline" title={busy === 'delete' ? 'Đang xóa...' : confirmDelete ? 'Bấm lần nữa để xác nhận xóa' : 'Xóa tài khoản'} subtitle={confirmDelete ? 'Thao tác này không thể hoàn tác' : 'Xóa tài khoản đăng nhập; thuê bao cửa hàng cần hủy riêng'} onPress={busy ? undefined : removeAccount} />
        {confirmDelete && subscription.active ? <View style={{ marginTop: 12, padding: 13, borderRadius: Radius.sm, backgroundColor: C.dangerSoft }}>
          <Text style={{ fontFamily: Sans.bold, color: C.danger, fontSize: 12, lineHeight: 19 }}>Plus vẫn có thể tiếp tục gia hạn sau khi xóa tài khoản.</Text>
          <Text style={{ fontFamily: Sans.regular, color: C.textSecondary, fontSize: 11, lineHeight: 18, marginTop: 5 }}>Nếu bạn không muốn bị Apple/Google tính phí kỳ tiếp theo, hãy hủy thuê bao trong cửa hàng trước. Sau đó quay lại và bấm “Xóa tài khoản” lần nữa. Bạn vẫn có thể xóa ngay nếu muốn.</Text>
          {subscription.managementURL ? <View style={{ marginTop: 10 }}><Action label="Quản lý thuê bao trước" icon="open-outline" onPress={() => Linking.openURL(subscription.managementURL!)} /></View> : null}
        </View> : null}
      </Panel> : null}
      {error ? <Text style={{ fontFamily: Sans.regular, color: C.danger, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
    </Page>
  );
}

function PlanOption({ plan, selected, onPress }: { plan: StorePlan; selected: boolean; onPress: () => void }) {
  const C = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={{ borderWidth: 1.5, borderColor: selected ? C.hot : C.border, backgroundColor: selected ? C.hotSoft : C.card, borderRadius: Radius.md, padding: 16, marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selected ? C.hot : C.border, alignItems: 'center', justifyContent: 'center' }}>{selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.hot }} /> : null}</View>
        <View style={{ flex: 1 }}><Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 14 }}>{plan.title}</Text><Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 10, marginTop: 3 }}>{periodLabel(plan.period)}</Text></View>
        <Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 15 }}>{plan.price}</Text>
      </View>
    </TouchableOpacity>
  );
}

export function PlansScreen({ navigation }: any) {
  const C = useTheme();
  const { user } = useAuth();
  const [plans, setPlans] = useState<StorePlan[]>([]);
  const [selected, setSelected] = useState('');
  const [subscription, setSubscription] = useState<SubscriptionState>(EMPTY_SUBSCRIPTION);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const benefits = [
    ['newspaper-outline', 'Bản tin dài 10–15 phút', 'Mở thêm lượng tin trong bản nghe cá nhân hóa.'],
    ['headset-outline', 'Quyền lợi gắn với tài khoản', 'Khôi phục giao dịch khi đổi hoặc cài lại thiết bị.'],
    ['options-outline', 'Nền tảng cho tính năng cao cấp', 'Các quyền lợi Plus mới sẽ dùng cùng một entitlement.'],
  ];

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextPlans, nextState] = await Promise.all([getStorePlans(), getSubscriptionState()]);
      setPlans(nextPlans); setSubscription(nextState);
      setSelected((current) => nextPlans.some((plan) => plan.identifier === current) ? current : (nextPlans[0]?.identifier || ''));
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được thông tin cửa hàng.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const buy = async () => {
    if (!user) { navigation.navigate('Login'); return; }
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const state = await purchasePlan(selected);
      setSubscription(state);
      if (state.active) navigation.navigate('Subscription');
    } catch (e) {
      if (!purchaseWasCancelled(e)) setError(e instanceof Error ? e.message : 'Thanh toán không thành công.');
    } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true); setError('');
    try { setSubscription(await restorePurchases()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không khôi phục được giao dịch.'); }
    finally { setBusy(false); }
  };

  return (
    <Page title="NewsSummarizer Plus" navigation={navigation} maxWidth={900}>
      <Heading eyebrow="PLUS" title="Ít nhiễu hơn. Nhiều điều đáng biết hơn." subtitle="Thanh toán Plus dùng hệ thống mua hàng của Apple App Store hoặc Google Play. NewsSummarizer không tự lưu thông tin thẻ." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        {benefits.map(([icon, title, subtitle]) => <View key={title} style={{ minWidth: 220, flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: Radius.md, padding: 18 }}><View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.hotSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Ionicons name={icon as any} size={19} color={C.hot} /></View><Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 15 }}>{title}</Text><Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 11, lineHeight: 18, marginTop: 7 }}>{subtitle}</Text></View>)}
      </View>

      <Panel dark>
        <Text style={{ fontFamily: Sans.bold, color: '#F59A70', fontSize: 10, letterSpacing: 1 }}>NEWS SUMMARIZER PLUS</Text>
        <Text style={{ fontFamily: Sans.bold, color: '#fff', fontSize: 24, marginTop: 10 }}>{subscription.active ? 'Plus đang hoạt động' : 'Chọn gói phù hợp với bạn'}</Text>
        <Text style={{ fontFamily: Sans.regular, color: '#AEB8C8', lineHeight: 22, fontSize: 12, marginVertical: 14 }}>{subscription.active ? 'Tài khoản này đã có entitlement Plus đang hoạt động.' : user ? 'Giá bên dưới được lấy trực tiếp từ cửa hàng trên thiết bị.' : 'Đăng nhập trước khi mua để quyền lợi gắn với tài khoản và dễ khôi phục.'}</Text>
      </Panel>

      {loading ? <ActivityIndicator color={C.hot} style={{ marginVertical: 22 }} /> : subscription.active ? (
        <Action label="Xem trạng thái thuê bao" icon="checkmark-circle-outline" primary onPress={() => navigation.navigate('Subscription')} />
      ) : !subscription.configured ? (
        <Panel><Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 15 }}>Chưa kết nối cửa hàng</Text><Copy muted style={{ marginTop: 7 }}>Thêm RevenueCat iOS/Android public SDK key vào .env và cấu hình Offering để bật mua thật. Trên web, thanh toán App Store/Google Play không được hiển thị.</Copy></Panel>
      ) : plans.length ? (
        <Panel>
          {plans.map((plan) => <PlanOption key={plan.identifier} plan={plan} selected={selected === plan.identifier} onPress={() => setSelected(plan.identifier)} />)}
          {error ? <Text style={{ color: C.danger, fontFamily: Sans.regular, fontSize: 12, marginBottom: 10 }}>{error}</Text> : null}
          <Action label={!user ? 'Đăng nhập để mua' : busy ? 'Đang xử lý...' : 'Tiếp tục với cửa hàng'} icon="card-outline" primary disabled={busy} onPress={buy} />
        </Panel>
      ) : <Panel><Copy muted>RevenueCat đã kết nối nhưng chưa có Offering/package khả dụng cho ứng dụng này.</Copy></Panel>}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
        {subscription.configured ? <Action label={busy ? 'Đang khôi phục...' : 'Khôi phục giao dịch'} icon="refresh-outline" disabled={busy} onPress={restore} /> : null}
        <Action label="Trạng thái gói" onPress={() => navigation.navigate('Subscription')} />
      </View>
      <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 10, lineHeight: 17, marginTop: 18 }}>Thuê bao tự động gia hạn theo chu kỳ hiển thị trừ khi bạn hủy trong tài khoản Apple/Google. Giá và đơn vị tiền tệ được lấy trực tiếp từ cửa hàng trên thiết bị.</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
        {TERMS_URL ? <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}><Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 10 }}>Điều khoản sử dụng</Text></TouchableOpacity> : null}
        {PRIVACY_URL ? <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}><Text style={{ fontFamily: Sans.bold, color: C.hot, fontSize: 10 }}>Chính sách quyền riêng tư</Text></TouchableOpacity> : null}
      </View>
    </Page>
  );
}

export function SubscriptionScreen({ navigation }: any) {
  const C = useTheme();
  const { user } = useAuth();
  const [state, setState] = useState<SubscriptionState>(EMPTY_SUBSCRIPTION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let alive = true; setLoading(true);
    getSubscriptionState().then((value) => { if (alive) setState(value); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Không đọc được trạng thái gói.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []));
  return (
    <Page title="Gói của bạn" navigation={navigation} maxWidth={680}>
      {loading ? <ActivityIndicator color={C.hot} style={{ marginVertical: 40 }} /> : <Panel>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: state.active ? C.successSoft : C.hotSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><Ionicons name={state.active ? 'checkmark-circle' : 'checkmark-circle-outline'} size={22} color={state.active ? C.success : C.hot} /></View>
        <Text style={{ fontFamily: Sans.bold, fontSize: 22, color: C.text }}>{state.active ? 'NewsSummarizer Plus đang hoạt động.' : 'Bạn đang dùng gói miễn phí.'}</Text>
        <Copy muted style={{ marginTop: 9 }}>{state.active ? `Quyền lợi được xác nhận bởi cửa hàng${state.expirationDate ? ` · hết hạn/gia hạn: ${new Date(state.expirationDate).toLocaleDateString('vi-VN')}` : ''}.` : state.configured ? 'Không có entitlement Plus đang hoạt động cho người dùng hiện tại.' : 'Cửa hàng chưa được cấu hình trên bản build này.'}</Copy>
        {user ? <Copy muted style={{ marginTop: 5 }}>Tài khoản: {user.email}</Copy> : null}
      </Panel>}
      {error ? <Text style={{ color: C.danger, fontFamily: Sans.regular, fontSize: 12, marginBottom: 12 }}>{error}</Text> : null}
      <View style={{ gap: 10 }}>
        {state.managementURL ? <Action label="Quản lý thuê bao trên cửa hàng" icon="open-outline" primary onPress={() => Linking.openURL(state.managementURL!)} /> : <Action label="Xem gói Plus" icon="sparkles-outline" primary onPress={() => navigation.navigate('Plans')} />}
        {state.configured ? <Action label="Khôi phục giao dịch" icon="refresh-outline" onPress={async () => { try { setState(await restorePurchases()); } catch (e) { setError(e instanceof Error ? e.message : 'Không khôi phục được giao dịch.'); } }} /> : null}
      </View>
    </Page>
  );
}

export function FeedbackScreen({ navigation, route }: any) {
  const C = useTheme();
  const [reason, setReason] = useState('Thiếu thông tin');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const reasons = ['Thiếu thông tin', 'Thông tin chưa chính xác', 'Khó đọc'];

  return (
    <Page title="Góp ý" navigation={navigation} maxWidth={680}>
      <Heading title="Giúp trải nghiệm tốt hơn." subtitle="Góp ý hiện chỉ được lưu trên thiết bị này; chưa gửi tới đội hỗ trợ hoặc dịch vụ bên ngoài." />
      <Panel>
        <Text style={{ fontFamily: Sans.bold, fontSize: 12, color: C.text, marginBottom: 12 }}>Bạn muốn góp ý điều gì?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {reasons.map((value) => {
            const active = reason === value;
            return (
              <TouchableOpacity key={value} onPress={() => { setReason(value); setSaved(false); }} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, backgroundColor: active ? C.hotSoft : C.surfaceAlt, borderWidth: 1, borderColor: active ? C.hot : C.border }}>
                <Text style={{ fontFamily: active ? Sans.bold : Sans.medium, fontSize: 11, color: active ? C.hot : C.textSecondary }}>{value}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput multiline placeholder="Mô tả thêm (không bắt buộc)" placeholderTextColor={C.textMuted} value={note} onChangeText={(value) => { setNote(value); setSaved(false); }} style={{ backgroundColor: C.surfaceAlt, color: C.text, fontFamily: Sans.regular, fontSize: 13, lineHeight: 21, padding: 14, minHeight: 130, borderRadius: 13, marginTop: 16, textAlignVertical: 'top' }} />
      </Panel>
      <Action label={saved ? 'Đã lưu góp ý trên thiết bị' : 'Lưu góp ý'} icon={saved ? 'checkmark' : 'save-outline'} primary disabled={saved} onPress={async () => {
        try {
          const raw = await AsyncStorage.getItem('@summary_feedback');
          const rows = raw ? JSON.parse(raw) : [];
          await AsyncStorage.setItem('@summary_feedback', JSON.stringify([{ url: route.params?.url, reason, note, date: new Date().toISOString() }, ...rows].slice(0, 100)));
          setSaved(true);
          setError('');
        } catch {
          setError('Chưa lưu được góp ý.');
        }
      }} />
      {error ? <Text style={{ fontFamily: Sans.regular, color: C.danger, fontSize: 12, marginTop: 10 }}>{error}</Text> : null}
    </Page>
  );
}

const styles = StyleSheet.create({});
void styles;
