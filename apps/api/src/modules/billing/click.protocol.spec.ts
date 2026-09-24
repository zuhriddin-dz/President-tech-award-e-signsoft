import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ClickAction,
  ClickCallbackSchema,
  clickAmountMatches,
  clickPayUrl,
  clickSignature,
  clickSignatureValid,
} from './click.protocol.js';

const SECRET = 'click-secret-key';
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

describe('clickSignature', () => {
  const base = {
    clickTransId: '123456',
    serviceId: '12345',
    secretKey: SECRET,
    merchantTransId: '3f2f1a10-0000-4000-8000-000000000001',
    merchantPrepareId: '',
    amount: '99000.00',
    action: ClickAction.Prepare,
    signTime: '2026-09-24 12:00:00',
  };

  it('hashes the fields in Click’s documented order', () => {
    expect(clickSignature(base)).toBe(
      md5('12345612345' + SECRET + base.merchantTransId + '' + '99000.00' + '0' + base.signTime),
    );
  });

  it('includes merchant_prepare_id on Complete, and an empty one on Prepare', () => {
    const prepare = clickSignature(base);
    const complete = clickSignature({
      ...base,
      merchantPrepareId: '42',
      action: ClickAction.Complete,
    });
    expect(complete).not.toBe(prepare);
    // The field is present-but-empty on Prepare, not omitted: dropping it
    // instead of emptying it would hash different data.
    expect(clickSignature({ ...base, merchantPrepareId: '' })).toBe(prepare);
  });

  it('changes when any single signed field changes', () => {
    const original = clickSignature(base);
    expect(clickSignature({ ...base, amount: '99000.01' })).not.toBe(original);
    expect(clickSignature({ ...base, merchantTransId: 'other' })).not.toBe(original);
    expect(clickSignature({ ...base, clickTransId: '999' })).not.toBe(original);
    expect(clickSignature({ ...base, signTime: '2026-09-24 12:00:01' })).not.toBe(original);
    expect(clickSignature({ ...base, secretKey: 'wrong' })).not.toBe(original);
  });

  it('signs the amount string as sent, not a reformatted number', () => {
    // Click signs the characters it transmitted. "99000" and "99000.00" are
    // the same money but not the same digest, and normalising before hashing
    // would compute one over data nobody signed.
    expect(clickSignature({ ...base, amount: '99000' })).not.toBe(clickSignature(base));
  });
});

describe('clickSignatureValid', () => {
  const expected = md5('anything');

  it('accepts an exact match, in either case', () => {
    expect(clickSignatureValid(expected, expected)).toBe(true);
    expect(clickSignatureValid(expected.toUpperCase(), expected)).toBe(true);
  });

  it('refuses a mismatch, a truncation and an empty string', () => {
    expect(clickSignatureValid(md5('other'), expected)).toBe(false);
    expect(clickSignatureValid(expected.slice(0, -1), expected)).toBe(false);
    expect(clickSignatureValid('', expected)).toBe(false);
  });
});

describe('clickAmountMatches', () => {
  it('accepts the same money written different ways', () => {
    for (const written of ['99000', '99000.0', '99000.00']) {
      expect(clickAmountMatches(written, 99_000)).toBe(true);
    }
  });

  it('refuses a different amount, however close', () => {
    expect(clickAmountMatches('99000.01', 99_000)).toBe(false);
    expect(clickAmountMatches('98999.99', 99_000)).toBe(false);
    expect(clickAmountMatches('9900', 99_000)).toBe(false);
    expect(clickAmountMatches('990000', 99_000)).toBe(false);
  });

  it('refuses anything that is not a number at all', () => {
    expect(clickAmountMatches('', 99_000)).toBe(false);
    expect(clickAmountMatches('abc', 99_000)).toBe(false);
    expect(clickAmountMatches('NaN', 99_000)).toBe(false);
    expect(clickAmountMatches('Infinity', 99_000)).toBe(false);
  });
});

describe('ClickCallbackSchema', () => {
  const form = {
    click_trans_id: '1',
    service_id: '2',
    merchant_trans_id: 'order',
    amount: '99000.00',
    action: '0',
    sign_time: 't',
    sign_string: 's',
  };

  it('coerces the numeric fields that arrive as form strings', () => {
    const parsed = ClickCallbackSchema.parse(form);
    expect(parsed.action).toBe(0);
    expect(parsed.error).toBe(0);
    expect(parsed.merchant_prepare_id).toBe('');
  });

  it('keeps Click’s own error number, which decides whether money moved', () => {
    expect(ClickCallbackSchema.parse({ ...form, error: '-9' }).error).toBe(-9);
  });

  it('rejects a body missing a field the signature is computed over', () => {
    expect(() => ClickCallbackSchema.parse({ ...form, sign_string: undefined })).toThrow();
    expect(() => ClickCallbackSchema.parse({ ...form, merchant_trans_id: '' })).toThrow();
  });
});

describe('clickPayUrl', () => {
  const base = {
    checkoutUrl: 'https://my.click.uz/services/pay',
    serviceId: '12345',
    merchantId: '54321',
    paymentId: '3f2f1a10-0000-4000-8000-000000000001',
    amountSum: 99_000,
  };

  it('puts the payment id in transaction_param, which Click echoes back', () => {
    const url = new URL(clickPayUrl(base));
    expect(url.searchParams.get('transaction_param')).toBe(base.paymentId);
    expect(url.searchParams.get('service_id')).toBe('12345');
    expect(url.searchParams.get('merchant_id')).toBe('54321');
  });

  it('quotes the amount in so’m, not tiyin', () => {
    expect(new URL(clickPayUrl(base)).searchParams.get('amount')).toBe('99000');
  });

  it('adds a return url only when there is one', () => {
    expect(
      new URL(clickPayUrl({ ...base, returnUrl: 'https://esignsoft.uz/billing' })).searchParams.get(
        'return_url',
      ),
    ).toBe('https://esignsoft.uz/billing');
    expect(new URL(clickPayUrl(base)).searchParams.has('return_url')).toBe(false);
  });
});
