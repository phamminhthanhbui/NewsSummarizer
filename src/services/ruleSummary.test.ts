// Run: node --experimental-strip-types src/services/ruleSummary.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRuleSummary, selectRuleSummary, splitNewsSentences, fingerprintSummaryInput, isCurrentRuleSummary, RULE_SUMMARY_VERSION } from './ruleSummary.ts';

const article = [
  'Ngày 5/10, UBND TP.HCM công bố kế hoạch cải tạo tuyến đường Nguyễn Văn Linh với kinh phí dự kiến 125,5 tỷ đồng.',
  'Dự án gồm sửa mặt đường, bổ sung đèn chiếu sáng và cải thiện hệ thống thoát nước tại các điểm thường xuyên ngập.',
  'Ban quản lý dự án cho biết công trình được chia thành hai giai đoạn để hạn chế ảnh hưởng đến việc đi lại của người dân.',
  'Tuy nhiên, mức kinh phí 125,5 tỷ đồng mới là ước tính và chưa được phê duyệt chính thức.',
  'Các tuyến xe buýt vẫn hoạt động trong thời gian thi công, nhưng một số điểm dừng sẽ được điều chỉnh.',
  'Sở Giao thông sẽ công bố phương án phân luồng sau khi hoàn tất khảo sát thực địa.',
  'Theo kế hoạch, công trình dự kiến bắt đầu trong quý I năm 2027 nếu hoàn tất thủ tục đúng hạn.',
].join('\n\n');

test('keeps a grounded lead, original facts and explicit conditional next step', () => {
  const s = selectRuleSummary(article, 'TP.HCM dự kiến cải tạo đường Nguyễn Văn Linh');
  assert.match(s.intro, /UBND TP.HCM/);
  assert.match(s.intro, /dự kiến 125,5 tỷ đồng/);
  assert.ok(s.points.length >= 3 && s.points.length <= 5);
  assert.equal(s.conclusionLabel, 'Tiếp theo');
  assert.match(s.conclusion, /nếu hoàn tất thủ tục đúng hạn/);
  assert.match(buildRuleSummary(article), /chưa được phê duyệt chính thức/);
});

test('chosen sentences come from the source and stay in source order', () => {
  const s = selectRuleSummary(article, 'Cải tạo đường Nguyễn Văn Linh');
  let cursor = -1;
  for (const sentence of s.selectedSentences) {
    const position = article.indexOf(sentence);
    assert.ok(position > cursor, sentence);
    cursor = position;
  }
});

test('protects decimal, date, location and professional abbreviations', () => {
  const input = 'TS. Nguyễn An ở TP.HCM cho biết giá tăng 1,5% vào ngày 5/10/2026. Nhóm nghiên cứu chưa công bố kết luận.';
  const s = splitNewsSentences(input);
  assert.equal(s.length, 2);
  assert.equal(s[0], input.slice(0, input.indexOf(' Nhóm')));
});

test('preserves quotation, attribution, negation and uncertainty', () => {
  const input = 'TS. Nguyễn An cho biết: “Kết quả này chưa chứng minh thuốc có hiệu quả.” Nhóm nghiên cứu có thể công bố thêm dữ liệu sau khi kiểm chứng.';
  const s = buildRuleSummary(input);
  assert.match(s, /Nguyễn An cho biết/);
  assert.match(s, /chưa chứng minh thuốc có hiệu quả/);
  assert.match(s, /có thể công bố/);
});

test('never adds a result or next-step heading when the source has neither', () => {
  const s = selectRuleSummary([
    'Triển lãm giới thiệu hơn 100 tác phẩm của các họa sĩ trẻ tại Hà Nội.',
    'Không gian trưng bày bao gồm tranh sơn dầu, ảnh nghệ thuật và các tác phẩm điêu khắc.',
    'Khách tham quan được giới thiệu về chất liệu và ý tưởng của từng tác phẩm.',
    'Một số bức tranh phản ánh sinh hoạt thường ngày của người dân vùng biển.',
    'Khu vực ngoài trời trưng bày các tác phẩm sử dụng vật liệu tái chế.',
    'Ban tổ chức dành riêng một khu vực cho trẻ em trải nghiệm việc vẽ tranh.',
  ].join('\n\n'));
  assert.equal(s.conclusion, '');
  assert.equal(s.conclusionLabel, '');
});

test('removes repeated sentences, ads, timestamps and image metadata', () => {
  const first = 'Thành phố mở tuyến xe buýt mới kết nối khu dân cư với nhà ga trung tâm.';
  const s = selectRuleSummary('Title: Tin xe buýt\nẢnh: Nguyễn An chụp tại thành phố\nQuảng cáo\n5/10/2026 09:30\n' + first + '\n' + first + '\nTuyến xe hoạt động từ 5 giờ đến 22 giờ mỗi ngày.');
  assert.equal(s.selectedSentences.filter(t => t === first).length, 1);
  const output = buildRuleSummary('Ảnh: Nguyễn An chụp tại thành phố\nQuảng cáo\n' + first);
  assert.doesNotMatch(output, /Quảng cáo|Ảnh:/);
});

test('similar wording with changed amounts or negation is not a duplicate', () => {
  const s = selectRuleSummary('Kinh phí dự kiến của dự án cải tạo đường là 100 tỷ đồng.\nKinh phí dự kiến của dự án cải tạo đường là 120 tỷ đồng.\nKinh phí của dự án cải tạo đường chưa được phê duyệt.');
  assert.equal(s.sourceSentenceCount, 3);
  assert.match(buildRuleSummary(s.selectedSentences.join('\n')), /100 tỷ/);
  assert.match(buildRuleSummary(s.selectedSentences.join('\n')), /120 tỷ/);
  assert.match(buildRuleSummary(s.selectedSentences.join('\n')), /chưa được/);
});

test('retains antecedent with dependent pronouns and contrasting caveats', () => {
  const input = 'UBND tỉnh đề xuất xây dựng một hồ chứa nước phục vụ sản xuất nông nghiệp.\nMột đơn vị tư vấn ước tính nhu cầu sử dụng nước trong khu vực tăng khoảng 20%.\nDự án có tổng kinh phí dự kiến 900 tỷ đồng từ ngân sách địa phương.\nĐiều này chưa có nghĩa dự án đã được phê duyệt hoặc được bố trí vốn.\nNgười dân trong vùng khảo sát được mời góp ý về phương án tái định cư.\nTheo kế hoạch, tỉnh sẽ công bố phương án sau khi tiếp thu ý kiến người dân.';
  const s = selectRuleSummary(input, 'Hồ chứa nước 900 tỷ đồng chưa được phê duyệt');
  assert.match(buildRuleSummary(input, 'Hồ chứa nước 900 tỷ đồng chưa được phê duyệt'), /chưa có nghĩa/);
  for (const point of s.points) assert.doesNotMatch(point, /^Điều này/);
});

test('keeps long sentences whole rather than truncating a qualifier', () => {
  const sentence = 'UBND tỉnh thông báo ' + 'việc khảo sát tuyến đường và đánh giá tác động môi trường '.repeat(9) + 'chưa hoàn tất và chưa có quyết định khởi công.';
  const s = selectRuleSummary(sentence);
  assert.equal(s.intro, sentence);
  assert.doesNotMatch(buildRuleSummary(sentence), /…/);
});

test('drops clipped RSS tails while retaining complete preceding sentences', () => {
  const first = 'Thành phố ghi nhận lượng khách du lịch tăng trong tháng vừa qua.';
  const s = buildRuleSummary(first + ' Số liệu mới nhất về tổng doanh thu của các đơn vị kinh doanh…');
  assert.equal(s, first);
});

test('handles a short description without inventing extra bullet points', () => {
  const s = selectRuleSummary('Đội tuyển Việt Nam thắng trận giao hữu với tỷ số 3-0.');
  assert.equal(s.points.length, 0);
  assert.equal(s.conclusion, '');
  assert.match(s.intro, /3-0/);
});

test('empty input has no fabricated summary', () => {
  assert.equal(buildRuleSummary(''), '');
  assert.equal(buildRuleSummary('Quảng cáo\nẢnh: Nguyễn An tại lễ khai mạc'), '');
});

test('marks only the current local engine cache as reusable', () => {
  assert.equal(isCurrentRuleSummary({ summary: 'Old provider output' }), false);
  assert.equal(isCurrentRuleSummary({ summary: 'Local', method: 'rules', summaryVersion: 'older-version' }), false);
  assert.equal(isCurrentRuleSummary({ summary: 'Local', method: 'rules', summaryVersion: RULE_SUMMARY_VERSION }), true);
});

test('input fingerprints ignore whitespace but detect changed facts', () => {
  assert.equal(fingerprintSummaryInput('Kinh phí 100 tỷ.\n\nChưa phê duyệt.'), fingerprintSummaryInput('Kinh phí 100 tỷ. Chưa phê duyệt.'));
  assert.notEqual(fingerprintSummaryInput('Kinh phí 100 tỷ.'), fingerprintSummaryInput('Kinh phí 120 tỷ.'));
});

test('engine is deterministic and works with all network access disabled', () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('Network must not be called'); }) as typeof fetch;
  try { assert.equal(buildRuleSummary(article), buildRuleSummary(article)); }
  finally { globalThis.fetch = original; }
});
