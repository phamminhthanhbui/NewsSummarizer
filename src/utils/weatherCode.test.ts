// Self-check: node --experimental-strip-types src/utils/weatherCode.test.ts
import assert from 'node:assert';
import { describeWeather, weekdayShort } from './weatherCode.ts';

// 1. Từng mã WMO phải rơi đúng nhóm. Bảng mã: open-meteo.com/en/docs
//    Mỗi nhóm lấy cả mã ĐẦU và mã CUỐI — sai một đầu là lọt nhóm bên cạnh.
const cases: [number, string, string][] = [
  [0, 'sunny', 'Trời quang'],
  [1, 'partly-sunny', 'Ít mây'],
  [2, 'partly-sunny', 'Ít mây'],
  [3, 'cloudy', 'Nhiều mây'],
  [45, 'cloud', 'Sương mù'],
  [48, 'cloud', 'Sương mù'],
  [51, 'rainy', 'Mưa phùn'],
  [57, 'rainy', 'Mưa phùn'],
  [61, 'rainy', 'Mưa'],
  [67, 'rainy', 'Mưa'],
  [71, 'snow', 'Tuyết'],
  [77, 'snow', 'Tuyết'],
  [80, 'rainy', 'Mưa rào'],
  [82, 'rainy', 'Mưa rào'],
  [85, 'snow', 'Mưa tuyết'],
  [86, 'snow', 'Mưa tuyết'],
  [95, 'thunderstorm', 'Dông'],
  [99, 'thunderstorm', 'Dông'],
];
for (const [code, icon, label] of cases) {
  const got = describeWeather(code);
  assert.deepStrictEqual(got, { icon, label }, `mã ${code} -> ${JSON.stringify(got)}`);
}

// 2. Thứ tự thang bậc là thứ DỄ hỏng nhất: các nhánh là `<=`, nên đảo nhánh
//    80-82 lên trước 71-77 là 71-77 lặng lẽ thành "Mưa rào" (tuyết -> mưa).
//    Khẳng định thẳng: mưa rào KHÔNG được là tuyết và ngược lại.
assert.strictEqual(describeWeather(82).label, 'Mưa rào');
assert.strictEqual(describeWeather(77).label, 'Tuyết');
assert.notStrictEqual(describeWeather(77).icon, describeWeather(82).icon);

// 3. weekdayShort — neo vào ngày biết chắc thứ. 2026-10-03 là Thứ Bảy.
//    Nếu parse 'YYYY-MM-DD' trần (hiểu là UTC) thì ở GMT+7 sẽ ra Thứ Sáu (T6).
assert.strictEqual(weekdayShort('2026-10-03'), 'T7', 'lệch ngày do parse UTC');
assert.strictEqual(weekdayShort('2026-10-04'), 'CN');
assert.strictEqual(weekdayShort('2026-10-05'), 'T2');
// Mốc đầu năm — ca hay lộ lỗi lệch ngày nhất.
assert.strictEqual(weekdayShort('2026-01-01'), 'T5');

console.log('weatherCode: 18 mã WMO + 4 mốc thứ — OK');
