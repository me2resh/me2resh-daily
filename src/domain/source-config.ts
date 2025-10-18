export interface EmailConfig {
    to_address: string;
    from_address: string;
    subject_prefix: string;
}

export interface ScanConfig {
    timezone: string;
    scan_time: string;
    lookback_hours: number;
}

export interface Source {
    name: string;
    url: string;
    type: 'rss' | 'html' | 'github_releases' | 'github_advisories' | 'nvd_api' | 'cisa_api';
    rss_url?: string;
    cik?: string;
    filter?: string[];
    ecosystems?: string[];
    keywords: string[];
}

export interface Topic {
    name: string;
    category: string;
    priority: number;
    sources: Source[];
}

export interface SeverityRules {
    high: string[];
    medium: string[];
    low: string[];
}

export interface ImpactKeywords {
    [key: string]: string[];
}

export interface SourceConfiguration {
    email: EmailConfig;
    scan_config: ScanConfig;
    topics: Topic[];
    severity_rules: SeverityRules;
    impact_keywords: ImpactKeywords;
}
