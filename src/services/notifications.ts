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

export async function getSettings(): Promise<{ enabled: boolean; hour: number; minute: number }> {
  const enabled = (await AsyncStorage.getItem(KEYS.notifEnabled)) === '1';
  const hour = parseInt((await AsyncStorage.getItem(KEYS.notifHour)) || '7', 10);
  const minute = parseInt((await AsyncStorage.getItem(KEYS.notifMinute)) || '0', 10);
  return { enabled, hour, minute };
}

export async function setEnabled(enabled: boolean, hour: number, minute: number): Promise<boolean> {
  await AsyncStorage.multiSet([
    [KEYS.notifEnabled, enabled ? '1' : '0'],
    [KEYS.notifHour, String(hour)],
    [KEYS.notifMinute, String(minute)],
  ]);
  if (enabled) {
    const granted = await ensureSetup();
    if (!granted) return false;
    await schedule(hour, minute);
    return true;
  }
  if (Notifications) await Notifications.cancelAllScheduledNotificationsAsync();
  return true;
}

export async function schedule(hour: number, minute: number) {
  if (!isNotifSupported || !Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
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