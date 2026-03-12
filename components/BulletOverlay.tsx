import React, { useEffect, useState, useCallback } from 'react';

interface BulletItem {
    li: HTMLLIElement;
    rect: DOMRect;
    isOl: boolean;
    index: number; // 1-based display number
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
            // Skip hidden bullets
            if (el.style.listStyleType === 'none') return;
            const rect = el.getBoundingClientRect();
            const parent = el.parentElement!;
            const isOl = parent.tagName === 'OL';
            // Calculate the display number for OL items
            let index = 1;
            if (isOl) {
                const start = parseInt(parent.getAttribute('start') || '1', 10);
                const siblings = Array.from(parent.querySelectorAll(':scope > li'));
                const pos = siblings.indexOf(el);
                index = start + pos;
            }
            items.push({ li: el, rect, isOl, index });
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

    const handleDelete = (item: BulletItem) => {
        const li = item.li;
        const list = li.parentElement;
        if (!list) return;

        // Convert LI content to a P
        const p = document.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        // Copy text styles
        const cs = window.getComputedStyle(li);
        p.style.fontSize = cs.fontSize;
        p.style.fontFamily = cs.fontFamily;
        p.style.lineHeight = cs.lineHeight;
        p.style.color = cs.color;

        li.remove();

        if (list.children.length === 0) {
            list.replaceWith(p);
        } else {
            list.after(p);
        }

        if (containerRef.current) onContentChange(containerRef.current.innerHTML);
        scan(); // Re-scan
    };

    const handleEditStart = (idx: number, item: BulletItem) => {
        setEditingIdx(idx);
        setEditValue(String(item.index));
    };

    const handleEditConfirm = (item: BulletItem) => {
        const newVal = parseInt(editValue, 10);
        if (!isNaN(newVal) && item.li.parentElement) {
            // Set the value attribute on this LI to force a specific number
            item.li.setAttribute('value', String(newVal));
            if (containerRef.current) onContentChange(containerRef.current.innerHTML);
        }
        setEditingIdx(null);
        scan();
    };

    // Get the container rect for relative positioning
    const containerRect = containerRef.current?.getBoundingClientRect();

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
                <span className="text-brand-200">Clicca ✕ per eliminare, ✏️ per modificare il numero</span>
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
                const left = item.rect.left - 30; // Bullet area is to the left of the LI content

                return (
                    <div
                        key={idx}
                        className="fixed z-[990] flex items-center gap-0.5"
                        style={{
                            top: top + 2,
                            left: Math.max(left - 28, 4),
                        }}
                    >
                        {/* Delete button */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                            className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-[9px] shadow-md transition-all hover:scale-110"
                            title="Elimina bullet"
                        >
                            ✕
                        </button>

                        {/* Edit button (only for OL numbered lists) */}
                        {item.isOl && editingIdx !== idx && (
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
