import type { Metadata } from 'next';
import Link from 'next/link';
import CircleSafetyNav from '../messages/CircleSafetyNav';
import PublicFooter from '@/components/PublicFooter';
import { body, card, gold, h1, h2, label, lead, main, page, parchment, small } from '@/lib/circles/ui';

export const metadata: Metadata = {
  title: 'Circle Norms and Safety',
  description: 'How SoE Circles stay welcoming and safe: public places, respectful disagreement, privacy, and how to report a problem.',
};

const NORMS: Array<[string, string]> = [
  ['Read charitably', 'State the strongest version of a view before you criticise it, especially one you dislike.'],
  ['Everyone speaks before anyone speaks twice', 'The host keeps an eye on this. Quiet people are not a problem to be fixed, but the room should make space for them.'],
  ['Disagree with ideas, not people', 'No insults, no name-calling, no labels in place of arguments. Questions are better than verdicts.'],
  ['Stay with the text', 'Bring the conversation back to the reading. Current events are welcome when they shed light on it.'],
  ['What is said in the circle stays in the circle', 'Do not quote other members by name outside the meeting, and never record without everyone\u2019s clear agreement.'],
  ['No selling, recruiting or campaigning', 'Circles are not a platform for products, causes, parties or congregations, including Society of Explorers memberships.'],
];

const SAFETY: string[] = [
  'For in-person meetings, use a public venue such as a library, café, community center, or campus room. Keep private homes out of Circle listings and invitations.',
  'First names are enough. You never have to share your surname, address, workplace or phone number.',
  'Online circles share their video link only with members who have joined, never on the public listing.',
  'Circles are for adults (18+). If you want to run a circle for teenagers, do it through a school or library that has its own safeguarding rules.',
  'Leave at any time, for any reason, without explaining.',
  'If anyone is in immediate danger, call 911 (or your local emergency number) first.',
];

export default function CircleNormsPage() {
  return (
    <div style={page}>
      <CircleSafetyNav />
      <main id="main" style={{ ...main, paddingTop: '2.5rem' }}>
        <p style={label}><Link href="/circles" style={{ color: gold }}>Circles</Link> · Norms</p>
        <h1 style={h1}>Community norms and safety</h1>
        <p style={lead}>
          A circle works when people feel safe enough to say what they actually think. These norms apply to every circle
          listed on Society of Explorers. Hosts read them aloud at the first meeting.
        </p>
        <p style={body}>
          Society of Explorers has Christian and conservative roots and welcomes people of every faith, background and political view.
          You do not have to share those beliefs to belong. The same conduct standards apply to everyone;
          moderation considers behavior and evidence, not agreement with a political or religious position.
        </p>

        <h2 style={h2}>How we talk</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
          {NORMS.map(([t, d]) => (
            <li key={t} style={card}>
              <p style={{ ...body, margin: 0 }}><strong style={{ color: parchment }}>{t}.</strong> {d}</p>
            </li>
          ))}
        </ul>

        <h2 style={h2}>Staying safe</h2>
        <ul style={{ ...body, paddingLeft: '1.2rem' }}>
          {SAFETY.map((s) => <li key={s} style={{ marginBottom: '0.5rem' }}>{s}</li>)}
        </ul>

        <h2 style={h2}>Reporting a problem</h2>
        <p style={body}>
          Every circle page has a <strong style={{ color: parchment }}>Report</strong> button. You do not need to be signed
          in. Reports go to Society of Explorers, not to the host. Several reports can temporarily hide a Circle while it awaits review. A report is an allegation, not a finding.
          An eligible assigned reviewer can keep a listing hidden or restore it after checking the reports and the listing.
          Political or religious disagreement alone is not a violation.
        </p>
        <p style={body}>
          For a discussion message, use <strong style={{ color: parchment }}>Check message actions</strong> to load its current state and send a private report.
          Message reports await an eligible assigned human reviewer; report counts do not automatically hide a message.
          You can withdraw your own messages from <Link href="/circles/contributions" style={{ color: gold }}>My posted messages</Link>, including after leaving a Circle.
          Withdrawal removes the message from member views. Restricted safety evidence is retained; the retention policy is not yet finalized.
          Political or religious disagreement alone is not a violation.
        </p>
        <p style={body}>
          You can also email{' '}
          <a href="mailto:chris@societyofexplorers.com?subject=Circle%20report" style={{ color: gold }}>chris@societyofexplorers.com</a>.
          Hosts can read human decisions and explanations on their <Link href="/circles/review" style={{ color: gold }}>Circle review status</Link> page. Reports and reporter information are excluded from that page.
          Assigned reviewers use the <Link href="/moderation/circles" style={{ color: gold }}>private review queue</Link>.
          Individual messages have a separate <Link href="/moderation/messages" style={{ color: gold }}>assigned message review queue</Link>.
          Receiving a report does not promise a review time or an emergency response.
        </p>
        <p style={small}>
          Society of Explorers lists circles but does not run, supervise or vet them, and hosts are volunteers, not staff.
          Use the same judgement you would for any meeting with people you do not know yet.
        </p>
      </main>
      <PublicFooter />
    </div>
  );
}
