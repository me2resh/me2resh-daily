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

Your role is to scan the web for high-signal updates across AI, AWS/serverless, FHIR/HL7, security, and platform engineering.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON matching the exact schema provided in the prompt
2. Include ALL sections from the schema, even if empty arrays
3. For source_url fields, provide SPECIFIC article URLs, not just domain homepages
4. For raw_feed items, each should have a unique, specific source_url to the actual article
5. Ensure all dates are in YYYY-MM-DD format
6. Prioritize recent items (last 48-72 hours)
7. Do not hallucinate - only include real, verifiable information`,
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
        const { date, timezone } = params;

        return `${this.promptContent}

---

TASK FOR TODAY:
Current scan date: ${date}
Timezone: ${timezone}

Please perform the following:
1. Research and fetch recent updates (last 48-72 hours) from the sources listed above
2. Analyze the content according to the prioritization rules
3. Extract and categorize findings into the JSON structure provided
4. Ensure EVERY source_url is a specific article link, not a homepage
5. Include ALL sections from the schema (top_signals, trend_watchlist, security_alerts, aws_platform_changes, ai_trends, corporate_hims_hers, developer_experience, raw_feed)
6. If a section has no items, include it as an empty array

Return ONLY the JSON object. No commentary, no markdown formatting, just the JSON.`;
    }
}
