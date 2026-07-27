import { Injectable } from '@nestjs/common';
import { hashSigningToken } from '@docflow/crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantContext } from './tenant-context.js';

/**
 * Resolve a PRESENTED raw signing token (from a /sign/<token> link) to its
 * tenant, and enter tenant context — the fail-closed entry point for the
 * public signing surface, and the sanctioned SESSIONLESS CLS tenant writer
 * (security-lint exempts this folder).
 *
 * The tenant comes from the token LOOKUP, never any client-named value: the
 * raw token is hashed here and the hash is matched by resolve_signing_token
 * (SECURITY DEFINER, since RLS context does not exist yet). On a miss nothing
 * is written and null returns.
 *
 * THE CALLER IS NOT DONE: this only says which tenant to open. The signer
 * service must then load the request under RLS and require signingTokenHash to
 * equal the presented hash AND a signable status/expiry — a forged or stale
 * resolution must open nothing. Returns the hash so the caller re-checks BY it.
 */
export interface ResolvedToken {
  requestId: string;
  /** Which person on the envelope holds this token (null = legacy link). */
  recipientId: string | null;
  tokenHash: string;
}

@Injectable()
export class SigningTokenResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TenantContext,
  ) {}

  async resolve(rawToken: string): Promise<ResolvedToken | null> {
    const tokenHash = hashSigningToken(rawToken);
    const rows = await this.prisma.$queryRaw<
      { tenant_id: string; request_id: string; recipient_id: string | null }[]
    >`SELECT tenant_id, request_id, recipient_id FROM public.resolve_signing_token(${tokenHash})`;
    const row = rows[0];
    if (!row) return null;
    this.context.enterAsSigner(row.tenant_id);
    return { requestId: row.request_id, recipientId: row.recipient_id, tokenHash };
  }
}
