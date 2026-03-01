import React from 'react';

import { useEffect, useRef, useState } from 'react';

interface BlockContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onCopyStyle?: () => void;
  onPasteStyle?: () => void;
  canPasteStyle?: boolean;
  onCreateQRCode?: () => void;
  onTransformToTOC?: () => void;
  onRefreshTOC?: () => void;
  onMergeWorksheetPrev?: () => void;
  onMergeWorksheetNext?: () => void;
  onMergeTablePrev?: () => void;
  onMergeTableNext?: () => void;
  onMergeSelected?: () => void;
  onDistributeHoriz?: () => void;
  onDistributeVert?: () => void;
  onDistributeHorizMore?: () => void;
  onDistributeHorizLess?: () => void;
  onDistributeVertMore?: () => void;
  onDistributeVertLess?: () => void;
  onAlignLeft?: () => void;
  onAlignCenter?: () => void;
  onAlignRight?: () => void;
  onAlignTop?: () => void;
  onAlignMiddle?: () => void;
  onAlignBottom?: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onToggleMarginOverride?: () => void;
  isMarginOverride?: boolean;
  hasBlock: boolean;
}

const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  x,
  y,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onCopyStyle,
  onPasteStyle,
  canPasteStyle,
  onCreateQRCode,
  onTransformToTOC,
  onRefreshTOC,
  onMergeWorksheetPrev,
  onMergeWorksheetNext,
  onMergeTablePrev,
  onMergeTableNext,
  onMergeSelected,
  onDistributeHoriz,
  onDistributeVert,
  onDistributeHorizMore,
  onDistributeHorizLess,
  onDistributeVertMore,
  onDistributeVertLess,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onAlignTop,
  onAlignMiddle,
  onAlignBottom,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
  onToggleMarginOverride,
  isMarginOverride,
  hasBlock
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      setPosition({ x, y });
      return;
    }

    const padding = 8;
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;
    let nextX = x;
    let nextY = y;

    if (nextY + menuHeight > window.innerHeight - padding) {
      nextY = Math.max(padding, y - menuHeight);
    }

    if (nextX + menuWidth > window.innerWidth - padding) {
      nextX = Math.max(padding, window.innerWidth - menuWidth - padding);
    }

    setPosition({ x: nextX, y: nextY });
  }, [x, y]);

  return (
    <>
      <div className="fixed inset-0 z-[990]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-[1000] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[170px] pointer-events-auto"
        style={{ left: position.x, top: position.y }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Clipboard actions */}
        <button
          onClick={() => { onCopy(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
          <span className="ml-auto text-xs text-gray-400">⌘C</span>
        </button>

        <button
          onClick={() => { onCut(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
          </svg>
          Cut
          <span className="ml-auto text-xs text-gray-400">⌘X</span>
        </button>

        <button
          onClick={() => { onPaste(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Paste
          <span className="ml-auto text-xs text-gray-400">⌘V</span>
        </button>

        {(onCopyStyle || onPasteStyle) && (
          <div className="border-t border-gray-100 my-1" />
        )}

        {onCopyStyle && (
          <button
            onClick={() => { onCopyStyle(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy style
          </button>
        )}

        {onPasteStyle && (
          <button
            onClick={() => { if (canPasteStyle) { onPasteStyle(); onClose(); } }}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 pointer-events-auto ${canPasteStyle ? 'hover:bg-brand-50 hover:text-brand-700' : 'text-gray-300 cursor-not-allowed'}`}
            disabled={!canPasteStyle}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Paste style
          </button>
        )}

        {hasBlock && (
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 pointer-events-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
            <span className="ml-auto text-xs text-gray-400">⌫</span>
          </button>
        )}

        {onCreateQRCode && (
          <button
            onClick={() => { onCreateQRCode(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 border-t border-gray-100 pointer-events-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zm-6 0H6v4h2v-4zm10-7h2m-6 0h-2v4h2V8zm-6 0H6v4h2V8zm0-4H6v4h2V4zm10 0h-2v4h2V4zM4 20h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Create QR Code
          </button>
        )}

        {onTransformToTOC && (
          <button
            onClick={() => { onTransformToTOC(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 border-t border-gray-100 pointer-events-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
            Transform to TOC
          </button>
        )}

        {onRefreshTOC && (
          <button
            onClick={() => { onRefreshTOC(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 border-t border-gray-100 pointer-events-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5" />
            </svg>
            Refresh TOC
          </button>
        )}

        {(onMergeWorksheetPrev || onMergeWorksheetNext) && (
          <>
            <div className="border-t border-gray-100 my-1" />
            {onMergeWorksheetPrev && (
              <button
                onClick={() => { onMergeWorksheetPrev(); onClose(); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Merge box above
              </button>
            )}
            {onMergeWorksheetNext && (
              <button
                onClick={() => { onMergeWorksheetNext(); onClose(); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Merge box below
              </button>
            )}
          </>
        )}

        {(onMergeTablePrev || onMergeTableNext) && (
          <>
            <div className="border-t border-gray-100 my-1" />
            {onMergeTablePrev && (
              <button
                onClick={() => { onMergeTablePrev(); onClose(); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Merge table above
              </button>
            )}
            {onMergeTableNext && (
              <button
                onClick={() => { onMergeTableNext(); onClose(); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Merge table below
              </button>
            )}
          </>
        )}

        {onMergeSelected && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => { onMergeSelected(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2 pointer-events-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h8M4 12h16M4 17h8" />
              </svg>
              Merge elements
            </button>
          </>
        )}

        {(onDistributeHoriz || onDistributeVert || onAlignLeft || onAlignCenter || onAlignRight || onAlignTop || onAlignMiddle || onAlignBottom) && (
          <div className="border-t border-gray-100 px-2 py-2">
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Align</div>
            <div className="grid grid-cols-3 gap-1 bg-gray-50/60 rounded-md p-1">
              {onAlignLeft && (
                <button onClick={() => { onAlignLeft(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Align Left">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h12M4 12h8M4 18h16" /></svg>
                </button>
              )}
              {onAlignCenter && (
                <button onClick={() => { onAlignCenter(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Align Center">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h12M4 12h16M6 18h12" /></svg>
                </button>
              )}
              {onAlignRight && (
                <button onClick={() => { onAlignRight(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Align Right">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h12M12 12h8M4 18h16" /></svg>
                </button>
              )}
              {onAlignTop && (
                <button onClick={() => { onAlignTop(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Align Top">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6h12M8 10v8M12 10v8M16 10v8" /></svg>
                </button>
              )}
              {onAlignMiddle && (
                <button onClick={() => { onAlignMiddle(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Align Middle">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h12M8 7v10M12 7v10M16 7v10" /></svg>
                </button>
              )}
              {onAlignBottom && (
                <button onClick={() => { onAlignBottom(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Align Bottom">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18h12M8 6v8M12 6v8M16 6v8" /></svg>
                </button>
              )}
            </div>
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mt-2 mb-1">Distribute</div>
            <div className="grid grid-cols-2 gap-1 bg-gray-50/60 rounded-md p-1">
              {onDistributeHoriz && (
                <button onClick={() => { onDistributeHoriz(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Distribute Horiz">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M7 8v8M17 8v8" /></svg>
                </button>
              )}
              {onDistributeVert && (
                <button onClick={() => { onDistributeVert(); onClose(); }} className="w-7 h-7 rounded hover:bg-white border border-transparent hover:border-brand-200" title="Distribute Vert">
                  <svg className="w-3.5 h-3.5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16M8 7h8M8 17h8" /></svg>
                </button>
              )}
            </div>
          </div>
        )}

        {hasBlock && (
          <>
            {(onBringForward || onSendBackward) && (
              <>
                <div className="border-t border-gray-100 my-1" />
                {onBringForward && (
                  <button
                    onClick={() => { onBringForward(); onClose(); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 11l7-7 7 7M5 19l7-7 7 7" />
                    </svg>
                    Porta avanti
                  </button>
                )}
                {onSendBackward && (
                  <button
                    onClick={() => { onSendBackward(); onClose(); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13l-7 7-7-7m14-8l-7 7-7-7" />
                    </svg>
                    Porta dietro
                  </button>
                )}
              </>
            )}

            {onToggleMarginOverride && (
              <button
                onClick={() => { onToggleMarginOverride(); onClose(); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M7 5v14a2 2 0 002 2h6a2 2 0 002-2V5" />
                </svg>
                {isMarginOverride ? 'Use margins' : 'Ignore margins'}
              </button>
            )}

            <button
              onClick={() => { onMoveUp(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Move up
            </button>

            <button
              onClick={() => { onMoveDown(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Move down
            </button>

            <button
              onClick={() => { onDuplicate(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplicate
            </button>
          </>
        )}
      </div>
    </>
  );
};

export default BlockContextMenu;
