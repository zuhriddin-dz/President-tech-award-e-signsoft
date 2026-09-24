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

export const TenantKindSchema = z.enum(['personal', 'company']);
export type TenantKind = z.infer<typeof TenantKindSchema>;

/**
 * What a workspace is entitled to. Set by a completed payment, or by hand for
 * a workspace we grant (packages/db/scripts/set-plan.mjs).
 *
 * `pro` alone does NOT mean "currently paid" — it is read together with
 * `paidUntil`, which is when the paid period runs out. A hand-granted
 * workspace has `pro` and no `paidUntil`, and so never runs out.
 */
export const TenantPlanSchema = z.enum(['trial', 'pro']);
export type TenantPlan = z.infer<typeof TenantPlanSchema>;

/** How long a new workspace gets for free. The deadline itself is stamped by the database. */
export const TRIAL_DAYS = 7;

/**
 * Where a workspace stands, decided by the SERVER and read by the shell:
 *   'trial'  — inside the free window; `daysLeft` counts down.
 *   'ended'  — the free window closed and nothing was ever paid.
 *   'pro'    — paid, and the paid period still has time left.
 *   'lapsed' — paid once, and that period has run out.
 *
 * 'lapsed' is separate from 'ended' because renewal is MANUAL: a paying
 * customer reaching the end of a month and not having paid the next one is the
 * ordinary case, not an edge case, and telling them "your free trial has
 * ended" months after they first paid us is simply false. Both states lock the
 * product; only the sentence differs.
 *
 * The browser is told this so it can show the right screen; it is never what
 * enforces it — the API decides again on every request.
 */
export const TenantAccessSchema = z.object({
  state: z.enum(['trial', 'ended', 'pro', 'lapsed']),
  /**
   * Whole days of access left — of the free window in 'trial', of the paid
   * period in 'pro'. 0 in both locked states, and 0 on a hand-granted
   * workspace, which has no end to count towards.
   */
  daysLeft: z.number().int().nonnegative(),
  trialEndsAt: z.iso.datetime(),
  /** End of the paid period; null on a workspace that has never paid. */
  paidUntil: z.iso.datetime().nullable(),
});
export type TenantAccess = z.infer<typeof TenantAccessSchema>;

/**
 * Is the product closed to this workspace?
 *
 * Lives in the contract rather than on either side, because BOTH sides ask it
 * — the API to refuse the request, the shell to draw the Get Pro page instead
 * of the one asked for — and they have to agree. Adding 'lapsed' found three
 * separate `state === 'ended'` checks that each had to be remembered; there is
 * now one, and the next state is a change to this function alone.
 */
export function accessLocked(access: TenantAccess): boolean {
  return access.state === 'ended' || access.state === 'lapsed';
}

export const MeResponseSchema = z.object({
  userId: z.uuid(),
  role: MembershipRoleSchema,
  tenant: z
    .object({
      id: z.uuid(),
      name: z.string(),
      kind: TenantKindSchema,
      /** When the workspace was created. */
      createdAt: z.iso.datetime(),
      plan: TenantPlanSchema,
      access: TenantAccessSchema,
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** One person in the workspace, as the Admin page lists them. */
export const WorkspaceMemberSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: MembershipRoleSchema,
  joinedAt: z.iso.datetime(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const WorkspaceMemberListSchema = z.object({
  members: z.array(WorkspaceMemberSchema),
});
export type WorkspaceMemberList = z.infer<typeof WorkspaceMemberListSchema>;

/** API route paths — one source of truth for both sides of the BFF. */
export const API_PATHS = {
  health: '/health',
  me: '/me',
  documents: '/documents',
  templates: '/templates',
  signatureRequests: '/signature-requests',
  folders: '/folders',
  onboardingPersonal: '/onboarding/personal',
  /** Public, unauthenticated: verify a document you hold by its fingerprint. */
  verify: '/verify',
  /** Plans, checkout and payment history for the signed-in workspace. */
  billing: '/billing',
  /**
   * Provider callbacks. NOT under /billing, and deliberately so: these carry no
   * session, are reachable by anyone, and each provider authenticates itself in
   * its own way (Payme by Basic credentials, Click by a signature over the
   * fields). Keeping them on their own prefix means no future /billing route
   * can inherit that openness by accident.
   */
  paymeCallback: '/payments/payme',
  clickCallback: '/payments/click',
} as const;

// ── Billing ─────────────────────────────────────────────────────────────────

/**
 * What a workspace can BUY, as opposed to TenantPlan, which is what it HAS.
 * You buy a `personal` or a `company` subscription; either one grants `pro`.
 * Keeping the two apart means adding a third paid tier is a new value here
 * rather than a migration of the entitlement column every route reads.
 */
export const BillingPlanSchema = z.enum(['personal', 'company']);
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

/**
 * The price list, in TIYIN — 1 so'm = 100 tiyin.
 *
 * Integer minor units, never so'm as a float. Money in binary floating point
 * accumulates fractions that cannot be represented, and a single tiyin of
 * drift is not a rounding cosmetic here: both providers compare the amount
 * they were told against the amount we confirm, and reject the payment
 * outright when they differ.
 *
 * Payme quotes in tiyin and Click quotes in so'm, so exactly one adapter
 * converts (see sumFromTiyin). This table stays the only place a price lives —
 * change a number here and the checkout, the callbacks, the Get Pro page and
 * the landing page all follow.
 *
 * Flat per workspace: the member count does not enter the bill.
 */
export const PLAN_PRICE_TIYIN = {
  personal: 9_900_000, //  99 000 so'm per month
  company: 29_900_000, // 299 000 so'm per month
} as const satisfies Record<BillingPlan, number>;

/**
 * The longest single purchase. A year is as far ahead as anyone sensibly
 * pre-pays, and the cap matters: `months` arrives from the browser and decides
 * both the amount charged and how much access is granted.
 */
export const MAX_BILLING_MONTHS = 12;

/** 1 so'm = 100 tiyin. Named so the conversions below cannot be read as magic. */
export const TIYIN_PER_SUM = 100;

/**
 * Tiyin → so'm, for Click (which quotes whole so'm) and for display.
 * Every price in PLAN_PRICE_TIYIN is a whole number of so'm, so this divides
 * exactly; it throws rather than rounding if that ever stops being true,
 * because silently charging a different amount is the failure to avoid.
 */
export function sumFromTiyin(tiyin: number): number {
  if (!Number.isInteger(tiyin) || tiyin % TIYIN_PER_SUM !== 0) {
    throw new Error(`Amount ${tiyin} tiyin is not a whole number of so'm`);
  }
  return tiyin / TIYIN_PER_SUM;
}

export const PaymentProviderSchema = z.enum(['payme', 'click']);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

/**
 * A payment's life: created when we hand the customer to a provider, and then
 * exactly one of paid or cancelled. There is no 'failed' — a provider that
 * never comes back leaves the row `pending` for ever, which is the truth.
 */
export const PaymentStatusSchema = z.enum(['pending', 'paid', 'cancelled']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

/** Start a purchase: what, through whom, for how long. */
export const CheckoutRequestSchema = z.object({
  plan: BillingPlanSchema,
  provider: PaymentProviderSchema,
  months: z.number().int().min(1).max(MAX_BILLING_MONTHS).default(1),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

/**
 * Where to send the browser. The amount comes back too so the page can state
 * what is about to be charged in the same number the provider will show.
 */
export const CheckoutResponseSchema = z.object({
  paymentId: z.uuid(),
  payUrl: z.url(),
  amountTiyin: z.number().int().positive(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

/** One line of the workspace's payment history. */
export const PaymentSchema = z.object({
  id: z.uuid(),
  plan: BillingPlanSchema,
  provider: PaymentProviderSchema,
  status: PaymentStatusSchema,
  amountTiyin: z.number().int().nonnegative(),
  months: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  /** What this payment bought, once it was paid. */
  periodEnd: z.iso.datetime().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const PaymentListSchema = z.object({ payments: z.array(PaymentSchema) });
export type PaymentList = z.infer<typeof PaymentListSchema>;

// ── Folders ─────────────────────────────────────────────────────────────────

/** A sender-created filing folder. Organisational only — never a permission. */
export const FolderSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  /** Envelopes currently filed here (excludes deleted). */
  count: z.number().int().nonnegative(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const FolderListSchema = z.object({ folders: z.array(FolderSchema) });
export type FolderList = z.infer<typeof FolderListSchema>;

export const CreateFolderSchema = z.object({ name: z.string().min(1).max(120) });
export type CreateFolder = z.infer<typeof CreateFolderSchema>;

/** Bulk file/unfile. `folderId: null` moves envelopes back out to no folder. */
export const MoveToFolderSchema = z.object({
  requestIds: z.array(z.uuid()).min(1).max(200),
  folderId: z.uuid().nullable(),
});
export type MoveToFolder = z.infer<typeof MoveToFolderSchema>;

/** Bulk soft-delete / restore. Evidence is never destroyed, only hidden. */
export const BulkRequestIdsSchema = z.object({
  requestIds: z.array(z.uuid()).min(1).max(200),
});
export type BulkRequestIds = z.infer<typeof BulkRequestIdsSchema>;

// ── Signature requests (send flow) ──────────────────────────────────────────

export const SignatureStatusSchema = z.enum([
  'sent',
  'viewed',
  'completed',
  'voided',
  'expired',
]);
export type SignatureStatus = z.infer<typeof SignatureStatusSchema>;

export const RecipientRoleSchema = z.enum(['signer', 'cc']);
export type RecipientRole = z.infer<typeof RecipientRoleSchema>;

export const RecipientStatusSchema = z.enum(['pending', 'sent', 'viewed', 'completed']);
export type RecipientStatus = z.infer<typeof RecipientStatusSchema>;

export const RoutingModeSchema = z.enum(['parallel', 'sequential']);
export type RoutingMode = z.infer<typeof RoutingModeSchema>;

/** One person on an envelope, as the sender specifies them. */
export const SendRecipientSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200).optional(),
  role: RecipientRoleSchema.default('signer'),
  /** 1-based group; everyone sharing a number is invited together. */
  routingOrder: z.number().int().min(1).max(50).default(1),
  /** Which field group they fill — must match a field's recipientKey. */
  recipientKey: z.string().min(1).max(64).default('signer'),
});
export type SendRecipient = z.infer<typeof SendRecipientSchema>;

/**
 * Create an envelope from a template and its people. At least one signer is
 * required — an envelope nobody can sign is never what the sender meant.
 */
export const SendRequestSchema = z
  .object({
    templateId: z.uuid(),
    routingMode: RoutingModeSchema.default('parallel'),
    recipients: z.array(SendRecipientSchema).min(1).max(50),
    /** The sender's own subject line and note on the invitation email. */
    subject: z.string().max(200).optional(),
    message: z.string().max(2000).optional(),
  })
  .refine((b) => b.recipients.some((r) => r.role === 'signer'), {
    message: 'at least one recipient must be a signer',
  })
  .refine(
    (b) => new Set(b.recipients.map((r) => r.email.toLowerCase())).size === b.recipients.length,
    { message: 'the same email cannot appear twice on one envelope' },
  );
export type SendRequest = z.infer<typeof SendRequestSchema>;

/** A recipient as the sender's dashboard sees them (no tokens, ever). */
export const RecipientSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
  role: RecipientRoleSchema,
  routingOrder: z.number().int(),
  status: RecipientStatusSchema,
  sentAt: z.iso.datetime().nullable(),
  viewedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  signerIp: z.string().nullable(),
});
export type Recipient = z.infer<typeof RecipientSchema>;

export const SignatureRequestSchema = z.object({
  id: z.uuid(),
  documentName: z.string(),
  /** The first signer — kept for compact list rows. */
  recipientEmail: z.email(),
  recipientName: z.string().nullable(),
  routingMode: RoutingModeSchema,
  /** How many signers have finished, out of how many are required. */
  signedCount: z.number().int().nonnegative(),
  signerCount: z.number().int().nonnegative(),
  status: SignatureStatusSchema,
  sentAt: z.iso.datetime(),
  viewedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
  /** Most recent movement of any kind — the "Last Change" column. */
  lastChangeAt: z.iso.datetime(),
  /** Who the sender is still waiting on, if anyone. */
  waitingOn: z.string().nullable(),
  folderId: z.uuid().nullable(),
  folderName: z.string().nullable(),
  /** Who sent it, captured at send time. */
  senderEmail: z.string().nullable(),
  /** Set once the sender has moved it to the Deleted view. */
  deletedAt: z.iso.datetime().nullable(),
  /** True once the sealed copy exists and can be downloaded from a list row. */
  hasSignedPdf: z.boolean(),
});
export type SignatureRequest = z.infer<typeof SignatureRequestSchema>;

export const SignatureRequestListSchema = z.object({
  requests: z.array(SignatureRequestSchema),
});
export type SignatureRequestList = z.infer<typeof SignatureRequestListSchema>;

/**
 * The full audit record behind one request — everything the Certificate of
 * Completion attests, in structured form, for the sender's detail page.
 */
export const SignatureRequestDetailSchema = SignatureRequestSchema.extend({
  /** Everyone on the envelope, in routing order. */
  recipients: z.array(RecipientSchema),
  consentAt: z.iso.datetime().nullable(),
  signatureMethod: z.string().nullable(),
  viewedIp: z.string().nullable(),
  viewedUserAgent: z.string().nullable(),
  signerIp: z.string().nullable(),
  signerUserAgent: z.string().nullable(),
  /** sha256 of the signed PDF; null until the completion pipeline has run. */
  documentHash: z.string().nullable(),
  sealKid: z.string().nullable(),
  /** Whether the sealed artifacts exist yet (the pipeline is async). */
  hasSignedPdf: z.boolean(),
  hasCertificate: z.boolean(),
});
export type SignatureRequestDetail = z.infer<typeof SignatureRequestDetailSchema>;

/**
 * The tamper check: the server re-hashes the STORED signed PDF and verifies the
 * Ed25519 seal over {requestId, signedAt, hash}. `valid` false means the file
 * changed since signing, or the seal doesn't belong to this request.
 */
export const VerifyResultSchema = z.object({
  valid: z.boolean(),
  /** Hash recomputed from the stored bytes right now. */
  computedHash: z.string().nullable(),
  /** Hash recorded at signing time. */
  recordedHash: z.string().nullable(),
  hashMatches: z.boolean(),
  sealValid: z.boolean(),
  sealKid: z.string().nullable(),
  checkedAt: z.iso.datetime(),
});
export type VerifyResult = z.infer<typeof VerifyResultSchema>;

/**
 * PUBLIC verification: the same proof, for someone with no account.
 *
 * The check above is for the sender — it re-hashes the copy in OUR storage.
 * This one is for whoever is holding the file: they hash their own bytes and
 * ask whether that fingerprint belongs to something we sealed. It is the door
 * that makes "anyone can verify, without trusting us" true rather than
 * merely architectural.
 *
 * A hash, never the file. The document is fingerprinted in the browser and
 * only the digest is sent, so a contract nobody has agreed to share with us
 * never leaves the machine it is on.
 */
export const PublicVerifyRequestSchema = z.object({
  /** Lowercase SHA-256 hex of the caller's own copy. */
  documentHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/, 'expected a lowercase SHA-256 hex digest'),
});
export type PublicVerifyRequest = z.infer<typeof PublicVerifyRequestSchema>;

/**
 * Deliberately thin. A hash proves nothing about possession — someone could
 * have read one off a certificate — so a successful lookup discloses only
 * that the document exists and when it was sealed. No name, no signers, no
 * workspace: a caller learns whether the file they hold is intact, which is
 * the entire question, and nothing else about anybody's business.
 *
 * `verified: false` covers both "never sealed here" and "altered since", and
 * that is not a gap. Change one byte and the fingerprint changes, so there is
 * no row to find — the two cases are indistinguishable by construction, and
 * the answer a holder needs is the same either way.
 */
export const PublicVerifyResultSchema = z.object({
  verified: z.boolean(),
  /** When the envelope completed. Null when nothing matched. */
  sealedAt: z.iso.datetime().nullable(),
  /** Which key in the ring signed it, for a reader checking by hand. */
  sealKid: z.string().nullable(),
  checkedAt: z.iso.datetime(),
});
export type PublicVerifyResult = z.infer<typeof PublicVerifyResultSchema>;

// ── Templates & field layout ────────────────────────────────────────────────

/**
 * The field types a sender can place. Three families, and the distinction is
 * a security boundary, not a UI one:
 *   - marks   (signature/initial/stamp) take the adopted signature image;
 *   - auto    (date, shown as "Date Signed") is computed by the SERVER from the
 *             signing moment and never accepted from the client;
 *   - inputs  (every other type) are authored by the signer, and each must
 *             pass its FIELD_VALUE_RULES entry below.
 * name/first_name/last_name/email were auto until 2026-09; the signer types
 * them now (a product decision). The certificate — the invited address and
 * possession of its link — is what proves who signed; those boxes are the
 * signer's own statement, like any other input.
 * See apps/api/src/modules/signing/field-values.ts — that file is the one that
 * decides, and this list must stay in step with it.
 */
export const FieldTypeSchema = z.enum([
  'signature',
  'initial',
  'stamp',
  'date',
  'name',
  'first_name',
  'last_name',
  'email',
  'company',
  'title',
  'text',
  'number',
  'phone',
  'address',
  'checkbox',
  'dropdown',
  'radio',
  // A date the signer picks (a start date, a birth date). Not Date Signed —
  // that is `date`, and it stays server truth.
  'date_input',
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

// ── What a signer may enter into each box ───────────────────────────────────

/**
 * Characters the sealed PDF can print. Stamping draws with a standard WinAnsi
 * font (toPdfSafeText in @docflow/crypto), which turns anything else into '?'
 * — so a value outside this set would reach a legal document as marks the
 * signer never saw. Refusing it at the box, where it can still be fixed, is
 * the honest answer until a Unicode font lands. Mirrors toPdfSafeText's
 * pass-through ranges and transliterations; a test in apps/api pins the two
 * together.
 */
const PRINTABLE =
  /^[\x20-\x7E\xA0-\xFF‘’“”–—…•ʻʼ]*$/;

/**
 * A person's name the stamper can print: Latin letters (accents included) and
 * the joins names really use — space, hyphen, full stop, and every apostrophe
 * Uzbek is typed with (' ` ‘ ’ ʻ ʼ — oʻ and gʻ are letters there). At least one
 * letter, so a box of punctuation is not a name.
 */
const PERSON_NAME =
  /^(?=.*[A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\xFF])[A-Za-z\xC0-\xD6\xD8-\xF6\xF8-\xFF '`‘’ʻʼ.-]+$/;

/**
 * What may be TYPED into a name box. Letters of any script get through, so a
 * Cyrillic name appears and is explained instead of silently vanishing;
 * digits and symbols never belong in a name and are dropped as typed.
 */
const NAME_CHAR = /[\p{L}\p{M} '`‘’.-]/u;

/** The range a Date box accepts — also the calendar picker's min and max. */
export const DATE_INPUT_MIN = '1900-01-01';
export const DATE_INPUT_MAX = '2200-12-31';

/** YYYY-MM-DD naming a day that exists (no 30 February), inside the range above. */
function isCalendarDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m || value < DATE_INPUT_MIN || value > DATE_INPUT_MAX) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d;
}

export interface FieldValueRule {
  /** Longest accepted value, in characters, after trimming. */
  max: number;
  /** The whole value — trimmed, and never empty (empty is "not filled"). */
  valid: z.ZodType<string>;
  /** Characters dropped as they are typed: ones no valid value can contain. */
  chars?: RegExp;
  /** What the box accepts, in words: the signer's error, the sender's description. */
  hint: string;
}

const printable = (max: number): FieldValueRule => ({
  max,
  valid: z.string().regex(PRINTABLE),
  hint: 'Latin letters, numbers and punctuation only',
});

const personName = (max: number): FieldValueRule => ({
  max,
  valid: z.string().regex(PERSON_NAME),
  chars: NAME_CHAR,
  hint: 'Latin letters only — spaces, hyphens and apostrophes are fine',
});

const choice: FieldValueRule = {
  // Membership in the sender's options needs the field itself, so the API
  // checks that (field-values.ts). Here: only the length the editor allows.
  max: 120,
  valid: z.string(),
  hint: 'Choose one of the offered options',
};

/**
 * What a signer may enter into each box — ONE definition for both sides: the
 * signing app drops impossible characters as they are typed and explains a
 * bad value on the spot; the API refuses the same value when the browser was
 * bypassed. Exhaustive over FieldType on purpose: a new type does not compile
 * until someone decides whether the signer types it (a rule) or not (null).
 * Marks and Date Signed are null — nothing typed ever reaches them.
 */
export const FIELD_VALUE_RULES: Record<FieldType, FieldValueRule | null> = {
  signature: null,
  initial: null,
  stamp: null,
  date: null,
  name: personName(100),
  first_name: personName(60),
  last_name: personName(60),
  email: {
    max: 254,
    valid: z.email(),
    chars: /\S/,
    hint: 'An email address, like name@example.com',
  },
  company: printable(200),
  title: printable(120),
  text: printable(500),
  number: {
    max: 30,
    // An optional minus, digits, and at most one decimal mark — a full stop,
    // or the comma Uzbek and Russian write decimals with.
    valid: z.string().regex(/^-?\d+(?:[.,]\d+)?$/),
    chars: /[\d.,-]/,
    hint: 'Numbers only, like 42 or 3.5',
  },
  phone: {
    max: 30,
    // E.164 caps a number at 15 digits; under 7 reaches no one anywhere.
    valid: z
      .string()
      .regex(/^\+?[\d ()-]+$/)
      .refine((v) => {
        const digits = v.replace(/\D/g, '').length;
        return digits >= 7 && digits <= 15;
      }),
    chars: /[\d+() -]/,
    hint: 'A phone number, like +998 90 123 45 67',
  },
  address: printable(300),
  checkbox: {
    max: 4,
    valid: z.string().refine((v) => v === 'true'),
    hint: 'Tick the box',
  },
  dropdown: choice,
  radio: choice,
  date_input: {
    max: 10,
    valid: z.string().refine(isCalendarDate),
    hint: 'A date, picked from the calendar',
  },
};

/**
 * Why `value` cannot go into a box of `type`, in words the signer can act on —
 * or null when it can. Checks the TRIMMED value. Empty passes: "not filled" is
 * the required check's business, not this one's. Types with no rule (marks,
 * Date Signed) answer null, because nothing typed ever reaches them.
 */
export function fieldValueProblem(type: FieldType, value: string): string | null {
  const rule = FIELD_VALUE_RULES[type];
  const v = value.trim();
  if (!rule || v === '') return null;
  if (v.length > rule.max || !rule.valid.safeParse(v).success) return rule.hint;
  return null;
}

/**
 * `raw` as the box should hold it while the signer types: characters no valid
 * value can contain are dropped, and it is capped at the box's length. A letter
 * typed into a Number box simply never appears.
 */
export function sanitizeFieldInput(type: FieldType, raw: string): string {
  const rule = FIELD_VALUE_RULES[type];
  if (!rule) return raw;
  const chars = rule.chars;
  const kept = chars ? Array.from(raw).filter((ch) => chars.test(ch)).join('') : raw;
  return kept.slice(0, rule.max);
}

const fraction = z.number().min(0).max(1);

/**
 * One placed field. Coordinates are NORMALIZED fractions of the page, TOP-LEFT
 * origin (x,y = the field's top-left corner; w,h = size) — resolution- and
 * zoom-independent. The stamper converts to PDF's bottom-left origin.
 * `recipientKey` groups fields per recipient (single "signer" until Phase B).
 */
export const TemplateFieldSchema = z
  .object({
    id: z.uuid(),
    type: FieldTypeSchema,
    page: z.number().int().min(1),
    x: fraction,
    y: fraction,
    w: fraction.min(0.005),
    h: fraction.min(0.005),
    required: z.boolean().default(true),
    recipientKey: z.string().min(1).max(64).default('signer'),
    label: z.string().max(200).optional(),
    /**
     * The permitted values for a dropdown or radio field. The server rejects
     * anything outside this list at submit time, so the choices a sender
     * offers are the only choices that can ever end up in the sealed PDF.
     */
    options: z.array(z.string().min(1).max(120)).max(30).optional(),
  })
  .refine((f) => f.x + f.w <= 1.0001 && f.y + f.h <= 1.0001, {
    message: 'field extends past the page bounds',
  })
  .refine(
    (f) => !['dropdown', 'radio'].includes(f.type) || (f.options?.length ?? 0) >= 1,
    { message: 'a dropdown or radio field needs at least one option' },
  );
export type TemplateField = z.infer<typeof TemplateFieldSchema>;

export const TemplateFieldsSchema = z.array(TemplateFieldSchema).max(500);

export const PageSizeSchema = z.object({ w: z.number().positive(), h: z.number().positive() });

export const TemplateSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  documentId: z.uuid(),
  pageCount: z.number().int().positive(),
  pageSizes: z.array(PageSizeSchema),
  fields: TemplateFieldsSchema,
  /** Starred — drives the home page's favourites shelf. */
  favorite: z.boolean(),
  /** When an envelope was last SENT from it (not when it was last edited). */
  lastUsedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Template = z.infer<typeof TemplateSchema>;

/** List rows omit the (potentially large) field layout. */
export const TemplateSummarySchema = TemplateSchema.omit({ fields: true, pageSizes: true });
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

export const TemplateListSchema = z.object({ templates: z.array(TemplateSummarySchema) });
export type TemplateList = z.infer<typeof TemplateListSchema>;

/** PATCH body: rename, star, and/or replace the whole field layout. */
export const TemplateUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    fields: TemplateFieldsSchema.optional(),
    favorite: z.boolean().optional(),
  })
  .refine((b) => b.name !== undefined || b.fields !== undefined || b.favorite !== undefined, {
    message: 'nothing to update',
  });
export type TemplateUpdate = z.infer<typeof TemplateUpdateSchema>;

/**
 * The starter library: ready-made documents a new workspace can send on day
 * one. The API renders them on demand, so a starter is a catalog entry here,
 * not a stored file.
 */
export const StarterTemplateSchema = z.object({
  key: z.string(),
  name: z.string(),
  category: z.string(),
  summary: z.string(),
});
export type StarterTemplate = z.infer<typeof StarterTemplateSchema>;

export const StarterTemplateListSchema = z.object({
  starters: z.array(StarterTemplateSchema),
});
export type StarterTemplateList = z.infer<typeof StarterTemplateListSchema>;

export const StarterPickSchema = z.object({ key: z.string().min(1).max(64) });
export type StarterPick = z.infer<typeof StarterPickSchema>;

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

// ── Public signing ceremony ─────────────────────────────────────────────────
// (After the templates block — reuses PageSizeSchema + TemplateFieldsSchema.)

/** What the signer's browser gets to render the ceremony (no secrets). */
export const SignerViewSchema = z.object({
  documentName: z.string(),
  recipientName: z.string().nullable(),
  /** The signer's own address — for the completion screen. Never typed into a box for them. */
  signerEmail: z.email(),
  pageCount: z.number().int().positive(),
  pageSizes: z.array(PageSizeSchema),
  fields: TemplateFieldsSchema,
  status: SignatureStatusSchema,
  /** Set once the signer has agreed to sign electronically (consent step). */
  consentAt: z.iso.datetime().nullable(),
  /** True once signed — the ceremony shows a completion screen, not the form. */
  completed: z.boolean(),
});
export type SignerView = z.infer<typeof SignerViewSchema>;

/** Consent to sign electronically — recorded BEFORE any field is filled. */
export const ConsentSchema = z.object({ agreed: z.literal(true) });
export type Consent = z.infer<typeof ConsentSchema>;

export const SignatureMethodSchema = z.enum(['typed', 'drawn', 'uploaded']);
export type SignatureMethod = z.infer<typeof SignatureMethodSchema>;

/**
 * The signer's submission: the adopted-signature PNG plus the values they
 * entered for non-signature fields (keyed by field id), each checked against
 * FIELD_VALUE_RULES when it arrives. Consent is recorded separately, before
 * this, so the evidence never claims a signature predating consent.
 */
export const SubmitSignatureSchema = z.object({
  method: SignatureMethodSchema,
  signatureImage: z.string().startsWith('data:image/png;base64,').max(3_000_000),
  fieldValues: z.record(z.string(), z.string().max(500)).default({}),
});
export type SubmitSignature = z.infer<typeof SubmitSignatureSchema>;

export const PACKAGE_NAME = '@docflow/contracts' as const;

/** Cancel an envelope. The reason (if given) is shown to the recipients. */
export const VoidRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type VoidRequest = z.infer<typeof VoidRequestSchema>;
