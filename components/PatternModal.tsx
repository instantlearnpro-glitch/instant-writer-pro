import React, { useState } from 'react';

interface PatternMatch {
  element: HTMLElement;
  preview: string;
}

interface PatternModalProps {
  isOpen: boolean;
  actionType: string;
  matches: PatternMatch[];
  onConfirm: (selectedIds: string[]) => void;
  onCancel: () => void;
}

const PatternModal: React.FC<PatternModalProps> = ({
  isOpen,
  actionType,
  matches,
  onConfirm,
  onCancel
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(matches.map(m => m.element.id || ''))
  );

  if (!isOpen) return null;

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    setSelectedIds(new Set(matches.map(m => m.element.id || '')));
  };

  const selectNone = () => {
    setSelectedIds(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedIds));
  };

  const scrollToElement = (element: HTMLElement) => {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.style.outline = '3px solid #f59e0b';
    setTimeout(() => {
      element.style.outline = '';
    }, 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            Pattern riconosciuto! 🎯
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Hai eseguito "{actionType}" su elementi simili. 
            Trovati <strong>{matches.length}</strong> elementi corrispondenti.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex gap-2 mb-3">
            <button
              onClick={selectAll}
              className="text-xs px-2 py-1 bg-brand-100 text-brand-700 rounded hover:bg-brand-200"
            >
              Seleziona tutti
            </button>
            <button
              onClick={selectNone}
              className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Deseleziona tutti
            </button>
          </div>

          <div className="space-y-2">
            {matches.map((match, index) => {
              const id = match.element.id || `temp-${index}`;
              const isSelected = selectedIds.has(id);
              
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-brand-50 border-brand-300' 
                      : 'bg-gray-50 border-gray-200 hover:bg-brand-50'
                  }`}
                  onClick={() => toggleSelection(id)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelection(id)}
                    className="w-4 h-4 text-brand-600 rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-mono text-gray-700 truncate">
                      {match.preview}
                    </div>
                    <div className="text-xs text-gray-400">
                      Pagina {match.element.closest('.page')?.getAttribute('data-page') || '?'}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToElement(match.element);
                    }}
                    className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                  >
                    👁️ Vedi
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            {selectedIds.size} di {matches.length} selezionati
          </span>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-brand-50 hover:text-brand-700"
            >
              Annulla
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Applica a {selectedIds.size} elementi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatternModal;
