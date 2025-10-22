import { SourceConfiguration } from '@/domain/source-config';
import { PerplexityClient } from '@/infrastructure/perplexity-client';
import { ScanResult } from '@/domain/scan-result';
import { logger } from '@/utils/logger';

export interface ResearchResult {
    report: Partial<ScanResult>;
    query: string;
}

export class ResearchService {
    constructor(private config: SourceConfiguration, private perplexityClient: PerplexityClient) {}

    async performResearch(date: string, timezone: string): Promise<ResearchResult> {
        // Build comprehensive Perplexity query
        const query = this.buildComprehensiveQuery(date, timezone);

        logger.info('Starting Perplexity-only research with comprehensive query', {
            queryLength: query.length,
        });

        try {
            const report = await this.perplexityClient.searchStructured(query);

            logger.info('Perplexity structured research completed', {
                topSignalsCount: report.top_signals?.length ?? 0,
                awsChangesCount: report.aws_platform_changes?.length ?? 0,
                securityAlertsCount: report.security_alerts?.length ?? 0,
                aiTrendsCount: report.ai_trends?.length ?? 0,
                corporateCompetitorsCount: report.corporate_competitors?.length ?? 0,
                developerExperienceCount: report.developer_experience?.length ?? 0,
            });

            return { report, query };
        } catch (error) {
            logger.error('Perplexity research failed', {
                error: error instanceof Error ? error.message : String(error),
            });
            // Return empty report on failure
            return {
                report: {
                    date,
                    timezone,
                    top_signals: [],
                    trend_watchlist: [],
                    security_alerts: [],
                    aws_platform_changes: [],
                    ai_trends: [],
                    corporate_competitors: [],
                    developer_experience: [],
                    raw_feed: [],
                },
                query,
            };
        }
    }

    private buildComprehensiveQuery(date: string, timezone: string): string {
        // Get lookback hours from config (default 24h)
        const lookbackHours = this.config.scan_config.lookback_hours || 24;

        const query = `You are a research agent producing a daily strategic and technical brief for the Director of Platform & Architecture at a healthtech company operating in the UK, Germany, Ireland, France, Spain, and planning expansion to Canada and the US.

MISSION: Extract and structure actionable intelligence from the last ${lookbackHours} hours across: AWS platform changes, security vulnerabilities, developer experience shifts, healthtech regulation & AI governance, and competitive moves.

Current date: ${date}
Timezone: ${timezone}

TIME WINDOWS (apply different lookback windows by category):
- AWS platform changes, security vulnerabilities: 24-48 hours
- Developer experience, healthtech regulation, AI trends: up to 72 hours (more supply on quiet news days)

SOURCES (in priority order):
1. AWS: What's New, AWS blogs (Compute, Architecture, Security), ALAS, Well-Architected, serverlessland.com
2. Security: NVD (nvd.nist.gov), CISA KEV, GitHub Advisory DB, AWS Security Bulletins
3. Developer Experience: Backstage blog/announcements, InfoQ, The New Stack, CNCF, ThoughtWorks Tech Radar
4. Healthtech Regulation: MHRA (gov.uk/mhra), EMA (ema.europa.eu), FDA (fda.gov), EU AI Act, NHS England/FHIR APIs, HL7, FHIR Foundation, ONC TEFCA
5. Competitors (UK/EU healthtech): Zava, Doctolib, Babylon Health, Kry/Livi, Push Doctor, Ada Health, Teladoc, Hims & Hers (investors.hims.com, SEC filings)
6. AI: OpenAI/Anthropic blogs (platform focus), AWS Bedrock, Hugging Face, NEJM AI, npj Digital Medicine, Lancet Digital Health, FDA AI/ML guidance
7. FinOps & Cost: AWS pricing updates, Well-Architected cost optimization, FinOps Foundation
8. Leadership: major practitioner blogs (Google SRE, AWS Builders' Library), InfoQ leadership
9. Emerging Tech: CNCF projects, serverless tooling, platform engineering patterns

KEYWORDS TO BOOST (use in matching/ranking):
- AWS: "Lambda", "API Gateway", "EventBridge", "Step Functions", "DynamoDB", "EKS", "pricing", "security bulletin", "Well-Architected", "eu-west-2"
- Security: "CVE", "CVSS", "ALAS", "KEV", "npm", "golang", "composer", "php", "exploit"
- DX: "Backstage", "developer portal", "golden path", "AIOps", "DORA", "platform engineering"
- Healthtech: "FHIR", "HL7", "NHS", "MHRA", "EMA", "FDA", "SaMD", "GDPR", "HIPAA", "EU AI Act"
- AI: "Bedrock", "model serving", "observability", "guardrails", "GPU", "clinical AI"
- Competitors: "Zava", "Doctolib", "Babylon", "Hims", "Teladoc"

NOISE BLACKLIST (exclude these patterns):
- serverlessland.com/contributors/* (generic contributor pages)
- youtube.com/* (unless official incident briefing)
- tomsguide.com/* (unless corroborating primary incident)
- Generic status pages (/status, /watch paths)
- Undated "What's New" or contributor pages

DIVERSITY & CAPS:
- TOP SIGNALS: MAX 2 items from aws.amazon.com domains; if non-AWS items exist, include ≥1 from developer_experience OR security_alerts
- Each populated category: MAX 5 items
- Healthcare combined (AI + FHIR): ≤ 40% of total items
- AWS routine items → aws_platform_changes (not top_signals unless pricing/behaviour/security change)

PLACEMENT RULES:
- top_signals: ONLY (a) pricing/behaviour/security changes, (b) exploited CVEs/AWS bulletins, (c) dated regulation, (d) outages with primary source
- aws_platform_changes: routine "What's New", service GAs, region support, console toggles; include likely_effect + action_hint
- security_alerts: CVEs with component, cve, cvss, affected_versions, fix_available
- developer_experience: tool/framework releases, Backstage/CNCF/InfoQ patterns; ≥1 non-AWS if available
- ai_trends: 0-2 items unless dated obligation; platform-impacting infra/tooling only
- corporate_competitors: Hims & Hers, Zava, Doctolib, Babylon, etc. — press releases, earnings, filings, media coverage
- trend_watchlist: emerging patterns across multiple sources (rising/stable/fading trajectory)

TITLE & TEXT NORMALISERS:
- Security advisories: "{component}: {CVE or vuln type} allows {impact} (CVSS {score})"
  Example: "php-src: CVE-2025-12345 use-after-free allows RCE (CVSS 9.8)"
- Version-only releases matching /^v?\\d+(\\.\\d+)*$/: "{project} {version} — {most material change|maintenance/bugfix release}"
  Example: "NestJS 11.1.7 — maintenance release; minor fixes, no breaking changes"

WHY-IT-MATTERS TEMPLATE (REQUIRED for ALL items):
Format: "{who_is_affected} because {what_changed} which {so_what to reliability/cost/risk/DX/compliance}."
Examples:
- "Email ops gain visibility because SES adds IP observability, which cuts time to diagnose sender reputation drops."
- "Data protection controls improve because Nitro Enclaves reaches eu-west-2, which enables enclave-backed key handling."
VALIDATION: Reject any item where why_it_matters is empty/"undefined"/<10 chars. If you cannot express this in one sentence, OMIT the item.

RANKING SIGNALS (additive scores):
+3: Dated behaviour/pricing/security change (AWS bulletin, GA that alters defaults)
+3: Regulatory obligation with effective date (EU AI Act, NHS/HL7 deadlines)
+2: Primary source (official blog/docs/filing)
+2: EU-West-2 relevance or Zavva stack (Lambda, API Gateway, DynamoDB, EKS, NestJS, TypeScript, Go)
+1: Cost/perf claim with % or measurable KPI
-2: Routine "What's New" feature with no cost/behaviour/security
-3: Vague posts ("Status", "Watch", contributor pages)

OUTPUT (strict JSON schema):
{
  "date": "${date}",
  "timezone": "${timezone}",
  "top_signals": [
    {
      "title": "string",
      "why_it_matters": "string (REQUIRED: {who} because {what} which {so_what})",
      "impact": ["Regulatory" | "Platform" | "Security" | "DX" | "Cost" | "Org/Strategy" | "Healthtech" | "AI"],
      "severity": "high" | "medium" | "low",
      "source_url": "string (MUST be real URL from sources above)",
      "published_at": "YYYY-MM-DD",
      "notes_for_actions": ["string"]
    }
  ],
  "trend_watchlist": [
    {
      "topic": "string",
      "summary": "string",
      "trajectory": "rising" | "stable" | "fading",
      "sources": ["string"],
      "source_url": "string"
    }
  ],
  "security_alerts": [
    {
      "component": "string",
      "cve": "string",
      "cvss": "string",
      "summary": "string",
      "affected_versions": "string",
      "fix_available": boolean,
      "source_url": "string"
    }
  ],
  "aws_platform_changes": [
    {
      "service": "string",
      "change": "string",
      "likely_effect": "string",
      "action_hint": "string",
      "source_url": "string"
    }
  ],
  "ai_trends": [
    {
      "item": "string",
      "category": "regulatory" | "clinical" | "platform" | "tooling" | "governance",
      "summary": "string",
      "impact": "string",
      "source_url": "string",
      "published_at": "YYYY-MM-DD"
    }
  ],
  "corporate_competitors": [
    {
      "item": "string",
      "type": "press" | "filing" | "earnings" | "media",
      "summary": "string",
      "source_url": "string",
      "published_at": "YYYY-MM-DD"
    }
  ],
  "developer_experience": [
    {
      "pattern_or_tool": "string",
      "update": "string",
      "relevance_to_platform": "string",
      "source_url": "string"
    }
  ],
  "raw_feed": [
    {
      "title": "string",
      "source": "string",
      "source_url": "string",
      "published_at": "YYYY-MM-DD"
    }
  ]
}

VALIDATION RULES:
1. ALL sections MUST be present (empty arrays allowed)
2. Each category: MAX 5 items
3. ALL why_it_matters fields: MUST be non-empty, >10 chars, follow template
4. ALL source_url fields: MUST be real URLs from sources listed above
5. Security advisories: MUST have component, cve, cvss, affected_versions, fix_available
6. Version-only titles: MUST be normalized per rules above
7. AWS items in top_signals: MAX 2; prefer non-AWS when available
8. Healthcare (AI + FHIR): ≤ 40% of total items

POST-PROCESSING GUARDS:
- Assert no why_it_matters is blank/"undefined"
- Rewrite version-only titles per rules above
- Move AWS items from top_signals → aws_platform_changes unless high-impact
- Ensure each category with items has ≥1 non-AWS source when available

FAIL CLOSED: If validation fails, omit the item rather than output invalid data.

Return ONLY the JSON object. No commentary, no markdown formatting, just the JSON.`;

        logger.info('Built comprehensive Perplexity query', {
            lookbackHours,
            queryLength: query.length,
        });

        return query;
    }
}
