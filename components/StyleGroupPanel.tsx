import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Trash2, MousePointerClick, Check, Eye, Palette, ChevronDown, ChevronRight } from 'lucide-react';

export interface StyleGroup {
    id: string;
    name: string;
    elementIds: string[];
}

interface StyleGroupPanelProps {
    isOpen: boolean;
    onClose: () => void;
    groups: StyleGroup[];
    activeGroupIds: string[];
    pickingGroupId: string | null;
    pickedCount: number;
    onCreateGroup: () => void;
    onDeleteGroup: (groupId: string) => void;
    onRenameGroup: (groupId: string, newName: string) => void;
    onToggleGroup: (groupId: string) => void;
    onStartPicking: (groupId: string) => void;
    onStopPicking: () => void;
    onFinalizePicking: () => void;
    onScrollToElement: (elementId: string) => void;
}

const StyleGroupPanel: React.FC<StyleGroupPanelProps> = ({
    isOpen,
    onClose,
    groups,
    activeGroupIds,
    pickingGroupId,
    pickedCount,
    onCreateGroup,
    onDeleteGroup,
    onRenameGroup,
    onToggleGroup,
    onStartPicking,
    onStopPicking,
    onFinalizePicking,
    onScrollToElement
}) => {
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingGroupId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingGroupId]);

    if (!isOpen) return null;

    const handleStartRename = (group: StyleGroup) => {
        setEditingGroupId(group.id);
        setEditName(group.name);
    };

    const handleFinishRename = (groupId: string) => {
        if (editName.trim()) {
            onRenameGroup(groupId, editName.trim());
        }
        setEditingGroupId(null);
    };

    const isActive = (groupId: string) => activeGroupIds.includes(groupId);

    return (
        <div className="fixed right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col"
            style={{ top: '68px', height: 'calc(100vh - 68px)' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-white">
                <div className="flex items-center gap-2">
                    <Palette size={16} className="text-purple-600" />
                    <span className="font-semibold text-sm text-gray-800">Style Groups</span>
                </div>
                <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                    <X size={16} />
                </button>
            </div>

            {/* Picking mode instruction bar */}
            {pickingGroupId && (
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
                    <div className="flex items-center gap-2 text-amber-800 mb-1.5">
                        <MousePointerClick size={14} />
                        <span className="text-xs font-bold uppercase">Selection Mode</span>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                        Hold <kbd className="px-1 py-0.5 bg-amber-100 border border-amber-300 rounded text-[10px] font-mono">⌘</kbd> and click on elements to select them.
                    </p>
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-amber-600 font-medium">
                            {pickedCount} selected{pickedCount >= 3 ? ' — auto-detect ready!' : ` — pick ${3 - pickedCount} more`}
                        </span>
                        <div className="flex gap-1.5">
                            <button
                                onClick={onStopPicking}
                                className="text-[10px] px-2 py-1 bg-white border border-amber-300 rounded text-amber-700 hover:bg-amber-100"
                            >
                                Cancel
                            </button>
                            {pickedCount >= 1 && (
                                <button
                                    onClick={onFinalizePicking}
                                    className="text-[10px] px-2 py-1 bg-purple-600 rounded text-white hover:bg-purple-700 flex items-center gap-1"
                                >
                                    <Check size={10} />
                                    Done
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Progress dots */}
                    <div className="flex gap-1 mt-2">
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-colors ${
                                    i < pickedCount ? 'bg-purple-500' : 'bg-amber-200'
                                }`}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Groups list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {groups.length === 0 && !pickingGroupId && (
                    <div className="text-center py-8 text-gray-400">
                        <Palette size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-xs">No style groups yet</p>
                        <p className="text-[10px] mt-1">Click + to create your first group</p>
                    </div>
                )}

                {groups.map(group => {
                    const active = isActive(group.id);
                    const isPicking = pickingGroupId === group.id;
                    const expanded = expandedGroupId === group.id;

                    return (
                        <div
                            key={group.id}
                            className={`rounded-lg border transition-all ${
                                isPicking
                                    ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300'
                                    : active
                                        ? 'border-purple-400 bg-purple-50 ring-1 ring-purple-200'
                                        : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                            }`}
                        >
                            <div className="p-2.5">
                                <div className="flex items-center gap-2">
                                    {/* Toggle active */}
                                    <button
                                        onClick={() => !isPicking && onToggleGroup(group.id)}
                                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                            active
                                                ? 'bg-purple-600 border-purple-600'
                                                : 'border-gray-300 hover:border-purple-400'
                                        }`}
                                        title={active ? 'Deselect group' : 'Select group for bulk editing'}
                                    >
                                        {active && <Check size={10} className="text-white" />}
                                    </button>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        {editingGroupId === group.id ? (
                                            <input
                                                ref={editInputRef}
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                onBlur={() => handleFinishRename(group.id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleFinishRename(group.id);
                                                    if (e.key === 'Escape') setEditingGroupId(null);
                                                }}
                                                className="w-full text-xs border border-purple-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                            />
                                        ) : (
                                            <span
                                                className="text-xs font-medium text-gray-700 cursor-pointer truncate block"
                                                onDoubleClick={() => handleStartRename(group)}
                                                title="Double-click to rename"
                                            >
                                                {group.name}
                                            </span>
                                        )}
                                    </div>

                                    {/* Element count badge */}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                        active ? 'bg-purple-200 text-purple-700' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {group.elementIds.length}
                                    </span>

                                    {/* Actions */}
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={() => setExpandedGroupId(expanded ? null : group.id)}
                                            className="p-1 rounded hover:bg-white/70 text-gray-400 hover:text-gray-600"
                                            title="Show elements"
                                        >
                                            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </button>
                                        <button
                                            onClick={() => onStartPicking(group.id)}
                                            className="p-1 rounded hover:bg-white/70 text-gray-400 hover:text-purple-600"
                                            title="Add more elements"
                                        >
                                            <MousePointerClick size={12} />
                                        </button>
                                        <button
                                            onClick={() => onDeleteGroup(group.id)}
                                            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                            title="Delete group"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Expanded element list */}
                            {expanded && group.elementIds.length > 0 && (
                                <div className="border-t border-gray-200 px-2.5 py-2 space-y-1 max-h-32 overflow-y-auto">
                                    {group.elementIds.map((elId, idx) => {
                                        const el = document.getElementById(elId);
                                        const text = el?.textContent?.trim() || '';
                                        const tag = el?.tagName.toLowerCase() || '?';
                                        const preview = text.length > 30 ? text.slice(0, 30) + '…' : text || '(empty)';
                                        return (
                                            <div
                                                key={elId}
                                                className="flex items-center gap-2 text-[10px] text-gray-500 hover:text-gray-700 cursor-pointer"
                                                onClick={() => onScrollToElement(elId)}
                                            >
                                                <Eye size={9} className="flex-shrink-0" />
                                                <span className="font-mono text-purple-500">&lt;{tag}&gt;</span>
                                                <span className="truncate">{preview}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer — Create new group */}
            <div className="p-3 border-t border-gray-200 bg-gray-50">
                {activeGroupIds.length > 0 && (
                    <div className="mb-2 px-2 py-1.5 rounded bg-purple-50 border border-purple-200">
                        <span className="text-[10px] text-purple-700 font-medium">
                            {activeGroupIds.length} group{activeGroupIds.length > 1 ? 's' : ''} active — use toolbar to edit all
                        </span>
                    </div>
                )}
                <button
                    onClick={onCreateGroup}
                    disabled={!!pickingGroupId}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                    <Plus size={16} />
                    New Group
                </button>
            </div>
        </div>
    );
};

export default StyleGroupPanel;
