import { registerRootComponent } from 'expo';

import App from './App';

// Web: @react-navigation/bottom-tabs (kể cả 7.20) vẫn truyền `pointerEvents`
// là prop → react-native-web 0.21 in warn "props.pointerEvents is deprecated".
// Lỗi nằm trong thư viện (app không tự dùng prop này) → lọc đúng dòng warn
// dev đó ra khỏi console web; bỏ filter khi bottom-tabs sửa upstream.
if (typeof window !== 'undefined') {
  const rawWarn = console.warn;
  console.warn = (...args) => {
    if (!/props\.pointerEvents is deprecated/.test(String(args[0]))) rawWarn(...args);
  };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
