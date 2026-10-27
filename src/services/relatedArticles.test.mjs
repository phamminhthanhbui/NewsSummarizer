import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedArticles } from './relatedArticles.ts';

const article = { title: 'Bí thư Hà Nội tiếp công dân, chỉ đạo giải quyết 5 vụ việc', link: 'https://tienphong.vn/current.tpo', source: 'Tiền Phong', category: 'Việt Nam' };

test('related feed never lists random news from the same publisher', () => {
  const pool = [
    { title: 'Thiên thần mới của Victoria’s Secret đánh bại 100.000 ứng viên', link: 'https://tienphong.vn/fashion.tpo', source: 'Tiền Phong', category: 'Giải trí' },
    { title: 'Chất lượng không khí miền Bắc những ngày tới thế nào?', link: 'https://tienphong.vn/weather.tpo', source: 'Tiền Phong', category: 'Việt Nam' },
    { title: 'Mâu thuẫn khi livestream trên TikTok, hai nhóm hẹn nhau giải quyết', link: 'https://tienphong.vn/other.tpo', source: 'Tiền Phong', category: 'Việt Nam' },
    { title: 'Bí thư Hà Nội: Tập trung thực hiện mục tiêu tăng trưởng trong quý IV', link: 'https://tienphong.vn/related.tpo', source: 'Tiền Phong', category: 'Việt Nam' },
    { title: 'Bí thư Hà Nội tiếp dân và giải quyết kiến nghị', link: 'https://nhandan.vn/related.html', source: 'Nhân Dân', category: 'Việt Nam' },
  ];
  const matches = relatedArticles(article, pool, 5);
  assert.deepEqual(matches.map((a) => a.link), ['https://nhandan.vn/related.html', 'https://tienphong.vn/related.tpo']);
});

test('empty results preferred over unrelated articles and duplicates are removed', () => {
  assert.deepEqual(relatedArticles(article, [{title: 'Thị trường bóng đá mùa mới', link: 'a', source: 'Tiền Phong'}]), []);
  assert.equal(relatedArticles(article, [
    {...article, link: 'https://tienphong.vn/related.tpo'},
    {...article, link: 'https://tienphong.vn/related.tpo'},
  ]).length, 1);
});
