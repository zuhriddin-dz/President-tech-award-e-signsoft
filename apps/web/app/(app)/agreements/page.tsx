import { currentUser } from '@clerk/nextjs/server';
import { API_PATHS, FolderListSchema } from '@docflow/contracts';
import { apiGet } from '@/lib/api';
import { loadRequests, loadTemplates } from '@/lib/queries';
import { AgreementsClient } from './agreements-client';
import { isViewKey } from './views';

/**
 * Documents — every document this workspace has sent or received, sliced by
 * quick view. The view lives in the URL so a link to "Waiting for Others" is
 * a real link.
 */
export default async function PacketsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; folder?: string; expiring?: string }>;
}) {
  const params = await searchParams;
  const view = isViewKey(params.view) ? params.view : 'sent';

  const [requests, templates, folderList, user] = await Promise.all([
    loadRequests(),
    loadTemplates(),
    apiGet(API_PATHS.folders, FolderListSchema),
    currentUser(),
  ]);

  return (
    <AgreementsClient
      view={view}
      folderId={params.folder ?? null}
      expiringOnly={params.expiring === '1'}
      requests={requests}
      templates={templates}
      folders={folderList?.folders ?? []}
      myEmail={user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null}
    />
  );
}
