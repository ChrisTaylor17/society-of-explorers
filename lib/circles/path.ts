// The SoE Circles starter path: 12 weekly readings, all public domain in the US.
// Each source link points at a free public-domain edition (Project Gutenberg or the
// Yale Avalon Project). Guides are written by Society of Explorers; questions are
// open and have no right answers.

export const CIRCLE_PATH_ID = 'starter-12';
/** book_cohorts.book_id used for circles, so /book-salons can leave them out. */
export const CIRCLE_BOOK_ID = 'soe-circles-path';

export interface CircleReading {
  week: number;
  slug: string;
  title: string;
  author: string;
  selection: string;
  minutes: number;
  sources: Array<{ label: string; url: string }>;
  context: string;
  questions: string[];
  counterpoint: string;
  practice: string;
}

const gutenberg = (id: number) => `https://www.gutenberg.org/ebooks/${id}`;
const avalon = (path: string) => `https://avalon.law.yale.edu/${path}`;

export const CIRCLE_PATH: CircleReading[] = [
  {
    week: 1,
    slug: 'genesis-and-the-law',
    title: 'Genesis 1–4 and Exodus 20',
    author: 'Hebrew Bible (King James Version, 1611)',
    selection: 'Genesis chapters 1–4; Exodus chapter 20',
    minutes: 30,
    sources: [{ label: 'King James Bible, Project Gutenberg', url: gutenberg(10) }],
    context:
      'Two of the most read pages in Western history. Genesis opens with a world that is called good and a human being made in the image of God; within four chapters there is disobedience, exile and the first murder. Exodus 20 gives the Ten Commandments.',
    questions: [
      'What does it mean, in your own words, for a person to be made "in the image" of something greater?',
      'Cain asks, "Am I my brother\u2019s keeper?" How would you answer him?',
      'Which of the Ten Commandments still shape ordinary life where you live, and which have faded?',
      'Is a rule better kept because it is commanded, or because it is understood?',
    ],
    counterpoint:
      'Some readers see these chapters as the root of human dignity and equal worth. Others read them as myth, or worry that commanded morality leaves too little room for conscience. Both readings deserve a fair hearing at the table.',
    practice: 'Before next week, notice one moment where you were, or were not, your brother\u2019s or sister\u2019s keeper.',
  },
  {
    week: 2,
    slug: 'apology',
    title: 'Apology',
    author: 'Plato (trans. Benjamin Jowett)',
    selection: 'The whole dialogue (about 30 pages)',
    minutes: 60,
    sources: [{ label: 'Apology, Project Gutenberg', url: gutenberg(1656) }],
    context:
      'Socrates defends himself before an Athenian jury in 399 BC against charges of impiety and corrupting the young. He is convicted and sentenced to death. Here he says the unexamined life is not worth living.',
    questions: [
      'Socrates claims his only wisdom is knowing that he does not know. Is that wisdom, or a clever pose?',
      'Was the jury wrong, or did Athens have a real interest in silencing him?',
      'What would an "examined life" look like on an ordinary Tuesday?',
      'Would you have accepted exile instead of death? Why did he refuse?',
    ],
    counterpoint:
      'Socrates can sound arrogant, and his questioning embarrassed powerful people in public. Ask whether there is a way to examine a city without humiliating it.',
    practice: 'Ask one honest question this week that you do not already know the answer to, and listen to the whole answer.',
  },
  {
    week: 3,
    slug: 'nicomachean-ethics',
    title: 'Nicomachean Ethics, Books I–II',
    author: 'Aristotle',
    selection: 'Book I (happiness) and Book II (virtue as habit and the mean)',
    minutes: 75,
    sources: [{ label: 'The Ethics of Aristotle, Project Gutenberg', url: gutenberg(8438) }],
    context:
      'Aristotle asks what the good life is for a human being. His answer is happiness understood as flourishing: an active life of virtue over a whole lifetime. Virtues are built by practice, like a craft, and usually sit between two extremes.',
    questions: [
      'Aristotle says we become just by doing just acts. Do you agree that character is mostly habit?',
      'Pick one virtue. What are its two extremes in your own life?',
      'Can someone be happy in Aristotle\u2019s sense and still feel unhappy?',
      'What role do friends and community play in becoming good?',
    ],
    counterpoint:
      'Aristotle wrote for free men of leisure and excluded many people from full citizenship. Ask which of his ideas survive that blind spot and which do not.',
    practice: 'Choose one small habit that builds a virtue you want, and do it every day until the next meeting.',
  },
  {
    week: 4,
    slug: 'sermon-on-the-mount',
    title: 'The Sermon on the Mount',
    author: 'Gospel of Matthew (King James Version, 1611)',
    selection: 'Matthew chapters 5–7',
    minutes: 25,
    sources: [{ label: 'King James Bible, Project Gutenberg', url: gutenberg(10) }],
    context:
      'The longest single block of the teaching of Jesus in the Gospels: the Beatitudes, salt and light, love of enemies, the Lord\u2019s Prayer, the narrow gate and the house built on rock.',
    questions: [
      'Which Beatitude surprises you most, and why?',
      '"Love your enemies" is easy to admire and hard to do. What would it ask of you this week?',
      'How does this teaching compare with Aristotle\u2019s mean from last week?',
      'Is the Sermon a practical guide for a community, or an ideal no one can meet?',
    ],
    counterpoint:
      'Nietzsche argued that this ethic praises weakness and resentment. Others answer that turning the other cheek takes great strength. Let both views speak.',
    practice: 'Do one kindness this week in secret, and tell no one, including the circle.',
  },
  {
    week: 5,
    slug: 'meditations',
    title: 'Meditations, Books 1–2',
    author: 'Marcus Aurelius',
    selection: 'Books 1 and 2',
    minutes: 40,
    sources: [{ label: 'Meditations, Project Gutenberg', url: gutenberg(2680) }],
    context:
      'Private notes written by a Roman emperor to himself. Book 1 is a list of what he learned from the people around him; Book 2 opens by preparing for a day of meeting difficult people without being harmed by them.',
    questions: [
      'Write your own Book 1: who taught you something essential, and what was it?',
      'Marcus reminds himself that the difficult people he will meet are kin. Does that help you?',
      'Can a person with great power stay humble by writing to himself?',
      'What is in your control this week, and what is not?',
    ],
    counterpoint:
      'Stoic calm can slide into indifference toward injustice. Ask where acceptance ends and responsibility begins.',
    practice: 'Each morning, write three lines to yourself about the day ahead, in the style of Marcus.',
  },
  {
    week: 6,
    slug: 'confessions',
    title: 'Confessions, Book VIII',
    author: 'Augustine of Hippo (trans. E. B. Pusey)',
    selection: 'Book VIII',
    minutes: 45,
    sources: [{ label: 'Confessions, Project Gutenberg', url: gutenberg(3296) }],
    context:
      'Augustine describes a divided will: he wants to change his life and also does not want to. The book ends in a garden in Milan, where he hears a child\u2019s voice saying "take up and read."',
    questions: [
      'Have you ever wanted something and not wanted it at the same time? What broke the tie?',
      'Augustine is moved by other people\u2019s stories of change. Why are examples so powerful?',
      'Is real change sudden, gradual, or both?',
      'What is the difference between knowing the good and wanting it?',
    ],
    counterpoint:
      'A reader without faith may see psychology rather than grace in this book. The divided will is a shared human experience either way; discuss it on those terms too.',
    practice: 'Name one thing you keep putting off. Take the first small step before the next meeting.',
  },
  {
    week: 7,
    slug: 'magna-carta',
    title: 'Magna Carta (1215)',
    author: 'King John and the English barons',
    selection: 'Read the whole charter; spend time on clauses 39 and 40',
    minutes: 30,
    sources: [{ label: 'Magna Carta, Yale Avalon Project', url: avalon('medieval/magframe.asp') }],
    context:
      'A peace treaty forced on an English king in 1215. Most clauses deal with feudal money and land, but clauses 39 and 40 promise that no free man will be imprisoned except by lawful judgment or the law of the land, and that justice will not be sold, denied or delayed.',
    questions: [
      'Why might a document about feudal debts become a symbol of liberty for 800 years?',
      'Clause 40 says justice should not be sold, denied or delayed. Where do you see each of those today?',
      'Who was left out of "free man" in 1215, and how did later generations widen it?',
      'Can a promise extracted under pressure still be a good law?',
    ],
    counterpoint:
      'Historians point out that Magna Carta was annulled within weeks and protected mainly the barons. Its later meaning was built by people who reread it. Is that a weakness or the point?',
    practice: 'Look up one right you rely on and trace where it came from.',
  },
  {
    week: 8,
    slug: 'second-treatise',
    title: 'Second Treatise of Government',
    author: 'John Locke',
    selection: 'Chapters 2 (state of nature), 5 (property), 8 (beginning of political societies) and 9 (ends of government)',
    minutes: 70,
    sources: [{ label: 'Second Treatise of Government, Project Gutenberg', url: gutenberg(7370) }],
    context:
      'Locke argues that people are naturally free and equal, that labour gives a claim to property, and that legitimate government rests on consent and exists to protect life, liberty and estate.',
    questions: [
      'Did you ever consent to the government you live under? What would count as consent?',
      'Locke says mixing your labour with something makes it yours. Where does that idea work, and where does it fail?',
      'When, if ever, may people withdraw their consent?',
      'How does Locke\u2019s state of nature compare with Genesis from week 1?',
    ],
    counterpoint:
      'Locke\u2019s theory of property was used to justify taking land from Native peoples who, he claimed, had not "improved" it. Read his argument and its use side by side.',
    practice: 'Find one thing you own that you made or improved yourself. Notice how that feels different.',
  },
  {
    week: 9,
    slug: 'declaration-and-federalist',
    title: 'The Declaration of Independence; Federalist 10 and 51',
    author: 'Thomas Jefferson and others; James Madison',
    selection: 'The Declaration in full; Federalist No. 10 and No. 51',
    minutes: 50,
    sources: [
      { label: 'Declaration of Independence, Yale Avalon Project', url: avalon('18th_century/declare.asp') },
      { label: 'Federalist No. 10, Yale Avalon Project', url: avalon('18th_century/fed10.asp') },
      { label: 'Federalist No. 51, Yale Avalon Project', url: avalon('18th_century/fed51.asp') },
    ],
    context:
      'The Declaration states the case for independence on Lockean grounds. Eleven years later, Madison explains how a large republic can control faction, and why government needs checks: "If men were angels, no government would be necessary."',
    questions: [
      'Which phrase in the Declaration do you hear most often today, and is it used faithfully?',
      'Madison thinks faction cannot be removed without destroying liberty. What are today\u2019s factions?',
      'Do checks and balances assume people are bad, or just ordinary?',
      'Signers who held slaves wrote that all men are created equal. How should we read the sentence and the signers together?',
    ],
    counterpoint:
      'Anti-Federalists warned that a large republic would drift away from ordinary people. Ask whether Madison or his critics have been proved right.',
    practice: 'Have one conversation this week with someone whose politics differ from yours, aiming only to understand.',
  },
  {
    week: 10,
    slug: 'democracy-in-america',
    title: 'Democracy in America, Volume 2, Book II, chapters 5–7',
    author: 'Alexis de Tocqueville (trans. Henry Reeve)',
    selection: 'On the use Americans make of associations in civil life, and how civil and political associations relate',
    minutes: 40,
    sources: [{ label: 'Democracy in America, Volume 2, Project Gutenberg', url: gutenberg(816) }],
    context:
      'A French visitor in the 1830s is struck by how Americans form associations for everything. He argues that in a democracy, where each person alone is weak, the art of associating is the school of freedom.',
    questions: [
      'Tocqueville says Americans of all ages and conditions constantly form associations. Is that still true where you live?',
      'Is this circle the kind of association he meant?',
      'What is lost when people stop joining things?',
      'Can online groups do what he describes, or does it need a room?',
    ],
    counterpoint:
      'Some argue that associations can also wall people off and harden faction (see Madison). Ask what makes an association widen rather than narrow its members.',
    practice: 'Invite one person who has never come to the circle to the next meeting.',
  },
  {
    week: 11,
    slug: 'douglass-fourth-of-july',
    title: 'What to the Slave Is the Fourth of July?',
    author: 'Frederick Douglass (speech of July 5, 1852)',
    selection: 'The extract of the speech printed in the appendix of My Bondage and My Freedom',
    minutes: 35,
    sources: [{ label: 'My Bondage and My Freedom (appendix), Project Gutenberg', url: gutenberg(202) }],
    context:
      'Invited to speak in Rochester on Independence Day, Douglass honours the founders and then turns the occasion into an indictment of slavery. He appeals to the Declaration and the Constitution against the nation that failed them.',
    questions: [
      'Douglass praises the founders and condemns the nation in the same speech. How does he hold both?',
      'Why does he say "your" Fourth of July, not "our"?',
      'He reads the Constitution as an anti-slavery document. What do you make of that argument?',
      'What would a speech like this need to say in your town today?',
    ],
    counterpoint:
      'Some readers hear rejection of America in this speech; Douglass himself ends with hope in its principles. Let the group test both readings against the text.',
    practice: 'Read the speech aloud, or part of it, to someone else this week.',
  },
  {
    week: 12,
    slug: 'lincoln',
    title: 'The Gettysburg Address and the Second Inaugural',
    author: 'Abraham Lincoln',
    selection: 'Both speeches in full (about 1,000 words together)',
    minutes: 20,
    sources: [
      { label: 'Gettysburg Address, Yale Avalon Project', url: avalon('19th_century/gettyb.asp') },
      { label: 'Second Inaugural Address, Yale Avalon Project', url: avalon('19th_century/lincoln2.asp') },
    ],
    context:
      'Two short speeches from the end of a civil war. At Gettysburg, Lincoln returns to the Declaration\u2019s "all men are created equal." In the Second Inaugural he asks for "malice toward none" and "charity for all" while the war is still being won.',
    questions: [
      'Lincoln dates the nation from 1776, not 1787. Why does that matter?',
      'How can a leader call for charity toward people he is still at war with?',
      'Looking back over twelve weeks, which reading changed your mind about something?',
      'What should this circle read next?',
    ],
    counterpoint:
      'Lincoln moved slowly on emancipation and held views on race that Douglass criticised. Ask how the two men\u2019s words from weeks 11 and 12 answer each other.',
    practice: 'Write one paragraph on what you will carry from these twelve weeks, and share it with the circle if you wish.',
  },
];

export function getReading(week: number): CircleReading | undefined {
  return CIRCLE_PATH.find((r) => r.week === week);
}

/** The weekly loop every circle follows. Durations in minutes. */
export const WEEKLY_LOOP: Array<{ step: string; minutes: number; detail: string }> = [
  { step: 'Arrive', minutes: 10, detail: 'Names, a quick check-in, phones away.' },
  { step: 'Read aloud', minutes: 10, detail: 'One short passage from the week\u2019s reading, read aloud by a volunteer.' },
  { step: 'Discuss', minutes: 50, detail: 'The host opens with one question from the guide and keeps time. Everyone speaks before anyone speaks twice.' },
  { step: 'Practice', minutes: 10, detail: 'Agree on the small practice for the week.' },
  { step: 'Close', minutes: 10, detail: 'Each person says one sentence they will take away. Confirm next week\u2019s reading and RSVP.' },
];
