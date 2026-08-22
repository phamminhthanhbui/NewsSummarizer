import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFeedsCache } from './feeds';
import { KEYS } from './storage';

export const isNotifSupported = Platform.OS !== 'web';

// expo-notifications chỉ hỗ trợ Android/iOS — require có điều kiện để web không
// load native module (có thể ném lỗi lúc import) mà vẫn bundle được.
type NotifModule = typeof import('expo-notifications');
let Notifications: NotifModule | null = null;
if (isNotifSupported) {
  Notifications = require('expo-notifications') as NotifModule;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const CHANNEL_ID = 'daily-digest';

// Parse "HH:MM" hợp lệ (0-23 giờ, 0-59 phút), trả null nếu sai
export function parseTime(s: string): { hour: number; minute: number } | null {
  const m = s.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return { hour: +m[1], minute: +m[2] };
}

export async function ensureSetup(): Promise<boolean> {
  if (!isNotifSupported || !Notifications) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Bản tin hằng ngày',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  }
  return true;
}

export async function getSettings(): Promise<{ enabled: boolean; times: string[] }> {
  const enabled = (await AsyncStorage.getItem(KEYS.notifEnabled)) === '1';
  let times: string[] = [];
  const raw = await AsyncStorage.getItem(KEYS.notifTimes);
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) times = arr.filter((t): t is string => typeof t === 'string' && !!parseTime(t));
    } catch {}
  }
  // Migrate từ phiên bản cũ (1 giờ cố định @notif_hour/@notif_minute)
  if (!raw) {
    const hour = parseInt((await AsyncStorage.getItem(KEYS.notifHour)) || '', 10);
    const minute = parseInt((await AsyncStorage.getItem(KEYS.notifMinute)) || '', 10);
    if (hour >= 0 && hour <= 23) times = [`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`];
  }
  if (!times.length) times = ['07:00'];
  return { enabled, times };
}

export async function setEnabled(enabled: boolean, times: string[]): Promise<boolean> {
  await AsyncStorage.multiSet([
    [KEYS.notifEnabled, enabled ? '1' : '0'],
    [KEYS.notifTimes, JSON.stringify(times)],
  ]);
  if (enabled) {
    const granted = await ensureSetup();
    if (!granted) return false;
    await schedule(times);
    return true;
  }
  if (Notifications) await Notifications.cancelAllScheduledNotificationsAsync();
  return true;
}

// Lưu giờ (không bật/tắt) rồi reschedule nếu đang bật
export async function saveTimes(times: string[]): Promise<boolean> {
  await AsyncStorage.setItem(KEYS.notifTimes, JSON.stringify(times));
  const enabled = (await AsyncStorage.getItem(KEYS.notifEnabled)) === '1';
  if (enabled) {
    await schedule(times);
    return true;
  }
  return true;
}

async function scheduleOne(hour: number, minute: number) {
  if (!Notifications) return;
  let title = 'Tin tức mới đã có';
  let body = 'Mở ứng dụng để xem tin nóng nhất hôm nay';
  let link = '';
  try {
    const cached = await readFeedsCache();
    const top = cached.find((i) => i.featured) || cached[0];
    if (top) {
      title = top.source ? `Tin nổi bật · ${top.source}` : 'Tin nổi bật';
      body = top.title;
      link = top.link;
    }
  } catch {}
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { url: link },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
}

// Lên lịch 1 bản tin hằng ngày cho MỖI khung giờ đã chọn (dedupe giờ trùng)
export async function schedule(times: string[]) {
  if (!isNotifSupported || !Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const clean = times
    .map(parseTime)
    .filter((t): t is { hour: number; minute: number } => t !== null)
    .filter((t, i, a) => a.findIndex((x) => x.hour === t.hour && x.minute === t.minute) === i)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  for (const t of clean) await scheduleOne(t.hour, t.minute);
}

export async function sendTest() {
  if (!isNotifSupported || !Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'TIN TỨC 🔔',
      body: 'Thông báo thử — bật bản tin hằng ngày trong Cài đặt để nhận tin mới mỗi ngày!',
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
}

// Đăng ký xử lý khi user bấm vào thông báo → trả về URL bài viết (nếu có).
// Trả về hàm hủy đăng ký; đồng thời xử lý thông báo cuối khi mở app từ tray.
export function onNotificationResponse(handler: (url: string) => void): () => void {
  if (!isNotifSupported || !Notifications) return () => {};
  Notifications.getLastNotificationResponseAsync().then((r: any) => {
    const url = r?.notification?.request?.content?.data?.url as string | undefined;
    if (url) handler(url);
  });
  const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
    const url = response?.notification?.request?.content?.data?.url as string | undefined;
    if (url) handler(url);
  });
  return () => sub.remove();
}