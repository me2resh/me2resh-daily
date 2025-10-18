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
            itemCount: params.items.length,
        });

        const response = await this.client.chat.completions.create({
            model: this.model,
            temperature: 0.2,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content:
                        'You are an executive intelligence analyst for a Director of Platform & Architecture. Respond with JSON only.',
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
            return this.ensureDefaults(parsed, params);
        } catch (error) {
            logger.error('Failed to parse OpenAI response as JSON', { error, content });
            throw new Error('OpenAI response was not valid JSON');
        }
    }

    private buildPrompt(params: ReportGenerationInput): string {
        const { date, timezone, items } = params;

        const feedsForPrompt = items.map((item) => ({
            title: item.title,
            source: item.source,
            source_url: item.source_url,
            published_at: item.published_at,
            topic: item.topic,
            category: item.category,
            priority: item.priority,
            source_type: item.source_type,
        }));

        return `${
            this.promptContent
        }\n\nCurrent scan date: ${date}\nTimezone: ${timezone}\n\nCollected feed items (JSON array):\n${JSON.stringify(
            feedsForPrompt,
            null,
            2,
        )}\n\nReturn the JSON object described above. Do not include any commentary.`;
    }

    private ensureDefaults(parsed: ScanResult, params: ReportGenerationInput): ScanResult {
        return {
            date: parsed.date || params.date,
            timezone: parsed.timezone || params.timezone,
            top_signals: parsed.top_signals || [],
            trend_watchlist: parsed.trend_watchlist || [],
            security_alerts: parsed.security_alerts || [],
            aws_platform_changes: parsed.aws_platform_changes || [],
            ai_trends: parsed.ai_trends || [],
            corporate_hims_hers: parsed.corporate_hims_hers || [],
            developer_experience: parsed.developer_experience || [],
            raw_feed:
                parsed.raw_feed ||
                params.items.map((item) => ({
                    title: item.title,
                    source: item.source,
                    source_url: item.source_url,
                    published_at: item.published_at,
                })),
        };
    }
}
