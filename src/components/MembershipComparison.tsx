import React from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Sans, Radius } from '../constants/theme';

type Props = {
  plusActive: boolean;
  signedIn: boolean;
  onFreePress?: () => void;
  onPlusPress?: () => void;
  compact?: boolean;
};

function Feature({ label, accent = false }: { label: string; accent?: boolean }) {
  const C = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 11 }}>
      <Ionicons name="checkmark-circle" size={17} color={accent ? C.hot : C.success} style={{ marginTop: 1 }} />
      <Text style={{ fontFamily: Sans.regular, color: C.textSecondary, fontSize: 12, lineHeight: 19, flex: 1 }}>{label}</Text>
    </View>
  );
}

/** Free/Plus comparison shown in Settings and on the Plus screen.
 * No local "premium" switch: only RevenueCat's entitlement grants Plus.
 */
export default function MembershipComparison({ plusActive, signedIn, onFreePress, onPlusPress, compact = false }: Props) {
  const C = useTheme();
  const { width } = useWindowDimensions();
  const sideBySide = width >= 760;

  return (
    <View style={{ flexDirection: sideBySide ? 'row' : 'column', gap: 12, marginBottom: 20 }}>
      <TouchableOpacity
        testID="membership-free-card"
        accessibilityRole={onFreePress ? 'button' : undefined}
        accessibilityLabel={onFreePress ? (signedIn ? 'Xem tài khoản Free' : 'Tạo tài khoản Free') : undefined}
        disabled={!onFreePress}
        onPress={onFreePress}
        activeOpacity={0.8}
        style={{ flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: Radius.lg, padding: 18, backgroundColor: C.card }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person-outline" size={19} color={C.textSecondary} />
          </View>
          {!plusActive ? <Text style={{ fontFamily: Sans.bold, fontSize: 10, color: C.success }}>{signedIn ? 'ĐANG SỬ DỤNG' : 'ĐỌC MIỄN PHÍ'}</Text> : null}
        </View>
        <Text style={{ fontFamily: Sans.bold, fontSize: 20, color: C.text, marginTop: 13 }}>Tài khoản Free</Text>
        <Text style={{ fontFamily: Sans.bold, fontSize: 17, color: C.text, marginTop: 5 }}>Miễn phí</Text>
        <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 11, lineHeight: 18, marginTop: 5 }}>Đọc tin không cần thanh toán.</Text>
        {compact ? <Text style={{ fontFamily: Sans.regular, color: C.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 12, marginBottom: 14 }}>Đọc tin, lưu bài và nghe bản tin 5 phút.</Text> : (
          <View style={{ marginTop: 4, marginBottom: 14 }}>
            <Feature label="Đọc, khám phá và lưu bài viết" />
            <Feature label="Nghe bản tin 5 phút" />
            <Feature label="Chọn nguồn tin và chủ đề" />
          </View>
        )}
        {onFreePress ? <View style={{ borderRadius: Radius.sm, backgroundColor: C.surfaceAlt, paddingVertical: 11, paddingHorizontal: 9, alignItems: 'center' }}>
          <Text style={{ fontFamily: Sans.bold, fontSize: 12, color: C.text }}>{signedIn ? 'Xem tài khoản' : 'Tạo tài khoản miễn phí →'}</Text>
        </View> : null}
      </TouchableOpacity>

      <TouchableOpacity
        testID="membership-plus-card"
        accessibilityRole={onPlusPress ? 'button' : undefined}
        accessibilityLabel={onPlusPress ? 'Xem gói NewsSummarizer Plus' : undefined}
        disabled={!onPlusPress}
        onPress={onPlusPress}
        activeOpacity={0.8}
        style={{ flex: 1, borderWidth: 1.5, borderColor: C.hot, borderRadius: Radius.lg, padding: 18, backgroundColor: C.card }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.hotSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="sparkles" size={19} color={C.hot} />
          </View>
          <Text style={{ fontFamily: Sans.bold, fontSize: 10, color: C.hot }}>{plusActive ? 'ĐANG HOẠT ĐỘNG' : 'NÂNG CẤP'}</Text>
        </View>
        <Text style={{ fontFamily: Sans.bold, fontSize: 20, color: C.text, marginTop: 13 }}>NewsSummarizer Plus</Text>
        <Text style={{ fontFamily: Sans.medium, fontSize: 12, color: C.hot, marginTop: 7 }}>Giá hiển thị trên App Store / Google Play</Text>
        <Text style={{ fontFamily: Sans.regular, color: C.textMuted, fontSize: 11, lineHeight: 18, marginTop: 5 }}>Thuê bao tự động gia hạn khi mua thành công.</Text>
        {compact ? <Text style={{ fontFamily: Sans.regular, color: C.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 12, marginBottom: 14 }}>Bản tin 10–15 phút và quyền lợi Plus theo tài khoản.</Text> : (
          <View style={{ marginTop: 4, marginBottom: 14 }}>
            <Feature label="Toàn bộ quyền lợi Free" accent />
            <Feature label="Mở bản tin dài 10 và 15 phút" accent />
            <Feature label="Khôi phục quyền lợi Plus khi đổi thiết bị" accent />
          </View>
        )}
        {onPlusPress ? <View style={{ borderRadius: Radius.sm, backgroundColor: C.hot, paddingVertical: 11, paddingHorizontal: 9, alignItems: 'center' }}>
          <Text style={{ fontFamily: Sans.bold, fontSize: 12, color: '#fff' }}>{plusActive ? 'Quản lý Plus →' : 'Xem quyền lợi Plus →'}</Text>
        </View> : null}
      </TouchableOpacity>
    </View>
  );
}
