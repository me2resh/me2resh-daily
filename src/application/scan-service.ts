import { ScanResult, TopSignal, RawFeed } from '@/domain/scan-result';
import { SourceConfiguration } from '@/domain/source-config';
import { SourceFetcher } from '@/infrastructure/source-fetcher';
import { logger } from '@/utils/logger';

type ImpactTag = 'Regulatory' | 'Platform' | 'Security' | 'DX' | 'Cost' | 'Org/Strategy';
type AiTrendCategory = 'regulatory' | 'clinical' | 'platform' | 'tooling';
type TrendTrajectory = 'rising' | 'stable' | 'fading';

interface CategorizedFeed extends RawFeed {
    topic: string;
    category: string;
    priority: number;
    severity: 'high' | 'medium' | 'low';
    impacts: ImpactTag[];
}

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
        const categorizedFeeds: CategorizedFeed[] = [];
        for (const topic of this.config.topics) {
            logger.info('Processing topic', { topic: topic.name, sourceCount: topic.sources.length });

            for (const source of topic.sources) {
                try {
                    const feeds = await this.sourceFetcher.fetchSource(
                        source,
                        this.config.scan_config.lookback_hours,
                    );
                    allFeeds.push(...feeds);

                    const annotatedFeeds = feeds.map((feed) => {
                        const contentForClassification = `${feed.title} ${topic.name}`;
                        const severity = this.determineSeverity(contentForClassification);
                        const impacts = this.determineImpact(contentForClassification);

                        return {
                            ...feed,
                            topic: topic.name,
                            category: topic.category,
                            priority: topic.priority,
                            severity,
                            impacts,
                        } satisfies CategorizedFeed;
                    });

                    categorizedFeeds.push(...annotatedFeeds);
                    logger.info('Source fetched', { source: source.name, itemCount: feeds.length });
                } catch (error) {
                    logger.error('Error fetching source', { source: source.name, error });
                    // Continue with other sources
                }
            }
        }

        scanResult.raw_feed = allFeeds;

        // Process and categorize feeds
        scanResult.top_signals = this.extractTopSignals(categorizedFeeds);
        scanResult.security_alerts = this.extractSecurityAlerts(categorizedFeeds);
        scanResult.aws_platform_changes = this.extractAwsPlatformChanges(categorizedFeeds);
        scanResult.ai_trends = this.extractAiTrends(categorizedFeeds);
        scanResult.corporate_hims_hers = this.extractCorporateNews(categorizedFeeds);
        scanResult.developer_experience = this.extractDeveloperExperience(categorizedFeeds);
        scanResult.trend_watchlist = this.extractTrendWatchlist(categorizedFeeds);

        logger.info('Scan completed', {
            topSignals: scanResult.top_signals.length,
            securityAlerts: scanResult.security_alerts.length,
            awsChanges: scanResult.aws_platform_changes.length,
            aiTrends: scanResult.ai_trends.length,
            rawFeedItems: scanResult.raw_feed.length,
        });

        return scanResult;
    }

    private extractTopSignals(feeds: CategorizedFeed[]): TopSignal[] {
        logger.info('Extracting top signals from feeds', { feedCount: feeds.length });

        const severityRank: Record<CategorizedFeed['severity'], number> = {
            high: 0,
            medium: 1,
            low: 2,
        };

        return feeds
            .filter((feed) => feed.priority <= 2)
            .sort((a, b) => {
                const severityComparison = severityRank[a.severity] - severityRank[b.severity];
                if (severityComparison !== 0) {
                    return severityComparison;
                }
                return a.priority - b.priority;
            })
            .slice(0, 5)
            .map((feed) => ({
                title: feed.title,
                why_it_matters: this.buildWhyItMatters(feed),
                impact: feed.impacts,
                severity: feed.severity,
                source_url: feed.source_url,
                published_at: feed.published_at,
                notes_for_actions: [],
            }));
    }

    private extractSecurityAlerts(feeds: CategorizedFeed[]) {
        logger.info('Extracting security alerts from feeds', { feedCount: feeds.length });
        const securityFeeds = feeds.filter((feed) => feed.category === 'security');

        return securityFeeds.map((feed) => {
            const cve = this.extractCve(feed.title);
            return {
                component: feed.source,
                cve: cve ?? 'N/A',
                cvss: 'N/A',
                summary: feed.title,
                affected_versions: 'See source',
                fix_available: /fix|patch|update|upgrade/i.test(feed.title),
                source_url: feed.source_url,
            };
        });
    }

    private extractAwsPlatformChanges(feeds: CategorizedFeed[]) {
        logger.info('Extracting AWS platform changes from feeds', { feedCount: feeds.length });
        const awsFeeds = feeds.filter((feed) => feed.category === 'aws_platform');

        return awsFeeds.map((feed) => ({
            service: feed.source,
            change: feed.title,
            likely_effect: this.buildLikelyEffect(feed),
            action_hint: `Review ${feed.source_url} for potential actions in ${feed.topic}.`,
        }));
    }

    private extractAiTrends(feeds: CategorizedFeed[]) {
        logger.info('Extracting AI trends from feeds', { feedCount: feeds.length });
        const aiFeeds = feeds.filter(
            (feed) => feed.category === 'ai_healthcare' || feed.category === 'ai_platform',
        );

        return aiFeeds.map((feed) => {
            const aiCategory: AiTrendCategory = feed.category === 'ai_healthcare' ? 'clinical' : 'platform';

            return {
                item: feed.title,
                category: aiCategory,
                summary: this.buildWhyItMatters(feed),
                impact: feed.impacts.join(', ') || 'Platform',
                source_url: feed.source_url,
                published_at: feed.published_at,
            };
        });
    }

    private extractCorporateNews(feeds: CategorizedFeed[]) {
        logger.info('Extracting corporate news from feeds', { feedCount: feeds.length });
        const corporateFeeds = feeds.filter((feed) => feed.category === 'corporate');

        return corporateFeeds.map((feed) => ({
            item: feed.title,
            type: this.inferCorporateType(feed.title),
            summary: this.buildWhyItMatters(feed),
            source_url: feed.source_url,
            published_at: feed.published_at,
        }));
    }

    private extractDeveloperExperience(feeds: CategorizedFeed[]) {
        logger.info('Extracting developer experience updates from feeds', { feedCount: feeds.length });
        const dxFeeds = feeds.filter((feed) => feed.category === 'developer_experience');

        return dxFeeds.map((feed) => ({
            pattern_or_tool: feed.title,
            update: this.buildWhyItMatters(feed),
            relevance_to_platform: `Sourced from ${
                feed.source
            }. ${feed.severity.toUpperCase()} priority insight.`,
        }));
    }

    private extractTrendWatchlist(feeds: CategorizedFeed[]) {
        logger.info('Extracting trend watchlist from feeds', { feedCount: feeds.length });

        const excludedCategories = new Set([
            'security',
            'aws_platform',
            'ai_healthcare',
            'ai_platform',
            'corporate',
            'developer_experience',
        ]);

        const grouped = new Map<string, CategorizedFeed[]>();
        for (const feed of feeds) {
            if (excludedCategories.has(feed.category)) {
                continue;
            }

            const items = grouped.get(feed.category) || [];
            items.push(feed);
            grouped.set(feed.category, items);
        }

        return Array.from(grouped.entries()).map(([category, items]) => {
            const trajectory: TrendTrajectory =
                items.length > 3 ? 'rising' : items.length > 1 ? 'stable' : 'fading';

            return {
                topic: this.formatCategoryName(category),
                summary: `${items.length} new items from ${this.formatCategoryName(category)} sources.`,
                trajectory,
                sources: Array.from(new Set(items.map((item) => item.source))),
            };
        });
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

    private determineImpact(content: string): ImpactTag[] {
        const impacts: ImpactTag[] = [];
        const contentLower = content.toLowerCase();

        for (const [impactType, keywords] of Object.entries(this.config.impact_keywords)) {
            for (const keyword of keywords) {
                if (contentLower.includes(keyword.toLowerCase())) {
                    impacts.push(impactType as ImpactTag);
                    break;
                }
            }
        }

        return impacts.length > 0 ? impacts : ['Platform'];
    }

    private buildWhyItMatters(feed: CategorizedFeed): string {
        switch (feed.category) {
            case 'security':
                return 'Security advisory detected—review for exposure and mitigations.';
            case 'aws_platform':
                return 'Platform change may affect cloud workloads or operations.';
            case 'ai_platform':
                return 'AI platform development that could influence architecture decisions.';
            case 'ai_healthcare':
                return 'Healthcare AI update with potential regulatory or clinical impact.';
            case 'corporate':
                return 'Corporate development relevant to organizational strategy.';
            case 'developer_experience':
                return 'Developer experience insight impacting platform productivity.';
            case 'releases':
                return 'Release update worth tracking for roadmap planning.';
            case 'standards':
                return 'Standards update that could influence interoperability commitments.';
            default:
                return `Insight from ${feed.topic}.`;
        }
    }

    private buildLikelyEffect(feed: CategorizedFeed): string {
        switch (feed.severity) {
            case 'high':
                return 'High likelihood of immediate impact on platform workloads.';
            case 'medium':
                return 'Moderate impact expected—evaluate during upcoming sprint.';
            default:
                return 'Low impact but worth awareness for roadmap alignment.';
        }
    }

    private inferCorporateType(title: string): 'press' | 'filing' | 'earnings' | 'media' {
        const normalizedTitle = title.toLowerCase();
        if (
            normalizedTitle.includes('10-k') ||
            normalizedTitle.includes('10-q') ||
            normalizedTitle.includes('8-k') ||
            normalizedTitle.includes('filing')
        ) {
            return 'filing';
        }
        if (
            normalizedTitle.includes('earnings') ||
            normalizedTitle.includes('results') ||
            normalizedTitle.includes('quarter')
        ) {
            return 'earnings';
        }
        if (normalizedTitle.includes('press') || normalizedTitle.includes('launch')) {
            return 'press';
        }
        return 'media';
    }

    private formatCategoryName(category: string): string {
        return category
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private extractCve(content: string): string | null {
        const match = content.match(/CVE-\d{4}-\d{4,7}/i);
        return match ? match[0].toUpperCase() : null;
    }
}
