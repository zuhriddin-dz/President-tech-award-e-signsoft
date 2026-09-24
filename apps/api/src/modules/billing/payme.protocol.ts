import { timingSafeEqual } from 'node:crypto';

/**
 * The Payme Merchant API, as protocol only — no database, no Nest, nothing
 * that needs a running application to exercise.
 *
 * Payme calls US. It posts JSON-RPC 2.0 over HTTP and expects HTTP 200 on
 * every single response, including failures: a non-200 is read as a transport
 * fault and retried, so an ordinary "unknown order" returned as a 404 turns
 * into a retry loop. Failure is expressed in the body, never in the status.
 *
 * Amounts are in TIYIN throughout, which is also how we store them, so no
 * conversion happens anywhere on this side.
 */

/** JSON-RPC states Payme tracks for a transaction. */
export const PaymeState = {
  /** Created, money held, not yet taken. */
  Created: 1,
  /** Performed — the money is ours. */
  Performed: 2,
  /** Cancelled before it was performed. */
  CancelledBeforePerform: -1,
  /** Cancelled after it was performed — i.e. refunded. */
  CancelledAfterPerform: -2,
} as const;

/**
 * Error codes. The -32xxx band is JSON-RPC's own; -31xxx is Payme's.
 *
 * -31050..-31099 is a range Payme reserves for the MERCHANT to describe what
 * is wrong with the account it was given, and it is the only band where we get
 * to choose the meaning — hence two of our own inside it.
 */
export const PaymeError = {
  /** Wrong amount for this order. */
  InvalidAmount: -31001,
  /** No such transaction on our side. */
  TransactionNotFound: -31003,
  /** The request is understood but cannot be carried out now. */
  CannotPerform: -31008,
  /** Ours: the order id does not name a payment we issued. */
  OrderNotFound: -31050,
  /** Ours: that order is not waiting to be paid (already paid, or cancelled). */
  OrderNotPayable: -31051,
  /** Bad or missing Basic credentials. */
  InsufficientPrivilege: -32504,
  /** Unknown method name. */
  MethodNotFound: -32601,
  /** Body was not valid JSON. */
  ParseError: -32700,
  /** Body was valid JSON but not a valid request. */
  InvalidRequest: -32600,
} as const;

/**
 * Payme shows this text to the customer, so it is sent in all three languages
 * the product speaks rather than as a bare English string.
 */
export interface PaymeMessage {
  ru: string;
  uz: string;
  en: string;
}

/**
 * The catch-all. Also the message for CannotPerform itself, so an unmapped
 * code reads as the true thing — we will not be carrying this one out — rather
 * than as a blank.
 */
const CANNOT_PERFORM: PaymeMessage = {
  ru: 'Операция недоступна.',
  uz: 'Amalni bajarib boʻlmaydi.',
  en: 'Operation cannot be performed.',
};

export const PAYME_MESSAGES: Record<number, PaymeMessage> = {
  [PaymeError.InvalidAmount]: {
    ru: 'Неверная сумма.',
    uz: 'Summa notoʻgʻri.',
    en: 'Incorrect amount.',
  },
  [PaymeError.TransactionNotFound]: {
    ru: 'Транзакция не найдена.',
    uz: 'Tranzaksiya topilmadi.',
    en: 'Transaction not found.',
  },
  [PaymeError.CannotPerform]: CANNOT_PERFORM,
  [PaymeError.OrderNotFound]: {
    ru: 'Заказ не найден.',
    uz: 'Buyurtma topilmadi.',
    en: 'Order not found.',
  },
  [PaymeError.OrderNotPayable]: {
    ru: 'Заказ уже оплачен или отменён.',
    uz: 'Buyurtma allaqachon toʻlangan yoki bekor qilingan.',
    en: 'This order is already paid or cancelled.',
  },
  [PaymeError.InsufficientPrivilege]: {
    ru: 'Недостаточно прав.',
    uz: 'Huquqlar yetarli emas.',
    en: 'Insufficient privileges.',
  },
  [PaymeError.MethodNotFound]: {
    ru: 'Метод не найден.',
    uz: 'Metod topilmadi.',
    en: 'Method not found.',
  },
  [PaymeError.ParseError]: {
    ru: 'Ошибка разбора JSON.',
    uz: 'JSON tahlilida xatolik.',
    en: 'Could not parse JSON.',
  },
  [PaymeError.InvalidRequest]: {
    ru: 'Неверный запрос.',
    uz: 'Notoʻgʻri soʻrov.',
    en: 'Invalid request.',
  },
};

/** Thrown by the service; turned into a JSON-RPC error body by the controller. */
export class PaymeRpcError extends Error {
  constructor(
    readonly code: number,
    /** Names the offending field for account errors, e.g. 'order_id'. */
    readonly data?: string,
  ) {
    super(`Payme error ${code}`);
    this.name = 'PaymeRpcError';
  }

  get payload(): { code: number; message: PaymeMessage; data?: string } {
    const message = PAYME_MESSAGES[this.code] ?? CANNOT_PERFORM;
    return this.data === undefined
      ? { code: this.code, message }
      : { code: this.code, message, data: this.data };
  }
}

/**
 * Is this request really from Payme?
 *
 * Payme authenticates itself with HTTP Basic, where the login is the literal
 * string `Paycom` and the password is the merchant key. That key is the whole
 * of the authentication on this route, so the comparison is constant-time and
 * an unconfigured key refuses everything rather than accepting anything.
 */
export function paymeAuthorized(header: string | undefined, merchantKey: string | null): boolean {
  if (!header || !merchantKey) return false;
  if (!header.startsWith('Basic ')) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  } catch {
    return false;
  }

  // Split on the FIRST colon only: a merchant key may legitimately contain one.
  const colon = decoded.indexOf(':');
  if (colon === -1) return false;
  const login = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  if (login !== 'Paycom') return false;

  const a = Buffer.from(password);
  const b = Buffer.from(merchantKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Where to send the customer to pay.
 *
 * Payme takes its parameters as one base64 blob in the path rather than as a
 * query string: `m` is the cashbox, `ac.<field>` the account (our payment id),
 * `a` the amount in tiyin, `c` where to return afterwards, `l` the language.
 *
 * `accountField` is configured in the Payme cabinet and MUST match it — Payme
 * echoes the same name back in every callback, so a mismatch makes every
 * payment arrive as an unknown order.
 */
export function paymeCheckoutUrl(params: {
  checkoutOrigin: string;
  merchantId: string;
  accountField: string;
  paymentId: string;
  amountTiyin: number;
  returnUrl?: string | null;
  lang?: string;
}): string {
  const parts = [
    `m=${params.merchantId}`,
    `ac.${params.accountField}=${params.paymentId}`,
    `a=${params.amountTiyin}`,
  ];
  if (params.returnUrl) parts.push(`c=${params.returnUrl}`);
  if (params.lang) parts.push(`l=${params.lang}`);

  const encoded = Buffer.from(parts.join(';'), 'utf8').toString('base64');
  return `${params.checkoutOrigin.replace(/\/+$/, '')}/${encoded}`;
}

/**
 * How long Payme may wait between creating a transaction and performing it.
 * Past this the transaction is stale and CreateTransaction must refuse to
 * reopen it — 12 hours is the figure Payme's own timeout rule uses.
 */
export const PAYME_TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
