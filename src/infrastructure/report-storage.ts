import { S3 } from '@aws-sdk/client-s3';
import { ScanResult } from '@/domain/scan-result';
import { logger } from '@/utils/logger';

export interface PromptLog {
    perplexity?: {
        query: string;
        timestamp: string;
    };
    chatgpt?: {
        system_prompt: string;
        user_prompt: string;
        timestamp: string;
    };
}

export interface ReportStorage {
    saveReport(date: string, scanResult: ScanResult, htmlBody: string): Promise<string>;
    savePrompts(date: string, prompts: PromptLog): Promise<void>;
}

export class S3ReportStorage implements ReportStorage {
    private readonly s3: S3;
    private readonly bucketName: string;
    private readonly region: string;

    constructor() {
        this.bucketName = process.env.REPORTS_BUCKET_NAME || 'me2resh-daily-scan';
        this.region = process.env.AWS_REGION || 'eu-west-2';
        this.s3 = new S3({ region: this.region });
    }

    async saveReport(date: string, scanResult: ScanResult, htmlBody: string): Promise<string> {
        try {
            // 1. Save data.json
            await this.uploadFile(
                `reports/${date}/data.json`,
                JSON.stringify(scanResult, null, 2),
                'application/json',
            );

            // 2. Save report.html
            await this.uploadFile(`reports/${date}/report.html`, htmlBody, 'text/html');

            // 3. Update index.html (copy of latest report)
            await this.uploadFile('index.html', htmlBody, 'text/html');

            const reportUrl = this.getWebsiteUrl(`reports/${date}/report.html`);
            logger.info('Report saved to S3', {
                date,
                reportUrl,
                bucket: this.bucketName,
            });

            return reportUrl;
        } catch (error) {
            logger.error('Failed to save report to S3', { error, date });
            throw error;
        }
    }

    async savePrompts(date: string, prompts: PromptLog): Promise<void> {
        try {
            await this.uploadFile(
                `reports/${date}/prompts.json`,
                JSON.stringify(prompts, null, 2),
                'application/json',
            );

            logger.info('Prompts saved to S3', {
                date,
                hasPerplexity: !!prompts.perplexity,
                hasChatGPT: !!prompts.chatgpt,
            });
        } catch (error) {
            logger.error('Failed to save prompts to S3', { error, date });
            // Don't throw - prompt saving is non-critical
        }
    }

    private async uploadFile(key: string, body: string, contentType: string): Promise<void> {
        await this.s3.putObject({
            Bucket: this.bucketName,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: 'no-cache', // Always fetch latest
        });
    }

    private getWebsiteUrl(key: string): string {
        // S3 direct URL format: https://bucket-name.s3.region.amazonaws.com/key
        return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    }
}
