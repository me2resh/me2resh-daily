import { ScanService } from '@/application/scan-service';
import { RawFeed, ScanResult } from '@/domain/scan-result';
import { Source, SourceConfiguration } from '@/domain/source-config';
import { ReportGenerationInput, ReportGenerator } from '@/infrastructure/report-generator';
import { SourceFetcher } from '@/infrastructure/source-fetcher';

class StubFetcher implements SourceFetcher {
    constructor(private readonly feedsBySource: Record<string, RawFeed[]>) {}

    async fetchSource(source: Source, _lookbackHours?: number): Promise<RawFeed[]> {
        return this.feedsBySource[source.name] || [];
    }
}

class StubReportGenerator implements ReportGenerator {
    public lastInput: ReportGenerationInput | null = null;

    constructor(private readonly result: ScanResult) {}

    async generateReport(input: ReportGenerationInput): Promise<ScanResult> {
        this.lastInput = input;
        return this.result;
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

const isoNow = new Date().toISOString();

describe('ScanService', () => {
    it('passes aggregated feed metadata to the report generator', async () => {
        const config: SourceConfiguration = {
            ...baseConfig,
            topics: [
                {
                    name: 'AWS Platform',
                    category: 'aws_platform',
                    priority: 1,
                    sources: [
                        {
                            name: 'AWS Blog',
                            url: 'https://aws.example.com',
                            type: 'rss',
                            keywords: [],
                        },
                    ],
                },
            ],
        };

        const feeds: Record<string, RawFeed[]> = {
            'AWS Blog': [
                {
                    title: 'AWS launches new compute option',
                    source: 'AWS Blog',
                    source_url: 'https://aws.example.com/compute',
                    published_at: isoNow,
                },
            ],
        };

        const expectedResult: ScanResult = {
            date: '2025-01-01',
            timezone: 'Europe/London',
            top_signals: [],
            trend_watchlist: [],
            security_alerts: [],
            aws_platform_changes: [],
            ai_trends: [],
            corporate_hims_hers: [],
            developer_experience: [],
            raw_feed: [
                {
                    title: 'Generator override',
                    source: 'LLM',
                    source_url: 'https://example.com',
                    published_at: isoNow,
                },
            ],
        };

        const fetcher = new StubFetcher(feeds);
        const generator = new StubReportGenerator(expectedResult);
        const service = new ScanService(config, fetcher, generator);

        const result = await service.performScan();

        expect(generator.lastInput).not.toBeNull();
        expect(generator.lastInput?.items).toHaveLength(1);
        expect(generator.lastInput?.items[0]).toMatchObject({
            topic: 'AWS Platform',
            category: 'aws_platform',
            source: 'AWS Blog',
        });

        expect(result).toEqual(expectedResult);
    });

    it('falls back to collected raw feeds when generator omits raw_feed', async () => {
        const config: SourceConfiguration = {
            ...baseConfig,
            topics: [
                {
                    name: 'Security',
                    category: 'security',
                    priority: 1,
                    sources: [
                        {
                            name: 'Security RSS',
                            url: 'https://security.example.com',
                            type: 'rss',
                            keywords: [],
                        },
                    ],
                },
            ],
        };

        const feeds: Record<string, RawFeed[]> = {
            'Security RSS': [
                {
                    title: 'New vulnerability discovered',
                    source: 'Security RSS',
                    source_url: 'https://security.example.com/vuln',
                    published_at: isoNow,
                },
            ],
        };

        const generatorResult: ScanResult = {
            date: '2025-02-02',
            timezone: 'Europe/London',
            top_signals: [],
            trend_watchlist: [],
            security_alerts: [],
            aws_platform_changes: [],
            ai_trends: [],
            corporate_hims_hers: [],
            developer_experience: [],
            raw_feed: [],
        };

        const fetcher = new StubFetcher(feeds);
        const generator = new StubReportGenerator(generatorResult);
        const service = new ScanService(config, fetcher, generator);

        const result = await service.performScan();

        expect(result.raw_feed).toEqual(feeds['Security RSS']);
    });
});
