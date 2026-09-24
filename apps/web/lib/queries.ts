import 'server-only';
import { cache } from 'react';
import {
  API_PATHS,
  MeResponseSchema,
  PaymentListSchema,
  SignatureRequestListSchema,
  TemplateListSchema,
  type MeResponse,
  type Payment,
  type SignatureRequest,
  type TemplateSummary,
} from '@docflow/contracts';
import { apiGet, apiGetOrOnboarding } from './api';

/**
 * Server-side loaders shared by the shell and the pages inside it.
 *
 * Each is wrapped in React's `cache` so a layout and its page asking the same
 * question during one render produce ONE API call — without this, every
 * navigation would fetch the request list twice just to draw the progress bar.
 */

export const loadMe = cache(
  async (): Promise<{ status: 'ok'; data: MeResponse } | { status: 'onboarding' } | { status: 'error' }> =>
    apiGetOrOnboarding(API_PATHS.me, MeResponseSchema),
);

export const loadRequests = cache(async (): Promise<SignatureRequest[]> => {
  const list = await apiGet(API_PATHS.signatureRequests, SignatureRequestListSchema);
  return list?.requests ?? [];
});

export const loadTemplates = cache(async (): Promise<TemplateSummary[]> => {
  const list = await apiGet(API_PATHS.templates, TemplateListSchema);
  return list?.templates ?? [];
});

/**
 * What this workspace has paid. Admin-only upstream, so a member simply gets
 * an empty history rather than an error — the plan cards above it are the
 * point of the page, and they are the same for everyone.
 */
export const loadPayments = cache(async (): Promise<Payment[]> => {
  const list = await apiGet(`${API_PATHS.billing}/payments`, PaymentListSchema);
  return list?.payments ?? [];
});
