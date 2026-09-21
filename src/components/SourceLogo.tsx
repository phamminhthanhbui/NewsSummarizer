import React from 'react';
import { View, Text, Image } from 'react-native';

// Logo nguồn tin theo thương hiệu — dùng chung cho Home và tab Video.
// Một nguồn sự thật cho ảnh logo + chữ viết tắt, tránh nhân bản giữa 2 màn.
const SOURCE_LOGOS: Record<string, number> = {
  VNExpress: require('../../assets/sources/vnexpress.png'),
  'Tuổi Trẻ': require('../../assets/sources/tuoitre.png'),
  'Thanh Niên': require('../../assets/sources/thanhnien.png'),
  VietNamNet: require('../../assets/sources/vietnamnet.png'),
  'Dân Trí': require('../../assets/sources/dantri.png'),
  'Người Lao Động': require('../../assets/sources/nld.png'),
  'Tiền Phong': require('../../assets/sources/tienphong.png'),
  'Sài Gòn Giải Phóng': require('../../assets/sources/sggp.png'),
  CAND: require('../../assets/sources/cand.png'),
  'An ninh Thủ đô': require('../../assets/sources/anninhthudo.png'),
  'Báo Chính phủ': require('../../assets/sources/baochinhphu.png'),
  'Báo Giao Thông': require('../../assets/sources/baogiaothong.png'),
  GenK: require('../../assets/sources/genk.png'),
  Cafebiz: require('../../assets/sources/cafebiz.png'),
  BongDaPlus: require('../../assets/sources/bongdaplus.png'),
  Kenh14: require('../../assets/sources/kenh14.png'),
  HelloBacSi: require('../../assets/sources/hellobacsi.png'),
  'Sức khỏe & Đời sống': require('../../assets/sources/suckhoedoisong.png'),
  Soha: require('../../assets/sources/soha.png'),
  Znews: require('../../assets/sources/znews.png'),
  'Kiến Thức': require('../../assets/sources/kienthuc.png'),
  Ngoisao: require('../../assets/sources/ngoisao.png'),
  Saostar: require('../../assets/sources/saostar.png'),
  'Nhân Dân': require('../../assets/sources/nhandan.png'),
  VTV: require('../../assets/sources/vtv.png'),
  VietnamPlus: require('../../assets/sources/vietnamplus.png'),
  'Công Luận': require('../../assets/sources/congluan.png'),
  'Giáo dục Thời đại': require('../../assets/sources/giaoducthoidai.png'),
};

const SOURCE_ABBR: Record<string, string> = {
  'Tất cả': 'TC',
  VNExpress: 'VNE',
  'Tuổi Trẻ': 'TT',
  'Thanh Niên': 'TN',
  VietNamNet: 'VNN',
  'Dân Trí': 'DT',
  'Người Lao Động': 'NLD',
  'Tiền Phong': 'TP',
  'Sài Gòn Giải Phóng': 'SG',
  CAND: 'CA',
  'An ninh Thủ đô': 'AN',
  'Sức khỏe & Đời sống': 'SK',
  'Báo Chính phủ': 'CP',
  'Báo Giao Thông': 'GT',
  GenK: 'GK',
  Cafebiz: 'CF',
  BongDaPlus: 'BD',
  Kenh14: 'K14',
  HelloBacSi: 'HB',
  Soha: 'SH',
  Znews: 'ZN',
  'Kiến Thức': 'KT',
  Ngoisao: 'NS',
  Saostar: 'SS',
  'Nhân Dân': 'ND',
  VTV: 'VT',
  VietnamPlus: 'VP',
  'Công Luận': 'CL',
  'Giáo dục Thời đại': 'GD',
};

// active = item đang được chọn (nền brand đậm) → tile chuyển nền trắng để tương phản
function SourceLogo({
  source,
  color,
  size = 24,
  active = false,
}: {
  source: string;
  color: string;
  size?: number;
  active?: boolean;
}) {
  const logo = SOURCE_LOGOS[source];
  if (logo) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.25),
          backgroundColor: active ? '#FFFFFF' : '#FFF',
          borderWidth: 1,
          borderColor: active ? 'rgba(255,255,255,0.4)' : color + '3D',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image source={logo} resizeMode="contain" style={{ width: size - 4, height: size - 4 }} />
      </View>
    );
  }
  const abbr = SOURCE_ABBR[source] || source.slice(0, 2).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        backgroundColor: active ? '#FFFFFF' : color + '22',
        borderWidth: 1,
        borderColor: active ? 'rgba(255,255,255,0.4)' : color + '3D',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color,
          fontSize: Math.round(size * 0.42),
          fontWeight: '800',
          letterSpacing: 0.2,
          lineHeight: Math.round(size * 0.42) + 2,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {abbr}
      </Text>
    </View>
  );
}

export default React.memo(SourceLogo);
