// Terms of Service version + content. Bump CURRENT_TERMS_VERSION to re-prompt all dealers.
export const CURRENT_TERMS_VERSION = "2026-01";

export interface TermsSection {
  heading: string;
  body: string[];
}

export const TERMS: TermsSection[] = [
  {
    heading: "1. Agreement",
    body: [
      "This Agreement governs your use of the Autonexus online services (the \"Services\"), including content, updates and new releases. By selecting \"I Agree\", or by accessing or using the Services, you agree to these terms on behalf of your dealership.",
    ],
  },
  {
    heading: "2. Your rights to use the Services",
    body: [
      "You are granted a personal, limited, non-exclusive, non-transferable right to use the Services for your dealership while you meet any applicable payment obligations and comply with this Agreement.",
      "You agree not to resell, reproduce, or provide access to the Services to any unauthorised third party.",
    ],
  },
  {
    heading: "3. Subscription & payment",
    body: [
      "The Services are provided on a subscription basis per module (Sales CRM, Marketing Studio, and — when available — Dealer Website). Fees are billed in Euro (€) plus applicable taxes. Modules may be enabled or disabled per your plan.",
    ],
  },
  {
    heading: "4. Your data",
    body: [
      "You own your customer and business data. You are responsible for its legality, accuracy and quality, and for obtaining any required consents. We process your data to provide the Services in line with our Privacy Statement, and apply row-level security so each dealership only accesses its own data.",
    ],
  },
  {
    heading: "5. AI-assisted features",
    body: [
      "AI features assist you by drafting content and suggestions. All AI output is a draft for your review — you must confirm and edit before publishing. We do not guarantee accuracy and you remain responsible for what you publish, including any factual, legal or compliance claims.",
    ],
  },
  {
    heading: "6. Disclaimer & liability",
    body: [
      "The Services are provided \"as is\" without warranties of any kind to the maximum extent permitted by law. We are not your accountant or legal adviser; consult a competent professional where needed. Our total liability for claims relating to this Agreement is limited to the amount you paid for the Services in the prior twelve (12) months.",
    ],
  },
  {
    heading: "7. Changes, termination & governing law",
    body: [
      "We may update these terms; continued use after changes indicates acceptance. Either party may terminate per the subscription terms; outstanding fees remain due. This Agreement is governed by the laws of Ireland.",
    ],
  },
];
