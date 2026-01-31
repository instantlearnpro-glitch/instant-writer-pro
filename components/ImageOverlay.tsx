import React, { useEffect, useState, useRef } from 'react';
import { Crop } from 'lucide-react';

interface ImageOverlayProps {
  image: HTMLImageElement;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isCropping: boolean;
  onCropComplete: (newSrc: string) => void;
  onCancelCrop: () => void;
}

const ImageOverlay: React.FC<ImageOverlayProps> = ({ 
  image, 
  containerRef, 
  isCropping,
  onCropComplete,
  onCancelCrop
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Sync overlay position with image
  useEffect(() => {
    const updatePosition = () => {
      if (image && containerRef.current) {
        // Calculate position relative to container
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

    updatePosition();
    
    // Update on scroll or resize
    const container = containerRef.current;
    if (container) {
        container.addEventListener('scroll', updatePosition);
        window.addEventListener('resize', updatePosition);
        // Also listen to image load/resize
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
        setCropRect({ x: 0, y: 0, w: rect.width, h: rect.height });
    }
  }, [isCropping, rect?.width, rect?.height]);

  if (!rect) return null;

  // --- RESIZE LOGIC ---
  const handleResizeStart = (e: React.MouseEvent, corner: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;
    const aspectRatio = startWidth / startHeight;

    const onMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        let newWidth = startWidth;
        
        // Simple corner logic: assume dragging SE corner for now or check 'corner'
        // For simplicity in this implementation, we will treat all corners as resizing width/height proportionally
        // but mirroring properly requires checking corner.
        
        if (corner.includes('e')) newWidth = startWidth + dx;
        else if (corner.includes('w')) newWidth = startWidth - dx;

        // Maintain Aspect Ratio
        const newHeight = newWidth / aspectRatio;

        image.style.width = `${newWidth}px`;
        image.style.height = `${newHeight}px`;
        // Also reset max-width to allow growth beyond initial if needed, or keep it 100%
        image.style.maxWidth = 'none'; 
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // --- CROP LOGIC ---
  const handleCropStart = (e: React.MouseEvent, type: 'move' | 'nw' | 'ne' | 'se' | 'sw') => {
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
          
          // Constrain to image bounds
          if (newX < 0) newX = 0;
          if (newY < 0) newY = 0;
          if (newX + newW > rect.width) newW = rect.width - newX;
          if (newY + newH > rect.height) newH = rect.height - newY;

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

      // Real image natural size might differ from displayed size
      const scaleX = image.naturalWidth / rect.width;
      const scaleY = image.naturalHeight / rect.height;

      canvas.width = cropRect.w * scaleX;
      canvas.height = cropRect.h * scaleY;

      ctx.drawImage(
          image,
          cropRect.x * scaleX, cropRect.y * scaleY, cropRect.w * scaleX, cropRect.h * scaleY,
          0, 0, canvas.width, canvas.height
      );

      onCropComplete(canvas.toDataURL());
  };

  if (isCropping && cropRect) {
      return (
        <div 
            style={{ 
                position: 'absolute', 
                top: rect.top, 
                left: rect.left, 
                width: rect.width, 
                height: rect.height,
                zIndex: 50,
                pointerEvents: 'none' // allow click through to dim backdrop? no, we need to block
            }}
        >
            {/* Dimmed Backdrop */}
            <div className="absolute inset-0 bg-black/50" style={{ pointerEvents: 'auto' }}></div>
            
            {/* Crop Box */}
            <div 
                style={{
                    position: 'absolute',
                    top: cropRect.y,
                    left: cropRect.x,
                    width: cropRect.w,
                    height: cropRect.h,
                    border: '2px solid white',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)', // clip masking trick
                    pointerEvents: 'auto',
                    cursor: 'move'
                }}
                onMouseDown={(e) => handleCropStart(e, 'move')}
            >
                {/* Crop Handles */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white -translate-x-1/2 -translate-y-1/2 cursor-nw-resize" onMouseDown={(e) => handleCropStart(e, 'nw')} />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white translate-x-1/2 -translate-y-1/2 cursor-ne-resize" onMouseDown={(e) => handleCropStart(e, 'ne')} />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white -translate-x-1/2 translate-y-1/2 cursor-sw-resize" onMouseDown={(e) => handleCropStart(e, 'sw')} />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white translate-x-1/2 translate-y-1/2 cursor-se-resize" onMouseDown={(e) => handleCropStart(e, 'se')} />
                
                {/* Grid of thirds */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    <div className="border-r border-white/30" />
                    <div className="border-r border-white/30" />
                    <div className="border-b border-white/30 col-span-3 row-start-1" />
                    <div className="border-b border-white/30 col-span-3 row-start-2" />
                </div>
            </div>

            {/* Controls */}
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-auto">
                <button onClick={applyCrop} className="bg-blue-600 text-white px-3 py-1 rounded shadow text-sm">Apply</button>
                <button onClick={onCancelCrop} className="bg-white text-gray-800 px-3 py-1 rounded shadow text-sm">Cancel</button>
            </div>
        </div>
      );
  }

  // Normal Selection Overlay (Resize Handles)
  return (
    <div 
        ref={overlayRef}
        style={{ 
            position: 'absolute', 
            top: rect.top, 
            left: rect.left, 
            width: rect.width, 
            height: rect.height,
            pointerEvents: 'none', // Allow clicks to pass through to text, but handles catch events
            border: '2px solid #3b82f6',
            zIndex: 40
        }}
    >
        {/* Resize Handles */}
        <div 
            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-600 pointer-events-auto cursor-nw-resize" 
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
        />
        <div 
            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-600 pointer-events-auto cursor-ne-resize" 
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
        />
        <div 
            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-600 pointer-events-auto cursor-sw-resize" 
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
        />
        <div 
            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-600 pointer-events-auto cursor-se-resize" 
            onMouseDown={(e) => handleResizeStart(e, 'se')}
        />
    </div>
  );
};

export default ImageOverlay;
