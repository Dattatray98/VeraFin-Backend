import type { VerificationPlannerInput } from "../types/verification.js";

export const mockVerificationPlannerInput: VerificationPlannerInput = {
    claims: [
        {
            claim: "SEBI requires investors to pay a ₹2,999 verification fee.",
            claim_type: "regulatory_fee",
            subject: "SEBI"
        },
        {
            claim: "The user's demat account will be blocked unless payment is made.",
            claim_type: "account_threat",
            subject: "demat account"
        }
    ],
    entities: [
        { name: "SEBI", type: "regulatory body" }
    ],
    links: [
        {
            url: "https://example-verification.com/pay",
            domain: "example-verification.com"
        }
    ],
    riskSignals: [
        {
            indicator: "urgency",
            evidence: "The message demands immediate action.",
            severity: "high"
        },
        {
            indicator: "payment_request",
            evidence: "The message requests a ₹2,999 verification fee.",
            severity: "high"
        },
        {
            indicator: "account_threat",
            evidence: "The message threatens to block the demat account.",
            severity: "high"
        },
        {
            indicator: "unverified_link",
            evidence: "The supplied domain has not been checked against official domain records.",
            severity: "medium"
        }
    ]
};
