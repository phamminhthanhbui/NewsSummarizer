export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  image?: string;
  source: string; // tên tờ báo (publisher), ví dụ "VNExpress"
  category?: string; // chủ đề của feed cụ thể, ví dụ "Công nghệ"
  featured?: boolean; // thuộc feed "tin nổi bật" — ưu tiên lên carousel trang chủ
}

export interface SummaryRecord {
  url: string;
  title: string;
  summary: string;
  date: string;
  source: string;
}