'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookEditionResponse } from '@/lib/books/bookmarks';
import { useReadingAccess, type ReadingFailure } from './useReadingAccess';
import { readAnnotation } from './annotation';
import styles from './reading.module.css';
import SavedReadingTools from './SavedReadingTools';

const THINKERS = [['socrates', 'Socrates'], ['plato', 'Plato'], ['aurelius', 'Marcus Aurelius'], ['nietzsche', 'Friedrich Nietzsche'], ['einstein', 'Albert Einstein'], ['jobs', 'Steve Jobs']];
function failureText(error: ReadingFailure, tool: string) {
  return error.status === 401 ? `Sign in to ${tool}. Reading the complete text is free and does not require an account.`
    : error.status === 403 ? `This account cannot ${tool}.`
    : error.status === 429 ? 'Please wait before another request. Nothing will retry automatically.'
    : `The ${tool} reply could not be confirmed. Nothing will retry automatically.`;
}

export default function ReaderTools({ edition: metadata, currentIndex, frameReady, jump, select, returnSearch = '' }: {
  edition: BookEditionResponse; currentIndex: number; frameReady: boolean; jump: (index: number) => void; select: () => string; returnSearch?: string;
}) {
  const { bookId } = metadata;
  const [passage, setPassage] = useState(''), [question, setQuestion] = useState(''), [thinker, setThinker] = useState('socrates');
  const [consent, setConsent] = useState(false), [voiceConsent, setVoiceConsent] = useState(false);
  const [annotation, setAnnotation] = useState(''), [aiNotice, setAiNotice] = useState('No AI request has been made.');
  const [audioUrl, setAudioUrl] = useState<string | null>(null), [audioNotice, setAudioNotice] = useState('No audio has been generated.');
  const audioRef = useRef<HTMLAudioElement>(null);
  const clear = useCallback(() => {
    setPassage(''); setQuestion(''); setAnnotation(''); setConsent(false); setVoiceConsent(false);
    setAiNotice('Private passages, questions and AI replies were cleared. A generation already sent may still complete at the provider.');
    audioRef.current?.pause(); setAudioUrl(null); setAudioNotice('Audio and its consent were cleared. A generation already sent may have completed.');
  }, []);
  const { active, busy, run, cancel } = useReadingAccess(clear);
  useEffect(() => {
    const audio = audioRef.current;
    return () => { audio?.pause(); audio?.removeAttribute('src'); if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  function clearGenerated() {
    audioRef.current?.pause(); setAudioUrl(null); setAnnotation('');
    setAiNotice('Review the current passage and question before requesting another interpretation.');
    setAudioNotice('No audio is available for this draft.');
  }

  function choosePassage() {
    const text = select().trim();
    if (!text) return setAiNotice('Select text in the edition, then choose Use selected passage. You can also type or paste a passage below.');
    if (text.length > 12_000) return setAiNotice('Choose a shorter passage of at most 12,000 characters. Your selection has not been sent.');
    clearGenerated(); setPassage(text); setConsent(false); setVoiceConsent(false); setAiNotice('The selected passage is ready for your review. Nothing has been sent.');
  }
  function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!active || busy || !consent || !passage.trim() || passage.length > 12_000 || question.length > 2000) return;
    setAnnotation(''); setAiNotice('Generating an AI interpretation…');
    void run('/api/great-books/annotate', { method: 'POST', body: JSON.stringify({ bookId, passage: passage.trim(), question: question.trim(), thinkerId: thinker }) },
      (response, signal, current) => readAnnotation(response, signal, current, setAnnotation), value => { setAnnotation(value); setAiNotice('AI interpretation complete. This is generated commentary, not a quotation from the author.'); },
      error => { setAnnotation(''); setAiNotice(failureText(error, 'request an AI interpretation')); }, 30_000);
  }
  function generateAudio() {
    if (!active || busy || !voiceConsent || !passage.trim()) return;
    audioRef.current?.pause(); setAudioUrl(null); setAudioNotice('Requesting audio for the previewed passage…');
    void run('/api/tts', { method: 'POST', body: JSON.stringify({ text: passage.trim().slice(0, 450), thinkerId: thinker, consentToVoiceGeneration: true }) }, async response => {
      if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('Audio reply unavailable');
      const blob = await response.blob(); if (!blob.size || blob.size > 5_000_000) throw new Error('Audio reply unavailable'); return blob;
    }, blob => { setAudioUrl(URL.createObjectURL(blob)); setAudioNotice('Audio is ready. Use the player to start playback.'); }, error => setAudioNotice(failureText(error, 'generate audio')), 30_000);
  }
  const disabled = !active || busy;
  return <>
    <SavedReadingTools key={`${bookId}:${metadata.edition.editionId}`} metadata={metadata} currentIndex={currentIndex} frameReady={frameReady} jump={jump} returnSearch={returnSearch} />
    <details className={`${styles.panel} ${styles.details}`}>
      <summary>Optional AI reading tools</summary>
      <p className={styles.help}>These are fictional AI interpretations inspired by historical figures. They are not the author’s words and can be mistaken. Opening these tools or selecting text does not request generation.</p>
      <button type="button" className={styles.button} disabled={!frameReady || disabled} onClick={choosePassage}>Use selected passage</button>
      <form onSubmit={ask}>
        <fieldset disabled={disabled} style={{ border: 0, padding: 0, minWidth: 0 }}>
          <legend className={styles.sectionTitle}>Ask about a passage</legend>
          <label htmlFor="reading-passage" className={styles.label}>Passage to discuss</label>
          <textarea id="reading-passage" className={styles.input} rows={5} required maxLength={12_000} value={passage} onChange={event => { clearGenerated(); setPassage(event.target.value); setConsent(false); setVoiceConsent(false); }} aria-describedby="passage-help" />
          <p id="passage-help" className={styles.help}>Select text above or paste it here. {passage.length.toLocaleString()} of 12,000 characters. Avoid entering private information.</p>
          <label htmlFor="reading-question" className={styles.label}>Your question (optional)</label>
          <textarea id="reading-question" className={styles.input} rows={2} maxLength={2000} value={question} onChange={event => { setAnnotation(''); setQuestion(event.target.value); setConsent(false); }} />
          <label htmlFor="reading-thinker" className={styles.label}>Fictional AI lens</label>
          <select id="reading-thinker" className={styles.input} value={thinker} onChange={event => { clearGenerated(); setThinker(event.target.value); setConsent(false); setVoiceConsent(false); }}>{THINKERS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
          <label className={styles.check}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I choose to send this passage and question to the configured AI service for an interpretation.</label>
          <button type="submit" className={styles.button} disabled={!consent || !passage.trim()}>Request AI interpretation</button>
        </fieldset>
      </form>
      <p role="status" className={styles.status}>{aiNotice}</p>
      {annotation && <div className={styles.aiText} aria-label="Fictional AI interpretation">{annotation}</div>}
      <h3 className={styles.sectionTitle}>Optional generated audio</h3>
      <p className={styles.help}>This separate request sends the first 450 characters of the passage to the configured voice service. The voice is synthetic. Nothing plays automatically.</p>
      {passage.trim() && <blockquote className={styles.help}>{passage.trim().slice(0, 450)}</blockquote>}
      <label className={styles.check}><input type="checkbox" checked={voiceConsent} disabled={disabled} onChange={event => setVoiceConsent(event.target.checked)} />I choose to generate synthetic audio for the previewed passage.</label>
      <button type="button" className={styles.button} disabled={disabled || !voiceConsent || !passage.trim()} onClick={generateAudio}>Generate audio for this passage</button>
      <p role="status" className={styles.status}>{audioNotice}</p>
      {audioUrl && <audio ref={audioRef} className={styles.audio} controls preload="none" src={audioUrl}>Your browser does not support this audio player.</audio>}
    </details>
    {busy && <button type="button" className={styles.button} onClick={cancel}>Stop request and clear private tools</button>}
    {!active && <p className={styles.help}>Return to this tab to use account-based tools. The free edition remains available.</p>}
  </>;
}
