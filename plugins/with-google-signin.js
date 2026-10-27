// Adds the reversed iOS OAuth client ID to Info.plist so Google Sign-In can
// return to the app. Derived from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, or set
// EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME explicitly. No-op until configured, so
// builds without Google native credentials still succeed (the button stays hidden).
const { withInfoPlist, IOSConfig } = require('expo/config-plugins');

const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const SCHEME_PREFIX = 'com.googleusercontent.apps.';

function iosUrlScheme() {
  const explicit = (process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME || '').trim();
  if (explicit) return explicit;
  const clientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '').trim();
  if (!clientId.endsWith(CLIENT_ID_SUFFIX)) return '';
  return `${SCHEME_PREFIX}${clientId.slice(0, -CLIENT_ID_SUFFIX.length)}`;
}

module.exports = function withGoogleSignIn(config) {
  const scheme = iosUrlScheme();
  if (!scheme) return config;
  if (!scheme.startsWith(SCHEME_PREFIX)) {
    throw new Error(`Google Sign-In: iosUrlScheme must start with "${SCHEME_PREFIX}" (got "${scheme}").`);
  }
  return withInfoPlist(config, (next) => {
    if (!IOSConfig.Scheme.hasScheme(scheme, next.modResults)) {
      next.modResults = IOSConfig.Scheme.appendScheme(scheme, next.modResults);
    }
    return next;
  });
};
