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
} as const;

export const PACKAGE_NAME = '@docflow/contracts' as const;
