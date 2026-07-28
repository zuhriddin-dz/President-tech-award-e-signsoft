'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  Download,
  FolderClosed,
  FolderOpen,
  LayoutGrid,
  Star,
  User,
  Users,
} from 'lucide-react';
import type { StarterTemplate, TemplateSummary } from '@docflow/contracts';
import { Button, Th, Td } from '@/components/ui/primitives';
import { Modal, SearchInput } from '@/components/ui/overlays';
import { dateTimeStamp } from '@/lib/format';
import { createFromStarter, listStarterTemplates, listTemplates } from '@/lib/client';

/**
 * "Select a template" — the entry point to sending. Sections mirror where a
 * template can come from: our starter library, your own, what's shared, and
 * your filing. Picking one always ends in the same place: the tagging editor.
 */
type SectionKey =
  | 'starter'
  | 'mine'
  | 'shared'
  | 'all'
  | 'favorites'
  | 'folders'
  | 'shared-folders';

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: 'starter', label: 'Ready-Made', icon: <Download className="h-4 w-4" /> },
  { key: 'mine', label: 'My Templates', icon: <User className="h-4 w-4" /> },
  { key: 'shared', label: 'Shared with Me', icon: <Users className="h-4 w-4" /> },
  { key: 'all', label: 'All Templates', icon: <LayoutGrid className="h-4 w-4" /> },
  { key: 'favorites', label: 'Favorites', icon: <Star className="h-4 w-4" /> },
];

export function TemplatePicker({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('starter');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [mine, setMine] = useState<TemplateSummary[] | null>(null);
  const [starters, setStarters] = useState<StarterTemplate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foldersOpen, setFoldersOpen] = useState(true);

  useEffect(() => {
    let live = true;
    Promise.all([listStarterTemplates(), listTemplates()])
      .then(([s, t]) => {
        if (!live) return;
        setStarters(s.starters);
        setMine(t.templates);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load templates.'));
    return () => {
      live = false;
    };
  }, []);

  // Switching sections must clear the selection — otherwise "Add Selected"
  // would act on a row the user can no longer see.
  useEffect(() => {
    setSelected(null);
    setQuery('');
  }, [section]);

  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());

  const starterRows = useMemo(
    () => (starters ?? []).filter((s) => matches(s.name) || matches(s.category)),
    [starters, query],
  );
  const ownRows = useMemo(() => {
    const rows = mine ?? [];
    const scoped = section === 'favorites' ? rows.filter((t) => t.favorite) : rows;
    return scoped.filter((t) => matches(t.name));
  }, [mine, section, query]);

  async function addSelected() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      if (section === 'starter') {
        const created = await createFromStarter(selected);
        router.push(`/prepare/${created.id}`);
      } else {
        router.push(`/prepare/${selected}`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that template.');
      setBusy(false);
    }
  }

  const loading = mine === null || starters === null;

  return (
    <Modal title="Select a template" size="full" onClose={onClose} hideHeaderBorder
      footer={
        <>
          {error && <span className="mr-auto text-sm text-danger">{error}</span>}
          <Button variant="dark" disabled={!selected || busy} onClick={addSelected}>
            {busy ? 'Opening…' : 'Add to Packet'}
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-0">
        {/* Sections */}
        <nav className="w-64 shrink-0 border-r border-border py-2">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              aria-current={section === s.key ? 'true' : undefined}
              className={`flex w-full items-center gap-3 px-6 py-3 text-left text-sm transition-colors ${
                section === s.key
                  ? 'bg-surface-sunken font-semibold text-ink'
                  : 'text-ink hover:bg-surface-muted'
              }`}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFoldersOpen((v) => !v);
              setSection('folders');
            }}
            className={`flex w-full items-center gap-3 px-6 py-3 text-left text-sm ${
              section === 'folders' ? 'bg-surface-sunken font-semibold text-ink' : 'text-ink hover:bg-surface-muted'
            }`}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${foldersOpen ? '' : '-rotate-90'}`} />
            <FolderClosed className="h-4 w-4" />
            Folders
          </button>
          <button
            type="button"
            onClick={() => setSection('shared-folders')}
            className={`flex w-full items-center gap-3 px-6 py-3 text-left text-sm ${
              section === 'shared-folders'
                ? 'bg-surface-sunken font-semibold text-ink'
                : 'text-ink hover:bg-surface-muted'
            }`}
          >
            <ChevronDown className="h-4 w-4" />
            <FolderOpen className="h-4 w-4" />
            Shared Folders
          </button>
        </nav>

        {/* Rows */}
        <div className="thin-scroll min-w-0 flex-1 overflow-y-auto px-8 py-6">
          {(section === 'starter' || section === 'mine' || section === 'all' || section === 'favorites') && (
            <SearchInput
              className="mb-6 max-w-md"
              value={query}
              onChange={setQuery}
              placeholder={`Search ${SECTIONS.find((s) => s.key === section)?.label ?? ''}`}
            />
          )}

          {loading ? (
            <p className="py-16 text-center text-sm text-ink-muted">Loading templates…</p>
          ) : section === 'starter' ? (
            <PickerTable
              columns={['NAME', 'CATEGORY']}
              rows={starterRows.map((s) => ({
                id: s.key,
                cells: [
                  <span key="n" className="font-medium text-brand-link">
                    {s.name}
                    <span className="block text-xs font-normal text-ink-muted">{s.summary}</span>
                  </span>,
                  s.category,
                ],
              }))}
              selected={selected}
              onSelect={setSelected}
              empty="Nothing ready-made matches that search."
            />
          ) : section === 'shared' || section === 'shared-folders' ? (
            <SharedEmptyState onBrowseStarters={() => setSection('starter')} />
          ) : section === 'folders' ? (
            <div className="py-20 text-center">
              <p className="text-lg font-semibold text-ink">Templates aren&apos;t filed in folders</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
                Folders organise sent agreements. Use Favorites to keep the templates you reach for
                most at the top of every list.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => setSection('favorites')}>
                Go to Favorites
              </Button>
            </div>
          ) : (
            <PickerTable
              columns={['NAME', 'OWNER', 'LAST CHANGE']}
              rows={ownRows.map((t) => ({
                id: t.id,
                cells: [
                  <span key="n" className="font-medium text-brand-link">
                    {t.name}
                  </span>,
                  'You',
                  dateTimeStamp(t.updatedAt),
                ],
              }))}
              selected={selected}
              onSelect={setSelected}
              empty={
                section === 'favorites'
                  ? 'No favourites yet — star a template to pin it here.'
                  : 'No templates yet. Start from a ready-made document, or upload a PDF.'
              }
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

function PickerTable({
  columns,
  rows,
  selected,
  onSelect,
  empty,
}: {
  columns: string[];
  rows: { id: string; cells: React.ReactNode[] }[];
  selected: string | null;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="py-20 text-center text-sm text-ink-muted">{empty}</p>;
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-border">
          <Th className="w-12" />
          {columns.map((c) => (
            <Th key={c} className="tracking-wide text-ink-muted uppercase">
              {c}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`cursor-pointer border-b border-border transition-colors ${
              selected === r.id ? 'bg-brand-soft' : 'hover:bg-surface-muted'
            }`}
          >
            <Td>
              <input
                type="radio"
                name="template-pick"
                aria-label="Select this template"
                checked={selected === r.id}
                onChange={() => onSelect(r.id)}
                className="h-4 w-4 accent-brand"
              />
            </Td>
            {r.cells.map((cell, i) => (
              <Td key={i}>{cell}</Td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Sharing between workspaces isn't built yet — say so, and offer the next best thing. */
function SharedEmptyState({ onBrowseStarters }: { onBrowseStarters: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center lg:flex-row lg:text-left">
      <PaperPlanes />
      <div className="max-w-md">
        <h3 className="text-2xl font-semibold text-ink">Sending the same thing again?</h3>
        <p className="mt-3 text-sm text-ink-muted">
          Save documents, placeholder recipients and fields as a template so you can send the same
          agreement again in two clicks. Templates shared by teammates will appear here.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <a href="/templates?new=1">
            <Button variant="dark">Create a Template</Button>
          </a>
          <button
            type="button"
            onClick={onBrowseStarters}
            className="text-sm font-semibold text-brand-link hover:underline"
          >
            Browse ready-made documents
          </button>
        </div>
      </div>
    </div>
  );
}

function PaperPlanes() {
  return (
    <svg viewBox="0 0 260 200" className="h-44 w-64 shrink-0" aria-hidden>
      <rect x="30" y="18" width="130" height="164" rx="6" fill="var(--color-brand-soft)" />
      {[40, 58, 76, 94, 130, 148].map((y) => (
        <rect key={y} x="46" y={y} width="98" height="7" rx="3.5" fill="#fff" opacity="0.9" />
      ))}
      <rect x="46" y="112" width="52" height="10" rx="3" fill="var(--color-brand)" opacity="0.35" />
      <path d="M150 120 L245 44 L206 132 L188 104 Z" fill="#2f6fed" opacity="0.85" />
      <path d="M188 104 L206 132 L184 128 Z" fill="#1b4fbf" />
      <path d="M168 158 L240 96 L214 162 L200 142 Z" fill="#4fc3d9" opacity="0.85" />
    </svg>
  );
}
