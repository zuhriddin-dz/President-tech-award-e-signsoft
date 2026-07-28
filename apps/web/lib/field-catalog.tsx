import {
  AtSign,
  Building2,
  Calendar,
  CircleDot,
  Hash,
  IdCard,
  ListChecks,
  MapPin,
  PenLine,
  Phone,
  Signature,
  SquareCheck,
  SquareChevronDown,
  Stamp,
  Type,
  User,
  UserRound,
} from 'lucide-react';
import type { FieldType } from '@docflow/contracts';

/**
 * Everything the editor needs to know about a field type: how to label it, how
 * to draw it in the palette, its default size on the page, and — crucially —
 * which family it belongs to.
 *
 * `family` is not decoration. It mirrors the server's own classification in
 * apps/api/src/modules/signing/field-values.ts: `mark` fields take the adopted
 * signature image, `auto` fields are filled by the SERVER and are read-only to
 * the signer, `input` fields are the only ones whose value the signer supplies.
 * The ceremony renders each family differently because they mean different
 * things about who is asserting what.
 */
export type FieldFamily = 'mark' | 'auto' | 'input';

export interface FieldMeta {
  type: FieldType;
  label: string;
  group: FieldGroup;
  family: FieldFamily;
  icon: React.ReactNode;
  /** Default placement size, as page fractions. */
  w: number;
  h: number;
  /** Placeholder shown inside an unfilled box during the ceremony. */
  hint?: string;
}

export const FIELD_GROUPS = ['Standard Fields', 'Contact Information', 'Inputs'] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

const ic = 'h-[18px] w-[18px]';

export const FIELD_CATALOG: FieldMeta[] = [
  // Standard
  { type: 'signature', label: 'Signature', group: 'Standard Fields', family: 'mark', icon: <PenLine className={ic} />, w: 0.24, h: 0.055 },
  { type: 'initial', label: 'Initial', group: 'Standard Fields', family: 'mark', icon: <Signature className={ic} />, w: 0.09, h: 0.045 },
  { type: 'stamp', label: 'Stamp', group: 'Standard Fields', family: 'mark', icon: <Stamp className={ic} />, w: 0.14, h: 0.1 },
  { type: 'date', label: 'Date Signed', group: 'Standard Fields', family: 'auto', icon: <Calendar className={ic} />, w: 0.17, h: 0.028, hint: 'Date' },

  // Contact — auto-filled from the recipient we already verified.
  { type: 'name', label: 'Name', group: 'Contact Information', family: 'auto', icon: <User className={ic} />, w: 0.24, h: 0.028, hint: 'Full Name' },
  { type: 'first_name', label: 'First Name', group: 'Contact Information', family: 'auto', icon: <UserRound className={ic} />, w: 0.17, h: 0.028, hint: 'First' },
  { type: 'last_name', label: 'Last Name', group: 'Contact Information', family: 'auto', icon: <UserRound className={ic} />, w: 0.17, h: 0.028, hint: 'Last' },
  { type: 'email', label: 'Email', group: 'Contact Information', family: 'auto', icon: <AtSign className={ic} />, w: 0.26, h: 0.028, hint: 'Email' },
  { type: 'company', label: 'Company', group: 'Contact Information', family: 'input', icon: <Building2 className={ic} />, w: 0.24, h: 0.028, hint: 'Company' },
  { type: 'title', label: 'Title', group: 'Contact Information', family: 'input', icon: <IdCard className={ic} />, w: 0.2, h: 0.028, hint: 'Title' },
  { type: 'phone', label: 'Phone', group: 'Contact Information', family: 'input', icon: <Phone className={ic} />, w: 0.2, h: 0.028, hint: 'Phone' },
  { type: 'address', label: 'Address', group: 'Contact Information', family: 'input', icon: <MapPin className={ic} />, w: 0.34, h: 0.028, hint: 'Address' },

  // Inputs
  { type: 'text', label: 'Text', group: 'Inputs', family: 'input', icon: <Type className={ic} />, w: 0.22, h: 0.028, hint: 'Text' },
  { type: 'number', label: 'Number', group: 'Inputs', family: 'input', icon: <Hash className={ic} />, w: 0.12, h: 0.028, hint: '0' },
  { type: 'checkbox', label: 'Checkbox', group: 'Inputs', family: 'input', icon: <SquareCheck className={ic} />, w: 0.022, h: 0.016 },
  { type: 'dropdown', label: 'Dropdown', group: 'Inputs', family: 'input', icon: <SquareChevronDown className={ic} />, w: 0.22, h: 0.028, hint: 'Choose…' },
  { type: 'radio', label: 'Radio', group: 'Inputs', family: 'input', icon: <CircleDot className={ic} />, w: 0.22, h: 0.028, hint: 'Choose one' },
];

export const FIELD_META: Record<FieldType, FieldMeta> = Object.fromEntries(
  FIELD_CATALOG.map((f) => [f.type, f]),
) as Record<FieldType, FieldMeta>;

/** Field types that carry a sender-defined option list. */
export const CHOICE_TYPES: FieldType[] = ['dropdown', 'radio'];

export function isChoice(type: FieldType): boolean {
  return CHOICE_TYPES.includes(type);
}

/** The default options a freshly-dropped choice field starts with. */
export const DEFAULT_OPTIONS = ['Option 1', 'Option 2'];

export const ALL_FIELDS_ICON = <ListChecks className={ic} />;
