import React from 'react';

interface LinkToolbarProps {
  url: string;
  x: number;
  y: number;
  onEdit: () => void; // Placeholder for future edit functionality
  onRemove: () => void; // Placeholder for future remove functionality
  onCreateQRCode: () => void;
  onClose: () => void;
}

const LinkToolbar: React.FC<LinkToolbarProps> = ({ url, x, y, onCreateQRCode, onClose }) => {
  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 p-2 flex items-center gap-2 transform -translate-x-1/2 -translate-y-full mt-[-8px]"
      style={{ left: x, top: y }}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline text-sm max-w-[200px] truncate mr-2"
        title={url}
      >
        {url}
      </a>
      
      <div className="h-4 w-px bg-gray-300 mx-1" />

      <button
        onClick={onCreateQRCode}
        className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded tooltip-trigger"
        title="Crea QR Code"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zm-6 0H6v4h2v-4zm10-7h2m-6 0h-2v4h2V8zm-6 0H6v4h2V8zm0-4H6v4h2V4zm10 0h-2v4h2V4zM4 20h16a2 2 0 002-2V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Close button */}
      <button
        onClick={onClose}
        className="ml-1 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export default LinkToolbar;
