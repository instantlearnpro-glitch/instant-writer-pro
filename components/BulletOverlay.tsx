import React, { useEffect, useState, useCallback, useRef } from 'react';

interface BulletItem {
    li: HTMLLIElement;
    rect: DOMRect;
    isOl: boolean;
    index: number;
    isHidden: boolean;
    textPreview: string;
    startsLowercase: boolean;
    startsUppercase: boolean;
}

type ActionType = 'hide' | 'restore';

interface ActionRecord {
    type: ActionType;
    startsLowercase: boolean;
    startsUppercase: boolean;
}

interface PatternSuggestion {
    description: string;
    action: ActionType;
    candidates: BulletItem[];
    // Which items user has checked for batch apply
    checked: boolean[];
    currentPreview: number; // index being previewed
}

interface BulletOverlayProps {
    containerRef: React.RefObject<HTMLElement>;
    onContentChange: (html: string) => void;
    onClose: () => void;
}

const PATTERN_THRESHOLD = 3;

function getTextInfo(li: HTMLLIElement) {
    const text = (li.textContent || '').trimStart();
    const fc = text.charAt(0);
    return {
        textPreview: text.slice(0, 60) + (text.length > 60 ? '…' : ''),
        startsLowercase: !!(fc && fc === fc.toLowerCase() && fc !== fc.toUpperCase()),
        startsUppercase: !!(fc && fc === fc.toUpperCase() && fc !== fc.toLowerCase()),
    };
}

const BulletOverlay: React.FC<BulletOverlayProps> = ({ containerRef, onContentChange, onClose }) => {
    const [bullets, setBullets] = useState<BulletItem[]>([]);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');
    const [actionHistory, setActionHistory] = useState<ActionRecord[]>([]);
    const [pattern, setPattern] = useState<PatternSuggestion | null>(null);
    const patternDismissedRef = useRef(false);

    const scan = useCallback(() => {
        if (!containerRef.current) return;
        const items: BulletItem[] = [];
        containerRef.current.querySelectorAll('ol > li, ul > li').forEach(li => {
            const el = li as HTMLLIElement;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const parent = el.parentElement!;
            const isOl = parent.tagName === 'OL';
            const isHidden = el.style.listStyleType === 'none' || window.getComputedStyle(el).listStyleType === 'none';
            let index = 1;
            if (isOl) {
                const start = parseInt(parent.getAttribute('start') || '1', 10);
                const siblings = Array.from(parent.querySelectorAll(':scope > li'));
                const pos = siblings.indexOf(el);
                const explicitVal = el.getAttribute('value');
                index = explicitVal ? parseInt(explicitVal, 10) : start + pos;
            }
            const info = getTextInfo(el);
            items.push({ li: el, rect, isOl, index, isHidden, ...info });
        });
        setBullets(items);
        return items;
    }, [containerRef]);

    useEffect(() => {
        scan();
        const workspace = containerRef.current?.closest('.editor-container') || window;
        const handleScroll = () => { if (!pattern) scan(); };
        workspace.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);
        return () => {
            workspace.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [scan, pattern]);

    const save = () => {
        if (containerRef.current) onContentChange(containerRef.current.innerHTML);
    };

    // Renumber a single OL's visible items, starting from `startNum`
    const renumberList = (list: HTMLElement, startNum?: number): number => {
        if (list.tagName !== 'OL') return 0;
        let num = startNum ?? parseInt(list.getAttribute('start') || '1', 10);
        // Update start attribute to match actual start
        if (startNum !== undefined) list.setAttribute('start', String(startNum));
        const hasContinuationAttr = list.hasAttribute('data-list-continuation');
        const children = Array.from(list.querySelectorAll(':scope > li'));
        children.forEach((li, liIdx) => {
            const el = li as HTMLElement;
            // Check all ways a bullet can be hidden:
            // 1. Inline style
            const hiddenInline = el.style.listStyleType === 'none';
            // 2. data-list-continuation on the LI itself
            const hiddenByAttr = el.hasAttribute('data-list-continuation');
            // 3. First child of a [data-list-continuation] parent
            const hiddenByParent = hasContinuationAttr && liIdx === 0;
            // 4. Computed style fallback
            const hiddenComputed = !hiddenInline && !hiddenByAttr && !hiddenByParent &&
                window.getComputedStyle(el).listStyleType === 'none';
            
            const hidden = hiddenInline || hiddenByAttr || hiddenByParent || hiddenComputed;
            if (!hidden) {
                el.setAttribute('value', String(num));
                num++;
            } else {
                el.removeAttribute('value');
            }
        });
        return num; // Next number for continuation
    };

    // Renumber ALL OLs in the workspace
    const renumberAllOLs = useCallback(() => {
        if (!containerRef.current) return;
        // Find ALL OLs in document order
        const allOLs = Array.from(containerRef.current.querySelectorAll('ol')) as HTMLElement[];
        const processedOLs = new Set<HTMLElement>();
        
        for (const ol of allOLs) {
            if (processedOLs.has(ol)) continue;
            
            const isContinuation = ol.hasAttribute('data-list-continuation') || 
                parseInt(ol.getAttribute('start') || '1', 10) > 1;
            
            if (isContinuation) {
                // This is a continuation — skip it here, it'll be processed
                // when we find its chain head
                continue;
            }
            
            // This is a fresh list — renumber from 1
            processedOLs.add(ol);
            let nextNum = renumberList(ol, 1);
            
            // Look for continuations: subsequent OLs with start > 1 or data-list-continuation
            const olIdx = allOLs.indexOf(ol);
            for (let i = olIdx + 1; i < allOLs.length; i++) {
                const nextOl = allOLs[i];
                if (processedOLs.has(nextOl)) continue;
                const isNext = nextOl.hasAttribute('data-list-continuation') || 
                    parseInt(nextOl.getAttribute('start') || '1', 10) > 1;
                if (isNext) {
                    processedOLs.add(nextOl);
                    nextNum = renumberList(nextOl, nextNum);
                } else {
                    break; // Found a fresh list, stop chaining
                }
            }
        }
        
        // Any unprocessed OLs (orphan continuations) — renumber from 1
        for (const ol of allOLs) {
            if (!processedOLs.has(ol)) {
                renumberList(ol, 1);
            }
        }
    }, [containerRef]);

    // Run renumbering on mount to fix pre-existing issues
    useEffect(() => {
        renumberAllOLs();
        save();
        scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Detect pattern after recording an action
    const detectPattern = useCallback((history: ActionRecord[], currentBullets: BulletItem[]) => {
        if (patternDismissedRef.current) return;
        if (history.length < PATTERN_THRESHOLD) return;

        const recent = history.slice(-PATTERN_THRESHOLD);
        // All same action type?
        const allSameType = recent.every(a => a.type === recent[0].type);
        if (!allSameType) return;

        const actionType = recent[0].type;

        // Detect pattern: all actions on lowercase-start items?
        const allLower = recent.every(a => a.startsLowercase);
        // Or: all actions on uppercase-start items?
        const allUpper = recent.every(a => a.startsUppercase);

        if (!allLower && !allUpper) return;

        // Find remaining candidates
        let candidates: BulletItem[];
        let description: string;

        if (actionType === 'hide' && allLower) {
            candidates = currentBullets.filter(b => !b.isHidden && b.startsLowercase);
            description = 'Nascondi tutti i bullet che iniziano con minuscola';
        } else if (actionType === 'hide' && allUpper) {
            candidates = currentBullets.filter(b => !b.isHidden && b.startsUppercase);
            description = 'Nascondi tutti i bullet che iniziano con maiuscola';
        } else if (actionType === 'restore' && allLower) {
            candidates = currentBullets.filter(b => b.isHidden && b.startsLowercase);
            description = 'Ripristina tutti i bullet nascosti (minuscola)';
        } else if (actionType === 'restore' && allUpper) {
            candidates = currentBullets.filter(b => b.isHidden && b.startsUppercase);
            description = 'Ripristina tutti i bullet nascosti (maiuscola)';
        } else {
            return;
        }

        if (candidates.length === 0) return;

        setPattern({
            description,
            action: actionType,
            candidates,
            checked: candidates.map(() => true),
            currentPreview: 0,
        });
    }, []);

    const recordAction = useCallback((type: ActionType, item: BulletItem) => {
        setActionHistory(prev => {
            const next = [...prev, {
                type,
                startsLowercase: item.startsLowercase,
                startsUppercase: item.startsUppercase,
            }];
            // Run detection on next tick after scan updates
            setTimeout(() => {
                const fresh = scan();
                if (fresh) detectPattern(next, fresh);
            }, 50);
            return next;
        });
    }, [scan, detectPattern]);

    const handleHide = (item: BulletItem) => {
        item.li.style.listStyleType = 'none';
        renumberAllOLs();
        save();
        scan();
        recordAction('hide', item);
    };

    const handleRestore = (item: BulletItem) => {
        const parent = item.li.parentElement;
        if (parent?.hasAttribute('data-list-continuation')) {
            parent.removeAttribute('data-list-continuation');
        }
        item.li.style.setProperty('list-style-type', item.isOl ? 'decimal' : 'disc', 'important');
        item.li.style.removeProperty('counter-increment');
        renumberAllOLs();
        save();
        scan();
        recordAction('restore', item);
    };

    const handleEditStart = (idx: number, item: BulletItem) => {
        setEditingIdx(idx);
        setEditValue(String(item.index));
    };

    const handleEditConfirm = (item: BulletItem) => {
        const newVal = parseInt(editValue, 10);
        if (!isNaN(newVal)) {
            item.li.setAttribute('value', String(newVal));
            save();
        }
        setEditingIdx(null);
        scan();
    };

    // Batch apply pattern
    const handleBatchApply = () => {
        if (!pattern) return;
        pattern.candidates.forEach((item, i) => {
            if (!pattern.checked[i]) return;
            if (pattern.action === 'hide') {
                item.li.style.listStyleType = 'none';
            } else {
                const parent = item.li.parentElement;
                if (parent?.hasAttribute('data-list-continuation')) {
                    parent.removeAttribute('data-list-continuation');
                }
                item.li.style.setProperty('list-style-type', item.isOl ? 'decimal' : 'disc', 'important');
                item.li.style.removeProperty('counter-increment');
            }
        });
        renumberAllOLs();
        save();
        setPattern(null);
        scan();
    };

    const handleBatchDismiss = () => {
        patternDismissedRef.current = true;
        setPattern(null);
    };

    // Toggle checkbox in pattern review
    const toggleCheck = (i: number) => {
        if (!pattern) return;
        const next = [...pattern.checked];
        next[i] = !next[i];
        setPattern({ ...pattern, checked: next });
    };

    // Scroll to item for preview
    const scrollToItem = (item: BulletItem) => {
        item.li.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash effect
        item.li.style.outline = '3px solid #f59e0b';
        item.li.style.outlineOffset = '2px';
        setTimeout(() => {
            item.li.style.outline = '';
            item.li.style.outlineOffset = '';
        }, 1500);
    };

    return (
        <>
            {/* Semi-transparent backdrop */}
            <div
                className="fixed inset-0 z-[980] bg-black/10"
                onClick={onClose}
            />

            {/* Info bar */}
            <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[990] bg-brand-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-3">
                <span>📝 Modifica Bullet</span>
                <span className="text-brand-200">
                    <span className="inline-block w-3 h-3 bg-red-500 rounded-full text-[8px] text-center leading-3 mr-0.5">✕</span> nascondi
                    <span className="inline-block w-3 h-3 bg-green-500 rounded-full text-[8px] text-center leading-3 mx-0.5 ml-2">+</span> ripristina
                    <span className="inline-block w-3 h-3 bg-brand-400 rounded-full text-[8px] text-center leading-3 mx-0.5 ml-2">✏</span> modifica n.
                </span>
                <button
                    onClick={onClose}
                    className="ml-2 bg-white/20 hover:bg-white/30 rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                >
                    ✕
                </button>
            </div>

            {/* Pattern suggestion panel */}
            {pattern && (
                <div className="fixed top-24 right-6 z-[995] bg-white rounded-xl shadow-2xl border border-amber-200 w-96 max-h-[70vh] flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-2">
                        <span className="text-amber-600 text-lg">🔍</span>
                        <div className="flex-1">
                            <div className="text-sm font-bold text-amber-800">Pattern riconosciuto!</div>
                            <div className="text-xs text-amber-600">{pattern.description}</div>
                        </div>
                        <button
                            onClick={handleBatchDismiss}
                            className="text-amber-400 hover:text-amber-600 text-sm"
                            title="Ignora"
                        >✕</button>
                    </div>

                    {/* Item list */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        <div className="text-[10px] text-gray-400 uppercase font-bold px-2 mb-1">
                            {pattern.candidates.length} elementi trovati — seleziona quelli da modificare
                        </div>
                        {pattern.candidates.map((item, i) => (
                            <div
                                key={i}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                                    pattern.checked[i] ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-transparent'
                                }`}
                                onClick={() => toggleCheck(i)}
                            >
                                <input
                                    type="checkbox"
                                    checked={pattern.checked[i]}
                                    onChange={() => toggleCheck(i)}
                                    className="accent-amber-500 flex-shrink-0"
                                />
                                <span className="flex-1 truncate text-gray-700">
                                    {pattern.action === 'hide' ? '🔴' : '🟢'} {item.textPreview}
                                </span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); scrollToItem(item); }}
                                    className="text-[9px] text-brand-500 hover:text-brand-700 font-bold flex-shrink-0"
                                    title="Vai a questo elemento"
                                >
                                    👁
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-2 bg-gray-50">
                        <button
                            onClick={handleBatchApply}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors"
                        >
                            ✓ Applica a {pattern.checked.filter(Boolean).length} selezionati
                        </button>
                        <button
                            onClick={handleBatchDismiss}
                            className="text-xs text-gray-500 hover:text-gray-700 py-2 px-3"
                        >
                            Ignora
                        </button>
                    </div>
                </div>
            )}

            {/* Overlay controls on each bullet */}
            {bullets.map((item, idx) => {
                const top = item.rect.top;
                const left = item.rect.left - 30;

                return (
                    <div
                        key={idx}
                        className="fixed z-[990] flex items-center gap-0.5"
                        style={{
                            top: top + 2,
                            left: Math.max(left - 28, 4),
                        }}
                    >
                        {item.isHidden ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                                className="w-5 h-5 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center text-[11px] font-bold shadow-md transition-all hover:scale-110"
                                title="Aggiungi bullet"
                            >
                                +
                            </button>
                        ) : (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleHide(item); }}
                                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[9px] shadow-md transition-all hover:scale-110"
                                title="Nascondi bullet"
                            >
                                ✕
                            </button>
                        )}

                        {item.isOl && !item.isHidden && editingIdx !== idx && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleEditStart(idx, item); }}
                                className="w-5 h-5 rounded-full bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center text-[9px] shadow-md transition-all hover:scale-110"
                                title="Modifica numero"
                            >
                                ✏️
                            </button>
                        )}

                        {item.isOl && editingIdx === idx && (
                            <div className="flex items-center gap-0.5 ml-0.5">
                                <input
                                    type="number"
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleEditConfirm(item);
                                        if (e.key === 'Escape') setEditingIdx(null);
                                    }}
                                    autoFocus
                                    className="w-10 h-5 text-[10px] text-center border border-brand-300 rounded bg-white shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleEditConfirm(item); }}
                                    className="w-5 h-5 rounded bg-green-500 hover:bg-green-600 text-white flex items-center justify-center text-[9px] shadow-sm"
                                >
                                    ✓
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
};

export default BulletOverlay;
