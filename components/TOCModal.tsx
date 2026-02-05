import React, { useState } from 'react';
import { TOCSettings } from '../types';
import { X } from 'lucide-react';

interface TOCModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (settings: TOCSettings) => void;
}

const TOCModal: React.FC<TOCModalProps> = ({ isOpen, onClose, onInsert }) => {
  const [settings, setSettings] = useState<TOCSettings>({
    includeH1: true,
    includeH2: true,
    includeH3: false,
    style: 'classic'
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-96 p-6">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h3 className="font-bold text-lg text-gray-800">Table of Contents</h3>
          <button onClick={onClose} className="text-brand-600 hover:text-brand-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Headings to Include:</label>
            <div className="space-y-2 ml-1">
              <label className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  checked={settings.includeH1} 
                  onChange={(e) => setSettings({...settings, includeH1: e.target.checked})}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm">Heading 1 (H1)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  checked={settings.includeH2} 
                  onChange={(e) => setSettings({...settings, includeH2: e.target.checked})}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm">Heading 2 (H2)</span>
              </label>
              <label className="flex items-center space-x-2">
                <input 
                  type="checkbox" 
                  checked={settings.includeH3} 
                  onChange={(e) => setSettings({...settings, includeH3: e.target.checked})}
                  className="rounded text-brand-600 focus:ring-brand-500"
                />
                <span className="text-sm">Heading 3 (H3)</span>
              </label>
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-2">Appearance:</label>
             <select 
                value={settings.style}
                onChange={(e) => setSettings({...settings, style: e.target.value as any})}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
             >
                 <option value="classic">Classic (Simple Links)</option>
                 <option value="dotted">Book Style (Dotted Leaders)</option>
                 <option value="modern">Modern (Clean Spacing)</option>
             </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3">
           <button 
             onClick={onClose}
             className="px-4 py-2 text-sm text-brand-700 bg-brand-50 hover:bg-brand-100 rounded"
           >
              Cancel
            </button>
           <button 
             onClick={() => onInsert(settings)}
             className="px-4 py-2 text-sm text-white bg-[#8d55f1] hover:bg-[#7539d3] rounded shadow-sm"
           >
              Insert Table of Contents
            </button>
        </div>
      </div>
    </div>
  );
};

export default TOCModal;
