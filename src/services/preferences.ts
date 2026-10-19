import AsyncStorage from '@react-native-async-storage/async-storage';
export const PREF_KEY = '@news_preferences';
export const WEATHER_KEY = '@weather_enabled';
export interface Preferences {
    categories: string[];
    sources: string[];
}
export async function getPreferences(): Promise<Preferences> {
    try {
        const raw = JSON.parse((await AsyncStorage.getItem(PREF_KEY)) || '{}');
        return { categories: Array.isArray(raw.categories) ? raw.categories.filter((v: unknown) => typeof v === 'string') : [], sources: Array.isArray(raw.sources) ? raw.sources.filter((v: unknown) => typeof v === 'string') : [] };
    }
    catch {
        return { categories: [], sources: [] };
    }
}
export const savePreferences = (value: Preferences) => AsyncStorage.setItem(PREF_KEY, JSON.stringify(value));
