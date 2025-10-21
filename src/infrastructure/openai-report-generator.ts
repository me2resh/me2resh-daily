import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ScanResult } from '@/domain/scan-result';
import { ReportGenerationInput, ReportGenerator, ReportGenerationResult } from './report-generator';
import { logger } from '@/utils/logger';

export class OpenAIReportGenerator implements ReportGenerator {
    private readonly client: OpenAI;
    private readonly promptContent: string;
    private readonly model: string;

    constructor(promptPath?: string) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set');
        }

        const envPromptPath =
            process.env.REQUIREMENT_PATH || process.env.OPENAI_PROMPT_PATH || process.env.PROMPT_PATH;
        const resolvedPromptPath =
            promptPath || envPromptPath || path.join(__dirname, '../../REQUIREMENTS.txt');

        try {
            this.promptContent = fs.readFileSync(resolvedPromptPath, 'utf8');
        } catch (error) {
            logger.error('Failed to load prompt file', { error, path: resolvedPromptPath });
            throw new Error(`Failed to load prompt from ${resolvedPromptPath}`);
        }

        this.client = new OpenAI({ apiKey });
        this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    }

    async generateReport(params: ReportGenerationInput): Promise<ReportGenerationResult> {
        const systemPrompt = this.buildSystemPrompt(params);
        const userPrompt = this.buildPrompt(params);

        logger.info('Requesting report from OpenAI', {
            model: this.model,
        });

        const response = await this.client.chat.completions.create({
            model: this.model,
            temperature: 0.3, // Slightly higher for more creative research
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('Empty response from OpenAI');
        }

        try {
            const report = JSON.parse(content) as ScanResult;
            return {
                report,
                systemPrompt,
                userPrompt,
            };
        } catch (error) {
            logger.error('Failed to parse OpenAI response as JSON', { error, content });
            throw new Error('OpenAI response was not valid JSON');
        }
    }

    private buildSystemPrompt(params: ReportGenerationInput): string {
        const lookbackHours = params.lookback_hours || 24;

        return `You are an executive intelligence analyst for a Director of Platform & Architecture.

Rules:
1) Return ONLY valid JSON per the provided schema. ALL sections present; empty arrays allowed.
2) Recency window: last ${lookbackHours} hours.
3) Diversity constraints:
   - ≤ 40% of total items may be healthcare/clinical AI/FHIR combined.
   - Each category (top_signals, trend_watchlist, security_alerts, aws_platform_changes, ai_trends, corporate_hims_hers, developer_experience) has MAX 5 items.
   - Prioritise AWS/serverless and DX/DevOps first, then regulation/standards, then security, then corporate, then healthcare when platform-impacting.
4) For each top_signal, include a clear "why_it_matters" (business impact, 1–2 sentences) and 2–4 action notes.
5) Prefer primary sources; dedupe across outlets; strip UTM.
6) If input raw_feed is skewed, REBALANCE by selecting across distinct topics before severity tie-breaks.
7) Severity:
   - high: compliance deadlines, exploited vulns, AWS behaviour/pricing changes, platform-breaking changes
   - medium: significant features/GA, notable ecosystem shifts
   - low: background trends

PRIORITIZATION ORDER (select in this order):
1) AWS/serverless (Lambda, API Gateway, EventBridge, Step Functions, DynamoDB, EKS, Well-Architected)
2) Developer Experience (Backstage, platform engineering, DORA, golden paths, AIOps)
3) Executive/Strategy (cost controls, org patterns, governance)
4) Security (CVE/CVSS/KEV/ALAS, npm/Go/PHP stack vulnerabilities)
5) AI (platform-impacting infra/tooling OR dated regulatory obligations only)
6) FHIR/HL7/Interop (standards with deadlines/compliance dates)
7) Corporate (only material product launches, earnings, M&A)

NEGATIVE FILTERS (drop these):
- Event recaps, photo galleries, calls for papers without feature details
- Clinical AI without validation/regulatory implications
- Commentary/opinion without dates or deadlines
- Duplicate stories across outlets (prefer primary source)

VALIDATION BEFORE OUTPUT:
- Fail if JSON invalid, dates not YYYY-MM-DD, or diversity caps violated
- Ensure source_url is specific article page, NOT homepage
- Ensure all top_signals have meaningful "why_it_matters" and ≥2 "notes_for_actions"
- Verify healthcare (ai_trends + trend_watchlist with FHIR/HL7 keywords) ≤ 40% of total

REBALANCING LOGIC:
If healthcare items > 40%, reduce those categories first and backfill from AWS/DX/Security`;
    }

    private buildPrompt(params: ReportGenerationInput): string {
        const { date, timezone, items, lookback_hours } = params;
        const lookbackHours = lookback_hours || 24;
        const lookbackDays = Math.round(lookbackHours / 24);
        const timeframeText =
            lookbackHours <= 48 ? `last ${lookbackHours} hours` : `last ${lookbackDays} days`;

        // Build raw_feed_input JSON
        const rawFeedInputJson = JSON.stringify(items, null, 2);

        return `${this.promptContent}

---

TASK FOR TODAY:
Current scan date: ${date}
Timezone: ${timezone}

RAW_FEED_INPUT (Pre-validated items from RSS feeds):
${rawFeedInputJson}

IMPORTANT RULES:
1. You MUST only cite URLs present in raw_feed_input above
2. Do NOT invent, infer, or guess URLs
3. If a needed URL is missing from raw_feed_input, omit that item
4. For each top_signals, aws_platform_changes, ai_trends, etc. entry, set source_url to a URL exactly from raw_feed_input
5. Include in the final raw_feed output only the subset of raw_feed_input items you actually used
6. Include ALL sections from the schema (top_signals, trend_watchlist, security_alerts, aws_platform_changes, ai_trends, corporate_hims_hers, developer_experience, raw_feed)
7. If a section has no items from raw_feed_input, include it as an empty array

CATEGORY ITEM LIMITS (CRITICAL):
- Each category can contain UP TO 5 items maximum (not 5 total across all categories)
- top_signals: select up to 5 most critical items across ALL categories
- trend_watchlist: select up to 5 emerging trends
- security_alerts: select up to 5 most severe security issues
- aws_platform_changes: select up to 5 most impactful AWS updates
- ai_trends: select up to 5 most relevant AI developments
- corporate_hims_hers: select up to 5 most important corporate updates
- developer_experience: select up to 5 most valuable DX improvements

CRITICAL FILTERING INSTRUCTIONS:
- You have ${items.length} items in raw_feed_input covering the ${timeframeText} (${lookbackHours} hours)
- These items come from TWO sources:
  1. RSS feeds (validated, reliable URLs from specific sources)
  2. Perplexity research (web search results with citations covering ALL topics)
- DO NOT filter to only AWS items - analyze ALL items across ALL categories
- Consider ALL items regardless of publish date - the lookback window has already been applied during data collection
- Look for items matching these categories:
  * ai_trends: Items from NEJM AI, npj Digital Medicine, Nature, Hugging Face, OpenAI, AI healthcare journals, FDA/MHRA guidance
  * aws_platform_changes: Items from AWS What's New, AWS blogs, serverless updates
  * security_alerts: Items with CVEs, security advisories, vulnerability disclosures (maximum 5 items)
  * developer_experience: Items from The New Stack, InfoQ, developer tools, framework releases (maximum 5 items)
  * corporate_hims_hers: Items about Hims & Hers company news, earnings, filings, UK competitors (maximum 5 items)
- POPULATE MULTIPLE CATEGORIES - do not put all items in just one category
- Each category has its own budget of up to 5 items
- If raw_feed_input contains items from sources like "HL7 Blog", "The New Stack", "Nature", "Perplexity Research", etc., include them in appropriate categories
- Diversify your selection across all available categories based on the source names in raw_feed_input
- Perplexity Research items provide broader coverage including regulatory updates, competitive intelligence, and topics without RSS feeds

Return ONLY the JSON object. No commentary, no markdown formatting, just the JSON.`;
    }
}
