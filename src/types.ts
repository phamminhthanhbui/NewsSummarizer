export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  image?: string;
  source: string; // tên tờ báo (publisher), ví dụ "VNExpress"
  category?: string; // chủ đề của feed cụ thể, ví dụ "Công nghệ"
}

// Video crawl từ trang video của báo (RSS không có video/live)
export interface VideoItem {
  title: string;
  link: string;
  thumb: string;
  duration: string;
  pubDate: string;
  zone: string;
  source: string; // tờ báo: "Kenh14", "Soha"...
}

export interface SummaryRecord {
  url: string;
  title: string;
  summary: string;
  date: string;
  source: string;
}