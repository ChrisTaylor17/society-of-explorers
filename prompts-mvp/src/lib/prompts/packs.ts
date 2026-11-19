import type { PromptRecord } from "./types";

export interface PromptPack {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  outcome: string;
  revenueLever: string;
  artifact: string;
  upgradeMoment: string;
  proValue: string;
  loop: Array<{
    label: string;
    detail: string;
  }>;
  slugs: string[];
}

export interface ResolvedPromptPack extends PromptPack {
  prompts: PromptRecord[];
}

export const PROMPT_PACKS: PromptPack[] = [
  {
    id: "revenue-launch",
    title: "Revenue Launch",
    subtitle: "Go from useful idea to first paid test.",
    description:
      "A direct path through offer, pricing, customers, and trust so a founder can ask for money without hype.",
    outcome: "A paid validation plan with a clear offer, fair price, first conversations, and a trust-building page.",
    revenueLever: "Turn one useful idea into the smallest honest offer someone can buy this week.",
    artifact: "Paid validation brief",
    upgradeMoment: "Upgrade when you are ready to run all four prompts against one live offer.",
    proValue: "Best for one focused evening of Pro runs across a real offer.",
    loop: [
      {
        label: "Shape",
        detail: "Name the useful paid promise without inflating it.",
      },
      {
        label: "Price",
        detail: "Choose a fair number and the evidence that supports it.",
      },
      {
        label: "Ask",
        detail: "Find the first ten people with a reason to care.",
      },
      {
        label: "Trust",
        detail: "Write a page that earns attention before payment.",
      },
    ],
    slugs: [
      "find-the-smallest-honest-offer",
      "price-this-offer-without-apology",
      "find-my-first-ten-customers",
      "write-a-landing-page-that-earns-trust",
    ],
  },
  {
    id: "community-market",
    title: "Community Market",
    subtitle: "Turn shared energy into a respectful paid ritual.",
    description:
      "A pack for communities that need revenue without selling out the people who make the community alive.",
    outcome: "A paid ritual, clear free/paid boundary, retention repair, and tier structure grounded in member value.",
    revenueLever: "Convert shared energy into a paid ritual with a clean boundary between gift and price.",
    artifact: "Member-value offer map",
    upgradeMoment: "Upgrade when the community has a real audience and needs a repeatable paid path.",
    proValue: "Best for guides building paid community offerings without surveillance or pressure.",
    loop: [
      {
        label: "Ritual",
        detail: "Design a paid cadence members can feel, not just a feature list.",
      },
      {
        label: "Boundary",
        detail: "Protect what stays free and name what deserves payment.",
      },
      {
        label: "Repair",
        detail: "Recover trust with members who may churn or go quiet.",
      },
      {
        label: "Tier",
        detail: "Make the paid step obvious without forcing anyone.",
      },
    ],
    slugs: [
      "turn-community-energy-into-a-paid-ritual",
      "decide-what-to-make-free",
      "recover-a-churn-risk-member",
      "choose-the-right-paid-tier",
    ],
  },
  {
    id: "sovereignty-audit",
    title: "Sovereignty Audit",
    subtitle: "Make a product more trustworthy before growth.",
    description:
      "A product and message review for people building with member agency, privacy, and consent as defaults.",
    outcome: "A clearer trust bargain, more generous offer, respectful message, and concrete product-risk map.",
    revenueLever: "Increase conversion by making the trust bargain clearer before you scale attention.",
    artifact: "Sovereignty risk brief",
    upgradeMoment: "Upgrade before launch, ads, or onboarding when trust mistakes would be expensive.",
    proValue: "Best before launching ads, onboarding members, or asking a community to bring private context.",
    loop: [
      {
        label: "Bargain",
        detail: "Explain what members give, get, keep, and can revoke.",
      },
      {
        label: "Generosity",
        detail: "Make the offer feel more useful without extracting more data.",
      },
      {
        label: "Respect",
        detail: "Write direct copy that can say no without burning trust.",
      },
      {
        label: "Audit",
        detail: "Find risks before growth turns them into reputation cost.",
      },
    ],
    slugs: [
      "design-a-privacy-first-data-bargain",
      "make-this-more-generous",
      "write-a-respectful-no",
      "audit-for-sovereignty",
    ],
  },
];

export function resolvePromptPacks(prompts: PromptRecord[]): ResolvedPromptPack[] {
  const promptsBySlug = new Map(prompts.map((prompt) => [prompt.slug, prompt]));
  return PROMPT_PACKS.map((pack) => ({
    ...pack,
    prompts: pack.slugs.flatMap((slug) => {
      const prompt = promptsBySlug.get(slug);
      return prompt ? [prompt] : [];
    }),
  })).filter((pack) => pack.prompts.length > 0);
}
