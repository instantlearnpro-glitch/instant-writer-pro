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
  element: '#ef4444',  // red — individual elements
  column: '#3b82f6',  // blue — column containers
  container: '#3b82f6',  // blue — column-row wrappers
  page: '#22c55e',  // green — page border
};

const MIN_COLUMN_WIDTH = 60;
const MAX_ROW_ELEMENTS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return true if element has an interactive class (mission-box, shape-*, etc.) */
function isInteractiveBlock(el: HTMLElement): boolean {
  const cls = el.classList;
  const tag = el.tagName.toLowerCase();
  return cls.contains('mission-box') || cls.contains('shape-rectangle') ||
    cls.contains('shape-circle') || cls.contains('shape-pill') ||
    cls.contains('shape-speech') || cls.contains('shape-cloud') ||
    cls.contains('writing-lines') || cls.contains('floating-text') ||
    cls.contains('toc-container') || cls.contains('worksheet') ||
    tag === 'ul' || tag === 'ol';
}

/** Return the ancestry chain of a DOM element up to the editor workspace */
function getBoxChain(target: EventTarget | null, workspace: HTMLElement | null): BoxLevel[] {
  if (!target || !workspace) return [];
  let el = target as HTMLElement | null;
  const chain: BoxLevel[] = [];
  const seen = new Set<HTMLElement>();

  // Cache: is the target inside a column? (avoids repeated .closest() calls)
  const insideColumn = (target as HTMLElement)?.closest?.('.column') != null;

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
    } else if (
      !cls.contains('drag-handle') && !cls.contains('drop-indicator') &&
      !cls.contains('selection-overlay') && !cls.contains('page-footer') &&
      (
        ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'li',
          'ul', 'ol', 'table', 'img', 'hr', 'textarea'].includes(tag) ||
        isInteractiveBlock(el) ||
        (tag === 'div' && !cls.contains('page') && !cls.contains('editor-workspace') &&
          !cls.contains('column-row') && !cls.contains('image-row') && !cls.contains('column') &&
          el.parentElement &&
          (
            insideColumn ||
            !!el.closest('.page') ||
            el.parentElement === workspace
          ))
      )
    ) {
      chain.push({ el, rect: el.getBoundingClientRect(), kind: 'element' });
    }

    el = el.parentElement;
  }

  return chain.reverse();
}

function getFriendlyLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const cls = el.classList;
  if (cls.contains('page')) return 'Pagina';
  if (cls.contains('column-row') || cls.contains('image-row')) return 'Riga';
  if (cls.contains('column')) return 'Colonna';
  if (cls.contains('mission-box') || cls.contains('shape-rectangle')) return 'Box';
  if (cls.contains('shape-circle')) return 'Cerchio';
  if (cls.contains('shape-pill')) return 'Pillola';
  if (cls.contains('shape-speech')) return 'Fumetto';
  if (cls.contains('shape-cloud')) return 'Nuvola';
  if (cls.contains('toc-container')) return 'Indice';
  if (cls.contains('writing-lines')) return 'Righe';
  if (cls.contains('floating-text')) return 'Testo Libero';
  if (tag === 'img') return 'Immagine';
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) return tag.toUpperCase();
  if (tag === 'p') return 'Testo';
  if (tag === 'ul' || tag === 'ol') return 'Lista';
  if (tag === 'table') return 'Tabella';
  if (tag === 'hr') return 'Separatore';
  if (tag === 'div') return 'Blocco';
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
    left?: number; width?: number; isColumnLevel?: boolean;
  } | null>(null);

  const isDragging = useRef(false);
  const dragEl = useRef<HTMLElement | null>(null);
  const dropTarget = useRef<{ el: HTMLElement; side: 'left' | 'right' | 'above' | 'below' | 'into' } | null>(null);
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

  // ── Hover detection (throttled) ──────────────────────────────────────────
  useEffect(() => {
    const ws = workspace();
    if (!ws) return;

    let hoverRaf = 0;
    let lastHoverTarget: EventTarget | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) return;
      // Skip if same target element
      if (e.target === lastHoverTarget) return;
      lastHoverTarget = e.target;

      cancelAnimationFrame(hoverRaf);
      hoverRaf = requestAnimationFrame(() => {
        const chain = getBoxChain(e.target, ws);
        setHoveredChain(chain);
      });
    };

    const onMouseLeave = () => {
      lastHoverTarget = null;
      if (!isDragging.current) setHoveredChain([]);
    };

    ws.addEventListener('mousemove', onMouseMove, { passive: true });
    ws.addEventListener('mouseleave', onMouseLeave);
    return () => {
      cancelAnimationFrame(hoverRaf);
      ws.removeEventListener('mousemove', onMouseMove);
      ws.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [workspace]);

  // ── Click selection ──────────────────────────────────────────────────────
  useEffect(() => {
    const ws = workspace();
    if (!ws) return;

    const onClick = (e: MouseEvent) => {
      // Skip selection if clicking on a page-break indicator zone
      const target = e.target as HTMLElement;
      const pbElement = target.closest('[data-page-break-before="true"]') as HTMLElement | null;
      if (pbElement) {
        const rect = pbElement.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        if (clickY >= 0 && clickY <= 22) {
          return; // Let the Editor's handler deal with page-break deletion
        }
      }

      const chain = getBoxChain(e.target, ws);

      // Alt+click → select the parent column or container (skip the inner element)
      if (e.altKey) {
        const colOrContainer = chain.find(b => b.kind === 'column') || chain.find(b => b.kind === 'container');
        if (colOrContainer) {
          setSelectedEl(colOrContainer.el);
          setSelectedRect(colOrContainer.el.getBoundingClientRect());
          e.preventDefault();
          return;
        }
      }

      // Normal click → select the innermost element
      const interactiveEntry = chain.find(b => b.kind === 'element' && isInteractiveBlock(b.el));
      const inner = interactiveEntry || chain.filter(b => b.kind === 'element').pop() || chain[chain.length - 1];
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
  const handleResizeEdge = (e: React.MouseEvent, dir: 'n' | 's' | 'e' | 'w') => {
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

  // ── Resize: scale entire element via corners ──────────────────────────
  const handleResizeCorner = (e: React.MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedEl) return;

    const startX = e.clientX;
    const startW = selectedEl.offsetWidth;
    const startZoom = parseFloat(selectedEl.style.zoom) || 1;

    const onMove = (mv: MouseEvent) => {
      const dx = mv.clientX - startX;
      const sign = (corner === 'ne' || corner === 'se') ? 1 : -1;

      const visualStartW = startW * startZoom;
      const visualNewW = visualStartW + sign * dx;
      const ratio = visualNewW / Math.max(1, visualStartW);

      const nextZoom = Math.max(0.1, startZoom * ratio);
      selectedEl.style.zoom = nextZoom.toFixed(2);

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
        let targetColumn: HTMLElement | null = null;

        for (const el of elementsAtPoint) {
          if (el === selectedEl || selectedEl.contains(el)) continue;
          if ((el as HTMLElement).closest?.('.drag-handle, .selection-overlay, .column-divider-bar')) continue;
          // GUARD: only consider targets inside a .page
          if (!(el as HTMLElement).closest?.('.page')) continue;

          // First check: is this inside a .column?
          const colMatch = (el as HTMLElement).closest?.('.column') as HTMLElement | null;
          if (colMatch && !colMatch.contains(selectedEl) && colMatch !== selectedEl) {
            targetColumn = colMatch;
          }

          // Then check for specific content elements
          const match = (el as HTMLElement).closest?.(
            'p, h1, h2, h3, h4, h5, h6, blockquote, li, ul, ol, img, table, hr, div:not(.page):not(.editor-workspace):not(.column-row):not(.image-row):not(.column)'
          ) as HTMLElement | null;
          if (match && match !== selectedEl && !selectedEl.contains(match)) {
            target = match;
            break;
          }
        }

        setDropIndicator(null);

        // Priority 1: Check if we're near the outer edge of a column (column-level drop)
        if (targetColumn) {
          const colRect = targetColumn.getBoundingClientRect();
          const distFromRight = colRect.right - mv.clientX;
          const distFromLeft = mv.clientX - colRect.left;
          const edgeThreshold = 30; // px from column edge

          if (distFromRight < edgeThreshold && distFromRight >= 0) {
            // Near right edge of column → show tall blue line
            const rowEl = targetColumn.closest('.column-row');
            const rowRect = rowEl ? rowEl.getBoundingClientRect() : colRect;
            dropTarget.current = { el: targetColumn, side: 'col-right' };
            setDropIndicator({
              x: colRect.right - 2,
              top: rowRect.top,
              height: rowRect.height,
              vertical: true,
              isColumnLevel: true,
            });
            return;
          } else if (distFromLeft < edgeThreshold && distFromLeft >= 0) {
            // Near left edge of column → show tall blue line
            const rowEl = targetColumn.closest('.column-row');
            const rowRect = rowEl ? rowEl.getBoundingClientRect() : colRect;
            dropTarget.current = { el: targetColumn, side: 'col-left' };
            setDropIndicator({
              x: colRect.left - 2,
              top: rowRect.top,
              height: rowRect.height,
              vertical: true,
              isColumnLevel: true,
            });
            return;
          }
        }

        // Priority 2: Element-level interaction
        if (target) {
          const rect = target.getBoundingClientRect();
          const relX = (mv.clientX - rect.left) / rect.width;

          if (relX < 0.25) {
            // Left side of element → short red line
            dropTarget.current = { el: target, side: 'left' };
            setDropIndicator({ x: rect.left - 3, top: rect.top, height: rect.height, vertical: true });
          } else if (relX > 0.75) {
            // Right side of element → short red line
            dropTarget.current = { el: target, side: 'right' };
            setDropIndicator({ x: rect.right - 2, top: rect.top, height: rect.height, vertical: true });
          } else {
            // Center → horizontal bar above/below
            const isAbove = mv.clientY < rect.top + rect.height / 2;
            dropTarget.current = { el: target, side: isAbove ? 'above' : 'below' };
            if (isAbove) {
              setDropIndicator({ x: rect.left, top: rect.top - 2, height: 4, width: rect.width, vertical: false });
            } else {
              setDropIndicator({ x: rect.left, top: rect.bottom - 2, height: 4, width: rect.width, vertical: false });
            }
          }
        } else if (!targetColumn) {
          // Also check if near the right edge of the page (no column) for creating a new column layout
          const page = elementsAtPoint.find(el =>
            (el as HTMLElement).classList?.contains('page')
          ) as HTMLElement | null;
          if (page) {
            const pageRect = page.getBoundingClientRect();
            const distFromRight = pageRect.right - mv.clientX;
            if (distFromRight < 40 && distFromRight >= 0) {
              dropTarget.current = { el: page, side: 'col-right' };
              setDropIndicator({
                x: pageRect.right - 20,
                top: pageRect.top,
                height: pageRect.height,
                vertical: true,
                isColumnLevel: true,
              });
              return;
            }
          }
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

      // ABSOLUTE GUARD: drop target must be inside a .page
      const targetPage = target.closest('.page');
      if (!targetPage && !target.classList.contains('page')) {
        console.warn('[SelectionOverlay] Drop cancelled: target is outside any page');
        return;
      }

      // Remove from old row/column if present
      const oldRow = dragged.closest('.column-row, .image-row') as HTMLElement | null;
      const oldCol = dragged.closest('.column') as HTMLElement | null;
      dragged.remove();

      // Clean up old column if it's now empty
      if (oldCol && oldCol.children.length === 0) {
        oldCol.remove();
      }

      // Clean up old row
      if (oldRow) {
        const remainingCols = oldRow.querySelectorAll(':scope > .column');
        const remainingImgs = oldRow.querySelectorAll(':scope > img');
        if (remainingCols.length === 0 && remainingImgs.length === 0) {
          oldRow.remove();
        } else if (remainingCols.length === 1 && remainingImgs.length === 0) {
          const singleCol = remainingCols[0] as HTMLElement;
          while (singleCol.firstChild) {
            oldRow.parentNode?.insertBefore(singleCol.firstChild, oldRow);
          }
          oldRow.remove();
        } else if (remainingCols.length === 0 && remainingImgs.length === 1) {
          oldRow.parentNode?.insertBefore(remainingImgs[0], oldRow);
          oldRow.remove();
        }
      }

      if (side === 'col-left' || side === 'col-right') {
        // COLUMN-LEVEL DROP: add new column with the dragged element
        handleColumnDrop(dragged, target, side === 'col-left' ? 'left' : 'right');
      } else if (side === 'into') {
        target.appendChild(dragged);
      } else if (side === 'above') {
        target.parentNode?.insertBefore(dragged, target);
      } else if (side === 'below') {
        target.parentNode?.insertBefore(dragged, target.nextSibling);
      } else {
        // Horizontal side-by-side (element-level)
        handleHorizontalDrop(dragged, target, side as 'left' | 'right');
      }

      onContentChange(ws.innerHTML);
      onUpdate?.();
      setSelectedRect(dragged.getBoundingClientRect());
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Column-level drop: add the dragged element as a new column beside an existing column */
  function handleColumnDrop(dragged: HTMLElement, target: HTMLElement, side: 'left' | 'right') {
    const existingRow = target.closest('.column-row') as HTMLElement | null;
    const newCol = document.createElement('div');
    newCol.className = 'column';
    newCol.contentEditable = 'true';

    // Protect elements from breaking the column boundary
    dragged.style.maxWidth = '100%';
    dragged.style.boxSizing = 'border-box';
    newCol.appendChild(dragged);

    if (existingRow) {
      // Add new column to existing row
      const col = target.classList.contains('column') ? target : target.closest('.column') || target;
      if (side === 'right') {
        col.parentNode?.insertBefore(newCol, col.nextSibling);
      } else {
        col.parentNode?.insertBefore(newCol, col);
      }
    } else {
      // Create a new column-row: wrap visible children of the page into a column on one side
      const row = document.createElement('div');
      row.className = 'column-row';

      // Wrap the target in a column
      const existingCol = document.createElement('div');
      existingCol.className = 'column';
      existingCol.contentEditable = 'true';

      // Protect target as well since it's becoming a column child
      target.style.maxWidth = '100%';
      target.style.boxSizing = 'border-box';

      // If target is a page, move all its content children into the existing col
      if (target.classList.contains('page')) {
        const children = Array.from(target.children).filter(
          c => c instanceof HTMLElement && !c.classList.contains('page-footer')
        );
        for (const child of children) {
          existingCol.appendChild(child);
        }
        if (side === 'right') {
          row.appendChild(existingCol);
          row.appendChild(newCol);
        } else {
          row.appendChild(newCol);
          row.appendChild(existingCol);
        }
        target.insertBefore(row, target.firstChild);
      } else {
        target.parentNode?.insertBefore(row, target);
        existingCol.appendChild(target);
        if (side === 'right') {
          row.appendChild(existingCol);
          row.appendChild(newCol);
        } else {
          row.appendChild(newCol);
          row.appendChild(existingCol);
        }
      }
    }
  }

  function handleHorizontalDrop(dragged: HTMLElement, target: HTMLElement, side: 'left' | 'right') {
    const targetRow = target.closest('.column-row, .image-row') as HTMLElement | null;

    if (targetRow) {
      // Already in a row — add beside the target's column
      const col = target.closest('.column') || target;
      const newCol = document.createElement('div');
      newCol.className = 'column';
      newCol.contentEditable = 'true';
      dragged.style.maxWidth = '100%';
      dragged.style.boxSizing = 'border-box';
      newCol.appendChild(dragged);
      if (side === 'left') col.parentNode?.insertBefore(newCol, col);
      else col.parentNode?.insertBefore(newCol, col.nextSibling);
    } else {
      // Create new column-row wrapping both elements
      const row = document.createElement('div');
      row.className = 'column-row';
      target.parentNode?.insertBefore(row, target);

      const leftCol = document.createElement('div');
      leftCol.className = 'column';
      leftCol.contentEditable = 'true';
      const rightCol = document.createElement('div');
      rightCol.className = 'column';
      rightCol.contentEditable = 'true';

      dragged.style.maxWidth = '100%';
      dragged.style.boxSizing = 'border-box';
      target.style.maxWidth = '100%';
      target.style.boxSizing = 'border-box';

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

    // If deleting a list, unwrap it into paragraphs instead of destroying the text
    if (selectedEl.tagName === 'UL' || selectedEl.tagName === 'OL') {
      const fragment = document.createDocumentFragment();
      Array.from(selectedEl.children).forEach((child: Element) => {
        const htmlChild = child as HTMLElement;
        if (htmlChild.tagName === 'LI') {
          const p = document.createElement('p');
          p.innerHTML = htmlChild.innerHTML;
          // Preserve any inline styles from the li
          const style = htmlChild.getAttribute('style');
          if (style) p.setAttribute('style', style);
          fragment.appendChild(p);
        } else {
          // Keep non-li elements if any somehow exist inside
          fragment.appendChild(htmlChild.cloneNode(true));
        }
      });
      selectedEl.replaceWith(fragment);
    } else {
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
    }

    setSelectedEl(null);
    setSelectedRect(null);
    if (ws) onContentChange(ws.innerHTML);
    onUpdate?.();
  };

  // ── Add column beside ───────────────────────────────────────────────────
  const handleAddColumnBeside = (side: 'left' | 'right') => {
    if (!selectedEl) return;
    const ws = workspace();
    const existingRow = selectedEl.closest('.column-row') as HTMLElement | null;

    if (existingRow) {
      // Already inside a column-row — add a new column at the specified side
      const col = selectedEl.closest('.column') || selectedEl;
      const newCol = document.createElement('div');
      newCol.className = 'column';
      newCol.contentEditable = 'true';
      newCol.innerHTML = '<p>&nbsp;</p>';
      if (side === 'right') {
        col.parentNode?.insertBefore(newCol, col.nextSibling);
      } else {
        col.parentNode?.insertBefore(newCol, col);
      }
    } else {
      // Not in a column-row — wrap element in a new column-row
      const row = document.createElement('div');
      row.className = 'column-row';
      selectedEl.parentNode?.insertBefore(row, selectedEl);

      const existingCol = document.createElement('div');
      existingCol.className = 'column';
      existingCol.contentEditable = 'true';
      existingCol.appendChild(selectedEl);

      const newCol = document.createElement('div');
      newCol.className = 'column';
      newCol.contentEditable = 'true';
      newCol.innerHTML = '<p>&nbsp;</p>';

      if (side === 'right') {
        row.appendChild(existingCol);
        row.appendChild(newCol);
      } else {
        row.appendChild(newCol);
        row.appendChild(existingCol);
      }
    }

    if (ws) onContentChange(ws.innerHTML);
    onUpdate?.();
    setSelectedRect(selectedEl.getBoundingClientRect());
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

  // Which levels to render hover boxes for (skip page-level and already-selected)
  const hoverLevels = hoveredChain.filter(b => b.el !== selectedEl && b.kind !== 'page');

  return (
    <>
      {/* Hover box — only innermost element */}
      {hoverLevels.length > 0 && (() => {
        const box = hoverLevels[hoverLevels.length - 1];
        const pos = toRelative(box.rect);
        const color = BOX_COLORS[box.kind];
        return (
          <div
            className="selection-overlay"
            style={{
              position: 'absolute',
              top: pos.top - 1,
              left: pos.left - 1,
              width: pos.width + 2,
              height: pos.height + 2,
              border: `1.5px solid ${color}`,
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 85,
              boxSizing: 'border-box',
            }}
          >
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
          </div>
        );
      })()}

      {/* Selected element box with resize handles and toolbar (skip page-level) */}
      {selectedEl && selectedRect && !selectedEl.classList.contains('page') && (() => {
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
            </div>

            {/* Delete × button — top right */}
            <div
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              style={{
                position: 'absolute',
                top: -26,
                right: 0,
                background: color,
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'Inter, sans-serif',
                width: 22,
                height: 22,
                borderRadius: '4px 4px 0 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
                userSelect: 'none',
                opacity: 0.8,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
              title="Delete element"
            >
              ×
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

            {/* Resize corners for scale (zoom) */}
            <div onMouseDown={(e) => handleResizeCorner(e, 'nw')} style={handleStyle('nwse-resize', { top: -6, left: -6, width: 12, height: 12, borderRadius: 6, background: '#fff', border: `2px solid ${color}` })} />
            <div onMouseDown={(e) => handleResizeCorner(e, 'ne')} style={handleStyle('nesw-resize', { top: -6, right: -6, width: 12, height: 12, borderRadius: 6, background: '#fff', border: `2px solid ${color}` })} />
            <div onMouseDown={(e) => handleResizeCorner(e, 'sw')} style={handleStyle('nesw-resize', { bottom: -6, left: -6, width: 12, height: 12, borderRadius: 6, background: '#fff', border: `2px solid ${color}` })} />
            <div onMouseDown={(e) => handleResizeCorner(e, 'se')} style={handleStyle('nwse-resize', { bottom: -6, right: -6, width: 12, height: 12, borderRadius: 6, background: '#fff', border: `2px solid ${color}` })} />
          </div>
        );
      })()}

      {/* Drop indicator */}
      {dropIndicator && (() => {
        if (dropIndicator.vertical) {
          const isCol = dropIndicator.isColumnLevel;
          return (
            <div style={{
              position: 'fixed',
              top: dropIndicator.top,
              left: dropIndicator.x,
              width: isCol ? 6 : 4,
              height: dropIndicator.height,
              background: isCol ? '#3b82f6' : '#ef4444',
              borderRadius: isCol ? 3 : 2,
              pointerEvents: 'none',
              zIndex: 9999,
              boxShadow: isCol ? '0 0 8px rgba(59, 130, 246, 0.5)' : 'none',
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
