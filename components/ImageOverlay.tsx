import React, { useEffect, useState, useRef } from 'react';

interface ImageOverlayProps {
  image: HTMLImageElement | HTMLElement; // Can be image or other elements like textarea
  containerRef: React.RefObject<HTMLDivElement | null>;
  isCropping: boolean;
  onCropComplete: (newSrc: string, width: number, height: number) => void;
  onCancelCrop: () => void;
  onResize?: () => void;
}

const ImageOverlay: React.FC<ImageOverlayProps> = ({ 
  image, 
  containerRef, 
  isCropping,
  onCropComplete,
  onCancelCrop,
  onResize
}) => {
  const isImage = image.tagName === 'IMG';
  const element = image; // Generic element reference
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  
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
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = image.getBoundingClientRect();
    const startWidth = startRect.width;
    const startHeight = startRect.height;

    // Remove max-width constraint to allow free resizing
    // Use setProperty with 'important' to override any potential CSS conflicts
    image.style.setProperty('max-width', 'none', 'important');
    image.style.setProperty('max-height', 'none', 'important');
    image.style.setProperty('min-width', '0', 'important');
    image.style.setProperty('min-height', '0', 'important');
    image.style.setProperty('aspect-ratio', 'auto', 'important');
    image.style.setProperty('object-fit', 'fill', 'important');
    
    // Set initial size
    image.style.setProperty('width', `${startWidth}px`);
    image.style.setProperty('height', `${startHeight}px`);

    const onMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        
        let newWidth = startWidth;
        let newHeight = startHeight;

        // Horizontal
        if (direction.includes('e')) newWidth = startWidth + dx;
        else if (direction.includes('w')) newWidth = startWidth - dx;

        // Vertical
        if (direction.includes('s')) newHeight = startHeight + dy;
        else if (direction.includes('n')) newHeight = startHeight - dy;

        // Minimum size constraint
        if (newWidth < 20) newWidth = 20;
        if (newHeight < 20) newHeight = 20;

        // Apply BOTH dimensions always to allow deformation (break aspect ratio)
        image.style.setProperty('width', `${newWidth}px`, 'important');
        image.style.setProperty('height', `${newHeight}px`, 'important');
        
        // Force update overlay
        updatePosition();
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        // Trigger reflow after resize to handle page overflow
        if (onResize) {
            onResize();
        }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // --- DRAG (FREE POSITION) LOGIC ---
  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    // Get current position or initialize
    const computedStyle = window.getComputedStyle(image);
    const currentLeft = parseFloat(image.style.marginLeft) || 0;
    const currentTop = parseFloat(image.style.marginTop) || 0;
    
    // Make image relatively positioned if not already
    if (computedStyle.position === 'static') {
      image.style.position = 'relative';
    }
    
    const startLeft = parseFloat(image.style.left) || 0;
    const startTop = parseFloat(image.style.top) || 0;

    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      
      image.style.position = 'relative';
      image.style.left = `${startLeft + dx}px`;
      image.style.top = `${startTop + dy}px`;
      
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
          
          // Constrain to image bounds (rect is the displayed size)
          const maxX = rect.width;
          const maxY = rect.height;

          // Normalize negative width/height (flipping)
          if (newW < 0) { newX += newW; newW = Math.abs(newW); }
          if (newH < 0) { newY += newH; newH = Math.abs(newH); }

          // Hard bounds check
          if (newX < 0) { newW += newX; newX = 0; } // Grow width if pushed left out
          if (newY < 0) { newH += newY; newY = 0; }
          
          if (newX + newW > maxX) newW = maxX - newX;
          if (newY + newH > maxY) newH = maxY - newY;

          // Min size
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

      // 1. Get Borders
      const style = window.getComputedStyle(image);
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;

      // 2. Define Content Rect (relative to overlay/rect)
      // rect.width is full border-box width.
      const contentX = borderLeft;
      const contentY = borderTop;
      const contentW = rect.width - borderLeft - borderRight;
      const contentH = rect.height - borderTop - borderBottom;

      // 3. Intersect Selection with Content
      // cropRect is relative to rect (0,0 is top-left of border-box)
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

      // 4. Calculate Source Coords (Natural Scale)
      const scaleX = image.naturalWidth / contentW;
      const scaleY = image.naturalHeight / contentH;

      const sx = (iX - contentX) * scaleX;
      const sy = (iY - contentY) * scaleY;
      const sw = iW * scaleX;
      const sh = iH * scaleY;

      // 5. Draw
      canvas.width = sw;
      canvas.height = sh;

      try {
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
        
        // 6. Calculate Final Display Size
        // We want the new element's *content box* to equal iW x iH.
        // So we add the borders back to get the required border-box size.
        const finalWidth = iW + borderLeft + borderRight;
        const finalHeight = iH + borderTop + borderBottom;

        onCropComplete(canvas.toDataURL(), finalWidth, finalHeight);
      } catch (e) {
          console.error("Crop failed", e);
          alert("Could not crop image. It might be tainted (cross-origin).");
      }
  };

  const Handle = ({ dir, cursor, onStart }: { dir: string, cursor: string, onStart: any }) => {
      // Position logic
      const style: React.CSSProperties = { position: 'absolute', width: '10px', height: '10px', backgroundColor: 'white', border: '1px solid #2563eb', zIndex: 50, cursor };
      
      if (dir.includes('n')) style.top = '-5px';
      else if (dir.includes('s')) style.bottom = '-5px';
      else style.top = 'calc(50% - 5px)';

      if (dir.includes('w')) style.left = '-5px';
      else if (dir.includes('e')) style.right = '-5px';
      else style.left = 'calc(50% - 5px)';

      return <div style={style} onMouseDown={(e) => onStart(e, dir)} />;
  };

  // --- RENDER ---

  // Only show crop UI for actual images
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
            {/* Dimmed Overlay */}
            <div className="absolute inset-0 bg-black/60 pointer-events-auto"></div>
            
            {/* Crop Selection */}
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
                {/* Rule of Thirds Grid */}
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

                {/* Handles */}
                <Handle dir="nw" cursor="nw-resize" onStart={handleCropStart} />
                <Handle dir="n" cursor="n-resize" onStart={handleCropStart} />
                <Handle dir="ne" cursor="ne-resize" onStart={handleCropStart} />
                <Handle dir="e" cursor="e-resize" onStart={handleCropStart} />
                <Handle dir="se" cursor="se-resize" onStart={handleCropStart} />
                <Handle dir="s" cursor="s-resize" onStart={handleCropStart} />
                <Handle dir="sw" cursor="sw-resize" onStart={handleCropStart} />
                <Handle dir="w" cursor="w-resize" onStart={handleCropStart} />
            </div>

            {/* Toolbar */}
            <div className="absolute top-full left-0 mt-2 flex gap-2 pointer-events-auto bg-white p-1 rounded shadow-xl border border-gray-200">
                <button onClick={applyCrop} className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wide">Apply</button>
                <button onClick={onCancelCrop} className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1 rounded text-xs font-bold uppercase tracking-wide">Cancel</button>
            </div>
        </div>
      );
  }

  // Standard Resize Overlay
  return (
    <div 
        style={{ 
            position: 'absolute', 
            top: rect.top, left: rect.left, width: rect.width, height: rect.height,
            pointerEvents: 'none', 
            border: '1px solid #3b82f6',
            zIndex: 40
        }}
    >
        {/* Drag handle in center */}
        <div 
            style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '32px',
                height: '32px',
                backgroundColor: 'rgba(59, 130, 246, 0.9)',
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
        
        {/* Resize Handles (8 directions) */}
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
    </div>
  );
};

export default ImageOverlay;