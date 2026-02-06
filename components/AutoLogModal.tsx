import React, { useEffect, useMemo, useState } from 'react';
import { AutoLogEntry, getAutoLog } from '../utils/autoLog';

interface AutoLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
  onClear: () => void;
}

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
};

const AutoLogModal: React.FC<AutoLogModalProps> = ({ isOpen, onClose, onDownload, onClear }) => {
  const [logs, setLogs] = useState<AutoLogEntry[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (isOpen) setLogs(getAutoLog());
  }, [isOpen]);

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter(entry => {
      const haystack = [
        entry.message,
        entry.stack || '',
        entry.type,
        entry.level,
        entry.extra?.fileName || '',
        entry.url || ''
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [logs, filter]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[860px] max-w-[95vw] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-lg text-gray-800">Auto Log</h3>
            <div className="text-[11px] text-gray-500">Saved locally on this device</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </div>

        <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-3">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            spellCheck={false}
          />
          <button
            onClick={() => setLogs(getAutoLog())}
            className="px-3 py-2 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
          <button
            onClick={onDownload}
            className="px-3 py-2 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Download JSON
          </button>
          <button
            onClick={() => {
              onClear();
              setLogs([]);
            }}
            className="px-3 py-2 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
          >
            Clear
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-sm text-gray-500">No logs yet.</div>
          ) : (
            filtered
              .slice()
              .reverse()
              .map(entry => (
                <div key={entry.id} className="border border-gray-200 rounded-md p-3">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <div className="font-semibold text-gray-700">{entry.level.toUpperCase()} · {entry.type}</div>
                    <div>{formatTime(entry.ts)}</div>
                  </div>
                  <div className="text-sm text-gray-800 mt-2 whitespace-pre-wrap">{entry.message}</div>
                  {(entry.extra?.fileName || entry.url) && (
                    <div className="text-[11px] text-gray-500 mt-2">
                      {entry.extra?.fileName ? `file: ${entry.extra.fileName}` : ''}{entry.extra?.fileName && entry.url ? ' · ' : ''}{entry.url ? `url: ${entry.url}` : ''}
                    </div>
                  )}
                  {entry.stack && (
                    <pre className="text-[11px] text-gray-600 mt-2 whitespace-pre-wrap">{entry.stack}</pre>
                  )}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoLogModal;
