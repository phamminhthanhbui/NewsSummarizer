// AsyncStorage helpers — simple CRUD

import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  apiKey: '@nim_key',
  model: '@nim_model',
  saved: '@saved_articles',
  history: '@summary_history',
};

export async function getItem<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: any): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

// Convenience: get raw string values
export async function getString(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export async function setString(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}