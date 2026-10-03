export type EvidenceSource = "vector_db" | "structured_db" | "browser_api";

export interface PlannerClaim {
    claim: string;
    claim_type: string;
    subject: string;
}

export interface PlannerEntity {
    name: string;
    type: string;
}

export interface PlannerLink {
    url: string;
    domain: string;
}

export interface RiskSignal {
    indicator: string;
    evidence: string;
    severity: "low" | "medium" | "high";
}

export interface VerificationPlannerInput {
    claims: PlannerClaim[];
    entities: PlannerEntity[];
    links: PlannerLink[];
    riskSignals: RiskSignal[];
}

export interface VerificationQuery {
    id: string;
    query: string;
    source: EvidenceSource;
    target: {
        type: "claim" | "entity" | "domain";
        value: string;
    };
    purpose: string;
}

export interface VerificationPlan {
    mode: "mock";
    queries: VerificationQuery[];
}

export type RetrievalOutcome =
    | "evidence_found"
    | "no_evidence_found"
    | "retrieval_failed";

export interface EvidenceItem {
    id: string;
    title: string;
    sourceName: string;
    sourceUrl: string;
    publishedAt: string | null;
    retrievedAt: string;
    content: string;
    isMock: boolean;
    documentId?: string;
    documentType?: string;
    sourceOrganization?: string;
    authorityLevel?: string;
    chunkIndex?: number;
    pageNumber?: number | null;
}

export interface QueryRetrievalResult {
    queryId: string;
    source: EvidenceSource;
    target: VerificationQuery["target"];
    outcome: RetrievalOutcome;
    evidence: EvidenceItem[];
    error?: string;
}

export interface EvidenceRetrieval {
    mode: "lancedb";
    results: QueryRetrievalResult[];
}

export type ClaimVerificationStatus =
    | "supported"
    | "contradicted"
    | "unverified"
    | "unable_to_verify";

export interface ClaimAssessment {
    claim: string;
    claimType: string;
    status: ClaimVerificationStatus;
    relatedQueryIds: string[];
    evidenceIds: string[];
    explanation: string;
}

export interface EvidenceAnalysis {
    mode: "preliminary";
    assessments: ClaimAssessment[];
}

export type RiskLevel = "low" | "moderate" | "high";

export interface RiskFactor {
    source: "message_signal" | "verification";
    name: string;
    description: string;
    points: number;
}

export interface RiskAssessment {
    mode: "mock";
    score: number;
    level: RiskLevel;
    factors: RiskFactor[];
    limitations: string[];
    interpretation: string;
}

export interface ExplanationClaim {
    claim: string;
    status: ClaimVerificationStatus;
    explanation: string;
    evidenceIds: string[];
}

export interface ExplanationEvidence {
    id: string;
    title: string;
    sourceName: string;
    sourceUrl: string;
    source: EvidenceSource;
    retrievedAt: string;
    isMock: boolean;
}

export interface VerificationExplanation {
    mode: "mock";
    risk: {
        level: RiskLevel;
        score: number;
    };
    summary: string;
    reasons: string[];
    claims: ExplanationClaim[];
    evidence: ExplanationEvidence[];
    limitations: string[];
    recommendedActions: string[];
    notice: string;
}
