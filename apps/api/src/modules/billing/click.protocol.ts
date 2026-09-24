import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * The Click Merchant (SHOP API) protocol, as protocol only.
 *
 * Click calls US twice for one payment: Prepare (action 0) asks "is this order
 * real and is the amount right", Complete (action 1) says "the money moved".
 * Both arrive as form-encoded POSTs, and both expect HTTP 200 with the outcome
 * in a JSON body — same reasoning as Payme, a non-200 reads as a fault.
 *
 * Amounts here are in SO'M, not tiyin: Click quotes whole currency. This is
 * the one place in the codebase that converts, and it converts at the edge.
 */

/**
 * Click's own error numbers. 0 is success; everything else is a refusal Click
 * shows to the customer.
 */
export const ClickError = {
  Success: 0,
  SignCheckFailed: -1,
  IncorrectAmount: -2,
  ActionNotFound: -3,
  AlreadyPaid: -4,
  UserNotFound: -5,
  TransactionNotFound: -6,
  FailedToUpdate: -7,
  BadRequest: -8,
  TransactionCancelled: -9,
} as const;

/**
 * The human note beside the code. Click shows it, and its own examples use
 * these exact strings, so they are reproduced rather than reworded.
 */
export function clickNote(code: number): string {
  return CLICK_ERROR_NOTES[code] ?? 'Error';
}

export const CLICK_ERROR_NOTES: Record<number, string> = {
  [ClickError.Success]: 'Success',
  [ClickError.SignCheckFailed]: 'SIGN CHECK FAILED',
  [ClickError.IncorrectAmount]: 'Incorrect parameter amount',
  [ClickError.ActionNotFound]: 'Action not found',
  [ClickError.AlreadyPaid]: 'Already paid',
  [ClickError.UserNotFound]: 'User does not exist',
  [ClickError.TransactionNotFound]: 'Transaction does not exist',
  [ClickError.FailedToUpdate]: 'Failed to update user',
  [ClickError.BadRequest]: 'Error in request from click',
  [ClickError.TransactionCancelled]: 'Transaction cancelled',
};

export const ClickAction = { Prepare: 0, Complete: 1 } as const;

/**
 * What Click posts. Every value arrives as a string because the body is form
 * encoded, so the numeric fields are coerced rather than trusted to be numbers.
 *
 * `error` is CLICK's own status for the payment, not ours: a negative value on
 * Complete means the payment failed or was cancelled on their side, and the
 * order must not be granted.
 */
export const ClickCallbackSchema = z.object({
  click_trans_id: z.string().min(1),
  service_id: z.string().min(1),
  click_paydoc_id: z.string().optional().default(''),
  merchant_trans_id: z.string().min(1),
  merchant_prepare_id: z.string().optional().default(''),
  amount: z.string().min(1),
  action: z.coerce.number().int(),
  error: z.coerce.number().int().optional().default(0),
  error_note: z.string().optional().default(''),
  sign_time: z.string().min(1),
  sign_string: z.string().min(1),
});
export type ClickCallback = z.infer<typeof ClickCallbackSchema>;

/**
 * The signature Click computes, and which we recompute to decide whether to
 * believe the request at all.
 *
 * md5 over the fields in exactly this order, with the shared secret sitting
 * between service_id and merchant_trans_id:
 *
 *   click_trans_id + service_id + secret_key + merchant_trans_id
 *     + merchant_prepare_id + amount + action + sign_time
 *
 * merchant_prepare_id is the empty string on Prepare, because there is not one
 * yet — it is a real field in the concatenation, just empty, and dropping it
 * instead of emptying it produces a different digest.
 *
 * `amount` is used as the STRING Click sent. Click signs the exact characters
 * it transmitted ("99000.00"), so re-formatting the number before hashing —
 * to "99000", say — computes a digest over data nobody signed.
 */
export function clickSignature(params: {
  clickTransId: string;
  serviceId: string;
  secretKey: string;
  merchantTransId: string;
  merchantPrepareId: string;
  amount: string;
  action: number;
  signTime: string;
}): string {
  const joined =
    params.clickTransId +
    params.serviceId +
    params.secretKey +
    params.merchantTransId +
    params.merchantPrepareId +
    params.amount +
    String(params.action) +
    params.signTime;
  return createHash('md5').update(joined, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of the presented signature against the computed
 * one. Hex digests are the same length whenever both are well formed, so a
 * length difference is itself a rejection rather than something to pad around.
 */
export function clickSignatureValid(presented: string, expected: string): boolean {
  const a = Buffer.from(presented.toLowerCase(), 'utf8');
  const b = Buffer.from(expected.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Does the amount Click quotes match what the order costs?
 *
 * Click sends so'm as a decimal string, which is not always the same text for
 * the same money — "99000", "99000.0" and "99000.00" are all the same amount.
 * So it is compared as a NUMBER against the expected so'm, with a tolerance of
 * half a tiyin to absorb the float the string parses into. Anything larger is
 * a genuine mismatch and the payment is refused.
 */
export function clickAmountMatches(presented: string, expectedSum: number): boolean {
  const value = Number(presented);
  if (!Number.isFinite(value)) return false;
  return Math.abs(value - expectedSum) < 0.005;
}

/**
 * Where to send the customer to pay. A plain query string, unlike Payme's
 * base64 path: `transaction_param` is the field Click echoes back to us as
 * merchant_trans_id, and it carries our payment id.
 */
export function clickPayUrl(params: {
  checkoutUrl: string;
  serviceId: string;
  merchantId: string;
  paymentId: string;
  amountSum: number;
  returnUrl?: string | null;
}): string {
  const url = new URL(params.checkoutUrl);
  url.searchParams.set('service_id', params.serviceId);
  url.searchParams.set('merchant_id', params.merchantId);
  url.searchParams.set('amount', String(params.amountSum));
  url.searchParams.set('transaction_param', params.paymentId);
  if (params.returnUrl) url.searchParams.set('return_url', params.returnUrl);
  return url.toString();
}
