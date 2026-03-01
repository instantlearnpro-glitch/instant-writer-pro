import React from 'react';

interface PageRulerProps {
    width: number;
    height: number;
    unit?: 'in' | 'cm';
    ppi?: number;
    margins?: { top: number, bottom: number, left: number, right: number };
}

const PageRuler: React.FC<PageRulerProps> = ({ width, height, unit = 'in', ppi = 96, margins }) => {
    // Determine tick interval based on unit
    // Inches: Major (1), Medium (0.5), Minor (0.125)
    // Cm: Major (1), Medium (0.5), Minor (0.1)

    // We'll render SVG for crispness
    const rulerSize = 20; // Thickness of the ruler bar
    const tickColor = "#c4a7ff";
    const textColor = "#7539d3";
    const marginColor = "rgba(0, 0, 0, 0.05)";

    const renderTicks = (length: number, orientation: 'horizontal' | 'vertical') => {
        const ticks = [];
        const totalUnits = length / ppi;

        // Safety limit to prevent infinite loops if sizing is wrong
        if (totalUnits > 50) return null;

        for (let i = 0; i <= Math.ceil(totalUnits); i++) {
            // Major Tick (Number)
            const pos = i * ppi;
            if (pos > length) break;

            if (orientation === 'horizontal') {
                ticks.push(
                    <g key={`major-${i}`}>
                        <line x1={pos} y1={0} x2={pos} y2={rulerSize} stroke={tickColor} strokeWidth={1} />
                        <text x={pos + 2} y={rulerSize - 2} fontSize="10" fill={textColor} fontFamily="sans-serif">{i}</text>
                    </g>
                );
            } else {
                ticks.push(
                    <g key={`major-${i}`}>
                        <line x1={0} y1={pos} x2={rulerSize} y2={pos} stroke={tickColor} strokeWidth={1} />
                        <text x={2} y={pos + 10} fontSize="10" fill={textColor} fontFamily="sans-serif" transform={`rotate(-90 ${2} ${pos + 10})`}>{i}</text>
                    </g>
                );
            }

            // Sub-ticks
            const subdivisions = 8; // 1/8th inch
            const step = ppi / subdivisions;
            for (let j = 1; j < subdivisions; j++) {
                const subPos = pos + (j * step);
                if (subPos > length) break;

                let tickLen = rulerSize * 0.25; // Minor
                if (j === 4) tickLen = rulerSize * 0.5; // Half inch (Medium)
                if (j % 2 === 0 && j !== 4) tickLen = rulerSize * 0.35; // Quarter inch

                if (orientation === 'horizontal') {
                    ticks.push(<line key={`sub-${i}-${j}`} x1={subPos} y1={0} x2={subPos} y2={tickLen} stroke={tickColor} strokeWidth={0.5} />);
                } else {
                    ticks.push(<line key={`sub-${i}-${j}`} x1={0} y1={subPos} x2={tickLen} y2={subPos} stroke={tickColor} strokeWidth={0.5} />);
                }
            }
        }
        return ticks;
    };

    return (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
            {/* Top Ruler */}
            <div className="absolute -top-[20px] left-0 right-0 h-[20px] bg-brand-50 border-b border-brand-200">
                <svg width={width} height={20} className="overflow-visible">
                    {/* Margin Backgrounds */}
                    {margins && (
                        <>
                            <rect x={0} y={0} width={margins.left * ppi} height={20} fill={marginColor} />
                            <rect x={width - (margins.right * ppi)} y={0} width={margins.right * ppi} height={20} fill={marginColor} />
                        </>
                    )}
                    {renderTicks(width, 'horizontal')}
                </svg>
            </div>

            {/* Left Ruler */}
            <div className="absolute top-0 bottom-0 -left-[20px] w-[20px] bg-brand-50 border-r border-brand-200">
                <svg width={20} height={height} className="overflow-visible">
                    {/* Margin Backgrounds */}
                    {margins && (
                        <>
                            <rect x={0} y={0} width={20} height={margins.top * ppi} fill={marginColor} />
                            <rect x={0} y={height - (margins.bottom * ppi)} width={20} height={margins.bottom * ppi} fill={marginColor} />
                        </>
                    )}
                    {renderTicks(height, 'vertical')}
                </svg>
            </div>

            {/* Corner box */}
            <div className="absolute -top-[20px] -left-[20px] w-[20px] h-[20px] bg-brand-100 border-r border-b border-brand-200 z-10" />
        </div>
    );
};

export default PageRuler;
