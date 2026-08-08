import type { SignatureRequest } from '@docflow/contracts';
import { isExpiringSoon, isLive } from '@/lib/status';

/**
 * The quick views, defined once. Each is a pure predicate over the packet
 * list plus the copy for its header and empty state — so the tab strip, the
 * page title, the counts and the filtering can never disagree about what
 * "Completed" means.
 *
 * A PACKET is what we call the thing you send: a document, its fields, and
 * the people who have to deal with it. It is the one coined word in the
 * product — everything around it (Inbox, Sent, Drafts, Completed) is
 * deliberately ordinary, which is what makes one new noun learnable.
 *
 * Ordered by URGENCY, not by lifecycle: what needs you, then what you are
 * waiting on, then the archive.
 */
export type ViewKey =
  | 'to-sign'
  | 'inbox'
  | 'waiting'
  | 'sent'
  | 'drafts'
  | 'completed'
  | 'deleted';

export interface ViewDef {
  key: ViewKey;
  label: string;
  title: string;
  /** Shown when the view has no rows. */
  emptyTitle: string;
  emptyBody: string;
  /** Which secondary filter the header offers. */
  filter: 'status' | 'sender';
}

export const VIEWS: Record<ViewKey, ViewDef> = {
  'to-sign': {
    key: 'to-sign',
    label: 'To Sign',
    title: 'To Sign',
    emptyTitle: "You're all caught up",
    emptyBody:
      "Nothing is waiting on your signature. If you were expecting something and it hasn't arrived, check with whoever sent it — a link that fails to open is usually one that was cancelled or re-issued.",
    filter: 'sender',
  },
  inbox: {
    key: 'inbox',
    label: 'Inbox',
    title: 'Inbox',
    emptyTitle: 'Your inbox is empty',
    emptyBody:
      'Documents sent to your email address appear here. Documents you send live under Sent.',
    filter: 'sender',
  },
  waiting: {
    key: 'waiting',
    label: 'Waiting for Others',
    title: 'Waiting for Others',
    emptyTitle: 'Nobody owes you a signature',
    emptyBody: 'Every packet you have sent has been dealt with.',
    filter: 'status',
  },
  sent: {
    key: 'sent',
    label: 'Sent',
    title: 'Sent',
    emptyTitle: 'Nothing sent yet',
    emptyBody: 'Send your first document and it will appear here with its live status.',
    filter: 'status',
  },
  drafts: {
    key: 'drafts',
    label: 'Drafts',
    title: 'Drafts',
    emptyTitle: 'No drafts',
    emptyBody: 'Documents you have prepared but never sent show up here, ready to go out.',
    filter: 'status',
  },
  completed: {
    key: 'completed',
    label: 'Completed',
    title: 'Completed',
    emptyTitle: 'No completed packets yet',
    emptyBody: 'Once every signer finishes, the sealed copy lands here.',
    filter: 'sender',
  },
  deleted: {
    key: 'deleted',
    label: 'Deleted',
    title: 'Deleted',
    emptyTitle: 'Nothing deleted',
    emptyBody:
      'Deleting only hides a packet from your other views — the signed copy and its audit trail are always kept.',
    filter: 'status',
  },
};

/** Tab order. One flat strip: no overflow menu, nothing hidden behind "more". */
export const VIEW_ORDER: ViewKey[] = [
  'to-sign',
  'inbox',
  'waiting',
  'sent',
  'drafts',
  'completed',
  'deleted',
];

export function isViewKey(value: string | undefined): value is ViewKey {
  return value !== undefined && value in VIEWS;
}

/**
 * Rows for a view. `myEmail` is the signed-in user's verified address — the
 * only thing that can decide whether a packet is addressed to THEM rather
 * than merely visible to their workspace.
 */
export function selectRows(
  view: ViewKey,
  all: SignatureRequest[],
  myEmail: string | null,
): SignatureRequest[] {
  const alive = all.filter((r) => !r.deletedAt);
  const mine = (r: SignatureRequest) =>
    myEmail !== null && r.recipientEmail.toLowerCase() === myEmail;

  switch (view) {
    case 'to-sign':
      return alive.filter((r) => mine(r) && isLive(r) && r.signedCount < r.signerCount);
    case 'inbox':
      return alive.filter(mine);
    case 'waiting':
      return alive.filter(isLive);
    case 'sent':
      return alive;
    case 'completed':
      return alive.filter((r) => r.status === 'completed');
    case 'deleted':
      return all.filter((r) => r.deletedAt);
    // Drafts are prepared documents, not packets — the page renders them
    // from the template list instead.
    case 'drafts':
      return [];
  }
}

/** "Expiring soon" is a FILTER now, not a view — it composes with any tab. */
export function applyExpiringFilter(
  rows: SignatureRequest[],
  only: boolean,
): SignatureRequest[] {
  return only ? rows.filter((r) => isExpiringSoon(r)) : rows;
}
