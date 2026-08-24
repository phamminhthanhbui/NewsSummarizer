import React, { useEffect } from "react";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, View, StyleSheet, Platform } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Color, Font, THEME_COLORS, useTheme } from "./src/constants/theme";
import * as NotificationsService from "./src/services/notifications";
import { readFeedsCache } from "./src/services/feeds";
import { AlertProvider } from "./src/components/AppAlert";

const navigationRef = createNavigationContainerRef<any>();

// Mỗi tab 1 màu chủ đạo riêng (trong 7 màu THEME_COLORS)
const TAB_COLORS: Record<string, string> = {
  HomeTab: THEME_COLORS[0].color,      // Cam
  History: THEME_COLORS[2].color,      // Xanh biển
  Saved: THEME_COLORS[5].color,        // Hồng
  SettingsTab: THEME_COLORS[3].color,  // Tím
};

import HomeScreen from "./src/screens/HomeScreen";
import ArticleScreen from "./src/screens/ArticleScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import SavedScreen from "./src/screens/SavedScreen";
import HistoryScreen from "./src/screens/HistoryScreen";

const HomeStack = createNativeStackNavigator();
function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Article" component={ArticleScreen} />
    </HomeStack.Navigator>
  );
}

function TabBarBtn(props: any) {
  const { onPress, onLongPress, accessibilityState, accessibilityRole, accessibilityLabel, testID, style, children, dotColor } = props;
  const focused = accessibilityState?.selected;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }: any) => [
        s.tabBtn,
        style,
        pressed && { opacity: 0.7 },
      ]}
    >
      {focused ? <View style={[s.activeDot, { backgroundColor: dotColor || Color.primary }]} /> : null}
      {children}
    </Pressable>
  );
}

const tabButton = (color: string) => (props: any) => <TabBarBtn {...props} dotColor={color} />;

const s = StyleSheet.create({
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  activeDot: {
    position: "absolute",
    top: 4,
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: Color.primary,
  },
});

const Tab = createBottomTabNavigator();

export default function App() {
  useEffect(() => {
    NotificationsService.getSettings().then((s) => {
      if (s.enabled) NotificationsService.schedule(s.times);
    });
  }, []);

  useEffect(() => {
    const openArticle = (url: string) => {
      if (!url || !navigationRef.isReady()) return;
      readFeedsCache()
        .then((items) => {
          const item = items.find((i) => i.link === url);
          if (item) navigationRef.navigate("HomeTab", { screen: "Article", params: { item } });
        })
        .catch(() => {});
    };
    return NotificationsService.onNotificationResponse(openArticle);
  }, []);

  return (
    <SafeAreaProvider>
      <AlertProvider>
        <AppTabs navRef={navigationRef} />
      </AlertProvider>
    </SafeAreaProvider>
  );
}

function AppTabs({ navRef }: { navRef: any }) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  
  // Nếu chạy trên Web, ép bottom inset về 0 vì trình duyệt không có thanh Home Indicator
  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;
  const TAB_BAR_HEIGHT = 56;

  return (
    <NavigationContainer ref={navRef}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarInactiveTintColor: C.textMuted,
          tabBarStyle: {
            backgroundColor: C.card,
            borderTopColor: C.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: TAB_BAR_HEIGHT + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 4,
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
          },
          tabBarItemStyle: {
            padding: 0,
            paddingHorizontal: 0,
            paddingVertical: 0,
          },
          tabBarLabelStyle: {
            fontSize: Font.tiny - 2,
            fontWeight: "600",
          },
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackScreen}
          options={{
            tabBarLabel: "Trang chủ",
            tabBarActiveTintColor: TAB_COLORS.HomeTab,
            tabBarButton: tabButton(TAB_COLORS.HomeTab),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? "newspaper" : "newspaper-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarLabel: "Lịch sử",
            tabBarActiveTintColor: TAB_COLORS.History,
            tabBarButton: tabButton(TAB_COLORS.History),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? "time" : "time-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Saved"
          component={SavedScreen}
          options={{
            tabBarLabel: "Đã lưu",
            tabBarActiveTintColor: TAB_COLORS.Saved,
            tabBarButton: tabButton(TAB_COLORS.Saved),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? "heart" : "heart-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="SettingsTab"
          component={SettingsScreen}
          options={{
            tabBarLabel: "Cài đặt",
            tabBarActiveTintColor: TAB_COLORS.SettingsTab,
            tabBarButton: tabButton(TAB_COLORS.SettingsTab),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}