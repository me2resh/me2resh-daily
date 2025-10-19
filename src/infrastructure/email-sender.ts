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
                // Add headers to reduce spam score
                Tags: [
                    {
                        Name: 'EmailType',
                        Value: 'DailyReport',
                    },
                ],
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
                (signal, idx) => `
            <div style="margin-bottom: 24px; padding: 20px; border-left: 4px solid ${this.getSeverityColor(
                signal.severity,
            )}; background-color: #f9f9f9; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #333; font-size: 18px;">${idx + 1}. ${signal.title}</h3>
                <p style="margin: 12px 0;"><strong>Why it matters:</strong> ${signal.why_it_matters}</p>
                <p style="margin: 8px 0;"><strong>Impact:</strong> ${signal.impact.join(', ')}</p>
                <p style="margin: 8px 0;"><strong>Severity:</strong> <span style="color: ${this.getSeverityColor(
                    signal.severity,
                )}; font-weight: bold; text-transform: uppercase;">${signal.severity}</span></p>
                <p style="margin: 8px 0;"><strong>Published:</strong> ${signal.published_at}</p>
                ${
                    signal.notes_for_actions.length > 0
                        ? `<div style="margin: 12px 0;"><strong>Actions:</strong><ul style="margin: 8px 0; padding-left: 20px;">${signal.notes_for_actions
                              .map((action) => `<li style="margin: 4px 0;">${action}</li>`)
                              .join('')}</ul></div>`
                        : ''
                }
                <p style="margin: 12px 0 0 0;"><a href="${
                    signal.source_url
                }" style="display: inline-block; padding: 8px 16px; background-color: #0066cc; color: white !important; text-decoration: none; border-radius: 4px; font-weight: 500;">View Source →</a></p>
            </div>
        `,
            )
            .join('');

        // Build other sections
        const otherSections = this.generateOtherSections(scanResult);

        return `
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Me2resh Daily — ${scanResult.date}</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td, a { font-family: Arial, sans-serif !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <tr>
                        <td style="padding: 30px;">
                            <h1 style="margin: 0 0 24px 0; color: #2c3e50; font-size: 24px; border-bottom: 3px solid #3498db; padding-bottom: 12px;">Me2resh Daily</h1>
                            <p style="margin: 0 0 24px 0; color: #666; font-size: 14px;">${
                                scanResult.date
                            } | ${scanResult.timezone}</p>

                            <h2 style="color: #34495e; font-size: 20px; margin: 32px 0 16px 0;">Top Signals (${
                                scanResult.top_signals.length
                            })</h2>
                            ${
                                scanResult.top_signals.length > 0
                                    ? topSignalsHtml
                                    : '<p style="color: #666; font-style: italic;">No top signals today.</p>'
                            }

                            ${otherSections}

                            <hr style="margin: 40px 0 20px 0; border: none; border-top: 1px solid #ddd;">
                            <p style="font-size: 12px; color: #999; margin: 0; text-align: center;">Generated with Me2resh Daily Intel Scan</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;
    }

    private generateOtherSections(scanResult: ScanResult): string {
        let html = '';

        // Security Alerts
        if (scanResult.security_alerts && scanResult.security_alerts.length > 0) {
            html += `<h2 style="color: #e74c3c; font-size: 20px; margin: 32px 0 16px 0;">Security Alerts (${scanResult.security_alerts.length})</h2>`;
            scanResult.security_alerts.forEach((alert) => {
                html += `
                <div style="margin-bottom: 16px; padding: 16px; background-color: #fff5f5; border-left: 4px solid #e74c3c; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0;"><strong>${alert.component}</strong> - ${alert.cve} (CVSS: ${alert.cvss})</p>
                    <p style="margin: 0 0 8px 0;">${alert.summary}</p>
                    <p style="margin: 0; font-size: 14px;"><a href="${alert.source_url}" style="color: #e74c3c;">Details →</a></p>
                </div>`;
            });
        }

        // AWS Platform Changes
        if (scanResult.aws_platform_changes && scanResult.aws_platform_changes.length > 0) {
            html += `<h2 style="color: #f39c12; font-size: 20px; margin: 32px 0 16px 0;">AWS Platform Changes (${scanResult.aws_platform_changes.length})</h2>`;
            scanResult.aws_platform_changes.forEach((change) => {
                html += `
                <div style="margin-bottom: 16px; padding: 16px; background-color: #fffaf0; border-left: 4px solid #f39c12; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0;"><strong>${change.service}:</strong> ${change.change}</p>
                    <p style="margin: 0; font-size: 14px; color: #666;">${change.action_hint}</p>
                </div>`;
            });
        }

        // AI Trends
        if (scanResult.ai_trends && scanResult.ai_trends.length > 0) {
            html += `<h2 style="color: #9b59b6; font-size: 20px; margin: 32px 0 16px 0;">AI Trends (${scanResult.ai_trends.length})</h2>`;
            scanResult.ai_trends.forEach((trend) => {
                html += `
                <div style="margin-bottom: 16px; padding: 16px; background-color: #f9f3ff; border-left: 4px solid #9b59b6; border-radius: 4px;">
                    <p style="margin: 0 0 8px 0;"><strong>${trend.item}</strong> (${trend.category})</p>
                    <p style="margin: 0 0 8px 0;">${trend.summary}</p>
                    <p style="margin: 0; font-size: 14px;"><a href="${trend.source_url}" style="color: #9b59b6;">Read more →</a></p>
                </div>`;
            });
        }

        return html;
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

        let otherSectionsText = '';

        // Security Alerts
        if (scanResult.security_alerts && scanResult.security_alerts.length > 0) {
            otherSectionsText += `\n\nSECURITY ALERTS (${scanResult.security_alerts.length})\n`;
            otherSectionsText += scanResult.security_alerts
                .map(
                    (alert) => `
• ${alert.component} - ${alert.cve} (CVSS: ${alert.cvss})
  ${alert.summary}
  Details: ${alert.source_url}`,
                )
                .join('\n');
        }

        // AWS Platform Changes
        if (scanResult.aws_platform_changes && scanResult.aws_platform_changes.length > 0) {
            otherSectionsText += `\n\nAWS PLATFORM CHANGES (${scanResult.aws_platform_changes.length})\n`;
            otherSectionsText += scanResult.aws_platform_changes
                .map(
                    (change) => `
• ${change.service}: ${change.change}
  ${change.action_hint}`,
                )
                .join('\n');
        }

        // AI Trends
        if (scanResult.ai_trends && scanResult.ai_trends.length > 0) {
            otherSectionsText += `\n\nAI TRENDS (${scanResult.ai_trends.length})\n`;
            otherSectionsText += scanResult.ai_trends
                .map(
                    (trend) => `
• ${trend.item} (${trend.category})
  ${trend.summary}
  Read more: ${trend.source_url}`,
                )
                .join('\n');
        }

        return `
Me2resh Daily — ${scanResult.date}
========================================

TOP SIGNALS (${scanResult.top_signals.length})
${scanResult.top_signals.length > 0 ? topSignalsText : 'No top signals today.'}
${otherSectionsText}

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
