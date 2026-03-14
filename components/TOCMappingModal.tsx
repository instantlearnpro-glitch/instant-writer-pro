import React, { useState, useMemo } from 'react';
import { X, Check, AlertTriangle, Minus } from 'lucide-react';
import { TOCMappingRow, DocumentHeading } from '../types';

interface TOCMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (mappings: TOCMappingRow[]) => void;
    rows: TOCMappingRow[];
    headings: DocumentHeading[];
}

const TOCMappingModal: React.FC<TOCMappingModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    rows: initialRows,
    headings
}) => {
    const [rows, setRows] = useState<TOCMappingRow[]>(initialRows);

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

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[85vh] flex flex-col" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b">
                    <div>
                        <h3 className="font-bold text-lg text-gray-800" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>Convert to Dynamic TOC</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Match each line to a heading in your document. Matched lines get a page number.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Rows */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
                    {rows.map((row, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-3 py-2 px-3 rounded-lg border"
                            style={{
                                borderColor: row.isTitle ? '#a78bfa' : row.matchedHeadingId ? '#86efac' : '#fde68a',
                                backgroundColor: row.isTitle ? '#f5f3ff' : row.matchedHeadingId ? '#f0fdf4' : '#fffbeb'
                            }}
                        >
                            {/* Status icon */}
                            <div className="flex-shrink-0 w-5">
                                {row.isTitle ? (
                                    <Minus size={16} className="text-purple-500" />
                                ) : row.matchedHeadingId ? (
                                    <Check size={16} className="text-green-600" />
                                ) : (
                                    <AlertTriangle size={14} className="text-amber-500" />
                                )}
                            </div>

                            {/* Line text */}
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-800 truncate" title={row.lineText}>
                                    {row.lineText}
                                </div>
                            </div>

                            {/* Heading selector */}
                            <select
                                value={row.isTitle ? '__title__' : (row.matchedHeadingId || '__none__')}
                                onChange={(e) => handleHeadingChange(idx, e.target.value)}
                                className="flex-shrink-0 w-[260px] text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                                style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                            >
                                <option value="__none__">— Not mapped —</option>
                                <option value="__title__">📌 Section Title (no page #)</option>
                                <optgroup label="Document Headings">
                                    {headings.map(h => (
                                        <option key={h.id} value={h.id}>
                                            [{h.level.toUpperCase()}] p.{h.page} — {h.text.substring(0, 50)}{h.text.length > 50 ? '…' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50 rounded-b-lg">
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
                            onClick={() => onConfirm(rows)}
                            className="px-4 py-2 text-sm text-white bg-[#8d55f1] hover:bg-[#7539d3] rounded shadow-sm"
                        >
                            Convert to TOC
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TOCMappingModal;
