import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { ScanResult } from '@/domain/scan-result';
import { ReportGenerationInput, ReportGenerator } from './report-generator';
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

    async generateReport(params: ReportGenerationInput): Promise<ScanResult> {
        const prompt = this.buildPrompt(params);

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
                    content: `You are an executive intelligence analyst for a Director of Platform & Architecture at a healthcare technology company.

Your role is to analyze RSS feed items across AI, AWS/serverless, FHIR/HL7, security, and platform engineering.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON matching the exact schema provided in the prompt
2. Include ALL sections from the schema, even if empty arrays
3. For source_url fields, provide SPECIFIC article URLs, not just domain homepages
4. For raw_feed items, each should have a unique, specific source_url to the actual article
5. Ensure all dates are in YYYY-MM-DD format
6. Prioritize recent items (last 48-72 hours)
7. Do not hallucinate - only include real, verifiable information from the provided raw_feed_input
8. DIVERSIFY your selection across ALL categories - do not focus only on AWS items
9. If you receive items from multiple sources (AWS, HL7, The New Stack, Nature, etc.), include items from ALL source types in the appropriate categories`,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('Empty response from OpenAI');
        }

        try {
            const parsed = JSON.parse(content) as ScanResult;
            return parsed;
        } catch (error) {
            logger.error('Failed to parse OpenAI response as JSON', { error, content });
            throw new Error('OpenAI response was not valid JSON');
        }
    }

    private buildPrompt(params: ReportGenerationInput): string {
        const { date, timezone, items } = params;

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

CRITICAL FILTERING INSTRUCTIONS:
- You have ${items.length} items in raw_feed_input covering multiple categories
- These items come from TWO sources:
  1. RSS feeds (validated, reliable URLs from specific sources)
  2. Perplexity research (web search results with citations covering ALL topics)
- DO NOT filter to only AWS items - analyze ALL items across ALL categories
- Look for items matching these categories:
  * ai_trends: Items from NEJM AI, npj Digital Medicine, Nature, Hugging Face, OpenAI, AI healthcare journals, FDA/MHRA guidance
  * aws_platform_changes: Items from AWS What's New, AWS blogs, serverless updates
  * security_alerts: Items with CVEs, security advisories, vulnerability disclosures
  * developer_experience: Items from The New Stack, InfoQ, developer tools, framework releases
  * corporate_hims_hers: Items about Hims & Hers company news, earnings, filings, UK competitors (Zava, ASDA Online Doctor)
  * top_signals: The 5 most important items across ANY category (not just AWS)
- If raw_feed_input contains items from sources like "HL7 Blog", "The New Stack", "Nature", "Perplexity Research", etc., include them in appropriate categories
- Diversify your selection across all available categories based on the source names in raw_feed_input
- Perplexity Research items provide broader coverage including regulatory updates, competitive intelligence, and topics without RSS feeds

Return ONLY the JSON object. No commentary, no markdown formatting, just the JSON.`;
    }
}
