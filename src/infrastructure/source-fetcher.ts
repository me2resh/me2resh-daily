import Parser from 'rss-parser';
import { Source } from '@/domain/source-config';
import { RawFeed } from '@/domain/scan-result';
import { logger } from '@/utils/logger';

export interface SourceFetcher {
    fetchSource(source: Source, lookbackHours: number): Promise<RawFeed[]>;
}

type RssItem = {
    title?: string;
    link?: string;
    pubDate?: string;
    isoDate?: string;
};

export class HttpSourceFetcher implements SourceFetcher {
    private rssParser: Parser;

    constructor() {
        this.rssParser = new Parser<RssItem>();
    }

    async fetchSource(source: Source, lookbackHours: number): Promise<RawFeed[]> {
        try {
            logger.info('Fetching source', { name: source.name, type: source.type, url: source.url });

            switch (source.type) {
                case 'rss':
                    return await this.fetchRssFeed(source, lookbackHours);
                case 'html':
                    return await this.fetchHtmlPage(source, lookbackHours);
                case 'github_releases':
                    return await this.fetchGitHubReleases(source, lookbackHours);
                case 'github_advisories':
                    return await this.fetchGitHubAdvisories(source, lookbackHours);
                case 'nvd_api':
                    return await this.fetchNVD(source, lookbackHours);
                case 'cisa_api':
                    return await this.fetchCISA(source, lookbackHours);
                default:
                    logger.warn('Unsupported source type', { type: source.type, name: source.name });
                    return [];
            }
        } catch (error) {
            logger.error('Failed to fetch source', { error, source: source.name });
            // Return empty array on error to not block other sources
            return [];
        }
    }

    private async fetchRssFeed(source: Source, lookbackHours: number): Promise<RawFeed[]> {
        const rssUrl = source.rss_url || source.url;

        logger.info('Fetching RSS feed', { source: source.name, url: rssUrl });

        const feed = await this.rssParser.parseURL(rssUrl);
        const cutoffTime = Date.now() - lookbackHours * 60 * 60 * 1000;

        return (feed.items || [])
            .map((item) => {
                const isoDate = item.isoDate || item.pubDate;
                const publishedAt = isoDate ? new Date(isoDate) : new Date();

                return {
                    title: item.title?.trim() || `${source.name} update`,
                    source: source.name,
                    source_url: item.link || rssUrl,
                    published_at: publishedAt.toISOString(),
                } satisfies RawFeed;
            })
            .filter((feedItem) => {
                const publishedAtTime = new Date(feedItem.published_at).getTime();
                if (Number.isNaN(publishedAtTime)) {
                    return true;
                }
                return publishedAtTime >= cutoffTime;
            });
    }

    private async fetchHtmlPage(source: Source, _lookbackHours: number): Promise<RawFeed[]> {
        // Implementation placeholder - requires HTML parser and scraping logic
        logger.info('HTML fetching not yet implemented', { source: source.name });
        return [];
    }

    private async fetchGitHubReleases(source: Source, _lookbackHours: number): Promise<RawFeed[]> {
        // Implementation placeholder - requires GitHub API client
        logger.info('GitHub releases fetching not yet implemented', { source: source.name });
        return [];
    }

    private async fetchGitHubAdvisories(source: Source, _lookbackHours: number): Promise<RawFeed[]> {
        // Implementation placeholder - requires GitHub API client
        logger.info('GitHub advisories fetching not yet implemented', { source: source.name });
        return [];
    }

    private async fetchNVD(source: Source, _lookbackHours: number): Promise<RawFeed[]> {
        // Implementation placeholder - requires NVD API client
        logger.info('NVD fetching not yet implemented', { source: source.name });
        return [];
    }

    private async fetchCISA(source: Source, _lookbackHours: number): Promise<RawFeed[]> {
        // Implementation placeholder - requires CISA API client
        logger.info('CISA fetching not yet implemented', { source: source.name });
        return [];
    }
}
