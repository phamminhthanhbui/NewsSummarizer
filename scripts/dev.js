// npm run start: chạy proxy (3001) + expo dev server (8087) cùng lúc.
// Chỉ kill port 8087 nếu bị chiếm; các port khác để yên.
const { spawn } = require('child_process');
const net = require('net');

let proxy = null;
const stop = () => { if (proxy) proxy.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// Kill 1 cổng (chỉ dùng cho 8087). port là hằng số
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

// Probe 3001: nếu proxy đã chạy sẵn thì dùng luôn (tránh spawn trùng EADDRINUSE),
// nếu chưa có thì spawn proxy rồi mới start Expo.
const probe = net.connect(3001, '127.0.0.1');
probe.on('connect', () => { probe.end(); startExpo(); });
probe.on('error', () => {
  proxy = spawn('node', ['server/proxy.js'], { stdio: 'inherit' });
  startExpo();
});
