import { logger } from './logger';

// Comprehensive allowlist of trusted domains
const ALLOWLIST = new Set([
    // AWS
    'aws.amazon.com',
    'alas.aws.amazon.com',
    'docs.aws.amazon.com',

    // Standards & Interop
    'blog.hl7.org',
    'hl7news.hl7.org',
    'fhir.org',
    'fhirblog.com',
    'digital.nhs.uk',
    'england.nhs.uk',
    'standards.nhs.uk',
    'healthit.gov',
    'cms.gov',

    // Regulators (FDA, MHRA, EMA, etc)
    'fda.gov',
    'gov.uk',
    'yellowcard.mhra.gov.uk',
    'ema.europa.eu',
    'imdrf.org',
    'hpra.ie',
    'has-sante.fr',
    'ansm.sante.fr',
    'cnil.fr',
    'bfarm.de',
    'gematik.de',
    'aemps.gob.es',
    'aepd.es',
    'canada.ca',
    'cihi.ca',
    'infoway-inforoute.ca',

    // AI Vendors & Research
    'openai.com',
    'anthropic.com',
    'huggingface.co',
    'ai.nejm.org',
    'nature.com',
    'thelancet.com',

    // Corporate
    'investors.hims.com',
    'news.hims.com',
    'sec.gov',
    'find-and-update.company-information.service.gov.uk',

    // Security
    'nvd.nist.gov',
    'cisa.gov',
    'github.com',
    'cvedetails.com',
    'tenable.com',

    // CNCF & DevX
    'cncf.io',
    'serverlessland.com',
    'serverless.com',
    'backstage.spotify.com',
    'backstage.io',
    'thoughtworks.com',
    'infoq.com',
    'thenewstack.io',

    // Stack releases
    'go.dev',
]);

export interface ValidatedUrl {
    url: string;
    status: number;
    checkedAt: string;
    isValid: boolean;
    error?: string;
}

/**
 * Canonicalize URL: remove tracking params, ensure HTTPS, normalize
 */
export function canonicalizeUrl(rawUrl: string): string {
    try {
        const url = new URL(rawUrl);

        // Force HTTPS
        if (url.protocol !== 'https:') {
            url.protocol = 'https:';
        }

        // Remove tracking parameters
        const trackingParams = [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_term',
            'utm_content',
            'gclid',
            'fbclid',
            'igshid',
            '_ga',
            'mc_cid',
            'mc_eid',
        ];

        trackingParams.forEach((param) => url.searchParams.delete(param));

        // Normalize path (remove trailing slash unless root)
        if (url.pathname !== '/' && url.pathname.endsWith('/')) {
            url.pathname = url.pathname.slice(0, -1);
        }

        return url.toString();
    } catch (error) {
        logger.warn('Failed to canonicalize URL', { rawUrl, error });
        return rawUrl;
    }
}

/**
 * Check if domain is in allowlist
 */
export function isDomainAllowed(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return ALLOWLIST.has(urlObj.hostname);
    } catch {
        return false;
    }
}

/**
 * Validate URL with HTTP HEAD check
 */
export async function validateUrl(rawUrl: string): Promise<ValidatedUrl> {
    const checkedAt = new Date().toISOString();

    try {
        // Canonicalize first
        const canonicalUrl = canonicalizeUrl(rawUrl);

        // Check allowlist
        if (!isDomainAllowed(canonicalUrl)) {
            return {
                url: canonicalUrl,
                status: 0,
                checkedAt,
                isValid: false,
                error: 'Domain not in allowlist',
            };
        }

        // HTTP HEAD check (with fallback to GET if HEAD fails)
        let response: Response | null = null;

        try {
            response = await fetch(canonicalUrl, {
                method: 'HEAD',
                redirect: 'follow',
                headers: {
                    'User-Agent': 'Me2resh-Daily-Scanner/1.0',
                },
                signal: AbortSignal.timeout(10000), // 10s timeout
            });
        } catch (headError) {
            // Some servers block HEAD, fallback to GET
            logger.debug('HEAD failed, trying GET', { url: canonicalUrl });
            try {
                response = await fetch(canonicalUrl, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: {
                        'User-Agent': 'Me2resh-Daily-Scanner/1.0',
                    },
                    signal: AbortSignal.timeout(10000),
                });
            } catch (getError) {
                return {
                    url: canonicalUrl,
                    status: 0,
                    checkedAt,
                    isValid: false,
                    error: `Fetch failed: ${getError instanceof Error ? getError.message : 'Unknown error'}`,
                };
            }
        }

        if (!response) {
            return {
                url: canonicalUrl,
                status: 0,
                checkedAt,
                isValid: false,
                error: 'No response received',
            };
        }

        const isValid = response.status >= 200 && response.status < 300;

        return {
            url: canonicalUrl,
            status: response.status,
            checkedAt,
            isValid,
            error: isValid ? undefined : `HTTP ${response.status}`,
        };
    } catch (error) {
        return {
            url: rawUrl,
            status: 0,
            checkedAt,
            isValid: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Batch validate multiple URLs
 */
export async function validateUrls(urls: string[]): Promise<Map<string, ValidatedUrl>> {
    const results = new Map<string, ValidatedUrl>();

    // Process in parallel but with concurrency limit
    const CONCURRENCY = 5;
    for (let i = 0; i < urls.length; i += CONCURRENCY) {
        const batch = urls.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map((url) => validateUrl(url)));

        batchResults.forEach((result, index) => {
            results.set(batch[index], result);
        });
    }

    return results;
}
