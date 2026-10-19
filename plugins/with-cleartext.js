// Dev builds may point EXPO_PUBLIC_PROXY_URL at a local HTTP/LAN proxy.
// Store builds must use HTTPS; in that case cleartext traffic stays disabled.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withConditionalCleartext(config) {
  return withAndroidManifest(config, (next) => {
    const proxyUrl = (process.env.EXPO_PUBLIC_PROXY_URL || '').trim();
    const allowCleartext = /^http:\/\//i.test(proxyUrl);
    next.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = allowCleartext ? 'true' : 'false';
    return next;
  });
};
