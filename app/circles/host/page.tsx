import type { Metadata } from 'next';
import Link from 'next/link';
import PublicNav from '@/components/PublicNav';
import PublicFooter from '@/components/PublicFooter';
import { WEEKLY_LOOP } from '@/lib/circles/path';
import { body, button, card, gold, h1, h2, label, lead, main, page, parchment, primary, small } from '@/lib/circles/ui';

export const metadata: Metadata = {
  title: 'Circle Host Toolkit',
  description: 'A guide for volunteer hosts running an online or in-person Circle, with a first salon on Philemon.',
};

const BEFORE: string[] = [
  'Book a free public room for an in-person meeting, or test a private video link for an online meeting. A waiting room gives you control over who enters the call.',
  'Pick a fixed weekday and time and keep it for all 12 weeks. Consistency matters more than the perfect slot.',
  'Share the public Circle listing so readers can find the group. Keep the private video link in the members’ meeting details.',
  'Read week 1 and its guide, and choose the one question you will open with.',
];

const FIRST: string[] = [
  'Arrive ten minutes early. Set out a sign at a public venue or open the online room and check your microphone.',
  'Start on time, even if only two people are there.',
  'Read the community norms aloud (two minutes). Ask everyone to share a first name and why they came.',
  'Explain the weekly loop, then run it.',
  'End on time. Remind everyone of next week\u2019s reading and ask them to RSVP on the circle page.',
];

const HARD: Array<[string, string]> = [
  ['One person dominates', '\u201cLet\u2019s hear from someone who hasn\u2019t spoken yet.\u201d Then wait. Silence is fine.'],
  ['It turns into a political fight', 'Ask each side to state the other\u2019s view in a way the other would accept. Then return to the text: \u201cWhat does the author say?\u201d'],
  ['Someone is upset', 'Pause, acknowledge it plainly, and offer a short break. Nobody has to keep talking about something painful.'],
  ['Someone breaks the norms', 'Remind the group of the norm once, kindly. If it continues, ask the person to leave and use the Report button afterwards.'],
  ['Nobody comes', 'It happens. Read the passage yourself, post a note in the circle discussion, and try again next week. Most circles grow by word of mouth.'],
];

const PHILEMON_AGENDA = [
  { minutes: 5, title: 'Welcome', detail: 'Use first names, read the norms, and open with a brief prayer. Readers are welcome to listen quietly.' },
  { minutes: 8, title: 'Read aloud', detail: 'Ask a volunteer to read verses 1 through 7 and another to read verses 8 through 25.' },
  { minutes: 12, title: 'Compare the greeting', detail: 'Read verse 3 again. Ask someone to state each interpretation in terms a reader who holds it would accept. Look together at what the greeting leaves open.' },
  { minutes: 15, title: 'Discuss the appeal', detail: 'What would it ask of Philemon to receive Onesimus as a beloved brother? What does the letter leave open about what happened next?' },
  { minutes: 5, title: 'Close', detail: 'Ask each person what they will take away and whether they would return for another meeting. Let anyone pass.' },
] as const;

export default function CircleHostPage() {
  return (
    <div style={page}>
      <PublicNav checkSession={false} />
      <main id="main" style={main}>
        <p style={label}><Link href="/circles" style={{ color: gold }}>Circles</Link> · Host toolkit</p>
        <h1 style={h1}>Host toolkit</h1>
        <p style={lead}>
          Set up the meeting, open with a question, keep time and make room for everyone to speak. You can host as a fellow reader.
        </p>

        <section aria-labelledby="philemon-salon" style={card}>
          <h2 id="philemon-salon" tabIndex={-1} style={{ ...h2, marginTop: 0, scrollMarginTop: '6rem' }}>Host a Philemon salon online</h2>
          <p style={body}>
            Try one 45-minute conversation with four to six readers. Share the{' '}
            <Link href="/great-books/scripture/philemon" style={{ color: gold }}>Root Kernel Philemon study</Link>.
            Ask everyone to read the letter ahead of time and bring a question about the greeting or Paul&rsquo;s appeal for Onesimus.
          </p>
          <p style={body}>Test the video room before opening it. Share the meeting link privately and keep recording and automated note-taking off.</p>
          <ol style={{ ...body, paddingLeft: '1.4rem' }}>
            {PHILEMON_AGENDA.map(({ minutes, title, detail }) => (
              <li key={title} style={{ marginBottom: '0.5rem' }}><strong>{title}</strong> · {minutes} min. {detail}</li>
            ))}
          </ol>
          <p style={body}>If the group wants to keep meeting, choose a weekly time and list an online Circle.</p>
          <Link href="/circles/start?format=online" style={primary}>Start a weekly online Circle</Link>
        </section>

        <h2 style={h2}>Before the first meeting</h2>
        <ol style={{ ...body, paddingLeft: '1.4rem' }}>{BEFORE.map((s) => <li key={s} style={{ marginBottom: '0.5rem' }}>{s}</li>)}</ol>

        <h2 style={h2}>The first meeting</h2>
        <ol style={{ ...body, paddingLeft: '1.4rem' }}>{FIRST.map((s) => <li key={s} style={{ marginBottom: '0.5rem' }}>{s}</li>)}</ol>

        <h2 style={h2}>Every meeting (90 minutes)</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
          {WEEKLY_LOOP.map((s) => (
            <li key={s.step} style={card}>
              <p style={{ ...body, margin: 0 }}><strong style={{ color: parchment }}>{s.step}</strong> · {s.minutes} min. {s.detail}</p>
            </li>
          ))}
        </ul>

        <h2 style={h2}>Hard moments</h2>
        <ul style={{ ...body, paddingLeft: '1.2rem' }}>
          {HARD.map(([t, d]) => <li key={t} style={{ marginBottom: '0.6rem' }}><strong style={{ color: parchment }}>{t}.</strong> {d}</li>)}
        </ul>

        <h2 style={h2}>What hosts agree to</h2>
        <ul style={{ ...body, paddingLeft: '1.2rem' }}>
          <li>Use public venues for in-person meetings, keep online links private, and follow the <Link href="/circles/norms" style={{ color: gold }}>community norms</Link>.</li>
          <li>Keep members&rsquo; contact details private and never add them to other lists.</li>
          <li>Keep circles free. Hosts may not charge members or sell to them.</li>
          <li>Host at most three circles at once.</li>
        </ul>
        <p style={small}>Hosts are volunteers, not employees or agents of Society of Explorers.</p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2rem' }}>
          <Link href="/circles/start" style={primary}>Start a circle</Link>
          <Link href="/circles/path/1" style={button}>Read the week 1 guide</Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
