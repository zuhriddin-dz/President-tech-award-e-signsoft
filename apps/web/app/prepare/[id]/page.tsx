import { notFound, redirect } from 'next/navigation';
import { TemplateSchema, API_PATHS, accessLocked } from '@docflow/contracts';
import { apiGet } from '@/lib/api';
import { loadMe } from '@/lib/queries';
import { TemplateEditor } from './editor';

/**
 * Editor shell — fetches the template server-side (through the API, RLS-scoped),
 * then hands it to the client editor. A template that doesn't belong to the
 * caller's tenant is a 404 from the API and a not-found here.
 *
 * This page sits outside the (app) shell, so it makes the trial check itself:
 * a workspace whose trial has ended goes to the Get Pro page, not to an editor
 * whose every save the API would refuse.
 */
export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await loadMe();
  const access = me.status === 'ok' ? me.data.tenant?.access : null;
  if (access && accessLocked(access)) redirect('/billing');

  const { id } = await params;
  const template = await apiGet(`${API_PATHS.templates}/${id}`, TemplateSchema);
  if (!template) notFound();
  return <TemplateEditor template={template} />;
}
