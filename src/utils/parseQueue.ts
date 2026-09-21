// Hàng đợi cho job CPU nặng (regex parse XML/HTML lớn) chạy trên JS thread.
//
// Vì sao cần: JS single-thread — khi cold-start bắn 44 feed + 6 crawler video,
// các response về theo đợt và parse đè lên nhau khiến touch/press (xử lý trên
// JS) không phản hồi 3-5s dù UI đã render.
//
// Cách hoạt động:
// - TUẦN TỰ hoá: parse chạy song song cũng phải xếp hàng ở CPU — tuần tự hoá
//   KHÔNG mất throughput, chỉ thêm kẽ hở giữa các job.
// - Mỗi job cách nhau 1 macrotask (setTimeout 0) → event loop kịp xử lý các
//   touch/press đang chờ → tap luôn phản hồi trong vòng ~1 parse (~10-50ms).
type CpuJob<T> = () => T | Promise<T>;

let tail: Promise<unknown> = Promise.resolve();
// 32ms (~2 frame 60fps) giữa 2 job — setTimeout 0 KHÔNG đủ: event loop chưa kịp
// dispatch touch đã chạy job kế → tap lúc mới launch vẫn treo 5-7s dù queue tuần tự.
const YIELD_MS = 32;
const yieldTick = () => new Promise<void>((resolve) => setTimeout(resolve, YIELD_MS));

export function runCpuTask<T>(job: CpuJob<T>): Promise<T> {
  const run = tail.then(yieldTick).then(job) as Promise<T>;
  // Job ném lỗi vẫn trả cho caller, queue phải chạy tiếp
  tail = run.catch(() => {});
  return run;
}
