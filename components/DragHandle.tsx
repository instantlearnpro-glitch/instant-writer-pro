import React, { useState, useRef, useEffect } from 'react';
import { ActionType } from '../utils/patternDetector';

interface DragHandleProps {
  element: HTMLElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  showSmartGuides?: boolean;
  onUpdate: () => void;
  onAction?: (type: ActionType, element: HTMLElement) => void;
}

const MAX_ROW_IMAGES = 3;

const DragHandle: React.FC<DragHandleProps> = ({ element, containerRef, showSmartGuides, onUpdate, onAction }) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const startPos = useRef({ x: 0, y: 0, elementTop: 0, elementLeft: 0, width: 0, height: 0 });
  const isDraggingRef = useRef(false);
  const dropTargetRef = useRef<{
    element: HTMLElement;
    isAbove: boolean;
    horizontal?: 'left' | 'right' | null;
  } | null>(null);

  useEffect(() => {
    updatePosition();
    const observer = new MutationObserver(updatePosition);
    observer.observe(element, { attributes: true, childList: true, subtree: true });
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [element]);

  const updatePosition = () => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    setPosition({
      top: elementRect.top - containerRect.top + containerRef.current.scrollTop,
      left: elementRect.left - containerRect.left + containerRef.current.scrollLeft,
      width: elementRect.width,
      height: elementRect.height
    });
  };

  // ---- Helpers for image-row logic ----

  /** Count images in an .image-row (or 0 if not in one) */
  const countRowImages = (el: HTMLElement): number => {
    const row = el.closest('.image-row');
    if (!row) return 0;
    return row.querySelectorAll(':scope > img').length;
  };

  /** Check if an image target can accept another image beside it */
  const canAcceptHorizontal = (targetImg: HTMLElement): boolean => {
    const row = targetImg.closest('.image-row');
    if (row) {
      return row.querySelectorAll(':scope > img').length < MAX_ROW_IMAGES;
    }
    return true; // standalone image — can always create a new row
  };

  // ---- Drag start ----

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingRef.current = true;
    dropTargetRef.current = null;
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      elementTop: position.top,
      elementLeft: position.left,
      width: position.width,
      height: position.height
    };

    // Visual feedback
    element.style.opacity = '0.5';

    const isSourceImg = element.tagName === 'IMG';

    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Find the element under the cursor
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
      let targetBlock: Element | undefined;

      for (const el of elementsAtPoint) {
        if (el === element) continue;
        if (el.classList.contains('drag-handle')) continue;
        if (el.closest('.drag-handle')) continue;

        const match = el.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace):not(.image-row), blockquote, li, hr, img, table');
        if (match && match !== element) {
          targetBlock = match;
          break;
        }
      }

      // Remove old indicators
      document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

      if (targetBlock) {
        const targetRect = targetBlock.getBoundingClientRect();
        const isTargetImg = targetBlock.tagName === 'IMG';

        // Determine drop direction: horizontal for image-on-image, vertical otherwise
        let horizontal: 'left' | 'right' | null = null;

        if (isSourceImg && isTargetImg && canAcceptHorizontal(targetBlock as HTMLElement)) {
          // Check if cursor is in the left/right edge zones (30% each side)
          const relX = (e.clientX - targetRect.left) / targetRect.width;
          if (relX < 0.35) {
            horizontal = 'left';
          } else if (relX > 0.65) {
            horizontal = 'right';
          }
          // If relX is in the middle 30%, fall through to vertical behavior
        }

        if (horizontal) {
          // Horizontal drop: show vertical bar on left/right of the target image
          dropTargetRef.current = { element: targetBlock as HTMLElement, isAbove: false, horizontal };

          const indicator = document.createElement('div');
          indicator.className = 'drop-indicator';
          indicator.style.cssText = `
            position: absolute;
            width: 4px;
            background: #8d55f1;
            border-radius: 2px;
            pointer-events: none;
            z-index: 9999;
            top: ${targetRect.top}px;
            height: ${targetRect.height}px;
            left: ${horizontal === 'left' ? targetRect.left - 3 : targetRect.right - 1}px;
          `;
          document.body.appendChild(indicator);
        } else {
          // Vertical drop: standard above/below
          const isAbove = e.clientY < targetRect.top + targetRect.height / 2;
          dropTargetRef.current = { element: targetBlock as HTMLElement, isAbove, horizontal: null };

          const indicator = document.createElement('div');
          indicator.className = 'drop-indicator';
          indicator.style.cssText = `
            height: 4px;
            background: #8d55f1;
            margin: 4px 0;
            border-radius: 2px;
          `;

          if (isAbove) {
            targetBlock.parentNode?.insertBefore(indicator, targetBlock);
          } else {
            targetBlock.parentNode?.insertBefore(indicator, targetBlock.nextSibling);
          }
        }
      } else {
        dropTargetRef.current = null;
      }
    };

    const onEnd = () => {
      isDraggingRef.current = false;
      element.style.opacity = '';

      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);

      // Remove indicators
      document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

      // Execute drop
      if (dropTargetRef.current) {
        const { element: target, isAbove, horizontal } = dropTargetRef.current;
        if (target !== element) {
          if (horizontal) {
            // HORIZONTAL DROP: place image next to target in a row
            this_handleHorizontalDrop(target, horizontal);
          } else {
            // VERTICAL DROP: standard above/below reorder
            // First: unwrap from any existing .image-row if leaving
            this_unwrapFromRow(element);

            if (isAbove) {
              target.parentNode?.insertBefore(element, target);
            } else {
              target.parentNode?.insertBefore(element, target.nextSibling);
            }
          }
          onAction?.('move', element);
          onUpdate();
        }
      }

      dropTargetRef.current = null;
      updatePosition();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  };

  /** Handle dropping an image to the left/right of another image */
  const this_handleHorizontalDrop = (target: HTMLElement, side: 'left' | 'right') => {
    const sourceRow = element.closest('.image-row');
    const targetRow = target.closest('.image-row');

    // Remove from old row first (if any)
    if (sourceRow) {
      // Don't re-add if already in same row right next to target—just reorder
      if (sourceRow === targetRow) {
        // Reorder within the same row
        if (side === 'left') {
          targetRow!.insertBefore(element, target);
        } else {
          targetRow!.insertBefore(element, target.nextSibling);
        }
        return;
      }
      // Remove from old row, clean up if empty
      element.remove();
      cleanupRow(sourceRow as HTMLElement);
    }

    if (targetRow) {
      // Target is already in a row — add to it (already checked max in canAcceptHorizontal)
      if (side === 'left') {
        targetRow.insertBefore(element, target);
      } else {
        targetRow.insertBefore(element, target.nextSibling);
      }
    } else {
      // Target is a standalone image — create a new .image-row
      const row = document.createElement('div');
      row.className = 'image-row';

      // Insert the row where the target image was
      target.parentNode?.insertBefore(row, target);

      // Move both images into the row
      if (side === 'left') {
        row.appendChild(element);
        row.appendChild(target);
      } else {
        row.appendChild(target);
        row.appendChild(element);
      }
    }
  };

  /** Remove element from an image-row and clean up if needed */
  const this_unwrapFromRow = (el: HTMLElement) => {
    const row = el.closest('.image-row');
    if (!row) return;

    // Remove the element from the row
    el.remove();
    cleanupRow(row as HTMLElement);
  };

  /** Clean up an image-row: if only 1 image left, unwrap it; if empty, remove */
  const cleanupRow = (row: HTMLElement) => {
    const remaining = Array.from(row.querySelectorAll(':scope > img')) as HTMLElement[];
    if (remaining.length === 0) {
      row.remove();
    } else if (remaining.length === 1) {
      // Unwrap the single remaining image back to standalone
      const single = remaining[0];
      row.parentNode?.insertBefore(single, row);
      row.remove();
    }
  };

  // ---- Resize ----

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    const allowOverflow = element.getAttribute('data-ignore-margins') === 'true';
    let maxWidth: number | null = null;
    if (!allowOverflow) {
      const page = element.closest('.page') as HTMLElement | null;
      if (page) {
        const computed = window.getComputedStyle(page);
        const paddingLeft = parseFloat(computed.paddingLeft) || 0;
        const paddingRight = parseFloat(computed.paddingRight) || 0;
        maxWidth = Math.max(50, page.clientWidth - paddingLeft - paddingRight);
      }
    }

    // Snapshot initial computed paddings
    const elCS = window.getComputedStyle(element);
    const initialPaddingTop = parseFloat(elCS.paddingTop) || 0;
    const initialPaddingBottom = parseFloat(elCS.paddingBottom) || 0;

    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      elementTop: position.top,
      elementLeft: position.left,
      width: element.offsetWidth,
      height: element.offsetHeight
    };

    const handleResizeMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPos.current.x;
      const deltaY = e.clientY - startPos.current.y;

      if (direction.includes('e')) {
        let nextWidth = Math.max(50, startPos.current.width + deltaX);
        if (maxWidth) nextWidth = Math.min(nextWidth, maxWidth);
        element.style.width = `${nextWidth}px`;
      }
      if (direction.includes('w')) {
        let nextWidth = Math.max(50, startPos.current.width - deltaX);
        if (maxWidth) nextWidth = Math.min(nextWidth, maxWidth);
        element.style.width = `${nextWidth}px`;
      }
      if (direction.includes('s')) {
        const newPb = Math.max(0, initialPaddingBottom + deltaY);
        element.style.paddingBottom = `${newPb}px`;
      }
      if (direction.includes('n')) {
        const newPt = Math.max(0, initialPaddingTop + deltaY);
        element.style.paddingTop = `${newPt}px`;
      }

      updatePosition();
    };

    const handleResizeEnd = () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      onAction?.('resize', element);
      onUpdate();
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const isHR = element.tagName === 'HR';
  const isImg = element.tagName === 'IMG';
  const imageRow = element.closest('.image-row') as HTMLElement | null;
  const isInRow = isImg && imageRow !== null;

  // ---- Row action buttons ----

  const handleEqualWidth = () => {
    if (!imageRow) return;
    const imgs = Array.from(imageRow.querySelectorAll(':scope > img')) as HTMLElement[];
    imgs.forEach(img => {
      img.style.width = '';
      img.style.maxWidth = '100%';
      img.style.flex = '1 1 0';
    });
    onAction?.('resize', element);
    onUpdate();
  };

  const handleMatchHeight = () => {
    if (!imageRow) return;
    const imgs = Array.from(imageRow.querySelectorAll(':scope > img')) as HTMLElement[];
    // Find the smallest natural height so all images align
    let minH = Infinity;
    imgs.forEach(img => {
      const rect = img.getBoundingClientRect();
      if (rect.height < minH) minH = rect.height;
    });
    if (minH === Infinity || minH <= 0) return;
    // Get scale from workspace zoom
    const workspace = element.closest('.editor-workspace') as HTMLElement | null;
    const scale = workspace ? (workspace.getBoundingClientRect().height / (workspace.offsetHeight || 1)) : 1;
    const heightCss = Math.round(minH / scale);
    imgs.forEach(img => {
      img.style.height = `${heightCss}px`;
      img.style.objectFit = 'cover';
    });
    onAction?.('resize', element);
    onUpdate();
  };

  const handleDistribute = () => {
    if (!imageRow) return;
    const imgs = Array.from(imageRow.querySelectorAll(':scope > img')) as HTMLElement[];
    const n = imgs.length;
    if (n < 2) return;
    imgs.forEach(img => {
      img.style.width = '';
      img.style.height = '';
      img.style.flex = '1 1 0';
      img.style.objectFit = 'cover';
    });
    // Set the row to stretch alignment for equal height
    imageRow.style.alignItems = 'stretch';
    onAction?.('resize', element);
    onUpdate();
  };

  return (
    <div
      className="drag-handle pointer-events-auto"
      style={{
        position: 'absolute',
        top: position.top - 2,
        left: position.left - 2,
        width: position.width + 4,
        height: position.height + 4,
        border: '2px solid #8d55f1',
        borderRadius: '2px',
        zIndex: 100,
        pointerEvents: 'none'
      }}
    >
      {/* Move handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: 'absolute',
          top: -24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 60,
          height: 20,
          background: '#8d55f1',
          borderRadius: '4px 4px 0 0',
          cursor: 'grab',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto'
        }}
      >
        <svg width="16" height="10" viewBox="0 0 16 10" fill="white">
          <circle cx="4" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="12" cy="2" r="1.5" />
          <circle cx="4" cy="7" r="1.5" />
          <circle cx="8" cy="7" r="1.5" />
          <circle cx="12" cy="7" r="1.5" />
        </svg>
      </div>

      {/* Resize handles */}
      {/* Right */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'e')}
        style={{
          position: 'absolute',
          right: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 12,
          height: 24,
          background: '#8d55f1',
          borderRadius: 4,
          cursor: 'ew-resize',
          pointerEvents: 'auto'
        }}
      />

      {/* Left */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'w')}
        style={{
          position: 'absolute',
          left: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 12,
          height: 24,
          background: '#8d55f1',
          borderRadius: 4,
          cursor: 'ew-resize',
          pointerEvents: 'auto'
        }}
      />

      {/* Top (for non-HR elements) */}
      {!isHR && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'n')}
          style={{
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 24,
            height: 12,
            background: '#8d55f1',
            borderRadius: 4,
            cursor: 'ns-resize',
            pointerEvents: 'auto'
          }}
        />
      )}

      {/* Bottom (for non-HR elements) */}
      {!isHR && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 's')}
          style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 24,
            height: 12,
            background: '#8d55f1',
            borderRadius: 4,
            cursor: 'ns-resize',
            pointerEvents: 'auto'
          }}
        />
      )}

      {/* Delete button */}
      <div
        onClick={() => {
          // SAFETY: Never delete structural elements
          if (element.classList.contains('page') ||
            element.classList.contains('editor-workspace') ||
            element.tagName === 'BODY' ||
            element.tagName === 'HTML') {
            console.warn('Cannot delete structural element');
            return;
          }

          // If deleting an image from a row, clean up the row
          const row = element.closest('.image-row');

          onAction?.('delete', element);
          element.remove();

          if (row) {
            cleanupRow(row as HTMLElement);
          }

          onUpdate();
        }}
        style={{
          position: 'absolute',
          top: -24,
          right: 0,
          width: 20,
          height: 20,
          background: '#ef4444',
          borderRadius: '0 4px 0 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto'
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </div>

      {/* Image row action toolbar — only shown for images inside a .image-row */}
      {isInRow && (
        <div
          style={{
            position: 'absolute',
            bottom: -32,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 4,
            background: '#1f2937',
            borderRadius: 6,
            padding: '3px 5px',
            pointerEvents: 'auto',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {/* Equal Width */}
          <button
            onClick={handleEqualWidth}
            title="Stessa larghezza"
            style={{
              width: 26, height: 22,
              background: '#8d55f1', border: 'none', borderRadius: 4,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="6" x2="4" y2="18" />
              <line x1="20" y1="6" x2="20" y2="18" />
            </svg>
          </button>

          {/* Match Height */}
          <button
            onClick={handleMatchHeight}
            title="Stessa altezza"
            style={{
              width: 26, height: 22,
              background: '#8d55f1', border: 'none', borderRadius: 4,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="6" y1="4" x2="18" y2="4" />
              <line x1="6" y1="20" x2="18" y2="20" />
            </svg>
          </button>

          {/* Distribute equally */}
          <button
            onClick={handleDistribute}
            title="Distribuisci uniformemente"
            style={{
              width: 26, height: 22,
              background: '#8d55f1', border: 'none', borderRadius: 4,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="5" width="5" height="14" rx="1" />
              <rect x="10" y="5" width="5" height="14" rx="1" />
              <rect x="17" y="5" width="5" height="14" rx="1" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default DragHandle;
