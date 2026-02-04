import React, { useState } from 'react';

interface ExportModalProps {
  isOpen: boolean;
  currentFileName: string;
  onClose: () => void;
  onExportPDF: (fileName: string) => void;
  onExportHTML: (fileName: string) => void;
  onExportDOCX: (fileName: string) => void;
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  currentFileName,
  onClose,
  onExportPDF,
  onExportHTML,
  onExportDOCX
}) => {
  const baseName = currentFileName.replace(/\.(html?|docx?)$/i, '');
  const [fileName, setFileName] = useState(baseName);
  const [format, setFormat] = useState<'pdf' | 'html' | 'docx'>('pdf');
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    const finalName = fileName || 'documento';
    
    try {
      switch (format) {
        case 'pdf':
          await onExportPDF(finalName);
          break;
        case 'html':
          onExportHTML(finalName);
          break;
        case 'docx':
          await onExportDOCX(finalName);
          break;
      }
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Export document</h2>
          <p className="text-sm text-gray-500 mt-1">Choose format and file name</p>
        </div>

        <div className="p-6 space-y-4">
          {/* File name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Document name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setFormat('pdf')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  format === 'pdf'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">📄</div>
                <div className="text-sm font-medium">PDF</div>
                <div className="text-xs text-gray-500">Print</div>
              </button>
              
              <button
                onClick={() => setFormat('html')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  format === 'html'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">🌐</div>
                <div className="text-sm font-medium">HTML</div>
                <div className="text-xs text-gray-500">Web</div>
              </button>
              
              <button
                onClick={() => setFormat('docx')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  format === 'docx'
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">📝</div>
                <div className="text-sm font-medium">DOCX</div>
                <div className="text-xs text-gray-500">Word</div>
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            {format === 'pdf' && (
              <>📄 The PDF keeps layout, images, and formatting exactly as shown.</>
            )}
            {format === 'html' && (
              <>🌐 HTML preserves all content and can be reopened in SpyWriter Pro.</>
            )}
            {format === 'docx' && (
              <>📝 DOCX can be opened in Microsoft Word, Google Docs, and other editors.</>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-gray-700 hover:bg-brand-50 hover:text-brand-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || !fileName.trim()}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Esportazione...
              </>
            ) : (
              <>Export {format.toUpperCase()}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
