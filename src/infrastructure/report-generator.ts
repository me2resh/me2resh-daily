import { ScanResult } from '@/domain/scan-result';

export interface ReportGenerationItem {
    title: string;
    source: string;
    source_url: string;
    published_at: string;
    domain: string;
    status_code: number;
    checked_at: string;
}

export interface ReportGenerationInput {
    date: string;
    timezone: string;
    items: ReportGenerationItem[];
    lookback_hours?: number; // Optional: used to customize ChatGPT filtering instructions
}

export interface ReportGenerator {
    generateReport(params: ReportGenerationInput): Promise<ScanResult>;
}
