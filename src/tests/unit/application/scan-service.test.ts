import { ScanService } from '@/application/scan-service';
import { ResearchService, ResearchResult } from '@/application/research-service';
import { ScanResult } from '@/domain/scan-result';
import { SourceConfiguration } from '@/domain/source-config';

class StubResearchService {
    public lastDate: string | null = null;
    public lastTimezone: string | null = null;

    constructor(private readonly result: Partial<ScanResult>) {}

    async performResearch(date: string, timezone: string): Promise<ResearchResult> {
        this.lastDate = date;
        this.lastTimezone = timezone;
        return {
            report: this.result,
            query: 'stub query',
        };
    }
}

const baseConfig: SourceConfiguration = {
    email: {
        to_address: 'to@example.com',
        from_address: 'from@example.com',
        subject_prefix: 'Test',
    },
    scan_config: {
        timezone: 'Europe/London',
        scan_time: '05:00',
        lookback_hours: 72,
    },
    topics: [],
    severity_rules: {
        high: [],
        medium: [],
        low: [],
    },
    impact_keywords: {},
};

describe('ScanService (Perplexity-Only)', () => {
    it('calls research service with correct date and timezone', async () => {
        const perplexityReport: Partial<ScanResult> = {
            top_signals: [],
            trend_watchlist: [],
            security_alerts: [],
            aws_platform_changes: [],
            ai_trends: [],
            corporate_competitors: [],
            developer_experience: [],
            raw_feed: [],
        };

        const researchService = new StubResearchService(perplexityReport) as unknown as ResearchService;
        const service = new ScanService(baseConfig, researchService);

        await service.performScan();

        const stub = researchService as unknown as StubResearchService;
        expect(stub.lastDate).not.toBeNull();
        expect(stub.lastTimezone).toBe('Europe/London');
    });

    it('returns complete ScanResult with all required fields', async () => {
        const perplexityReport: Partial<ScanResult> = {
            top_signals: [
                {
                    title: 'Test Signal',
                    why_it_matters: 'Test matters because test',
                    impact: ['Platform'],
                    severity: 'high',
                    source_url: 'https://example.com',
                    published_at: '2025-10-22',
                    notes_for_actions: [],
                },
            ],
            security_alerts: [],
            aws_platform_changes: [],
        };

        const researchService = new StubResearchService(perplexityReport) as unknown as ResearchService;
        const service = new ScanService(baseConfig, researchService);

        const result = await service.performScan();

        expect(result.scanResult.date).toBeDefined();
        expect(result.scanResult.timezone).toBe('Europe/London');
        expect(result.scanResult.top_signals).toHaveLength(1);
        expect(result.scanResult.security_alerts).toEqual([]);
        expect(result.scanResult.corporate_competitors).toEqual([]);
        expect(result.prompts.perplexity).toBeDefined();
    });

    it('handles empty Perplexity response', async () => {
        const researchService = new StubResearchService({}) as unknown as ResearchService;
        const service = new ScanService(baseConfig, researchService);

        const result = await service.performScan();

        expect(result.scanResult.top_signals).toEqual([]);
        expect(result.scanResult.security_alerts).toEqual([]);
        expect(result.scanResult.aws_platform_changes).toEqual([]);
        expect(result.scanResult.ai_trends).toEqual([]);
        expect(result.scanResult.corporate_competitors).toEqual([]);
        expect(result.scanResult.developer_experience).toEqual([]);
        expect(result.scanResult.raw_feed).toEqual([]);
    });
});
