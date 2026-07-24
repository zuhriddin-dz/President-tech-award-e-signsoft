/**
 * @docflow/contracts — the trust boundary. Both sides import these shapes:
 * the API's toWire mappers must satisfy them, the web parses every response
 * through them (a drifted or over-sharing response fails loudly at the edge,
 * not silently in a component).
 *
 * ponytail: plain Zod DTOs + path constants for now; adopt a full ts-rest
 * router when the first real CRUD domain lands (Phase 7a) and sets the
 * five-file house style.
 */
import { z } from 'zod';

export const MembershipRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const MeResponseSchema = z.object({
  userId: z.uuid(),
  role: MembershipRoleSchema,
  tenant: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** API route paths — one source of truth for both sides of the BFF. */
export const API_PATHS = {
  health: '/health',
  me: '/me',
  documents: '/documents',
} as const;

export const DocumentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contentType: z.string(),
  byteSize: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const DocumentListSchema = z.object({ documents: z.array(DocumentSchema) });
export type DocumentList = z.infer<typeof DocumentListSchema>;

export const PACKAGE_NAME = '@docflow/contracts' as const;
