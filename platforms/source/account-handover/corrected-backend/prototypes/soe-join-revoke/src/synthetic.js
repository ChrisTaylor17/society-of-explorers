/**
 * Synthetic people only. Names and relay handles match the mobile fixture and
 * Meridian DEMO_ACCOUNTS. Passcodes are local to this prototype and are not
 * the Meridian walkthrough passcodes.
 */
export const PEOPLE = [
  {
    id: "ada",
    magicName: "ada",
    displayName: "Ada Linden",
    passcode: "synthetic-ada",
    interests: ["Walks", "Noticing", "Quiet cafes"],
    availability: ["Saturday morning", "Sunday afternoon"],
    relay: "relay:ada.linden",
  },
  {
    id: "jules",
    magicName: "jules",
    displayName: "Jules Okonkwo",
    passcode: "synthetic-jules",
    interests: ["Drawing", "Snacks and stories", "Conversation"],
    availability: ["Saturday morning", "Wednesday evening"],
    relay: "relay:jules.okonkwo",
  },
  {
    id: "mina",
    magicName: "mina",
    displayName: "Mina Cho",
    passcode: "synthetic-mina",
    interests: ["Hikes", "Coworking", "Maps"],
    availability: ["Thursday morning", "Sunday afternoon"],
    relay: "relay:mina.cho",
  },
];

export const PLAN = {
  id: "plan-riverside",
  hostId: "ada",
  title: "Saturday riverside walk",
  kindLabel: "A walk",
  whenLabel: "Saturday morning",
  placeLabel: "Riverside path",
};
