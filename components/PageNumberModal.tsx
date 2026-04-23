import React, { useState, useEffect } from 'react';
import { X, ArrowUpFromLine, ArrowDownFromLine, AlignLeft, AlignCenter, AlignRight, MoveVertical } from 'lucide-react';
import { PageAnchor } from '../types';

interface PageNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (startAnchorId: string, font: string, fontSize: string, position: 'top' | 'bottom', align: 'left' | 'center' | 'right', margin: number) => void;
  onPreview: (startAnchorId: string, font: string, fontSize: string, position: 'top' | 'bottom', align: 'left' | 'center' | 'right', margin: number) => void;
  anchors: PageAnchor[];
  pageCount: number;
}

const PageNumberModal: React.FC<PageNumberModalProps> = ({ isOpen, onClose, onApply, onPreview, anchors, pageCount }) => {
  const [selectedAnchorId, setSelectedAnchorId] = useState<string>('');
  const [startMode, setStartMode] = useState<'anchor' | 'editorPage'>('anchor');
  const [manualEditorPage, setManualEditorPage] = useState(1);
  const [font, setFont] = useState('Arial, sans-serif');
  const [fontSize, setFontSize] = useState('12');
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [margin, setMargin] = useState(0.4);
  const maxPage = Math.max(1, pageCount || 1);
  const effectiveStartId = startMode === 'editorPage'
    ? `EDITOR_PAGE:${Math.min(Math.max(manualEditorPage || 1, 1), maxPage)}`
    : selectedAnchorId;

  useEffect(() => {
    if (isOpen) {
        const selectedExists = anchors.some(anchor => anchor.id === selectedAnchorId);
        if (anchors.length > 0 && (!selectedAnchorId || !selectedExists)) {
            setSelectedAnchorId(anchors[0].id);
        }
        setManualEditorPage(prev => Math.min(Math.max(prev || 1, 1), maxPage));
    }
  }, [isOpen, anchors, selectedAnchorId, maxPage]);

  // Real-time preview whenever any property changes
  useEffect(() => {
      if (isOpen && effectiveStartId) {
          onPreview(effectiveStartId, font, fontSize, position, align, margin);
      }
  }, [effectiveStartId, font, fontSize, position, align, margin, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-96 border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Page Numbering Settings</h3>
          <button onClick={onClose} className="text-brand-600 hover:text-brand-700 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-5">
          {/* Start Point Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start numbering from:</label>
            <div className="flex border border-brand-200 rounded overflow-hidden mb-2">
              <button
                type="button"
                onClick={() => setStartMode('anchor')}
                className={`flex-1 py-1.5 text-xs font-semibold ${startMode === 'anchor' ? 'bg-brand-100 text-brand-700' : 'bg-white text-gray-600 hover:bg-brand-50'}`}
              >
                By section
              </button>
              <div className="w-px bg-brand-200"></div>
              <button
                type="button"
                onClick={() => setStartMode('editorPage')}
                className={`flex-1 py-1.5 text-xs font-semibold ${startMode === 'editorPage' ? 'bg-brand-100 text-brand-700' : 'bg-white text-gray-600 hover:bg-brand-50'}`}
              >
                By editor page
              </button>
            </div>

            {startMode === 'anchor' ? (
              <select
                value={selectedAnchorId}
                onChange={(e) => setSelectedAnchorId(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
              >
                 {anchors.map(anchor => {
                     const pageLabel = anchor.page ? ` (editor p. ${anchor.page})` : '';
                     const title = anchor.tagName === 'DOC_START'
                       ? 'Beginning of Document'
                       : `${anchor.tagName.toUpperCase()} - ${anchor.text.substring(0, 30)}${anchor.text.length > 30 ? '...' : ''}${pageLabel}`;
                     return (
                       <option key={anchor.id} value={anchor.id}>
                         {title}
                       </option>
                     );
                 })}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Editor page</span>
                <input
                  type="number"
                  min={1}
                  max={maxPage}
                  value={manualEditorPage}
                  onChange={(e) => {
                    const next = Number.parseInt(e.target.value, 10);
                    setManualEditorPage(Number.isFinite(next) ? Math.min(Math.max(next, 1), maxPage) : 1);
                  }}
                  className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
                />
                <span className="text-sm text-gray-600">= page 1</span>
              </div>
            )}
            <p className="mt-1 text-[11px] text-gray-500">
              The TOC will use these inserted page numbers, not the editor's internal page count.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
              {/* Position Controls */}
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Position:</label>
                  <div className="flex border border-brand-200 rounded overflow-hidden">
                      <button 
                        onClick={() => setPosition('top')}
                        className={`flex-1 flex justify-center py-2 text-brand-600 hover:text-brand-700 ${position === 'top' ? 'bg-brand-100 text-brand-700' : 'bg-white hover:bg-brand-50'}`}
                      >
                          <ArrowUpFromLine size={18} />
                      </button>
                      <div className="w-px bg-brand-200"></div>
                      <button 
                        onClick={() => setPosition('bottom')}
                        className={`flex-1 flex justify-center py-2 text-brand-600 hover:text-brand-700 ${position === 'bottom' ? 'bg-brand-100 text-brand-700' : 'bg-white hover:bg-brand-50'}`}
                      >
                          <ArrowDownFromLine size={18} />
                      </button>
                  </div>
              </div>
              
              {/* Alignment Controls */}
              <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Alignment:</label>
                  <div className="flex border border-brand-200 rounded overflow-hidden">
                      <button 
                        onClick={() => setAlign('left')}
                        className={`flex-1 flex justify-center py-2 text-brand-600 hover:text-brand-700 ${align === 'left' ? 'bg-brand-100 text-brand-700' : 'bg-white hover:bg-brand-50'}`}
                      >
                          <AlignLeft size={18} />
                      </button>
                      <div className="w-px bg-brand-200"></div>
                      <button 
                        onClick={() => setAlign('center')}
                        className={`flex-1 flex justify-center py-2 text-brand-600 hover:text-brand-700 ${align === 'center' ? 'bg-brand-100 text-brand-700' : 'bg-white hover:bg-brand-50'}`}
                      >
                          <AlignCenter size={18} />
                      </button>
                      <div className="w-px bg-brand-200"></div>
                      <button 
                        onClick={() => setAlign('right')}
                        className={`flex-1 flex justify-center py-2 text-brand-600 hover:text-brand-700 ${align === 'right' ? 'bg-brand-100 text-brand-700' : 'bg-white hover:bg-brand-50'}`}
                      >
                          <AlignRight size={18} />
                      </button>
                  </div>
              </div>
          </div>

          {/* Margin Adjustment (Inches) */}
          <div>
            <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <MoveVertical size={14} /> Margin from edge:
                </label>
                <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">{margin.toFixed(2)} in</span>
            </div>
            <input 
              type="range" min="0.1" max="2.0" step="0.05"
              value={margin} 
              onChange={(e) => setMargin(parseFloat(e.target.value))}
              className="w-full accent-brand-600 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>0.1"</span>
                <span>1.0"</span>
                <span>2.0"</span>
            </div>
          </div>

          {/* Font & Size */}
          <div className="flex gap-4">
            <div className="flex-[2]">
                <label className="block text-sm font-medium text-gray-700 mb-1 text-[11px] uppercase tracking-wider">Font:</label>
                <select 
                value={font}
                onChange={(e) => setFont(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500"
                >
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Courier Prime', monospace">Courier Prime</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="'Black Ops One', cursive">Black Ops One</option>
                </select>
            </div>
            <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1 text-[11px] uppercase tracking-wider">Size:</label>
                <select 
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand-500"
                >
                <option value="9">9pt</option>
                <option value="10">10pt</option>
                <option value="11">11pt</option>
                <option value="12">12pt</option>
                <option value="14">14pt</option>
                </select>
            </div>
          </div>

        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 rounded-b-lg">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onApply(effectiveStartId, font, fontSize, position, align, margin)}
            className="px-6 py-2 text-sm font-bold text-white bg-[#8d55f1] hover:bg-[#7539d3] rounded shadow-md transition-all active:scale-95"
          >
            Finish
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageNumberModal;
