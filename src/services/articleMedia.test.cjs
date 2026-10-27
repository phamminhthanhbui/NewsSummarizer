const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const name = path.join(__dirname, 'summarize.ts');
const code = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
  fileName: name, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const bodyText = 'Bí thư Hà Nội tiếp công dân và chỉ đạo giải quyết các vụ việc về đất đai, nhà ở. '.repeat(8);
const html = `<html><head><meta property="og:image" content="https://cdn.tienphong.vn/images/story-hero.jpg"></head><body>
<div class="article__body" itemprop="articleBody">
<p>${bodyText}</p><figure><img src="https://cdn.tienphong.vn/images/story-main.jpg" alt="Ảnh buổi tiếp công dân"></figure>
<p>Thành phố tiếp tục giải quyết theo quy định.</p>
</div>
<div class="article-footer"><section class="related-news"><article class="story">
<a href="https://tienphong.vn/other-news-post123.tpo"><img src="https://cdn.tienphong.vn/images/unrelated-news.jpg" alt="Một tin không liên quan"></a>
</article><video><source src="https://cdn.tienphong.vn/video/unrelated-video.mp4"></video><p>Victoria Secret và tin thể thao</p></section></div>
</body></html>`;
const load = new Module(name, module);
load.filename = name;
load.paths = module.paths;
load.require = (id) => {
  if (id === 'react-native') return { Platform: { OS: 'web' } };
  if (id === './storage') return { KEYS: {}, LIMITS: { articleMinLength: 200 } };
  if (id === '@react-native-async-storage/async-storage') return { default: {} };
  if (id === '../utils/proxy') return { proxiedFetchText: async () => html };
  if (id === '../utils/parseQueue') return { runCpuTask: async (fn) => fn() };
  if (id === '../utils/audioSrc') return { pickAudioUrl: () => null };
  if (id === './ruleSummary') return {};
  return require(id);
};
load._compile(code, name);
const url = 'https://tienphong.vn/current-story-post100.tpo';

test('HTML media only includes the article body, not news sidebar', async () => {
  const media = await load.exports.fetchArticleMedia(url);
  const filenames = media.filter(x=>x.url).map(x=>x.url);
  assert.ok(filenames.some(u=>u.includes('story-main.jpg')), 'original image is retained');
  assert.ok(filenames.every(u=>!u.includes('unrelated')), 'other article media is removed');
  assert.ok(media.every(x=>x.type !== 'video'), 'video from related section is removed');
});

test('fast article text stops before related news', async () => {
  const text = await load.exports.fetchArticleTextFast(url);
  assert.match(text, /Bí thư Hà Nội tiếp công dân/);
  assert.doesNotMatch(text, /Victoria Secret|tin thể thao/);
});
