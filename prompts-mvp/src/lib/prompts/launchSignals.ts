import type { PromptRecord } from "./types";

export interface LaunchSignal {
  phase: string;
  artifact: string;
  proof: string;
  operatorMove: string;
}

const LAUNCH_SIGNALS: Record<string, LaunchSignal> = {
  "find-the-smallest-honest-offer": {
    phase: "Offer proof",
    artifact: "Smallest paid promise",
    proof: "One specific buyer can name the outcome and the boundary.",
    operatorMove: "Run price and customer prompts next before building more product.",
  },
  "price-this-offer-without-apology": {
    phase: "Price proof",
    artifact: "Fair exchange test",
    proof: "A buyer understands the cost, risk reversal, and reason to pay now.",
    operatorMove: "Use Pro when one live offer needs several price and objection passes.",
  },
  "find-my-first-ten-customers": {
    phase: "Demand proof",
    artifact: "Ten-conversation list",
    proof: "Ten real people have a visible pain signal and a respectful invitation.",
    operatorMove: "Move from audience guesses to direct outreach before paid traffic.",
  },
  "write-a-landing-page-that-earns-trust": {
    phase: "Trust proof",
    artifact: "One-page yes/no offer",
    proof: "The right visitor can understand the promise, price, proof, and privacy bargain.",
    operatorMove: "Use this before ads, launch posts, or asking a community to buy.",
  },
};

const CATEGORY_SIGNALS: Record<PromptRecord["category"], LaunchSignal> = {
  create: {
    phase: "Creation proof",
    artifact: "Public next move",
    proof: "The idea leaves your head as an offer, draft, ritual, or message someone can react to.",
    operatorMove: "Open packs when you want a full journey instead of one isolated prompt.",
  },
  think: {
    phase: "Decision proof",
    artifact: "Sharper choice",
    proof: "The tradeoff becomes clear enough to choose a small reversible step.",
    operatorMove: "Save the useful prompt and return when the decision has real stakes.",
  },
  work: {
    phase: "Execution proof",
    artifact: "Working brief",
    proof: "The next action, owner, boundary, and measure of success are visible.",
    operatorMove: "Use Pro for a focused work session across planning, copy, and review.",
  },
  reflect: {
    phase: "Attention proof",
    artifact: "Useful ritual",
    proof: "The reflection changes one concrete behavior without demanding private disclosure.",
    operatorMove: "Keep the practice private; only aggregate usage supports the public atlas.",
  },
};

export function launchSignalForPrompt(prompt: PromptRecord): LaunchSignal {
  return LAUNCH_SIGNALS[prompt.slug] ?? CATEGORY_SIGNALS[prompt.category];
}
