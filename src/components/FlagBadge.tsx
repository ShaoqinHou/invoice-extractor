'use client';

import { useState } from 'react';

export function FlagBadge({ flagInfo }: { flagInfo: string | null }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span
      className="relative inline-flex cursor-help items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      &#9888; Flagged
      {showTooltip && flagInfo && (
        <span className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg dark:bg-zinc-700">
          {flagInfo}
        </span>
      )}
    </span>
  );
}
