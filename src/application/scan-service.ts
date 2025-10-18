import { RawFeed, ScanResult } from '@/domain/scan-result';
import { SourceConfiguration, Source } from '@/domain/source-config';
import { ReportGenerator, ReportGenerationItem } from '@/infrastructure/report-generator';
import { SourceFetcher } from '@/infrastructure/source-fetcher';
import { logger } from '@/utils/logger';

export class ScanService {
    constructor(
        private config: SourceConfiguration,
        private sourceFetcher: SourceFetcher,
        private reportGenerator: ReportGenerator,
    ) {}

    async performScan(): Promise<ScanResult> {
        logger.info('Starting daily scan', {
            timezone: this.config.scan_config.timezone,
            topicCount: this.config.topics.length,
        });

        const scanDate = new Date().toISOString().split('T')[0];
        const allFeeds: RawFeed[] = [];
        const generationItems: ReportGenerationItem[] = [];

        for (const topic of this.config.topics) {
            logger.info('Processing topic', { topic: topic.name, sourceCount: topic.sources.length });

            for (const source of topic.sources) {
                try {
                    const feeds = await this.sourceFetcher.fetchSource(
                        source,
                        this.config.scan_config.lookback_hours,
                    );
                    allFeeds.push(...feeds);

                    generationItems.push(
                        ...feeds.map((feed) =>
                            this.buildGenerationItem(
                                feed,
                                topic.category,
                                topic.name,
                                topic.priority,
                                source,
                            ),
                        ),
                    );

                    logger.info('Source fetched', { source: source.name, itemCount: feeds.length });
                } catch (error) {
                    logger.error('Error fetching source', { source: source.name, error });
                    // Continue with other sources
                }
            }
        }

        const report = await this.reportGenerator.generateReport({
            date: scanDate,
            timezone: this.config.scan_config.timezone,
            items: generationItems,
        });

        const finalResult: ScanResult = {
            date: report.date || scanDate,
            timezone: report.timezone || this.config.scan_config.timezone,
            top_signals: report.top_signals || [],
            trend_watchlist: report.trend_watchlist || [],
            security_alerts: report.security_alerts || [],
            aws_platform_changes: report.aws_platform_changes || [],
            ai_trends: report.ai_trends || [],
            corporate_hims_hers: report.corporate_hims_hers || [],
            developer_experience: report.developer_experience || [],
            raw_feed: report.raw_feed && report.raw_feed.length > 0 ? report.raw_feed : allFeeds,
        };

        logger.info('Scan completed', {
            topSignals: finalResult.top_signals.length,
            securityAlerts: finalResult.security_alerts.length,
            awsChanges: finalResult.aws_platform_changes.length,
            aiTrends: finalResult.ai_trends.length,
            rawFeedItems: finalResult.raw_feed.length,
        });

        return finalResult;
    }

    private buildGenerationItem(
        feed: RawFeed,
        category: string,
        topicName: string,
        priority: number,
        source: Source,
    ): ReportGenerationItem {
        return {
            title: feed.title,
            source: feed.source,
            source_url: feed.source_url,
            published_at: feed.published_at,
            topic: topicName,
            category,
            priority,
            source_type: source.type,
        };
    }
}
