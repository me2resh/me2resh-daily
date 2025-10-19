# Me2resh Daily - Executive Intelligence Scan

A Lambda-based serverless application that performs daily scans of platform, architecture, security, and healthcare technology sources, delivering curated insights via email.

## Overview

This application is designed for Director-level technical leadership (Platform & Architecture) to stay informed on:

- AI in healthcare and general platform impact
- Serverless & AWS platform updates
- FHIR / HL7 / interoperability standards
- Security advisories and vulnerabilities
- Corporate intelligence (configurable)
- Developer experience and engineering trends

## Architecture

### High-Level Data Flow

```
┌──────────────────┐
│  Daily Scan      │
│  Lambda Trigger  │
└────────┬─────────┘
         │
         ├──► RSS Feeds (35+ sources) ──────┐
         │    - Fast, validated URLs        │
         │    - Specific feeds              │
         │                                  │
         └──► Perplexity Research ─────────┤
              - ONE combined query          │
              - All 7 categories covered    │
              - Web citations               │
                                            ▼
                                ┌───────────────────┐
                                │  Merge & Dedupe   │
                                └─────────┬─────────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │  ChatGPT Analysis │
                                │  (gpt-4o-mini)    │
                                └─────────┬─────────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │   Email Report    │
                                └───────────────────┘
```

**Simplified View:**
```
RSS Feeds (35+ sources) ──┐
                          ├──→ Merge → ChatGPT Analysis → Email
Perplexity Research ──────┘
(ONE combined query)
```

### Code Architecture

Built following clean architecture principles with clear separation of concerns:

```
src/
├── domain/           # Domain models and interfaces
├── application/      # Business logic (ScanService, ResearchService)
├── infrastructure/   # External integrations (Email, HTTP, Perplexity, OpenAI)
├── command/lambda/   # Lambda handlers
└── utils/            # Shared utilities (logger, config loader)
```

## Features

- **Hybrid Data Collection**: Combines RSS feeds (35+ sources) with Perplexity web research for maximum coverage
- **YAML-based configuration**: Easily maintain sources and topics without code changes
- **Scheduled execution**: Daily scans at configurable times via EventBridge
- **Email delivery**: HTML and text email reports via Amazon SES
- **AI-Powered Analysis**: ChatGPT (gpt-4o-mini) categorizes and summarizes updates
- **Web Research**: Perplexity API covers topics without RSS feeds (regulatory updates, competitive intelligence)
- **URL Validation**: HTTP HEAD checks ensure all links are working before analysis
- **Severity classification**: Automatic high/medium/low severity mapping
- **Impact categorization**: Regulatory, Platform, Security, DX, Cost, Org/Strategy

## Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed
- Node.js 18.x or later
- Verified email addresses in Amazon SES (for sending/receiving emails)
- OpenAI API key (for ChatGPT analysis)
- Perplexity API key (optional, for web research - get it from https://www.perplexity.ai/settings/api)

## Configuration

### 1. Email Setup

Before deploying, verify your email addresses in Amazon SES:

```bash
aws ses verify-email-identity --email-address your-from-address@example.com
aws ses verify-email-identity --email-address your-to-address@example.com
```

Check verification status:

```bash
aws ses get-identity-verification-attributes --identities your-from-address@example.com
```

### 2. Source Configuration

All configuration is managed through `layer-config/config/sources.yaml`. This single file controls:

**Basic Settings:**
- Email addresses (supports environment variables)
- Scan schedule and timezone
- **Lookback hours** (freshness window - default: 72 hours)
- Max items per source

**RSS Feeds:**
- 35+ pre-configured RSS sources across 7 categories
- Add/remove sources without code changes

**Perplexity Research:**
- Research topics and categories (7 categories covering AI healthcare, FHIR, AWS, security, etc.)
- Sources to prioritize for each topic
- What information to extract
- Override lookback hours for web research (optional)

Example configuration:

```yaml
email:
  to_address: "${TO_EMAIL_ADDRESS}"
  from_address: "${FROM_EMAIL_ADDRESS}"
  subject_prefix: "Me2resh Daily"

scan_config:
  timezone: "Europe/London"
  lookback_hours: 72  # Adjust to change time span (24, 48, 72, 96, etc.)
  enable_perplexity_research: true

perplexity_research:
  enabled: true
  # lookback_hours: 48  # Uncomment to override scan_config
  research_topics:
    - category: "AI in Healthcare & Clinical AI"
      sources:
        - "FDA AI/ML SaMD guidance and draft documents"
        - "EU AI Act official timeline and GPAI obligations"
        - "NEJM AI, npj Digital Medicine, Lancet Digital Health"
      extract:
        - "Regulatory guidance with effective dates"
        - "Clinical AI safety standards and validation frameworks"
        - "High-risk medical device classifications"

    - category: "FHIR, HL7, and Healthcare Interoperability"
      sources:
        - "HL7 official blog and HL7 News publication"
        - "NHS England Digital FHIR APIs"
      extract:
        - "FHIR ballot updates and implementation guides"
        - "NHS API changes and interoperability guidance"

    # Add more research topics as needed...
```

**How it works:**
1. Edit `sources.yaml` to add/modify research topics
2. The app automatically builds Perplexity query from your config at runtime
3. No code changes needed - just update YAML and redeploy
4. The dynamic prompt includes all categories, sources, and extraction requirements

## Installation

1. Clone the repository:

```bash
cd me2resh-daily
```

2. Install dependencies:

```bash
npm install
```

3. Build the application:

```bash
npm run build
```

## Deployment

### Using SAM CLI

1. Build the SAM application:

```bash
sam build
```

2. Deploy with guided prompts:

```bash
sam deploy --guided
```

You'll be prompted for:
- Stack name (e.g., `me2resh-daily-stack`)
- AWS Region (e.g., `eu-west-2`)
- ToEmailAddress (email to receive reports)
- FromEmailAddress (verified SES email to send from)
- OpenAIApiKey (your OpenAI API key - will be hidden)
- ScheduleExpression (default: `cron(0 5 * * ? *)` for 5:00 AM UTC)

3. For subsequent deployments:

```bash
sam build && sam deploy
```

### Manual Deployment Parameters

```bash
sam deploy \
  --stack-name me2resh-daily-stack \
  --parameter-overrides \
    ToEmailAddress=recipient@example.com \
    FromEmailAddress=sender@example.com \
    OpenAIApiKey=sk-your-api-key-here \
    ScheduleExpression="cron(0 5 * * ? *)" \
  --capabilities CAPABILITY_IAM \
  --region eu-west-2
```

## Schedule Configuration

The application uses CloudWatch Events (EventBridge) cron expressions:

- **Daily at 5:00 AM UTC**: `cron(0 5 * * ? *)`
- **Daily at 9:00 AM UTC**: `cron(0 9 * * ? *)`
- **Weekdays at 6:00 AM UTC**: `cron(0 6 ? * MON-FRI *)`

Note: CloudWatch Events uses UTC. Adjust for your timezone accordingly.

## Testing Locally

### Invoke the Lambda locally

```bash
sam local invoke DailyScanFunction --event events/scheduled-event.json
```

Create `events/scheduled-event.json`:

```json
{
  "version": "0",
  "id": "test-event",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "time": "2025-10-18T05:00:00Z",
  "region": "eu-west-2"
}
```

### Run unit tests

```bash
npm test
```

## Development

### Linting

```bash
npm run lint
npm run eslint-fix
```

### Adding New Sources

1. Edit `config/sources.yaml`
2. Add source under the appropriate topic
3. Specify source type (`rss`, `html`, `github_releases`, etc.)
4. Redeploy: `sam build && sam deploy`

### Implementing Source Fetchers

The application includes placeholder implementations in `src/infrastructure/source-fetcher.ts`. To implement actual fetching:

1. Add required dependencies (e.g., `rss-parser`, `cheerio`, `@octokit/rest`)
2. Implement the corresponding fetch method
3. Parse and return `RawFeed[]` data

Example for RSS:

```typescript
private async fetchRssFeed(source: Source, lookbackHours: number): Promise<RawFeed[]> {
    const Parser = require('rss-parser');
    const parser = new Parser();
    const feed = await parser.parseURL(source.rss_url || source.url);

    return feed.items.map(item => ({
        title: item.title,
        source: source.name,
        source_url: item.link,
        published_at: new Date(item.pubDate).toISOString().split('T')[0]
    }));
}
```

## Monitoring

### CloudWatch Logs

View Lambda execution logs:

```bash
sam logs -n DailyScanFunction --stack-name me2resh-daily-stack --tail
```

### Metrics

The function includes AWS X-Ray tracing. View traces in the AWS X-Ray console.

## Troubleshooting

### Email not sending

1. Verify SES email identities:
   ```bash
   aws ses list-identities
   aws ses get-identity-verification-attributes --identities your-email@example.com
   ```

2. Check SES sending limits (sandbox vs production)
3. Review CloudWatch Logs for errors

### Lambda timeout

- Default timeout: 15 minutes (900 seconds)
- Adjust in `template.yaml` under `Globals.Function.Timeout`

### Configuration not loading

- Ensure `config/sources.yaml` is included in the deployment package
- Check CloudWatch Logs for configuration errors
- Verify environment variables are set correctly

## Security Considerations

- **SES Permissions**: Lambda has minimal SES permissions (send only)
- **Secrets**: Use AWS Secrets Manager or Parameter Store for sensitive data
- **IAM Roles**: Follows principle of least privilege
- **Input Validation**: Validate all external source data before processing

## Cost Estimation

Estimated monthly costs (as of 2025):

- Lambda: $0.20 (daily 15-min execution at 512MB)
- SES: $0.10 (30 emails/month)
- CloudWatch Logs: $0.50 (log storage and insights)
- EventBridge: Free (included in AWS Free Tier)
- **OpenAI API (GPT-4o-mini)**: ~$0.30-0.60/month (for analysis)
- **Perplexity API (sonar)**: ~$1.50-3.00/month (1 search per day)

**Total**: ~$2.60-4.40/month

Note:
- Perplexity is optional - system works with RSS-only mode
- Using GPT-4o instead of GPT-4o-mini would add ~$8-15/month
- Costs scale with the volume of content analyzed

## Future Enhancements

- [ ] Implement AI/LLM integration for content analysis using OpenAI ChatGPT API
- [ ] Add support for all source types (RSS, GitHub, NVD, CISA)
- [ ] Implement caching to avoid re-fetching unchanged content
- [ ] Add webhook support for real-time alerts
- [ ] Create dashboard for historical scan results
- [ ] Implement trend analysis across multiple scans
- [ ] Add Slack/Teams integration as alternative to email
- [ ] Switch to GPT-4o for higher quality analysis when budget allows
- [ ] Implement retry logic for OpenAI API rate limits

## License

MIT

## Author

Ahmed Mohamed

## Support

For issues and questions, please open an issue in the repository.
