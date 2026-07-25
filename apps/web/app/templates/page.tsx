import Link from 'next/link';
import { redirect } from 'next/navigation';
import { API_PATHS, TemplateListSchema } from '@docflow/contracts';
import { apiGetOrOnboarding } from '@/lib/api';
import { NewTemplateCard } from './new-template-card';

/**
 * Templates list. Operator: a sender preparing documents. Their one job here is
 * to upload a PDF (becomes a template) or open an existing one to tag/send.
 * The list is display; the only form is the upload card.
 */
export default async function TemplatesPage() {
  const result = await apiGetOrOnboarding(API_PATHS.templates, TemplateListSchema);
  if (result.status === 'onboarding') redirect('/welcome');
  const templates = result.status === 'ok' ? result.data.templates : [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Templates</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Upload a document once, place its fields, then send it for signature.
        </p>
      </div>

      <NewTemplateCard />

      <div>
        <h2 className="mb-3 text-sm font-medium text-ink">Your templates</h2>
        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-ink-muted">
            No templates yet — upload a PDF above to create your first one.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/templates/${t.id}`}
                className="rounded-lg border border-border bg-surface p-4 transition hover:border-brand hover:shadow-sm"
              >
                <p className="truncate font-medium text-ink">{t.name}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {t.pageCount} page{t.pageCount === 1 ? '' : 's'} ·{' '}
                  {new Date(t.updatedAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
