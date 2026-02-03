import React, { useState } from 'react';
import { BorderSettings } from '../types';
import { X, Square } from 'lucide-react';

interface BorderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (settings: BorderSettings) => void;
}

const BorderModal: React.FC<BorderModalProps> = ({ isOpen, onClose, onApply }) => {
  const [settings, setSettings] = useState<BorderSettings>({
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 0,
    backgroundColor: 'transparent',
    padding: 10,
    borderStyle: 'solid'
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[400px] p-6">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <Square size={20} />
            Borders & Shading
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Border Width */}
            <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Thickness (px)</label>
                <input 
                    type="number" 
                    min="0" 
                    max="20"
                    value={settings.borderWidth}
                    onChange={(e) => setSettings({...settings, borderWidth: parseInt(e.target.value) || 0})}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
            </div>

            {/* Radius */}
            <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Roundness (px)</label>
                <input 
                    type="number" 
                    min="0" 
                    max="50"
                    value={settings.borderRadius}
                    onChange={(e) => setSettings({...settings, borderRadius: parseInt(e.target.value) || 0})}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
            </div>
            
            {/* Padding */}
            <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Padding (px)</label>
                <input 
                    type="number" 
                    min="0" 
                    max="50"
                    value={settings.padding}
                    onChange={(e) => setSettings({...settings, padding: parseInt(e.target.value) || 0})}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                />
            </div>

            {/* Style */}
            <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Style</label>
                <select 
                    value={settings.borderStyle}
                    onChange={(e) => setSettings({...settings, borderStyle: e.target.value as any})}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                    <option value="double">Double</option>
                </select>
            </div>

            {/* Border Color */}
            <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Border Color</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="color" 
                        value={settings.borderColor}
                        onChange={(e) => setSettings({...settings, borderColor: e.target.value})}
                        className="h-8 w-8 p-0 border-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-600 font-mono">{settings.borderColor}</span>
                </div>
            </div>

            {/* Background Color */}
            <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Background</label>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input 
                            type="color" 
                            value={settings.backgroundColor === 'transparent' ? '#ffffff' : settings.backgroundColor}
                            onChange={(e) => setSettings({...settings, backgroundColor: e.target.value})}
                            className="h-8 w-8 p-0 border-none cursor-pointer"
                        />
                        {settings.backgroundColor === 'transparent' && (
                             <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-red-500 font-bold text-xs bg-white/80">X</div>
                        )}
                    </div>
                    <button 
                        onClick={() => setSettings({...settings, backgroundColor: 'transparent'})}
                        className="text-xs underline text-gray-500 hover:text-gray-800"
                    >
                        Clear
                    </button>
                </div>
            </div>
        </div>

        {/* Preview */}
        <div className="mb-6">
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Preview</label>
            <div className="bg-gray-100 p-4 rounded flex items-center justify-center border border-gray-200 h-24">
                <div style={{
                    borderWidth: `${settings.borderWidth}px`,
                    borderColor: settings.borderColor,
                    borderStyle: settings.borderStyle,
                    borderRadius: `${settings.borderRadius}px`,
                    backgroundColor: settings.backgroundColor,
                    padding: `${settings.padding}px`,
                    color: 'black',
                    fontSize: '12px'
                }}>
                    Sample Text inside Frame
                </div>
            </div>
        </div>

        <div className="flex justify-end space-x-3">
           <button 
             onClick={onClose}
             className="px-4 py-2 text-sm text-gray-600 hover:bg-brand-50 hover:text-brand-600 rounded"
           >
             Cancel
           </button>
           <button 
             onClick={() => onApply(settings)}
             className="px-4 py-2 text-sm text-white bg-brand-600 hover:bg-brand-700 rounded shadow-sm"
           >
             Apply Frame
           </button>
        </div>
      </div>
    </div>
  );
};

export default BorderModal;
