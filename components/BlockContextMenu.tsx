import React from 'react';

interface BlockContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onInsertPageBreak: () => void;
  onInsertSpace: (size: 'small' | 'medium' | 'large') => void;
  onInsertHR: () => void;
  onInsertImage: () => void;
  onInsertParagraph: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  hasBlock: boolean;
  isHR: boolean;
}

const BlockContextMenu: React.FC<BlockContextMenuProps> = ({
  x,
  y,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onInsertPageBreak,
  onInsertSpace,
  onInsertHR,
  onInsertImage,
  onInsertParagraph,
  onMoveUp,
  onMoveDown,
  onDelete,
  onDuplicate,
  hasBlock,
  isHR
}) => {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px]"
        style={{ left: x, top: y }}
      >
        {/* Clipboard actions */}
        <button
          onClick={() => { onCopy(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copia
          <span className="ml-auto text-xs text-gray-400">⌘C</span>
        </button>

        <button
          onClick={() => { onCut(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
          </svg>
          Taglia
          <span className="ml-auto text-xs text-gray-400">⌘X</span>
        </button>

        <button
          onClick={() => { onPaste(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Incolla
          <span className="ml-auto text-xs text-gray-400">⌘V</span>
        </button>

        {hasBlock && (
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Elimina
            <span className="ml-auto text-xs text-gray-400">⌫</span>
          </button>
        )}

        <div className="border-t border-gray-100 my-1" />
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">Inserisci</div>
        
        <button
          onClick={() => { onInsertParagraph(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          Paragrafo
        </button>

        <button
          onClick={() => { onInsertImage(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Immagine
        </button>

        <button
          onClick={() => { onInsertHR(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
          Linea orizzontale
        </button>

        <div className="border-t border-gray-100 my-1" />
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">Spaziatura</div>

        <button
          onClick={() => { onInsertSpace('small'); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <div className="w-3 h-1 bg-gray-300" />
          </div>
          Spazio piccolo (0.5")
        </button>

        <button
          onClick={() => { onInsertSpace('medium'); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <div className="w-3 h-2 bg-gray-300" />
          </div>
          Spazio medio (1")
        </button>

        <button
          onClick={() => { onInsertSpace('large'); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <div className="w-3 h-3 bg-gray-300" />
          </div>
          Spazio grande (2")
        </button>

        <div className="border-t border-gray-100 my-1" />

        <button
          onClick={() => { onInsertPageBreak(); onClose(); }}
          className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Interruzione di pagina
        </button>

        {hasBlock && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase">
              {isHR ? 'Linea' : 'Blocco'}
            </div>

            <button
              onClick={() => { onMoveUp(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Sposta su
            </button>

            <button
              onClick={() => { onMoveDown(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Sposta giù
            </button>

            <button
              onClick={() => { onDuplicate(); onClose(); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50 hover:text-brand-700 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplica
            </button>
          </>
        )}
      </div>
    </>
  );
};

export default BlockContextMenu;
