import { SourceConfiguration } from '@/domain/source-config';
import { PerplexityClient, PerplexityResearchItem } from '@/infrastructure/perplexity-client';
import { logger } from '@/utils/logger';

interface ResearchTopic {
    category: string;
    sources: string[];
    extract: string[];
}

export interface ResearchResult {
    items: PerplexityResearchItem[];
    query: string;
}

export class ResearchService {
    constructor(private config: SourceConfiguration, private perplexityClient: PerplexityClient) {}

    async performResearch(): Promise<ResearchResult> {
        // Check if Perplexity research is enabled
        if (!this.config.scan_config.enable_perplexity_research) {
            logger.info('Perplexity research disabled in config');
            return { items: [], query: '' };
        }

        const perplexityConfig = (this.config as Record<string, any>).perplexity_research;
        if (!perplexityConfig?.enabled) {
            logger.info('Perplexity research disabled in perplexity_research.enabled');
            return { items: [], query: '' };
        }

        // Build query dynamically from REQUIREMENTS.txt + YAML config
        const query = this.buildResearchQuery(perplexityConfig);
        if (!query) {
            logger.warn('Failed to build research query');
            return { items: [], query: '' };
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

            return { items: researchItems, query };
        } catch (error) {
            logger.error('Perplexity research failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            // Don't throw - continue with RSS-only results
            return { items: [], query };
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

        const query = `Research the following topics for updates in the last ${lookbackHours} hours. PRIORITISE SECTIONS IN ORDER.
Return only specific article titles, URLs, and publication dates (YYYY-MM-DD).

ORDER OF PRIORITY (most first):
1. AWS Platform & Serverless (Lambda, API Gateway, EventBridge, Step Functions, DynamoDB, IAM, KMS, VPC, CloudWatch, EKS)
   Sources: AWS What's New, AWS Compute Blog, AWS Architecture Blog, AWS Security Bulletins, ALAS, CNCF blog/news, KubeWeekly
   Extract: new/changed features, pricing/perf impacts, security bulletins, Well-Architected updates, serverless tooling changes

2. Developer Experience & Platform Engineering (Backstage, platform teams, AIOps, golden paths, DORA)
   Sources: Backstage blog(s), InfoQ news, The New Stack, CNCF, ThoughtWorks Tech Radar
   Extract: developer portal patterns, platform product practices, CI/CD/SRE shifts, measurable DX outcomes

3. Executive Leadership & Strategy (operating models, cost controls, org patterns)
   Sources: ThoughtWorks Tech Radar notes, InfoQ leadership pieces, major practitioner blogs (Google SRE, AWS Builders' Library)
   Extract: platform org changes, cost levers, governance patterns, strategy signals

4. Security & Vulnerabilities (stack-focused)
   Sources: NVD, CISA KEV, GitHub Advisory DB, AWS Security Bulletins, ALAS
   Extract: CVE, CVSS, affected versions, exploitation-in-the-wild, fix availability

5. AI (platform-impacting + healthcare where material)
   Sources: OpenAI/Anthropic/AWS Bedrock/Hugging Face blogs (platform), NEJM AI, npj Digital Medicine, Lancet Digital Health, FDA AI/ML SaMD, MHRA SaMD, EU AI Act
   Extract: infra/tooling with cost/reliability/security implications; regulatory obligations with effective dates

6. FHIR / HL7 / Interop (standards & policy)
   Sources: HL7 blog/news, FHIR Foundation, NHS England FHIR APIs, ONC TEFCA, CMS spotlight
   Extract: ballots/IGs, deadlines, UK API changes, TEFCA requirements

STRICT DIVERSITY RULES:
- For each topic above, include up to 5 items; DO NOT exceed 40% of total items from any single topic.
- Prefer primary sources; dedupe identical stories.
- Include the exact publication date (YYYY-MM-DD) and the specific article URL (not homepages).

KEYWORDS TO BOOST (use in matching/ranking):
- "AWS Lambda", "API Gateway", "EventBridge", "Step Functions", "DynamoDB", "EKS", "Well-Architected", "Backstage", "developer portal", "golden path", "AIOps", "DORA", "platform engineering", "executive", "org strategy"
- Security: "CVE", "CVSS", "ALAS", "KEV", "npm", "golang", "composer", "php"
- AI platform: "Bedrock", "model serving", "observability", "guardrails", "GPU", "cost"

DE-EMPHASIS (still allow, but rank lower unless material):
- Minor clinical case reports, conference announcements without actionable change, commentary without dates.

For each update found, provide:
- Exact article title
- Full URL
- Publication date (YYYY-MM-DD)
- One-sentence summary`;

        logger.info('Built priority-ordered research query', {
            lookbackHours,
            queryLength: query.length,
        });

        return query;
    }
}
