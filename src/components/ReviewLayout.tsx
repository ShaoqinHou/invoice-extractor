'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ReviewSidebar } from './ReviewSidebar';

interface ReviewLayoutProps {
  left: React.ReactNode;  // PDF viewer
  right: React.ReactNode; // Review form
}

export function ReviewLayout({ left, right }: ReviewLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('reviewSidebarCollapsed') === 'true';
  });

  const [ratio, setRatio] = useState(() => {
    if (typeof window === 'undefined') return 0.5;
    const saved = localStorage.getItem('reviewSplitRatio');
    return saved ? parseFloat(saved) : 0.5;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(v => {
      const next = !v;
      localStorage.setItem('reviewSidebarCollapsed', String(next));
      return next;
    });
  }, []);

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
        localStorage.setItem('reviewSplitRatio', ratio.toString());
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [ratio]);

  return (
    <div className="flex h-[calc(100vh-5rem)] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      {/* Sidebar */}
      <ReviewSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      {/* Main content area: PDF + Form */}
      <div ref={containerRef} className="flex flex-1 min-w-0">
        {/* PDF viewer */}
        <div style={{ width: `${ratio * 100}%` }} className="min-w-0 overflow-auto">
          {left}
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1.5 cursor-col-resize bg-zinc-200 hover:bg-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-500 flex-shrink-0"
        />

        {/* Review form */}
        <div style={{ width: `${(1 - ratio) * 100}%` }} className="min-w-0 overflow-auto">
          {right}
        </div>
      </div>
    </div>
  );
}
