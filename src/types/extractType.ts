export interface extractType {
    "input": {
        "type": string,
        "language": string,
        "source": string
    },

    "content": {
        "raw_text": string
    },

    "intent": {
        "primary": string
        "secondary": [string],
        "requested_action": string,
        "urgency": string
    },

    "links": [
        {
            "url": string,
            "domain": string,
            "context": string,
            "position": string
        }
    ],

    "keywords": [string],

    "entities": {
        "organizations": [],
        "companies": [],
        "financial_institutions": [],
        "regulatory_bodies": [],
        "people": [],
        "locations": []
    },

    "financial_information": {
        "amounts": [
            {
                "value": string,
                "currency": string,
                "context": string
            }
        ],
        "payment_methods": [],
        "upi_ids": [],
        "account_numbers": []
    },

    "claims": [
        {
            "claim": string,
            "claim_type": string,
            "subject": string
        },
        {
            "claim": string,
            "claim_type": string,
            "subject": string
        }
    ],

    "risk_indicators": [
        {
            "indicator": string,
            "evidence": string,
            "severity": string
        },
        {
            "indicator": string
            "evidence": string
            "severity": string
        },
        {
            "indicator": string
            "evidence": string
            "severity": string
        }
    ]
}