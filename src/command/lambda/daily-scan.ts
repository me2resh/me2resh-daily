import { ScheduledEvent } from 'aws-lambda';
import { ConfigLoader } from '@/utils/config-loader';
import { ScanService } from '@/application/scan-service';
import { HttpSourceFetcher } from '@/infrastructure/source-fetcher';
import { SESEmailSender } from '@/infrastructure/email-sender';
import { logger } from '@/utils/logger';

const configLoader = ConfigLoader.getInstance();
const sourceFetcher = new HttpSourceFetcher();
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

        // Perform the scan
        const scanService = new ScanService(config, sourceFetcher);
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
