import { ScheduledEvent } from 'aws-lambda';
import { ConfigLoader } from '@/utils/config-loader';
import { ScanService } from '@/application/scan-service';
import { ResearchService } from '@/application/research-service';
import { SESEmailSender } from '@/infrastructure/email-sender';
import { PerplexityClient } from '@/infrastructure/perplexity-client';
import { S3ReportStorage } from '@/infrastructure/report-storage';
import { logger } from '@/utils/logger';

const configLoader = ConfigLoader.getInstance();
const emailSender = new SESEmailSender();
const reportStorage = new S3ReportStorage();

// Event interface that supports both scheduled events and manual test invocations
interface DailyScanEvent extends Partial<ScheduledEvent> {
    lookback_hours?: number; // Optional override for testing (e.g., 720 for 30 days)
    detail?: {
        lookback_hours?: number; // EventBridge puts custom params in detail object
    };
}

export const lambdaHandler = async (event: DailyScanEvent): Promise<void> => {
    // Extract lookback_hours from either root level (direct invocation) or detail object (EventBridge)
    const lookbackHoursOverride = event.lookback_hours || event.detail?.lookback_hours;

    logger.info('Daily scan Lambda triggered', {
        time: event.time,
        region: event.region,
        lookbackHoursOverride,
    });

    try {
        // Load configuration
        const config = configLoader.loadConfig();

        // Apply lookback_hours override if provided in event
        if (lookbackHoursOverride) {
            logger.info('Overriding lookback_hours from event', {
                original: config.scan_config.lookback_hours,
                override: lookbackHoursOverride,
            });
            config.scan_config.lookback_hours = lookbackHoursOverride;
        }
        logger.info('Configuration loaded (Perplexity-only mode)', {
            emailTo: config.email.to_address,
            lookbackHours: config.scan_config.lookback_hours,
        });

        // Initialize Perplexity-only services
        const perplexityClient = new PerplexityClient();
        const researchService = new ResearchService(config, perplexityClient);
        const scanService = new ScanService(config, researchService);

        logger.info('Services initialized (Perplexity-only architecture)');

        // Perform the scan - Perplexity returns complete ScanResult
        const { scanResult, prompts } = await scanService.performScan();

        logger.info('Scan completed successfully', {
            date: scanResult.date,
            topSignalsCount: scanResult.top_signals.length,
            securityAlertsCount: scanResult.security_alerts.length,
            awsChangesCount: scanResult.aws_platform_changes.length,
            rawFeedCount: scanResult.raw_feed.length,
        });

        // Send email with results (first without report URL to get HTML)
        const subject = `${config.email.subject_prefix} — ${scanResult.date}`;
        const standaloneHtml = await emailSender.sendEmail(
            config.email.to_address,
            config.email.from_address,
            subject,
            scanResult,
        );

        logger.info('Email sent successfully', {
            to: config.email.to_address,
            subject,
        });

        // Save report to S3
        const reportUrl = await reportStorage.saveReport(scanResult.date, scanResult, standaloneHtml);

        logger.info('Report saved to S3', {
            reportUrl,
            date: scanResult.date,
        });

        // Save prompts to S3
        await reportStorage.savePrompts(scanResult.date, prompts);

        logger.info('Prompts saved to S3', {
            date: scanResult.date,
        });
    } catch (error) {
        logger.error('Daily scan failed', { error });
        throw error;
    }
};
