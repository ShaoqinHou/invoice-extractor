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
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(ratio);

  // Keep ratioRef in sync for the mouseup handler
  ratioRef.current = ratio;

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function onMouseMove(e: MouseEvent) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRatio = Math.max(0.2, Math.min(0.8, (e.clientX - rect.left) / rect.width));
      setRatio(newRatio);
    }

    function onMouseUp() {
      setIsDragging(false);
      localStorage.setItem(storageKey, ratioRef.current.toString());
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, storageKey]);

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      <div
        style={{ width: `${ratio * 100}%`, pointerEvents: isDragging ? "none" : undefined }}
        className="min-w-0 overflow-hidden"
      >
        {left}
      </div>
      <div
        onMouseDown={onMouseDown}
        className={`w-1.5 cursor-col-resize flex-shrink-0 transition-colors ${isDragging ? "bg-gray-400" : "bg-gray-200 hover:bg-gray-400"}`}
      />
      <div
        style={{ width: `${(1 - ratio) * 100}%`, pointerEvents: isDragging ? "none" : undefined }}
        className="min-w-0 overflow-hidden"
      >
        {right}
      </div>
    </div>
  );
}
