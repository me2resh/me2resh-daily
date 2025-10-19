import { ScheduledEvent } from 'aws-lambda';
import { ConfigLoader } from '@/utils/config-loader';
import { ScanService } from '@/application/scan-service';
import { ResearchService } from '@/application/research-service';
import { SESEmailSender } from '@/infrastructure/email-sender';
import { OpenAIReportGenerator } from '@/infrastructure/openai-report-generator';
import { HttpSourceFetcher } from '@/infrastructure/source-fetcher';
import { PerplexityClient } from '@/infrastructure/perplexity-client';
import { logger } from '@/utils/logger';

const configLoader = ConfigLoader.getInstance();
const sourceFetcher = new HttpSourceFetcher();
const reportGenerator = new OpenAIReportGenerator();
const emailSender = new SESEmailSender();

export const lambdaHandler = async (event: ScheduledEvent): Promise<void> => {
    logger.info('Daily scan Lambda triggered', {
        time: event.time,
        region: event.region,
    });

    try {
        // Load configuration
        const config = configLoader.loadConfig();
        logger.info('Configuration loaded', {
            topicCount: config.topics.length,
            emailTo: config.email.to_address,
        });

        // Initialize services
        let researchService: ResearchService | undefined;

        // Only create Perplexity client if research is enabled and API key is set
        if (config.scan_config.enable_perplexity_research && process.env.PERPLEXITY_API_KEY) {
            try {
                const perplexityClient = new PerplexityClient();
                researchService = new ResearchService(config, perplexityClient);
                logger.info('Perplexity research enabled');
            } catch (error) {
                logger.warn('Failed to initialize Perplexity client, continuing without research', {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        } else {
            logger.info('Perplexity research disabled', {
                enabled: config.scan_config.enable_perplexity_research,
                hasApiKey: !!process.env.PERPLEXITY_API_KEY,
            });
        }

        // Perform the scan - Fetch RSS feeds + Perplexity research, then analyze with ChatGPT
        const scanService = new ScanService(config, sourceFetcher, reportGenerator, researchService);
        const scanResult = await scanService.performScan();

        logger.info('Scan completed successfully', {
            date: scanResult.date,
            topSignalsCount: scanResult.top_signals.length,
            securityAlertsCount: scanResult.security_alerts.length,
            awsChangesCount: scanResult.aws_platform_changes.length,
            rawFeedCount: scanResult.raw_feed.length,
        });

        // Send email with results
        const subject = `${config.email.subject_prefix} — ${scanResult.date}`;
        await emailSender.sendEmail(config.email.to_address, config.email.from_address, subject, scanResult);

        logger.info('Email sent successfully', {
            to: config.email.to_address,
            subject,
        });
    } catch (error) {
        logger.error('Daily scan failed', { error });
        throw error;
    }
};
