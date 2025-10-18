import { ScanResult } from '@/domain/scan-result';

export interface ReportGenerationItem {
    title: string;
    source: string;
    source_url: string;
    published_at: string;
    topic: string;
    category: string;
    priority: number;
    source_type: string;
}

export interface ReportGenerationInput {
    date: string;
    timezone: string;
    items: ReportGenerationItem[];
}

export interface ReportGenerator {
    generateReport(params: ReportGenerationInput): Promise<ScanResult>;
}
