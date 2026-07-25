'use client';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import type { FieldType, Template } from '@docflow/contracts';
import { Button } from '@/components/ui/primitives';
import { FIELD_CATALOG, FIELD_GROUPS, FIELD_META } from '@/lib/field-catalog';
import { documentPdfUrl, updateTemplate } from '@/lib/client';
import { usePdf } from '@/lib/use-pdf';
import { PdfPage } from './pdf-page';
import { SendDialog } from './send-dialog';

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
}

const SCALE = 1.3;

export function TemplateEditor({ template }: { template: Template }) {
  const { pdf, error } = usePdf(documentPdfUrl(template.documentId));
  const [name, setName] = useState(template.name);
  const [fields, setFields] = useState<EditorField[]>(
    template.fields.map((f) => ({ ...f, recipientKey: f.recipientKey })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showSend, setShowSend] = useState(false);

  const addField = useCallback((type: FieldType, page: number, x: number, y: number) => {
    const meta = FIELD_META[type];
    const id = crypto.randomUUID();
    setFields((prev) => [
      ...prev,
      {
        id,
        type,
        page,
        x: Math.min(1 - meta.w, Math.max(0, x)),
        y: Math.min(1 - meta.h, Math.max(0, y)),
        w: meta.w,
        h: meta.h,
        required: true,
        recipientKey: 'signer',
      },
    ]);
    setSelectedId(id);
  }, []);

  const moveField = useCallback((id: string, x: number, y: number) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)));
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setFields((prev) => prev.filter((f) => f.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  async function save(): Promise<boolean> {
    setSaveState('saving');
    try {
      await updateTemplate(template.id, {
        name: name.trim() || 'Untitled',
        fields: fields.map(({ id, type, page, x, y, w, h, required, recipientKey }) => ({
          id,
          type,
          page,
          x,
          y,
          w,
          h,
          required,
          recipientKey,
        })),
      });
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }

  // Send snapshots the SERVER's fields, so persist the editor state first.
  async function saveThenSend() {
    if (await save()) setShowSend(true);
  }

  const pages = useMemo(
    () => Array.from({ length: template.pageCount }, (_, i) => i + 1),
    [template.pageCount],
  );

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="text-sm text-ink-muted hover:text-ink">
            ← Templates
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-transparent px-2 py-1 text-sm font-medium text-ink hover:border-border focus:border-brand focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          {saveState === 'saved' && <span className="text-sm text-success">Saved</span>}
          {saveState === 'error' && <span className="text-sm text-danger">Save failed</span>}
          <Button variant="ghost" onClick={save} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : 'Save'}
          </Button>
          <Button onClick={saveThenSend} disabled={saveState === 'saving' || fields.length === 0}>
            Send
          </Button>
        </div>
      </div>

      {showSend && (
        <SendDialog
          templateId={template.id}
          hasFields={fields.length > 0}
          onClose={() => setShowSend(false)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left: field palette */}
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-border bg-surface p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Fields</p>
          {FIELD_GROUPS.map((group) => (
            <div key={group} className="mb-4">
              <p className="mb-1 text-xs text-ink-muted">{group}</p>
              <div className="flex flex-col gap-1">
                {FIELD_CATALOG.filter((f) => f.group === group).map((f) => (
                  <div
                    key={f.type}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData('application/x-docflow-field', f.type)
                    }
                    className="cursor-grab rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink hover:border-brand active:cursor-grabbing"
                  >
                    {f.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-2 text-xs text-ink-muted">
            Drag a field onto the document. Click a placed field, then Delete to remove it.
          </p>
        </aside>

        {/* Center: pages */}
        <main
          className="flex-1 overflow-auto bg-surface-muted p-6"
          onKeyDown={(e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) deleteSelected();
          }}
          tabIndex={0}
        >
          {error && <p className="text-sm text-danger">{error}</p>}
          {!pdf && !error && <p className="text-sm text-ink-muted">Loading document…</p>}
          {pdf && (
            <div className="mx-auto flex w-fit flex-col items-center gap-6">
              {pages.map((p) => (
                <div key={p} className="flex flex-col items-center gap-1">
                  <PdfPage
                    pdf={pdf}
                    pageNumber={p}
                    scale={SCALE}
                    fields={fields.filter((f) => f.page === p)}
                    selectedId={selectedId}
                    onDropField={(type, x, y) => addField(type, p, x, y)}
                    onSelect={setSelectedId}
                    onMoveField={moveField}
                  />
                  <span className="text-xs text-ink-muted">Page {p}</span>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right: selection / summary */}
        <aside className="w-56 shrink-0 overflow-y-auto border-l border-border bg-surface p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            {selectedId ? 'Selected field' : 'Placed fields'}
          </p>
          {selectedId ? (
            <SelectedPanel
              field={fields.find((f) => f.id === selectedId)!}
              onDelete={deleteSelected}
              onToggleRequired={(v) =>
                setFields((prev) =>
                  prev.map((f) => (f.id === selectedId ? { ...f, required: v } : f)),
                )
              }
            />
          ) : (
            <p className="text-sm text-ink-muted">
              {fields.length} field{fields.length === 1 ? '' : 's'} placed.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function SelectedPanel({
  field,
  onDelete,
  onToggleRequired,
}: {
  field: EditorField;
  onDelete: () => void;
  onToggleRequired: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <span className="text-ink-muted">Type</span>
        <p className="font-medium text-ink">{FIELD_META[field.type].label}</p>
      </div>
      <div>
        <span className="text-ink-muted">Page</span>
        <p className="text-ink">{field.page}</p>
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onToggleRequired(e.target.checked)}
        />
        <span className="text-ink">Required</span>
      </label>
      <Button variant="danger" onClick={onDelete}>
        Delete field
      </Button>
    </div>
  );
}
