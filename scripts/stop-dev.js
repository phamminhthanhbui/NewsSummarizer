// Tắt dev servers của NewsSummarizer: kill tree theo PID truyền vào argv
const { execFile } = require('child_process');
for (const pid of process.argv.slice(2)) {
  execFile('taskkill', ['/PID', pid, '/T', '/F'], (err) => {
    console.log(`PID ${pid}: ${err ? err.message.split('\n')[0] : 'killed'}`);
  });
}
