import { ScanResult } from '@/domain/scan-result';
import { SourceConfiguration } from '@/domain/source-config';
import { ResearchService } from './research-service';
import { PromptLog } from '@/infrastructure/report-storage';
import { logger } from '@/utils/logger';

export interface ScanServiceResult {
    scanResult: ScanResult;
    prompts: PromptLog;
}

export class ScanService {
    constructor(private config: SourceConfiguration, private researchService: ResearchService) {}

    async performScan(): Promise<ScanServiceResult> {
        logger.info('Starting Perplexity-only daily scan', {
            timezone: this.config.scan_config.timezone,
            lookbackHours: this.config.scan_config.lookback_hours,
        });

        const scanDate = new Date().toISOString().split('T')[0];
        const timezone = this.config.scan_config.timezone;
        const prompts: PromptLog = {};

        // Perform Perplexity research (returns complete ScanResult)
        logger.info('Performing Perplexity research for complete report');
        const perplexityResult = await this.researchService.performResearch(scanDate, timezone);

        // Save Perplexity query
        if (perplexityResult.query) {
            prompts.perplexity = {
                query: perplexityResult.query,
                timestamp: new Date().toISOString(),
            };
        }

        // Ensure report has required fields
        const scanResult: ScanResult = {
            date: scanDate,
            timezone,
            top_signals: perplexityResult.report.top_signals || [],
            trend_watchlist: perplexityResult.report.trend_watchlist || [],
            security_alerts: perplexityResult.report.security_alerts || [],
            aws_platform_changes: perplexityResult.report.aws_platform_changes || [],
            ai_trends: perplexityResult.report.ai_trends || [],
            corporate_competitors: perplexityResult.report.corporate_competitors || [],
            developer_experience: perplexityResult.report.developer_experience || [],
            raw_feed: perplexityResult.report.raw_feed || [],
        };

        logger.info('Perplexity scan completed', {
            topSignals: scanResult.top_signals.length,
            trendWatchlist: scanResult.trend_watchlist.length,
            securityAlerts: scanResult.security_alerts.length,
            awsChanges: scanResult.aws_platform_changes.length,
            aiTrends: scanResult.ai_trends.length,
            corporateCompetitors: scanResult.corporate_competitors.length,
            developerExperience: scanResult.developer_experience.length,
            rawFeed: scanResult.raw_feed.length,
        });

        return {
            scanResult,
            prompts,
        };
    }
}
