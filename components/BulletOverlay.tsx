import React, { useEffect, useState, useCallback } from 'react';

interface BulletItem {
    li: HTMLLIElement;
    rect: DOMRect;
    isOl: boolean;
    index: number; // 1-based display number
    isHidden: boolean; // bullet is hidden (list-style-type: none)
}

interface BulletOverlayProps {
    containerRef: React.RefObject<HTMLElement>;
    onContentChange: (html: string) => void;
    onClose: () => void;
}

const BulletOverlay: React.FC<BulletOverlayProps> = ({ containerRef, onContentChange, onClose }) => {
    const [bullets, setBullets] = useState<BulletItem[]>([]);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [editValue, setEditValue] = useState('');

    const scan = useCallback(() => {
        if (!containerRef.current) return;
        const items: BulletItem[] = [];
        containerRef.current.querySelectorAll('ol > li, ul > li').forEach(li => {
            const el = li as HTMLLIElement;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return; // Skip invisible items
            const parent = el.parentElement!;
            const isOl = parent.tagName === 'OL';
            const isHidden = el.style.listStyleType === 'none';
            // Calculate the display number for OL items
            let index = 1;
            if (isOl) {
                const start = parseInt(parent.getAttribute('start') || '1', 10);
                // Count only visible siblings before this one
                const siblings = Array.from(parent.querySelectorAll(':scope > li'));
                const pos = siblings.indexOf(el);
                // If LI has explicit value attribute, use that
                const explicitVal = el.getAttribute('value');
                if (explicitVal) {
                    index = parseInt(explicitVal, 10);
                } else {
                    index = start + pos;
                }
            }
            items.push({ li: el, rect, isOl, index, isHidden });
        });
        setBullets(items);
    }, [containerRef]);

    useEffect(() => {
        scan();
        // Re-scan on scroll/resize
        const workspace = containerRef.current?.closest('.editor-container') || window;
        const handleScroll = () => scan();
        workspace.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);
        return () => {
            workspace.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    }, [scan]);

    const save = () => {
        if (containerRef.current) onContentChange(containerRef.current.innerHTML);
    };

    // Hide the bullet (keep the LI for indentation)
    const handleHide = (item: BulletItem) => {
        item.li.style.listStyleType = 'none';
        save();
        scan();
    };

    // Restore a hidden bullet
    const handleRestore = (item: BulletItem) => {
        item.li.style.listStyleType = '';
        save();
        scan();
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

            {/* Overlay controls on each bullet */}
            {bullets.map((item, idx) => {
                // Position the controls to the LEFT of the LI, where the bullet/number sits
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
                            /* Bullet is hidden — show + to restore */
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                                className="w-5 h-5 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center text-[11px] font-bold shadow-md transition-all hover:scale-110"
                                title="Aggiungi bullet"
                            >
                                +
                            </button>
                        ) : (
                            /* Bullet is visible — show ✕ to hide */
                            <button
                                onClick={(e) => { e.stopPropagation(); handleHide(item); }}
                                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[9px] shadow-md transition-all hover:scale-110"
                                title="Nascondi bullet"
                            >
                                ✕
                            </button>
                        )}

                        {/* Edit button (only for OL numbered lists with visible bullets) */}
                        {item.isOl && !item.isHidden && editingIdx !== idx && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleEditStart(idx, item); }}
                                className="w-5 h-5 rounded-full bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center text-[9px] shadow-md transition-all hover:scale-110"
                                title="Modifica numero"
                            >
                                ✏️
                            </button>
                        )}

                        {/* Inline number editor */}
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
