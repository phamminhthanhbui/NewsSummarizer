// Thời tiết — Open-Meteo + vị trí thật từ expo-location.
//
// Vì sao Open-Meteo: trả `access-control-allow-origin: *` nên trình duyệt gọi
// THẲNG được — không phải thêm endpoint vào server/proxy.js như mọi API khác
// trong app. Và không cần API key / đăng ký như OpenWeatherMap.
//
// Tên nơi hiển thị ("Phường, Thành phố") lấy từ BigDataCloud trên CẢ hai nền
// tảng — lý do ở chú thích placeName().
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { describeWeather, weekdayShort } from '../utils/weatherCode';

export { describeWeather, weekdayShort };

export interface WeatherDay {
  date: string;   // 'YYYY-MM-DD'
  code: number;   // WMO
  max: number;
  min: number;
}

export interface WeatherNow {
  temp: number;
  code: number;   // WMO
  place: string;  // "Phường, Thành phố" — hoặc nhãn chung nếu không tra được
  daily: WeatherDay[];
  at: number;     // epoch ms lúc lấy — dùng cho TTL cache
}

// _v2: bản cũ lưu field `city` (chỉ tên thành phố); đổi sang `place` ("Phường,
// Thành phố") nên đổi khoá luôn — entry cũ sẽ thiếu `place` và hiện nhãn rỗng
// suốt 30 phút TTL. Đổi khoá rẻ hơn việc migrate tại chỗ.
const CACHE_KEY = '@weather_cache_v2';
// 30 phút. Thời tiết không đổi nhanh hơn thế, mà mỗi lần lấy là một lần bật GPS.
const TTL_MS = 30 * 60 * 1000;

async function readCache(): Promise<WeatherNow | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as WeatherNow;
    return Date.now() - c.at < TTL_MS ? c : null;
  } catch {
    return null;
  }
}

async function fetchWeather(lat: number, lon: number) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&timezone=auto&forecast_days=3`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const j = await r.json();
  return {
    temp: Math.round(j.current.temperature_2m),
    code: j.current.weather_code as number,
    daily: (j.daily.time as string[]).map((date, i) => ({
      date,
      code: j.daily.weather_code[i] as number,
      max: Math.round(j.daily.temperature_2m_max[i]),
      min: Math.round(j.daily.temperature_2m_min[i]),
    })),
  };
}

// Dùng BigDataCloud cho CẢ hai nền tảng, không phân nhánh theo Platform:
//  - Web: expo-location KHÔNG reverse-geocode được — bản web throw GeocoderError
//    (node_modules/expo-location/build/ExpoLocation.web.js), nên buộc phải có
//    dịch vụ ngoài.
//  - Native: geocoder của hệ điều hành chỉ tới cấp QUẬN (district), không có
//    phường. BigDataCloud trả `locality` đúng cấp phường (adminLevel 6) và khớp
//    ở cả 4 toạ độ đã đo: Hoàn Kiếm/Hà Nội, Sài Gòn/TP.HCM, Ninh Kiều/Cần Thơ,
//    Hòa Cường/Đà Nẵng.
// Keyless, và `access-control-allow-origin: *` có ở CẢ HAI chặng của redirect
// 307 sang api-bdc.io (đo bằng curl) → trình duyệt gọi thẳng được, không cần
// thêm endpoint vào server/proxy.js.
// Trả null khi không tra được; nơi gọi rơi về nhãn chung. Không throw.
const BDC_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

async function placeName(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `${BDC_URL}?latitude=${lat}&longitude=${lon}&localityLanguage=vi`,
    );
    if (!r.ok) return null;
    const j = await r.json();
    const city = String(j.city ?? '').trim();
    const ward = String(j.locality ?? '').trim();
    if (!city && !ward) return null;
    // Ở thành phố nhỏ, locality trùng city — đừng hiện "X, X".
    if (!ward || ward === city) return city || ward;
    return `${ward}, ${city}`;
  } catch {
    return null;
  }
}

// Trả null khi user từ chối quyền hoặc mạng lỗi — nơi gọi chỉ cần ẩn dải đi.
// Không throw: thời tiết là thông tin phụ, không được làm hỏng Trang chủ.
export async function getWeather(force = false): Promise<WeatherNow | null> {
  if (!force) {
    const cached = await readCache();
    if (cached) return cached;
  }
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    // Accuracy.Low: đủ chính xác cho thời tiết cấp thành phố, nhanh hơn và ít
    // tốn pin hơn High rất nhiều.
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = pos.coords;
    const w = await fetchWeather(latitude, longitude);
    const out: WeatherNow = {
      ...w,
      place: (await placeName(latitude, longitude)) ?? 'Vị trí của bạn',
      at: Date.now(),
    };
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(out)).catch(() => {});
    return out;
  } catch {
    return null;
  }
}
