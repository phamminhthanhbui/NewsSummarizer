// Hàm THUẦN cho thời tiết — tách khỏi services/weather.ts để test chạy được
// bằng node trần (services/weather.ts kéo theo expo-location + react-native,
// import vào node là chết ngay). Cùng lý do llmText.ts nằm ở utils/.

// WMO weather code → icon Ionicons + nhãn tiếng Việt.
// Bảng gốc: open-meteo.com/en/docs, mục "WMO Weather interpretation codes".
// Thang bậc dưới đây dựa vào việc các mã trong cùng một nhóm là LIÊN TIẾP nhau
// (51-57 mưa phùn, 61-67 mưa, 71-77 tuyết, 80-82 mưa rào, 85-86 mưa tuyết,
// 95-99 dông). Đảo thứ tự so sánh là hỏng âm thầm — weatherCode.test.ts khoá lại.
// Union literal chứ không phải `string`: Ionicons đòi `keyof glyphMap`, truyền
// string thường là TS đỏ. Khai báo ở đây (thay vì import type từ Ionicons) để
// file này vẫn không phụ thuộc react-native -> test chạy được bằng node trần.
export type WeatherIcon =
  | 'sunny'
  | 'partly-sunny'
  | 'cloudy'
  | 'cloud'
  | 'rainy'
  | 'snow'
  | 'thunderstorm';

export function describeWeather(code: number): { icon: WeatherIcon; label: string } {
  if (code === 0) return { icon: 'sunny', label: 'Trời quang' };
  if (code <= 2) return { icon: 'partly-sunny', label: 'Ít mây' };
  if (code === 3) return { icon: 'cloudy', label: 'Nhiều mây' };
  if (code <= 48) return { icon: 'cloud', label: 'Sương mù' };
  if (code <= 57) return { icon: 'rainy', label: 'Mưa phùn' };
  if (code <= 67) return { icon: 'rainy', label: 'Mưa' };
  if (code <= 77) return { icon: 'snow', label: 'Tuyết' };
  if (code <= 82) return { icon: 'rainy', label: 'Mưa rào' };
  if (code <= 86) return { icon: 'snow', label: 'Mưa tuyết' };
  return { icon: 'thunderstorm', label: 'Dông' };
}

const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

// Không dùng toLocaleDateString: Hermes trên Android thường thiếu dữ liệu ICU
// nên 'vi-VN' có thể rơi về en-US ("Wed"). Tự tính thứ thì luôn đúng.
// Nối 'T00:00:00' để parse theo giờ ĐỊA PHƯƠNG — 'YYYY-MM-DD' trần bị hiểu là
// UTC nên ở GMT+7 sẽ lùi mất một ngày.
export function weekdayShort(date: string): string {
  return WD[new Date(`${date}T00:00:00`).getDay()];
}
