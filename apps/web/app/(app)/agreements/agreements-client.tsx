'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Columns3,
  Download,
  EllipsisVertical,
  FolderInput,
  FolderPlus,
  Folder as FolderIcon,
  PenLine,
  RotateCcw,
  Send,
  Sheet,
  Trash2,
  UserRoundCog,
} from 'lucide-react';
import type { Folder, SignatureRequest, SignatureStatus, TemplateSummary } from '@docflow/contracts';
import { Button, EmptyState, StatusChip, Td, Th } from '@/components/ui/primitives';
import {
  Checkbox,
  Dropdown,
  MenuDivider,
  MenuItem,
  Modal,
  SearchInput,
  SelectChip,
  TextField,
} from '@/components/ui/overlays';
import { NewPacketButton } from '@/components/packets/new-packet-button';
import { displayName, relativeTime, shortDate } from '@/lib/format';
import { isLive, statusView } from '@/lib/status';
import {
  createFolder,
  deleteRequests,
  moveToFolder,
  restoreRequests,
  signedPdfUrl,
} from '@/lib/client';
import { VIEWS, VIEW_ORDER, applyExpiringFilter, selectRows, type ViewKey } from './views';

/** Date-range options for the filter bar. */
const RANGES = [
  { key: '1d', label: 'Last 24 Hours', days: 1 },
  { key: '7d', label: 'Last 7 Days', days: 7 },
  { key: '30d', label: 'Last 30 Days', days: 30 },
  { key: '6m', label: 'Last 6 Months', days: 183 },
  { key: '12m', label: 'Last 12 Months', days: 365 },
  { key: 'all', label: 'All Time', days: null },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const STATUSES: SignatureStatus[] = ['sent', 'viewed', 'completed', 'voided', 'expired'];

const COLUMNS = [
  { key: 'stands', label: 'Where it stands' },
  { key: 'sender', label: 'Sender' },
] as const;
type ColumnKey = (typeof COLUMNS)[number]['key'];

export function AgreementsClient({
  view,
  folderId,
  expiringOnly,
  requests,
  templates,
  folders,
  myEmail,
}: {
  view: ViewKey;
  folderId: string | null;
  expiringOnly: boolean;
  requests: SignatureRequest[];
  templates: TemplateSummary[];
  folders: Folder[];
  myEmail: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<RangeKey>('6m');
  const [status, setStatus] = useState<SignatureStatus | 'all'>('all');
  const [sender, setSender] = useState<string | 'all'>('all');
  const [expiring, setExpiring] = useState(expiringOnly);
  const [advanced, setAdvanced] = useState({ recipient: '', document: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(['stands']));
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = VIEWS[view];
  const isDrafts = view === 'drafts';
  const isDeleted = view === 'deleted';
  const activeFolder = folders.find((f) => f.id === folderId) ?? null;

  const senders = useMemo(
    () => [...new Set(requests.map((r) => r.senderEmail).filter((s): s is string => Boolean(s)))],
    [requests],
  );

  const rows = useMemo(() => {
    let base = selectRows(view, requests, myEmail);
    if (folderId) base = base.filter((r) => r.folderId === folderId);
    base = applyExpiringFilter(base, expiring);

    const cutoff = RANGES.find((r) => r.key === range)?.days;
    if (cutoff !== null && cutoff !== undefined) {
      const since = Date.now() - cutoff * 86_400_000;
      base = base.filter((r) => new Date(r.lastChangeAt).getTime() >= since);
    }
    if (status !== 'all') base = base.filter((r) => r.status === status);
    if (sender !== 'all') base = base.filter((r) => r.senderEmail === sender);

    const q = query.trim().toLowerCase();
    if (q) {
      base = base.filter(
        (r) =>
          r.documentName.toLowerCase().includes(q) || r.recipientEmail.toLowerCase().includes(q),
      );
    }
    const rec = advanced.recipient.trim().toLowerCase();
    if (rec) base = base.filter((r) => r.recipientEmail.toLowerCase().includes(rec));
    const doc = advanced.document.trim().toLowerCase();
    if (doc) base = base.filter((r) => r.documentName.toLowerCase().includes(doc));

    return [...base].sort(
      (a, b) => new Date(b.lastChangeAt).getTime() - new Date(a.lastChangeAt).getTime(),
    );
  }, [view, requests, myEmail, folderId, expiring, range, status, sender, query, advanced]);

  // Drafts are prepared documents never sent — real work waiting to go out.
  const draftRows = useMemo(() => {
    if (!isDrafts) return [];
    const q = query.trim().toLowerCase();
    return templates
      .filter((t) => t.lastUsedAt === null)
      .filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [isDrafts, templates, query]);

  const counts: Partial<Record<ViewKey, number>> = useMemo(() => {
    const out: Partial<Record<ViewKey, number>> = {};
    for (const key of VIEW_ORDER) {
      const n =
        key === 'drafts'
          ? templates.filter((t) => t.lastUsedAt === null).length
          : selectRows(key, requests, myEmail).length;
      if (n > 0) out[key] = n;
    }
    return out;
  }, [requests, templates, myEmail]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const dirty =
    query !== '' ||
    range !== '6m' ||
    status !== 'all' ||
    sender !== 'all' ||
    expiring ||
    advanced.recipient !== '' ||
    advanced.document !== '';

  function clearAll() {
    setQuery('');
    setRange('6m');
    setStatus('all');
    setSender('all');
    setExpiring(false);
    setAdvanced({ recipient: '', document: '' });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  /** Export exactly what the table currently shows — filters and all. */
  function exportCsv() {
    const chosen = rows.filter((r) => selected.has(r.id));
    const data = chosen.length > 0 ? chosen : rows;
    const head = ['Name', 'To', 'Status', 'Signed', 'Signers', 'Sent', 'Last change', 'Folder', 'Sender'];
    const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      head.map(cell).join(','),
      ...data.map((r) =>
        [
          r.documentName,
          r.recipientEmail,
          r.status,
          r.signedCount,
          r.signerCount,
          r.sentAt,
          r.lastChangeAt,
          r.folderName ?? '',
          r.senderEmail ?? '',
        ]
          .map(cell)
          .join(','),
      ),
    ].join('\r\n');

    // Lead with a UTF-8 BOM or Excel mangles any non-ASCII name on open.
    // Built from a code point rather than pasted, so no editor or transfer
    // encoding can silently eat it.
    const bom = String.fromCharCode(0xfeff);
    const url = URL.createObjectURL(new Blob([bom + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `docflow-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] px-6 py-6">
      {/* Header: title, filing, visibility, and the one primary action. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-ink">
          {activeFolder ? activeFolder.name : def.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <Dropdown
            align="end"
            trigger={(open) => (
              <SelectChip
                label={activeFolder ? `Folder: ${activeFolder.name}` : 'Folders'}
                open={open}
              />
            )}
          >
            <MenuItem href={`/agreements?view=${view}`} selected={folderId === null}>
              All documents
            </MenuItem>
            {folders.length > 0 && <MenuDivider />}
            {folders.map((f) => (
              <MenuItem
                key={f.id}
                href={`/agreements?view=${view}&folder=${f.id}`}
                selected={folderId === f.id}
                icon={<FolderIcon className="h-4 w-4" />}
              >
                {f.name} {f.count > 0 ? `(${f.count})` : ''}
              </MenuItem>
            ))}
            <MenuDivider />
            <MenuItem icon={<FolderPlus className="h-4 w-4" />} onClick={() => setNewFolder(true)}>
              New folder…
            </MenuItem>
          </Dropdown>

          <Dropdown align="end" trigger={(open) => <SelectChip label="Visibility" open={open} />}>
            <div className="max-w-xs px-4 py-3 text-sm text-ink-muted">
              Everyone in this workspace already sees these documents — access follows workspace
              membership, not a per-document share.
            </div>
            <MenuDivider />
            <MenuItem href="/admin">Manage members</MenuItem>
          </Dropdown>

          <NewPacketButton />
        </div>
      </div>

      {/* One flat tab strip. Nothing hidden behind "Show more". */}
      <nav className="no-scrollbar mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {VIEW_ORDER.map((key) => {
          const active = key === view;
          const count = counts[key];
          return (
            <Link
              key={key}
              href={`/agreements?view=${key}${folderId ? `&folder=${folderId}` : ''}`}
              aria-current={active ? 'page' : undefined}
              className={`relative flex shrink-0 items-center gap-2 px-4 py-3 text-[15px] whitespace-nowrap transition-colors ${
                active ? 'font-semibold text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {VIEWS[key].label}
              {count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    active ? 'bg-brand-soft-strong text-ink' : 'bg-surface-sunken text-ink-muted'
                  }`}
                >
                  {count}
                </span>
              )}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-brand" />}
            </Link>
          );
        })}
      </nav>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <SearchInput
          className="w-full max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={isDrafts ? 'Search drafts' : `Search ${def.title}`}
        />

        <Dropdown
          trigger={(open) => (
            <SelectChip label={`Date: ${RANGES.find((r) => r.key === range)?.label}`} open={open} />
          )}
        >
          {RANGES.map((r) => (
            <MenuItem key={r.key} selected={range === r.key} onClick={() => setRange(r.key)}>
              {r.label}
            </MenuItem>
          ))}
        </Dropdown>

        {def.filter === 'status' ? (
          <Dropdown
            trigger={(open) => (
              <SelectChip label={status === 'all' ? 'Status' : statusView(status).label} open={open} />
            )}
          >
            <MenuItem selected={status === 'all'} onClick={() => setStatus('all')}>
              Any status
            </MenuItem>
            <MenuDivider />
            {STATUSES.map((s) => (
              <MenuItem key={s} selected={status === s} onClick={() => setStatus(s)}>
                {statusView(s).label}
              </MenuItem>
            ))}
          </Dropdown>
        ) : (
          <Dropdown
            trigger={(open) => (
              <SelectChip label={sender === 'all' ? 'Sender' : displayName(null, sender)} open={open} />
            )}
          >
            <MenuItem selected={sender === 'all'} onClick={() => setSender('all')}>
              Anyone
            </MenuItem>
            <MenuDivider />
            {senders.length === 0 ? (
              <MenuItem disabled>No senders yet</MenuItem>
            ) : (
              senders.map((s) => (
                <MenuItem key={s} selected={sender === s} onClick={() => setSender(s)}>
                  {s}
                </MenuItem>
              ))
            )}
          </Dropdown>
        )}

        {/* Was a whole navigation entry; it is a filter, so it composes with
            whichever tab you are on instead of replacing it. */}
        {!isDrafts && (
          <button
            type="button"
            onClick={() => setExpiring((v) => !v)}
            aria-pressed={expiring}
            className={`inline-flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
              expiring
                ? 'border-warning bg-warning-soft text-warning'
                : 'border-border-strong text-ink hover:bg-surface-muted'
            }`}
          >
            Expiring soon
          </button>
        )}

        <Dropdown
          menuClassName="w-80 p-4"
          trigger={(open) => <SelectChip label="Advanced search" open={open} />}
        >
          {/* Stop the menu's close-on-click so typing doesn't dismiss it. */}
          <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <TextField
              label="Recipient email contains"
              value={advanced.recipient}
              onChange={(v) => setAdvanced((a) => ({ ...a, recipient: v }))}
              placeholder="name@company.com"
            />
            <TextField
              label="Document name contains"
              value={advanced.document}
              onChange={(v) => setAdvanced((a) => ({ ...a, document: v }))}
              placeholder="Agreement"
            />
          </div>
        </Dropdown>

        {dirty && (
          <button
            type="button"
            onClick={clearAll}
            className="text-sm font-semibold text-brand-link hover:underline"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && !isDrafts && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <span className="text-sm font-semibold text-ink">{selected.size} Selected</span>

          <Dropdown
            trigger={(open) => (
              <span
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium text-ink ${
                  open ? 'border-brand' : 'border-border-strong'
                }`}
              >
                <FolderInput className="h-4 w-4" />
                File
                <ChevronDown className="h-4 w-4 text-ink-muted" />
              </span>
            )}
          >
            {folders.length === 0 ? (
              <MenuItem onClick={() => setNewFolder(true)}>Create a folder first…</MenuItem>
            ) : (
              folders.map((f) => (
                <MenuItem key={f.id} onClick={() => run(() => moveToFolder([...selected], f.id))}>
                  {f.name}
                </MenuItem>
              ))
            )}
            <MenuDivider />
            <MenuItem onClick={() => run(() => moveToFolder([...selected], null))}>
              Remove from folder
            </MenuItem>
          </Dropdown>

          <Dropdown
            align="start"
            trigger={() => (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-ink">
                <EllipsisVertical className="h-4 w-4" />
              </span>
            )}
          >
            <MenuItem disabled icon={<UserRoundCog className="h-4 w-4" />}>
              Transfer ownership — needs a second member
            </MenuItem>
            <MenuItem icon={<Sheet className="h-4 w-4" />} onClick={exportCsv}>
              Export as CSV
            </MenuItem>
            <MenuDivider />
            {isDeleted ? (
              <MenuItem
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => run(() => restoreRequests([...selected]))}
              >
                Restore
              </MenuItem>
            ) : (
              <MenuItem
                danger
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => run(() => deleteRequests([...selected]))}
              >
                Delete
              </MenuItem>
            )}
          </Dropdown>

          {busy && <span className="text-sm text-ink-muted">Working…</span>}
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      )}

      {/* Rows */}
      <div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
        {isDrafts ? (
          <DraftsTable rows={draftRows} def={def} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={def.emptyTitle}
            body={def.emptyBody}
            action={
              dirty ? (
                <Button variant="secondary" className="mt-2" onClick={clearAll}>
                  Clear the filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th className="w-12">
                  <Checkbox
                    label="Select all"
                    checked={allSelected}
                    indeterminate={selected.size > 0}
                    onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </Th>
                <Th>Name</Th>
                {visibleCols.has('stands') && <Th>Where it stands</Th>}
                {visibleCols.has('sender') && <Th>Sender</Th>}
                <Th className="w-52 text-right">
                  <Dropdown
                    align="end"
                    className="inline-block"
                    trigger={() => (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken">
                        <Columns3 className="h-5 w-5" />
                      </span>
                    )}
                  >
                    <div className="px-4 py-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
                      Columns
                    </div>
                    {COLUMNS.map((c) => (
                      <MenuItem
                        key={c.key}
                        selected={visibleCols.has(c.key)}
                        onClick={() =>
                          setVisibleCols((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.key)) next.delete(c.key);
                            else next.add(c.key);
                            return next;
                          })
                        }
                      >
                        {c.label}
                      </MenuItem>
                    ))}
                  </Dropdown>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sv = statusView(r.status);
                const checked = selected.has(r.id);
                const yours = myEmail !== null && r.recipientEmail.toLowerCase() === myEmail;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border transition-colors last:border-b-0 ${
                      checked ? 'bg-brand-soft-strong' : 'hover:bg-brand-soft'
                    }`}
                  >
                    <Td>
                      <Checkbox
                        label={`Select ${r.documentName}`}
                        checked={checked}
                        onChange={() => toggle(r.id)}
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/requests/${r.id}`}
                        className={`text-ink hover:text-brand-link ${checked ? 'font-semibold' : 'font-medium'}`}
                      >
                        {r.documentName}
                      </Link>
                      <p className="mt-0.5 text-sm text-ink-muted">
                        To: {displayName(r.recipientName, r.recipientEmail)}
                        {r.signerCount > 1 && ` +${r.signerCount - 1}`}
                      </p>
                    </Td>
                    {visibleCols.has('stands') && (
                      <Td>
                        <StatusChip tone={sv.tone} label={sv.label} icon={sv.icon} />
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {r.waitingOn ? `Waiting for ${r.waitingOn} · ` : ''}
                          {relativeTime(r.lastChangeAt)}
                        </p>
                      </Td>
                    )}
                    {visibleCols.has('sender') && (
                      <Td className="text-ink-muted">{r.senderEmail ?? '—'}</Td>
                    )}
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <RowAction request={r} yours={yours} />
                        <Dropdown
                          align="end"
                          trigger={() => (
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken">
                              <EllipsisVertical className="h-4 w-4" />
                            </span>
                          )}
                        >
                          <MenuItem href={`/requests/${r.id}`}>Open details</MenuItem>
                          {r.hasSignedPdf && (
                            <MenuItem href={signedPdfUrl(r.id)}>Download signed copy</MenuItem>
                          )}
                          <MenuDivider />
                          <MenuItem disabled>
                            {r.folderName ? `Filed in ${r.folderName}` : 'Not filed'}
                          </MenuItem>
                          {folders.map((f) => (
                            <MenuItem
                              key={f.id}
                              selected={r.folderId === f.id}
                              onClick={() => run(() => moveToFolder([r.id], f.id))}
                            >
                              File in {f.name}
                            </MenuItem>
                          ))}
                          <MenuDivider />
                          {r.deletedAt ? (
                            <MenuItem onClick={() => run(() => restoreRequests([r.id]))}>
                              Restore
                            </MenuItem>
                          ) : (
                            <MenuItem danger onClick={() => run(() => deleteRequests([r.id]))}>
                              Delete
                            </MenuItem>
                          )}
                        </Dropdown>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {newFolder && (
        <Modal
          title="New folder"
          size="sm"
          onClose={() => setNewFolder(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setNewFolder(false)}>
                Cancel
              </Button>
              <Button
                disabled={!folderName.trim() || busy}
                onClick={() =>
                  run(async () => {
                    await createFolder(folderName.trim());
                    setFolderName('');
                    setNewFolder(false);
                  })
                }
              >
                Create folder
              </Button>
            </>
          }
        >
          <div className="px-7 py-6">
            <TextField
              label="Folder name"
              value={folderName}
              onChange={setFolderName}
              placeholder="Client contracts"
              maxLength={120}
              required
            />
            <p className="mt-3 text-sm text-ink-muted">
              Folders organise your documents. They never change who can see one — that is
              decided by workspace membership.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * ONE action per row, chosen by what the row actually needs next. The old
 * table had a Download button on every row including the ones with nothing to
 * download; this replaces that dead slot with the thing you'd click.
 */
function RowAction({ request: r, yours }: { request: SignatureRequest; yours: boolean }) {
  if (r.status === 'completed') {
    return r.hasSignedPdf ? (
      <a href={signedPdfUrl(r.id)} download>
        <Button variant="secondary" size="sm">
          <Download className="h-4 w-4" />
          Download
        </Button>
      </a>
    ) : (
      <span className="text-sm text-ink-faint">Preparing…</span>
    );
  }
  if (isLive(r) && yours) {
    return (
      <Link href={`/requests/${r.id}`}>
        <Button size="sm">
          <PenLine className="h-4 w-4" />
          Sign
        </Button>
      </Link>
    );
  }
  if (isLive(r)) {
    return (
      <Link href={`/requests/${r.id}`}>
        <Button variant="secondary" size="sm">
          <Send className="h-4 w-4" />
          Remind
        </Button>
      </Link>
    );
  }
  return <span className="text-sm text-ink-faint">—</span>;
}

/** Drafts view: documents prepared but never sent. */
function DraftsTable({
  rows,
  def,
}: {
  rows: TemplateSummary[];
  def: { emptyTitle: string; emptyBody: string };
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title={def.emptyTitle}
        body={def.emptyBody}
        action={
          <Link href="/templates?new=1" className="mt-2">
            <Button variant="dark">Upload a document</Button>
          </Link>
        }
      />
    );
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <Th>Name</Th>
          <Th>Pages</Th>
          <Th>Created</Th>
          <Th className="w-40 text-right">&nbsp;</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-brand-soft">
            <Td>
              <Link href={`/prepare/${t.id}`} className="font-medium text-ink hover:text-brand-link">
                {t.name}
              </Link>
              <p className="mt-0.5 text-sm text-ink-muted">Never sent</p>
            </Td>
            <Td className="text-ink-muted">{t.pageCount}</Td>
            <Td className="text-ink-muted">{shortDate(t.createdAt)}</Td>
            <Td className="text-right">
              <Link href={`/prepare/${t.id}`}>
                <Button variant="secondary" size="sm">
                  Continue
                </Button>
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
