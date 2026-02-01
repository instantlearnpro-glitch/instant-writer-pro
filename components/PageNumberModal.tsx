import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { PageAnchor } from '../types';

interface PageNumberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (startAnchorId: string, font: string, fontSize: string) => void;
  anchors: PageAnchor[];
}

const PageNumberModal: React.FC<PageNumberModalProps> = ({ isOpen, onClose, onApply, anchors }) => {
  const [selectedAnchorId, setSelectedAnchorId] = useState<string>('');
  const [font, setFont] = useState('Arial, sans-serif');
  const [fontSize, setFontSize] = useState('12');

  useEffect(() => {
    if (isOpen) {
        // Default to the first anchor (usually "Beginning of Document" or first header)
        if (anchors.length > 0) {
            setSelectedAnchorId(anchors[0].id);
        }
    }
  }, [isOpen, anchors]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-96 border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Insert Page Numbers</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Start Point Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start numbering from:</label>
            <select 
              value={selectedAnchorId}
              onChange={(e) => setSelectedAnchorId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
               {anchors.map(anchor => (
                   <option key={anchor.id} value={anchor.id}>
                       {anchor.tagName === 'DOC_START' ? 'Beginning of Document' : `${anchor.tagName.toUpperCase()} - ${anchor.text.substring(0, 30)}${anchor.text.length > 30 ? '...' : ''}`}
                   </option>
               ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Numbering starts on the page containing this section.</p>
          </div>

          {/* Font Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Font Family:</label>
            <select 
              value={font}
              onChange={(e) => setFont(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="'Roboto', sans-serif">Roboto</option>
              <option value="'Courier Prime', monospace">Courier Prime</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Black Ops One', cursive">Black Ops One</option>
            </select>
          </div>

          {/* Size Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Font Size:</label>
            <div className="flex items-center gap-2">
                <input 
                type="range" 
                min="8" 
                max="24" 
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="flex-1 accent-blue-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm font-bold text-gray-600 w-8">{fontSize}pt</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2 rounded-b-lg">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => onApply(selectedAnchorId, font, fontSize)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded shadow-sm transition-colors"
          >
            Apply Numbers
          </button>
        </div>
      </div>
    </div>
  );
};

export default PageNumberModal;
