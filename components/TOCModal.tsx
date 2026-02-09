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
    fontSize: 11,
    fontFamily: 'inherit',
    h2Indent: 20,
    h3Indent: 40,
    showLeader: true,
    lineHeight: 1.6,
  });

  if (!isOpen) return null;

  const previewStyle = (level: number): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'baseline',
    width: '100%',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    margin: 0,
    padding: '1px 0',
    lineHeight: settings.lineHeight,
    fontSize: `${settings.fontSize}px`,
    fontFamily: settings.fontFamily === 'inherit' ? 'inherit' : settings.fontFamily,
    fontWeight: level === 1 ? 700 : 400,
    fontStyle: level === 3 ? 'italic' : 'normal',
  });

  const titleStyle = (level: number): React.CSSProperties => ({
    flexShrink: 0,
    paddingLeft: level === 2 ? `${settings.h2Indent}px` : level === 3 ? `${settings.h3Indent}px` : 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  const leaderStyle: React.CSSProperties = {
    flex: '1 1 auto',
    minWidth: '20px',
    height: 0,
    margin: '0 4px',
    borderBottom: settings.showLeader ? '1px dotted #aaa' : 'none',
  };

  const pageStyle: React.CSSProperties = {
    flexShrink: 0,
    minWidth: '2ch',
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums',
  };

  const previewEntries = [
    { level: 1, text: 'Chapter 1: Introduction', page: 1 },
    { level: 2, text: 'The Beginning', page: 3 },
    { level: 3, text: 'Background', page: 5 },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl w-[520px] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold text-base text-gray-800">Table of Contents</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-5">

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Include</label>
            <div className="flex gap-4">
              {(['H1', 'H2', 'H3'] as const).map((h) => {
                const key = `include${h}` as keyof TOCSettings;
                return (
                  <label key={h} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={settings[key] as boolean} onChange={(e) => setSettings({...settings, [key]: e.target.checked})} className="rounded text-violet-600" />
                    {h}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Font Size ({settings.fontSize}px)</label>
              <input type="range" min={8} max={16} value={settings.fontSize} onChange={(e) => setSettings({...settings, fontSize: Number(e.target.value)})} className="w-full accent-violet-600" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Font</label>
              <select value={settings.fontFamily} onChange={(e) => setSettings({...settings, fontFamily: e.target.value})} className="w-full border border-gray-300 rounded px-2 py-1 text-sm">
                <option value="inherit">Document Font</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">H2 Indent ({settings.h2Indent}px)</label>
              <input type="range" min={0} max={60} value={settings.h2Indent} onChange={(e) => setSettings({...settings, h2Indent: Number(e.target.value)})} className="w-full accent-violet-600" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">H3 Indent ({settings.h3Indent}px)</label>
              <input type="range" min={0} max={80} value={settings.h3Indent} onChange={(e) => setSettings({...settings, h3Indent: Number(e.target.value)})} className="w-full accent-violet-600" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Line Height ({settings.lineHeight})</label>
              <input type="range" min={1.0} max={2.5} step={0.1} value={settings.lineHeight} onChange={(e) => setSettings({...settings, lineHeight: Number(e.target.value)})} className="w-full accent-violet-600" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.showLeader} onChange={(e) => setSettings({...settings, showLeader: e.target.checked})} className="rounded text-violet-600" />
                Dotted leader
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Preview</label>
            <div className="border border-gray-200 rounded p-4 bg-gray-50">
              {previewEntries.map((entry, idx) => (
                <div key={idx} style={previewStyle(entry.level)}>
                  <span style={titleStyle(entry.level)}>{entry.text}</span>
                  <span style={leaderStyle}></span>
                  <span style={pageStyle}>{entry.page}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="p-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={() => onInsert(settings)} className="px-4 py-2 text-sm text-white bg-violet-600 hover:bg-violet-700 rounded shadow-sm font-semibold">Insert</button>
        </div>
      </div>
    </div>
  );
};

export default TOCModal;
