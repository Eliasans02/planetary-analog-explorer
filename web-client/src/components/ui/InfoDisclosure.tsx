import React, { type ReactNode } from 'react';
import { collapsible } from '@ui-sdk/core/collapsible';
import { createParts } from '@ui-sdk/react/primitive';

// Module-scope adapter call for @ui-sdk/core collapsible behavior.
const parts = createParts(collapsible, {
  root: 'div',
  trigger: 'button',
  panel: 'div',
});

const DisclosureRoot = parts.Root;
const DisclosureTrigger = parts.Trigger;
const DisclosurePanel = parts.Panel;

export interface InfoDisclosureProps {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function InfoDisclosure({
  label,
  children,
  defaultOpen = false,
}: InfoDisclosureProps): React.JSX.Element {
  return (
    <DisclosureRoot
      defaultOpen={defaultOpen}
      className="border border-slate-800/90 bg-[#0F141E]"
    >
      <DisclosureTrigger
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800/40 data-[open]:border-b data-[open]:border-slate-800/90 data-[open]:text-white"
      >
        <span className="min-w-0 truncate">{label}</span>
        <span
          data-pae-chevron=""
          aria-hidden="true"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[11px] text-slate-400"
        >
          ▾
        </span>
      </DisclosureTrigger>
      <DisclosurePanel className="px-3 py-2.5 text-xs leading-relaxed text-slate-300">
        {children}
      </DisclosurePanel>
    </DisclosureRoot>
  );
}
