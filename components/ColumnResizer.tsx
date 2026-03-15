import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ColumnRow {
  el: HTMLElement;
  columns: HTMLElement[];
}

interface ColumnResizerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onContentChange: (html: string) => void;
}

const ColumnResizer: React.FC<ColumnResizerProps> = ({ containerRef, onContentChange }) => {
  const [dividers, setDividers] = useState<{ rowEl: HTMLElement; leftCol: HTMLElement; rightCol: HTMLElement; x: number; top: number; height: number }[]>([]);
  const isDragging = useRef(false);

  const updateDividers = useCallback(() => {
    if (!containerRef.current) return;
    const rows = containerRef.current.querySelectorAll('.column-row');
    const newDividers: typeof dividers = [];
    const containerRect = containerRef.current.getBoundingClientRect();

    rows.forEach(row => {
      const cols = Array.from(row.querySelectorAll(':scope > .column')) as HTMLElement[];
      for (let i = 0; i < cols.length - 1; i++) {
        const leftCol = cols[i];
        const rightCol = cols[i + 1];
        const leftRect = leftCol.getBoundingClientRect();
        const rightRect = rightCol.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();

        const x = (leftRect.right + rightRect.left) / 2 - containerRect.left + containerRef.current!.scrollLeft;
        const top = rowRect.top - containerRect.top + containerRef.current!.scrollTop;
        const height = rowRect.height;

        newDividers.push({ rowEl: row as HTMLElement, leftCol, rightCol, x, top, height });
      }
    });

    setDividers(newDividers);
  }, [containerRef]);

  useEffect(() => {
    updateDividers();
    const interval = setInterval(updateDividers, 1000);
    window.addEventListener('scroll', updateDividers, true);
    window.addEventListener('resize', updateDividers);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', updateDividers, true);
      window.removeEventListener('resize', updateDividers);
    };
  }, [updateDividers]);

  const handleDividerDrag = (e: React.MouseEvent, leftCol: HTMLElement, rightCol: HTMLElement, rowEl: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;

    const startX = e.clientX;
    const leftStartWidth = leftCol.getBoundingClientRect().width;
    const rightStartWidth = rightCol.getBoundingClientRect().width;
    const totalWidth = leftStartWidth + rightStartWidth;
    const minWidth = 60;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = ev.clientX - startX;

      let newLeftW = leftStartWidth + dx;
      let newRightW = rightStartWidth - dx;

      // Enforce minimums
      if (newLeftW < minWidth) { newLeftW = minWidth; newRightW = totalWidth - minWidth; }
      if (newRightW < minWidth) { newRightW = minWidth; newLeftW = totalWidth - minWidth; }

      // Set as percentages of totalWidth for responsive behavior
      const leftPct = (newLeftW / totalWidth) * 100;
      const rightPct = (newRightW / totalWidth) * 100;

      leftCol.style.flex = `0 0 calc(${leftPct.toFixed(1)}% - 5px)`;
      rightCol.style.flex = `0 0 calc(${rightPct.toFixed(1)}% - 5px)`;

      updateDividers();
    };

    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      updateDividers();

      // Trigger content change
      const editor = containerRef.current?.querySelector('.editor-workspace, [contenteditable]') as HTMLElement;
      if (editor) onContentChange(editor.innerHTML);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (dividers.length === 0) return null;

  return (
    <>
      {dividers.map((d, i) => (
        <div
          key={i}
          onMouseDown={(e) => handleDividerDrag(e, d.leftCol, d.rightCol, d.rowEl)}
          style={{
            position: 'absolute',
            left: d.x - 4,
            top: d.top,
            width: 8,
            height: d.height,
            cursor: 'col-resize',
            zIndex: 90,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Visible divider bar — appears on hover */}
          <div
            style={{
              width: 4,
              height: Math.min(d.height, 40),
              background: '#c4b5fd',
              borderRadius: 2,
              transition: 'background 0.15s',
              opacity: 0.6,
            }}
            className="column-divider-bar"
          />
        </div>
      ))}
    </>
  );
};

export default ColumnResizer;
