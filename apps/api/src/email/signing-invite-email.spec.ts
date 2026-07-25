import { describe, expect, it } from 'vitest';
import { buildSigningInviteEmail } from './signing-invite-email.js';

const base = {
  to: 'signer@example.com',
  recipientName: 'Jordan',
  documentName: 'NDA.pdf',
  senderName: 'acme@corp.com',
  signUrl: 'http://localhost:3300/sign/RAWTOKEN123',
};

describe('buildSigningInviteEmail', () => {
  it('includes the sign URL in both html and text', () => {
    const msg = buildSigningInviteEmail(base);
    expect(msg.to).toBe('signer@example.com');
    expect(msg.html).toContain(base.signUrl);
    expect(msg.text).toContain(base.signUrl);
    expect(msg.subject).toContain('NDA.pdf');
  });

  it('escapes HTML in user-controlled fields (no injection)', () => {
    const msg = buildSigningInviteEmail({
      ...base,
      recipientName: '<script>alert(1)</script>',
      documentName: 'a"><img src=x>',
    });
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;');
    expect(msg.html).not.toContain('"><img');
  });

  it('handles a missing recipient/sender name', () => {
    const msg = buildSigningInviteEmail({ ...base, recipientName: null, senderName: null });
    expect(msg.text).toContain('Hi,');
    expect(msg.text).toContain('Someone');
  });
});
