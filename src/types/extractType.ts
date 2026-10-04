// ─── Sub-types ────────────────────────────────────────────────────────────────

export interface LinkItem {
    url: string;
    domain: string;
    context: string;
    position: string;
}

export interface AmountItem {
    value: string;
    currency: string;
    context: string;
}

export interface ClaimItem {
    claim: string;
    claim_type: string;
    subject: string;
}

export interface RiskIndicatorItem {
    indicator: string;
    evidence: string;
    severity: "high" | "medium" | "low";
}

export interface EntityGroup {
    organizations: string[];
    companies: string[];
    financial_institutions: string[];
    regulatory_bodies: string[];
    people: string[];
    locations: string[];
}

export interface FinancialInformation {
    amounts: AmountItem[];
    payment_methods: string[];
    upi_ids: string[];
    account_numbers: string[];
}

export interface ImageMetadata {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
    storagePath: string;
}

// ─── Main Extract Type ─────────────────────────────────────────────────────────

export interface ExtractType {
    input: {
        type: string;
        language: string;
        source: string;
    };

    content: {
        raw_text?: string;
        extracted_text?: string;
        image_metadata?: ImageMetadata;
    };

    intent: {
        primary: string;
        secondary: string[];
        requested_action: string;
        urgency: string;
    };

    links: LinkItem[];

    keywords: string[];

    entities: EntityGroup;

    financial_information: FinancialInformation;

    claims: ClaimItem[];

    risk_indicators: RiskIndicatorItem[];
}

// ─── LLM Interface Types ───────────────────────────────────────────────────────

/** Input sent to the LLM service */
export interface LLMInput {
    extractedText: string;
    input: ExtractType["input"];
    claims: ClaimItem[];
    financialInformation: FinancialInformation;
    entities: EntityGroup;
    intent?: ExtractType["intent"];
    riskIndicators?: RiskIndicatorItem[];
}

/** Output expected back from the LLM service */
export interface LLMOutput {
    status: "verified" | "unverified" | "suspicious" | "inconclusive";
    /** Mapped to UI risk badge: High Risk / Medium Risk / Low Risk */
    risk_level: "high" | "medium" | "low" | "none";
    claims: ClaimItem[];
    riskIndicators: RiskIndicatorItem[];
    evidence: string[];
    confidence?: number;           // 0 – 1
    explanation: string;
    recommendation: string;
    warnings?: string[];
    /** Per-source check results for Evidence & Verification screen */
    sources?: SourceCheckItem[];
}

/** Per-source verification result for the Evidence & Verification screen */
export interface SourceCheckItem {
    name: string;    // e.g. "SEBI Official Website", "RBI Website"
    url?: string;
    status: "found" | "not_found" | "unverified";
    detail?: string;
}

/** Full verification result stored in MongoDB */
export interface VerificationResult {
    overall_status: "verified" | "unverified" | "suspicious" | "inconclusive";
    /** UI risk badge: displayed as High Risk / Medium Risk / Low Risk in app */
    risk_level: "high" | "medium" | "low" | "none";
    confidence?: number;
    explanation: string;
    evidence: string[];
    warnings: string[];
    recommendation: string;
    sources?: SourceCheckItem[];
    claims: ClaimItem[];
    risk_indicators: RiskIndicatorItem[];
}