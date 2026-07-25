'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, Card } from '@/components/ui/primitives';
import { createTemplate } from '@/lib/client';

export function NewTemplateCard() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Choose a PDF to upload.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createTemplate(name.trim() || file.name, file);
      // Straight into the editor to place fields — the natural next step.
      router.push(`/templates/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-ink">New template</h2>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-ink-muted">Template name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mutual NDA"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-ink-muted">Document (PDF)</span>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-ink file:mr-3 file:rounded file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-ink"
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload template'}
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Card>
  );
}
