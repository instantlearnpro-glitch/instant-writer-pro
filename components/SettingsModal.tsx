import React, { useEffect, useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  initialApiKey: string;
  onClose: () => void;
  onSave: (apiKey: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, initialApiKey, onClose, onSave }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    setApiKey(initialApiKey || '');
  }, [initialApiKey, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-[90vw]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-bold text-lg text-gray-800">Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">OpenAI API Key</label>
            <div className="flex items-center gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey(prev => !prev)}
                className="px-3 py-2 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-2">
              Saved locally in your browser. We never transmit it anywhere except to OpenAI when you use AI actions.
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-brand-50 hover:text-brand-600 rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(apiKey.trim())}
            className="px-4 py-2 text-sm text-white bg-violet-600 hover:bg-violet-700 rounded shadow-md font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
