export const INTERESTS = [
  "Walks",
  "Noticing",
  "Quiet cafes",
  "Drawing",
  "Snacks and stories",
  "Conversation",
  "Hikes",
  "Coworking",
  "Maps",
  "Dinner",
  "Cooking",
  "Notebooks",
] as const;

export const WINDOWS = [
  "Saturday morning",
  "Sunday afternoon",
  "Wednesday evening",
  "Thursday morning",
  "Friday evening",
] as const;

export const KINDS = [
  { id: "walk", label: "A walk" },
  { id: "hike", label: "A hike" },
  { id: "coworking", label: "Coworking" },
  { id: "dinner", label: "Dinner" },
  { id: "make", label: "Make something" },
] as const;

export type PlanKind = (typeof KINDS)[number]["id"];

export const AGENT_SCOPES = ["interests", "availability", "draft_plans"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const DEMO_ACCOUNTS = [
  {
    magicName: "ada",
    passcode: "grove",
    displayName: "Ada Linden",
    agentName: "Grove",
    interests: ["Walks", "Noticing", "Quiet cafes"],
    availability: ["Saturday morning", "Sunday afternoon"],
    area: "Riverside",
    contactHandle: "relay:ada.linden",
    bio: "Likes a short walk with room to notice things.",
    line: "Walks, noticing, quiet cafes",
  },
  {
    magicName: "jules",
    passcode: "sketch",
    displayName: "Jules Okonkwo",
    agentName: "Sketch",
    interests: ["Drawing", "Snacks and stories", "Conversation"],
    availability: ["Saturday morning", "Wednesday evening"],
    area: "North rooms",
    contactHandle: "relay:jules.okonkwo",
    bio: "Will trade three silly drawings for one good story.",
    line: "Drawing, snacks, conversation",
  },
  {
    magicName: "mina",
    passcode: "trail",
    displayName: "Mina Cho",
    agentName: "Trail",
    interests: ["Hikes", "Coworking", "Maps"],
    availability: ["Sunday afternoon", "Thursday morning"],
    area: "Hill path",
    contactHandle: "relay:mina.cho",
    bio: "Prefers a marked trail and an hour with the laptop shut halfway.",
    line: "Hikes, coworking, maps",
  },
  {
    magicName: "samir",
    passcode: "table",
    displayName: "Samir Vale",
    agentName: "Table",
    interests: ["Dinner", "Conversation", "Cooking"],
    availability: ["Friday evening", "Saturday morning"],
    area: "Market street",
    contactHandle: "relay:samir.vale",
    bio: "Cooks one pot and asks for one story in return.",
    line: "Dinner, conversation, cooking",
  },
  {
    magicName: "rowan",
    passcode: "desk",
    displayName: "Rowan Ellis",
    agentName: "Desk",
    interests: ["Coworking", "Notebooks", "Walks"],
    availability: ["Thursday morning", "Saturday morning"],
    area: "Reading room",
    contactHandle: "relay:rowan.ellis",
    bio: "Keeps a notebook and a free morning.",
    line: "Coworking, notebooks, walks",
  },
] as const;

export function publicSignInRoster() {
  return DEMO_ACCOUNTS.map((account) => ({
    magicName: account.magicName,
    displayName: account.displayName,
    line: account.line,
  }));
}

export function kindLabel(id: string): string {
  return KINDS.find((k) => k.id === id)?.label ?? id;
}

export function scopeLabel(scope: string): string {
  switch (scope) {
    case "interests":
      return "Read interests";
    case "availability":
      return "Read free windows";
    case "draft_plans":
      return "Draft a plan";
    case "contact":
      return "See relay handle";
    default:
      return scope;
  }
}
