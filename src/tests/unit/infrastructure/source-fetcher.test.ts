import { HttpSourceFetcher } from '@/infrastructure/source-fetcher';
import { Source } from '@/domain/source-config';

const parseURLMock = jest.fn();

jest.mock('rss-parser', () => {
    return jest.fn().mockImplementation(() => ({
        parseURL: parseURLMock,
    }));
});

describe('HttpSourceFetcher', () => {
    beforeEach(() => {
        parseURLMock.mockReset();
    });

    it('parses RSS feeds and filters items outside the lookback window', async () => {
        const recentDate = new Date().toISOString();
        const oldDate = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

        parseURLMock.mockResolvedValue({
            items: [
                { title: 'Recent update', link: 'https://example.com/recent', isoDate: recentDate },
                { title: 'Older update', link: 'https://example.com/old', isoDate: oldDate },
            ],
        });

        const fetcher = new HttpSourceFetcher();
        const source: Source = {
            name: 'Test RSS',
            url: 'https://example.com/rss',
            type: 'rss',
            keywords: [],
        };

        const result = await fetcher.fetchSource(source, 48);

        expect(parseURLMock).toHaveBeenCalledWith('https://example.com/rss');
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            title: 'Recent update',
            source: 'Test RSS',
            source_url: 'https://example.com/recent',
        });
    });

    it('uses explicit rss_url when provided', async () => {
        parseURLMock.mockResolvedValue({ items: [] });

        const fetcher = new HttpSourceFetcher();
        const source: Source = {
            name: 'Explicit RSS',
            url: 'https://example.com',
            rss_url: 'https://example.com/feed.xml',
            type: 'rss',
            keywords: [],
        };

        await fetcher.fetchSource(source, 24);

        expect(parseURLMock).toHaveBeenCalledWith('https://example.com/feed.xml');
    });
});
