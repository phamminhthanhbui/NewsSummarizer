import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, ActivityIndicator, StyleSheet, Linking, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useTheme, Sans, Layout, Radius } from './src/constants/theme';
import { AlertProvider, useAlert } from './src/components/AppAlert';
import { AuthProvider, useAuth } from './src/providers/AuthProvider';
import { displayName } from './src/services/auth';
import * as NotificationsService from './src/services/notifications';
import { readFeedsCache } from './src/services/feeds';
import { clearRetiredSummarySettings } from './src/services/storage';
import HomeScreen from './src/screens/HomeScreen';
import ArticleScreen from './src/screens/ArticleScreen';
import SavedScreen from './src/screens/SavedScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { BriefingScreen, PlayerScreen, SourcesScreen, AccountScreen, PlansScreen, SubscriptionScreen, FeedbackScreen } from './src/screens/ProductScreens';
import { LoginScreen, RegisterScreen, ForgotPasswordScreen, ResetPasswordScreen } from './src/screens/AuthScreens';

const ref = createNavigationContainerRef<any>();
const Stack = createNativeStackNavigator();
const Home = createNativeStackNavigator();
const Library = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeStack() {
  return (
    <Home.Navigator screenOptions={{ headerShown: false }}>
      <Home.Screen name="HomeMain" component={HomeScreen} />
      <Home.Screen name="Article" component={ArticleScreen} />
    </Home.Navigator>
  );
}

function LibraryStack() {
  return (
    <Library.Navigator screenOptions={{ headerShown: false }}>
      <Library.Screen name="Saved" component={SavedScreen} />
      <Library.Screen name="History" component={HistoryScreen} />
    </Library.Navigator>
  );
}

const NAV = [
  { label: 'Hôm nay', icon: 'newspaper-outline' },
  { label: 'Khám phá', icon: 'compass-outline' },
  { label: 'Bản tin', icon: 'headset-outline' },
  { label: 'Thư viện', icon: 'bookmark-outline' },
  { label: 'Cài đặt', icon: 'settings-outline' },
] as const;

function NavigationBar({ state, navigation }: any) {
  const C = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  if (!desktop) {
    return (
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          backgroundColor: C.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: C.border,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingHorizontal: 5,
          minHeight: 72 + Math.max(insets.bottom, 0),
        }}
      >
        {state.routes.map((route: any, i: number) => {
          const active = state.index === i;
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={NAV[i].label}
              activeOpacity={0.75}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 5 }}
            >
              <View style={{ width: 38, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? C.hotSoft : 'transparent' }}>
                <Ionicons name={NAV[i].icon as any} size={20} color={active ? C.hot : C.textMuted} />
              </View>
              <Text style={{ fontFamily: active ? Sans.bold : Sans.medium, fontSize: 9, color: active ? C.hot : C.textMuted }}>{NAV[i].label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: Layout.sidebar,
        backgroundColor: C.navy,
        paddingTop: 30,
        paddingBottom: 24,
        paddingHorizontal: 18,
      }}
    >
      <View style={{ paddingHorizontal: 10, marginBottom: 36 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: C.hot, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={17} color="#fff" />
          </View>
          <View>
            <Text style={{ fontFamily: Sans.bold, color: '#fff', fontSize: 16, letterSpacing: -0.4 }}>news summarizer</Text>
            <Text style={{ fontFamily: Sans.regular, color: '#93A0B7', fontSize: 9, marginTop: 3, letterSpacing: 0.7 }}>SIGNAL EDITORIAL</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 5 }}>
        {state.routes.map((route: any, i: number) => {
          const active = state.index === i;
          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={NAV[i].label}
              activeOpacity={0.78}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!active && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 13,
                borderRadius: 12,
                backgroundColor: active ? 'rgba(255,255,255,0.105)' : 'transparent',
              }}
            >
              <Ionicons name={NAV[i].icon as any} size={20} color={active ? '#fff' : '#94A0B4'} />
              <Text style={{ fontFamily: active ? Sans.bold : Sans.medium, fontSize: 13, color: active ? '#fff' : '#AAB4C5' }}>{NAV[i].label}</Text>
              {active ? <View style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: 3, backgroundColor: C.hot }} /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: 'auto', gap: 12 }}>
        <TouchableOpacity
          onPress={() => navigation.navigate('Plans')}
          activeOpacity={0.82}
          style={{ backgroundColor: 'rgba(255,255,255,0.075)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16, borderRadius: Radius.md }}
        >
          <Text style={{ fontFamily: Sans.bold, color: '#fff', fontSize: 14, marginBottom: 5 }}>NewsSummarizer Plus</Text>
          <Text style={{ fontFamily: Sans.regular, color: '#9EABC0', fontSize: 11, lineHeight: 17 }}>Bản tin cá nhân và trải nghiệm nghe nâng cao.</Text>
          <Text style={{ fontFamily: Sans.bold, color: '#F59A70', fontSize: 11, marginTop: 10 }}>Khám phá →</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Account')} activeOpacity={0.8} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6, paddingVertical: 6 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(243,106,45,.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person-outline" size={17} color="#F59A70" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: Sans.medium, color: '#fff', fontSize: 12 }}>{user ? displayName(user) : 'Chế độ khách'}</Text>
            <Text numberOfLines={1} style={{ fontFamily: Sans.regular, color: '#8795AB', fontSize: 10, marginTop: 2 }}>{user?.email || 'Đăng nhập để đồng bộ quyền lợi'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#8795AB" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Tabs() {
  const { width } = useWindowDimensions();
  return (
    <Tab.Navigator
      tabBar={(props) => <NavigationBar {...props} />}
      screenOptions={{ headerShown: false, tabBarPosition: width >= 1000 ? 'left' : 'bottom' }}
    >
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="Discover" component={HomeScreen} />
      <Tab.Screen name="Briefing" component={BriefingScreen} />
      <Tab.Screen name="Library" component={LibraryStack} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const C = useTheme();
  const { consumeAuthUrl } = useAuth();
  const { showAlert } = useAlert();

  useEffect(() => {
    let alive = true;
    const looksLikeAuthUrl = (url: string) => /[?&#](code|access_token|error_description)=/.test(url)
      || /[?&#]oobCode=/.test(url)
      || /auth=(callback|reset)/.test(url)
      || /\/auth\/(callback|reset)/.test(url);
    // Supabase PKCE links are single-use. Remove the code from the address bar
    // so a reload does not try to exchange it again.
    const cleanAuthUrl = (url: string) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || !looksLikeAuthUrl(url)) return;
      try {
        const parsed = new URL(url);
        window.history.replaceState({}, document.title, `${parsed.origin}/`);
      } catch { /* keep the current URL if it cannot be parsed */ }
    };
    const handle = async (url: string | null) => {
      if (!url) return;
      try {
        const result = await consumeAuthUrl(url);
        if (!alive) return;
        if (result.verified) {
          showAlert({
            type: 'success',
            title: 'Đã xác minh email',
            message: 'Địa chỉ email đã được xác minh. Bạn có thể đăng nhập bằng email và mật khẩu vừa đặt.',
          });
          if (ref.isReady()) ref.navigate('Login');
          return;
        }
        if (!result.recovery) return;
        const openReset = () => {
          if (!alive) return;
          if (ref.isReady()) ref.navigate('ResetPassword');
          else setTimeout(openReset, 100);
        };
        openReset();
      } catch {}
      finally { cleanAuthUrl(url); }
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => { void handle(url); });
    return () => { alive = false; sub.remove(); };
  }, [consumeAuthUrl, showAlert]);
  return (
    <>
      <StatusBar style={C.bg === '#0D1420' ? 'light' : 'dark'} />
      <NavigationContainer ref={ref}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="Main" component={Tabs} />
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="Plans" component={PlansScreen} />
          <Stack.Screen name="Subscription" component={SubscriptionScreen} />
          <Stack.Screen name="Sources" component={SourcesScreen} />
          <Stack.Screen name="Onboarding" component={SourcesScreen} />
          <Stack.Screen name="Feedback" component={FeedbackScreen} />
          <Stack.Screen name="Player" component={PlayerScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  const [fonts, error] = useFonts({
    BeVietnamPro: require('./assets/fonts/BeVietnamPro-Regular.ttf'),
    'BeVietnamPro-Medium': require('./assets/fonts/BeVietnamPro-Medium.ttf'),
    'BeVietnamPro-Bold': require('./assets/fonts/BeVietnamPro-Bold.ttf'),
  });

  useEffect(() => {
    void clearRetiredSummarySettings().catch(() => {});
    NotificationsService.getSettings().then((settings) => {
      if (settings.enabled) void NotificationsService.schedule(settings.times);
    }).catch(() => {});
    return NotificationsService.onNotificationResponse((url) => {
      if (!ref.isReady()) return;
      readFeedsCache().then((items) => {
        const item = items.find((entry) => entry.link === url);
        if (item) ref.navigate('Main', { screen: 'HomeTab', params: { screen: 'Article', params: { item } } });
      }).catch(() => {});
    });
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AlertProvider>
          {fonts || error ? <Root /> : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F6F2' }}>
              <ActivityIndicator color="#F36A2D" />
            </View>
          )}
        </AlertProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
