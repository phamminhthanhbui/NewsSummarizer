// Exercise the actual service with synthetic storage and networking disabled.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const memory = new Map();
let networkCalls = 0;
const storage = {
  getItem: async key => { await Promise.resolve(); return memory.get(key) || null; },
  setItem: async (key, value) => { await Promise.resolve(); memory.set(key, value); },
  multiRemove: async keys => { for (const key of keys) memory.delete(key); },
};
const cache = new Map();
const blocked = () => { networkCalls++; throw new Error('Network disabled for summary service test'); };
function loadTs(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const resolve = name => {
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name.endsWith('/utils/proxy')) return { getProxyBase: () => 'http://test.invalid', orderedProxyBases: () => [], proxiedFetchText: blocked, markProxyAlive() {}, markProxyDead() {} };
    if (name.startsWith('.')) return loadTs(path.resolve(path.dirname(filename), name + '.ts'));
    return require(name);
  };
  new Function('require', 'module', 'exports', compiled)(resolve, module, module.exports);
  return module.exports;
}

(async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = blocked;
  try {
    const service = loadTs(path.join(root, 'src/services/summarize.ts'));
    const rules = loadTs(path.join(root, 'src/services/ruleSummary.ts'));
    const { KEYS, clearRetiredSummarySettings } = loadTs(path.join(root, 'src/services/storage.ts'));
    const source = 'UBND tỉnh công bố kế hoạch sửa chữa một tuyến đường quan trọng với kinh phí dự kiến 120 tỷ đồng. Tuy nhiên, kinh phí chưa được phê duyệt chính thức. Theo kế hoạch, công trình dự kiến khởi công vào năm sau nếu hoàn tất thủ tục.';
    const summary = await service.summarizeArticle(source, undefined, undefined, 'Kế hoạch sửa đường');
    assert.equal(summary, rules.buildRuleSummary(source, 'Kế hoạch sửa đường'));
    assert.match(summary, /chưa được phê duyệt/);
    const first = { link: 'https://example.com/first', title: 'Kế hoạch sửa đường', source: 'Báo thử nghiệm' };
    const second = { ...first, link: 'https://example.com/second' };
    const third = { ...first, link: 'https://example.com/third' };
    memory.set(KEYS.history, JSON.stringify([{ url: first.link, title: first.title, summary: 'Old provider output', date: '2026-01-01', source: first.source }]));
    await Promise.all([first, second, third].map(item => service.saveSummaryToHistory(item, summary, source, 'article')));
    const history = JSON.parse(memory.get(KEYS.history));
    assert.equal(history.length, 3, 'Concurrent prefetches must retain all records');
    assert.equal(new Set(history.map(r => r.url)).size, 3);
    assert.ok(history.every(r => r.method === 'rules' && r.summaryVersion === rules.RULE_SUMMARY_VERSION && r.summaryInputHash === rules.fingerprintSummaryInput(source)));
    await service.saveSummaryToHistory(first, 'A shorter RSS description with incomplete facts.', 'RSS', 'description');
    const preserved = JSON.parse(memory.get(KEYS.history)).find(r => r.url === first.link);
    assert.equal(preserved.summary, summary, 'An RSS result must not overwrite the complete article');
    assert.equal(preserved.summarySource, 'article');
    assert.equal(service.buildExtractiveSummary(first.title, [{ type: 'text', text: source }, { type: 'image', caption: 'This caption must not become a news fact.' }]), summary);
    memory.set('@nim_key','test-old-secret');
    memory.set('@nim_model','retired-model');
    memory.set('@llm_provider','retired-provider');
    memory.set(KEYS.saved,JSON.stringify([first]));
    memory.set(KEYS.pitch,'1.1');
    await clearRetiredSummarySettings();
    for(const key of ['@nim_key','@nim_model','@llm_provider'])assert.equal(memory.has(key),false);
    assert.equal(memory.get(KEYS.pitch),'1.1');
    assert.deepEqual(JSON.parse(memory.get(KEYS.saved)),[first]);
    assert.equal(JSON.parse(memory.get(KEYS.history)).length,3);
    assert.equal(networkCalls, 0);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'server/proxy.js'), 'utf8'), /app\.post\(['"]\/api\/llm/);
    console.log('Summary service passed: local selection, concurrent cache writes, legacy replacement, complete-source priority, no provider transport or network requests.');
  } finally { globalThis.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
