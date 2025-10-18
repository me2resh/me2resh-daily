import { ScanService } from '@/application/scan-service';
import { SourceFetcher } from '@/infrastructure/source-fetcher';
import { RawFeed, ScanResult } from '@/domain/scan-result';
import { Source, SourceConfiguration } from '@/domain/source-config';

class StubFetcher implements SourceFetcher {
    constructor(private readonly feedsBySource: Record<string, RawFeed[]>) {}

    async fetchSource(source: Source, _lookbackHours: number): Promise<RawFeed[]> {
        return this.feedsBySource[source.name] || [];
    }
}

const buildConfig = (overrides?: Partial<SourceConfiguration>): SourceConfiguration => ({
    email: {
        to_address: 'to@example.com',
        from_address: 'from@example.com',
        subject_prefix: 'Test',
    },
    scan_config: {
        timezone: 'UTC',
        scan_time: '00:00',
        lookback_hours: 72,
    },
    topics: [],
    severity_rules: {
        high: ['critical vulnerability'],
        medium: ['update', 'release'],
        low: ['advisory'],
    },
    impact_keywords: {
        Regulatory: ['regulation'],
        Platform: ['aws'],
        Security: ['vulnerability', 'cve'],
        DX: ['developer'],
        Cost: ['cost'],
        'Org/Strategy': ['strategy'],
    },
    ...overrides,
});

const isoNow = new Date().toISOString();

describe('ScanService', () => {
    it('categorizes feeds into the correct sections based on topic category', async () => {
        const config = buildConfig({
            topics: [
                {
                    name: 'Security Advisories',
                    category: 'security',
                    priority: 1,
                    sources: [
                        {
                            name: 'Security RSS',
                            url: 'https://security.example.com',
                            type: 'rss',
                            keywords: ['security'],
                        },
                    ],
                },
                {
                    name: 'AWS Platform Updates',
                    category: 'aws_platform',
                    priority: 1,
                    sources: [
                        {
                            name: 'AWS Blog',
                            url: 'https://aws.example.com',
                            type: 'rss',
                            keywords: ['aws'],
                        },
                    ],
                },
                {
                    name: 'FHIR Standards',
                    category: 'standards',
                    priority: 3,
                    sources: [
                        {
                            name: 'Standards RSS',
                            url: 'https://standards.example.com',
                            type: 'rss',
                            keywords: ['regulation'],
                        },
                    ],
                },
            ],
        });

        const feedsBySource: Record<string, RawFeed[]> = {
            'Security RSS': [
                {
                    title: 'Critical vulnerability CVE-2025-1234 disclosed',
                    source: 'Security RSS',
                    source_url: 'https://security.example.com/cve-2025-1234',
                    published_at: isoNow,
                },
            ],
            'AWS Blog': [
                {
                    title: 'AWS releases new update for Lambda developers',
                    source: 'AWS Blog',
                    source_url: 'https://aws.example.com/lambda-update',
                    published_at: isoNow,
                },
            ],
            'Standards RSS': [
                {
                    title: 'New regulation update for HL7 standards',
                    source: 'Standards RSS',
                    source_url: 'https://standards.example.com/regulation',
                    published_at: isoNow,
                },
            ],
        };

        const fetcher = new StubFetcher(feedsBySource);
        const service = new ScanService(config, fetcher);

        const result: ScanResult = await service.performScan();

        expect(result.raw_feed).toHaveLength(3);
        expect(result.security_alerts).toHaveLength(1);
        expect(result.security_alerts[0]).toMatchObject({
            component: 'Security RSS',
            cve: 'CVE-2025-1234',
        });

        expect(result.aws_platform_changes).toHaveLength(1);
        expect(result.aws_platform_changes[0]).toMatchObject({
            service: 'AWS Blog',
        });

        expect(result.top_signals.length).toBeGreaterThanOrEqual(1);
        expect(result.top_signals[0].impact).toContain('Security');

        expect(result.trend_watchlist).toHaveLength(1);
        expect(result.trend_watchlist[0]).toMatchObject({
            topic: 'Standards',
            trajectory: 'fading',
        });
    });
});
