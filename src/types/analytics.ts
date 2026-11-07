export interface EngagementStats {
  views: number;
  impressions: number;
  likes: number;
  uniqueViewers: number;
  watchSeconds: number;
  watchViewers: number;
  avgWatchSeconds: number;
}
export interface DayStats extends EngagementStats { date: string }
export interface CreatorAnalytics { data: DayStats[]; summary: EngagementStats }
