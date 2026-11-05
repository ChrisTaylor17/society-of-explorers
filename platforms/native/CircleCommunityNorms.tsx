import { StyleSheet, Text, View } from 'react-native';

// Same conduct and meeting-safety expectations as app/circles/norms/page.tsx.
// Kept local so joining does not need an external browser or another request.
export function CircleCommunityNorms() {
  const norms = [
    ['Read charitably', 'State the strongest version of a view before you criticise it, especially one you dislike.'],
    ['Everyone speaks before anyone speaks twice', 'The host keeps an eye on this. Quiet people are not a problem to be fixed, but the room should make space for them.'],
    ['Disagree with ideas, not people', 'No insults, no name-calling, no labels in place of arguments. Questions are better than verdicts.'],
    ['Stay with the text', 'Bring the conversation back to the reading. Current events are welcome when they shed light on it.'],
    ['What is said in the circle stays in the circle', 'Do not quote other members by name outside the meeting, and never record without everyone’s clear agreement.'],
    ['No selling, recruiting or campaigning', 'Circles are not a platform for products, causes, parties or congregations, including Society of Explorers memberships.'],
  ];
  const safety = [
    'Meet only in public places: libraries, cafés, community centers, campus rooms. Circles cannot list a private home, and hosts should not invite members to one.',
    'First names are enough. You never have to share your surname, address, workplace or phone number.',
    'Online circles share their video link only with members who have joined, never on the public listing.',
    'Circles are for adults (18+). If you want to run a circle for teenagers, do it through a school or library that has its own safeguarding rules.',
    'Leave at any time, for any reason, without explaining.',
    'If anyone is in immediate danger, call 911 (or your local emergency number) first.',
  ];
  return <View style={styles.list}>
    <Text accessibilityRole="header" style={styles.heading}>Community norms and safety</Text>
    <Text style={styles.copy}>Society of Explorers has Christian and conservative roots and welcomes people of every faith, background and political view. You do not have to share those beliefs to belong. The same conduct standards apply to everyone; moderation considers behavior and evidence, not agreement with a political or religious position.</Text>
    {norms.map(([title, description]) => <View key={title} style={styles.list}><Text style={styles.copy}>{title}</Text><Text style={styles.note}>{description}</Text></View>)}
    {safety.map(item => <Text key={item} style={styles.note}>{item}</Text>)}
    <Text style={styles.note}>Society of Explorers lists circles but does not run, supervise or vet them, and hosts are volunteers, not staff. Use the same judgement you would for any meeting with people you do not know yet.</Text>
  </View>;
}

const styles = StyleSheet.create({ heading: { color: '#f4f2e5', fontSize: 23, lineHeight: 30 }, copy: { color: '#e9eadf', fontSize: 17, lineHeight: 26 }, note: { color: '#c0cbbf', fontSize: 15, lineHeight: 23 }, list: { gap: 16 } });
