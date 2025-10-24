import { ScanResult } from '@/domain/scan-result';
import { logger } from '@/utils/logger';

export interface PerplexityCitation {
    title: string;
    url: string;
    snippet?: string;
    publishedDate?: string;
}

export interface PerplexitySearchResult {
    answer: string;
    citations: PerplexityCitation[];
}

export interface PerplexityResearchItem {
    title: string;
    source: string;
    source_url: string;
    published_at: string;
    domain: string;
    summary: string;
}

export class PerplexityClient {
    private readonly apiKey: string;
    private readonly apiUrl = 'https://api.perplexity.ai/chat/completions';
    private readonly model: string;

    constructor() {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) {
            throw new Error('PERPLEXITY_API_KEY is not set');
        }
        this.apiKey = apiKey;
        this.model = process.env.PERPLEXITY_MODEL || 'sonar-pro';
    }

    async search(query: string): Promise<PerplexitySearchResult> {
        logger.info('Sending query to Perplexity', {
            model: this.model,
            queryLength: query.length,
        });

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are a research assistant. Provide accurate, recent information with specific citations including URLs and publication dates.',
                        },
                        {
                            role: 'user',
                            content: query,
                        },
                    ],
                    temperature: 0.2,
                    return_citations: true,
                    return_related_questions: false,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Perplexity API error', {
                    status: response.status,
                    error: errorText,
                });
                throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            logger.info('Perplexity response received', {
                answerLength: data.choices?.[0]?.message?.content?.length ?? 0,
                citationsCount: data.citations?.length ?? 0,
            });

            const answer = data.choices?.[0]?.message?.content || '';
            const citations: PerplexityCitation[] = (data.citations || []).map((citation: string) => ({
                title: this.extractTitleFromUrl(citation),
                url: citation,
                snippet: '',
                publishedDate: new Date().toISOString().split('T')[0],
            }));

            return {
                answer,
                citations,
            };
        } catch (error) {
            logger.error('Failed to query Perplexity', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    private extractTitleFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter((p) => p.length > 0);
            const lastPart = pathParts[pathParts.length - 1] || urlObj.hostname;
            return lastPart
                .replace(/[-_]/g, ' ')
                .replace(/\.\w+$/, '')
                .replace(/\b\w/g, (l) => l.toUpperCase());
        } catch {
            return url;
        }
    }

    async searchStructured(query: string): Promise<Partial<ScanResult>> {
        logger.info('Sending structured query to Perplexity', {
            model: this.model,
            queryLength: query.length,
        });

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: query,
                        },
                    ],
                    temperature: 0.1, // Lower for factual accuracy
                    max_tokens: 8000, // Increased for full JSON response with multiple categories
                    return_citations: true,
                    return_related_questions: false,
                    search_recency_filter: 'day', // Search last 24h to match lookback_hours and prevent duplicates
                    search_domain_filter: [], // Allow all domains (no restrictions)
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Perplexity API error', {
                    status: response.status,
                    error: errorText,
                });
                throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content || '';

            logger.info('Perplexity structured response received', {
                contentLength: content.length,
                citationsCount: data.citations?.length ?? 0,
            });

            // Parse JSON from response
            try {
                // Extract JSON from markdown code blocks if present
                const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
                const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;

                const parsed = JSON.parse(jsonString);
                logger.info('Successfully parsed Perplexity JSON response');
                return parsed;
            } catch (parseError) {
                logger.error('Failed to parse Perplexity response as JSON', {
                    error: parseError instanceof Error ? parseError.message : String(parseError),
                    content: content.substring(0, 500),
                });
                throw new Error('Perplexity response was not valid JSON');
            }
        } catch (error) {
            logger.error('Failed to query Perplexity', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    parseCitationsToItems(result: PerplexitySearchResult, sourceName: string): PerplexityResearchItem[] {
        return result.citations.map((citation) => {
            let domain = '';
            try {
                domain = new URL(citation.url).hostname;
            } catch {
                domain = 'unknown';
            }

            return {
                title: citation.title,
                source: sourceName,
                source_url: citation.url,
                published_at: citation.publishedDate || new Date().toISOString(),
                domain,
                summary: citation.snippet || result.answer.substring(0, 200),
            };
        });
    }
}
