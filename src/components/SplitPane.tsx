'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey?: string;
  defaultRatio?: number;
}

export function SplitPane({ left, right, storageKey = 'splitPane', defaultRatio = 0.5 }: SplitPaneProps) {
  const [ratio, setRatio] = useState(() => {
    if (typeof window === 'undefined') return defaultRatio;
    const saved = localStorage.getItem(storageKey);
    return saved ? parseFloat(saved) : defaultRatio;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
      setRatio(newRatio);
    }

    function onMouseUp() {
      if (dragging.current) {
        dragging.current = false;
        localStorage.setItem(storageKey, ratio.toString());
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [ratio, storageKey]);

  return (
    <div ref={containerRef} className="flex h-[calc(100vh-10rem)] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div style={{ width: `${ratio * 100}%` }} className="min-w-0 overflow-auto">
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="w-1.5 cursor-col-resize bg-zinc-200 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-500 flex-shrink-0"
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="min-w-0 overflow-auto">
        {right}
      </div>
    </div>
  );
}
