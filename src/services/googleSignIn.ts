import { Platform } from 'react-native';

// Public OAuth client IDs from Google Cloud Console. Native Google needs the
// Web client ID (Android audience) and, on iOS, the iOS client ID.
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || '';
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() || '';
const nativePlatform = Platform.OS === 'android' || Platform.OS === 'ios';

export const googleNativeConfigured = Boolean(webClientId) && (Platform.OS === 'android' || (Platform.OS === 'ios' && Boolean(iosClientId)));
export const googleNativeAvailable = nativePlatform && googleNativeConfigured;

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

function googleModule(): GoogleModule {
  return require('@react-native-google-signin/google-signin') as GoogleModule;
}

let configured = false;
function configure() {
  if (configured) return;
  googleModule().GoogleSignin.configure({
    webClientId,
    ...(Platform.OS === 'ios' ? { iosClientId } : {}),
    offlineAccess: false,
  });
  configured = true;
}

function codeOf(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? code : '';
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '';
}

// Returns a Google ID token ready for Firebase's GoogleAuthProvider.credential().
export async function signInWithNativeGoogle(): Promise<string> {
  if (!googleNativeAvailable) throw new Error('auth/social-not-configured');
  const { GoogleSignin, statusCodes } = googleModule();
  try {
    configure();
    if (Platform.OS === 'android') {
      const available = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      if (!available) throw new Error('auth/play-services-not-available');
    }
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw new Error('auth/popup-closed-by-user');
    const idToken = response.data.idToken;
    if (!idToken) throw new Error('auth/google-missing-id-token');
    return idToken;
  } catch (error) {
    const code = codeOf(error);
    const message = messageOf(error);
    if (code === statusCodes.SIGN_IN_CANCELLED || code === '12501' || /cancel/i.test(message)) {
      throw new Error('auth/popup-closed-by-user');
    }
    if (code === statusCodes.IN_PROGRESS) throw new Error('auth/in-progress');
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE || code === '12500') throw new Error('auth/play-services-not-available');
    if (code === '10' || code === 'DEVELOPER_ERROR' || /developer_error/i.test(message)) throw new Error('auth/google-config-error');
    throw error;
  }
}

// Best effort: clearing the cached Google account must never block Firebase sign-out.
export async function signOutNativeGoogle() {
  if (!googleNativeAvailable) return;
  try {
    configure();
    await googleModule().GoogleSignin.signOut();
  } catch {
    // Ignore: Firebase sign-out still proceeds.
  }
}
