import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

export const PLUS_ENTITLEMENT = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT?.trim() || 'plus';
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() || '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim() || '';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let configured = false;

function apiKey() {
  if (Platform.OS === 'ios') return IOS_KEY;
  if (Platform.OS === 'android') return ANDROID_KEY;
  return '';
}

export function purchasesAvailable() {
  return Platform.OS !== 'web' && !isExpoGo && Boolean(apiKey());
}

function sdk(): typeof import('react-native-purchases').default {
  // RevenueCat is native-only in this app. Keeping the require behind the platform
  // check prevents the web build from trying to initialize a native billing bridge.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('react-native-purchases').default;
}

async function ensureConfigured(appUserID?: string | null) {
  if (!purchasesAvailable()) return false;
  const Purchases = sdk();
  if (!configured) {
    Purchases.configure({ apiKey: apiKey(), appUserID: appUserID || undefined });
    configured = true;
  }
  return true;
}

export async function identifyPurchasesUser(userId: string | null, email: string | null) {
  if (!(await ensureConfigured(userId))) return;
  const Purchases = sdk();
  if (userId) {
    const current = await Purchases.getAppUserID();
    if (current !== userId) await Purchases.logIn(userId);
    if (email) await Purchases.setEmail(email);
    return;
  }
  if (!(await Purchases.isAnonymous())) await Purchases.logOut();
}

export type SubscriptionState = {
  configured: boolean;
  active: boolean;
  entitlement: string;
  managementURL: string | null;
  expirationDate: string | null;
};

function stateFromCustomer(customer: CustomerInfo): SubscriptionState {
  const entitlement = customer.entitlements.active[PLUS_ENTITLEMENT];
  return {
    configured: true,
    active: Boolean(entitlement),
    entitlement: PLUS_ENTITLEMENT,
    managementURL: customer.managementURL || null,
    expirationDate: entitlement?.expirationDate || null,
  };
}

export async function getSubscriptionState(): Promise<SubscriptionState> {
  if (!(await ensureConfigured())) {
    return { configured: false, active: false, entitlement: PLUS_ENTITLEMENT, managementURL: null, expirationDate: null };
  }
  return stateFromCustomer(await sdk().getCustomerInfo());
}

export type StorePlan = {
  identifier: string;
  packageType: string;
  title: string;
  description: string;
  price: string;
  period: string | null;
};

export async function getStorePlans(): Promise<StorePlan[]> {
  if (!(await ensureConfigured())) return [];
  const offering = (await sdk().getOfferings()).current;
  if (!offering) return [];
  return offering.availablePackages.map((item: PurchasesPackage) => ({
    identifier: item.identifier,
    packageType: String(item.packageType),
    title: item.product.title || 'NewsSummarizer Plus',
    description: item.product.description || '',
    price: item.product.priceString,
    period: item.product.subscriptionPeriod || null,
  }));
}

async function packageById(identifier: string): Promise<PurchasesPackage> {
  const offering = (await sdk().getOfferings()).current;
  const found = offering?.availablePackages.find((item) => item.identifier === identifier);
  if (!found) throw new Error('Không tìm thấy gói này trên cửa hàng.');
  return found;
}

export async function purchasePlan(identifier: string): Promise<SubscriptionState> {
  if (!(await ensureConfigured())) throw new Error('Thanh toán trên cửa hàng chưa được cấu hình.');
  const result = await sdk().purchasePackage(await packageById(identifier));
  return stateFromCustomer(result.customerInfo);
}

export async function restorePurchases(): Promise<SubscriptionState> {
  if (!(await ensureConfigured())) throw new Error('Thanh toán trên cửa hàng chưa được cấu hình.');
  return stateFromCustomer(await sdk().restorePurchases());
}

export function purchaseWasCancelled(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'userCancelled' in error && (error as { userCancelled?: boolean }).userCancelled);
}
