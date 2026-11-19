import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from '../../../platforms/tests/load-source.mjs';

const load = sourceLoader();
const study = load('lib/fellowship/study.ts');
const ancient = load('lib/fellowship/ancient-text.ts');
const plain = value => JSON.parse(JSON.stringify(value));

test('Every connection resolves exact verse ranges and declared sources', () => {
  const ids = new Set();
  for (const claim of study.STUDY_CLAIMS) {
    assert(!ids.has(claim.id)); ids.add(claim.id);
    for (const reference of claim.references) {
      const passage = study.getPassage(reference.passageId);
      assert(passage);
      assert.deepEqual(plain(passage.verses.filter(v => v.verse >= reference.first && v.verse <= reference.last).map(v => v.verse)),
        Array.from({ length: reference.last - reference.first + 1 }, (_, n) => reference.first + n));
    }
    for (const id of claim.sources) assert.equal(new URL(study.STUDY_SOURCES[id].href).protocol, 'https:');
  }
  assert.equal(ids.size, 9);
});

test('The study keeps quotation, allusion, comparison and textual variant distinct', () => {
  const claims = Object.fromEntries(study.STUDY_CLAIMS.map(c => [c.id, c]));
  assert.equal(claims['cry-of-abandonment'].relationship, 'quotation');
  assert.equal(claims['mockery-and-trust'].relationship, 'allusion');
  assert.equal(claims['burial-with-a-rich-man'].relationship, 'comparison');
  assert.equal(claims['hands-and-feet'].relationship, 'textual issue');
  assert.equal(claims['healing-application'].relationship, 'quotation');
  assert.match(claims['healing-application'].limit, /not a crucifixion quotation/);
});

test('The complete lament and servant context are present alongside four passion chapters', () => {
  for (const [id, size] of [['psalm-22', 31], ['isaiah-52', 15], ['isaiah-53', 12], ['isaiah-54', 17],
    ['matthew-27', 66], ['mark-15', 47], ['luke-23', 56], ['john-19', 42]]) {
    const passage = study.getPassage(id);
    assert.equal(passage.extent, 'Complete chapter'); assert.equal(passage.verses.length, size);
    assert.match(passage.sourceSha256, /^[a-f0-9]{64}$/);
  }
  assert.match(study.getPassage('psalm-22').superscription, /Chief Musician/);
  assert.match(study.getPassage('psalm-22').superscription, /Psalm by David/);
});

test('A publisher omission remains empty and its complete variant stays in the footnote', () => {
  const passage = study.getPassage('acts-8');
  assert.equal(passage.verses.find(v => v.verse === 37).text, '');
  assert.match(passage.footnotes.find(n => n.verse === 37).text, /^TR adds Philip said/);
  assert.match(passage.footnotes.find(n => n.verse === 37).text, /Jesus Christ is the Son of God/);
  assert(study.getPassage('psalm-22').footnotes.some(n => n.verse === 16 && n.text.includes('Masoretic')));
});

test('A correction requires a changed analysis and a reason, with bounded input', () => {
  const claim = study.STUDY_CLAIMS[0];
  for (const [text, reason] of [['', 'reason'], ['changed', ''], [claim.observation, 'reason'],
    ['x'.repeat(6001), 'reason'], ['changed', 'x'.repeat(3001)]]) assert.equal(study.correctionProposal(claim, text, reason), null);
  assert(study.correctionProposal(claim, 'x'.repeat(6000), 'x'.repeat(3000)));
});

test('A proposal preserves provenance without publishing or changing Scripture', () => {
  const claim = study.STUDY_CLAIMS[0], original = JSON.stringify(study.SCRIPTURE_PASSAGES);
  const proposal = study.correctionProposal(claim, 'My revised analysis.', 'Check the passage in context.');
  assert.equal(proposal.claimId, claim.id); assert.equal(proposal.sourceRevision, study.STUDY_REVISION);
  assert.equal(proposal.originalAnalysis, claim.observation); assert.equal(proposal.published, false);
  assert.equal(proposal.scriptureChanged, false); assert.equal(proposal.scope, 'local proposal');
  assert.deepEqual(plain(proposal.sourceIds), plain(claim.sources));
  assert.deepEqual(plain(proposal.sourceReferences.map(source => source.id)), plain(claim.sources));
  assert(proposal.sourceReferences.every(source => new URL(source.href).protocol === 'https:'));
  proposal.sourceIds.push('LOCAL_ONLY');
  assert(!claim.sources.includes('LOCAL_ONLY')); assert.equal(JSON.stringify(study.SCRIPTURE_PASSAGES), original);
});

test('Research identifiers separate the verified text and preprint from a discovery claim', () => {
  assert.match(ancient.ANCIENT_TEXT_PAPER.locus, /18\.63–64/);
  assert.equal(ancient.ANCIENT_TEXT_PAPER.date, '15 August 2026');
  assert.equal(ancient.ANCIENT_TEXT_PAPER.doi, '10.5281/zenodo.21945637');
  assert(ancient.ANCIENT_TEXT_SOURCES.some(s => s.id === 'preprint' && /Preprint/.test(s.note)));
  assert.match(ancient.DOSSIER_ANALYSES[0].observation, /does not establish that a new first-century manuscript/);
});

test('The received translation retains disputed clauses rather than silently reconstructing them', () => {
  assert.match(ancient.WHISTON_PASSAGE, /if it be lawful to call him a man/);
  assert.match(ancient.WHISTON_PASSAGE, /He was \[the\] Christ/);
  assert.match(ancient.WHISTON_PASSAGE, /alive again the third day/);
  assert(ancient.ANCIENT_TEXT_SOURCES.some(s => s.id === 'whiston-rights' && /USA/.test(s.title)));
});

test('Witness chronology includes earlier quotation copies and later Greek Antiquities copies', () => {
  assert(ancient.TEXT_WITNESSES.some(w => /411 CE/.test(w.copy) && /quotation/.test(w.distinction)));
  assert(ancient.TEXT_WITNESSES.some(w => /462 CE/.test(w.copy) && /quotation/.test(w.distinction)));
  assert(ancient.TEXT_WITNESSES.some(w => /Greek Antiquities/.test(w.work) && /11th century/.test(w.copy)));
  assert(ancient.TEXT_WITNESSES.some(w => /Theophany/.test(w.work) && /disputed/.test(w.composition)));
  assert(ancient.TEXT_WITNESSES.some(w => /Michael/.test(w.work) && /1195/.test(w.composition) && /1598/.test(w.copy)));
  for (const source of ancient.ANCIENT_TEXT_SOURCES) {
    assert.equal(new URL(source.href).protocol, 'https:');
    assert(!source.href.includes('chatgpt.com/c/'));
  }
});

test('Export refuses unknown or unsafe references and includes dossier source URLs', () => {
  const claim = study.STUDY_CLAIMS[0];
  assert.equal(study.correctionProposal({ ...claim, sources: ['unknown'] }, 'Changed.', 'Reason.'), null);
  assert.equal(study.correctionProposal({ ...claim, sources: ['bad'], sourceLinks: [{ id: 'bad', title: 'bad', href: 'javascript:alert(1)' }] }, 'Changed.', 'Reason.'), null);
  const analysis = { ...ancient.DOSSIER_ANALYSES[0], sourceLinks: ancient.ANCIENT_TEXT_SOURCES };
  const proposal = study.correctionProposal(analysis, 'Revised paper analysis.', 'Check the manuscript distinction.');
  assert(proposal); assert(proposal.sourceReferences.some(source => source.href === 'https://zenodo.org/records/21945637'));
});
