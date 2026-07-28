'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { Modal, TextField } from '@/components/ui/overlays';
import { createTemplate } from '@/lib/client';

/**
 * Upload a PDF and land in the tagging editor. Drag-and-drop is the primary
 * gesture — the file picker is the fallback, not the other way round.
 */
export function NewTemplateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function accept(picked: File | undefined | null) {
    if (!picked) return;
    if (picked.type !== 'application/pdf' && !picked.name.toLowerCase().endsWith('.pdf')) {
      setError('That is not a PDF. Upload a PDF document to tag and send.');
      return;
    }
    setError(null);
    setFile(picked);
    if (!name.trim()) setName(picked.name.replace(/\.pdf$/i, ''));
  }

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
      router.push(`/prepare/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Upload a document"
      size="md"
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-sm text-danger">{error}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="dark" disabled={busy || !file} onClick={submit}>
            {busy ? 'Uploading…' : 'Upload and add fields'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5 px-7 py-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInput.current?.click()}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? 'border-brand bg-brand-soft' : 'border-border-strong hover:border-brand'
          }`}
        >
          {file ? (
            <>
              <FileUp className="h-10 w-10 text-brand" />
              <p className="font-semibold text-ink">{file.name}</p>
              <p className="text-sm text-ink-muted">
                {(file.size / 1024 / 1024).toFixed(2)} MB · click to choose a different file
              </p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-ink-muted" />
              <p className="font-semibold text-ink">Drop a PDF here</p>
              <p className="text-sm text-ink-muted">or click to browse — up to 20&nbsp;MB</p>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => accept(e.target.files?.[0])}
          />
        </div>

        <TextField
          label="Template name"
          value={name}
          onChange={setName}
          placeholder="e.g. Mutual NDA"
          maxLength={200}
        />
      </form>
    </Modal>
  );
}
