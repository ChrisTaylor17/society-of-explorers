import {useEffect} from 'react';
import {ActivityIndicator,BackHandler,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {CONDUCT_REASONS,type ConductReason,type DiscussionModel,type PortableDiscussion} from '../src/shared/discussion.ts';
type Props={model:DiscussionModel;controller:PortableDiscussion;onClose:()=>void};
const label=(value:string)=>value.replaceAll('_',' ');
export function DiscussionScreen({model:m,controller:c,onClose}:Props){
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{onClose();return true;});return()=>sub.remove();},[onClose]);
  const draft=m.decisionDraft,review=m.queue?.cases.find(r=>r.caseId===draft?.caseId);
  return <SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.kicker}>SOCIETY OF EXPLORERS · LOCAL DEMO</Text>
    <Text accessibilityRole="header" style={styles.title}>Plan discussion</Text>
    <Text style={styles.copy}>Fictional participants. Suggestions request review; only an assigned human decides. Viewpoints are not conduct violations.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{m.message}</Text>
    {m.busy?<ActivityIndicator accessibilityLabel="Checking discussion" color="#295d48"/>:null}
    <View style={styles.row}><Button label="Refresh access" disabled={m.busy||!m.active} onPress={()=>void c.refresh()}/><Button label="Back to plan" onPress={onClose}/></View>
    {m.pending?<View style={styles.card}><Text style={styles.copy}>One action is unconfirmed. Check its original receipt before another change. Nothing is resent automatically.</Text><Button label="Check original receipt" disabled={m.busy||!m.active} onPress={()=>void c.check()}/></View>:null}
    {m.feed?<View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>Your discussion consent</Text>
      <Text style={styles.copy}>Opting in shares posts with consenting participants. Withdrawal stops future participant access; stored posts and review records remain in this local demo. Contact and private-message consent stay separate.</Text>
      <Button label={m.feed.consented?'Withdraw discussion consent':'Enable discussion consent'} disabled={!m.canAct} onPress={()=>void c.consent(!m.feed!.consented)}/>
      {m.feed.consented?<><Text style={styles.heading}>Post to this plan</Text><PrivateInput label="Discussion post" value={m.postDraft} onChange={c.setPost} editable={m.canAct} maxLength={1200}/><Button label="Post once" disabled={!m.canAct||!m.postDraft.trim()} onPress={()=>void c.post()}/></>:null}
      <Text accessibilityRole="header" style={styles.heading}>Shared posts · {m.feed.posts.length}</Text>
      {m.feed.posts.slice(-50).map(p=><View key={p.postId} style={styles.post}><Text style={styles.author}>{p.authorName}</Text><Text selectable style={styles.copy}>{p.text??'Text restricted by a human reviewer.'}</Text>
        {p.decision?<Text style={styles.small}>{label(p.decision.action)} · {label(p.decision.reasonCode)}</Text>:null}
        {!p.own&&p.text!==null?<><Text style={styles.small}>Request conduct review:</Text><View style={styles.row}>{CONDUCT_REASONS.slice(0,4).map(r=><Button key={r} label={label(r)} disabled={!m.canAct} onPress={()=>void c.flag(p.postId,r)}/>)}</View></>:null}
      </View>)}
      {m.feed.posts.length>50?<Text style={styles.small}>Showing the latest 50 posts.</Text>:null}
    </View>:<Text style={styles.copy}>Participant feed unavailable for the current access check.</Text>}
    {m.queue?<View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Assigned review · {m.queue.cases.length}</Text>
      {m.queue.cases.slice(0,20).map(r=><Button key={r.caseId} label={`${r.phase==='appeal_pending'?'Independent appeal':'Pending review'}: ${r.text.slice(0,70)}`} disabled={!m.canAct} onPress={()=>c.selectCase(r.caseId)}/>)}
      {draft&&review?<View style={styles.post}><Text selectable style={styles.copy}>{review.text}</Text>
        <Text style={styles.small}>Suggestions: {review.suggestions.map(r=>label(r.reasonCode)).join(', ')||'none'}. These are not findings.</Text>
        {review.appeal?<Text selectable style={styles.copy}>Author’s appeal: {review.appeal.text}</Text>:null}
        {review.decisions.map(d=><Text key={d.decisionId} style={styles.copy}>Prior {d.stage}: {label(d.action)} · {d.explanation}</Text>)}
        <View style={styles.row}>{(['keep','restrict'] as const).map(action=><Button key={action} label={action==='keep'?'Keep visible':'Restrict text'} selected={draft.action===action} disabled={!m.canAct} onPress={()=>c.setDecision({action,reasonCode:action==='keep'?'no_violation':'personal_data'})}/>)}</View>
        <ReasonButtons selected={draft.reasonCode} disabled={!m.canAct} onChange={reasonCode=>c.setDecision({reasonCode})}/>
        <PrivateInput label="Specific explanation the author can read" value={draft.explanation} onChange={explanation=>c.setDecision({explanation})} editable={m.canAct} maxLength={800}/>
        <PrivateInput label="Exact source excerpt for restriction" value={draft.excerpt} onChange={excerpt=>c.setDecision({excerpt})} editable={m.canAct} maxLength={300}/>
        <Button label="Record human decision" disabled={!m.canAct||draft.explanation.trim().length<20} onPress={()=>void c.decide()}/>
      </View>:null}
    </View>:null}
    {m.notices?<View style={styles.card}><Text accessibilityRole="header" style={styles.heading}>Your decisions and appeals</Text>
      {m.notices.notices.slice(-20).map(n=><View key={n.caseId} style={styles.post}><Text style={styles.author}>{label(n.phase)}</Text>
        {n.decisions.map(d=><View key={d.decisionId}><Text style={styles.copy}>{label(d.action)} · {label(d.reasonCode)}</Text><Text selectable style={styles.copy}>{d.explanation}</Text><Text selectable style={styles.small}>Source excerpt: {d.excerpt}</Text></View>)}
        {n.appealStatus?<Text style={styles.status}>{label(n.appealStatus)}</Text>:null}
        {n.canAppeal?<Button label="Prepare independent appeal" disabled={!m.canAct} onPress={()=>c.selectAppeal(n.caseId)}/>:null}
        {m.appealDraft?.caseId===n.caseId?<><PrivateInput label="Context for independent appeal" value={m.appealDraft.text} onChange={c.setAppeal} editable={m.canAct} maxLength={800}/><Button label="Request independent review" disabled={!m.canAct||!m.appealDraft.text.trim()} onPress={()=>void c.appeal()}/></>:null}
      </View>)}
    </View>:null}
    <Text style={styles.small}>Drafts clear when this screen closes, access is rechecked, or the app loses focus. No staffed response time or production service is provided.</Text>
  </ScrollView></SafeAreaView>;
}
function PrivateInput({label,value,onChange,editable,maxLength}:{label:string;value:string;onChange:(v:string)=>void;editable:boolean;maxLength:number}){
  return <View><Text style={styles.small}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={editable} maxLength={maxLength} multiline autoComplete="off" textContentType="none" importantForAutofill="no" autoCorrect={false} spellCheck={false} textAlignVertical="top" style={styles.input}/></View>;
}
function ReasonButtons({selected,disabled,onChange}:{selected:ConductReason;disabled:boolean;onChange:(r:ConductReason)=>void}){
  return <View accessibilityRole="radiogroup" accessibilityLabel="Conduct reason" style={styles.row}>{CONDUCT_REASONS.map(r=><Button key={r} label={label(r)} selected={selected===r} disabled={disabled} onPress={()=>onChange(r)}/>)}</View>;
}
function Button({label,disabled=false,selected=false,onPress}:{label:string;disabled?:boolean;selected?:boolean;onPress:()=>void}){
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={[styles.button,selected&&styles.selected,disabled&&styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#f4f1e8'},content:{padding:20,paddingBottom:44,maxWidth:680,width:'100%',alignSelf:'center'},kicker:{fontSize:12,fontWeight:'700',letterSpacing:1,color:'#295d48'},title:{fontSize:30,fontWeight:'700',color:'#18382c',marginVertical:12},heading:{fontSize:19,fontWeight:'700',marginTop:14,color:'#18382c'},copy:{fontSize:16,lineHeight:24,color:'#253e32',marginTop:8},small:{fontSize:13,lineHeight:20,color:'#526458',marginTop:10},status:{fontSize:15,lineHeight:22,color:'#875526',marginVertical:12},card:{backgroundColor:'#fffdf7',padding:16,borderRadius:16,marginVertical:12},post:{borderTopWidth:1,borderColor:'#d7dfd3',paddingTop:14,marginTop:14},author:{fontSize:15,fontWeight:'700',color:'#18382c'},row:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},button:{minHeight:48,padding:13,justifyContent:'center',borderRadius:10,backgroundColor:'#295d48',marginTop:6},buttonText:{color:'#fffdf7',fontSize:14,fontWeight:'600'},selected:{backgroundColor:'#17412e',borderWidth:2,borderColor:'#b99a55'},disabled:{opacity:0.45},input:{minHeight:92,borderWidth:1,borderColor:'#829a87',borderRadius:10,padding:12,marginTop:8,fontSize:16,lineHeight:23,color:'#18382c',backgroundColor:'#fff'}});
