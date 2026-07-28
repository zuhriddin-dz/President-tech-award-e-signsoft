import { Ban, CircleCheck, CircleX, Clock, Send } from 'lucide-react';
import type { SignatureRequest, SignatureStatus } from '@docflow/contracts';
import type { StatusTone } from '@/components/ui/primitives';

/**
 * One status vocabulary for the whole product. Every surface — dashboard feed,
 * agreements table, detail header — reads from here, so an envelope never says
 * "Sent" in one place and "Waiting" in another.
 */
export interface StatusView {
  tone: StatusTone;
  label: string;
  icon: React.ReactNode;
}

const ICON = 'h-4 w-4 shrink-0';

export function statusView(status: SignatureStatus): StatusView {
  switch (status) {
    case 'completed':
      return { tone: 'success', label: 'Completed', icon: <CircleCheck className={ICON} /> };
    case 'viewed':
      return { tone: 'warning', label: 'Viewed', icon: <Clock className={ICON} /> };
    case 'sent':
      return { tone: 'info', label: 'Sent', icon: <Send className={ICON} /> };
    case 'voided':
      return { tone: 'neutral', label: 'Voided', icon: <Ban className={ICON} /> };
    case 'expired':
      return { tone: 'danger', label: 'Expired', icon: <CircleX className={ICON} /> };
  }
}

/** True while the envelope can still be signed by somebody. */
export function isLive(r: Pick<SignatureRequest, 'status'>): boolean {
  return r.status === 'sent' || r.status === 'viewed';
}

/** Live and lapsing within `days` — the "Expiring Soon" quick view. */
export function isExpiringSoon(r: SignatureRequest, days = 3, now = Date.now()): boolean {
  if (!isLive(r)) return false;
  const left = (new Date(r.expiresAt).getTime() - now) / 86_400_000;
  return left <= days;
}
