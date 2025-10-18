import { SES } from '@aws-sdk/client-ses';
import { logger } from '@/utils/logger';
import { ScanResult } from '@/domain/scan-result';

export interface EmailSender {
    sendEmail(toAddress: string, fromAddress: string, subject: string, scanResult: ScanResult): Promise<void>;
}

export class SESEmailSender implements EmailSender {
    private ses: SES;

    constructor() {
        this.ses = new SES({ region: process.env.AWS_REGION || 'eu-west-2' });
    }

    async sendEmail(
        toAddress: string,
        fromAddress: string,
        subject: string,
        scanResult: ScanResult,
    ): Promise<void> {
        try {
            const htmlBody = this.generateHtmlBody(scanResult);
            const textBody = this.generateTextBody(scanResult);

            const params = {
                Source: fromAddress,
                Destination: {
                    ToAddresses: [toAddress],
                },
                Message: {
                    Subject: {
                        Data: subject,
                        Charset: 'UTF-8',
                    },
                    Body: {
                        Html: {
                            Data: htmlBody,
                            Charset: 'UTF-8',
                        },
                        Text: {
                            Data: textBody,
                            Charset: 'UTF-8',
                        },
                    },
                },
            };

            const result = await this.ses.sendEmail(params);
            logger.info('Email sent successfully', {
                messageId: result.MessageId,
                to: toAddress,
                topSignalsCount: scanResult.top_signals.length,
            });
        } catch (error) {
            logger.error('Failed to send email', { error, to: toAddress });
            throw error;
        }
    }

    private generateHtmlBody(scanResult: ScanResult): string {
        const topSignalsHtml = scanResult.top_signals
            .map(
                (signal) => `
            <div style="margin-bottom: 20px; padding: 15px; border-left: 4px solid ${this.getSeverityColor(signal.severity)}; background-color: #f9f9f9;">
                <h3 style="margin-top: 0; color: #333;">${signal.title}</h3>
                <p><strong>Why it matters:</strong> ${signal.why_it_matters}</p>
                <p><strong>Impact:</strong> ${signal.impact.join(', ')}</p>
                <p><strong>Severity:</strong> <span style="color: ${this.getSeverityColor(signal.severity)}; font-weight: bold;">${signal.severity.toUpperCase()}</span></p>
                <p><strong>Published:</strong> ${signal.published_at}</p>
                ${signal.notes_for_actions.length > 0 ? `<p><strong>Actions:</strong></p><ul>${signal.notes_for_actions.map((action) => `<li>${action}</li>`).join('')}</ul>` : ''}
                <p><a href="${signal.source_url}" style="color: #0066cc;">View source</a></p>
            </div>
        `,
            )
            .join('');

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        pre { background-color: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; font-size: 12px; }
    </style>
</head>
<body>
    <h1>Platform & Architecture Daily — ${scanResult.date}</h1>

    <h2>Top Signals (${scanResult.top_signals.length})</h2>
    ${scanResult.top_signals.length > 0 ? topSignalsHtml : '<p>No top signals today.</p>'}

    <h2>Complete Scan Results (JSON)</h2>
    <pre>${JSON.stringify(scanResult, null, 2)}</pre>

    <hr style="margin-top: 40px; border: none; border-top: 1px solid #ddd;">
    <p style="font-size: 12px; color: #777;">Generated with Me2resh Daily Intel Scan | ${scanResult.timezone}</p>
</body>
</html>
        `;
    }

    private generateTextBody(scanResult: ScanResult): string {
        const topSignalsText = scanResult.top_signals
            .map(
                (signal, idx) => `
${idx + 1}. ${signal.title}
   Severity: ${signal.severity.toUpperCase()}
   Why it matters: ${signal.why_it_matters}
   Impact: ${signal.impact.join(', ')}
   Published: ${signal.published_at}
   Source: ${signal.source_url}
   ${signal.notes_for_actions.length > 0 ? `Actions:\n   - ${signal.notes_for_actions.join('\n   - ')}` : ''}
        `,
            )
            .join('\n---\n');

        return `
Platform & Architecture Daily — ${scanResult.date}
========================================

TOP SIGNALS (${scanResult.top_signals.length})
${scanResult.top_signals.length > 0 ? topSignalsText : 'No top signals today.'}

---

COMPLETE SCAN RESULTS (JSON)
${JSON.stringify(scanResult, null, 2)}

---
Generated with Me2resh Daily Intel Scan | ${scanResult.timezone}
        `;
    }

    private getSeverityColor(severity: string): string {
        switch (severity) {
            case 'high':
                return '#e74c3c';
            case 'medium':
                return '#f39c12';
            case 'low':
                return '#3498db';
            default:
                return '#95a5a6';
        }
    }
}
