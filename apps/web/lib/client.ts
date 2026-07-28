'use client';
import {
  API_PATHS,
  FolderListSchema,
  FolderSchema,
  SignatureRequestListSchema,
  SignatureRequestSchema,
  StarterTemplateListSchema,
  TemplateListSchema,
  TemplateSchema,
  VerifyResultSchema,
  type Folder,
  type FolderList,
  type StarterTemplateList,
  type SendRequest,
  type VerifyResult,
  type SignatureRequest,
  type SignatureRequestList,
  type Template,
  type TemplateList,
  type TemplateUpdate,
} from '@docflow/contracts';

/**
 * Browser → BFF client. Every call hits same-origin /api/*; the BFF forwards
 * to the API with the caller's token. Responses are parsed through the shared
 * contract schemas, so a drifted/over-sharing API response fails here.
 */
async function req(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`/api${path}`, { cache: 'no-store', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

// ── Templates ──────────────────────────────────────────────────────────────

export async function listTemplates(): Promise<TemplateList> {
  return TemplateListSchema.parse(await req(API_PATHS.templates));
}

export async function getTemplate(id: string): Promise<Template> {
  return TemplateSchema.parse(await req(`${API_PATHS.templates}/${id}`));
}

export async function createTemplate(name: string, file: File): Promise<Template> {
  const form = new FormData();
  form.set('name', name);
  form.set('file', file);
  return TemplateSchema.parse(await req(API_PATHS.templates, { method: 'POST', body: form }));
}

export async function updateTemplate(id: string, patch: TemplateUpdate): Promise<Template> {
  return TemplateSchema.parse(await req(`${API_PATHS.templates}/${id}`, json('PATCH', patch)));
}

/** Star / unstar — drives the home page's favourites shelf. */
export async function setTemplateFavorite(id: string, favorite: boolean): Promise<Template> {
  return updateTemplate(id, { favorite });
}

export async function listStarterTemplates(): Promise<StarterTemplateList> {
  return StarterTemplateListSchema.parse(await req(`${API_PATHS.templates}/starters`));
}

/** Copy a starter into this workspace; the result is an ordinary template. */
export async function createFromStarter(key: string): Promise<Template> {
  return TemplateSchema.parse(
    await req(`${API_PATHS.templates}/from-starter`, json('POST', { key })),
  );
}

// ── Envelopes ──────────────────────────────────────────────────────────────

export async function sendSignatureRequest(input: SendRequest): Promise<SignatureRequest> {
  return SignatureRequestSchema.parse(await req(API_PATHS.signatureRequests, json('POST', input)));
}

export async function listSignatureRequests(): Promise<SignatureRequestList> {
  return SignatureRequestListSchema.parse(await req(API_PATHS.signatureRequests));
}

/** Re-hash the stored signed PDF and check the seal. */
export async function verifyRequest(id: string): Promise<VerifyResult> {
  return VerifyResultSchema.parse(await req(`${API_PATHS.signatureRequests}/${id}/verify`));
}

/** Cancel an envelope — outstanding links die, recipients are told. */
export async function voidRequest(id: string, reason?: string): Promise<void> {
  await req(`${API_PATHS.signatureRequests}/${id}/void`, json('POST', { reason }));
}

/** Re-issue one recipient's signing link (the old one stops working). */
export async function resendRecipient(id: string, recipientId: string): Promise<void> {
  await req(`${API_PATHS.signatureRequests}/${id}/recipients/${recipientId}/resend`, {
    method: 'POST',
  });
}

/** Nudge one recipient who hasn't signed yet. */
export async function remindRecipient(id: string, recipientId: string): Promise<void> {
  await req(`${API_PATHS.signatureRequests}/${id}/recipients/${recipientId}/remind`, {
    method: 'POST',
  });
}

// ── Organisation ───────────────────────────────────────────────────────────

export async function listFolders(): Promise<FolderList> {
  return FolderListSchema.parse(await req(API_PATHS.folders));
}

export async function createFolder(name: string): Promise<Folder> {
  return FolderSchema.parse(await req(API_PATHS.folders, json('POST', { name })));
}

/** File envelopes into a folder; `null` takes them back out. */
export async function moveToFolder(requestIds: string[], folderId: string | null): Promise<void> {
  await req(`${API_PATHS.signatureRequests}/move`, json('POST', { requestIds, folderId }));
}

/** Soft delete — the envelope moves to the Deleted view, evidence intact. */
export async function deleteRequests(requestIds: string[]): Promise<void> {
  await req(`${API_PATHS.signatureRequests}/delete`, json('POST', { requestIds }));
}

export async function restoreRequests(requestIds: string[]): Promise<void> {
  await req(`${API_PATHS.signatureRequests}/restore`, json('POST', { requestIds }));
}

// ── Streamed bytes (links, not fetches) ────────────────────────────────────

/** The document PDF bytes, streamed through the BFF (authenticated, same-origin). */
export function documentPdfUrl(documentId: string): string {
  return `/api${API_PATHS.documents}/${documentId}/download`;
}

export function signedPdfUrl(requestId: string): string {
  return `/api${API_PATHS.signatureRequests}/${requestId}/signed`;
}

export function certificateUrl(requestId: string): string {
  return `/api${API_PATHS.signatureRequests}/${requestId}/certificate`;
}
