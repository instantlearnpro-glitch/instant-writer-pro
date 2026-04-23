import React, { useState } from 'react';
import { Layers, FileText, ListTree, Check, X, Search, RefreshCw, Plus, MousePointer, Sparkles, Copy, Trash2, ChevronUp, ChevronDown, FilePlus, MoreHorizontal } from 'lucide-react';
import { StructureEntry } from '../types';

interface SidebarProps {
    isSidebarOpen: boolean;
    pageCount: number;
    currentPage: number;
    onPageSelect: (pageIndex: number) => void;
    structureEntries: StructureEntry[];
    savedHeadingStyles: {
        h1?: Record<string, string> | { lines: { styles: Record<string, string>; innerHTML: string }[]; trailingHR?: string };
        h2?: Record<string, string> | { lines: { styles: Record<string, string>; innerHTML: string }[]; trailingHR?: string };
        h3?: Record<string, string> | { lines: { styles: Record<string, string>; innerHTML: string }[]; trailingHR?: string };
        h4?: Record<string, string>;
        h5?: Record<string, string>;
        p?: Record<string, string>;
        blockquote?: Record<string, string>;
        pre?: Record<string, string>;
    };
    selectionMode: { active: boolean; level: string | null; selectedIds: string[] };
    onStartSelection: (level: string) => void;
    onConfirmSelection: () => void;
    onCancelSelection: () => void;
    onNavigateToEntry: (id: string) => void;
    onUpdateEntryStatus: (id: string, status: 'approved' | 'rejected') => void;
    onClearStructure: () => void;
    onAutoFillStructure: () => void;
    onConvertToTOC: () => void;
    autoStructureEnabled: boolean;
    onToggleAutoStructure: () => void;
    autoStructureSuggested: boolean;
    autoStructureSuggestionLevel?: string | null;
    onApplyAutoStructureSuggestion: () => void;
    onDismissAutoStructureSuggestion: () => void;
    // Page management
    onDuplicatePage?: (pageIndex: number) => void;
    onDeletePage?: (pageIndex: number) => void;
    onMovePage?: (fromIndex: number, toIndex: number) => void;
    onInsertBlankPage?: (afterIndex: number) => void;
    // PDF heading detection
    hasPdfTextData?: boolean;
    onDetectPdfHeadings?: () => void;
    onAddManualPdfHeading?: () => void;
    onGeneratePdfTOC?: (pageIndex: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    isSidebarOpen,
    pageCount,
    currentPage,
    onPageSelect,
    structureEntries,
    savedHeadingStyles,
    selectionMode,
    onStartSelection,
    onConfirmSelection,
    onCancelSelection,
    onNavigateToEntry,
    onUpdateEntryStatus,
    onClearStructure,
    onAutoFillStructure,
    onConvertToTOC,
    autoStructureEnabled,
    onToggleAutoStructure,
    autoStructureSuggested,
    autoStructureSuggestionLevel,
    onApplyAutoStructureSuggestion,
    onDismissAutoStructureSuggestion,
    onDuplicatePage,
    onDeletePage,
    onMovePage,
    onInsertBlankPage,
    hasPdfTextData,
    onDetectPdfHeadings,
    onAddManualPdfHeading,
    onGeneratePdfTOC
}) => {
    const [activeTab, setActiveTab] = useState<'pages' | 'structure'>('pages');
    const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);

    const categories = [
        { id: 'h1', label: 'Heading 1' },
        { id: 'h2', label: 'Heading 2' },
        { id: 'h3', label: 'Heading 3' },
        { id: 'h4', label: 'Heading 4' },
        { id: 'h5', label: 'Heading 5' },
    ];

    return (
        <div className={`app-sidebar w-72 border-r border-gray-200 bg-white h-[calc(100vh-68px)] overflow-hidden flex flex-col flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'ml-0' : '-ml-72'}`}>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('pages')}
                    className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'pages' ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/50' : 'text-gray-500 hover:bg-brand-50 hover:text-brand-600'}`}
                >
                    <Layers size={14} /> Pages
                </button>
                <button
                    onClick={() => setActiveTab('structure')}
                    className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'structure' ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/50' : 'text-gray-500 hover:bg-brand-50 hover:text-brand-600'}`}
                >
                    <ListTree size={14} /> Structure
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2">

                {activeTab === 'pages' && (
                <div className="space-y-1">
                        {Array.from({ length: pageCount }).map((_, idx) => (
                            <div key={idx} className="group relative">
                                <button
                                    onClick={() => onPageSelect(idx)}
                                    className={`w-full text-left px-3 py-3 rounded-md text-sm flex items-center gap-3 transition-colors ${currentPage === idx
                                        ? 'bg-brand-50 text-brand-700 border-l-4 border-brand-600'
                                        : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600 border-l-4 border-transparent'
                                        }`}
                                >
                                    <span className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded text-xs font-bold text-gray-500">
                                        {idx + 1}
                                    </span>
                                    <span className="truncate flex-1">Page {idx + 1}</span>
                                    <span
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPageMenuIndex(pageMenuIndex === idx ? null : idx);
                                        }}
                                        title="Page actions"
                                    >
                                        <MoreHorizontal size={14} />
                                    </span>
                                </button>
                                {/* Page action menu */}
                                {pageMenuIndex === idx && (
                                    <div className="ml-10 mb-1 flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 animate-in fade-in slide-in-from-top-1">
                                        <button
                                            onClick={() => { onMovePage?.(idx, idx - 1); setPageMenuIndex(null); }}
                                            disabled={idx === 0}
                                            className={`p-1.5 rounded transition-colors ${idx === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
                                            title="Move up"
                                        >
                                            <ChevronUp size={14} />
                                        </button>
                                        <button
                                            onClick={() => { onMovePage?.(idx, idx + 1); setPageMenuIndex(null); }}
                                            disabled={idx === pageCount - 1}
                                            className={`p-1.5 rounded transition-colors ${idx === pageCount - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600'}`}
                                            title="Move down"
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                        <div className="w-px h-4 bg-gray-200 mx-0.5"></div>
                                        <button
                                            onClick={() => { onDuplicatePage?.(idx); setPageMenuIndex(null); }}
                                            className="p-1.5 rounded text-gray-600 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                                            title="Duplicate page"
                                        >
                                            <Copy size={14} />
                                        </button>
                                        <button
                                            onClick={() => { onInsertBlankPage?.(idx); setPageMenuIndex(null); }}
                                            className="p-1.5 rounded text-gray-600 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                                            title="Insert blank page after"
                                        >
                                            <FilePlus size={14} />
                                        </button>
                                        {hasPdfTextData && (
                                            <button
                                                onClick={() => {
                                                    if (confirm(`Transform page ${idx + 1} into a dynamic TOC?`)) {
                                                        onGeneratePdfTOC?.(idx);
                                                    }
                                                    setPageMenuIndex(null);
                                                }}
                                                className="p-1.5 rounded text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                                                title="Transform this page into a dynamic TOC"
                                            >
                                                <ListTree size={14} />
                                            </button>
                                        )}
                                        <div className="w-px h-4 bg-gray-200 mx-0.5"></div>
                                        <button
                                            onClick={() => {
                                                if (confirm(`Delete page ${idx + 1}?`)) {
                                                    onDeletePage?.(idx);
                                                }
                                                setPageMenuIndex(null);
                                            }}
                                            className="p-1.5 rounded text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                            title="Delete page"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                        {pageCount === 0 && (
                            <div className="text-center text-gray-400 py-8 text-sm">
                                No pages detected
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'structure' && (
                    <div className="flex flex-col h-full">

                        {/* PDF Heading Detection */}
                        {hasPdfTextData && (
                            <div className="p-2 border-b border-brand-200 bg-gradient-to-r from-brand-50 to-purple-50">
                                <div className="flex gap-2">
                                    <button
                                        onClick={onDetectPdfHeadings}
                                        type="button"
                                        className="flex-1 py-1.5 px-2 rounded bg-gradient-to-r from-emerald-500 via-teal-500 to-brand-600 text-white text-xs font-bold hover:from-emerald-600 hover:via-teal-600 hover:to-brand-700 transition-all flex items-center justify-center gap-1.5 shadow-md ring-1 ring-emerald-300/70"
                                        title="Auto-detect headings from PDF"
                                    >
                                        <Search size={12} /> Auto-Detect Headings
                                    </button>
                                    <button
                                        onClick={onAddManualPdfHeading}
                                        type="button"
                                        className="py-1.5 px-2 rounded bg-white border border-brand-300 text-brand-700 text-xs font-bold hover:bg-brand-50 transition-colors flex items-center justify-center shadow-sm"
                                        title="Manually add a PDF heading that was missed"
                                    >
                                        <Plus size={12} /> Add
                                    </button>
                                </div>
                                <p className="text-[9px] text-brand-500 mt-1.5 text-center leading-tight">
                                    Analyzes text or add titles manually for your TOC
                                </p>
                            </div>
                        )}

                        {/* 1. Tools Section (Add Buttons) */}
                        <div className="p-2 border-b border-gray-100 bg-gray-50">
                            <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Add Manual Entries</div>
                            <div className="flex gap-2">
                                {categories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => onStartSelection(cat.id)}
                                        disabled={selectionMode.active}
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${selectionMode.active
                                            ? 'bg-gray-100 text-gray-400 border-gray-200'
                                            : 'bg-white text-gray-700 border-gray-300 hover:border-brand-400 hover:text-brand-600'
                                            }`}
                                        title={`Select ${cat.label} blocks`}
                                    >
                                        <Plus size={12} /> {cat.id.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Selection Mode Banner (Overlay or pushed) */}
                        {selectionMode.active && (
                            <div className="bg-brand-50 border-b border-brand-200 p-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 text-brand-800 font-bold text-xs uppercase mb-1">
                                    <MousePointer size={14} /> Selecting {selectionMode.level?.toUpperCase()}
                                </div>
                                <p className="text-[10px] text-brand-600 mb-2 leading-tight">
                                    Click paragraphs in the document to tag them as {selectionMode.level}.
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={onConfirmSelection} className="flex-1 bg-[#8d55f1] text-white text-xs py-1 rounded hover:bg-[#7539d3] font-bold">
                                        Done
                                    </button>
                                    <button onClick={onCancelSelection} className="flex-1 bg-brand-100 text-brand-700 border border-brand-200 text-xs py-1 rounded hover:bg-brand-200">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {autoStructureSuggested && (
                            <div className="mx-2 mb-2 rounded border border-brand-200 bg-brand-50 px-3 py-2 text-[11px] text-brand-800">
                                <div className="font-semibold mb-1">Pattern detected for {autoStructureSuggestionLevel?.toUpperCase()}</div>
                                <div className="text-[10px] text-brand-600 mb-2">Open the approval list?</div>
                                <div className="flex gap-2">
                                    <button onClick={onApplyAutoStructureSuggestion} className="flex-1 bg-brand-600 text-white text-[10px] py-1 rounded hover:bg-brand-700 font-bold">
                                        Review
                                    </button>
                                    <button onClick={onDismissAutoStructureSuggestion} className="flex-1 bg-brand-100 text-brand-700 border border-brand-200 text-[10px] py-1 rounded hover:bg-brand-200">
                                        Later
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 2. Unified TOC List */}
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="flex items-center justify-between mb-2 mt-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase">Table of Contents</div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={onAutoFillStructure}
                                        type="button"
                                        className="text-[10px] px-2 py-1 rounded bg-brand-100 text-brand-700 hover:bg-brand-200 hover:text-gray-900"
                                    >
                                        Auto Fill
                                    </button>
                                    <button
                                        onClick={onToggleAutoStructure}
                                        type="button"
                                        className={`text-[10px] px-2 py-1 rounded ${autoStructureEnabled ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'} hover:bg-brand-700 hover:text-white`}
                                    >
                                        Auto: {autoStructureEnabled ? 'On' : 'Off'}
                                    </button>
                                    <button
                                        onClick={onClearStructure}
                                        type="button"
                                        className="text-[10px] text-red-600 hover:text-red-700"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={onConvertToTOC}
                                type="button"
                                className="w-full text-[11px] px-3 py-1.5 mb-2 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium border border-purple-200"
                                title="Select your TOC text, then click to add dot leaders and page numbers"
                            >
                                📋 Convert Selection to Dynamic TOC
                            </button>

                            {structureEntries.filter(e => e.status !== 'rejected').length === 0 ? (
                                <div className="text-center text-gray-400 py-8 text-xs italic">
                                    No entries yet.<br />Use the buttons above to add titles.
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {structureEntries
                                        .filter(e => e.status !== 'rejected')
                                        .sort((a, b) => a.page - b.page) // Sort by page number
                                        .map((entry, idx) => {
                                            // Determine indent, font style and badge based on heading level
                                            let indentPx = 0;    // px left margin
                                            let textClass = 'text-[13px] font-bold text-gray-900';
                                            let badgeBg = '#8d55f1';
                                            let badgeText = '#fff';
                                            let tagLabel = 'H1';

                                            if (entry.type.includes('h2')) {
                                                indentPx = 12; textClass = 'text-xs font-semibold text-gray-700';
                                                badgeBg = '#a97cf5'; badgeText = '#fff'; tagLabel = 'H2';
                                            }
                                            if (entry.type.includes('h3')) {
                                                indentPx = 24; textClass = 'text-[11px] font-medium text-gray-600';
                                                badgeBg = '#c4a8f7'; badgeText = '#fff'; tagLabel = 'H3';
                                            }
                                            if (entry.type.includes('h4')) {
                                                indentPx = 36; textClass = 'text-[11px] font-normal text-gray-500';
                                                badgeBg = '#d4d4d8'; badgeText = '#52525b'; tagLabel = 'H4';
                                            }
                                            if (entry.type.includes('h5')) {
                                                indentPx = 48; textClass = 'text-[10px] font-normal text-gray-400';
                                                badgeBg = '#e4e4e7'; badgeText = '#71717a'; tagLabel = 'H5';
                                            }

                                            return (
                                                <div
                                                    key={`${entry.id}-${entry.page}-${idx}`}
                                                    className="group flex items-center justify-between py-1 px-1.5 rounded hover:bg-brand-50 cursor-pointer transition-colors"
                                                    style={{ marginLeft: `${indentPx}px` }}
                                                    onClick={() => {
                                                        onNavigateToEntry(entry.elementId);
                                                        onPageSelect(Math.max(0, entry.page - 1));
                                                    }}
                                                >
                                                    <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                                                        <span
                                                            className="text-[8px] font-bold px-1 py-0.5 rounded flex-shrink-0 leading-none"
                                                            style={{ backgroundColor: badgeBg, color: badgeText }}
                                                        >
                                                            {tagLabel}
                                                        </span>
                                                        <span className={`${textClass} truncate`}>{entry.text}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span className="text-[9px] text-gray-400 font-mono">p.{entry.page}</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onUpdateEntryStatus(entry.id, 'rejected'); }}
                                                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                            title="Remove from TOC"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
