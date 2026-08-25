// Thêm android:usesCleartextTraffic="true" vào AndroidManifest lúc prebuild.
// Cần vì app gọi proxy qua http:// LAN (192.168.x.x) — Android release mặc định
// chặn toàn bộ HTTP không mã hoá → app chết mạng im lặng.
// (SDK 57 không còn đọc key android.usesCleartextTraffic trong app.json.)
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartext(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
