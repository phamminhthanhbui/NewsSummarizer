import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Sans, Radius, Layout, Space } from '../constants/theme';

export function Action({ label, onPress, primary = false, icon, disabled = false, testID, danger = false }: any) {
  const C = useTheme();
  const bg = primary ? C.hot : C.card;
  const fg = primary ? '#fff' : danger ? C.danger : C.text;
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.78}
      style={{
        backgroundColor: bg,
        borderWidth: primary ? 0 : 1,
        borderColor: danger ? C.dangerSoft : C.border,
        paddingHorizontal: 16,
        paddingVertical: 11,
        borderRadius: Radius.sm,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
        minHeight: 44,
      }}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontFamily: Sans.medium, color: fg, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconButton({ icon, onPress, label, active = false }: any) {
  const C = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: 42,
        height: 42,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? C.hotSoft : C.card,
        borderWidth: 1,
        borderColor: active ? C.hotSoft : C.border,
      }}
    >
      <Ionicons name={icon} size={20} color={active ? C.hot : C.textSecondary} />
    </TouchableOpacity>
  );
}

export function ScreenHeader({ title, navigation, back = false, action, subtitle }: any) {
  const C = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  return (
    <View
      style={{
        paddingTop: desktop ? 22 : insets.top + 10,
        paddingBottom: 16,
        paddingHorizontal: desktop ? 30 : 18,
        backgroundColor: C.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: C.border,
      }}
    >
      {back ? (
        <IconButton icon="arrow-back" label="Quay lại" onPress={() => navigation.goBack()} />
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: C.text, fontFamily: Sans.bold, fontSize: desktop ? 20 : 18 }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ color: C.textMuted, fontFamily: Sans.regular, fontSize: 11, marginTop: 3 }}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Page({ title, navigation, children, back = true, maxWidth = 920 }: any) {
  const C = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScreenHeader title={title} navigation={navigation} back={back} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 48, width: '100%', maxWidth, alignSelf: 'center' }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Heading({ eyebrow, title, subtitle }: any) {
  const C = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  return (
    <View style={{ marginTop: 6, marginBottom: 26 }}>
      {eyebrow ? <Text style={{ color: C.hot, fontFamily: Sans.bold, fontSize: 11, letterSpacing: 1.2, marginBottom: 10 }}>{eyebrow}</Text> : null}
      <Text style={{ fontFamily: Sans.bold, fontSize: desktop ? 34 : 28, lineHeight: desktop ? 43 : 37, color: C.text, letterSpacing: -0.8 }}>{title}</Text>
      {subtitle ? <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 14, lineHeight: 23, marginTop: 10, maxWidth: 680 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function Panel({ children, dark = false, style }: any) {
  const C = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: dark ? C.navy : C.card,
          borderWidth: dark ? 0 : 1,
          borderColor: C.border,
          borderRadius: Radius.lg,
          padding: 20,
          marginBottom: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ title, subtitle, action }: any) {
  const C = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: Sans.bold, fontSize: 20, color: C.text }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: Sans.regular, fontSize: 12, color: C.textMuted, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Empty({ title, subtitle, icon = 'bookmark-outline', action }: any) {
  const C = useTheme();
  return (
    <View style={{ padding: 28, paddingTop: 60, alignItems: 'center', gap: 13 }}>
      <View style={{ width: 72, height: 72, backgroundColor: C.hotSoft, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={30} color={C.hot} />
      </View>
      <Text style={{ fontFamily: Sans.bold, color: C.text, fontSize: 20, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 13, lineHeight: 21, textAlign: 'center', maxWidth: 380 }}>{subtitle}</Text>
      {action}
    </View>
  );
}

export function LibraryTabs({ active, navigation }: any) {
  const C = useTheme();
  return (
    <View style={{ paddingHorizontal: 18, paddingBottom: 2, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: C.surfaceAlt, maxWidth: 340 }}>
        {['Saved', 'History'].map((name, i) => {
          const selected = active === name;
          return (
            <TouchableOpacity
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => navigation.navigate(name)}
              style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 11, backgroundColor: selected ? C.card : 'transparent', alignItems: 'center' }}
            >
              <Text style={{ fontFamily: selected ? Sans.bold : Sans.medium, fontSize: 13, color: selected ? C.text : C.textMuted }}>{i ? 'Lịch sử' : 'Đã lưu'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function Wave() {
  return (
    <View accessibilityElementsHidden style={{ flexDirection: 'row', gap: 4, alignItems: 'center', height: 44, marginVertical: 18 }}>
      {[14, 26, 20, 38, 28, 43, 18, 32, 25, 39, 22, 14, 30, 42, 24, 35, 16, 29, 40, 22, 15, 31, 20, 37, 18].map((h, i) => (
        <View key={i} style={{ height: h, width: 4, borderRadius: 3, backgroundColor: '#F58B5B' }} />
      ))}
    </View>
  );
}

export const shellContentStyle = { width: '100%', maxWidth: Layout.content, alignSelf: 'center', paddingHorizontal: Space.lg } as const;
