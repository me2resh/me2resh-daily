import Parser from 'rss-parser';
import { Source } from '@/domain/source-config';
import { RawFeed } from '@/domain/scan-result';
import { logger } from '@/utils/logger';
import { validateUrl, canonicalizeUrl, isDomainAllowed } from '@/utils/url-validator';

export interface SourceFetcher {
    fetchSource(source: Source, lookbackHours: number): Promise<RawFeed[]>;
}

export interface ValidatedRawFeed extends RawFeed {
    domain: string;
    status_code: number;
    checked_at: string;
}

type RssItem = {
    title?: string;
    link?: string;
    pubDate?: string;
    isoDate?: string;
    contentSnippet?: string;
};

export class HttpSourceFetcher implements SourceFetcher {
    private rssParser: Parser;

    constructor() {
        this.rssParser = new Parser<RssItem>({
            timeout: 10000,
            headers: {
                'User-Agent': 'Me2resh-Daily-Scanner/1.0',
            },
        });
    }

    async fetchSource(source: Source, lookbackHours: number): Promise<ValidatedRawFeed[]> {
        try {
            logger.info('Fetching source', { name: source.name, type: source.type, url: source.url });

            if (source.type !== 'rss') {
                logger.warn('Only RSS sources are supported in this version', {
                    type: source.type,
                    name: source.name,
                });
                return [];
            }

            return await this.fetchRssFeed(source, lookbackHours);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            logger.error('Failed to fetch source', {
                source: source.name,
                error: errorMessage,
                stack: errorStack,
                sourceType: source.type,
                sourceUrl: source.url,
            });
            // Return empty array on error to not block other sources
            return [];
        }
    }

    private async fetchRssFeed(source: Source, lookbackHours: number): Promise<ValidatedRawFeed[]> {
        const rssUrl = source.rss_url || source.url;

        logger.info('Fetching RSS feed', { source: source.name, url: rssUrl });

        try {
            const feed = await this.rssParser.parseURL(rssUrl);
            const cutoffTime = Date.now() - lookbackHours * 60 * 60 * 1000;

            logger.info('RSS feed fetched', {
                source: source.name,
                itemCount: feed.items?.length || 0,
                title: feed.title,
            });

            // Process items in parallel
            const feedItems = await Promise.all(
                (feed.items || []).slice(0, 50).map(async (item) => {
                    try {
                        return await this.processRssItem(item, source, cutoffTime);
                    } catch (error) {
                        logger.warn('Failed to process RSS item', {
                            source: source.name,
                            itemTitle: item.title,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        return null;
                    }
                }),
            );

            // Filter out null items and items that failed validation
            const validItems = feedItems.filter(
                (item): item is ValidatedRawFeed =>
                    item !== null && item.status_code === 200 && isDomainAllowed(item.source_url),
            );

            logger.info('RSS feed processed', {
                source: source.name,
                totalItems: feed.items?.length || 0,
                validItems: validItems.length,
                rejected: feedItems.length - validItems.length,
            });

            return validItems;
        } catch (error) {
            logger.error('Failed to parse RSS feed', {
                source: source.name,
                url: rssUrl,
                error: error instanceof Error ? error.message : String(error),
            });
            return [];
        }
    }

    private async processRssItem(
        item: RssItem,
        source: Source,
        cutoffTime: number,
    ): Promise<ValidatedRawFeed | null> {
        // Extract basic info
        const rawLink = item.link || source.url;
        const isoDate = item.isoDate || item.pubDate;
        const publishedAt = isoDate ? new Date(isoDate) : new Date();

        // Check freshness first (before expensive URL validation)
        const publishedAtTime = publishedAt.getTime();
        if (!Number.isNaN(publishedAtTime) && publishedAtTime < cutoffTime) {
            logger.debug('Item too old, skipping', {
                source: source.name,
                title: item.title,
                publishedAt: publishedAt.toISOString(),
            });
            return null;
        }

        // Canonicalize URL
        const canonicalUrl = canonicalizeUrl(rawLink);

        // Quick allowlist check before HTTP validation
        if (!isDomainAllowed(canonicalUrl)) {
            logger.debug('URL not in allowlist, skipping', {
                source: source.name,
                url: canonicalUrl,
            });
            return null;
        }

        // Validate URL with HTTP HEAD check
        const validation = await validateUrl(canonicalUrl);

        if (!validation.isValid) {
            logger.debug('URL validation failed', {
                source: source.name,
                url: canonicalUrl,
                status: validation.status,
                error: validation.error,
            });
            return null;
        }

        // Extract domain
        const domain = new URL(canonicalUrl).hostname;

        // Build validated feed item
        const feedItem: ValidatedRawFeed = {
            title: item.title?.trim() || `${source.name} update`,
            source: source.name,
            source_url: validation.url, // Use validated/canonical URL
            published_at: publishedAt.toISOString(),
            domain,
            status_code: validation.status,
            checked_at: validation.checkedAt,
        };

        return feedItem;
    }
}
