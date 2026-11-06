export { philemonEdition } from './philemon-edition';

export const PHILEMON_GREETING = 'Paul names the Father and Jesus together in one blessing. The greeting distinguishes them and leaves their relationship to be explored in other passages.';
export const PHILEMON_PERSPECTIVES = [
  {
    id: 'nicene-reading',
    title: 'Nicene Christian reading',
    detail: 'This reading hears the Father and the Son as distinct persons named together in the blessing. In Nicene theology, their distinction is compatible with their sharing the one divine nature.',
    source: {
      label: 'Catholic Catechism, paragraphs 253–255',
      href: 'https://www.vatican.va/content/catechism/en/part_one/section_two/chapter_one/article_1/paragraph_2_the_father.html',
    },
  },
  {
    id: 'unitarian-reading',
    title: 'Biblical Unitarian reading',
    detail: 'This reading takes “God our Father” as naming the one God and “the Lord Jesus Christ” as naming the Messiah whom God made Lord. It sees the shared blessing as compatible with the Father granting authority to Jesus.',
    source: {
      label: 'Biblical Unitarian statement of beliefs',
      href: 'https://www.biblicalunitarian.com/articles/what-do-biblical-unitarians-believe',
    },
  },
] as const;

export const PHILEMON_COMPARISON = 'The greeting alone leaves the later doctrinal question open.';
export const PHILEMON_FURTHER_READING = [
  { label: 'John 17:3', href: 'https://ebible.org/eng-web/JHN17.htm#V3' },
  { label: 'Philippians 2:5–11', href: 'https://ebible.org/eng-web/PHP02.htm#V5' },
] as const;

export const PHILEMON_SALON_QUESTIONS = [
  { before: 'How does each reading account for both the distinction and the shared blessing in ', verse: 3, after: '?' },
  { before: 'What would it ask of Philemon to receive Onesimus as a beloved brother in ', verse: 16, after: '? What does the letter leave open about what happened next?' },
] as const;

export const PHILEMON_AGENDA = [
  { minutes: 5, title: 'Welcome', detail: 'Use first names, read the norms, and open with a brief prayer. Readers are welcome to listen quietly.' },
  { minutes: 8, title: 'Read aloud', detail: 'Ask a volunteer to read verses 1 through 7 and another to read verses 8 through 25.' },
  { minutes: 12, title: 'Compare the greeting', detail: 'Read verse 3 again. Ask someone to state each interpretation in terms a reader who holds it would accept. Look together at what the greeting leaves open.' },
  { minutes: 15, title: 'Discuss the appeal', detail: 'What would it ask of Philemon to receive Onesimus as a beloved brother? What does the letter leave open about what happened next?' },
  { minutes: 5, title: 'Close', detail: 'Ask each person what they will take away and whether they would return for another meeting. Let anyone pass.' },
] as const;

export const PHILEMON_VIDEO_ROOM = 'Test the video room before opening it. Share the meeting link privately and keep recording and automated note-taking off.';
