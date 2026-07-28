'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Download,
  EllipsisVertical,
  LayoutGrid,
  Rows3,
  Send,
  Star,
  Upload,
  User,
} from 'lucide-react';
import type { StarterTemplate, TemplateSummary } from '@docflow/contracts';
import { Button, EmptyState, IconButton, Td, Th } from '@/components/ui/primitives';
import { Dropdown, MenuDivider, MenuItem, SearchInput } from '@/components/ui/overlays';
import { PdfThumbnail } from '@/components/pdf/pdf-thumbnail';
import { dateTimeStamp, shortDate } from '@/lib/format';
import { createFromStarter, documentPdfUrl, setTemplateFavorite } from '@/lib/client';
import { NewTemplateDialog } from './new-template-dialog';

type Section = 'mine' | 'favorites' | 'starter';

/**
 * Templates — the library a sender builds up. Same three sources as the
 * picker (yours, your favourites, our starters) so the mental model matches
 * wherever you are in the product.
 */
export function TemplatesClient({
  templates,
  starters,
  openNew,
}: {
  templates: TemplateSummary[];
  starters: StarterTemplate[];
  openNew: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [section, setSection] = useState<Section>(templates.length === 0 ? 'starter' : 'mine');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(openNew);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setQuery(''), [section]);

  const matches = (t: string) => t.toLowerCase().includes(query.trim().toLowerCase());
  const rows = useMemo(() => {
    const base = section === 'favorites' ? templates.filter((t) => t.favorite) : templates;
    return base.filter((t) => matches(t.name));
  }, [templates, section, query]);
  const starterRows = useMemo(
    () => starters.filter((s) => matches(s.name) || matches(s.category)),
    [starters, query],
  );

  async function toggleFavorite(t: TemplateSummary) {
    setBusyId(t.id);
    try {
      await setTemplateFavorite(t.id, !t.favorite);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that template.');
    } finally {
      setBusyId(null);
    }
  }

  async function useStarter(key: string) {
    setBusyId(key);
    setError(null);
    try {
      const created = await createFromStarter(key);
      router.push(`/prepare/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that document.');
      setBusyId(null);
    }
  }

  const SECTIONS: { key: Section; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'mine', label: 'My Templates', icon: <User className="h-4 w-4" />, count: templates.length },
    {
      key: 'favorites',
      label: 'Favorites',
      icon: <Star className="h-4 w-4" />,
      count: templates.filter((t) => t.favorite).length,
    },
    { key: 'starter', label: 'Ready-Made', icon: <Download className="h-4 w-4" />, count: starters.length },
  ];

  return (
    <div className="mx-auto w-full max-w-[1360px] px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Templates</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Prepare a document once — fields, recipients and all — then send it as many times as
            you like.
          </p>
        </div>
        <Button variant="dark" size="lg" onClick={() => setUploading(true)}>
          <Upload className="h-4 w-4" />
          Upload a document
        </Button>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              aria-selected={section === s.key}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                section === s.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {s.icon}
              {s.label}
              {s.count !== undefined && s.count > 0 && (
                <span className="text-ink-faint">{s.count}</span>
              )}
            </button>
          ))}
        </div>

        <SearchInput
          className="w-full max-w-sm"
          value={query}
          onChange={setQuery}
          placeholder={`Search ${SECTIONS.find((s) => s.key === section)?.label}`}
        />

        {section !== 'starter' && (
          <div className="ml-auto flex gap-1">
            <IconButton
              label="Grid view"
              active={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <LayoutGrid className="h-5 w-5" />
            </IconButton>
            <IconButton
              label="List view"
              active={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              <Rows3 className="h-5 w-5" />
            </IconButton>
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-6">
        {section === 'starter' ? (
          <StarterGrid
            rows={starterRows}
            busyKey={busyId}
            onUse={useStarter}
          />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface">
            <EmptyState
              title={section === 'favorites' ? 'No favourites yet' : 'No templates yet'}
              body={
                section === 'favorites'
                  ? 'Star a template and it will be pinned here and on your home page.'
                  : 'Upload a PDF, or start from one of our ready-made documents.'
              }
              action={
                <div className="mt-2 flex gap-3">
                  <Button variant="dark" onClick={() => setUploading(true)}>
                    Upload a document
                  </Button>
                  <Button variant="secondary" onClick={() => setSection('starter')}>
                    Browse ready-made
                  </Button>
                </div>
              }
            />
          </div>
        ) : layout === 'grid' ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((t) => (
              <article
                key={t.id}
                className="group overflow-hidden rounded-lg border border-border bg-surface transition-shadow hover:shadow-md"
              >
                <div className="relative">
                  <Link href={`/prepare/${t.id}`}>
                    <PdfThumbnail
                      url={documentPdfUrl(t.documentId)}
                      width={400}
                      alt={`First page of ${t.name}`}
                      className="h-48 border-b border-border"
                    />
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(t)}
                    disabled={busyId === t.id}
                    aria-pressed={t.favorite}
                    aria-label={t.favorite ? `Unstar ${t.name}` : `Star ${t.name}`}
                    className="absolute top-2 right-2 rounded-md bg-surface/95 p-2 shadow-sm transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    <Star
                      className={`h-4 w-4 ${t.favorite ? 'fill-warning text-warning' : 'text-ink-muted'}`}
                    />
                  </button>
                </div>
                <div className="p-4">
                  <Link
                    href={`/prepare/${t.id}`}
                    className="line-clamp-2 font-semibold text-ink group-hover:text-brand-link"
                  >
                    {t.name}
                  </Link>
                  <p className="mt-1 text-sm text-ink-muted">
                    {t.pageCount} page{t.pageCount === 1 ? '' : 's'} ·{' '}
                    {t.lastUsedAt ? `used ${shortDate(t.lastUsedAt)}` : 'never sent'}
                  </p>
                  <Link href={`/prepare/${t.id}`} className="mt-3 block">
                    <Button variant="secondary" size="sm" className="w-full">
                      <Send className="h-4 w-4" />
                      Use
                    </Button>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <Th className="w-12">&nbsp;</Th>
                  <Th>Name</Th>
                  <Th>Owner</Th>
                  <Th>Last change</Th>
                  <Th>Last used</Th>
                  <Th className="w-32 text-right">&nbsp;</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-b-0 hover:bg-surface-muted">
                    <Td>
                      <button
                        type="button"
                        onClick={() => toggleFavorite(t)}
                        disabled={busyId === t.id}
                        aria-pressed={t.favorite}
                        aria-label={t.favorite ? `Unstar ${t.name}` : `Star ${t.name}`}
                      >
                        <Star
                          className={`h-4 w-4 ${t.favorite ? 'fill-warning text-warning' : 'text-ink-faint'}`}
                        />
                      </button>
                    </Td>
                    <Td>
                      <Link href={`/prepare/${t.id}`} className="font-medium text-brand-link hover:underline">
                        {t.name}
                      </Link>
                    </Td>
                    <Td className="text-ink-muted">You</Td>
                    <Td className="text-ink-muted">{dateTimeStamp(t.updatedAt)}</Td>
                    <Td className="text-ink-muted">
                      {t.lastUsedAt ? shortDate(t.lastUsedAt) : 'Never'}
                    </Td>
                    <Td className="text-right">
                      <Dropdown
                        align="end"
                        trigger={() => (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken">
                            <EllipsisVertical className="h-4 w-4" />
                          </span>
                        )}
                      >
                        <MenuItem href={`/prepare/${t.id}`}>Open and send</MenuItem>
                        <MenuItem href={documentPdfUrl(t.documentId)}>Download PDF</MenuItem>
                        <MenuDivider />
                        <MenuItem onClick={() => toggleFavorite(t)}>
                          {t.favorite ? 'Remove from favourites' : 'Add to favourites'}
                        </MenuItem>
                      </Dropdown>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {uploading && <NewTemplateDialog onClose={() => setUploading(false)} />}
    </div>
  );
}

function StarterGrid({
  rows,
  busyKey,
  onUse,
}: {
  rows: StarterTemplate[];
  busyKey: string | null;
  onUse: (key: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState title="Nothing ready-made matches that search" />
      </div>
    );
  }
  // Group by category so the library reads like a catalogue, not a list.
  const byCategory = rows.reduce<Record<string, StarterTemplate[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8">
      {Object.entries(byCategory).map(([category, items]) => (
        <section key={category}>
          <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">{category}</h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <article
                key={s.key}
                className="flex flex-col rounded-lg border border-border bg-surface p-5"
              >
                <h3 className="font-semibold text-ink">{s.name}</h3>
                <p className="mt-1.5 flex-1 text-sm text-ink-muted">{s.summary}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4 self-start"
                  disabled={busyKey === s.key}
                  onClick={() => onUse(s.key)}
                >
                  {busyKey === s.key ? 'Preparing…' : 'Use this template'}
                </Button>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
