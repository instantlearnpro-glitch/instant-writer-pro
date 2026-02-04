import React, { useEffect, useState, useRef } from 'react';

interface ImageOverlayProps {
  image: HTMLImageElement | HTMLElement; // Can be image or other elements like textarea
  containerRef: React.RefObject<HTMLDivElement | null>;
  isCropping: boolean;
  showSmartGuides?: boolean;
  onCropComplete: (newSrc: string, width: number, height: number) => void;
  onCancelCrop: () => void;
  onResize?: () => void;
}

const ImageOverlay: React.FC<ImageOverlayProps> = ({ 
  image, 
  containerRef, 
  isCropping,
  showSmartGuides,
  onCropComplete,
  onCancelCrop,
  onResize
}) => {
  const isImage = image.tagName === 'IMG';
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [guides, setGuides] = useState<{ type: 'horizontal' | 'vertical', x?: number, y?: number, length?: number }[]>([]);
  const [lockAspect, setLockAspect] = useState(true);
  
  // Sync overlay position with image
  const updatePosition = () => {
      if (image && containerRef.current) {
        const imgRect = image.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        
        setRect({
           ...imgRect,
           top: imgRect.top - containerRect.top + containerRef.current.scrollTop,
           left: imgRect.left - containerRect.left + containerRef.current.scrollLeft,
           width: imgRect.width,
           height: imgRect.height,
           x: imgRect.x,
           y: imgRect.y,
           bottom: imgRect.bottom,
           right: imgRect.right,
           toJSON: imgRect.toJSON
        });
      }
  };

  useEffect(() => {
    updatePosition();
    const container = containerRef.current;
    if (container) {
        container.addEventListener('scroll', updatePosition);
        window.addEventListener('resize', updatePosition);
        const observer = new ResizeObserver(updatePosition);
        observer.observe(image);
        return () => {
            container.removeEventListener('scroll', updatePosition);
            window.removeEventListener('resize', updatePosition);
            observer.disconnect();
        };
    }
  }, [image, containerRef]);

  // Initialize Crop Rect
  useEffect(() => {
    if (isCropping && rect) {
        // Start with full image
        setCropRect({ x: 0, y: 0, w: rect.width, h: rect.height });
    }
  }, [isCropping]); // Only reset when entering crop mode

  if (!rect) return null;

  // --- RESIZE LOGIC ---
  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    let startX = e.clientX;
    let startY = e.clientY;
    const elementRect = image.getBoundingClientRect();
    const offsetX = e.clientX - elementRect.left;
    const offsetY = e.clientY - elementRect.top;
    const startRect = image.getBoundingClientRect();
    const startWidth = startRect.width;
    const startHeight = startRect.height;

    image.style.setProperty('max-width', 'none', 'important');
    image.style.setProperty('max-height', 'none', 'important');
    image.style.setProperty('min-width', '0', 'important');
    image.style.setProperty('min-height', '0', 'important');
    image.style.setProperty('aspect-ratio', 'auto', 'important');
    image.style.setProperty('object-fit', 'fill', 'important');
    image.style.setProperty('width', `${startWidth}px`);
    image.style.setProperty('height', `${startHeight}px`);

    const onMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;

        const hasE = direction.includes('e');
        const hasW = direction.includes('w');
        const hasS = direction.includes('s');
        const hasN = direction.includes('n');

        if (hasE) newWidth = startWidth + dx;
        else if (hasW) newWidth = startWidth - dx;

        if (hasS) newHeight = startHeight + dy;
        else if (hasN) newHeight = startHeight - dy;

        if (lockAspect && isImage) {
            const aspect = startWidth / startHeight;
            const hasH = hasE || hasW;
            const hasV = hasN || hasS;

            if (hasH && !hasV) {
                newHeight = newWidth / aspect;
            } else if (hasV && !hasH) {
                newWidth = newHeight * aspect;
            } else if (hasH && hasV) {
                if (Math.abs(dx) >= Math.abs(dy)) {
                    newHeight = newWidth / aspect;
                } else {
                    newWidth = newHeight * aspect;
                }
            }
        }

        const minSize = 20;
        if (lockAspect && isImage) {
            const aspect = startWidth / startHeight;
            if (newWidth < minSize) {
                newWidth = minSize;
                newHeight = newWidth / aspect;
            }
            if (newHeight < minSize) {
                newHeight = minSize;
                newWidth = newHeight * aspect;
            }
        } else {
            if (newWidth < minSize) newWidth = minSize;
            if (newHeight < minSize) newHeight = minSize;
        }

        image.style.setProperty('width', `${newWidth}px`, 'important');
        image.style.setProperty('height', `${newHeight}px`, 'important');
        
        updatePosition();
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (onResize) onResize();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // --- DRAG (FREE POSITION) LOGIC ---
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    let startX = e.clientX;
    let startY = e.clientY;
    const elementRect = image.getBoundingClientRect();
    const offsetX = e.clientX - elementRect.left;
    const offsetY = e.clientY - elementRect.top;
    
    const computedStyle = window.getComputedStyle(image);
    if (image.classList.contains('floating-text')) {
      image.style.position = 'absolute';
    } else if (computedStyle.position === 'static') {
      image.style.position = 'relative';
    }
    
    // We rely on relative positioning offsets
    let startLeft = parseFloat(image.style.left) || 0;
    let startTop = parseFloat(image.style.top) || 0;

    // Smart Guides Setup: Pre-calculate snap targets
    let snapTargets: { x: number[], y: number[] } = { x: [], y: [] };
    let containerRect: DOMRect | null = null;
    let initialRect: DOMRect | null = null;
    
    if (showSmartGuides && containerRef.current) {
        initialRect = image.getBoundingClientRect();
        const page = image.closest('.page');
        if (page) {
            const pageRect = page.getBoundingClientRect();
            // Page Edges & Center
            snapTargets.x.push(pageRect.left + pageRect.width / 2); // Center
            // Optional: Page Margins? For now just Center as requested before, plus edges logic below for siblings.
            
            // Siblings
            const siblings = Array.from(page.querySelectorAll('img, .mission-box, h1, h2, h3, p')) as HTMLElement[]; // Added 'p' for text lines
            siblings.forEach(sib => {
                if (sib === image) return;
                const r = sib.getBoundingClientRect();
                // Vertical Lines (X)
                snapTargets.x.push(r.left); // Start
                snapTargets.x.push(r.left + r.width / 2); // Center
                snapTargets.x.push(r.right); // End
                
                // Horizontal Lines (Y)
                snapTargets.y.push(r.top); // Top
                snapTargets.y.push(r.top + r.height / 2); // Middle
                snapTargets.y.push(r.bottom); // Bottom
            });
        }
        containerRect = containerRef.current.getBoundingClientRect();
    }

    const onMove = (moveEvent: MouseEvent) => {
      let dx = moveEvent.clientX - startX;
      let dy = moveEvent.clientY - startY;

      if (image.classList.contains('floating-text')) {
        const elementsAtPoint = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
        const overPage = elementsAtPoint
          .map(el => (el as HTMLElement).closest('.page') as HTMLElement | null)
          .find(page => page);
        const currentPage = image.closest('.page') as HTMLElement | null;

        if (overPage && currentPage && overPage !== currentPage) {
          const pageRect = overPage.getBoundingClientRect();
          const newLeft = moveEvent.clientX - pageRect.left - offsetX;
          const newTop = moveEvent.clientY - pageRect.top - offsetY;
          image.style.left = `${newLeft}px`;
          image.style.top = `${newTop}px`;
          overPage.appendChild(image);
          startLeft = newLeft;
          startTop = newTop;
          startX = moveEvent.clientX;
          startY = moveEvent.clientY;
          updatePosition();
          return;
        }
      }
      
      const activeGuides: typeof guides = [];
      const THRESHOLD = 5;
      
      if (showSmartGuides && initialRect && containerRect && containerRef.current) {
          // Calculate current projected edges
          const curLeft = initialRect.left + dx;
          const curRight = initialRect.right + dx;
          const curCX = initialRect.left + initialRect.width / 2 + dx;
          
          const curTop = initialRect.top + dy;
          const curBottom = initialRect.bottom + dy;
          const curCY = initialRect.top + initialRect.height / 2 + dy;

          // Check X Snaps (Prioritize Center, then Left, then Right)
          let snappedX = false;
          
          // Check Center alignment first
          for (const targetX of snapTargets.x) {
              if (Math.abs(curCX - targetX) < THRESHOLD) {
                  dx += (targetX - curCX);
                  activeGuides.push({
                      type: 'vertical',
                      x: targetX - (initialRect.left + dx),
                      y: -2000,
                      length: 4000
                  });
                  snappedX = true;
                  break; 
              }
          }
          
          if (!snappedX) {
              // Check Left alignment
              for (const targetX of snapTargets.x) {
                  if (Math.abs(curLeft - targetX) < THRESHOLD) {
                      dx += (targetX - curLeft);
                      activeGuides.push({
                          type: 'vertical',
                          x: targetX - (initialRect.left + dx),
                          y: -2000,
                          length: 4000
                      });
                      snappedX = true;
                      break; 
                  }
              }
          }

          if (!snappedX) {
              // Check Right alignment
              for (const targetX of snapTargets.x) {
                  if (Math.abs(curRight - targetX) < THRESHOLD) {
                      dx += (targetX - curRight);
                      activeGuides.push({
                          type: 'vertical',
                          x: targetX - (initialRect.left + dx),
                          y: -2000,
                          length: 4000
                      });
                      break; 
                  }
              }
          }

          // Check Y Snaps
          let snappedY = false;
          
          for (const targetY of snapTargets.y) {
              if (Math.abs(curCY - targetY) < THRESHOLD) {
                  dy += (targetY - curCY);
                  activeGuides.push({
                      type: 'horizontal',
                      y: targetY - (initialRect.top + dy),
                      x: -2000,
                      length: 4000
                  });
                  snappedY = true;
                  break;
              }
          }
          
          if (!snappedY) {
              for (const targetY of snapTargets.y) {
                  if (Math.abs(curTop - targetY) < THRESHOLD) {
                      dy += (targetY - curTop);
                      activeGuides.push({
                          type: 'horizontal',
                          y: targetY - (initialRect.top + dy),
                          x: -2000,
                          length: 4000
                      });
                      snappedY = true;
                      break;
                  }
              }
          }
          
          if (!snappedY) {
              for (const targetY of snapTargets.y) {
                  if (Math.abs(curBottom - targetY) < THRESHOLD) {
                      dy += (targetY - curBottom);
                      activeGuides.push({
                          type: 'horizontal',
                          y: targetY - (initialRect.top + dy),
                          x: -2000,
                          length: 4000
                      });
                      break;
                  }
              }
          }
      }

      setGuides(activeGuides);

      // Always apply movement
      if (!image.classList.contains('floating-text')) {
        image.style.position = 'relative';
      }
      image.style.left = `${startLeft + dx}px`;
      image.style.top = `${startTop + dy}px`;
      
      updatePosition();
    };

    const onUp = () => {
      setGuides([]);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (onResize) onResize();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // --- CROP LOGIC ---
  const handleCropStart = (e: React.MouseEvent, type: string) => {
      if (!cropRect) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startCrop = { ...cropRect };

      const onMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;

          let newX = startCrop.x;
          let newY = startCrop.y;
          let newW = startCrop.w;
          let newH = startCrop.h;

          if (type === 'move') {
              newX += dx;
              newY += dy;
          } else {
             if (type.includes('e')) newW += dx;
             if (type.includes('s')) newH += dy;
             if (type.includes('w')) { newX += dx; newW -= dx; }
             if (type.includes('n')) { newY += dy; newH -= dy; }
          }
          
          const maxX = rect.width;
          const maxY = rect.height;

          if (newW < 0) { newX += newW; newW = Math.abs(newW); }
          if (newH < 0) { newY += newH; newH = Math.abs(newH); }

          if (newX < 0) { newW += newX; newX = 0; } 
          if (newY < 0) { newH += newY; newY = 0; }
          
          if (newX + newW > maxX) newW = maxX - newX;
          if (newY + newH > maxY) newH = maxY - newY;

          if (newW < 10) newW = 10;
          if (newH < 10) newH = 10;

          setCropRect({ x: newX, y: newY, w: newW, h: newH });
      };

      const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
  };

  const applyCrop = () => {
      if (!cropRect) return;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const style = window.getComputedStyle(image);
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;

      const contentX = borderLeft;
      const contentY = borderTop;
      const contentW = rect.width - borderLeft - borderRight;
      const contentH = rect.height - borderTop - borderBottom;

      const iX = Math.max(cropRect.x, contentX);
      const iY = Math.max(cropRect.y, contentY);
      const iR = Math.min(cropRect.x + cropRect.w, contentX + contentW);
      const iB = Math.min(cropRect.y + cropRect.h, contentY + contentH);
      
      const iW = Math.max(0, iR - iX);
      const iH = Math.max(0, iB - iY);

      if (iW <= 0 || iH <= 0) {
          alert("Selection is empty or entirely on the border.");
          return;
      }

      const scaleX = image.naturalWidth / contentW;
      const scaleY = image.naturalHeight / contentH;

      const sx = (iX - contentX) * scaleX;
      const sy = (iY - contentY) * scaleY;
      const sw = iW * scaleX;
      const sh = iH * scaleY;

      canvas.width = sw;
      canvas.height = sh;

      try {
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        
        const finalWidth = iW + borderLeft + borderRight;
        const finalHeight = iH + borderTop + borderBottom;

        onCropComplete(canvas.toDataURL(), finalWidth, finalHeight);
      } catch (e) {
          console.error("Crop failed", e);
          alert("Could not crop image. It might be tainted (cross-origin).");
      }
  };

  const Handle = ({ dir, cursor, onStart }: { dir: string, cursor: string, onStart: any }) => {
      const style: React.CSSProperties = { position: 'absolute', width: '10px', height: '10px', backgroundColor: 'white', border: '1px solid #8d55f1', zIndex: 50, cursor };
      
      if (dir.includes('n')) style.top = '-5px';
      else if (dir.includes('s')) style.bottom = '-5px';
      else style.top = 'calc(50% - 5px)';

      if (dir.includes('w')) style.left = '-5px';
      else if (dir.includes('e')) style.right = '-5px';
      else style.left = 'calc(50% - 5px)';

      return <div style={style} onMouseDown={(e) => onStart(e, dir)} />;
  };

  // --- RENDER ---

  if (isCropping && cropRect && isImage) {
      return (
        <div 
            style={{ 
                position: 'absolute', 
                top: rect.top, left: rect.left, width: rect.width, height: rect.height,
                zIndex: 50,
                pointerEvents: 'none'
            }}
        >
            <div className="absolute inset-0 bg-black/60 pointer-events-auto"></div>
            
            <div 
                style={{
                    position: 'absolute',
                    top: cropRect.y, left: cropRect.x, width: cropRect.w, height: cropRect.h,
                    border: '1px solid rgba(255,255,255,0.8)',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)', 
                    cursor: 'move',
                    pointerEvents: 'auto'
                }}
                onMouseDown={(e) => handleCropStart(e, 'move')}
            >
                <div className="absolute inset-0 flex flex-col">
                    <div className="flex-1 border-b border-white/30"></div>
                    <div className="flex-1 border-b border-white/30"></div>
                    <div className="flex-1"></div>
                </div>
                <div className="absolute inset-0 flex flex-row">
                    <div className="flex-1 border-r border-white/30"></div>
                    <div className="flex-1 border-r border-white/30"></div>
                    <div className="flex-1"></div>
                </div>

                <Handle dir="nw" cursor="nw-resize" onStart={handleCropStart} />
                <Handle dir="n" cursor="n-resize" onStart={handleCropStart} />
                <Handle dir="ne" cursor="ne-resize" onStart={handleCropStart} />
                <Handle dir="e" cursor="e-resize" onStart={handleCropStart} />
                <Handle dir="se" cursor="se-resize" onStart={handleCropStart} />
                <Handle dir="s" cursor="s-resize" onStart={handleCropStart} />
                <Handle dir="sw" cursor="sw-resize" onStart={handleCropStart} />
                <Handle dir="w" cursor="w-resize" onStart={handleCropStart} />
            </div>

            <div className="absolute top-full left-0 mt-2 flex gap-2 pointer-events-auto bg-white p-1 rounded shadow-xl border border-gray-200">
                <button onClick={applyCrop} className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wide">Apply</button>
                <button onClick={onCancelCrop} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded text-xs font-bold uppercase tracking-wide">Cancel</button>
            </div>
        </div>
      );
  }

  return (
    <div 
        style={{ 
            position: 'absolute', 
            top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            pointerEvents: 'none', 
            border: '1px solid #8d55f1',
            zIndex: 40
        }}
    >
        <div 
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '32px',
                height: '32px',
                backgroundColor: 'rgba(141, 85, 241, 0.9)',
                borderRadius: '50%',
                cursor: 'move',
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
            onMouseDown={handleDragStart}
            title="Drag to move"
        >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M12 12L5 12M12 12L12 5M12 12L19 12M12 12L12 19"/>
            </svg>
        </div>

        {isImage && (
            <button
                type="button"
                onClick={() => setLockAspect(prev => !prev)}
                title={lockAspect ? 'Unlock proportions' : 'Lock proportions'}
                style={{
                    position: 'absolute',
                    top: -36,
                    left: 0,
                    pointerEvents: 'auto',
                    backgroundColor: lockAspect ? '#8d55f1' : '#ffffff',
                    color: lockAspect ? '#ffffff' : '#4b5563',
                    border: '1px solid #e5e7eb',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 600
                }}
            >
                {lockAspect ? 'Lock ratio' : 'Unlock ratio'}
            </button>
        )}
        
        <div style={{ pointerEvents: 'auto' }}>
            <Handle dir="nw" cursor="nw-resize" onStart={handleResizeStart} />
            <Handle dir="n" cursor="n-resize" onStart={handleResizeStart} />
            <Handle dir="ne" cursor="ne-resize" onStart={handleResizeStart} />
            <Handle dir="e" cursor="e-resize" onStart={handleResizeStart} />
            <Handle dir="se" cursor="se-resize" onStart={handleResizeStart} />
            <Handle dir="s" cursor="s-resize" onStart={handleResizeStart} />
            <Handle dir="sw" cursor="sw-resize" onStart={handleResizeStart} />
            <Handle dir="w" cursor="w-resize" onStart={handleResizeStart} />
        </div>

        {guides.map((g, i) => (
            <div
                key={i}
                style={{
                    position: 'absolute',
                    backgroundColor: '#ec4899', // Pink-500
                    zIndex: 60,
                    pointerEvents: 'none',
                    ...(g.type === 'horizontal' ? {
                        top: g.y,
                        left: g.x,
                        width: g.length,
                        height: '1px'
                    } : {
                        top: g.y,
                        left: g.x,
                        width: '1px',
                        height: g.length
                    })
                }}
            />
        ))}
    </div>
  );
};

export default ImageOverlay;
