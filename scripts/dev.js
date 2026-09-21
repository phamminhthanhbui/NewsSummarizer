// npm run start: chạy proxy (3001) + expo dev server (8087) cùng lúc.
// CHỈ 2 cổng này được phép sống; mọi cổng project thừa (8081 của `npm run web`,
// 8080/8088/19000...) bị kill tự động trước khi start để không còn zombie.
const { spawn } = require('child_process');
const net = require('net');

// Cổng project thừa cần dọn mỗi lần start.
const OTHER_PORTS = [8080, 8081, 8082, 8083, 8088, 8089, 8090, 19000, 19001, 19002, 19006];

let proxy = null;
const stop = () => { if (proxy) proxy.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Kill 1 cổng (dùng cho cả 8087 bị chiếm lẫn dọn OTHER_PORTS). port là hằng số
// trong file → không có input ngoài. Dùng execFile (không shell) + lọc PID trong
// JS thay vì `netstat | findstr` để tránh chạy lệnh qua shell.
// PID '0' = socket mồ côi (TIME_WAIT/CLOSE_WAIT sau khi process chết) — nhân
// Windows báo 0 vì không còn owner. taskkill /PID 0 vô nghĩa và cổng thực ra đã
// tự do, nên bỏ qua: tránh log nhiễu + tránh chờ 1s mỗi cổng.
const { execFile } = require('child_process');
const killPort = (port, cb) => {
  execFile('netstat', ['-ano'], (err, out) => {
    if (err || !out) return cb();
    const pids = [...new Set(out.split('\n')
      .filter(l => new RegExp(`:${port}(?=\\s|$)`).test(l))
      .map(l => l.trim().split(/\s+/).pop())
      .filter(p => /^\d+$/.test(p) && p !== '0' && p !== String(process.pid)))];
    if (!pids.length) return cb();
    console.log(`Port ${port} dang bi chiem, kill PID: ${pids.join(', ')}`);
    pids.forEach(pid => execFile('taskkill', ['/F', '/PID', pid], () => {}));
    setTimeout(cb, 1000); // đợi OS nhả port
  });
};

// Dọn TẤT CẢ cổng thừa trước khi start — đảm bảo chỉ còn 8087+3001.
const killOtherPorts = (cb) => {
  if (!OTHER_PORTS.length) return cb();
  let remaining = OTHER_PORTS.length;
  OTHER_PORTS.forEach(port => killPort(port, () => {
    if (--remaining === 0) cb();
  }));
};

const startExpo = () => {
  killPort(8087, () => {
  // KHÔNG dùng --clear: clear cache Metro ở MỖI lần start khiến bundle build
  // lạnh lại từ đầu — máy kết nối khi đang build, bundle mới xong CLI đẩy
  // xuống → app tự reload ngay sau khi render xong lần đầu. Khi cần clear
  // cache (sửa native/config/dep) thì chạy tay: npx expo start --clear
  const expo = spawn('npx', ['expo', 'start', '--port', '8087'], { stdio: 'inherit', shell: true });
  expo.on('exit', stop);
  });
};

// Bắt đầu: dọn cổng thừa TRƯỚC, rồi mới probe/khởi động proxy+expo.
// Probe 3001: nếu proxy đã chạy sẵn thì dùng luôn (tránh spawn trùng EADDRINUSE),
// nếu chưa có thì spawn proxy rồi mới start Expo.
killOtherPorts(() => {
  const probe = net.connect(3001, '127.0.0.1');
  probe.on('connect', () => { probe.end(); startExpo(); });
  probe.on('error', () => {
    proxy = spawn('node', ['server/proxy.js'], { stdio: 'inherit' });
    startExpo();
  });
});
