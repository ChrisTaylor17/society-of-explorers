// Single source of truth for the Society of Explorers manifesto.
// Imported by app/manifesto/page.tsx (rendering) and the practice AI route (context).

export const MANIFESTO_SECTIONS = [
  {
    numeral: "I",
    title: "The Lineage",
    paragraphs: [
      "This work did not begin at Society of Explorers. It began in a lab at MIT, years before most people had heard the word \"blockchain.\"",
      "In the early 2010s, Sandy Pentland's group at the Media Lab was asking a question almost no one else was asking in a serious room: what if the data about your life belonged to you? Not to Facebook. Not to Google. Not to the government. Not to any institution, no matter how benevolent. To you.",
      "Out of that question came openPDS — personal data stores, a proof that private infrastructure for individuals was technically possible. Out of openPDS came Open Mustard Seed. Out of Open Mustard Seed came the ID3 Institute, and a small collection of researchers — Patrick Deegan, Primavera De Filippi, Carolyn Reckhow, and others — who believed the architecture of the internet could be rebuilt on a different foundation. Sovereignty as the default. Surveillance as the exception. Consent as the unit of exchange.",
      "I was in those rooms. I was on those emails. I watched the future being sketched on whiteboards before it had a name, before it had a token, before the word \"web3\" existed to compress and cheapen it.",
      "Fifteen years later, almost nothing about that vision has shipped to the person on the street. The cryptography is solved. The storage is solved. What has been missing is the reason to care.",
    ],
  },
  {
    numeral: "II",
    title: "The Two Foundations",
    paragraphs: [
      "Then came Bitcoin.",
      "Bitcoin was not the product. Bitcoin was the proof — proof that trust could be manufactured without a trusted party, that value could move without a middleman, that a network of strangers could agree on truth without asking permission. It was, and remains, the foundational technology. The substrate. The base layer of a different kind of internet.",
      "Ethereum was the first artistic use of that substrate. I met Vitalik in person twice in the early years. I wrote him. I showed up at the events. I watched a young man explain, patiently and precisely, how a global computer could execute agreements without a judge. Ethereum was the working proof-of-concept — a demonstration that the substrate could host not just money, but institutions. Not just ledgers, but culture. Not just transactions, but commitments.",
      "Neither Bitcoin nor Ethereum is the finished cathedral. They are the foundation stones. Everything that matters still has to be built on top.",
    ],
  },
  {
    numeral: "III",
    title: "The Engine",
    paragraphs: [
      "Society of Explorers — and its parent frame, Consilience — is the engine built on top of those stones.",
      "The thesis is simple, and old, and radical:",
      "A human being deserves a private, sovereign layer for their own mind, their own data, their own becoming — and a public, voluntary layer for sharing, collaborating, and exchanging value with others.",
      "That is the whole architecture. Everything else is implementation.",
      "The private layer is not a feature. It is a right. The public layer is not a platform. It is a commons. And the seam between them — the consent, the compensation, the choice — is where freedom lives.",
    ],
  },
  {
    numeral: "IV",
    title: "The Fifty-Fifty System",
    paragraphs: [
      "We are building one thing, with two halves.",
      "The AI half is the wisdom layer. Not a chatbot. Not a productivity tool. A shepherd. A council of thinkers — Socrates, Plato, Nietzsche, Aurelius, Einstein, Jobs — who know you, remember you, and help you think clearly about your life. Private by default. Yours by design. The first AI that works for you instead of about you.",
      "The blockchain half is the sovereignty layer. A personal data store you actually own. A utility token — $EXP — that rewards contribution rather than extraction. Micropayments for the moments that matter. Voluntary sharing, never coerced harvesting. Reputation that is yours to carry, not a platform's to weaponize or delete.",
      "Together, they form a single system: a person, accompanied by wisdom, standing on a foundation they control.",
      "This is not a product. This is an alternative architecture for being a person online.",
    ],
  },
  {
    numeral: "V",
    title: "The Transition",
    paragraphs: [
      "We are living through a transition larger than the printing press, larger than electricity, possibly larger than agriculture itself. Four currents are converging at once, and they are reinforcing each other.",
      "Consciousness. People are waking up to the fact that their attention has been farmed, their beliefs shaped by algorithms optimized for outrage, their inner lives rented out to strangers. The hunger for sovereignty is spiritual before it is technical. The person who logs off is not retreating. They are refusing.",
      "The creator economy. For the first time in history, an individual can reach the world without permission. The gatekeepers are dying in public. The question is no longer whether the old institutions fall. The question is what we build in their place, and whether we build it on foundations that serve people or foundations that merely replace one extractor with another.",
      "Decentralized governance. DAOs, soulbound identity, on-chain reputation, new forms of coordination that do not require nation-states or corporations as intermediaries. The tools are here. The experiments are live. The law will catch up because it has to.",
      "Real-world action. Pixels are not enough. The next decade will be defined by the groups that can move from online coordination to physical-world outcomes — mesh networks, land trusts, schools, salons, cities, repair. Things you can touch. Things that stay when the cloud goes dark.",
      "Society of Explorers sits at the intersection of all four. We are not choosing one. We are building the connective tissue that makes all of them coherent in a single human life.",
    ],
  },
  {
    numeral: "VI",
    title: "What We Are Actually Doing",
    paragraphs: [
      "Every day, we ask one question. You answer in 280 characters. You see how others answered. Your answer is yours — private by default, portable forever, stored in an architecture you eventually control.",
      "That simple ritual is the doorway to a larger system: daily practice, matched conversations with other explorers, a physical salon at 92B South Street in Boston, soulbound reputation earned through thought and contribution, member-owned storefronts, a mesh of Explorer Nodes that keeps the wisdom running even when the cloud goes dark.",
      "One question a day is the front door. Behind it is everything we have been building, and watching others build, and waiting fifteen years to finally connect: the vault, the council, the commons, the salon, the node, the chain, the token, the practice.",
      "We are not asking you to believe any of this. We are asking you to answer today's question. The rest will follow if it is real.",
    ],
  },
  {
    numeral: "VII",
    title: "The Invitation",
    paragraphs: [
      "You do not have to believe any of this to answer today's question.",
      "But if you have read this far, you probably already do.",
      "Welcome to the Society of Explorers.",
    ],
  },
] as const;

// Flattened plaintext for AI system prompts.
export const MANIFESTO_PLAINTEXT = MANIFESTO_SECTIONS
  .map(s => `${s.numeral}. ${s.title.toUpperCase()}\n\n${s.paragraphs.join("\n\n")}`)
  .join("\n\n");

// Compact version for token-conscious contexts.
export const MANIFESTO_SUMMARY = `Society of Explorers is building a 50/50 system: an AI wisdom layer (a private council of historical thinkers that knows you and helps you think) paired with a blockchain sovereignty layer (personal data stores you own, a $EXP utility token that rewards contribution instead of extraction, soulbound reputation that is yours to carry). The lineage traces from Sandy Pentland's openPDS research at MIT Media Lab through Open Mustard Seed and the ID3 Institute — Patrick Deegan, Primavera De Filippi, Carolyn Reckhow — through early direct contact with Ethereum's founders. Bitcoin is the foundational substrate; Ethereum is the working proof-of-concept; Society of Explorers is the engine on top. The mission: give every person a private, sovereign layer for their mind and data, plus a public, voluntary layer for sharing and exchange. The daily question on /practice is the front door to this larger vision — consciousness, creator economy, decentralized governance, and real-world action converging at once.`;

export const FOUNDER_SIGNATURE = "— Chris Taylor, Founder";
