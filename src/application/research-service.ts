import { SourceConfiguration } from '@/domain/source-config';
import { PerplexityClient, PerplexityResearchItem } from '@/infrastructure/perplexity-client';
import { logger } from '@/utils/logger';

export class ResearchService {
    constructor(private config: SourceConfiguration, private perplexityClient: PerplexityClient) {}

    async performResearch(): Promise<PerplexityResearchItem[]> {
        // Check if Perplexity research is enabled
        if (!this.config.scan_config.enable_perplexity_research) {
            logger.info('Perplexity research disabled in config');
            return [];
        }

        // Get the combined research query from config
        const query = (this.config as Record<string, any>).perplexity_research?.combined_query;
        if (!query) {
            logger.warn('No perplexity_research.combined_query found in config');
            return [];
        }

        logger.info('Starting Perplexity research');

        try {
            const result = await this.perplexityClient.search(query);

            logger.info('Perplexity research completed', {
                answerLength: result.answer.length,
                citationsCount: result.citations.length,
            });

            // Convert citations to research items
            const researchItems = this.perplexityClient.parseCitationsToItems(result, 'Perplexity Research');

            logger.info('Parsed Perplexity results', {
                itemCount: researchItems.length,
            });

            return researchItems;
        } catch (error) {
            logger.error('Perplexity research failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            // Don't throw - continue with RSS-only results
            return [];
        }
    }
}
