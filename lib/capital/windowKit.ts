import {
  buildCapitalPrepReadiness,
  buildCapitalPrepReceipt,
  type CapitalPrepReadiness,
  type CapitalPrepReceipt,
} from '@/lib/capital/prepReceipts';

export const WINDOW_KIT_QR_URL =
  'https://www.societyofexplorers.com/92b/fund?utm_source=92b_window&utm_medium=qr&utm_campaign=92b_founding_node';

export const WINDOW_KIT_QR_ASSET = '/images/92b-window-qr.svg';

export const WINDOW_KIT_DOCS = [
  {
    label: 'Window activation draft',
    path: '/Users/christaylor/society-of-explorers/docs/92b-window-activation.md',
  },
  {
    label: 'Printable sign draft',
    path: '/Users/christaylor/society-of-explorers/docs/92b-window-sign.html',
  },
  {
    label: 'Patron note draft',
    path: '/Users/christaylor/society-of-explorers/docs/92b-patron-note.md',
  },
  {
    label: 'Founder outreach drafts',
    path: '/Users/christaylor/society-of-explorers/docs/92b-founder-outreach-drafts.md',
  },
];

export const WINDOW_KIT_SIGN = {
  eyebrow: 'Society of Explorers',
  headline: 'The first Society of Explorers node may begin here.',
  subhead:
    'A private, human-centric AI network for philosophy, sovereign data, personal AI mirrors, and real community rituals.',
  campaign:
    'We are raising toward $120,000 to secure and build the first Boston physical node if lease terms, repairs, access, and landlord alignment make the path viable.',
  cta: 'Become a founding patron',
  displayUrl: 'societyofexplorers.com/92b/fund',
  footer:
    'Patronage gives access, recognition, community artifacts, and ritual priority. It is not equity, debt, a security, or a promise of financial return.',
};

export const WINDOW_KIT_PATRON_NOTE = [
  'Society of Explorers is building a private, human-centric AI network: daily philosophical practice, personal AI mirrors, encrypted memory, Great Thinker personas, creator rituals, and sovereign data pods owned by members instead of platforms.',
  'The Boston storefront is the intended first physical node. It is a prominent location with history, but it should be described carefully: the space is not being represented as secured, repaired, permitted, or ready.',
  'The first use of successful patronage funds is to make a serious run at securing the location and planning the buildout if lease status, repairs, access, and landlord alignment make that responsible.',
  'Patrons are not buying equity, debt, securities, dividends, or a promise of financial return. They receive recognition, access, founding status, ritual priority, membership credits, and community artifacts according to tier.',
  'If this location becomes viable, it becomes the first Society of Explorers room. If it does not, the campaign still funds the same mission: a privacy-first network where humans use AI to become more sovereign, more thoughtful, and more connected.',
];

export const WINDOW_KIT_APPROVAL_CHECKLIST = [
  'Confirm the exact QR destination and UTM values.',
  'Review the sign copy for conditional location language.',
  'Review the patron note for no equity, debt, securities, guaranteed return, secured lease, or finalized buildout claims.',
  'Decide whether the window should include only the sign or also a founder-wall teaser.',
  'Approve physical placement before printing or putting anything in the storefront window.',
  'Approve landlord conversation script before contacting the landlord.',
];

export type CapitalWindowKit = {
  generatedAt: string;
  status: 'draft_for_approval';
  noExternalActionBoundary: string;
  qr: {
    url: string;
    asset: string;
  };
  sign: typeof WINDOW_KIT_SIGN;
  patronNote: string[];
  approvalChecklist: string[];
  docs: typeof WINDOW_KIT_DOCS;
  readiness: CapitalPrepReadiness;
  prepReceipt: CapitalPrepReceipt;
};

export function buildWindowKit(generatedAt = new Date().toISOString()): CapitalWindowKit {
  return {
    generatedAt,
    status: 'draft_for_approval',
    noExternalActionBoundary:
      'Do not print, place, publish, send, contact the landlord, or claim the location is secured without explicit approval.',
    qr: {
      url: WINDOW_KIT_QR_URL,
      asset: WINDOW_KIT_QR_ASSET,
    },
    sign: WINDOW_KIT_SIGN,
    patronNote: WINDOW_KIT_PATRON_NOTE,
    approvalChecklist: WINDOW_KIT_APPROVAL_CHECKLIST,
    docs: WINDOW_KIT_DOCS,
    readiness: buildCapitalPrepReadiness(),
    prepReceipt: buildCapitalPrepReceipt({
      action: 'window_kit_prepared',
      generatedAt,
      allowedUse: 'Review QR destination, sign copy, patron note, and physical activation approvals before any public or physical action.',
      detail: 'Prepared the private window kit locally. No printing, placement, landlord contact, messages, charges, deploys, or publishing occurred.',
    }),
  };
}
