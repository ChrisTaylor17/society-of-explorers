export const ANCIENT_TEXT_PAPER = {
  title: 'The Testimonium Flavianum in Four Transmission Lines: Greek, Latin, Arabic, and Syriac',
  author: 'Jesús Fernández-Pedrera Correa',
  date: '15 August 2026',
  version: 'v1',
  doi: '10.5281/zenodo.21945637',
  href: 'https://zenodo.org/records/21945637',
  locus: 'Josephus, Jewish Antiquities 18.63–64 (18.3.3)',
  summary: 'The author argues that differences among known transmission lines support partial authenticity and a less assertive messianic clause. The exact original wording remains an argument to evaluate.',
};

export const WHISTON_PASSAGE = 'Now there was about this time Jesus, a wise man, if it be lawful to call him a man; for he was a doer of wonderful works, a teacher of such men as receive the truth with pleasure. He drew over to him both many of the Jews and many of the Gentiles. He was [the] Christ. And when Pilate, at the suggestion of the principal men amongst us, had condemned him to the cross, those that loved him at the first did not forsake him; for he appeared to them alive again the third day; as the divine prophets had foretold these and ten thousand other wonderful things concerning him. And the tribe of Christians, so named from him, are not extinct at this day.';

export const ANCIENT_TEXT_SOURCES = [
  { id: 'preprint', title: ANCIENT_TEXT_PAPER.title + ' (2026), Zenodo v1', href: ANCIENT_TEXT_PAPER.href, note: 'Preprint record and original paper; journal peer review is not established by this record. Linked and summarized.' },
  { id: 'whiston', title: 'Josephus, Antiquities XVIII.3.3, translated by William Whiston (1737)', href: 'https://www.gutenberg.org/cache/epub/2848/pg2848-images.html#link182HCH0003', note: 'The received passage reproduced here. Modern editorial footnote callouts are omitted; the disputed wording is retained.' },
  { id: 'whiston-rights', title: 'Project Gutenberg catalogue: translator and public-domain status in the USA', href: 'https://www.gutenberg.org/ebooks/2848', note: 'Rights basis for the historical translation. Full digital-edition notices apply to redistributing that edition; no modern scholarly translation is copied here.' },
  { id: 'witnesses', title: 'T. C. Schmidt, manuscript index and institutional image links', href: 'https://josephusandjesus.com/manuscript-images/', note: 'Copy dates in the table follow this index. Images have separate rights and are not reproduced.' },
  { id: 'theophany-date', title: 'Wisconsin Lutheran College, repertory entry for Eusebius’s Theophany', href: 'https://www.fourthcentury.com/eusebius-theophany/', note: 'Lists 333–337 and distinguishes Barnes’s 325–326 proposal. Neither is the date of the surviving Syriac copy.' },
  { id: 'michael-edition', title: 'Amir Harrak’s edition of Michael’s Chronicle: Gorgias Press record (2019)', href: 'https://gorgiaspress.com/the-chronicle-of-michael-the-great-the-edessa-aleppo-syriac-codex', note: 'The publisher says Michael completed the Chronicle four years before his 1199 death and that it covers through 1195. This qualifies the composition date supplied by the image index.' },
  { id: 'whealey', title: 'Alice Whealey, “The Testimonium Flavianum in Syriac and Arabic,” NTS 54.4 (2008), 573–590', href: 'https://doi.org/10.1017/S0028688508000301', note: 'Traces Arabic and Syriac versions through Syriac Eusebius and argues for a milder messianic clause.' },
  { id: 'schmidt', title: 'T. C. Schmidt, Josephus and Jesus: New Evidence for the One Called Christ (Oxford, 2025)', href: 'https://academic.oup.com/book/60034', note: 'Published online 5 May 2025; print 3 June 2025. Argues for substantial authenticity and proposes a further informant connection.' },
  { id: 'mason', title: 'Steve Mason, “The Historical Jesus: New Evidence or New Techniques?” ITQ 91.1 (2026), 74–98', href: 'https://research.rug.nl/en/publications/the-historical-jesus-new-evidence-or-new-techniques/', note: 'Online 22 January 2026; February issue. Takes authenticity arguments seriously but challenges the stronger eyewitness-source inference. University record labels the article CC BY 4.0.' },
  { id: 'olson', title: 'Ken Olson, “A Eusebian Reading of the Testimonium Flavianum” (2013), 97–114', href: 'https://historicaljesusresearch.blogspot.com/2013/08/the-testimonium-flavianum-eusebius-and.html', note: 'The author’s account of his published chapter argues for Eusebian authorship from language and purpose; this linked argument is not a consensus statement.' },
  { id: 'hansen', title: 'Chrissy Hansen, “A Negative Testimonium?: A Response to Fernando Bermejo-Rubio,” NTS 71.1 (2025), 56–63', href: 'https://doi.org/10.1017/S0028688524000274', note: 'Challenges a necessarily hostile reconstruction and overly simple assumptions about Christian scribal behavior. The publisher’s January issue and August online metadata are not silently harmonized.' },
  { id: 'eusebius', title: 'Eusebius, Church History 1.11.7–8', href: 'https://www.ccel.org/ccel/schaff/npnf201.iii.vi.xi.html', note: 'Ancient quotation of the passage. The linked old translation’s editorial notes are not current scholarly consensus.' },
  { id: 'origen', title: 'Origen, Against Celsus 1.47', href: 'https://www.newadvent.org/fathers/04161.htm', note: 'Says Josephus did not accept Jesus as Christ. What this establishes about Origen’s knowledge of the Testimonium is debated.' },
] as const;

export const TEXT_WITNESSES = [
  { work: 'Greek Antiquities, Book 18', composition: 'c. 93–94 CE', copy: 'Ambrosiana F128, 11th century', distinction: 'Copy of Josephus’s work' },
  { work: 'Greek excerpt of the passage', composition: 'Earlier material excerpted', copy: 'Vatican gr.148, 10th/11th century', distinction: 'Excerpt, not an autograph' },
  { work: 'Syriac Eusebius, Theophany 5.44', composition: 'Fourth-century Greek work; exact dating disputed', copy: 'BL Add.12150, 411 CE', distinction: 'Christian quotation in translation' },
  { work: 'Syriac Eusebius, Church History 1.11', composition: 'Early fourth century', copy: 'NLR Syriac new series1, 462 CE', distinction: 'Christian quotation' },
  { work: 'Jerome, Illustrious Men 13', composition: 'c. 392–393 CE', copy: 'Vatican Reg.lat.2077, sixth/seventh century', distinction: 'Latin reception' },
  { work: 'Agapius’s Arabic history', composition: 'c. 941–942 CE', copy: 'Laurentian Or.323, 1288', distinction: 'Later Arabic reception' },
  { work: 'Michael the Syrian’s chronicle', composition: 'c. 1195; Michael died 1199', copy: 'Aleppo250S, 1598', distinction: 'Later Syriac reception' },
] as const;

export const HISTORICAL_POSITIONS = [
  { title: 'Partial authenticity', detail: 'Josephus wrote an underlying notice, with later Christian alteration. The disputed task is reconstructing its wording. The 2026 preprint argues along this line.', sourceIds: ['preprint', 'whealey'] },
  { title: 'Substantial authenticity', detail: 'Schmidt argues that much more of the passage can be explained as Josephus’s writing. His proposed connection to trial informants is a further inference, not the same question as authenticity.', sourceIds: ['schmidt'] },
  { title: 'Eusebian composition', detail: 'Olson argues that the passage’s language and purpose fit Eusebius. This challenges treating a Josephian core as already demonstrated.', sourceIds: ['olson'] },
  { title: 'Authenticity is not eyewitness access', detail: 'Mason regards the authenticity case as serious but finds the stronger eyewitness-source proposal inadequate. Hansen also challenges overly confident reconstructions of tone and scribal change.', sourceIds: ['mason', 'hansen'] },
] as const;

export const DOSSIER_ANALYSES = [
  { id: 'tf-transmission', observation: 'The verified paper compares known transmission lines and argues for partial authenticity. It does not establish that a new first-century manuscript has been discovered.', sources: ['preprint', 'whealey', 'witnesses'] },
  { id: 'tf-authenticity-and-events', observation: 'Whether Josephus wrote a sentence, what information he used and whether an event occurred are different questions. A received resurrection statement is not, by itself, independent historical verification of resurrection.', sources: ['whiston', 'mason', 'origen', 'eusebius'] },
];
