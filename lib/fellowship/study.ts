import scripture from '@/content/fellowship/scripture.web-classic.json';

export const STUDY_REVISION = '2026-11-08.2';
export const ANALYSIS_STATUS = 'AI-assisted draft · awaiting human editorial review';
export type Relationship = 'quotation' | 'allusion' | 'comparison' | 'textual issue';
export type PassageReference = { passageId: string; first: number; last: number };
export type StudyClaim = {
  id: string; theme: 'psalm' | 'isaiah'; title: string; relationship: Relationship;
  references: PassageReference[]; observation: string; christian: string;
  other: string; limit: string; question: string; sources: string[];
};

export const STUDY_SOURCES: Record<string, { title: string; href: string; role: string }> = {
  web: { title: 'World English Bible Classic: edition and public-domain dedication', href: scripture.rightsUrl, role: 'Scripture edition; publisher notes are separate from analysis.' },
  rashiPsalm: { title: 'Rashi on Psalm 22, especially Hebrew verse 17', href: 'https://www.chabad.org/library/bible_cdo/aid/16243/jewish/Chapter-22.htm', role: 'A named Jewish interpretation; linked and paraphrased, not copied as the study translation.' },
  rashiIsaiah: { title: 'Rashi on Isaiah 53, especially verses 3–8', href: 'https://www.chabad.org/library/bible_cdo/aid/15984/jewish/Chapter-53.htm', role: 'A collective Israel reading; one important Jewish voice, not every Jewish position.' },
  brettlerLevine: { title: 'Marc Brettler and Amy-Jill Levine, “Isaiah’s Suffering Servant: Before and After Christianity” (2019), 158–173', href: 'https://doi.org/10.1177/0020964318820594', role: 'Historical setting and diverse reception; original scholarly argument, linked and briefly paraphrased.' },
  catechism: { title: 'Catholic Catechism 597, 601–603: crucifixion and the suffering Servant', href: 'https://www.vatican.va/content/catechism/en/part_one/section_two/chapter_two/article_4/paragraph_2_jesus_died_crucified.html', role: 'A Nicene Christian confession and interpretation, not neutral historical proof.' },
  unitarian: { title: 'Biblical Unitarian statement of beliefs', href: 'https://www.biblicalunitarian.com/articles/what-do-biblical-unitarians-believe', role: 'A named confessional comparison; Root Kernel’s notes retain their own editorial voice.' },
  patterson: { title: 'Richard D. Patterson, “Psalm 22: From Trial to Triumph,” JETS 47.2 (2004), 213–233', href: 'https://etsjets.org/wp-content/uploads/2010/06/files_JETS-PDFs_47_47-2_47-2-pp213-233_JETS.pdf', role: 'An evangelical scholarly argument for a Davidic and messianic reading; not a settled textual verdict.' },
};

export const STUDY_CONTEXTS = {
  psalm: {
    title: 'Psalm 22: lament, rescue and praise',
    context: 'Read the whole psalm. Its speaker moves from abandonment and bodily danger to an answered cry and public praise reaching future generations. The superscription attributes it to David; the precise original occasion is not established here.',
    nicene: 'A Nicene Christian reading hears the incarnate Son sharing human suffering and sees the movement toward vindication in the light of Easter. The Gospel quotations connect Jesus to the prayer; the psalm alone does not settle the doctrine of the Trinity.',
    rootKernel: 'Root Kernel’s Biblical Unitarian starting point reads Jesus as the faithful human Messiah praying to God, his Father. It likewise reads his vindication through resurrection faith. That theological starting point is labeled rather than presented as an impartial historical finding.',
    jewish: 'Jewish readers can hear Israel’s prayer of distress and deliverance without identifying the speaker as Jesus. Rashi explains the difficult hands-and-feet line through the lion image. Read that interpretation in its own context before evaluating a Christian application.',
    sources: ['catechism', 'unitarian', 'rashiPsalm', 'patterson'],
  },
  isaiah: {
    title: 'Isaiah 52:13–53:12: whose servant?',
    context: 'The poem begins before the chapter break at 52:13. Read it beside the return-from-exile language of Isaiah 52, the restored community of Isaiah 54, and the servant language in 41:8 and 49:3. Attend to changing speakers, humiliation and vindication.',
    nicene: 'Nicene Christians read the servant through the suffering, death and resurrection of Jesus and the New Testament’s explicit uses of Isaiah. This is a theological reading of the whole canon; the poem itself does not name Jesus.',
    rootKernel: 'Root Kernel’s Biblical Unitarian perspective also identifies Jesus as the suffering Messiah, while understanding him as God’s human servant whom God raises and exalts. A shared application to Jesus does not resolve the different accounts of his relation to God.',
    jewish: 'Rashi reads the servant collectively as Israel. Jewish reception also includes individual and messianic readings; it is not uniform. Brettler and Levine argue for an unidentified individual in an exilic setting, also capable of representing Israel, and trace later re-readings. Their historical proposal is an argument, not an identified person recovered from the text.',
    sources: ['catechism', 'unitarian', 'rashiIsaiah', 'brettlerLevine'],
  },
} as const;

export const STUDY_CLAIMS: StudyClaim[] = [
  {
    id: 'cry-of-abandonment', theme: 'psalm', title: 'Jesus’ cry and the opening of the psalm', relationship: 'quotation',
    references: [{ passageId: 'psalm-22', first: 1, last: 2 }, { passageId: 'mark-15', first: 33, last: 37 }, { passageId: 'matthew-27', first: 45, last: 50 }],
    observation: 'Mark 15:34 and Matthew 27:46 explicitly give Jesus’ cry and translate the opening words of Psalm 22.',
    christian: 'Christians hear Jesus entering the prayer of the sufferer; some read the opening as evoking the entire psalm, including its eventual praise.',
    other: 'The quotation can also be studied as the evangelists’ use of Israel’s lament tradition. Whether every hearer was intended to recall the entire psalm remains an interpretive question.',
    limit: 'A quotation establishes a literary relationship. It does not by itself establish an independently witnessed transcript or decide between Nicene and Unitarian Christology.',
    question: 'How does reading the end of Psalm 22 change what you hear in its opening?',
    sources: ['web', 'catechism', 'patterson'],
  },
  {
    id: 'mockery-and-trust', theme: 'psalm', title: 'Mockery, trust and a request for rescue', relationship: 'allusion',
    references: [{ passageId: 'psalm-22', first: 7, last: 8 }, { passageId: 'matthew-27', first: 39, last: 44 }, { passageId: 'mark-15', first: 29, last: 32 }],
    observation: 'The Gospel mockery scenes resemble the psalm’s taunts. Matthew 27:43 is particularly close to Psalm 22:8.',
    christian: 'A Christian reading sees the righteous sufferer’s pattern brought into focus in Jesus’ crucifixion.',
    other: 'Literary analysis asks how scriptural language shaped the narrative. The resemblance need not be read as a stand-alone prediction written only about this later scene.',
    limit: 'This card labels an allusion, not a formula quotation. Shared wording is not an additional independent witness to the event.',
    question: 'What is the difference between recognizing a pattern and demonstrating a prediction?',
    sources: ['web', 'patterson', 'rashiPsalm'],
  },
  {
    id: 'garments-and-lots', theme: 'psalm', title: 'Dividing garments and casting lots', relationship: 'quotation',
    references: [{ passageId: 'psalm-22', first: 18, last: 18 }, { passageId: 'john-19', first: 23, last: 25 }],
    observation: 'John 19:24 quotes the garment-and-lots line and explicitly describes it as Scripture being fulfilled.',
    christian: 'Christians receive John’s fulfillment claim as part of his account of Jesus’ passion.',
    other: 'A historical-literary reading distinguishes John’s interpretive statement from the earlier psalm’s own suffering speaker.',
    limit: 'The Gospel’s assertion of fulfillment is visible in the source. Whether that demonstrates divine foreknowledge is a further theological judgment.',
    question: 'What does John add by naming the Scripture rather than merely describing the action?',
    sources: ['web', 'patterson'],
  },
  {
    id: 'hands-and-feet', theme: 'psalm', title: 'Hands and feet: a disputed reading', relationship: 'textual issue',
    references: [{ passageId: 'psalm-22', first: 14, last: 21 }, { passageId: 'john-19', first: 17, last: 22 }],
    observation: 'WEB prints “They have pierced my hands and feet” at English Psalm 22:16 and gives an alternative Masoretic reading in its note. In Hebrew numbering this is verse 17. Rashi explains the line with a lion image.',
    christian: 'Many Christians connect the pierced reading with crucifixion. Patterson defends that reading using ancient versions and a Judean Desert witness.',
    other: 'Rashi’s lion reading fits the surrounding animal imagery. The wording and reconstruction are disputed; WEB’s publisher note states its own editorial choice, not a unanimous scholarly verdict.',
    limit: 'None of the four canonical Gospel crucifixion accounts directly quotes this hands-and-feet line. A manuscript variant, its translation and a prophetic application are three distinct questions.',
    question: 'Would your interpretation change if the lion reading were original? Why?',
    sources: ['web', 'rashiPsalm', 'patterson'],
  },
  {
    id: 'numbered-with-transgressors', theme: 'isaiah', title: 'Counted with transgressors', relationship: 'quotation',
    references: [{ passageId: 'isaiah-53', first: 10, last: 12 }, { passageId: 'luke-22', first: 35, last: 38 }, { passageId: 'luke-23', first: 32, last: 34 }],
    observation: 'Luke 22:37 explicitly applies Isaiah 53:12 to Jesus before his arrest. Luke 23 places his execution beside two criminals.',
    christian: 'Christians connect Jesus’ stated scriptural vocation with the passion that follows.',
    other: 'Reading Isaiah on its own still requires asking who the servant and the speakers are within Isaiah’s setting.',
    limit: 'The explicit quotation occurs before the crucifixion, not as a quotation in Luke 23. Keep that sequence visible.',
    question: 'What does Luke’s placement before the arrest contribute to the later scene?',
    sources: ['web', 'catechism', 'brettlerLevine'],
  },
  {
    id: 'silent-servant', theme: 'isaiah', title: 'A silent sufferer and Philip’s reading', relationship: 'quotation',
    references: [{ passageId: 'isaiah-53', first: 7, last: 9 }, { passageId: 'acts-8', first: 30, last: 35 }, { passageId: 'matthew-27', first: 11, last: 14 }],
    observation: 'Acts 8:32–35 quotes Isaiah and says Philip begins there to speak about Jesus. Matthew’s account of Jesus’ silence is a related comparison, not the same explicit citation.',
    christian: 'This is an early Christian example of reading the servant through Jesus.',
    other: 'Brettler and Levine distinguish the poem’s exilic setting from its later Christian reception. Rashi’s collective interpretation supplies another answer to the servant’s identity.',
    limit: 'Acts’ Greek-scriptural quotation and the Hebrew-based WEB Isaiah wording differ. Do not silently harmonize the two translations.',
    question: 'What question does the Ethiopian reader ask before Philip offers an interpretation?',
    sources: ['web', 'brettlerLevine', 'rashiIsaiah'],
  },
  {
    id: 'wounds-and-conduct', theme: 'isaiah', title: 'No deceit, wounds and an example to follow', relationship: 'quotation',
    references: [{ passageId: 'isaiah-53', first: 4, last: 9 }, { passageId: 'peter-2', first: 18, last: 25 }],
    observation: '1 Peter 2:22–25 reuses Isaiah’s language of innocence, suffering and healing while presenting Christ as an example.',
    christian: 'Christians read both redemptive suffering and a call to follow Jesus’ conduct.',
    other: 'This is later apostolic interpretation, not another Gospel crucifixion report. Its address to enslaved people must remain in view when discussing the ethics of its reception.',
    limit: 'A call to imitate Christ should not become permission to impose suffering or excuse abuse. The text and its later uses need separate examination.',
    question: 'How can readers distinguish voluntary faithfulness from pressure to endure another person’s injustice?',
    sources: ['web', 'catechism'],
  },
  {
    id: 'healing-application', theme: 'isaiah', title: 'A use of Isaiah during healing', relationship: 'quotation',
    references: [{ passageId: 'isaiah-53', first: 4, last: 5 }, { passageId: 'matthew-8', first: 14, last: 17 }],
    observation: 'Matthew 8:17 explicitly quotes Isaiah 53:4 in a healing scene. It is included here as a comparison with passion readings.',
    christian: 'Christian interpretation can connect Jesus’ healing ministry and passion within a larger account of salvation.',
    other: 'The range of New Testament uses cautions against reducing every use of the servant poem to one scene or one theory of atonement.',
    limit: 'This is an explicit quotation in a healing scene. It is not a crucifixion quotation.',
    question: 'What is lost if Isaiah 53 is read only as a checklist of crucifixion details?',
    sources: ['web', 'catechism', 'brettlerLevine'],
  },
  {
    id: 'burial-with-a-rich-man', theme: 'isaiah', title: 'A burial and a wealthy disciple', relationship: 'comparison',
    references: [{ passageId: 'isaiah-53', first: 8, last: 10 }, { passageId: 'matthew-27', first: 57, last: 61 }],
    observation: 'Isaiah 53:9 places the servant’s grave with the wicked and a rich man. Matthew 27:57–60 describes the wealthy Joseph of Arimathea placing Jesus in his own tomb.',
    christian: 'Christians often read the burial as another correspondence between Jesus and the servant.',
    other: 'Rashi reads the servant’s treatment within Israel’s suffering. A historical-literary comparison asks about each passage’s setting and the Gospel author’s use of Scripture.',
    limit: 'Matthew does not explicitly cite Isaiah 53 in this burial scene. Resemblance and a theological claim of fulfillment should not be labeled a direct quotation.',
    question: 'What further evidence would you need before calling a correspondence a prediction?',
    sources: ['web', 'rashiIsaiah'],
  },
];

export const SCRIPTURE_PASSAGES = scripture.passages;
export const SCRIPTURE_EDITION = { name: scripture.edition, rightsUrl: scripture.rightsUrl, notice: scripture.rightsNotice };
export function getPassage(id: string) { return SCRIPTURE_PASSAGES.find(p => p.id === id); }
export function referenceTitle(reference: PassageReference) {
  const passage = getPassage(reference.passageId);
  const chapter = passage?.title.split(':')[0] ?? reference.passageId;
  return chapter + ':' + reference.first + (reference.last === reference.first ? '' : '–' + reference.last);
}
export type ReviewableAnalysis = Pick<StudyClaim, 'id' | 'observation' | 'sources'> & {
  sourceLinks?: readonly { id: string; title: string; href: string }[];
};
export function correctionProposal(claim: ReviewableAnalysis, proposed: string, reason: string) {
  const text = proposed.trim(), why = reason.trim();
  if (!text || !why || text.length > 6000 || why.length > 3000 || text === claim.observation) return null;
  const references = claim.sources.map(id => claim.sourceLinks?.find(s => s.id === id)
    ?? (STUDY_SOURCES[id] ? { id, ...STUDY_SOURCES[id] } : null));
  if (!references.length || references.some(source => {
    if (!source) return true;
    try { const url = new URL(source.href); return url.protocol !== 'https:' || Boolean(url.username || url.password); }
    catch { return true; }
  })) return null;
  return { version: 1, kind: 'soe-fellowship-correction-proposal', claimId: claim.id,
    sourceRevision: STUDY_REVISION, originalAnalysis: claim.observation, proposedAnalysis: text,
    reasonAndSourceToCheck: why, sourceIds: [...claim.sources],
    sourceReferences: references.filter(source => source !== null).map(({ id, title, href }) => ({ id, title, href })),
    scope: 'local proposal',
    published: false, scriptureChanged: false, originalStatus: ANALYSIS_STATUS };
}
