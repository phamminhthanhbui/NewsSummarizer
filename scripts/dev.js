// npm run start: chạy proxy (3001) + expo dev server (8087) cùng lúc
const { spawn } = require('child_process');
const net = require('net');

let proxy = null;
const stop = () => { if (proxy) proxy.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const startExpo = () => {
  const expo = spawn('npx', ['expo', 'start', '--port', '8087', '--clear'], { stdio: 'inherit', shell: true });
  expo.on('exit', stop);
};

// Proxy đã chạy sẵn ở 3001 thì dùng luôn, không spawn trùng (EADDRINUSE)
const probe = net.connect(3001, '127.0.0.1');
probe.on('connect', () => { probe.end(); startExpo(); });
probe.on('error', () => {
  proxy = spawn('node', ['server/proxy.js'], { stdio: 'inherit' });
  startExpo();
});
