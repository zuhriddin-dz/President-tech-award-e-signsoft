import { notFound } from 'next/navigation';
import { TemplateSchema, API_PATHS } from '@docflow/contracts';
import { apiGet } from '@/lib/api';
import { TemplateEditor } from './editor';

/**
 * Editor shell — fetches the template server-side (through the API, RLS-scoped),
 * then hands it to the client editor. A template that doesn't belong to the
 * caller's tenant is a 404 from the API and a not-found here.
 */
export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const template = await apiGet(`${API_PATHS.templates}/${id}`, TemplateSchema);
  if (!template) notFound();
  return <TemplateEditor template={template} />;
}
