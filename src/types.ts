export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  image?: string;
  source: string; // tên tờ báo (publisher), ví dụ "VNExpress"
  category?: string; // chủ đề của feed cụ thể, ví dụ "Công nghệ"
}

export interface SummaryRecord {
  url: string;
  title: string;
  summary: string;
  date: string;
  source: string;
}