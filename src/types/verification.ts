export type EvidenceSource = "vector_db";

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
    mode: "llm";
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
    evidenceClass: "risk_evidence" | "trust_reference";
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
    mode: "chroma";
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
    mode: "llm";
    assessments: ClaimAssessment[];
    riskEvidenceMatches: Array<{
        evidenceId: string;
        riskSignal: string;
        explanation: string;
    }>;
}

export type RiskLevel = "low" | "moderate" | "high";

export interface RiskFactor {
    source: "message_signal" | "risk_evidence" | "verification";
    name: string;
    description: string;
    points: number;
}

export interface RiskAssessment {
    mode: "deterministic";
    score: number;
    level: RiskLevel;
    decision: "VERIFIED_SAFE" | "LOW_RISK_UNVERIFIED" | "MEDIUM_RISK" | "HIGH_RISK";
    verificationStatus: "VERIFIED" | "UNVERIFIED" | "UNAVAILABLE" | "RISK_SUPPORTED";
    verificationScore?: number;
    confidence: number;
    riskEvidenceFound: boolean;
    trustEvidenceFound: boolean;
    verifiedClaims: string[];
    unverifiedClaims: string[];
    contradictedClaims: string[];
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
    evidenceClass: "risk_evidence" | "trust_reference";
}

export interface VerificationExplanation {
    mode: "llm";
    risk: {
        level: RiskLevel;
        score: number;
        decision: RiskAssessment["decision"];
        verificationStatus: RiskAssessment["verificationStatus"];
        confidence: number;
    };
    summary: string;
    reasons: string[];
    claims: ExplanationClaim[];
    evidence: ExplanationEvidence[];
    limitations: string[];
    recommendedActions: string[];
    notice: string;
}
