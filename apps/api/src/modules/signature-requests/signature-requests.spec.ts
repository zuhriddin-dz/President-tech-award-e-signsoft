import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { SendRequest } from '@docflow/contracts';
import { assertSignersAreTagged } from './signature-requests.service.js';

/**
 * The rule that keeps a Certificate of Completion honest: it may not name a
 * signatory whose mark is nowhere in the sealed document.
 *
 * A signer whose recipientKey matches no field opens an empty ceremony, has no
 * required field to leave blank, and submits successfully — completing the
 * envelope and earning a line on the certificate for a signature that was never
 * placed. Refused at send, where the sender can still fix it.
 */
function send(recipients: SendRequest['recipients']): SendRequest {
  return { templateId: '00000000-0000-0000-0000-000000000000', routingMode: 'parallel', recipients };
}
const signer = (email: string, recipientKey: string): SendRequest['recipients'][number] => ({
  email,
  role: 'signer',
  routingOrder: 1,
  recipientKey,
});

describe('a signer must own at least one field', () => {
  it('accepts a signer whose key is tagged', () => {
    expect(() =>
      assertSignersAreTagged(send([signer('a@x.test', 'signer')]), [{ recipientKey: 'signer' }]),
    ).not.toThrow();
  });

  it('REFUSES a signer whose key matches no field', () => {
    expect(() =>
      assertSignersAreTagged(send([signer('ghost@x.test', 'signer-2')]), [
        { recipientKey: 'signer' },
      ]),
    ).toThrow(BadRequestException);
  });

  it('names the person in the message, so the sender knows who to tag', () => {
    expect(() =>
      assertSignersAreTagged(send([signer('ghost@x.test', 'signer-9')]), [
        { recipientKey: 'signer' },
      ]),
    ).toThrow(/ghost@x\.test/);
  });

  it('refuses even when OTHER signers are tagged — one untagged is enough', () => {
    expect(() =>
      assertSignersAreTagged(
        send([signer('a@x.test', 'signer'), signer('b@x.test', 'signer-2')]),
        [{ recipientKey: 'signer' }],
      ),
    ).toThrow(BadRequestException);
  });

  it('ignores a cc: they fill nothing and need no field group', () => {
    expect(() =>
      assertSignersAreTagged(
        send([
          signer('a@x.test', 'signer'),
          { email: 'watch@x.test', role: 'cc', routingOrder: 1, recipientKey: 'anything' },
        ]),
        [{ recipientKey: 'signer' }],
      ),
    ).not.toThrow();
  });

  it('still allows two signers to share a field group (existing behaviour)', () => {
    expect(() =>
      assertSignersAreTagged(
        send([signer('a@x.test', 'signer'), signer('b@x.test', 'signer')]),
        [{ recipientKey: 'signer' }],
      ),
    ).not.toThrow();
  });

  it('treats an untagged field as belonging to the default group', () => {
    expect(() =>
      assertSignersAreTagged(send([signer('a@x.test', 'signer')]), [{}]),
    ).not.toThrow();
  });
});
