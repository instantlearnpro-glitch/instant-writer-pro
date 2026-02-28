import React, { useState, useEffect, useRef } from 'react';

interface MarginGuidesProps {
    margins: { top: number, bottom: number, left: number, right: number };
    onMarginChange: (key: 'top' | 'bottom' | 'left' | 'right', value: number) => void;
    width: number; // in pixels
    height: number; // in pixels
}

const MarginGuides: React.FC<MarginGuidesProps> = ({ margins, onMarginChange, width, height }) => {
    const [dragging, setDragging] = useState<'top' | 'bottom' | 'left' | 'right' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // PPI conversion (approximate for screen)
    const PPI = 96;

    const toCm = (inches: number) => (inches * 2.54).toFixed(2);

    const handleMouseDown = (e: React.MouseEvent, type: 'top' | 'bottom' | 'left' | 'right') => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(type);
    };

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();

            let newValue = 0;
            // Calculations relative to the page container
            if (dragging === 'top') {
                const relativeY = e.clientY - rect.top;
                newValue = relativeY / PPI;
            } else if (dragging === 'bottom') {
                const relativeY = e.clientY - rect.top;
                newValue = (height - relativeY) / PPI;
            } else if (dragging === 'left') {
                const relativeX = e.clientX - rect.left;
                newValue = relativeX / PPI;
            } else if (dragging === 'right') {
                const relativeX = e.clientX - rect.left;
                newValue = (width - relativeX) / PPI;
            }

            // Clamping (0 to reasonable max, e.g., half page width/height)
            if (newValue < 0) newValue = 0;
            if (dragging === 'left' || dragging === 'right') {
                if (newValue > (width / PPI) / 2 - 0.5) newValue = (width / PPI) / 2 - 0.5;
            } else {
                if (newValue > (height / PPI) / 2 - 0.5) newValue = (height / PPI) / 2 - 0.5;
            }

            // Round to nearest 0.125 (1/8 inch) for cleanliness
            newValue = Math.round(newValue * 8) / 8;

            onMarginChange(dragging, newValue);
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, height, width, onMarginChange]);

    // Positions in pixels
    const topPx = margins.top * PPI;
    const bottomPx = height - (margins.bottom * PPI);
    const leftPx = margins.left * PPI;
    const rightPx = width - (margins.right * PPI);

    const LineStyle = "absolute bg-brand-500 z-50 transition-none";
    const TooltipStyle = "absolute bg-gray-800 text-white text-[10px] px-2 py-1 rounded shadow-lg pointer-events-none transform -translate-x-1/2 whitespace-nowrap z-[60]";

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none">
            {/* Top Line */}
            <div
                className={`${LineStyle} w-full h-px pointer-events-none hover:h-1 hover:bg-brand-600 opacity-50 hover:opacity-100`}
                style={{ top: topPx }}
            />
            <div
                className="absolute left-0 right-0 h-4 -translate-y-2 cursor-ns-resize pointer-events-auto"
                style={{ top: topPx }}
                onMouseDown={(e) => handleMouseDown(e, 'top')}
            />
            {dragging === 'top' && (
                <div className={TooltipStyle} style={{ top: topPx - 25, left: '50%' }}>
                    {margins.top.toFixed(2)}" ({toCm(margins.top)} cm)
                </div>
            )}

            {/* Left Line */}
            <div
                className={`${LineStyle} h-full w-px cursor-ew-resize pointer-events-auto hover:w-1 hover:bg-brand-600 opacity-50 hover:opacity-100`}
                style={{ left: leftPx }}
                onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
            {dragging === 'left' && (
                <div className={TooltipStyle} style={{ top: '50%', left: leftPx - 40 }}>
                    {margins.left.toFixed(2)}" ({toCm(margins.left)} cm)
                </div>
            )}

            {/* Right Line */}
            <div
                className={`${LineStyle} h-full w-px cursor-ew-resize pointer-events-auto hover:w-1 hover:bg-brand-600 opacity-50 hover:opacity-100`}
                style={{ left: rightPx }}
                onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
            {dragging === 'right' && (
                <div className={TooltipStyle} style={{ top: '50%', left: rightPx + 40 }}>
                    {margins.right.toFixed(2)}" ({toCm(margins.right)} cm)
                </div>
            )}

            {/* Bottom Line */}
            <div
                className={`${LineStyle} w-full h-px pointer-events-none hover:h-1 hover:bg-brand-600 opacity-50 hover:opacity-100`}
                style={{ top: bottomPx }}
            />
            <div
                className="absolute left-0 right-0 h-4 -translate-y-2 cursor-ns-resize pointer-events-auto"
                style={{ top: bottomPx }}
                onMouseDown={(e) => handleMouseDown(e, 'bottom')}
            />
            {dragging === 'bottom' && (
                <div className={TooltipStyle} style={{ bottom: (margins.bottom * PPI) + 10, left: '50%' }}>
                    {margins.bottom.toFixed(2)}" ({toCm(margins.bottom)} cm)
                </div>
            )}

            {/* Visual Margin Area (Grayed out) - Optional, mimicking Word */}
            <div className="absolute top-0 left-0 right-0 bg-gray-500/10 pointer-events-none" style={{ height: topPx }} />
            <div className="absolute bottom-0 left-0 right-0 bg-gray-500/10 pointer-events-none" style={{ height: margins.bottom * PPI }} />
            <div className="absolute top-0 bottom-0 left-0 bg-gray-500/10 pointer-events-none" style={{ width: leftPx }} />
            <div className="absolute top-0 bottom-0 right-0 bg-gray-500/10 pointer-events-none" style={{ width: margins.right * PPI }} />
        </div>
    );
};

export default MarginGuides;
