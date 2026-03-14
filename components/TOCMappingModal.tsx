import React, { useState } from 'react';
import { X, Check, AlertTriangle, Minus } from 'lucide-react';
import { TOCMappingRow, DocumentHeading, TOCStyleOptions } from '../types';

interface TOCMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mappings: TOCMappingRow[], styleOptions: TOCStyleOptions) => void;
    rows: TOCMappingRow[];
    headings: DocumentHeading[];
}

const FONT = { fontFamily: 'system-ui, -apple-system, sans-serif' };

const TOCMappingModal: React.FC<TOCMappingModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    rows: initialRows,
    headings
}) => {
    const [rows, setRows] = useState<TOCMappingRow[]>(initialRows);
    const [styleOptions, setStyleOptions] = useState<TOCStyleOptions>({
        pageNumberFontSize: 12,
        leaderStyle: 'dots',
        leaderSpacing: 8,
        leaderColor: '#9ca3af',
    });

    // Reset rows when modal reopens with new data
    React.useEffect(() => {
        setRows(initialRows);
    }, [initialRows]);

    if (!isOpen) return null;

    const handleHeadingChange = (index: number, headingId: string) => {
        setRows(prev => prev.map((row, i) => {
            if (i !== index) return row;
            if (headingId === '__title__') {
                return { ...row, matchedHeadingId: null, matchedHeadingText: null, isTitle: true, confidence: 1 };
            }
            if (headingId === '__none__') {
                return { ...row, matchedHeadingId: null, matchedHeadingText: null, isTitle: false, confidence: 0 };
            }
            const heading = headings.find(h => h.id === headingId);
            if (heading) {
                return { ...row, matchedHeadingId: heading.id, matchedHeadingText: heading.text, isTitle: false, confidence: 1 };
            }
            return row;
        }));
    };

    const mappedCount = rows.filter(r => r.matchedHeadingId || r.isTitle).length;

    // Build a live preview of leader style
    const leaderPreviewStyle = (): string => {
        const { leaderStyle, leaderColor, leaderSpacing } = styleOptions;
        if (leaderStyle === 'dots') {
            return `background-image: radial-gradient(circle at 1px 1px, ${leaderColor} 1px, transparent 1.5px); background-size: ${leaderSpacing}px 2px; background-repeat: repeat-x; background-position: left center; height: 2px;`;
        }
        if (leaderStyle === 'dashes') {
            return `background-image: repeating-linear-gradient(90deg, ${leaderColor} 0, ${leaderColor} 6px, transparent 6px, transparent ${leaderSpacing + 6}px); height: 1px;`;
        }
        if (leaderStyle === 'line') {
            return `border-bottom: 1px solid ${leaderColor}; height: 0;`;
        }
        return 'height: 0;';
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" style={FONT}>
            <div className="bg-white rounded-lg shadow-xl w-[780px] max-h-[90vh] flex flex-col" style={FONT}>
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800" style={FONT}>Convert to Dynamic TOC</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Match each line to a heading. Choose styling for dots and page numbers.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Styling Options Panel */}
                <div className="px-6 py-3 border-b bg-gray-50 grid grid-cols-4 gap-4 items-end">
                    {/* Leader Style */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Leader Style</label>
                        <select
                            value={styleOptions.leaderStyle}
                            onChange={(e) => setStyleOptions({ ...styleOptions, leaderStyle: e.target.value as TOCStyleOptions['leaderStyle'] })}
                            className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
                            style={FONT}
                        >
                            <option value="dots">●●● Dots</option>
                            <option value="dashes">--- Dashes</option>
                            <option value="line">── Line</option>
                            <option value="none">   None</option>
                        </select>
                    </div>

                    {/* Leader Spacing */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">
                            Dot Spacing: {styleOptions.leaderSpacing}px
                        </label>
                        <input
                            type="range"
                            min={4}
                            max={20}
                            step={1}
                            value={styleOptions.leaderSpacing}
                            onChange={(e) => setStyleOptions({ ...styleOptions, leaderSpacing: Number(e.target.value) })}
                            className="w-full"
                        />
                    </div>

                    {/* Page Number Font Size */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">
                            Page # Size: {styleOptions.pageNumberFontSize}px
                        </label>
                        <input
                            type="range"
                            min={8}
                            max={24}
                            step={1}
                            value={styleOptions.pageNumberFontSize}
                            onChange={(e) => setStyleOptions({ ...styleOptions, pageNumberFontSize: Number(e.target.value) })}
                            className="w-full"
                        />
                    </div>

                    {/* Leader Color */}
                    <div>
                        <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Leader Color</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={styleOptions.leaderColor}
                                onChange={(e) => setStyleOptions({ ...styleOptions, leaderColor: e.target.value })}
                                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                            />
                            <span className="text-[10px] text-gray-500">{styleOptions.leaderColor}</span>
                        </div>
                    </div>
                </div>

                {/* Live Preview */}
                <div className="px-6 py-2 border-b bg-white">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Preview</div>
                    <div className="flex items-baseline gap-2 py-1" style={{ fontSize: '13px', ...FONT }}>
                        <span className="flex-shrink-0">Chapter 1: Example Title</span>
                        {styleOptions.leaderStyle !== 'none' && (
                            <span
                                className="flex-1 block"
                                style={{ ...Object.fromEntries(leaderPreviewStyle().split(';').filter(Boolean).map(s => { const [k, v] = s.split(':'); return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v?.trim()]; })), alignSelf: 'center', minWidth: '40px' }}
                            />
                        )}
                        <span className="flex-shrink-0" style={{ fontSize: `${styleOptions.pageNumberFontSize}px`, minWidth: '3ch', textAlign: 'right' as const }}>12</span>
                    </div>
                </div>

                {/* Rows */}
                <div className="flex-1 overflow-y-auto px-6 py-3 space-y-1.5">
                    <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Line Mapping ({mappedCount}/{rows.length} mapped)</div>
                    {rows.map((row, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-2 py-1.5 px-3 rounded-lg border"
                            style={{
                                borderColor: row.isTitle ? '#a78bfa' : row.matchedHeadingId ? '#86efac' : '#e5e7eb',
                                backgroundColor: row.isTitle ? '#f5f3ff' : row.matchedHeadingId ? '#f0fdf4' : '#fafafa'
                            }}
                        >
                            {/* Status icon */}
                            <div className="flex-shrink-0 w-4">
                                {row.isTitle ? (
                                    <Minus size={14} className="text-purple-500" />
                                ) : row.matchedHeadingId ? (
                                    <Check size={14} className="text-green-600" />
                                ) : (
                                    <AlertTriangle size={12} className="text-gray-400" />
                                )}
                            </div>

                            {/* Line text */}
                            <div className="flex-1 min-w-0">
                                <div className="text-xs text-gray-800 truncate" title={row.lineText}>
                                    {row.lineText}
                                </div>
                            </div>

                            {/* Heading selector */}
                            <select
                                value={row.isTitle ? '__title__' : (row.matchedHeadingId || '__none__')}
                                onChange={(e) => handleHeadingChange(idx, e.target.value)}
                                className="flex-shrink-0 w-[280px] text-[11px] border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                                style={FONT}
                            >
                                <option value="__none__">— Not mapped (skip) —</option>
                                <option value="__title__">📌 Section Title (no page #)</option>
                                <optgroup label="H1 Headings">
                                    {headings.filter(h => h.level === 'h1').map(h => (
                                        <option key={h.id} value={h.id}>
                                            [H1] p.{h.page} — {h.text.substring(0, 45)}{h.text.length > 45 ? '…' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="H2 Headings">
                                    {headings.filter(h => h.level === 'h2').map(h => (
                                        <option key={h.id} value={h.id}>
                                            [H2] p.{h.page} — {h.text.substring(0, 45)}{h.text.length > 45 ? '…' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="H3 Headings">
                                    {headings.filter(h => h.level === 'h3').map(h => (
                                        <option key={h.id} value={h.id}>
                                            [H3] p.{h.page} — {h.text.substring(0, 45)}{h.text.length > 45 ? '…' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="H4 Headings">
                                    {headings.filter(h => h.level === 'h4').map(h => (
                                        <option key={h.id} value={h.id}>
                                            [H4] p.{h.page} — {h.text.substring(0, 45)}{h.text.length > 45 ? '…' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                                <optgroup label="H5 Headings">
                                    {headings.filter(h => h.level === 'h5').map(h => (
                                        <option key={h.id} value={h.id}>
                                            [H5] p.{h.page} — {h.text.substring(0, 45)}{h.text.length > 45 ? '…' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t flex items-center justify-between bg-gray-50 rounded-b-lg">
                    <div className="text-xs text-gray-500">
                        {mappedCount} / {rows.length} lines mapped
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(rows, styleOptions)}
                            className="px-4 py-2 text-sm text-white bg-[#8d55f1] hover:bg-[#7539d3] rounded shadow-sm"
                        >
                            Apply TOC
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TOCMappingModal;
