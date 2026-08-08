'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LayoutTemplate, Link2, PenLine, Send, Upload, Users } from 'lucide-react';
import { Dropdown, MenuDivider, MenuItem } from '@/components/ui/overlays';
import { TemplatePicker } from '@/components/templates/template-picker';

/**
 * The single way to start work, used on Home and on the Documents header.
 *
 * A split button rather than a row of four: the primary half does the common
 * thing (upload a document and tag it) and the menu holds the variations. The
 * two features that are not switched on appear here as disabled items saying
 * so, rather than as navigation entries that lead to an apology.
 */
export function NewPacketButton({
  size = 'md',
  label = 'New Document',
}: {
  size?: 'md' | 'lg';
  label?: string;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);

  const height = size === 'lg' ? 'h-12 text-[15px]' : 'h-10 text-sm';

  return (
    <>
      <div className="inline-flex items-stretch overflow-hidden rounded-md shadow-sm">
        <button
          type="button"
          onClick={() => router.push('/templates?new=1')}
          className={`inline-flex items-center gap-2 bg-brand-deep px-5 font-semibold text-white transition-colors hover:bg-brand-darkest ${height}`}
        >
          <Upload className="h-4 w-4" />
          {label}
        </button>
        <span className="w-px bg-white/25" aria-hidden />
        <Dropdown
          align="end"
          trigger={(open) => (
            <span
              className={`inline-flex items-center bg-brand-deep px-2.5 text-white transition-colors hover:bg-brand-darkest ${height}`}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              <span className="sr-only">More ways to start</span>
            </span>
          )}
        >
          <MenuItem
            icon={<Send className="h-4 w-4" />}
            onClick={() => router.push('/templates?new=1')}
          >
            Get signatures on a document
          </MenuItem>
          <MenuItem
            icon={<PenLine className="h-4 w-4" />}
            onClick={() => router.push('/templates?new=1&self=1')}
          >
            Sign something myself
          </MenuItem>
          <MenuItem icon={<LayoutTemplate className="h-4 w-4" />} onClick={() => setPicking(true)}>
            Start from a template
          </MenuItem>
          <MenuDivider />
          {/* Named, and honestly marked. A disabled item that explains itself
              is kinder than a menu entry that leads to an empty page. */}
          <MenuItem disabled icon={<Users className="h-4 w-4" />}>
            Send to a list — not switched on yet
          </MenuItem>
          <MenuItem disabled icon={<Link2 className="h-4 w-4" />}>
            Public links — not switched on yet
          </MenuItem>
        </Dropdown>
      </div>

      {picking && <TemplatePicker onClose={() => setPicking(false)} />}
    </>
  );
}
