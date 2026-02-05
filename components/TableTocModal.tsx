import React, { useEffect, useState } from 'react';

interface TableTocRow {
  index: number;
  label: string;
  selectedId: string;
}

interface TableTocAnchor {
  id: string;
  label: string;
  page: number;
}

interface TableTocModalProps {
  isOpen: boolean;
  rows: TableTocRow[];
  anchors: TableTocAnchor[];
  onClose: () => void;
  onApply: (rows: TableTocRow[]) => void;
}

const TableTocModal: React.FC<TableTocModalProps> = ({ isOpen, rows, anchors, onClose, onApply }) => {
  const [localRows, setLocalRows] = useState<TableTocRow[]>(rows);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  if (!isOpen) return null;

  const sortedAnchors = [...anchors].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return a.label.localeCompare(b.label);
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[760px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-bold text-lg text-gray-800">Match Table Rows to Paragraphs</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <div className="text-xs text-gray-500 mb-3">
            Select the paragraph or heading that each row should link to. Page numbers update automatically.
          </div>

          <div className="space-y-3">
            {localRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr] gap-4 items-center">
                <div className="text-sm text-gray-800 truncate" title={row.label}>
                  {row.label || '(empty)'}
                </div>
                <select
                  value={row.selectedId}
                  onChange={(e) => {
                    const next = [...localRows];
                    next[idx] = { ...row, selectedId: e.target.value };
                    setLocalRows(next);
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Not linked</option>
                  {sortedAnchors.map(anchor => (
                    <option key={anchor.id} value={anchor.id}>
                      {anchor.label} (p.{anchor.page})
                    </option>
                  ))}
                </select>
              </div>
            ))}
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
            onClick={() => onApply(localRows)}
            className="px-4 py-2 text-sm text-white bg-[#8d55f1] hover:bg-[#7539d3] rounded shadow-md font-semibold"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default TableTocModal;
