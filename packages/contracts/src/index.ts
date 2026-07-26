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
  tenant: z.object({ id: z.uuid(), name: z.string(), kind: TenantKindSchema }).nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** API route paths — one source of truth for both sides of the BFF. */
export const API_PATHS = {
  health: '/health',
  me: '/me',
  documents: '/documents',
  templates: '/templates',
  signatureRequests: '/signature-requests',
  onboardingPersonal: '/onboarding/personal',
} as const;

// ── Signature requests (send flow) ──────────────────────────────────────────

export const SignatureStatusSchema = z.enum(['sent', 'viewed', 'completed', 'voided']);
export type SignatureStatus = z.infer<typeof SignatureStatusSchema>;

/** Create a signature request from a template + one recipient. */
export const SendRequestSchema = z.object({
  templateId: z.uuid(),
  recipientEmail: z.email(),
  recipientName: z.string().min(1).max(200).optional(),
});
export type SendRequest = z.infer<typeof SendRequestSchema>;

export const SignatureRequestSchema = z.object({
  id: z.uuid(),
  documentName: z.string(),
  recipientEmail: z.email(),
  recipientName: z.string().nullable(),
  status: SignatureStatusSchema,
  sentAt: z.iso.datetime(),
  viewedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime(),
});
export type SignatureRequest = z.infer<typeof SignatureRequestSchema>;

export const SignatureRequestListSchema = z.object({
  requests: z.array(SignatureRequestSchema),
});
export type SignatureRequestList = z.infer<typeof SignatureRequestListSchema>;

// ── Templates & field layout ────────────────────────────────────────────────

/**
 * The 12 field types (DocuSign-aligned). Signature/initial/stamp are drawn
 * marks; date/name/…/title auto-fill from the signer; text/checkbox are inputs.
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
  'checkbox',
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
  })
  .refine((f) => f.x + f.w <= 1.0001 && f.y + f.h <= 1.0001, {
    message: 'field extends past the page bounds',
  });
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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Template = z.infer<typeof TemplateSchema>;

/** List rows omit the (potentially large) field layout. */
export const TemplateSummarySchema = TemplateSchema.omit({ fields: true, pageSizes: true });
export type TemplateSummary = z.infer<typeof TemplateSummarySchema>;

export const TemplateListSchema = z.object({ templates: z.array(TemplateSummarySchema) });
export type TemplateList = z.infer<typeof TemplateListSchema>;

/** PATCH body: rename and/or replace the whole field layout. */
export const TemplateUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    fields: TemplateFieldsSchema.optional(),
  })
  .refine((b) => b.name !== undefined || b.fields !== undefined, {
    message: 'nothing to update',
  });
export type TemplateUpdate = z.infer<typeof TemplateUpdateSchema>;

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
