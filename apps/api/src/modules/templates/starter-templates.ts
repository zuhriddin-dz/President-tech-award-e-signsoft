import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toPdfSafeText } from '@docflow/crypto';
import type { FieldType } from '@docflow/contracts';

/**
 * The starter-template library: ready-to-send documents a new workspace can
 * use on day one, instead of staring at an empty Templates page.
 *
 * Each starter is a SPEC, not a stored file — we render the PDF with pdf-lib
 * on demand and place its fields at the same time. That keeps the library in
 * version control (reviewable, diffable) rather than as opaque binaries, and
 * means the tagged coordinates can never drift from the layout that produced
 * them: both come out of the same render pass.
 */

export type StarterCategory =
  | 'Cross-Industry'
  | 'Education'
  | 'Financial Services'
  | 'Human Resources'
  | 'Real Estate';

/** A line on the form. `input` lines get a tagged field over their rule. */
interface Line {
  label: string;
  /** Field to place on this line; omitted means a plain printed line. */
  field?: FieldType;
  /** Fraction of the content width this line occupies (default 1). */
  width?: number;
  required?: boolean;
}

interface Block {
  heading?: string;
  /** Body paragraph printed above the lines. */
  body?: string;
  lines?: Line[];
}

export interface StarterSpec {
  key: string;
  name: string;
  category: StarterCategory;
  /** One-line description shown in the picker. */
  summary: string;
  intro: string;
  blocks: Block[];
  /** Wording above the signature block. */
  attestation: string;
}

export const STARTER_TEMPLATES: StarterSpec[] = [
  {
    key: 'purchase-order',
    name: 'Purchase Order',
    category: 'Cross-Industry',
    summary: 'Order goods or services at an agreed price, signed by both sides.',
    intro:
      'This Purchase Order authorises the supplier named below to provide the goods or services described, at the prices stated, subject to the terms agreed between the parties.',
    blocks: [
      {
        heading: 'Buyer',
        lines: [
          { label: 'Company', field: 'company' },
          { label: 'Contact name', field: 'name' },
          { label: 'Email', field: 'email' },
        ],
      },
      {
        heading: 'Order details',
        lines: [
          { label: 'PO number', field: 'text' },
          { label: 'Description of goods / services', field: 'text' },
          { label: 'Quantity', field: 'text', width: 0.45 },
          { label: 'Unit price', field: 'text', width: 0.45 },
          { label: 'Total', field: 'text', width: 0.45 },
          { label: 'Required delivery date', field: 'text', width: 0.45 },
        ],
      },
      {
        heading: 'Terms',
        body: 'Payment is due within 30 days of delivery unless otherwise agreed in writing. Delivery must match the description and quantity above. Partial shipments require prior written approval.',
      },
    ],
    attestation:
      'By signing, the supplier accepts this Purchase Order and agrees to supply the goods or services described above on the stated terms.',
  },
  {
    key: 'sales-contract',
    name: 'Sales Contract',
    category: 'Cross-Industry',
    summary: 'A short-form agreement to sell goods, with price and delivery terms.',
    intro:
      'This Sales Contract records the sale of the goods described below from the seller to the buyer, on the terms set out in this document.',
    blocks: [
      {
        heading: 'Parties',
        lines: [
          { label: 'Seller', field: 'company' },
          { label: 'Buyer (full name)', field: 'name' },
          { label: 'Buyer email', field: 'email' },
        ],
      },
      {
        heading: 'The goods',
        lines: [
          { label: 'Description', field: 'text' },
          { label: 'Purchase price', field: 'text', width: 0.45 },
          { label: 'Deposit paid', field: 'text', width: 0.45 },
          { label: 'Delivery date', field: 'text', width: 0.45 },
          { label: 'Delivery address', field: 'text' },
        ],
      },
      {
        heading: 'Title and risk',
        body: 'Title to the goods passes to the buyer on payment in full. Risk passes on delivery. The seller warrants that it has the right to sell the goods and that they are free of undisclosed encumbrances.',
      },
    ],
    attestation:
      'Both parties agree to the terms of this Sales Contract as of the date signed below.',
  },
  {
    key: 'statement-of-work',
    name: 'Statement of Work (SOW)',
    category: 'Cross-Industry',
    summary: 'Scope, deliverables, timeline and fees for a piece of work.',
    intro:
      'This Statement of Work describes the services to be performed, what will be delivered, when, and on what commercial terms. It forms part of the agreement between the parties.',
    blocks: [
      {
        heading: 'Engagement',
        lines: [
          { label: 'Client', field: 'company' },
          { label: 'Project name', field: 'text' },
          { label: 'Start date', field: 'text', width: 0.45 },
          { label: 'Target completion', field: 'text', width: 0.45 },
        ],
      },
      {
        heading: 'Scope of work',
        body: 'The provider will perform the services described below. Anything not listed here is out of scope and requires a written change order before work begins.',
        lines: [
          { label: 'Deliverable 1', field: 'text' },
          { label: 'Deliverable 2', field: 'text' },
          { label: 'Deliverable 3', field: 'text' },
        ],
      },
      {
        heading: 'Fees',
        lines: [
          { label: 'Fee structure', field: 'text', width: 0.45 },
          { label: 'Total estimated fee', field: 'text', width: 0.45 },
          { label: 'Invoicing schedule', field: 'text' },
        ],
      },
    ],
    attestation:
      'By signing, the client approves this Statement of Work and authorises the provider to begin.',
  },
  {
    key: 'new-badge-request',
    name: 'New Badge Request',
    category: 'Cross-Industry',
    summary: 'Request a building access badge, approved by a manager.',
    intro:
      'Use this form to request a new or replacement access badge. Requests must be approved by the requester’s manager before a badge is issued.',
    blocks: [
      {
        heading: 'Requester',
        lines: [
          { label: 'Full name', field: 'name' },
          { label: 'Email', field: 'email' },
          { label: 'Department', field: 'text', width: 0.45 },
          { label: 'Job title', field: 'title', width: 0.45 },
        ],
      },
      {
        heading: 'Access needed',
        lines: [
          { label: 'Building / site', field: 'text' },
          { label: 'Areas required', field: 'text' },
          { label: 'Reason for request', field: 'text' },
          { label: 'Replacement for a lost badge', field: 'checkbox', width: 0.2 },
        ],
      },
    ],
    attestation:
      'The requester confirms the information above is accurate and agrees to report a lost or stolen badge immediately.',
  },
  {
    key: 'nda',
    name: 'Mutual Non-Disclosure Agreement',
    category: 'Cross-Industry',
    summary: 'Protect confidential information shared in both directions.',
    intro:
      'This Agreement protects confidential information that either party discloses to the other while exploring or conducting a business relationship.',
    blocks: [
      {
        heading: 'Parties',
        lines: [
          { label: 'Disclosing party', field: 'company' },
          { label: 'Receiving party (full name)', field: 'name' },
          { label: 'Email', field: 'email' },
        ],
      },
      {
        heading: 'Confidentiality',
        body: 'Each party will keep the other’s confidential information secret, use it only for the agreed purpose, and disclose it only to people who need it and are bound by equivalent obligations. This obligation continues for five years from the date of disclosure, and indefinitely for anything that qualifies as a trade secret.',
      },
      {
        heading: 'Exclusions',
        body: 'Confidential information does not include anything that is already public, was known before disclosure, is independently developed without reference to the disclosure, or is lawfully received from a third party.',
      },
    ],
    attestation:
      'By signing, each party agrees to the confidentiality obligations set out above.',
  },
  {
    key: 'offer-letter',
    name: 'Employment Offer Letter',
    category: 'Human Resources',
    summary: 'Offer a role with title, start date and compensation.',
    intro:
      'We are pleased to offer you the position described below. This letter sets out the main terms of the offer; your employment is subject to the conditions stated at the end.',
    blocks: [
      {
        heading: 'The role',
        lines: [
          { label: 'Candidate name', field: 'name' },
          { label: 'Position', field: 'title' },
          { label: 'Start date', field: 'text', width: 0.45 },
          { label: 'Reports to', field: 'text', width: 0.45 },
          { label: 'Work location', field: 'text' },
        ],
      },
      {
        heading: 'Compensation',
        lines: [
          { label: 'Base salary', field: 'text', width: 0.45 },
          { label: 'Pay frequency', field: 'text', width: 0.45 },
          { label: 'Other compensation', field: 'text' },
        ],
      },
      {
        heading: 'Conditions',
        body: 'This offer is contingent on satisfactory reference checks, proof of your right to work, and your agreement to the company’s confidentiality policy. Employment is at will and either party may end it with the notice required by law.',
      },
    ],
    attestation:
      'By signing below, you accept this offer of employment on the terms described.',
  },
  {
    key: 'direct-deposit',
    name: 'Direct Deposit Authorisation',
    category: 'Financial Services',
    summary: 'Authorise pay to be deposited to a bank account.',
    intro:
      'Complete this form to have your pay deposited directly into your bank account. Your authorisation stays in effect until you cancel it in writing.',
    blocks: [
      {
        heading: 'Employee',
        lines: [
          { label: 'Full name', field: 'name' },
          { label: 'Email', field: 'email' },
        ],
      },
      {
        heading: 'Account',
        lines: [
          { label: 'Bank name', field: 'text' },
          { label: 'Account type (checking / savings)', field: 'text', width: 0.45 },
          { label: 'Routing number', field: 'text', width: 0.45 },
          { label: 'Account number', field: 'text' },
        ],
      },
      {
        heading: 'Authorisation',
        body: 'I authorise my employer to deposit my pay into the account above and, if funds are deposited in error, to reverse the entry. This authorisation remains in force until I cancel it in writing with reasonable notice.',
      },
    ],
    attestation:
      'I confirm the account details above are correct and authorise direct deposit to that account.',
  },
  {
    key: 'account-change-request',
    name: 'Account Change Request',
    category: 'Financial Services',
    summary: 'Update contact, ownership or mailing details on an account.',
    intro:
      'Use this form to request a change to an existing account. Changes take effect once the request has been verified and countersigned.',
    blocks: [
      {
        heading: 'Account holder',
        lines: [
          { label: 'Full name', field: 'name' },
          { label: 'Account number', field: 'text', width: 0.45 },
          { label: 'Email on file', field: 'email', width: 0.45 },
        ],
      },
      {
        heading: 'Requested change',
        lines: [
          { label: 'What should change', field: 'text' },
          { label: 'New value', field: 'text' },
          { label: 'Effective date', field: 'text', width: 0.45 },
        ],
      },
    ],
    attestation:
      'I confirm I am authorised to request this change and that the details provided are accurate.',
  },
  {
    key: 'field-trip-permission',
    name: 'Field Trip Permission Slip',
    category: 'Education',
    summary: 'Parent or guardian consent for a school trip.',
    intro:
      'Your child has been invited on the school trip described below. Please review the details and sign to give permission.',
    blocks: [
      {
        heading: 'Student',
        lines: [
          { label: 'Student name', field: 'text' },
          { label: 'Class / year group', field: 'text', width: 0.45 },
          { label: 'Date of birth', field: 'text', width: 0.45 },
        ],
      },
      {
        heading: 'The trip',
        lines: [
          { label: 'Destination', field: 'text' },
          { label: 'Date', field: 'text', width: 0.45 },
          { label: 'Departure / return time', field: 'text', width: 0.45 },
          { label: 'Cost', field: 'text', width: 0.45 },
        ],
      },
      {
        heading: 'Parent or guardian',
        lines: [
          { label: 'Full name', field: 'name' },
          { label: 'Email', field: 'email', width: 0.45 },
          { label: 'Emergency contact number', field: 'text', width: 0.45 },
          { label: 'My child may travel by school-arranged transport', field: 'checkbox', width: 0.2 },
        ],
      },
    ],
    attestation:
      'I give permission for my child to take part in this trip and confirm the emergency contact details above are correct.',
  },
  {
    key: 'emergency-contact-waiver',
    name: 'Emergency Contact & Medical Waiver',
    category: 'Education',
    summary: 'Emergency contacts plus consent to treat.',
    intro:
      'This form records who to contact in an emergency and authorises staff to seek medical attention if you cannot be reached.',
    blocks: [
      {
        heading: 'Participant',
        lines: [
          { label: 'Full name', field: 'text' },
          { label: 'Date of birth', field: 'text', width: 0.45 },
          { label: 'Known allergies or conditions', field: 'text' },
        ],
      },
      {
        heading: 'Emergency contacts',
        lines: [
          { label: 'Primary contact name', field: 'name' },
          { label: 'Primary contact phone', field: 'text', width: 0.45 },
          { label: 'Relationship', field: 'text', width: 0.45 },
          { label: 'Secondary contact name and phone', field: 'text' },
        ],
      },
      {
        heading: 'Consent to treat',
        body: 'If a medical emergency arises and I cannot be reached, I authorise staff to obtain medical treatment for the participant named above, and I accept responsibility for the cost of that treatment.',
      },
    ],
    attestation:
      'I confirm the information above is accurate and give the consent described.',
  },
  {
    key: 'lease-agreement',
    name: 'Residential Lease Agreement',
    category: 'Real Estate',
    summary: 'Short-form residential tenancy with rent and term.',
    intro:
      'This Lease Agreement sets out the terms on which the landlord rents the property described below to the tenant.',
    blocks: [
      {
        heading: 'Parties and property',
        lines: [
          { label: 'Landlord', field: 'company' },
          { label: 'Tenant (full name)', field: 'name' },
          { label: 'Tenant email', field: 'email' },
          { label: 'Property address', field: 'text' },
        ],
      },
      {
        heading: 'Term and rent',
        lines: [
          { label: 'Lease start date', field: 'text', width: 0.45 },
          { label: 'Lease end date', field: 'text', width: 0.45 },
          { label: 'Monthly rent', field: 'text', width: 0.45 },
          { label: 'Security deposit', field: 'text', width: 0.45 },
          { label: 'Rent due on (day of month)', field: 'text', width: 0.45 },
        ],
      },
      {
        heading: 'Condition and use',
        body: 'The tenant will keep the property in good condition, use it as a private residence only, and not sublet without written consent. The landlord is responsible for structural repairs and for keeping the property fit to live in.',
      },
    ],
    attestation:
      'By signing, both parties agree to the terms of this lease for the property and period described above.',
  },
];

export function findStarter(key: string): StarterSpec | undefined {
  return STARTER_TEMPLATES.find((s) => s.key === key);
}

// ── Rendering ──────────────────────────────────────────────────────────────

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Where a placed field ends up, in the contract's normalized top-left space. */
export interface PlacedField {
  type: FieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
}

/**
 * Render a starter to a PDF and return the bytes together with the fields
 * placed over it. Layout and tagging happen in the SAME pass, so a field can
 * never point at a line that moved.
 */
export async function renderStarter(
  spec: StarterSpec,
): Promise<{ bytes: Buffer; fields: PlacedField[] }> {
  const pdf = await PDFDocument.create();
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const fields: PlacedField[] = [];
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let pageIndex = 1;
  let y = PAGE_H - MARGIN;

  /** Start a new page when the next block would run off the bottom. */
  const ensure = (needed: number) => {
    if (y - needed >= MARGIN) return;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageIndex += 1;
    y = PAGE_H - MARGIN;
  };

  const text = (
    value: string,
    opts: { size: number; font: typeof body; color?: ReturnType<typeof rgb>; x?: number },
  ) => {
    page.drawText(toPdfSafeText(value), {
      x: opts.x ?? MARGIN,
      y,
      size: opts.size,
      font: opts.font,
      color: opts.color ?? rgb(0.07, 0, 0.2),
    });
  };

  /** Word-wrap `value` to CONTENT_W and draw it, advancing y. */
  const paragraph = (value: string, size = 10.5, lead = 15) => {
    const safe = toPdfSafeText(value);
    const words = safe.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (body.widthOfTextAtSize(candidate, size) > CONTENT_W && line) {
        ensure(lead);
        text(line, { size, font: body, color: rgb(0.25, 0.24, 0.32) });
        y -= lead;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      ensure(lead);
      text(line, { size, font: body, color: rgb(0.25, 0.24, 0.32) });
      y -= lead;
    }
  };

  // Title
  ensure(60);
  text(spec.name, { size: 20, font: bold });
  y -= 26;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 2,
    color: rgb(0.3, 0, 1),
  });
  y -= 20;
  paragraph(spec.intro);
  y -= 10;

  for (const block of spec.blocks) {
    if (block.heading) {
      ensure(34);
      text(block.heading.toUpperCase(), { size: 9.5, font: bold, color: rgb(0.3, 0, 1) });
      y -= 16;
    }
    if (block.body) {
      paragraph(block.body);
      y -= 6;
    }
    for (const line of block.lines ?? []) {
      const lineH = 34;
      ensure(lineH);
      const w = (line.width ?? 1) * CONTENT_W;
      text(line.label, { size: 9, font: body, color: rgb(0.42, 0.41, 0.49) });
      y -= 14;
      page.drawLine({
        start: { x: MARGIN, y: y - 2 },
        end: { x: MARGIN + w, y: y - 2 },
        thickness: 0.75,
        color: rgb(0.78, 0.77, 0.82),
      });
      if (line.field) {
        // Normalized, TOP-LEFT origin — the contract's coordinate space. The
        // box sits just above the rule we just drew.
        const boxH = line.field === 'checkbox' ? 14 : 18;
        const boxW = line.field === 'checkbox' ? 14 : w;
        fields.push({
          type: line.field,
          page: pageIndex,
          x: MARGIN / PAGE_W,
          y: (PAGE_H - (y + boxH - 2)) / PAGE_H,
          w: boxW / PAGE_W,
          h: boxH / PAGE_H,
          required: line.required ?? line.field !== 'checkbox',
        });
      }
      y -= 20;
    }
    y -= 8;
  }

  // Signature block — always last, always on a page with room for it.
  ensure(150);
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: rgb(0.78, 0.77, 0.82),
  });
  y -= 22;
  paragraph(spec.attestation, 10, 14);
  y -= 18;

  const sigW = 200;
  const sigH = 46;
  ensure(sigH + 60);
  text('Signature', { size: 9, font: body, color: rgb(0.42, 0.41, 0.49) });
  y -= sigH + 4;
  fields.push({
    type: 'signature',
    page: pageIndex,
    x: MARGIN / PAGE_W,
    y: (PAGE_H - (y + sigH)) / PAGE_H,
    w: sigW / PAGE_W,
    h: sigH / PAGE_H,
    required: true,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 2 },
    end: { x: MARGIN + sigW, y: y - 2 },
    thickness: 0.75,
    color: rgb(0.78, 0.77, 0.82),
  });
  y -= 18;

  // Name + date, side by side under the signature.
  const halfW = 200;
  const rightX = MARGIN + 260;
  text('Name', { size: 9, font: body, color: rgb(0.42, 0.41, 0.49) });
  text('Date signed', { size: 9, font: body, color: rgb(0.42, 0.41, 0.49), x: rightX });
  y -= 20;
  for (const [type, x] of [
    ['name', MARGIN],
    ['date', rightX],
  ] as const) {
    fields.push({
      type,
      page: pageIndex,
      x: x / PAGE_W,
      y: (PAGE_H - (y + 18)) / PAGE_H,
      w: halfW / PAGE_W,
      h: 18 / PAGE_H,
      required: true,
    });
    page.drawLine({
      start: { x, y: y - 2 },
      end: { x: x + halfW, y: y - 2 },
      thickness: 0.75,
      color: rgb(0.78, 0.77, 0.82),
    });
  }

  const bytes = Buffer.from(await pdf.save());
  return { bytes, fields };
}
