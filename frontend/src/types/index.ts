export interface Report {
  id: number;
  report_date: string;
  content: string;
}
export interface Week {
  id: number;
  week_start: string;
  filename: string;
  reports: Report[];
}
export type View = 'tagesbericht' | 'offene-berichte' | 'wochenarchiv';
declare global {
  interface Window {
    BERICHTER_CONFIG?: {
      apiBase?: string;
    };
  }
}
