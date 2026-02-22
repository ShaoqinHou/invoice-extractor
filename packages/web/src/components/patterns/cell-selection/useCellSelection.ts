import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellCoord, NormalizedRange, SelectionState } from "./types";
import { getCellCoordsFromElement, normalizeRange } from "./utils";

interface UseCellSelectionOptions {
  tableRef: React.RefObject<HTMLElement | null>;
}

interface UseCellSelectionResult {
  selection: SelectionState | null;
  range: NormalizedRange | null;
  isDragging: boolean;
  handleCellMouseDown: (row: number, col: number, shiftKey: boolean) => void;
  clearSelection: () => void;
  selectRange: (startRow: number, startCol: number, endRow: number, endCol: number) => void;
}

export function useCellSelection({ tableRef }: UseCellSelectionOptions): UseCellSelectionResult {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStarted = useRef(false);

  const range = useMemo(
    () => (selection ? normalizeRange(selection) : null),
    [selection],
  );

  const handleCellMouseDown = useCallback(
    (row: number, col: number, shiftKey: boolean) => {
      if (shiftKey && selection) {
        // Extend: keep anchor, move focus
        setSelection({ anchor: selection.anchor, focus: { row, col } });
      } else {
        // New selection
        setSelection({ anchor: { row, col }, focus: { row, col } });
        dragStarted.current = true;
        setIsDragging(true);
      }
    },
    [selection],
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const selectRange = useCallback(
    (startRow: number, startCol: number, endRow: number, endCol: number) => {
      setSelection({
        anchor: { row: startRow, col: startCol },
        focus: { row: endRow, col: endCol },
      });
    },
    [],
  );

  // Window-level mousemove/mouseup during drag (same pattern as SplitPane)
  useEffect(() => {
    if (!isDragging) return;

    const table = tableRef.current;
    if (table) {
      table.classList.add("cell-selecting");
    }

    function onMouseMove(e: MouseEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      const coords = getCellCoordsFromElement(el);
      if (!coords) return;
      setSelection(prev =>
        prev ? { anchor: prev.anchor, focus: coords } : null,
      );
    }

    function onMouseUp() {
      dragStarted.current = false;
      setIsDragging(false);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (table) {
        table.classList.remove("cell-selecting");
      }
    };
  }, [isDragging, tableRef]);

  return { selection, range, isDragging, handleCellMouseDown, clearSelection, selectRange };
}
