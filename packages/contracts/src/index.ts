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

export const MeResponseSchema = z.object({
  userId: z.uuid(),
  role: MembershipRoleSchema,
  tenant: z
    .object({
      id: z.uuid(),
      name: z.string(),
      kind: TenantKindSchema,
      /** When the workspace was created — drives the trial countdown. */
      createdAt: z.iso.datetime(),
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
} as const;

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
 *   - auto    (date/name/first_name/last_name/email) are computed by the
 *             SERVER from the request row and never accepted from the client;
 *   - inputs  (the rest) are genuinely authored by the signer.
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
]);
export type FieldType = z.infer<typeof FieldTypeSchema>;

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
  /** The signer's own email — used to auto-fill email/name fields. */
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
 * entered/auto-filled for non-signature fields (keyed by field id). Consent is
 * recorded separately, before this, so the evidence never claims a signature
 * predating consent.
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
