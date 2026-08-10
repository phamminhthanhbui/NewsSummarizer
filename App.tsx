import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Color, Font } from "./src/constants/theme";
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
  const { onPress, onLongPress, accessibilityState, accessibilityRole, accessibilityLabel, testID, style, children } = props;
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
      {focused ? <View style={s.activeDot} /> : null}
      {children}
    </Pressable>
  );
}

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
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Color.primary,
          tabBarInactiveTintColor: Color.textMuted,
          tabBarButton: (props) => <TabBarBtn {...props} />,
          tabBarStyle: {
            backgroundColor: Color.card,
            borderTopColor: Color.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: 58,
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
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
