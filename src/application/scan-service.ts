import { ScanResult, TopSignal, RawFeed } from '@/domain/scan-result';
import { SourceConfiguration } from '@/domain/source-config';
import { SourceFetcher } from '@/infrastructure/source-fetcher';
import { logger } from '@/utils/logger';

export class ScanService {
    constructor(private config: SourceConfiguration, private sourceFetcher: SourceFetcher) {}

    async performScan(): Promise<ScanResult> {
        logger.info('Starting daily scan', {
            timezone: this.config.scan_config.timezone,
            topicCount: this.config.topics.length,
        });

        const scanResult: ScanResult = {
            date: new Date().toISOString().split('T')[0],
            timezone: this.config.scan_config.timezone,
            top_signals: [],
            trend_watchlist: [],
            security_alerts: [],
            aws_platform_changes: [],
            ai_trends: [],
            corporate_hims_hers: [],
            developer_experience: [],
            raw_feed: [],
        };

        // Fetch all sources
        const allFeeds: RawFeed[] = [];
        for (const topic of this.config.topics) {
            logger.info('Processing topic', { topic: topic.name, sourceCount: topic.sources.length });

            for (const source of topic.sources) {
                try {
                    const feeds = await this.sourceFetcher.fetchSource(
                        source,
                        this.config.scan_config.lookback_hours,
                    );
                    allFeeds.push(...feeds);
                    logger.info('Source fetched', { source: source.name, itemCount: feeds.length });
                } catch (error) {
                    logger.error('Error fetching source', { source: source.name, error });
                    // Continue with other sources
                }
            }
        }

        scanResult.raw_feed = allFeeds;

        // Process and categorize feeds
        scanResult.top_signals = this.extractTopSignals(allFeeds);
        scanResult.security_alerts = this.extractSecurityAlerts(allFeeds);
        scanResult.aws_platform_changes = this.extractAwsPlatformChanges(allFeeds);
        scanResult.ai_trends = this.extractAiTrends(allFeeds);
        scanResult.corporate_hims_hers = this.extractCorporateNews(allFeeds);
        scanResult.developer_experience = this.extractDeveloperExperience(allFeeds);
        scanResult.trend_watchlist = this.extractTrendWatchlist(allFeeds);

        logger.info('Scan completed', {
            topSignals: scanResult.top_signals.length,
            securityAlerts: scanResult.security_alerts.length,
            awsChanges: scanResult.aws_platform_changes.length,
            aiTrends: scanResult.ai_trends.length,
            rawFeedItems: scanResult.raw_feed.length,
        });

        return scanResult;
    }

    private extractTopSignals(feeds: RawFeed[]): TopSignal[] {
        // Implementation placeholder - will use AI/LLM to analyze feeds and extract top signals
        // For now, return a sample structure
        logger.info('Extracting top signals from feeds', { feedCount: feeds.length });

        // This would typically use Claude API or similar to analyze the feeds
        // and extract the most important signals based on the requirements
        return [];
    }

    private extractSecurityAlerts(feeds: RawFeed[]) {
        logger.info('Extracting security alerts from feeds', { feedCount: feeds.length });
        // Implementation placeholder - filter and process security-related feeds
        return [];
    }

    private extractAwsPlatformChanges(feeds: RawFeed[]) {
        logger.info('Extracting AWS platform changes from feeds', { feedCount: feeds.length });
        // Implementation placeholder - filter and process AWS-related feeds
        return [];
    }

    private extractAiTrends(feeds: RawFeed[]) {
        logger.info('Extracting AI trends from feeds', { feedCount: feeds.length });
        // Implementation placeholder - filter and process AI-related feeds
        return [];
    }

    private extractCorporateNews(feeds: RawFeed[]) {
        logger.info('Extracting corporate news from feeds', { feedCount: feeds.length });
        // Implementation placeholder - filter and process Hims & Hers news
        return [];
    }

    private extractDeveloperExperience(feeds: RawFeed[]) {
        logger.info('Extracting developer experience updates from feeds', { feedCount: feeds.length });
        // Implementation placeholder - filter and process DX-related feeds
        return [];
    }

    private extractTrendWatchlist(feeds: RawFeed[]) {
        logger.info('Extracting trend watchlist from feeds', { feedCount: feeds.length });
        // Implementation placeholder - analyze trends across feeds
        return [];
    }

    private determineSeverity(content: string): 'high' | 'medium' | 'low' {
        const contentLower = content.toLowerCase();

        // Check high severity keywords
        for (const keyword of this.config.severity_rules.high) {
            if (contentLower.includes(keyword.toLowerCase())) {
                return 'high';
            }
        }

        // Check medium severity keywords
        for (const keyword of this.config.severity_rules.medium) {
            if (contentLower.includes(keyword.toLowerCase())) {
                return 'medium';
            }
        }

        return 'low';
    }

    private determineImpact(
        content: string,
    ): Array<'Regulatory' | 'Platform' | 'Security' | 'DX' | 'Cost' | 'Org/Strategy'> {
        const impacts: Array<'Regulatory' | 'Platform' | 'Security' | 'DX' | 'Cost' | 'Org/Strategy'> = [];
        const contentLower = content.toLowerCase();

        type ImpactType = 'Regulatory' | 'Platform' | 'Security' | 'DX' | 'Cost' | 'Org/Strategy';
        for (const [impactType, keywords] of Object.entries(this.config.impact_keywords)) {
            for (const keyword of keywords) {
                if (contentLower.includes(keyword.toLowerCase())) {
                    impacts.push(impactType as ImpactType);
                    break;
                }
            }
        }

        return impacts.length > 0 ? impacts : ['Platform'];
    }
}
