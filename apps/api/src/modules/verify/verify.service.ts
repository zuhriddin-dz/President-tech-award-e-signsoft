import { Injectable } from '@nestjs/common';
import type { PublicVerifyResult } from '@docflow/contracts';
import { SealService } from '@docflow/crypto';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Public verification — the door that makes the product's claim usable.
 *
 * The authenticated check re-hashes the copy in OUR storage, which answers
 * "is our file intact". That is the wrong question for the person who matters:
 * a counterparty holding a PDF that arrived by email wants to know whether
 * THEIR bytes are the ones that were signed. So the caller hashes their own
 * copy and we look that fingerprint up.
 *
 * Two properties this leans on, both already true of the seal:
 *
 *   The hash is unguessable. You cannot enumerate documents here — you have to
 *   hold the file (or its certificate) to know what to ask about. That is what
 *   lets the route be open without becoming a directory of everyone's business.
 *
 *   The seal is bound to the request and the moment, not just the bytes. So a
 *   match is not merely "some document with this hash exists"; the signature
 *   has to verify over {requestId, signedAt, hash}, which is what stops a valid
 *   seal being reused against a different document.
 */
@Injectable()
export class VerifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seal: SealService,
  ) {}

  async byHash(documentHash: string): Promise<PublicVerifyResult> {
    const checkedAt = new Date().toISOString();

    // SECURITY DEFINER: the caller is by definition outside the tenant that
    // sent the document, so RLS would hide the row. The function returns only
    // the four fields verifying a seal needs — no tenant, no name, no signer.
    const rows = await this.prisma.$queryRaw<
      { request_id: string; completed_at: Date; seal_signature: string; seal_kid: string }[]
    >`SELECT request_id, completed_at, seal_signature, seal_kid
        FROM public.find_seal_by_hash(${documentHash})`;

    const row = rows[0];
    // Nothing matched. Either we never sealed this document, or it has been
    // altered since — indistinguishable by construction, because a changed
    // byte changes the fingerprint and there is no row left to find. The
    // holder's answer is the same either way, so we do not speculate.
    if (!row) return { verified: false, sealedAt: null, sealKid: null, checkedAt };

    const valid = this.seal.verify(
      { requestId: row.request_id, signedAt: row.completed_at, documentHash },
      row.seal_signature,
      row.seal_kid,
    );

    // A row whose seal does not verify is not a "found but invalid" case worth
    // reporting in detail — it would mean our own record is inconsistent. Say
    // no, and let the sender's authenticated check surface the detail.
    return {
      verified: valid,
      sealedAt: valid ? row.completed_at.toISOString() : null,
      sealKid: valid ? row.seal_kid : null,
      checkedAt,
    };
  }
}
