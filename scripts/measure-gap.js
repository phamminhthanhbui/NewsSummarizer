// Đo khoảng trống đầu màn hình: tìm các cluster pixel sáng (chữ/icon trắng)
// theo cột dọc giữa màn hình, in ra vị trí từng cluster.
const sharp = require('sharp');

(async () => {
  const img = sharp('C:/Users/Admin/Downloads/devhome.png');
  const { width, height } = await img.metadata();
  const { data } = await img
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Với mỗi hàng, tính max brightness trên toàn hàng
  const rows = [];
  for (let y = 0; y < height; y++) {
    let max = 0;
    for (let x = 0; x < width; x++) {
      const v = data[y * width + x];
      if (v > max) max = v;
      if (max >= 240) break;
    }
    rows.push(max);
  }

  // Gom cluster: hàng sáng liên tục (>=200), cách nhau >=10px
  const clusters = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    const bright = rows[y] >= 200;
    if (bright && start < 0) start = y;
    if ((!bright || y === height - 1) && start >= 0) {
      if (y - start > 2) clusters.push([start, y - 1]);
      start = -1;
    }
  }

  console.log('Kích thước ảnh:', width, 'x', height);
  console.log('Density 450 => 1dp = 2.8125px');
  console.log('--- Clusters sáng (hàng bắt đầu - kết thúc, chiều cao) ---');
  for (const [s, e] of clusters.slice(0, 12)) {
    console.log(`y ${s} -> ${e}  (cao ${e - s + 1}px, ${(e - s + 1) / 2.8125 | 0}dp)`);
  }
  if (clusters.length >= 2) {
    const [aStart] = clusters[0];
    const [bStart] = clusters[1];
    console.log('--- Khoảng trống giữa cluster 1 (status bar) và cluster 2 (TIN TỨC) ---');
    console.log(`gap = ${bStart - aStart}px = ${((bStart - aStart) / 2.8125).toFixed(1)}dp`);
  }
})();
