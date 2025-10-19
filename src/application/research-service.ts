import { SourceConfiguration } from '@/domain/source-config';
import { PerplexityClient, PerplexityResearchItem } from '@/infrastructure/perplexity-client';
import { logger } from '@/utils/logger';

interface ResearchTopic {
    category: string;
    sources: string[];
    extract: string[];
}

export class ResearchService {
    constructor(private config: SourceConfiguration, private perplexityClient: PerplexityClient) {}

    async performResearch(): Promise<PerplexityResearchItem[]> {
        // Check if Perplexity research is enabled
        if (!this.config.scan_config.enable_perplexity_research) {
            logger.info('Perplexity research disabled in config');
            return [];
        }

        const perplexityConfig = (this.config as Record<string, any>).perplexity_research;
        if (!perplexityConfig?.enabled) {
            logger.info('Perplexity research disabled in perplexity_research.enabled');
            return [];
        }

        // Build query dynamically from REQUIREMENTS.txt + YAML config
        const query = this.buildResearchQuery(perplexityConfig);
        if (!query) {
            logger.warn('Failed to build research query');
            return [];
        }

        logger.info('Starting Perplexity research with dynamic query');

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

    private buildResearchQuery(perplexityConfig: Record<string, any>): string {
        const researchTopics = perplexityConfig.research_topics as ResearchTopic[];
        if (!researchTopics || researchTopics.length === 0) {
            logger.warn('No research topics found in config');
            return '';
        }

        // Get lookback hours (use perplexity override or default from scan_config)
        const lookbackHours = perplexityConfig.lookback_hours || this.config.scan_config.lookback_hours;

        // Build prompt from topics
        let topicsSection = '';
        researchTopics.forEach((topic, index) => {
            topicsSection += `\n${index + 1}. ${topic.category}:\n`;
            topicsSection += `   Sources to prioritize:\n`;
            topic.sources.forEach((source) => {
                topicsSection += `   - ${source}\n`;
            });
            topicsSection += `   \n   Extract:\n`;
            topic.extract.forEach((extractItem) => {
                topicsSection += `   - ${extractItem}\n`;
            });
            topicsSection += '\n';
        });

        const query = `Research the following topics for updates in the last ${lookbackHours} hours. For each topic, provide specific article titles, URLs, and publication dates.

Topics to research:
${topicsSection}
For each update found, provide:
- Exact article title
- Full URL to the source
- Publication date (YYYY-MM-DD format)
- Brief one-sentence summary

Focus on official sources, primary documentation, and regulatory agencies. Include specific dates for compliance deadlines and effective dates.`;

        logger.info('Built dynamic research query', {
            lookbackHours,
            topicCount: researchTopics.length,
            queryLength: query.length,
        });

        return query;
    }
}
