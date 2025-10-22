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

CORE RULES:
1) Return ONLY valid JSON per schema. ALL sections present; empty arrays allowed.
2) Recency: AWS 24-48h, all others 72h (more supply on quiet days).
3) Category caps: MAX 5 items each.
4) Healthcare combined (AI + FHIR): ≤ 40% of total.

DIVERSITY ENFORCEMENT:
- In top_signals: MAX 2 items from aws.amazon.com domains.
- If non-AWS items exist, ensure top_signals includes ≥1 from developer_experience OR security_alerts.
- Each populated category must have ≥1 non-AWS source when available (InfoQ, The New Stack, Backstage, OpenAI, NEJM AI, HL7).
- AWS routine items → aws_platform_changes only (not top_signals unless high-impact).

WHY_IT_MATTERS TEMPLATE (REQUIRED):
For every item, generate why_it_matters as:
"{who_is_affected} because {what_changed} which {so_what to reliability/cost/risk/DX/compliance}."

Examples:
- "Email ops gain visibility because SES adds IP observability, which cuts time to diagnose sender reputation drops."
- "Data protection controls improve because Nitro Enclaves reaches eu-west-2, which enables enclave-backed key handling."

VALIDATION: Reject any item where why_it_matters is empty/"undefined"/<10 chars. If you cannot express this in one sentence, OMIT the item.

TITLE NORMALIZATION:
- Security advisories: "{component}: {CVE or vuln type} allows {impact} (CVSS {score})"
  Example: "php-src: CVE-2025-12345 use-after-free allows RCE (CVSS 9.8)"
  Required fields: component, cve (or "N/A"), cvss, affected_versions, fix_available.
- Releases matching /^v?\\d+(\\.\\d+)*$/: "{project} {version} — {most material change|maintenance/bugfix release}"
  Example: "NestJS 11.1.7 — maintenance release; minor fixes, no breaking changes"
  Place in developer_experience unless breaking/CVE.

RANKING SCORES (additive):
+3 dated behaviour/pricing/security change (AWS bulletin, GA that alters defaults)
+3 regulatory obligation with effective date (EU AI Act, NHS/HL7 deadlines)
+2 primary source (official blog/docs/filing)
+2 EU-West-2 relevance or Zavva stack (Lambda, API Gateway, DynamoDB, EKS, NestJS, TypeScript, Go)
+1 cost/perf claim with % or measurable KPI
-2 routine "What's New" feature with no cost/behaviour/security
-3 vague posts ("Status", "Watch", contributor pages)

CATEGORY PLACEMENT:
- aws_platform_changes: routine AWS "What's New", service GAs, region support, console toggles; include likely_effect + action_hint.
- top_signals: ONLY (a) pricing/behaviour/security changes, (b) exploited CVEs/AWS bulletins, (c) dated regulation, (d) outages with primary source.
- developer_experience: tool/framework releases, Backstage/CNCF/InfoQ patterns; ≥1 non-AWS if available.
- security_alerts: CVEs with component, cve, cvss, affected_versions, fix_available.
- ai_trends: 0-2 items unless dated obligation; platform-impacting infra/tooling only.

HARD QUOTAS:
- top_signals: MAX 2 from aws.amazon.com, ≥1 from Security OR DX if available, prefer pricing/behaviour/regulatory over features.
- aws_platform_changes: ≤5, exclude routine items from top_signals unless pricing/behaviour/security or eu-west-2 impact.
- developer_experience: ≥1 non-AWS (InfoQ/New Stack/Backstage/CNCF) if present.
- ai_trends: ≤2 unless dated obligation.

SOURCE BLACKLIST (drop these):
- serverlessland.com/contributors/*
- youtube.com/* (unless official incident briefing)
- tomsguide.com/* (unless corroborating primary incident)
- Any undated "Status" or generic contributor pages

POST-PROCESSING GUARDS:
- Assert no why_it_matters is blank/"undefined"
- Rewrite version-only titles per rules above
- Move AWS items from top_signals → aws_platform_changes unless high-impact
- Ensure each category with items has ≥1 non-AWS source when available

FAIL CLOSED: If validation fails, omit the item rather than output invalid data.`;
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
