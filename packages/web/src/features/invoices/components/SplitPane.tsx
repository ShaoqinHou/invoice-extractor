import { useCallback, useEffect, useRef, useState } from "react";

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey?: string;
  defaultRatio?: number;
}

export function SplitPane({ left, right, storageKey = "splitPane", defaultRatio = 0.5 }: SplitPaneProps) {
  const [ratio, setRatio] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseFloat(saved) : defaultRatio;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ratioRef = useRef(ratio);

  // Keep ratioRef in sync for the mouseup handler
  ratioRef.current = ratio;

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
        localStorage.setItem(storageKey, ratioRef.current.toString());
      }
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [storageKey]);

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      <div style={{ width: `${ratio * 100}%` }} className="min-w-0 overflow-hidden">
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        className="w-1.5 cursor-col-resize bg-gray-200 hover:bg-gray-400 flex-shrink-0 transition-colors"
      />
      <div style={{ width: `${(1 - ratio) * 100}%` }} className="min-w-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}
