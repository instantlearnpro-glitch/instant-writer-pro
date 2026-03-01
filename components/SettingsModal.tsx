import React, { useEffect, useState } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-w-[90vw]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-bold text-lg text-gray-800">Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="text-sm text-gray-600">
            Settings will be coming soon.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-brand-50 hover:text-brand-600 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
