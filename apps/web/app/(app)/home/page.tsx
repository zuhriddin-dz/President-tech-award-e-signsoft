import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { ChevronRight, PenLine } from 'lucide-react';
import type { SignatureRequest } from '@docflow/contracts';
import { Card, CardHeader, ProgressBar, StatusChip } from '@/components/ui/primitives';
import { NewPacketButton } from '@/components/packets/new-packet-button';
import { loadMe, loadRequests, loadTemplates } from '@/lib/queries';
import { relativeTime, shortDate } from '@/lib/format';
import { isExpiringSoon, isLive, statusView } from '@/lib/status';

/**
 * Home — the sender's landing pad. Three questions in one screen: what needs
 * me, where do my packets stand, what do I send most often.
 *
 * The colour sits on the RIGHT, in a dark panel, rather than in a band across
 * the top. That is deliberate: a full-bleed gradient header is the single
 * most recognisable thing about every e-signature dashboard, and moving it
 * also puts the numbers somewhere they stay visible as the feed scrolls.
 */
export default async function HomePage() {
  const [me, requests, templates, user] = await Promise.all([
    loadMe(),
    loadRequests(),
    loadTemplates(),
    currentUser(),
  ]);

  const tenant = me.status === 'ok' ? me.data.tenant : null;
  const greeting =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    tenant?.name ||
    'there';

  const visible = requests.filter((r) => !r.deletedAt);
  const waiting = visible.filter(isLive);
  const expiring = visible.filter((r) => isExpiringSoon(r));

  // "To sign" is work waiting on YOU — a packet where you are the recipient
  // who still has to sign. Anything else belongs in the feed, not here.
  const myEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const toSign = myEmail
    ? waiting.filter(
        (r) => r.recipientEmail.toLowerCase() === myEmail && r.signedCount < r.signerCount,
      )
    : [];

  const favorites = templates.filter((t) => t.favorite).slice(0, 4);
  const shelf = favorites.length > 0 ? favorites : templates.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      {/* Greeting row — one line, one primary action. */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <h1 className="text-2xl font-semibold text-ink">Welcome, {greeting}</h1>
        <NewPacketButton size="lg" />
      </div>

      {/* Only rendered when there IS work. No "you have no tasks" card taking
          up a third of the screen to say nothing. */}
      {toSign.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-wide text-ink uppercase">
            <PenLine className="h-4 w-4 text-brand" />
            Needs your signature
          </h2>
          <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-1">
            {toSign.map((r) => (
              <Link
                key={r.id}
                href={`/requests/${r.id}`}
                className="w-72 shrink-0 rounded-lg border-2 border-brand bg-brand-soft p-4 transition-colors hover:bg-brand-soft-strong"
              >
                <p className="truncate font-semibold text-ink">{r.documentName}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  from {r.senderEmail ?? 'your workspace'} · {relativeTime(r.sentAt)}
                </p>
                <span className="mt-3 inline-block text-sm font-semibold text-brand-link">
                  Open and sign →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left: the feed */}
        <Card className="min-w-0">
          <CardHeader
            title="Packet activity"
            info="Everything sent from this workspace, newest first."
            action={
              <Link
                href="/agreements?view=sent"
                className="text-sm font-semibold text-brand-link hover:underline"
              >
                See all
              </Link>
            }
          />
          {visible.length === 0 ? (
            <div className="px-6 pb-12 text-center">
              <p className="text-lg font-semibold text-ink">Nothing sent yet</p>
              <p className="mt-2 text-sm text-ink-muted">
                Send your first document and its progress appears here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border px-6 pb-2">
              {visible.slice(0, 8).map((r) => (
                <ActivityRow key={r.id} request={r} />
              ))}
            </ul>
          )}
        </Card>

        {/* Right: the dark panel — counters and the templates you reuse. */}
        <aside className="lg:sticky lg:top-22 lg:self-start">
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-hero-from to-hero-to p-6">
            {/* Decorative only — nothing legible sits on the glow itself. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-30 blur-3xl"
              style={{ background: 'var(--color-hero-glow)' }}
            />

            <div className="relative">
              <h2 className="text-sm font-bold tracking-wide text-white uppercase">
                Where things stand
              </h2>
              <dl className="mt-4 flex flex-col">
                {(
                  [
                    ['To sign', toSign.length, '/agreements?view=to-sign'],
                    ['Waiting for others', waiting.length, '/agreements?view=waiting'],
                    ['Expiring soon', expiring.length, '/agreements?view=waiting&expiring=1'],
                  ] as const
                ).map(([label, value, href], i) => (
                  <Link
                    key={label}
                    href={href}
                    className={`flex items-baseline justify-between gap-4 py-3.5 transition-opacity hover:opacity-80 ${
                      i > 0 ? 'border-t border-white/20' : ''
                    }`}
                  >
                    <dt className="text-[15px] text-white">{label}</dt>
                    <dd className="text-3xl font-semibold text-white tabular-nums">{value}</dd>
                  </Link>
                ))}
              </dl>

              <div className="mt-6 border-t border-white/20 pt-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold tracking-wide text-white uppercase">
                    {favorites.length > 0 ? 'Your favourites' : 'Your templates'}
                  </h2>
                  <Link href="/templates" className="text-sm font-semibold text-white hover:underline">
                    All
                  </Link>
                </div>
                {shelf.length === 0 ? (
                  <p className="mt-3 text-sm text-white/80">
                    Nothing yet — upload a document and star it to pin it here.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col">
                    {shelf.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/prepare/${t.id}`}
                          className="flex items-baseline justify-between gap-3 py-2.5 transition-opacity hover:opacity-80"
                        >
                          <span className="min-w-0 flex-1 truncate text-[15px] text-white">
                            {t.name}
                          </span>
                          <span className="shrink-0 text-xs text-white/70">
                            {t.lastUsedAt ? shortDate(t.lastUsedAt) : 'unused'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** One line in the activity feed: what, when, and where it stands. */
function ActivityRow({ request: r }: { request: SignatureRequest }) {
  const view = statusView(r.status);
  const live = isLive(r);

  return (
    <li>
      <Link href={`/requests/${r.id}`} className="group flex items-center gap-6 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink group-hover:text-brand-link">
            {r.documentName}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">{relativeTime(r.lastChangeAt)}</p>
        </div>

        <div className="w-52 shrink-0">
          {live && r.waitingOn ? (
            <>
              <ProgressBar value={r.signedCount} max={Math.max(1, r.signerCount)} />
              <p className="mt-1.5 truncate text-sm text-ink-muted">Waiting for {r.waitingOn}</p>
            </>
          ) : (
            <StatusChip tone={view.tone} label={view.label} icon={view.icon} />
          )}
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 text-ink-muted group-hover:text-ink" />
      </Link>
    </li>
  );
}
