import { describe, expect, it } from 'vitest';
import { PaymeError, PaymeRpcError, paymeAuthorized, paymeCheckoutUrl } from './payme.protocol.js';

const KEY = 'a-merchant-key-with-some-length';
const basic = (login: string, password: string) =>
  `Basic ${Buffer.from(`${login}:${password}`, 'utf8').toString('base64')}`;

describe('paymeAuthorized', () => {
  it('accepts the Paycom login with the exact merchant key', () => {
    expect(paymeAuthorized(basic('Paycom', KEY), KEY)).toBe(true);
  });

  it('refuses a wrong key, a wrong login, and a near miss', () => {
    expect(paymeAuthorized(basic('Paycom', 'wrong'), KEY)).toBe(false);
    expect(paymeAuthorized(basic('paycom', KEY), KEY)).toBe(false);
    expect(paymeAuthorized(basic('Merchant', KEY), KEY)).toBe(false);
    expect(paymeAuthorized(basic('Paycom', `${KEY} `), KEY)).toBe(false);
    expect(paymeAuthorized(basic('Paycom', KEY.slice(0, -1)), KEY)).toBe(false);
  });

  it('refuses when nothing is presented or nothing is configured', () => {
    // An unconfigured key must close the door, not open it: this Basic header
    // is the only thing standing between the callback and the whole internet.
    expect(paymeAuthorized(basic('Paycom', KEY), null)).toBe(false);
    expect(paymeAuthorized(undefined, KEY)).toBe(false);
    expect(paymeAuthorized('', KEY)).toBe(false);
  });

  it('refuses a header that is not Basic, or not decodable', () => {
    expect(paymeAuthorized(`Bearer ${KEY}`, KEY)).toBe(false);
    expect(paymeAuthorized('Basic !!!not-base64!!!', KEY)).toBe(false);
    // Base64 that decodes but carries no colon at all.
    expect(paymeAuthorized(`Basic ${Buffer.from('nocolon').toString('base64')}`, KEY)).toBe(false);
  });

  it('keeps a colon inside the key, splitting on the first one only', () => {
    const keyWithColon = 'abc:def:ghi';
    expect(paymeAuthorized(basic('Paycom', keyWithColon), keyWithColon)).toBe(true);
  });
});

describe('paymeCheckoutUrl', () => {
  const base = {
    checkoutOrigin: 'https://checkout.paycom.uz',
    merchantId: '5e730e8e0b852a417aa49ceb',
    accountField: 'order_id',
    paymentId: '3f2f1a10-0000-4000-8000-000000000001',
    amountTiyin: 9_900_000,
  };

  const decode = (url: string) =>
    Buffer.from(url.slice(url.lastIndexOf('/') + 1), 'base64').toString('utf8');

  it('encodes cashbox, account and amount as a base64 path', () => {
    const decoded = decode(paymeCheckoutUrl(base));
    expect(decoded).toBe(
      `m=${base.merchantId};ac.order_id=${base.paymentId};a=9900000`,
    );
  });

  it('sends the amount in tiyin, unconverted, because that is how we store it', () => {
    expect(decode(paymeCheckoutUrl({ ...base, amountTiyin: 29_900_000 }))).toContain('a=29900000');
  });

  it('uses the account field name the cabinet is configured with', () => {
    expect(decode(paymeCheckoutUrl({ ...base, accountField: 'payment_id' }))).toContain(
      `ac.payment_id=${base.paymentId}`,
    );
  });

  it('adds the return url and language only when there are any', () => {
    const withExtras = decode(
      paymeCheckoutUrl({ ...base, returnUrl: 'https://esignsoft.uz/billing', lang: 'uz' }),
    );
    expect(withExtras).toContain(';c=https://esignsoft.uz/billing');
    expect(withExtras).toContain(';l=uz');

    const without = decode(paymeCheckoutUrl({ ...base, returnUrl: null }));
    expect(without).not.toContain(';c=');
    expect(without).not.toContain(';l=');
  });

  it('does not double the slash when the origin has a trailing one', () => {
    const url = paymeCheckoutUrl({ ...base, checkoutOrigin: 'https://checkout.paycom.uz/' });
    expect(url).not.toContain('uz//');
    expect(url.startsWith('https://checkout.paycom.uz/')).toBe(true);
  });
});

describe('PaymeRpcError', () => {
  it('carries a localised message in all three languages', () => {
    const { code, message } = new PaymeRpcError(PaymeError.OrderNotFound).payload;
    expect(code).toBe(-31050);
    expect(message.ru.length).toBeGreaterThan(0);
    expect(message.uz.length).toBeGreaterThan(0);
    expect(message.en.length).toBeGreaterThan(0);
  });

  it('names the offending field when it is an account error', () => {
    expect(new PaymeRpcError(PaymeError.OrderNotFound, 'order_id').payload.data).toBe('order_id');
    expect(new PaymeRpcError(PaymeError.InvalidAmount).payload).not.toHaveProperty('data');
  });

  it('falls back to a usable message for a code with no text of its own', () => {
    expect(new PaymeRpcError(-31099).payload.message.en.length).toBeGreaterThan(0);
  });

  it('keeps the account errors inside the band Payme reserves for merchants', () => {
    for (const code of [PaymeError.OrderNotFound, PaymeError.OrderNotPayable]) {
      expect(code).toBeLessThanOrEqual(-31050);
      expect(code).toBeGreaterThanOrEqual(-31099);
    }
  });
});
