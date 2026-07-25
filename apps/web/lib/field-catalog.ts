import type { FieldType } from '@docflow/contracts';

/** Editor-side metadata for the 12 field types: label, group, default size (normalized). */
export interface FieldMeta {
  type: FieldType;
  label: string;
  group: 'Signature' | 'Auto-fill' | 'Inputs';
  /** Default placement size as page fractions. */
  w: number;
  h: number;
}

export const FIELD_CATALOG: FieldMeta[] = [
  { type: 'signature', label: 'Signature', group: 'Signature', w: 0.22, h: 0.06 },
  { type: 'initial', label: 'Initial', group: 'Signature', w: 0.09, h: 0.05 },
  { type: 'stamp', label: 'Stamp', group: 'Signature', w: 0.14, h: 0.14 },
  { type: 'date', label: 'Date signed', group: 'Auto-fill', w: 0.16, h: 0.035 },
  { type: 'name', label: 'Name', group: 'Auto-fill', w: 0.22, h: 0.035 },
  { type: 'first_name', label: 'First name', group: 'Auto-fill', w: 0.16, h: 0.035 },
  { type: 'last_name', label: 'Last name', group: 'Auto-fill', w: 0.16, h: 0.035 },
  { type: 'email', label: 'Email', group: 'Auto-fill', w: 0.24, h: 0.035 },
  { type: 'company', label: 'Company', group: 'Auto-fill', w: 0.22, h: 0.035 },
  { type: 'title', label: 'Title', group: 'Auto-fill', w: 0.2, h: 0.035 },
  { type: 'text', label: 'Text', group: 'Inputs', w: 0.2, h: 0.035 },
  { type: 'checkbox', label: 'Checkbox', group: 'Inputs', w: 0.03, h: 0.02 },
];

export const FIELD_META: Record<FieldType, FieldMeta> = Object.fromEntries(
  FIELD_CATALOG.map((f) => [f.type, f]),
) as Record<FieldType, FieldMeta>;

export const FIELD_GROUPS = ['Signature', 'Auto-fill', 'Inputs'] as const;
