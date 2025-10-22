import { SourceConfiguration } from '@/domain/source-config';
import { PerplexityClient } from '@/infrastructure/perplexity-client';
import { ScanResult } from '@/domain/scan-result';
import { logger } from '@/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

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

        // Load prompt template from prompt.txt
        const promptPath = path.join('/opt/config', 'prompt.txt');
        let promptTemplate: string;

        try {
            promptTemplate = fs.readFileSync(promptPath, 'utf-8');
        } catch (error) {
            logger.error('Failed to load prompt.txt, using embedded fallback', { error });
            // Fallback to embedded prompt if file not found
            promptTemplate = `You are a research agent producing a daily strategic and technical brief for the Director of Platform & Architecture at a healthtech company operating in the UK, Germany, Ireland, France, Spain, and planning expansion to Canada and the US.

MISSION: Extract and structure actionable intelligence from the last ${lookbackHours} hours across: AWS platform changes, security vulnerabilities, developer experience shifts, healthtech regulation & AI governance, and competitive moves.

Current date: ${date}
Timezone: ${timezone}

🚨 CRITICAL RULES - VIOLATIONS CORRUPT THE DATASET 🚨
1. ONLY use URLs from your actual search results/citations - NO fake/invented URLs
2. If you cannot find real content for an item, DO NOT include it (better 2 real items than 5 fake)
3. top_signals MAXIMUM 2 AWS items (aws.amazon.com/amazonaws.com domains)
4. top_signals MUST include non-AWS items when available (security/DX/healthtech/competitors)
5. Search BROADLY across all domains - not just AWS
6. Before returning JSON: VERIFY every source_url exists in your citations

MANDATORY SEARCH STRATEGY (Execute in this order):
You MUST perform searches across ALL these domains, not just AWS:

STEP 1 - Security Search (REQUIRED):
  Search: "CVE" site:nvd.nist.gov OR site:github.com/advisories OR "npm vulnerability" OR "golang security"
  Look for: CVEs in last 48h with CVSS scores, especially npm/golang/php

STEP 2 - Developer Experience Search (REQUIRED):
  Search: "Backstage" OR "CNCF" site:backstage.io OR site:cncf.io OR site:infoq.com OR site:thenewstack.io
  Look for: Backstage releases, CNCF project updates, platform engineering patterns

STEP 3 - Healthtech/Regulatory Search (REQUIRED):
  Search: "FHIR" OR "NHS" OR "MHRA" site:digital.nhs.uk OR site:hl7.org OR site:fda.gov OR "EU AI Act"
  Look for: FHIR updates, NHS API changes, regulatory deadlines with dates

STEP 4 - Competitor Search (OPTIONAL):
  Search: "Hims" OR "Doctolib" OR "Teladoc" site:investors.hims.com OR "healthtech earnings"
  Look for: Earnings, funding, partnerships, product launches

STEP 5 - AWS Search (LAST PRIORITY):
  Search: AWS site:aws.amazon.com "What's New" OR "pricing" OR "security bulletin"
  Look for: Only high-impact changes (pricing, security, outages)

TIME WINDOWS (apply different lookback windows by category):
- Security vulnerabilities: 24-72 hours (broader window to ensure findings)
- Developer experience, healthtech regulation: 48-72 hours (more supply on quiet news days)
- AWS platform changes: 24-48 hours (only recent critical items)

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

DIVERSITY & CAPS (MANDATORY ENFORCEMENT):
*** CRITICAL: TOP SIGNALS DIVERSITY RULES (HIGHEST PRIORITY) ***

⚠️ STRICT DIVERSITY QUOTA (NON-NEGOTIABLE) ⚠️
top_signals MUST follow this EXACT distribution:

ALLOWED IN top_signals:
- MAX 1 AWS item (reduced from 2 due to AWS news saturation)
- MINIMUM 2-3 non-AWS items from different domains:
  * 1 Security item (CVE with CVSS, from nvd.nist.gov/github.com/advisories)
  * 1 DX item (Backstage/CNCF/InfoQ release or pattern)
  * 1 Healthtech/Regulatory item (FHIR/NHS/MHRA/FDA with date)
  OR
  * 1 Competitor item (Hims/Doctolib/Teladoc earnings/news)

TARGET: 3-4 items total, with ONLY 1 AWS item maximum

ENFORCEMENT RULES:
1. Even if AWS has major outage: MAX 1 AWS item in top_signals
2. Move ALL other AWS items to aws_platform_changes (even if high-impact)
3. If you cannot find non-AWS items: Search harder (expand time window to 72h)
4. REJECT the entire result if top_signals has >1 AWS item

OTHER CAPS:
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

VALIDATION RULES (ENFORCE BEFORE RETURNING JSON):
1. ALL sections MUST be present (empty arrays allowed)
2. Each category: MAX 5 items
3. ALL why_it_matters fields: MUST be non-empty, >10 chars, follow template
4. ALL source_url fields: MUST be real URLs from sources listed above
5. Security advisories: MUST have component, cve, cvss, affected_versions, fix_available
6. Version-only titles: MUST be normalized per rules above
7. *** DIVERSITY CHECK (TOP_SIGNALS) ***:
   a. Count items from aws.amazon.com or amazonaws.com domains
   b. If count > 2: Move lowest-ranked AWS items to aws_platform_changes
   c. If non-AWS items available AND top_signals has 0 non-AWS items: Add at least 1 from security_alerts or developer_experience
   d. Target: 3-5 total items with MAX 2 AWS, MIN 1 non-AWS
8. Healthcare (AI + FHIR): ≤ 40% of total items

POST-PROCESSING GUARDS (MANDATORY - RUN IN ORDER BEFORE OUTPUTTING JSON):

*** URL VALIDATION (STEP 1 - CRITICAL) ***
- Iterate through EVERY item in ALL categories
- For EACH item, verify source_url appears in your citations/search_results
- If source_url is NOT in citations: DELETE that item immediately
- DO NOT fabricate, guess, or invent URLs under any circumstances

*** DIVERSITY ENFORCEMENT ALGORITHM ***
STEP 2 - COUNT AWS ITEMS:
  - Iterate through top_signals array
  - Count items where source_url contains "aws.amazon.com" OR "amazonaws.com"
  - Store count as aws_count

STEP 3 - ENFORCE STRICT AWS CAP (IF aws_count > 1):
  - Rank AWS items by impact/severity
  - Keep ONLY THE TOP 1 highest-impact AWS item in top_signals
  - Move ALL other AWS items (aws_count - 1) to aws_platform_changes
  - Note: "Moved {N} AWS items from top_signals to aws_platform_changes for diversity (STRICT 1-item cap)"

STEP 4 - ENFORCE NON-AWS REQUIREMENT (MANDATORY):
  - Count non-AWS items in top_signals (items where source_url does NOT contain aws.amazon.com/amazonaws.com)
  - IF non_aws_count < 2:
    - REQUIRED: Add items from security_alerts, developer_experience, or ai_trends
    - MINIMUM: 2 non-AWS items (3 preferred)
    - Search with expanded 72h window if needed
  - Target: 3-4 items total with MAX 1 AWS, MIN 2-3 non-AWS

STEP 5 - VALIDATE WHY_IT_MATTERS:
  - For each item in ALL categories: Assert why_it_matters is non-empty, >10 chars
  - Reject/omit any item failing this check

STEP 6 - NORMALIZE VERSION-ONLY TITLES:
  - Rewrite any titles matching /^v?\\d+(\\.\\d+)*$/ per rules above

STEP 7 - FINAL VERIFICATION:
  - Recheck: ALL source_urls exist in your citations (NO fake URLs)
  - Verify: top_signals has ≤2 AWS items
  - Verify: top_signals has diverse sources when available
  - IF any check fails: Re-run STEPS 1-4 until compliant

FAIL CLOSED: If validation fails, omit the item rather than output invalid data.

*** BEFORE YOU OUTPUT THE FINAL JSON, RE-READ THE DIVERSITY & CAPS SECTION AND VERIFY COMPLIANCE ***

EXAMPLE OF COMPLIANT top_signals (showing diversity):
✅ GOOD - Diverse sources, MAX 2 AWS:
[
  {"title": "AWS Lambda...", "source_url": "https://aws.amazon.com/...", ...},  // AWS #1
  {"title": "npm: CVE-2025-1234...", "source_url": "https://nvd.nist.gov/...", ...},  // Security (non-AWS)
  {"title": "Backstage 1.30...", "source_url": "https://backstage.io/...", ...},  // DX (non-AWS)
  {"title": "DynamoDB pricing...", "source_url": "https://aws.amazon.com/...", ...},  // AWS #2
  {"title": "EU AI Act deadline...", "source_url": "https://eur-lex.europa.eu/...", ...}  // Regulatory (non-AWS)
]

❌ BAD - All AWS, violates diversity:
[
  {"title": "AWS Lambda...", "source_url": "https://aws.amazon.com/...", ...},  // AWS #1
  {"title": "DynamoDB outage...", "source_url": "https://aws.amazon.com/...", ...},  // AWS #2
  {"title": "AWS service sunset...", "source_url": "https://aws.amazon.com/...", ...}  // AWS #3 - VIOLATION!
]
^ If you generate output like this, you MUST move the 3rd AWS item to aws_platform_changes

═══════════════════════════════════════════════════════════════════════════════
⚠️  FINAL CHECKPOINT BEFORE RETURNING JSON ⚠️

MANDATORY VERIFICATION (check ALL of these):
1. ✓ EVERY source_url appears in your citations/search_results - NO fake URLs
2. ✓ top_signals has MAX 1 AWS item (STRICT - reduced cap due to AWS saturation)
3. ✓ top_signals has MIN 2-3 non-AWS items from different domains
4. ✓ top_signals has 3-4 items total with DIVERSE sources (Security, DX, Healthtech, Competitors)
5. ✓ All why_it_matters fields are non-empty and >10 characters
6. ✓ ALL excess AWS items moved to aws_platform_changes
7. ✓ Performed searches across ALL required domains (not just AWS)

IF ANY CHECK FAILS: Re-run POST-PROCESSING GUARDS until ALL checks pass
IF you have 2 AWS items in top_signals: MOVE 1 to aws_platform_changes NOW
═══════════════════════════════════════════════════════════════════════════════

Return ONLY the JSON object. No commentary, no markdown formatting, just the JSON.`;
        }

        // Build search strategy from sources.yaml categories
        const searchStrategy = this.buildSearchStrategy();

        // Build sources list from sources.yaml
        const sourcesList = this.buildSourcesList();

        // Build keywords from sources.yaml
        const keywords = this.buildKeywords();

        // Substitute placeholders in template
        const query = promptTemplate
            .replace(/{lookback_hours}/g, String(lookbackHours))
            .replace(/{date}/g, date)
            .replace(/{timezone}/g, timezone)
            .replace(/{search_strategy}/g, searchStrategy)
            .replace(/{sources_list}/g, sourcesList)
            .replace(/{keywords}/g, keywords);

        logger.info('Built comprehensive Perplexity query from template', {
            lookbackHours,
            queryLength: query.length,
            categoriesCount: this.config.categories?.length || 0,
        });

        return query;
    }

    private buildSearchStrategy(): string {
        // Build search strategy from sources.yaml categories
        // Sort by search_strategy.order
        const categories = (this.config as any).categories || [];
        const sortedCategories = [...categories].sort((a: any, b: any) => {
            const orderA = a.search_strategy?.order || 99;
            const orderB = b.search_strategy?.order || 99;
            return orderA - orderB;
        });

        const steps = sortedCategories
            .filter((cat: any) => cat.search_strategy)
            .map((cat: any, index: number) => {
                const strat = cat.search_strategy;
                const stepNum = index + 1;
                const required = strat.required_for_diversity ? 'REQUIRED' : 'OPTIONAL';

                let step = `STEP ${stepNum} - ${cat.name} Search (${required}):\n`;

                if (strat.queries && strat.queries.length > 0) {
                    step += `  Search: ${strat.queries.join(' OR ')}\n`;
                }

                if (cat.extract && cat.extract.length > 0) {
                    step += `  Look for: ${cat.extract[0]}\n`;
                }

                return step;
            })
            .join('\n');

        return steps || 'Search across all configured sources';
    }

    private buildSourcesList(): string {
        const categories = (this.config as any).categories || [];

        const sourcesList = categories
            .map((cat: any, index: number) => {
                let section = `${index + 1}. ${cat.name}:\n`;

                if (cat.sources?.primary) {
                    const primarySources = cat.sources.primary
                        .map((s: any) => `   - ${s.name}${s.url ? ` (${s.url})` : ''}`)
                        .join('\n');
                    section += primarySources + '\n';
                }

                return section;
            })
            .join('\n');

        return sourcesList || 'See sources.yaml for configured sources';
    }

    private buildKeywords(): string {
        const categories = (this.config as any).categories || [];

        const keywordsList = categories
            .filter((cat: any) => cat.keywords?.boost && cat.keywords.boost.length > 0)
            .map((cat: any) => `- ${cat.name}: "${cat.keywords.boost.join('", "')}"`)
            .join('\n');

        return keywordsList || 'No specific keywords configured';
    }
}
