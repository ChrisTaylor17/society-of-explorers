import type { PromptRecord } from "./types";

export const FALLBACK_PROMPTS: PromptRecord[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "turn-uncertainty-into-a-decision",
    title: "Turn uncertainty into a decision",
    description: "Map the choice, the tradeoffs, and the smallest honest next move.",
    category: "think",
    prompt_text:
      "Help me examine this decision without rushing to certainty. Name the real choice, the tradeoffs I may be avoiding, what each path protects, and the smallest honest next move I can make today.",
    tags: ["decisions", "clarity"],
    usage_count: 1842,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    slug: "test-an-idea-simply",
    title: "What is the simplest way to test this idea?",
    description: "Turn a large possibility into one small, useful experiment.",
    category: "create",
    prompt_text:
      "Act as a rigorous but encouraging product strategist. Help me identify the riskiest assumption in this idea and design the smallest real-world test I can run this week. Keep the test inexpensive, observable, and honest.",
    tags: ["experiments", "founders"],
    usage_count: 1534,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "design-a-morning-ritual",
    title: "Design a meaningful ritual for the start of my day",
    description: "Build a short practice around attention, energy, and what matters.",
    category: "reflect",
    prompt_text:
      "Design a morning ritual that fits my real life. Ask what I want to protect, how much time I actually have, and what usually derails me. Then propose a simple sequence with a two-minute fallback version.",
    tags: ["ritual", "attention"],
    usage_count: 946,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "distill-research-into-principles",
    title: "Distill this research into principles I can use",
    description: "Move from information overload to durable, testable understanding.",
    category: "work",
    prompt_text:
      "Read the material I provide and extract the smallest set of durable principles that explain most of it. For each principle, include what it means, when it is useful, where it can fail, and one concrete application.",
    tags: ["research", "learning"],
    usage_count: 1381,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    slug: "what-am-i-avoiding",
    title: "What am I avoiding by staying busy?",
    description: "Use your calendar and commitments as evidence, not as a verdict.",
    category: "reflect",
    prompt_text:
      "Help me examine whether busyness is protecting me from a harder task, feeling, or decision. Ask one question at a time. Be candid without being theatrical, and finish with one gentle action that creates space.",
    tags: ["reflection", "focus"],
    usage_count: 1109,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    slug: "write-the-brief-you-wish-you-had",
    title: "Write the brief I wish I had",
    description: "Create alignment before the work becomes expensive.",
    category: "work",
    prompt_text:
      "Turn my rough project notes into a clear working brief. Include the outcome, audience, non-goals, constraints, open questions, decisions already made, measures of success, and the next three actions.",
    tags: ["planning", "teams"],
    usage_count: 1672,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    slug: "money-not-the-goal",
    title: "What would this look like if money were not the goal?",
    description: "Separate the thing you value from the business model around it.",
    category: "think",
    prompt_text:
      "Help me imagine this project if money were not the primary goal, without pretending money is irrelevant. Identify the human value, the minimum sustainable economics, and what I would choose differently.",
    tags: ["values", "business"],
    usage_count: 703,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    slug: "who-can-i-help-that-cannot-repay-me",
    title: "Who can I help that cannot repay me?",
    description: "Find a concrete act of generosity that respects the other person.",
    category: "reflect",
    prompt_text:
      "Help me identify someone or a community I can support without expecting access, status, or repayment. Keep the action specific, dignified, and within my actual capacity.",
    tags: ["community", "generosity"],
    usage_count: 521,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    slug: "six-month-focus",
    title: "If I had six months, what would I focus on?",
    description: "Choose a season of work with a clear finish line.",
    category: "think",
    prompt_text:
      "Help me choose one six-month focus. Compare my options by meaning, leverage, reversibility, energy, and who benefits. Then propose a finish line, what to pause, and a first-week plan.",
    tags: ["focus", "strategy"],
    usage_count: 1294,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000010",
    slug: "make-this-more-generous",
    title: "What would make this more generous?",
    description: "Improve an offer by increasing real value, clarity, or agency.",
    category: "create",
    prompt_text:
      "Review the offer, product, or message I provide. Suggest ways to make it more generous without manipulation: clearer expectations, greater user agency, useful free value, fairer risk sharing, and more respectful defaults.",
    tags: ["product", "trust"],
    usage_count: 812,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000011",
    slug: "assumptions-holding-me-back",
    title: "Which assumptions are holding me back?",
    description: "Name the invisible rules shaping your choices, then test them.",
    category: "think",
    prompt_text:
      "Help me uncover assumptions I am treating as facts. Sort them into evidence-backed constraints, inherited beliefs, fears, and unknowns. Design one respectful test for the assumption with the highest cost.",
    tags: ["beliefs", "experiments"],
    usage_count: 1045,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000012",
    slug: "explain-it-to-a-smart-outsider",
    title: "Explain this to a smart outsider",
    description: "Find the plain-language shape of a complex idea.",
    category: "work",
    prompt_text:
      "Explain the material I provide to an intelligent person outside the field. Preserve the important nuance, define unavoidable terms, use one strong analogy, and name what the explanation leaves out.",
    tags: ["writing", "clarity"],
    usage_count: 1220,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000013",
    slug: "pre-mortem-without-pessimism",
    title: "Run a pre-mortem without killing the idea",
    description: "Surface preventable failure while protecting creative momentum.",
    category: "work",
    prompt_text:
      "Imagine this project failed one year from now. Identify the five most plausible causes, early warning signs, and low-cost mitigations. Distinguish fatal risks from discomfort and ordinary uncertainty.",
    tags: ["risk", "planning"],
    usage_count: 771,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000014",
    slug: "find-the-human-story",
    title: "Find the human story inside these facts",
    description: "Turn raw information into a truthful narrative people can feel.",
    category: "create",
    prompt_text:
      "Find the strongest truthful human story in the facts I provide. Identify the person, tension, change, and stakes. Do not invent details or manufacture sentiment. Draft a clear narrative spine.",
    tags: ["storytelling", "writing"],
    usage_count: 898,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000015",
    slug: "build-a-personal-advisory-council",
    title: "Build a personal advisory council",
    description: "Examine one question through distinct, useful schools of thought.",
    category: "think",
    prompt_text:
      "Create a small advisory council for my question using distinct perspectives such as Socratic inquiry, systems thinking, practical operations, ethics, and long-term stewardship. Let each perspective challenge the others before synthesizing.",
    tags: ["great-thinkers", "decisions"],
    usage_count: 1406,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000016",
    slug: "make-the-meeting-worth-having",
    title: "Make this meeting worth having",
    description: "Replace status theater with a decision, creation, or real exchange.",
    category: "work",
    prompt_text:
      "Redesign this meeting so it earns everyone's time. State the purpose, what must happen live, what should be async, the decision owner, required preparation, agenda, and the condition for canceling it.",
    tags: ["meetings", "teams"],
    usage_count: 833,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000017",
    slug: "notice-what-gives-energy",
    title: "Notice what gives me energy",
    description: "Use recent experience to find work that feels alive and useful.",
    category: "reflect",
    prompt_text:
      "Guide me through a brief energy audit of the last two weeks. Look for specific activities, people, environments, and kinds of difficulty that increased or drained energy. Turn the pattern into one change to my week.",
    tags: ["energy", "work"],
    usage_count: 684,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000018",
    slug: "create-a-one-page-business",
    title: "Create a one-page business",
    description: "Connect a real customer problem to a simple path to sustainable revenue.",
    category: "create",
    prompt_text:
      "Turn this idea into a one-page business: specific customer, painful problem, current alternative, smallest valuable offer, acquisition path, price hypothesis, delivery cost, trust needed, and the next paid validation step.",
    tags: ["business", "revenue"],
    usage_count: 1605,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000019",
    slug: "steelman-the-other-side",
    title: "Steelman the other side",
    description: "Understand a disagreement before trying to win it.",
    category: "think",
    prompt_text:
      "Present the strongest good-faith version of the opposing view. Name the values and evidence behind it, where my position is weakest, what both sides may be missing, and what evidence could change either conclusion.",
    tags: ["dialogue", "reasoning"],
    usage_count: 1058,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000020",
    slug: "protect-a-deep-work-window",
    title: "Protect a deep-work window",
    description: "Design a focus block around real constraints, not ideal discipline.",
    category: "work",
    prompt_text:
      "Help me design a repeatable deep-work window around my actual schedule and interruptions. Define the task, start ritual, environment, communication boundary, stop rule, and recovery plan after a missed day.",
    tags: ["focus", "practice"],
    usage_count: 936,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000021",
    slug: "write-a-respectful-no",
    title: "Write a respectful no",
    description: "Set a clean boundary without overexplaining or closing the relationship.",
    category: "create",
    prompt_text:
      "Draft a warm, direct refusal for the situation I describe. Keep it brief, avoid false excuses, acknowledge what matters, state the boundary clearly, and offer an alternative only if I genuinely have one.",
    tags: ["communication", "boundaries"],
    usage_count: 747,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000022",
    slug: "find-the-smallest-honest-offer",
    title: "Find the smallest honest offer",
    description: "Charge for a useful outcome before building the whole vision.",
    category: "create",
    prompt_text:
      "Help me define the smallest offer I can sell and deliver honestly now. Identify the buyer, promised outcome, scope boundary, evidence I can provide, delivery method, fair price, and a direct invitation.",
    tags: ["revenue", "validation"],
    usage_count: 1466,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000023",
    slug: "plan-a-community-ritual",
    title: "Plan a community ritual people will return to",
    description: "Create belonging through participation, rhythm, and shared meaning.",
    category: "create",
    prompt_text:
      "Design a recurring community ritual with a clear human purpose. Include arrival, contribution, shared action, reflection, closure, accessibility, privacy expectations, and how members can shape it over time.",
    tags: ["community", "ritual"],
    usage_count: 920,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000024",
    slug: "audit-for-sovereignty",
    title: "Audit this product for human sovereignty",
    description: "Find where a product reduces agency, obscures consent, or captures value unfairly.",
    category: "work",
    prompt_text:
      "Audit this product for human sovereignty. Examine data ownership, consent, portability, defaults, dependence, pricing, algorithmic power, community governance, and who receives the value created. Prioritize practical changes.",
    tags: ["privacy", "ethics"],
    usage_count: 612,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000025",
    slug: "end-the-day-without-carrying-it",
    title: "End the day without carrying it",
    description: "Close open loops and leave tomorrow a kind starting point.",
    category: "reflect",
    prompt_text:
      "Lead a five-minute end-of-day reflection. Help me name what moved, what remains open, what can be released, who needs a reply, and the first kind action for tomorrow. Keep it simple and grounding.",
    tags: ["ritual", "reflection"],
    usage_count: 802,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000026",
    slug: "price-this-offer-without-apology",
    title: "Price this offer without apology",
    description: "Name the value, cost, risk, and fair exchange behind a paid offer.",
    category: "create",
    prompt_text:
      "Help me price this offer without shrinking from the value or inflating the promise. Identify the customer, costly problem, measurable outcome, delivery effort, support burden, alternatives, risk reversal, and three price tests I can run ethically.",
    tags: ["pricing", "revenue"],
    usage_count: 1348,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000027",
    slug: "find-my-first-ten-customers",
    title: "Find my first ten customers",
    description: "Turn a vague audience into ten real conversations and one paid test.",
    category: "create",
    prompt_text:
      "Help me find the first ten likely customers for this offer. Define the specific buyer, where they already gather, what pain signal to look for, a respectful outreach message, and how to convert conversations into one paid validation step.",
    tags: ["customers", "validation"],
    usage_count: 1267,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000028",
    slug: "write-a-landing-page-that-earns-trust",
    title: "Write a landing page that earns trust",
    description: "Explain the offer clearly enough that the right person can say yes.",
    category: "create",
    prompt_text:
      "Turn my offer notes into a landing page that earns trust. Include the audience, problem, promised outcome, proof, process, pricing expectation, objections, privacy promise, and one direct call to action without hype.",
    tags: ["landing-page", "trust"],
    usage_count: 1184,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000029",
    slug: "turn-community-energy-into-a-paid-ritual",
    title: "Turn community energy into a paid ritual",
    description: "Create a recurring paid experience that gives members real value.",
    category: "create",
    prompt_text:
      "Help me design a paid community ritual around real member value. Define who it is for, the transformation, cadence, host role, member contribution, privacy expectations, price, free preview, and renewal reason.",
    tags: ["community", "revenue"],
    usage_count: 965,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000030",
    slug: "decide-what-to-make-free",
    title: "Decide what to make free",
    description: "Balance generosity, sustainability, and member agency.",
    category: "think",
    prompt_text:
      "Help me decide what should be free, paid, or member-only. Separate trust-building public value from labor-intensive support, ongoing access, scarce attention, and outcomes that should fund the commons.",
    tags: ["pricing", "generosity"],
    usage_count: 884,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000031",
    slug: "design-a-privacy-first-data-bargain",
    title: "Design a privacy-first data bargain",
    description: "Make the value exchange around data clear, optional, and useful.",
    category: "work",
    prompt_text:
      "Design a privacy-first data bargain for this product. State what data is needed, what value the member receives, what stays local or encrypted, what is never collected, how consent can change, and how the community benefits.",
    tags: ["privacy", "trust"],
    usage_count: 744,
    is_featured: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000032",
    slug: "recover-a-churn-risk-member",
    title: "Recover a churn-risk member",
    description: "Respond to disengagement with respect instead of pressure.",
    category: "work",
    prompt_text:
      "Help me design a respectful recovery path for a member who may churn. Identify likely causes, value gaps, support actions, a no-pressure message, a useful save offer, and when to let them leave gracefully.",
    tags: ["retention", "support"],
    usage_count: 631,
    is_featured: false,
  },
  {
    id: "10000000-0000-4000-8000-000000000033",
    slug: "choose-the-right-paid-tier",
    title: "Choose the right paid tier",
    description: "Package access around outcomes, cost, and fairness.",
    category: "think",
    prompt_text:
      "Help me choose a paid tier for this product. Compare usage limits, support burden, member outcomes, provider cost, perceived fairness, community contribution, upgrade triggers, and a simple launch experiment.",
    tags: ["pricing", "product"],
    usage_count: 702,
    is_featured: false,
  },
];

export function shuffledPrompts(prompts: PromptRecord[], seed = Date.now()): PromptRecord[] {
  const copy = [...prompts];
  let state = seed >>> 0;

  for (let index = copy.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}
