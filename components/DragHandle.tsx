import React, { useState, useRef, useEffect } from 'react';

interface DragHandleProps {
  element: HTMLElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onUpdate: () => void;
}

const DragHandle: React.FC<DragHandleProps> = ({ element, containerRef, onUpdate }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const startPos = useRef({ x: 0, y: 0, elementTop: 0, elementLeft: 0, width: 0, height: 0 });

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
    setIsDragging(true);
    startPos.current = {
      x: e.clientX,
      y: e.clientY,
      elementTop: position.top,
      elementLeft: position.left,
      width: position.width,
      height: position.height
    };
    
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  };

  const handleDragMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const deltaY = e.clientY - startPos.current.y;
    
    // Find the element we're dragging over
    const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
    const targetBlock = elementsAtPoint.find(el => 
      el !== element && 
      !el.classList.contains('drag-handle') &&
      (el.matches('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, hr, img, table') ||
       el.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, hr, img, table'))
    );
    
    if (targetBlock) {
      const targetRect = targetBlock.getBoundingClientRect();
      const isAbove = e.clientY < targetRect.top + targetRect.height / 2;
      
      // Visual indicator
      document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
      const indicator = document.createElement('div');
      indicator.className = 'drop-indicator';
      indicator.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        height: 3px;
        background: #3b82f6;
        pointer-events: none;
        z-index: 1000;
      `;
      
      if (isAbove) {
        targetBlock.parentNode?.insertBefore(indicator, targetBlock);
      } else {
        targetBlock.parentNode?.insertBefore(indicator, targetBlock.nextSibling);
      }
    }
  };

  const handleDragEnd = (e: MouseEvent) => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    
    // Remove indicators
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    
    // Find drop target
    const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
    const targetBlock = elementsAtPoint.find(el => 
      el !== element && 
      !el.classList.contains('drag-handle') &&
      el.matches('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, hr, img, table')
    ) as HTMLElement;
    
    if (targetBlock && targetBlock !== element) {
      const targetRect = targetBlock.getBoundingClientRect();
      const isAbove = e.clientY < targetRect.top + targetRect.height / 2;
      
      if (isAbove) {
        targetBlock.parentNode?.insertBefore(element, targetBlock);
      } else {
        targetBlock.parentNode?.insertBefore(element, targetBlock.nextSibling);
      }
      onUpdate();
    }
    
    updatePosition();
  };

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
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
        element.style.width = `${Math.max(50, startPos.current.width + deltaX)}px`;
      }
      if (direction.includes('w')) {
        element.style.width = `${Math.max(50, startPos.current.width - deltaX)}px`;
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
      setIsResizing(false);
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
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
        border: '2px solid #3b82f6',
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
          background: '#3b82f6',
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
          background: '#3b82f6',
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
          background: '#3b82f6',
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
            background: '#3b82f6',
            borderRadius: 4,
            cursor: 'ns-resize',
            pointerEvents: 'auto'
          }}
        />
      )}

      {/* Delete button */}
      <div
        onClick={() => {
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
