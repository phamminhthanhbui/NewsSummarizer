export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  image?: string;
  source: string;
}

export interface SummaryRecord {
  url: string;
  title: string;
  summary: string;
  date: string;
  source: string;
}