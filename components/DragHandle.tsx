import React, { useState, useRef, useEffect } from 'react';
import { ActionType } from '../utils/patternDetector';

interface DragHandleProps {
  element: HTMLElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  showSmartGuides?: boolean;
  onUpdate: () => void;
  onAction?: (type: ActionType, element: HTMLElement) => void;
}

const DragHandle: React.FC<DragHandleProps> = ({ element, containerRef, showSmartGuides, onUpdate, onAction }) => {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const startPos = useRef({ x: 0, y: 0, elementTop: 0, elementLeft: 0, width: 0, height: 0 });
  const isDraggingRef = useRef(false);
  const dropTargetRef = useRef<{ element: HTMLElement; isAbove: boolean } | null>(null);

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

    // Add visual feedback to dragged element
    element.style.opacity = '0.5';

    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Find the element we're dragging over
      const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
      let targetBlock: Element | undefined;

      for (const el of elementsAtPoint) {
        if (el === element) continue;
        if (el.classList.contains('drag-handle')) continue;
        if (el.closest('.drag-handle')) continue;

        const match = el.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, hr, img, table');
        if (match && match !== element) {
          targetBlock = match;
          break;
        }
      }

      // Remove old indicator
      document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

      if (targetBlock) {
        const targetRect = targetBlock.getBoundingClientRect();
        const isAbove = e.clientY < targetRect.top + targetRect.height / 2;

        dropTargetRef.current = { element: targetBlock as HTMLElement, isAbove };

        // Visual indicator
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

      // Move element to drop target
      if (dropTargetRef.current) {
        const { element: target, isAbove } = dropTargetRef.current;
        if (target !== element) {
          if (isAbove) {
            target.parentNode?.insertBefore(element, target);
          } else {
            target.parentNode?.insertBefore(element, target.nextSibling);
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
        element.style.height = `${Math.max(20, startPos.current.height + deltaY)}px`;
      }
      if (direction.includes('n')) {
        element.style.height = `${Math.max(20, startPos.current.height - deltaY)}px`;
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
          onAction?.('delete', element);
          element.remove();
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
    </div>
  );
};

export default DragHandle;
