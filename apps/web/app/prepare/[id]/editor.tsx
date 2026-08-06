'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardPaste,
  Copy,
  EllipsisVertical,
  Redo2,
  Search,
  Settings,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { FieldType, RoutingMode, Template } from '@docflow/contracts';
import { Avatar, Button, IconButton } from '@/components/ui/primitives';
import { Dropdown, MenuDivider, MenuItem } from '@/components/ui/overlays';
import {
  DEFAULT_OPTIONS,
  FIELD_CATALOG,
  FIELD_GROUPS,
  FIELD_META,
  isChoice,
  type FieldGroup,
} from '@/lib/field-catalog';
import { documentPdfUrl, sendSignatureRequest, updateTemplate } from '@/lib/client';
import { usePdf } from '@/lib/use-pdf';
import { PdfPage } from './pdf-page';
import { SetupStep } from './setup-step';
import { FieldProperties } from './field-properties';
import { SendReview } from './send-review';
import {
  blankRecipient,
  indexOfKey,
  recipientLabel,
  rolesInFields,
  type EditorRecipient,
} from './recipients';

/** A field as the editor holds it — the contract shape plus a client id. */
export interface EditorField {
  id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
  recipientKey: string;
  options?: string[];
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.37, 1.5, 2, 2.5, 3];
const HISTORY_LIMIT = 60;

type Step = 'setup' | 'fields';

export function TemplateEditor({ template }: { template: Template }) {
  const router = useRouter();
  const { pdf, error: pdfError } = usePdf(documentPdfUrl(template.documentId));

  const [step, setStep] = useState<Step>('setup');
  const [name, setName] = useState(template.name);
  const [fields, setFields] = useState<EditorField[]>(() => template.fields.map((f) => ({ ...f })));
  const [recipients, setRecipients] = useState<EditorRecipient[]>(() =>
    Array.from({ length: rolesInFields(template.fields) }, (_, i) => blankRecipient(i)),
  );
  const [routingMode, setRoutingMode] = useState<RoutingMode>('parallel');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [activeKey, setActiveKey] = useState('signer');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(4); // 1.37×, matching the reference
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [showThumbs, setShowThumbs] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reviewing, setReviewing] = useState(false);

  // Undo/redo over whole field arrays. Snapshots are small (tens of objects),
  // and treating the layout as one value keeps multi-field edits atomic.
  const past = useRef<EditorField[][]>([]);
  const future = useRef<EditorField[][]>([]);
  const clipboard = useRef<EditorField | null>(null);
  /** Why the last save failed, so send() can say more than "it failed". */
  const saveError = useRef<string | null>(null);
  // Refs don't re-render, but the toolbar's disabled states depend on them.
  const [, bumpHistory] = useState(0);
  const touchHistory = () => bumpHistory((t) => t + 1);

  const commit = useCallback((next: EditorField[] | ((prev: EditorField[]) => EditorField[])) => {
    setFields((prev) => {
      past.current = [...past.current.slice(-HISTORY_LIMIT), prev];
      future.current = [];
      return typeof next === 'function' ? next(prev) : next;
    });
    touchHistory();
  }, []);

  const undo = useCallback(() => {
    setFields((prev) => {
      const last = past.current.pop();
      if (!last) return prev;
      future.current = [prev, ...future.current];
      return last;
    });
    setSelectedId(null);
    touchHistory();
  }, []);

  const redo = useCallback(() => {
    setFields((prev) => {
      const [next, ...rest] = future.current;
      if (!next) return prev;
      future.current = rest;
      past.current = [...past.current, prev];
      return next;
    });
    touchHistory();
  }, []);

  const addField = useCallback(
    (type: FieldType, page: number, x: number, y: number) => {
      const meta = FIELD_META[type];
      const id = crypto.randomUUID();
      commit((prev) => [
        ...prev,
        {
          id,
          type,
          page,
          x: Math.min(1 - meta.w, Math.max(0, x)),
          y: Math.min(1 - meta.h, Math.max(0, y)),
          w: meta.w,
          h: meta.h,
          required: type !== 'checkbox',
          recipientKey: activeKey,
          ...(isChoice(type) ? { options: [...DEFAULT_OPTIONS] } : {}),
        },
      ]);
      setSelectedId(id);
    },
    [activeKey, commit],
  );

  const changeField = useCallback(
    (id: string, patch: Partial<EditorField>) => {
      // Drags fire continuously; folding them into one history entry keeps
      // undo meaning "undo that move", not "undo one pixel of that move".
      const geometryOnly = Object.keys(patch).every((k) => ['x', 'y', 'w', 'h'].includes(k));
      const apply = (prev: EditorField[]) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      if (geometryOnly) setFields(apply);
      else commit(apply);
    },
    [commit],
  );

  const selected = fields.find((f) => f.id === selectedId) ?? null;

  const deleteSelected = useCallback(() => {
    setSelectedId((id) => {
      if (id) commit((prev) => prev.filter((f) => f.id !== id));
      return null;
    });
  }, [commit]);

  const copySelected = useCallback(() => {
    if (selected) {
      clipboard.current = selected;
      touchHistory();
    }
  }, [selected]);

  const paste = useCallback(() => {
    const src = clipboard.current;
    if (!src) return;
    const id = crypto.randomUUID();
    // Offset so the copy is visibly distinct from its original.
    commit((prev) => [
      ...prev,
      { ...src, id, x: Math.min(1 - src.w, src.x + 0.02), y: Math.min(1 - src.h, src.y + 0.02) },
    ]);
    setSelectedId(id);
  }, [commit]);

  // Keyboard: this is a canvas app, so shortcuts work anywhere EXCEPT while
  // the user is typing into a form control.
  useEffect(() => {
    if (step !== 'fields') return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'c') {
        copySelected();
      } else if (mod && key === 'v') {
        paste();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, undo, redo, copySelected, paste, deleteSelected, selectedId]);

  const fieldCountFor = useCallback(
    (key: string) => fields.filter((f) => f.recipientKey === key).length,
    [fields],
  );

  const colorOf = useCallback((key: string) => Math.max(0, indexOfKey(key)), []);

  const pages = useMemo(
    () => Array.from({ length: template.pageCount }, (_, i) => i + 1),
    [template.pageCount],
  );

  const palette = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIELD_CATALOG.filter((f) => !q || f.label.toLowerCase().includes(q));
  }, [query]);

  const signers = recipients.filter((r) => r.role === 'signer');
  const activeRecipient = recipients.find((r) => r.key === activeKey) ?? recipients[0]!;
  const activeIndex = Math.max(0, colorOf(activeKey));

  /** Persist the layout. Send always saves first — the server snapshots it. */
  async function save(): Promise<boolean> {
    setSaveState('saving');
    saveError.current = null;
    try {
      await updateTemplate(template.id, {
        name: name.trim() || 'Untitled',
        fields: fields.map(({ id, type, page, x, y, w, h, required, recipientKey, options }) => ({
          id,
          type,
          page,
          x,
          y,
          w,
          h,
          required,
          recipientKey,
          ...(options ? { options } : {}),
        })),
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1600);
      return true;
    } catch (err) {
      // Keep WHY. Swallowing it here left the sender — and anyone debugging —
      // with "Could not save the field layout" and nothing else, which is the
      // same for a rejected field, an expired session and a broken gateway.
      saveError.current = err instanceof Error ? err.message : String(err);
      setSaveState('error');
      return false;
    }
  }

  async function send(): Promise<void> {
    if (!(await save())) {
      throw new Error(
        saveError.current
          ? `Could not save the field layout — ${saveError.current}`
          : 'Could not save the field layout.',
      );
    }
    await sendSignatureRequest({
      templateId: template.id,
      routingMode,
      subject: subject.trim() || undefined,
      message: message.trim() || undefined,
      recipients: recipients
        .filter((r) => r.email.trim())
        .map((r, i) => ({
          email: r.email.trim(),
          name: r.name.trim() || undefined,
          role: r.role,
          // In sequential mode each row is its own step, in the listed order.
          routingOrder: routingMode === 'sequential' ? i + 1 : 1,
          recipientKey: r.key,
        })),
    });
  }

  const untagged = signers.filter((r) => fieldCountFor(r.key) === 0);
  const canSend = signers.length > 0 && fields.length > 0 && untagged.length === 0;

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link
          href="/templates"
          aria-label="Close"
          className="rounded-md p-2 text-ink-muted hover:bg-surface-sunken hover:text-ink"
        >
          <X className="h-5 w-5" />
        </Link>
        <button
          type="button"
          onClick={() => setStep('setup')}
          disabled={step === 'setup'}
          aria-label="Back"
          className="rounded-md p-2 text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-30"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <nav aria-label="Progress" className="flex items-center gap-2 text-[15px]">
          <button
            type="button"
            onClick={() => setStep('setup')}
            className={
              step === 'setup'
                ? 'font-semibold text-ink underline underline-offset-4'
                : 'text-ink-muted hover:text-ink'
            }
          >
            Prepare
          </button>
          <ChevronRight className="h-4 w-4 text-ink-faint" />
          <button
            type="button"
            onClick={() => signers.length > 0 && setStep('fields')}
            className={
              step === 'fields'
                ? 'font-semibold text-ink underline underline-offset-4'
                : 'text-ink-muted hover:text-ink'
            }
          >
            Add Fields
          </button>
        </nav>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Document name"
          className="ml-3 hidden max-w-xs min-w-0 flex-1 rounded-md border border-transparent px-2 py-1.5 text-sm font-medium text-ink hover:border-border focus:border-brand focus:outline-none lg:block"
        />

        {/* Editing tools live HERE, not in a second strip below. One bar of
            chrome above the document instead of two means the page itself
            gets the height, which is what the sender is actually looking at. */}
        {step === 'fields' && (
          <div className="ml-auto hidden items-center gap-0.5 md:flex">
            <IconButton label="Undo" onClick={undo} disabled={past.current.length === 0}>
              <Undo2 className="h-5 w-5" />
            </IconButton>
            <IconButton label="Redo" onClick={redo} disabled={future.current.length === 0}>
              <Redo2 className="h-5 w-5" />
            </IconButton>
            <span className="mx-1.5 h-6 w-px bg-border" />
            <IconButton label="Copy field" onClick={copySelected} disabled={!selected}>
              <Copy className="h-5 w-5" />
            </IconButton>
            <IconButton label="Paste field" onClick={paste} disabled={!clipboard.current}>
              <ClipboardPaste className="h-5 w-5" />
            </IconButton>
            <IconButton label="Delete field" onClick={deleteSelected} disabled={!selected}>
              <Trash2 className="h-5 w-5" />
            </IconButton>
            <span className="mx-1.5 h-6 w-px bg-border" />
            <IconButton
              label="Zoom out"
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
              disabled={zoomIndex === 0}
            >
              <ZoomOut className="h-5 w-5" />
            </IconButton>
            <span className="w-12 text-center text-sm font-medium text-ink tabular-nums">
              {Math.round(ZOOM_STEPS[zoomIndex]! * 100)}%
            </span>
            <IconButton
              label="Zoom in"
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
            >
              <ZoomIn className="h-5 w-5" />
            </IconButton>
          </div>
        )}

        <div className={`flex items-center gap-2 ${step === 'fields' ? 'ml-3' : 'ml-auto'}`}>
          {saveState === 'saved' && <span className="text-sm text-success">Saved</span>}
          {saveState === 'error' && <span className="text-sm text-danger">Save failed</span>}
          {step === 'fields' && (
            <span className="hidden text-sm text-ink-muted xl:inline">
              {fields.length} field{fields.length === 1 ? '' : 's'}
            </span>
          )}
          <IconButton label="Help">
            <CircleHelp className="h-5 w-5" />
          </IconButton>
          <Dropdown
            align="end"
            trigger={() => (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken">
                <Settings className="h-5 w-5" />
              </span>
            )}
          >
            <MenuItem onClick={save}>Save layout</MenuItem>
            <MenuItem href={documentPdfUrl(template.documentId)}>Download original PDF</MenuItem>
            <MenuDivider />
            <MenuItem
              onClick={() => commit((prev) => prev.map((f) => ({ ...f, required: true })))}
              disabled={fields.length === 0}
            >
              Make every field required
            </MenuItem>
            <MenuItem
              disabled={fieldCountFor(activeKey) === 0}
              onClick={() => commit((prev) => prev.filter((f) => f.recipientKey !== activeKey))}
            >
              Clear this recipient&apos;s fields
            </MenuItem>
            <MenuItem
              onClick={() => setShowThumbs((v) => !v)}
              selected={showThumbs}
            >
              Show page thumbnails
            </MenuItem>
            <MenuDivider />
            <MenuItem danger onClick={() => commit([])} disabled={fields.length === 0}>
              Remove all fields
            </MenuItem>
          </Dropdown>

          <a href={documentPdfUrl(template.documentId)} target="_blank" rel="noreferrer">
            <Button variant="secondary">Preview</Button>
          </a>

          <Dropdown
            align="end"
            trigger={() => (
              <span className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand-hover">
                Send
                <ChevronDown className="h-4 w-4" />
              </span>
            )}
          >
            <MenuItem onClick={() => setReviewing(true)} disabled={!canSend}>
              Review and send
            </MenuItem>
            <MenuItem onClick={save}>Save without sending</MenuItem>
          </Dropdown>
        </div>
      </header>

      {step === 'setup' ? (
        <SetupStep
          recipients={recipients}
          routingMode={routingMode}
          subject={subject}
          message={message}
          documentName={name}
          fieldCountFor={fieldCountFor}
          onChange={(next) => {
            setRecipients(next);
            if (!next.some((r) => r.key === activeKey)) setActiveKey(next[0]?.key ?? 'signer');
          }}
          onRoutingMode={setRoutingMode}
          onSubject={setSubject}
          onMessage={setMessage}
          onNext={() => setStep('fields')}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left: field palette */}
          <aside className="thin-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-border">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-lg font-bold text-ink">Fields</h2>
              <IconButton label="Search fields" onClick={() => setSearchOpen((v) => !v)}>
                <Search className="h-5 w-5" />
              </IconButton>
            </div>

            {searchOpen && (
              <div className="px-5 pb-3">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search fields"
                  className="h-10 w-full rounded-md border border-border-strong px-3 text-sm outline-none focus:border-brand"
                />
              </div>
            )}

            <div className="px-5 pb-3">
              <Dropdown
                className="w-full"
                menuClassName="w-[260px]"
                trigger={(open) => (
                  <span
                    className={`flex h-12 w-full items-center gap-3 rounded-lg border-2 px-3 text-left ${
                      open ? 'border-brand' : 'border-transparent'
                    }`}
                    style={{
                      background: `color-mix(in srgb, var(--color-rc-${(activeIndex % 6) + 1}) 22%, white)`,
                    }}
                  >
                    <Avatar
                      name={recipientLabel(activeRecipient, activeIndex)}
                      colorIndex={activeIndex}
                      size={28}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {recipientLabel(activeRecipient, activeIndex)}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-ink" />
                  </span>
                )}
              >
                {recipients.map((r, i) => (
                  <MenuItem
                    key={r.key}
                    selected={r.key === activeKey}
                    onClick={() => setActiveKey(r.key)}
                    icon={<Avatar name={recipientLabel(r, i)} colorIndex={i} size={22} />}
                  >
                    {recipientLabel(r, i)}
                    {r.role === 'cc' && ' (copy only)'}
                  </MenuItem>
                ))}
                <MenuDivider />
                <MenuItem onClick={() => setStep('setup')}>Edit recipients…</MenuItem>
              </Dropdown>
              {activeRecipient.role === 'cc' && (
                <p className="mt-2 text-xs text-warning">
                  This person only receives a copy — fields placed for them are never filled in.
                </p>
              )}
            </div>

            {/* Properties STACK here rather than taking over the right rail.
                Swapping the thumbnails out for a properties panel hid the
                page you were working on; stacking keeps the recipient
                selector and the palette visible while you tune a field. */}
            {selected && (
              <div className="border-y border-border bg-surface-muted">
                <FieldProperties
                  field={selected}
                  recipients={recipients}
                  onChange={(patch) => changeField(selected.id, patch)}
                  onDelete={deleteSelected}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}

            <div className="px-5 pt-4 pb-6">
              {FIELD_GROUPS.map((group) => {
                const items = palette.filter((f) => f.group === group);
                if (items.length === 0) return null;
                return (
                  <FieldGroupSection key={group} group={group} activeColor={activeIndex}>
                    {items.map((f) => (
                      <button
                        key={f.type}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-docflow-field', f.type);
                          e.dataTransfer.effectAllowed = 'copy';
                        }}
                        onDoubleClick={() => addField(f.type, 1, 0.4, 0.4)}
                        title={`Drag ${f.label} onto the document (double-click drops it on page 1)`}
                        className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-sm text-ink transition-colors hover:border-brand hover:bg-brand-soft active:cursor-grabbing"
                      >
                        <span className="shrink-0 text-brand">{f.icon}</span>
                        <span className="min-w-0 truncate">{f.label}</span>
                      </button>
                    ))}
                  </FieldGroupSection>
                );
              })}
              {palette.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-muted">No field matches that.</p>
              )}
            </div>

            {/* Why Send is disabled, said where the sender is working — not
                only as a greyed-out button they have to hover to understand. */}
            <div className="mt-auto border-t border-border px-5 py-4 text-sm">
              {untagged.length > 0 ? (
                <p className="text-warning">
                  {untagged.map((r) => recipientLabel(r, recipients.indexOf(r))).join(', ')}{' '}
                  {untagged.length === 1 ? 'has' : 'have'} no fields yet — drop at least one for
                  each signer before sending.
                </p>
              ) : fields.length === 0 ? (
                <p className="text-ink-muted">Drag a field from above onto the document.</p>
              ) : (
                <p className="text-success">Every signer has at least one field.</p>
              )}
            </div>
          </aside>

          {/* Centre: toolbar + pages */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="thin-scroll min-h-0 flex-1 overflow-auto bg-surface-sunken p-8">
              {pdfError && <p className="text-center text-sm text-danger">{pdfError}</p>}
              {!pdf && !pdfError && (
                <p className="text-center text-sm text-ink-muted">Loading document…</p>
              )}
              {pdf && (
                <div className="mx-auto flex w-fit flex-col items-center gap-8">
                  {pages.map((p) => (
                    <div key={p} id={`page-${p}`} className="flex flex-col items-center gap-2">
                      <PdfPage
                        pdf={pdf}
                        pageNumber={p}
                        scale={ZOOM_STEPS[zoomIndex]!}
                        fields={fields.filter((f) => f.page === p)}
                        selectedId={selectedId}
                        colorOf={colorOf}
                        onDropField={(type, x, y) => addField(type, p, x, y)}
                        onSelect={setSelectedId}
                        onChangeField={changeField}
                      />
                      <span className="text-sm text-ink-muted">Page {p}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </main>

          {/* Right: the document's pages. Stays put — it is a map, and a map
              that disappears when you touch something is not a map. */}
          {showThumbs && (
            <aside className="thin-scroll w-[260px] shrink-0 overflow-y-auto border-l border-border">
              <DocumentPanel
                name={name}
                pageCount={template.pageCount}
                fields={fields}
                pdf={pdf}
              />
            </aside>
          )}
        </div>
      )}

      {reviewing && (
        <SendReview
          documentName={name}
          recipients={recipients}
          routingMode={routingMode}
          subject={subject}
          message={message}
          fieldCount={fields.length}
          onSend={send}
          onClose={() => setReviewing(false)}
          onDone={() => router.push('/agreements?view=sent')}
        />
      )}
    </div>
  );
}

function FieldGroupSection({
  group,
  children,
  activeColor,
}: {
  group: FieldGroup;
  children: React.ReactNode;
  activeColor: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 text-ink-muted transition-transform ${open ? '' : '-rotate-90'}`}
        />
        <span className="text-sm font-semibold text-ink">{group}</span>
        <span
          aria-hidden
          className="ml-auto h-2.5 w-2.5 rounded-full"
          style={{ background: `var(--color-rc-${(activeColor % 6) + 1})` }}
        />
      </button>
      {open && <div className="grid grid-cols-2 gap-2">{children}</div>}
    </section>
  );
}

/** Page thumbnails plus a per-page field tally, so nothing gets missed. */
function DocumentPanel({
  name,
  pageCount,
  fields,
  pdf,
}: {
  name: string;
  pageCount: number;
  fields: EditorField[];
  pdf: ReturnType<typeof usePdf>['pdf'];
}) {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-ink">Documents</h2>
        <IconButton label="Document settings">
          <Settings className="h-5 w-5" />
        </IconButton>
      </div>
      <p className="truncate text-sm font-medium text-ink">{name}</p>
      <p className="mb-4 text-sm text-ink-muted">
        {pageCount} page{pageCount === 1 ? '' : 's'}
      </p>

      <div className="flex flex-col gap-4">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
          const count = fields.filter((f) => f.page === p).length;
          return (
            <div key={p}>
              <button
                type="button"
                onClick={() =>
                  document.getElementById(`page-${p}`)?.scrollIntoView({ behavior: 'smooth' })
                }
                className="block w-full overflow-hidden rounded-md border-2 border-border transition-colors hover:border-brand"
              >
                <ThumbCanvas pdf={pdf} page={p} />
              </button>
              <div className="mt-1.5 flex items-center justify-between px-1">
                <span className="text-sm text-ink">{p}</span>
                <span className="text-xs text-ink-muted">
                  {count > 0 ? `${count} field${count === 1 ? '' : 's'}` : '—'}
                </span>
                <EllipsisVertical className="h-4 w-4 text-ink-muted" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small page render, reusing the document the editor already has open. */
function ThumbCanvas({ pdf, page }: { pdf: ReturnType<typeof usePdf>['pdf']; page: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    (async () => {
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: 240 / base.width });
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await p.render({ canvasContext: ctx, viewport, canvas }).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);
  return <canvas ref={ref} className="block w-full bg-white" />;
}
