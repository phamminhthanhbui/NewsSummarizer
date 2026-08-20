// Playwright reporter tự động fix: gom test fail, ghi chi tiết ra
// test-results/autofix-prompt.md, rồi:
//   1. Kiểm tra fcc-server đã chạy chưa (soi CommandLine tiến trình) — chưa thì
//      mở terminal mới chạy `fcc-server`.
//   2. Mở terminal khác chạy `fcc-claude --dangerously-skip-permissions` kèm prompt
//      ban đầu trỏ tới file chi tiết lỗi.
// Tắt tự động: set biến môi trường PLAYWRIGHT_NO_AUTOFIX=1.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

interface Failure {
  file: string;
  line: number;
  title: string;
  error: string;
}

const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Detect fcc-server: quét CommandLine mọi tiến trình. Chuỗi dò truyền qua biến môi
// trường FCC_PROBE để KHÔNG xuất hiện trong CommandLine của chính powershell/cmd
// đang chạy lệnh này (không thì tự match chính mình, luôn luôn > 0).
function fccServerRunning(): boolean {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like $env:FCC_PROBE }).Count"',
      {
        encoding: 'utf8',
        env: { ...process.env, FCC_PROBE: '*fcc-server*' },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return parseInt(out.trim(), 10) > 0;
  } catch {
    return false; // không check được → coi như chưa chạy, start cho chắc
  }
}

function buildPromptMd(failures: Failure[]): string {
  const sections = failures
    .map((f, i) =>
      [
        `### ${i + 1}. ${f.title}`,
        `- Test: \`${f.file}:${f.line}\``,
        `- Chạy lại: \`npx playwright test ${f.file}:${f.line}\``,
        '',
        '```',
        f.error || '(không có error message)',
        '```',
      ].join('\n'),
    )
    .join('\n\n');

  return [
    '# E2E test fail — cần sửa',
    '',
    `${failures.length} test đang fail. Bối cảnh: app Expo React Native (web chạy ở localhost:8087 qua scripts/dev.js, proxy localhost:3001), test Playwright nằm trong e2e/, mock network trong e2e/helpers.ts.`,
    '',
    '## Quy tắc',
    '- Tìm nguyên nhân thật rồi sửa code app (src/, App.tsx) HOẶC code test (e2e/).',
    '- KHÔNG xóa test, KHÔNG làm yếu assertion chỉ để test pass.',
    '- Nếu lỗi do mock trong e2e/helpers.ts không khớp hành vi thật của app, sửa mock cho đúng hành vi thật.',
    '- Sửa xong chạy lại từng test: `npx playwright test <file>:<line>` đến khi xanh.',
    '',
    '## Danh sách test fail',
    '',
    sections,
    '',
  ].join('\n');
}

class AutofixReporter implements Reporter {
  private failures: Failure[] = [];

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    this.failures.push({
      file: path.relative(process.cwd(), test.location.file).replace(/\\/g, '/'),
      line: test.location.line,
      title: test.titlePath().slice(1).join(' > '),
      error: stripAnsi(result.errors.map((e) => e.message ?? '').join('\n---\n')).slice(0, 3000),
    });
  }

  async onEnd(_result: FullResult) {
    if (!this.failures.length || process.env.PLAYWRIGHT_NO_AUTOFIX) return;

    // Luôn ghi file chi tiết (mọi platform)
    const root = process.cwd();
    const outDir = path.join(root, 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    const mdPath = path.join(outDir, 'autofix-prompt.md');
    fs.writeFileSync(mdPath, buildPromptMd(this.failures), 'utf8');
    console.log(`[autofix] ${this.failures.length} test fail — chi tiết: ${mdPath}`);

    if (os.platform() !== 'win32') {
      console.log('[autofix] Ngoài Windows nên không tự mở terminal. Chạy tay: fcc-claude --dangerously-skip-permissions "<file chi tiết ở trên>"');
      return;
    }

    // 1. fcc-server — chỉ start nếu chưa chạy
    const wasRunning = fccServerRunning();
    if (!wasRunning) {
      console.log('[autofix] fcc-server chưa chạy — mở terminal mới start...');
      try {
        execSync('start "fcc-server" cmd /k fcc-server', { cwd: root, stdio: 'ignore' });
      } catch (e) {
        console.log('[autofix] Start fcc-server thất bại: ' + (e as Error).message);
      }
      // Chờ server boot trước khi mở claude (tùy chỉnh qua FCC_SERVER_BOOT_MS)
      await sleep(parseInt(process.env.FCC_SERVER_BOOT_MS || '6000', 10));
    } else {
      console.log('[autofix] fcc-server đang chạy sẵn — bỏ qua start');
    }

    // 2. fcc-claude — terminal riêng, prompt ban đầu trỏ về file lỗi.
    // Prompt giữ ASCII thuần: cmd codepage cũ làm méo dấu tiếng Việt trên command line
    // (chi tiết tiếng Việt đầy đủ đã nằm trong md file, claude đọc UTF-8 bình thường).
    const lines = this.failures.map((f) => `${f.file}:${f.line}`).join(', ');
    const prompt =
      `These e2e tests failed: ${lines}. ` +
      `Full error details and fix rules: ${mdPath}. ` +
      `Fix the app or test code so all of them pass, then verify each with: npx playwright test <file>:<line>. ` +
      `Do not delete or weaken assertions.`;
    console.log('[autofix] Mở fcc-claude --dangerously-skip-permissions với prompt trên...');
    try {
      execSync(`start "fcc-claude" cmd /k fcc-claude --dangerously-skip-permissions "${prompt}"`, {
        cwd: root,
        stdio: 'ignore',
      });
    } catch (e) {
      console.log('[autofix] Mở fcc-claude thất bại: ' + (e as Error).message);
    }
    await sleep(300); // chờ cmd window spawn xong trước khi playwright exit
  }
}

export default AutofixReporter;
