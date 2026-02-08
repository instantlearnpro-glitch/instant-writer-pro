import React, { useState } from 'react';
import { Layers, FileText, ListTree, Check, X, Search, RefreshCw, Plus, MousePointer, Sparkles, Trash2 } from 'lucide-react';
import { StructureEntry } from '../types';

interface SidebarProps {
  isSidebarOpen: boolean;
  pageCount: number;
  currentPage: number;
  onPageSelect: (pageIndex: number) => void;
  structureEntries: StructureEntry[];
  selectionMode: { active: boolean; level: string | null; selectedIds: string[] };
  onStartSelection: (level: string) => void;
  onConfirmSelection: () => void;
  onCancelSelection: () => void;
  onNavigateToEntry: (id: string) => void;
  onUpdateEntryStatus: (id: string, status: 'approved' | 'rejected') => void;
  aiMessages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  aiInput: string;
  aiLoading: boolean;
  hasApiKey: boolean;
  onAiInputChange: (value: string) => void;
  onAiSend: () => void;
  onOpenSettings: () => void;
  onClearStructure: () => void;
  onResetAutoScan: () => void;
  isManualMode?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
    isSidebarOpen, 
    pageCount, 
    currentPage, 
    onPageSelect,
    structureEntries,
    selectionMode,
    onStartSelection,
    onConfirmSelection,
    onCancelSelection,
    onNavigateToEntry,
    onUpdateEntryStatus,
    aiMessages,
    aiInput,
    aiLoading,
    hasApiKey,
    onAiInputChange,
    onAiSend,
    onOpenSettings,
    onClearStructure,
    onResetAutoScan,
    isManualMode
}) => {
  const [activeTab, setActiveTab] = useState<'pages' | 'structure' | 'ai'>('pages');

  const categories = [
      { id: 'h1', label: 'Heading 1' },
      { id: 'h2', label: 'Heading 2' },
      { id: 'h3', label: 'Heading 3' },
  ];

  return (
    <div className={`app-sidebar w-72 border-r border-gray-200 bg-white h-full overflow-hidden flex flex-col flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'ml-0' : '-ml-72'}`}>
      
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
          <button 
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${activeTab === 'ai' ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50/50' : 'text-gray-500 hover:bg-brand-50 hover:text-brand-600'}`}
          >
              <Sparkles size={14} /> AI
          </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        
        {activeTab === 'pages' && (
            <div className="space-y-1">
                {Array.from({ length: pageCount }).map((_, idx) => (
                <button
                    key={idx}
                    onClick={() => onPageSelect(idx)}
                    className={`w-full text-left px-3 py-3 rounded-md text-sm flex items-center gap-3 transition-colors ${
                    currentPage === idx 
                        ? 'bg-brand-50 text-brand-700 border-l-4 border-brand-600' 
                        : 'text-gray-600 hover:bg-brand-50 hover:text-brand-600 border-l-4 border-transparent'
                    }`}
                >
                    <span className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded text-xs font-bold text-gray-500">
                        {idx + 1}
                    </span>
                    <span className="truncate flex-1">Page {idx + 1}</span>
                    {currentPage === idx && <FileText size={14} />}
                </button>
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
                
                {/* 1. Tools Section (Add Buttons) */}
                <div className="p-2 border-b border-gray-100 bg-gray-50">
                    {/* Clear / Auto row — always visible */}
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Structure</div>
                        <div className="flex items-center gap-1.5">
                            {!isManualMode && (
                                <span className="text-[9px] text-green-600 font-bold uppercase">Auto</span>
                            )}
                            <button
                                onClick={isManualMode ? onResetAutoScan : onClearStructure}
                                className={`px-2 py-0.5 text-[10px] rounded font-bold flex items-center gap-0.5 ${
                                    isManualMode
                                    ? 'bg-brand-100 text-brand-700 hover:bg-brand-200'
                                    : 'bg-red-100 text-red-600 hover:bg-red-200'
                                }`}
                                title={isManualMode ? 'Enable auto-scan' : 'Clear all and switch to manual'}
                            >
                                {isManualMode ? <><RefreshCw size={9} /> Auto Scan</> : <><Trash2 size={9} /> Clear</>}
                            </button>
                            {structureEntries.filter(e => e.status !== 'rejected').length > 0 && isManualMode && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onClearStructure(); }}
                                    className="px-2 py-0.5 text-[10px] bg-red-100 text-red-600 hover:bg-red-200 rounded font-bold flex items-center gap-0.5"
                                >
                                    <Trash2 size={9} /> Clear
                                </button>
                            )}
                        </div>
                    </div>
                    {/* H1/H2/H3 manual selection buttons */}
                    <div className="flex gap-2">
                        {categories.map(cat => (
                            <button 
                                key={cat.id}
                                onClick={() => onStartSelection(cat.id)}
                                disabled={selectionMode.active}
                                className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                                    selectionMode.active 
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
                    <div className="bg-violet-50 border-b-2 border-violet-400 p-3 animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-center gap-2 text-violet-800 font-bold text-xs uppercase mb-1">
                            <MousePointer size={14} /> Selecting {selectionMode.level?.toUpperCase()}
                        </div>
                        <p className="text-[10px] text-violet-600 mb-2 leading-tight">
                            Click paragraphs in the document to tag them as {selectionMode.level}.
                            {selectionMode.selectedIds.length > 0 && (
                                <span className="ml-1 font-bold text-violet-800">({selectionMode.selectedIds.length} selected)</span>
                            )}
                        </p>
                        <div className="flex gap-2">
                            {selectionMode.selectedIds.length > 0 ? (
                                <button 
                                    onClick={onConfirmSelection} 
                                    className="flex-1 bg-violet-600 text-white text-xs py-2.5 rounded-md font-bold hover:bg-violet-700 shadow-lg shadow-violet-300 border-2 border-violet-400"
                                >
                                    ✓ CONFIRM ({selectionMode.selectedIds.length})
                                </button>
                            ) : (
                                <div className="flex-1 bg-gray-100 text-gray-400 text-xs py-2.5 rounded-md font-medium text-center border border-dashed border-gray-300">
                                    Select elements...
                                </div>
                            )}
                            <button onClick={onCancelSelection} className="px-4 bg-white text-gray-600 border border-gray-300 text-xs py-2.5 rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-300">
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* 2. Unified TOC List */}
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 mt-1">Table of Contents</div>
                    
                    {structureEntries.filter(e => e.status !== 'rejected').length === 0 ? (
                        <div className="text-center text-gray-400 py-8 text-xs italic">
                            No entries yet.<br/>Use the buttons above to add titles.
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {structureEntries
                                .filter(e => e.status !== 'rejected')
                                .sort((a, b) => a.page - b.page) // Sort by page number
                                .map(entry => {
                                    // Determine indent based on type
                                    let indent = 'ml-0';
                                    let fontSize = 'text-sm font-semibold';
                                    if (entry.type.includes('h2')) { indent = 'ml-4'; fontSize = 'text-xs font-medium text-gray-600'; }
                                    if (entry.type.includes('h3')) { indent = 'ml-8'; fontSize = 'text-[11px] text-gray-500'; }

                                    return (
                                        <div 
                                            key={entry.id}
                                            className={`group flex items-center justify-between p-1.5 rounded hover:bg-brand-50 cursor-pointer transition-colors ${indent}`}
                                            onClick={() => onNavigateToEntry(entry.elementId)}
                                        >
                                            <div className="flex items-baseline gap-2 overflow-hidden">
                                                <span className={`${fontSize} truncate`}>{entry.text}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-[9px] text-gray-400 font-mono">p.{entry.page}</span>
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onUpdateEntryStatus(entry.id, 'rejected'); }}
                                                    className="text-brand-600 hover:text-brand-700 transition-colors"
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

        {activeTab === 'ai' && (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b border-gray-100 bg-gray-50">
                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Document AI</div>
                    <div className="text-xs text-gray-600">Ask for practical edits and automation.</div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-3 max-h-[calc(100vh-420px)]">
                    {aiMessages.filter(m => m.role !== 'system').length === 0 && (
                        <div className="text-center text-gray-400 py-8 text-xs italic">
                            No messages yet. Ask the AI to modify the document.
                        </div>
                    )}

                    {aiMessages.filter(m => m.role !== 'system').map((msg, idx) => (
                        <div key={idx} className={`text-xs leading-relaxed ${msg.role === 'user' ? 'text-gray-800' : 'text-brand-700'}`}>
                            <div className="font-semibold mb-1">
                                {msg.role === 'user' ? 'You' : 'AI'}
                            </div>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                    ))}
                </div>

                <div className="border-t border-gray-200 p-3 bg-white">
                    {!hasApiKey ? (
                        <div className="text-xs text-gray-600 space-y-2">
                            <div>Set your OpenAI API key to use AI features.</div>
                            <button
                                onClick={onOpenSettings}
                                className="px-3 py-2 text-xs text-white bg-violet-600 hover:bg-violet-700 rounded shadow-sm"
                            >
                                Open Settings
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <textarea
                                value={aiInput}
                                onChange={(e) => onAiInputChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        onAiSend();
                                    }
                                }}
                                placeholder="E.g. Cambia il font delle righe con un font calligrafico..."
                                className="w-full h-16 border border-gray-300 rounded px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <button
                                onClick={onAiSend}
                                disabled={aiLoading || !aiInput.trim()}
                                className={`px-3 py-2 text-xs text-white rounded shadow-sm ${aiLoading || !aiInput.trim() ? 'bg-gray-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'}`}
                            >
                                {aiLoading ? 'Working...' : 'Run AI Task'}
                            </button>
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
