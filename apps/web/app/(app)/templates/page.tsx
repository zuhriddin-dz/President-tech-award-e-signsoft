import { API_PATHS, StarterTemplateListSchema } from '@docflow/contracts';
import { apiGet } from '@/lib/api';
import { loadTemplates } from '@/lib/queries';
import { TemplatesClient } from './templates-client';

/**
 * Templates library. `?new=1` opens the upload dialog straight away — that's
 * the link the onboarding checklist and the empty states point at.
 */
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const [templates, starters, params] = await Promise.all([
    loadTemplates(),
    apiGet(`${API_PATHS.templates}/starters`, StarterTemplateListSchema),
    searchParams,
  ]);

  return (
    <TemplatesClient
      templates={templates}
      starters={starters?.starters ?? []}
      openNew={params.new === '1'}
    />
  );
}
