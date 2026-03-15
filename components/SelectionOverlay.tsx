import React, { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BoxLevel {
  el: HTMLElement;
  rect: DOMRect;
  kind: 'element' | 'column' | 'container' | 'page';
}

interface SelectionOverlayProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onContentChange: (html: string) => void;
  onUpdate?: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BOX_COLORS: Record<BoxLevel['kind'], string> = {
  element:   '#22c55e',  // green
  column:    '#ef4444',  // red (inner)
  container: '#ef4444',  // red (outer)
  page:      '#b91c1c',  // dark red
};

const MIN_COLUMN_WIDTH = 60;
const MAX_ROW_ELEMENTS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return the ancestry chain of a DOM element up to the editor workspace */
function getBoxChain(target: EventTarget | null, workspace: HTMLElement | null): BoxLevel[] {
  if (!target || !workspace) return [];
  let el = target as HTMLElement | null;
  const chain: BoxLevel[] = [];
  const seen = new Set<HTMLElement>();

  while (el && el !== workspace && el !== document.body) {
    if (seen.has(el)) break;
    seen.add(el);

    const tag = el.tagName.toLowerCase();
    const cls = el.classList;

    if (cls.contains('page')) {
      chain.push({ el, rect: el.getBoundingClientRect(), kind: 'page' });
    } else if (cls.contains('column-row') || cls.contains('image-row')) {
      chain.push({ el, rect: el.getBoundingClientRect(), kind: 'container' });
    } else if (cls.contains('column')) {
      chain.push({ el, rect: el.getBoundingClientRect(), kind: 'column' });
    } else if (!cls.contains('drag-handle') && !cls.contains('drop-indicator') &&
      ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li',
       'ul', 'ol', 'table', 'img', 'hr', 'div'].includes(tag)) {
      // Only render element box for actual content nodes, not structural wrappers
      const parent = el.parentElement;
      const isDirectChild = parent &&
        (parent.classList.contains('page') || parent.classList.contains('column') ||
         parent.classList.contains('column-row') || parent.classList.contains('image-row') ||
         parent === workspace);
      if (isDirectChild) {
        chain.push({ el, rect: el.getBoundingClientRect(), kind: 'element' });
      }
    }

    el = el.parentElement;
  }

  return chain.reverse(); // page → container → column → element
}

function getFriendlyLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const cls = el.classList;
  if (cls.contains('page')) return 'Pagina';
  if (cls.contains('column-row') || cls.contains('image-row')) return 'Riga';
  if (cls.contains('column')) return 'Colonna';
  if (tag === 'img') return 'Immagine';
  if (['h1','h2','h3','h4','h5','h6'].includes(tag)) return tag.toUpperCase();
  if (tag === 'p') return 'Testo';
  if (tag === 'ul' || tag === 'ol') return 'Lista';
  if (tag === 'table') return 'Tabella';
  if (tag === 'hr') return 'Separatore';
  return tag;
}

function canAcceptHorizontalSibling(el: HTMLElement): boolean {
  const row = el.closest('.column-row, .image-row');
  if (row) {
    return row.querySelectorAll(':scope > .column, :scope > img').length < MAX_ROW_ELEMENTS;
  }
  return true;
}

// ─── Component ───────────────────────────────────────────────────────────────

const SelectionOverlay: React.FC<SelectionOverlayProps> = ({ containerRef, onContentChange, onUpdate }) => {
  const [hoveredChain, setHoveredChain] = useState<BoxLevel[]>([]);
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [selectedRect, setSelectedRect] = useState<DOMRect | null>(null);
  // Drop indicator state for drag
  const [dropIndicator, setDropIndicator] = useState<{
    x: number; top: number; height: number; vertical: boolean;
    left?: number; width?: number;
  } | null>(null);

  const isDragging = useRef(false);
  const dragEl = useRef<HTMLElement | null>(null);
  const dropTarget = useRef<{ el: HTMLElement; side: 'left'|'right'|'above'|'below'|'into' } | null>(null);
  const rafId = useRef<number>(0);

  const workspace = useCallback(() =>
    containerRef.current?.querySelector('[contenteditable]') as HTMLElement | null
    ?? containerRef.current, [containerRef]);

  // ── Update selected rect when content changes ───────────────────────────
  const refreshSelected = useCallback(() => {
    if (selectedEl) {
      setSelectedRect(selectedEl.getBoundingClientRect());
    }
  }, [selectedEl]);

  useEffect(() => {
    window.addEventListener('scroll', refreshSelected, true);
    window.addEventListener('resize', refreshSelected);
    return () => {
      window.removeEventListener('scroll', refreshSelected, true);
      window.removeEventListener('resize', refreshSelected);
    };
  }, [refreshSelected]);

  // ── Hover detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const ws = workspace();
    if (!ws) return;

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) return;
      const chain = getBoxChain(e.target, ws);
      setHoveredChain(chain);
    };

    const onMouseLeave = () => {
      if (!isDragging.current) setHoveredChain([]);
    };

    ws.addEventListener('mousemove', onMouseMove);
    ws.addEventListener('mouseleave', onMouseLeave);
    return () => {
      ws.removeEventListener('mousemove', onMouseMove);
      ws.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [workspace]);

  // ── Click selection ──────────────────────────────────────────────────────
  useEffect(() => {
    const ws = workspace();
    if (!ws) return;

    const onClick = (e: MouseEvent) => {
      const chain = getBoxChain(e.target, ws);
      // Select innermost element (last in chain)
      const inner = chain[chain.length - 1];
      if (inner) {
        setSelectedEl(inner.el);
        setSelectedRect(inner.el.getBoundingClientRect());
      }
    };

    const onClickDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!containerRef.current?.contains(target)) {
        setSelectedEl(null);
        setSelectedRect(null);
      }
    };

    ws.addEventListener('click', onClick);
    document.addEventListener('click', onClickDoc);
    return () => {
      ws.removeEventListener('click', onClick);
      document.removeEventListener('click', onClickDoc);
    };
  }, [workspace, containerRef]);

  // ── Resize: drag an edge of the selected element ─────────────────────────
  const handleResizeEdge = (e: React.MouseEvent, dir: 'n'|'s'|'e'|'w') => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedEl) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const cs = window.getComputedStyle(selectedEl);
    const startW = selectedEl.offsetWidth;
    const startPT = parseFloat(cs.paddingTop) || 0;
    const startPB = parseFloat(cs.paddingBottom) || 0;

    // Column resize: find sibling
    const isColResize = selectedEl.classList.contains('column') && (dir === 'e' || dir === 'w');
    let siblingCol: HTMLElement | null = null;
    let sibStartW = 0;
    if (isColResize) {
      const row = selectedEl.parentElement;
      const cols = row ? Array.from(row.querySelectorAll(':scope > .column')) as HTMLElement[] : [];
      const idx = cols.indexOf(selectedEl);
      siblingCol = dir === 'e' ? (cols[idx + 1] ?? null) : (cols[idx - 1] ?? null);
      if (siblingCol) sibStartW = siblingCol.offsetWidth;
    }

    const MIN_W = 60;

    const onMove = (mv: MouseEvent) => {
      const dx = mv.clientX - startX;
      const dy = mv.clientY - startY;

      if ((dir === 'e' || dir === 'w') && !isColResize) {
        const sign = dir === 'e' ? 1 : -1;
        const next = Math.max(MIN_W, startW + sign * dx);
        selectedEl.style.width = `${next}px`;
      } else if (isColResize && siblingCol) {
        const sign = dir === 'e' ? 1 : -1;
        const total = startW + sibStartW;
        let newW = Math.max(MIN_W, startW + sign * dx);
        let newSib = total - newW;
        if (newSib < MIN_W) { newSib = MIN_W; newW = total - MIN_W; }
        const row = selectedEl.parentElement!;
        const rowW = row.clientWidth;
        const gaps = (row.querySelectorAll(':scope > .column').length - 1) * 10;
        const available = rowW - gaps;
        selectedEl.style.flex = `0 0 ${(newW / available * 100).toFixed(1)}%`;
        siblingCol.style.flex = `0 0 ${(newSib / available * 100).toFixed(1)}%`;
      } else if (dir === 's') {
        const next = Math.max(0, startPB + dy);
        selectedEl.style.paddingBottom = `${next}px`;
      } else if (dir === 'n') {
        const next = Math.max(0, startPT + dy);
        selectedEl.style.paddingTop = `${next}px`;
      }

      setSelectedRect(selectedEl.getBoundingClientRect());
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setSelectedRect(selectedEl.getBoundingClientRect());
      const ws = workspace();
      if (ws) onContentChange(ws.innerHTML);
      onUpdate?.();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Drag element ─────────────────────────────────────────────────────────
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedEl) return;

    isDragging.current = true;
    dragEl.current = selectedEl;
    selectedEl.style.opacity = '0.4';
    setHoveredChain([]);

    const ws = workspace();

    const onMove = (mv: MouseEvent) => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        if (!isDragging.current || !ws) return;

        const elementsAtPoint = document.elementsFromPoint(mv.clientX, mv.clientY);
        let target: HTMLElement | null = null;

        for (const el of elementsAtPoint) {
          if (el === selectedEl || selectedEl.contains(el)) continue;
          if ((el as HTMLElement).closest?.('.drag-handle, .selection-overlay')) continue;

          const match = (el as HTMLElement).closest?.(
            '.column, p, h1, h2, h3, h4, h5, h6, blockquote, li, ul, ol, img, table, hr'
          ) as HTMLElement | null;
          if (match && match !== selectedEl && !selectedEl.contains(match)) {
            target = match;
            break;
          }
        }

        setDropIndicator(null);

        if (target) {
          const rect = target.getBoundingClientRect();
          const relX = (mv.clientX - rect.left) / rect.width;
          const isTargetCol = target.classList.contains('column');

          if (isTargetCol) {
            // Hovering over a column — show green highlight outline
            dropTarget.current = { el: target, side: 'into' };
            setDropIndicator({ x: rect.left, top: rect.top, height: rect.height, width: rect.width, vertical: false });
          } else if (relX < 0.3 && canAcceptHorizontalSibling(target)) {
            dropTarget.current = { el: target, side: 'left' };
            setDropIndicator({ x: rect.left - 3, top: rect.top, height: rect.height, vertical: true });
          } else if (relX > 0.7 && canAcceptHorizontalSibling(target)) {
            dropTarget.current = { el: target, side: 'right' };
            setDropIndicator({ x: rect.right - 2, top: rect.top, height: rect.height, vertical: true });
          } else {
            const isAbove = mv.clientY < rect.top + rect.height / 2;
            dropTarget.current = { el: target, side: isAbove ? 'above' : 'below' };
            if (isAbove) {
              setDropIndicator({ x: rect.left, top: rect.top - 2, height: 4, width: rect.width, vertical: false });
            } else {
              setDropIndicator({ x: rect.left, top: rect.bottom - 2, height: 4, width: rect.width, vertical: false });
            }
          }
        } else {
          dropTarget.current = null;
        }
      });
    };

    const onUp = () => {
      isDragging.current = false;
      cancelAnimationFrame(rafId.current);
      if (dragEl.current) dragEl.current.style.opacity = '';
      setDropIndicator(null);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (!dropTarget.current || !dragEl.current || !ws) return;
      const { el: target, side } = dropTarget.current;
      const dragged = dragEl.current;

      // Remove from old image-row if present
      const oldRow = dragged.closest('.image-row') as HTMLElement | null;
      dragged.remove();
      if (oldRow) {
        const imgs = oldRow.querySelectorAll(':scope > img');
        if (imgs.length === 0) oldRow.remove();
        else if (imgs.length === 1) {
          const img = imgs[0];
          oldRow.parentNode?.insertBefore(img, oldRow);
          oldRow.remove();
        }
      }

      if (side === 'into') {
        // Drop into column
        target.appendChild(dragged);
      } else if (side === 'above') {
        target.parentNode?.insertBefore(dragged, target);
      } else if (side === 'below') {
        target.parentNode?.insertBefore(dragged, target.nextSibling);
      } else {
        // Horizontal side-by-side
        handleHorizontalDrop(dragged, target, side as 'left'|'right');
      }

      onContentChange(ws.innerHTML);
      onUpdate?.();
      setSelectedRect(dragged.getBoundingClientRect());
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  function handleHorizontalDrop(dragged: HTMLElement, target: HTMLElement, side: 'left'|'right') {
    const targetRow = target.closest('.column-row, .image-row') as HTMLElement | null;

    if (targetRow) {
      if (side === 'left') targetRow.insertBefore(dragged, target);
      else targetRow.insertBefore(dragged, target.nextSibling);
    } else {
      // Create new column-row
      const row = document.createElement('div');
      row.className = 'column-row';
      target.parentNode?.insertBefore(row, target);

      const leftCol = document.createElement('div');
      leftCol.className = 'column';
      leftCol.contentEditable = 'true';
      const rightCol = document.createElement('div');
      rightCol.className = 'column';
      rightCol.contentEditable = 'true';

      if (side === 'left') {
        leftCol.appendChild(dragged);
        rightCol.appendChild(target);
      } else {
        leftCol.appendChild(target);
        rightCol.appendChild(dragged);
      }
      row.appendChild(leftCol);
      row.appendChild(rightCol);
    }
  }

  // ── Delete selected ──────────────────────────────────────────────────────
  const handleDelete = () => {
    if (!selectedEl) return;
    const ws = workspace();
    const row = selectedEl.closest('.column-row, .image-row') as HTMLElement | null;
    selectedEl.remove();
    if (row) {
      const children = row.querySelectorAll(':scope > .column, :scope > img');
      if (children.length === 0) row.remove();
      else if (children.length === 1 && !children[0].classList.contains('column')) {
        row.parentNode?.insertBefore(children[0], row);
        row.remove();
      }
    }
    setSelectedEl(null);
    setSelectedRect(null);
    if (ws) onContentChange(ws.innerHTML);
    onUpdate?.();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const container = containerRef.current;
  const containerRect = container?.getBoundingClientRect();

  const toRelative = (rect: DOMRect) => {
    if (!containerRect || !container) return { top: 0, left: 0, width: 0, height: 0 };
    return {
      top: rect.top - containerRect.top + container.scrollTop,
      left: rect.left - containerRect.left + container.scrollLeft,
      width: rect.width,
      height: rect.height,
    };
  };

  // Which levels to render hover boxes for (skip innermost if it's selected)
  const hoverLevels = hoveredChain.filter(b => b.el !== selectedEl);

  return (
    <>
      {/* Hover boxes */}
      {hoverLevels.map((box, i) => {
        const pos = toRelative(box.rect);
        const color = BOX_COLORS[box.kind];
        const isInnermost = i === hoverLevels.length - 1;
        return (
          <div
            key={i}
            className="selection-overlay"
            style={{
              position: 'absolute',
              top: pos.top - 1,
              left: pos.left - 1,
              width: pos.width + 2,
              height: pos.height + 2,
              border: `1.5px ${isInnermost ? 'solid' : 'dashed'} ${color}`,
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 80 + i,
              boxSizing: 'border-box',
            }}
          >
            {/* Label chip */}
            {isInnermost && (
              <div style={{
                position: 'absolute',
                top: -18,
                left: 0,
                background: color,
                color: 'white',
                fontSize: 9,
                fontWeight: 700,
                fontFamily: 'Inter, sans-serif',
                padding: '1px 5px',
                borderRadius: '3px 3px 0 0',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {getFriendlyLabel(box.el)}
              </div>
            )}
          </div>
        );
      })}

      {/* Selected element box with resize handles and toolbar */}
      {selectedEl && selectedRect && (() => {
        const pos = toRelative(selectedRect);
        const color = BOX_COLORS[
          selectedEl.classList.contains('page') ? 'page' :
          selectedEl.classList.contains('column-row') || selectedEl.classList.contains('image-row') ? 'container' :
          selectedEl.classList.contains('column') ? 'column' : 'element'
        ];

        const handleStyle = (cursor: string, style: React.CSSProperties): React.CSSProperties => ({
          position: 'absolute',
          background: color,
          borderRadius: 3,
          cursor,
          zIndex: 110,
          pointerEvents: 'auto',
          ...style,
        });

        const edgeStyle = (cursor: string, style: React.CSSProperties): React.CSSProperties => ({
          position: 'absolute',
          zIndex: 108,
          pointerEvents: 'auto',
          cursor,
          ...style,
        });

        return (
          <div
            className="selection-overlay"
            style={{
              position: 'absolute',
              top: pos.top - 2,
              left: pos.left - 2,
              width: pos.width + 4,
              height: pos.height + 4,
              border: `2px solid ${color}`,
              borderRadius: 3,
              pointerEvents: 'none',
              zIndex: 100,
              boxSizing: 'border-box',
            }}
          >
            {/* Top label + toolbar */}
            <div style={{
              position: 'absolute',
              top: -26,
              left: 0,
              display: 'flex',
              gap: 2,
              pointerEvents: 'auto',
            }}>
              {/* Label + drag handle */}
              <div
                onMouseDown={handleDragStart}
                style={{
                  background: color,
                  color: 'white',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'Inter, sans-serif',
                  padding: '2px 8px',
                  borderRadius: '4px 4px 0 0',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  userSelect: 'none',
                }}
              >
                <span style={{ opacity: 0.7, fontSize: 8 }}>⠿</span>
                {getFriendlyLabel(selectedEl)}
              </div>

              {/* Delete */}
              <div
                onClick={handleDelete}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  width: 20,
                  height: 20,
                  borderRadius: '4px 4px 0 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: 12,
                  marginTop: 4,
                }}
              >
                ✕
              </div>
            </div>

            {/* Resize handles — corners */}
            <div onMouseDown={(e) => handleResizeEdge(e, 'n')} style={handleStyle('ns-resize', { top: -5, left: '50%', transform: 'translateX(-50%)', width: 24, height: 10 })} />
            <div onMouseDown={(e) => handleResizeEdge(e, 's')} style={handleStyle('ns-resize', { bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 24, height: 10 })} />
            <div onMouseDown={(e) => handleResizeEdge(e, 'e')} style={handleStyle('ew-resize', { right: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 24 })} />
            <div onMouseDown={(e) => handleResizeEdge(e, 'w')} style={handleStyle('ew-resize', { left: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 24 })} />

            {/* Resize edge hit areas (wider for easier grab) */}
            <div onMouseDown={(e) => handleResizeEdge(e, 'n')} style={edgeStyle('ns-resize', { top: 0, left: 0, right: 0, height: 6 })} />
            <div onMouseDown={(e) => handleResizeEdge(e, 's')} style={edgeStyle('ns-resize', { bottom: 0, left: 0, right: 0, height: 6 })} />
            <div onMouseDown={(e) => handleResizeEdge(e, 'e')} style={edgeStyle('ew-resize', { right: 0, top: 0, bottom: 0, width: 6 })} />
            <div onMouseDown={(e) => handleResizeEdge(e, 'w')} style={edgeStyle('ew-resize', { left: 0, top: 0, bottom: 0, width: 6 })} />
          </div>
        );
      })()}

      {/* Drop indicator */}
      {dropIndicator && (() => {
        if (dropIndicator.vertical) {
          return (
            <div style={{
              position: 'fixed',
              top: dropIndicator.top,
              left: dropIndicator.x,
              width: 4,
              height: dropIndicator.height,
              background: '#8d55f1',
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 9999,
            }} />
          );
        } else if (dropIndicator.width) {
          // Horizontal bar or column highlight
          const isColHighlight = dropIndicator.height > 20;
          return (
            <div style={{
              position: 'fixed',
              top: dropIndicator.top,
              left: dropIndicator.x,
              width: dropIndicator.width,
              height: dropIndicator.height,
              border: isColHighlight ? '2px solid #8d55f1' : 'none',
              background: isColHighlight ? 'rgba(141, 85, 241, 0.08)' : '#8d55f1',
              borderRadius: isColHighlight ? 4 : 2,
              pointerEvents: 'none',
              zIndex: 9999,
            }} />
          );
        }
        return null;
      })()}
    </>
  );
};

export default SelectionOverlay;
