export interface TopSignal {
    title: string;
    why_it_matters: string;
    impact: Array<'Regulatory' | 'Platform' | 'Security' | 'DX' | 'Cost' | 'Org/Strategy'>;
    severity: 'high' | 'medium' | 'low';
    source_url: string;
    published_at: string;
    notes_for_actions: string[];
}

export interface TrendWatchlist {
    topic: string;
    summary: string;
    trajectory: 'rising' | 'stable' | 'fading';
    sources: string[];
}

export interface SecurityAlert {
    component: string;
    cve: string;
    cvss: string;
    summary: string;
    affected_versions: string;
    fix_available: boolean;
    source_url: string;
}

export interface AwsPlatformChange {
    service: string;
    change: string;
    likely_effect: string;
    action_hint: string;
}

export interface AiTrend {
    item: string;
    category: 'regulatory' | 'clinical' | 'platform' | 'tooling';
    summary: string;
    impact: string;
    source_url: string;
    published_at: string;
}

export interface CorporateHimsHers {
    item: string;
    type: 'press' | 'filing' | 'earnings' | 'media';
    summary: string;
    source_url: string;
    published_at: string;
}

export interface DeveloperExperience {
    pattern_or_tool: string;
    update: string;
    relevance_to_platform: string;
}

export interface RawFeed {
    title: string;
    source: string;
    source_url: string;
    published_at: string;
}

export interface ScanResult {
    date: string;
    timezone: string;
    top_signals: TopSignal[];
    trend_watchlist: TrendWatchlist[];
    security_alerts: SecurityAlert[];
    aws_platform_changes: AwsPlatformChange[];
    ai_trends: AiTrend[];
    corporate_hims_hers: CorporateHimsHers[];
    developer_experience: DeveloperExperience[];
    raw_feed: RawFeed[];
}
