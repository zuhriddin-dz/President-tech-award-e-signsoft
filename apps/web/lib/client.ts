'use client';
import {
  API_PATHS,
  SignatureRequestListSchema,
  SignatureRequestSchema,
  TemplateListSchema,
  TemplateSchema,
  VerifyResultSchema,
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
  return TemplateSchema.parse(
    await req(`${API_PATHS.templates}/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
}

export async function sendSignatureRequest(input: SendRequest): Promise<SignatureRequest> {
  return SignatureRequestSchema.parse(
    await req(API_PATHS.signatureRequests, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function listSignatureRequests(): Promise<SignatureRequestList> {
  return SignatureRequestListSchema.parse(await req(API_PATHS.signatureRequests));
}

/** Re-hash the stored signed PDF and check the seal. */
export async function verifyRequest(id: string): Promise<VerifyResult> {
  return VerifyResultSchema.parse(await req(`${API_PATHS.signatureRequests}/${id}/verify`));
}

/** The document PDF bytes, streamed through the BFF (authenticated, same-origin). */
export function documentPdfUrl(documentId: string): string {
  return `/api${API_PATHS.documents}/${documentId}/download`;
}

/** Sealed artifacts for a completed request, streamed through the BFF. */
export function signedPdfUrl(requestId: string): string {
  return `/api${API_PATHS.signatureRequests}/${requestId}/signed`;
}
export function certificateUrl(requestId: string): string {
  return `/api${API_PATHS.signatureRequests}/${requestId}/certificate`;
}
