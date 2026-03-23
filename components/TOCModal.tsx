import React, { useState } from 'react';
import { TOCSettings, TOCLevelStyle } from '../types';
import { X, Layout, Type, Minus } from 'lucide-react';

interface TOCModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (settings: TOCSettings) => void;
  onRemove: () => void;
}

const FONT = { fontFamily: 'system-ui, -apple-system, sans-serif' };

type TabType = 'layout' | 'typography' | 'lines';

const defaultSettings: TOCSettings = {
  includeH1: true,
  includeH2: true,
  includeH3: false,
  theme: 'classic',
  useBookInheritance: true,
  globalFontFamily: 'Playfair Display',
  textFontSize: 14,
  pageNumberFontSize: 14,
  rowGap: 8,
  leaderStyle: 'dots',
  leaderColor: '#9ca3af',
  leaderSpacing: 8,
  levelStyles: {
    h1: { enabled: false, fontWeight: '700', fontSize: 16 },
    h2: { enabled: false, fontWeight: '500', fontSize: 14 },
    h3: { enabled: false, fontWeight: '400', fontSize: 13 },
  }
};

const TOCModal: React.FC<TOCModalProps> = ({ isOpen, onClose, onInsert, onRemove }) => {
  const [settings, setSettings] = useState<TOCSettings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<TabType>('layout');
  const [activeLevelTab, setActiveLevelTab] = useState<'h1' | 'h2' | 'h3'>('h1');

  if (!isOpen) return null;

  const updateLevel = (level: 'h1' | 'h2' | 'h3', updates: Partial<TOCLevelStyle>) => {
    setSettings(prev => ({
      ...prev,
      levelStyles: {
        ...prev.levelStyles,
        [level]: { ...prev.levelStyles[level], ...updates }
      }
    }));
  };

  // --- Preview Renderer ---
  const renderPreviewRow = (level: 'h1' | 'h2' | 'h3', text: string, page: string) => {
    const indent = level === 'h2' ? 24 : level === 'h3' ? 48 : 0;
    const lStyle = settings.levelStyles[level];
    
    // Simulate book inheritance (green theme) if inheritance is ON and manual is OFF
    const isInheritedH1 = settings.useBookInheritance && level === 'h1' && !lStyle.enabled;
    const isInheritedH2 = settings.useBookInheritance && level === 'h2' && !lStyle.enabled;
    const isInheritedH3 = settings.useBookInheritance && level === 'h3' && !lStyle.enabled;

    const color = lStyle.enabled && lStyle.color ? lStyle.color : 
                  isInheritedH1 ? '#2c3e3a' : 
                  isInheritedH2 || isInheritedH3 ? '#7c9a82' : '#000000';
    
    const fontFamily = lStyle.enabled && lStyle.fontFamily ? lStyle.fontFamily : 
                       (settings.useBookInheritance ? 'Playfair Display' : settings.globalFontFamily);

    const fw = lStyle.enabled && lStyle.fontWeight ? lStyle.fontWeight : 
               (level === 'h1' ? '700' : level === 'h2' ? '500' : '400');

    const fs = lStyle.enabled && lStyle.fontSize ? lStyle.fontSize :
               (level === 'h1' ? Math.max(settings.textFontSize, settings.textFontSize + 2) : 
                level === 'h3' ? Math.max(settings.textFontSize - 1, 8) : settings.textFontSize);

    const textTransform = lStyle.enabled && lStyle.textTransform ? lStyle.textTransform : 'none';

    // Borders
    const bTop = lStyle.enabled && lStyle.borderTop ? lStyle.borderTop : '';
    const bBot = lStyle.enabled && lStyle.borderBottom ? lStyle.borderBottom : 
                 (isInheritedH3 ? '1px solid #d4e5d8' : '');

    // Leader
    const rowLeaderStyle = lStyle.enabled && lStyle.leaderStyle ? lStyle.leaderStyle : settings.leaderStyle;
    const rowLeaderColor = lStyle.enabled && lStyle.leaderColor ? lStyle.leaderColor : settings.leaderColor;
    const hasLineLeader = bBot ? true : false;
    const showLeader = rowLeaderStyle !== 'none' || hasLineLeader;

    let leaderNode = null;
    if (showLeader) {
      if (hasLineLeader) {
        leaderNode = <div style={{ flex: '1 1 auto', alignSelf: 'center', height: 0, borderBottom: bBot, minWidth: 20 }} />;
      } else {
        const bg = rowLeaderStyle === 'dots' 
          ? `radial-gradient(circle at 1px 1px, ${rowLeaderColor} 1px, transparent 1.5px)`
          : rowLeaderStyle === 'dashes'
          ? `repeating-linear-gradient(90deg, ${rowLeaderColor} 0, ${rowLeaderColor} 6px, transparent 6px, transparent ${settings.leaderSpacing + 6}px)`
          : rowLeaderStyle === 'line' ? 'none' : 'none';
          
        const lH = rowLeaderStyle === 'dots' ? 2 : rowLeaderStyle === 'dashes' ? 1 : 0;
        const lB = rowLeaderStyle === 'line' ? `1px solid ${rowLeaderColor}` : 'none';

        leaderNode = <div style={{ 
          flex: '1 1 auto', display: 'block', alignSelf: 'center', minWidth: 20,
          height: lH, borderBottom: lB, backgroundImage: bg,
          backgroundSize: rowLeaderStyle === 'dots' ? `${settings.leaderSpacing}px 2px` : 'auto',
          backgroundRepeat: 'repeat-x', backgroundPosition: 'left center'
        }} />;
      }
    }

    if (settings.theme === 'classic') {
       return (
         <div style={{ display: 'table-row', color, fontFamily }}>
           <div style={{ display: 'table-cell', paddingLeft: indent, paddingRight: 12, paddingBottom: settings.rowGap, fontSize: fs, fontWeight: fw, textTransform: textTransform as any, verticalAlign: 'bottom', borderTop: bTop, lineHeight: 1.5 }}>
              {text}
           </div>
           {showLeader ? (
             <div style={{ display: 'table-cell', width: '100%', verticalAlign: 'bottom', paddingBottom: settings.rowGap + 6 }}>{leaderNode}</div>
           ) : null}
           <div style={{ display: 'table-cell', paddingLeft: 12, paddingBottom: settings.rowGap, fontSize: settings.pageNumberFontSize, textAlign: 'right', verticalAlign: 'bottom', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
             {page}
           </div>
         </div>
       );
    }

    if (settings.theme === 'modern') {
      return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: settings.rowGap, paddingLeft: indent, color, fontFamily, borderTop: bTop }}>
          <div style={{ flex: '0 0 auto', width: '3ch', textAlign: 'right', fontSize: settings.pageNumberFontSize, fontWeight: 700, color: settings.leaderColor }}>{page}</div>
          <div style={{ flex: '1 1 auto', fontSize: fs, fontWeight: fw, textTransform: textTransform as any, borderBottom: bBot }}>{text}</div>
        </div>
      );
    }

    if (settings.theme === 'minimalist') {
      return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: settings.rowGap * 1.5, paddingLeft: indent, color, fontFamily, borderTop: bTop }}>
          <div style={{ fontSize: fs, fontWeight: fw, textTransform: textTransform as any, borderBottom: bBot }}>{text}</div>
          <div style={{ flex: '0 0 auto', fontSize: settings.pageNumberFontSize, color: settings.leaderColor }}>{page}</div>
        </div>
      );
    }
    
    if (settings.theme === 'centered') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: settings.rowGap * 2, color, fontFamily, borderTop: bTop }}>
          <div style={{ fontSize: fs, fontWeight: fw, textTransform: textTransform as any, borderBottom: bBot, textAlign: 'center' }}>{text}</div>
          <div style={{ fontSize: settings.pageNumberFontSize, marginTop: 4, color: settings.leaderColor }}>— {page} —</div>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={FONT}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex overflow-hidden">
        
        {/* LEFT COLUMN - CONTROLS */}
        <div className="w-[400px] bg-slate-50 border-r border-slate-200 flex flex-col h-full shrink-0">
          <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
            <h3 className="font-bold text-lg text-slate-800">TOC Designer</h3>
          </div>

          {/* Setup Toggles */}
          <div className="p-4 bg-white border-b border-slate-100 flex flex-col gap-3">
             <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 uppercase">Include Headings</span>
                <div className="flex gap-3">
                  {(['h1', 'h2', 'h3'] as const).map(level => {
                    const key = `include${level.toUpperCase()}` as keyof Pick<TOCSettings, 'includeH1' | 'includeH2' | 'includeH3'>;
                    return (
                      <label key={level} className="flex items-center space-x-1 cursor-pointer">
                        <input type="checkbox" checked={settings[key] as boolean}
                          onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
                          className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5" />
                        <span className="text-xs font-medium text-slate-700 uppercase">{level}</span>
                      </label>
                    );
                  })}
                </div>
             </div>
             
             <label className="flex items-center justify-between cursor-pointer p-2 bg-purple-50 rounded-md border border-purple-100">
                <span className="text-xs font-medium text-purple-900">Inherit Style from Book</span>
                <input type="checkbox" checked={settings.useBookInheritance}
                    onChange={(e) => setSettings({ ...settings, useBookInheritance: e.target.checked })}
                    className="rounded text-purple-600 w-4 h-4 cursor-pointer" />
             </label>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-white">
            <button onClick={() => setActiveTab('layout')} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${activeTab === 'layout' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50' : 'text-slate-500 hover:text-slate-800'}`}><Layout size={14}/> Layout</button>
            <button onClick={() => setActiveTab('typography')} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${activeTab === 'typography' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50' : 'text-slate-500 hover:text-slate-800'}`}><Type size={14}/> Typography</button>
            <button onClick={() => setActiveTab('lines')} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${activeTab === 'lines' ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50' : 'text-slate-500 hover:text-slate-800'}`}><Minus size={14}/> Leaders</button>
          </div>

          {/* Control Panels */}
          <div className="flex-1 overflow-y-auto p-5 pb-20 space-y-6">
            
            {/* LAYOUT TAB */}
            {activeTab === 'layout' && (
               <div className="space-y-5">
                 <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Base Theme</label>
                    <div className="grid grid-cols-2 gap-2">
                       {['classic', 'modern', 'minimalist', 'centered'].map(theme => (
                          <button key={theme} onClick={() => setSettings({...settings, theme: theme as any})}
                             className={`p-2.5 text-xs rounded border text-left font-medium transition-all ${settings.theme === theme ? 'border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-500' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                             {theme.charAt(0).toUpperCase() + theme.slice(1)}
                          </button>
                       ))}
                    </div>
                 </div>
                 <div className="border-t border-slate-200 pt-5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Row Gap: {settings.rowGap}px</label>
                    <input type="range" min={2} max={32} step={1} value={settings.rowGap}
                      onChange={(e) => setSettings({ ...settings, rowGap: Number(e.target.value) })} className="w-full accent-purple-600" />
                 </div>
               </div>
            )}

            {/* TYPOGRAPHY TAB */}
            {activeTab === 'typography' && (
               <div className="space-y-6">
                  {/* Global settings */}
                  <div className="space-y-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Global Typography</h4>
                    <div className="grid grid-cols-2 gap-3">
                       <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1">Title Size: {settings.textFontSize}px</label>
                          <input type="range" min={8} max={24} value={settings.textFontSize} onChange={(e) => setSettings({...settings, textFontSize: Number(e.target.value)})} className="w-full accent-slate-500" />
                       </div>
                       <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1">Page # Size: {settings.pageNumberFontSize}px</label>
                          <input type="range" min={8} max={24} value={settings.pageNumberFontSize} onChange={(e) => setSettings({...settings, pageNumberFontSize: Number(e.target.value)})} className="w-full accent-slate-500" />
                       </div>
                    </div>
                  </div>

                  {/* Level Overrides */}
                  <div>
                     <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                        <span>Level Overrides</span>
                     </h4>
                     
                     <div className="flex bg-slate-100 rounded p-1 text-xs mb-3">
                        {(['h1', 'h2', 'h3'] as const).map(l => (
                           <button key={l} onClick={() => setActiveLevelTab(l)}
                              className={`flex-1 py-1 px-2 rounded font-medium uppercase transition-colors ${activeLevelTab === l ? 'bg-white shadow-sm text-purple-700' : 'text-slate-500'}`}>
                              {l}
                           </button>
                        ))}
                     </div>

                     <div className="bg-white border text-sm border-slate-200 rounded-lg p-3 space-y-4">
                        <label className="flex items-center justify-between pb-3 border-b border-slate-100 cursor-pointer">
                           <span className="text-xs font-semibold text-slate-700">Enable styling for {activeLevelTab.toUpperCase()}</span>
                           <input type="checkbox" checked={settings.levelStyles[activeLevelTab].enabled}
                              onChange={(e) => updateLevel(activeLevelTab, { enabled: e.target.checked })}
                              className="w-4 h-4 rounded text-purple-600 accent-purple-600" />
                        </label>

                        {settings.levelStyles[activeLevelTab].enabled ? (
                           <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                              <div>
                                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Color</label>
                                 <div className="flex items-center gap-2">
                                    <input type="color" value={settings.levelStyles[activeLevelTab].color || '#000000'}
                                       onChange={(e) => updateLevel(activeLevelTab, { color: e.target.value })}
                                       className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
                                    <span className="text-xs font-mono text-slate-500 uppercase">{settings.levelStyles[activeLevelTab].color || '#000000'}</span>
                                 </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                 <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Font Size (px)</label>
                                    <input type="number" value={settings.levelStyles[activeLevelTab].fontSize || 14} 
                                       onChange={(e) => updateLevel(activeLevelTab, { fontSize: Number(e.target.value) })}
                                       className="w-full border border-slate-200 rounded px-2 py-1 text-xs" />
                                 </div>
                                 <div>
                                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Weight</label>
                                    <select value={settings.levelStyles[activeLevelTab].fontWeight || 'normal'}
                                       onChange={(e) => updateLevel(activeLevelTab, { fontWeight: e.target.value })}
                                       className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white">
                                       <option value="400">Normal (400)</option>
                                       <option value="500">Medium (500)</option>
                                       <option value="600">Semibold (600)</option>
                                       <option value="700">Bold (700)</option>
                                    </select>
                                 </div>
                              </div>

                              <div>
                                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Transform</label>
                                 <select value={settings.levelStyles[activeLevelTab].textTransform || 'none'}
                                    onChange={(e) => updateLevel(activeLevelTab, { textTransform: e.target.value as any })}
                                    className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white">
                                    <option value="none">None</option>
                                    <option value="uppercase">UPPERCASE</option>
                                    <option value="lowercase">lowercase</option>
                                 </select>
                              </div>
                           </div>
                        ) : (
                           <p className="text-xs text-slate-400 italic text-center py-2">
                              {settings.useBookInheritance ? 'Inheriting appearance from book.' : 'Using default global typography.'} Enable to set custom colors and sizes.
                           </p>
                        )}
                     </div>
                  </div>
               </div>
            )}

            {/* LINES & LEADERS TAB */}
            {activeTab === 'lines' && (
               <div className="space-y-6">
                  {/* Global Leaders */}
                  <div className="space-y-4 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                     <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Global Leader Style</h4>
                     <div className="grid grid-cols-2 gap-3">
                        <div>
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Style</label>
                           <select value={settings.leaderStyle} onChange={(e) => setSettings({...settings, leaderStyle: e.target.value as any})} className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs bg-white">
                              <option value="dots">●● Dots</option>
                              <option value="dashes">-- Dashes</option>
                              <option value="line">―― Line</option>
                              <option value="none">None</option>
                           </select>
                        </div>
                        <div>
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Color</label>
                           <input type="color" value={settings.leaderColor} onChange={(e) => setSettings({...settings, leaderColor: e.target.value})} className="w-full h-[30px] p-0 border border-slate-200 rounded cursor-pointer" />
                        </div>
                     </div>
                     {settings.leaderStyle !== 'none' && settings.leaderStyle !== 'line' && (
                        <div>
                           <label className="block text-[10px] font-medium text-slate-500 mb-1">Spacing: {settings.leaderSpacing}px</label>
                           <input type="range" min={4} max={20} value={settings.leaderSpacing} onChange={(e) => setSettings({...settings, leaderSpacing: Number(e.target.value)})} className="w-full accent-slate-500" />
                        </div>
                     )}
                  </div>

                  {/* Per Level Decorations */}
                  <div>
                     <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Decorative Lines (Per Level)</h4>
                     <p className="text-[10px] text-slate-500 mb-3">Add solid borders under specific headings. Turn ON the override toggle in Typography tab first to unlock this.</p>
                     
                     <div className="flex bg-slate-100 rounded p-1 text-xs mb-3">
                        {(['h1', 'h2', 'h3'] as const).map(l => (
                           <button key={l} onClick={() => setActiveLevelTab(l)}
                              className={`flex-1 py-1 px-2 rounded font-medium uppercase transition-colors ${activeLevelTab === l ? 'bg-white shadow-sm text-purple-700' : 'text-slate-500'}`}>
                              {l}
                           </button>
                        ))}
                     </div>

                     <div className="bg-white border text-sm border-slate-200 rounded-lg p-3">
                        {settings.levelStyles[activeLevelTab].enabled ? (
                           <div className="space-y-4">
                              <div>
                                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Bottom Border (e.g. "1px solid #000")</label>
                                 <input type="text" placeholder="none" value={settings.levelStyles[activeLevelTab].borderBottom || ''} 
                                    onChange={(e) => updateLevel(activeLevelTab, { borderBottom: e.target.value })}
                                    className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs font-mono" />
                                 <p className="text-[9px] text-slate-400 mt-1">If set, this will replace the row leader.</p>
                              </div>
                              <div>
                                 <label className="block text-[10px] font-medium text-slate-500 mb-1">Top Border</label>
                                 <input type="text" placeholder="none" value={settings.levelStyles[activeLevelTab].borderTop || ''} 
                                    onChange={(e) => updateLevel(activeLevelTab, { borderTop: e.target.value })}
                                    className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs font-mono" />
                              </div>
                           </div>
                        ) : (
                           <p className="text-xs text-slate-400 italic text-center py-2">
                              Enable "{activeLevelTab.toUpperCase()} Level Styling" in the Typography tab first.
                           </p>
                        )}
                     </div>
                  </div>
               </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN - LIVE PREVIEW */}
        <div className="flex-1 bg-white relative flex flex-col min-w-0 border-l border-slate-200">
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
          
          <div className="flex-1 overflow-y-auto p-12 bg-[#ececf1] flex justify-center">
             {/* Virtual Page */}
             <div className="bg-white shadow-lg w-full max-w-2xl min-h-[500px] p-12 relative print:shadow-none" style={{ boxSizing: 'border-box' }}>
                <h2 className="text-center font-bold text-2xl mb-12 tracking-wide text-slate-800" style={{ fontFamily: settings.useBookInheritance ? 'Playfair Display' : settings.globalFontFamily }}>Table of Contents</h2>
                
                {/* Simulated TOC Container */}
                <div style={{ padding: '0px', boxSizing: 'border-box' }}>
                   {settings.theme === 'classic' ? (
                      <div style={{ display: 'table', width: '100%', borderCollapse: 'collapse' }}>
                         {renderPreviewRow('h1', 'Introduction: The Journey Begins', '1')}
                         {renderPreviewRow('h2', 'Why Low Fodmap?', '3')}
                         {renderPreviewRow('h3', 'Understanding your gut', '4')}
                         {renderPreviewRow('h1', 'Chapter 1: Breakfasts', '12')}
                         {renderPreviewRow('h2', 'Pancakes and Waffles', '14')}
                         {renderPreviewRow('h3', 'Gluten-Free Berry Pancakes', '15')}
                         {renderPreviewRow('h3', 'Oatmeal Banana Waffles', '18')}
                         {renderPreviewRow('h1', 'Chapter 2: Main Dishes', '24')}
                         {renderPreviewRow('h2', 'Poultry & Meat', '26')}
                         {renderPreviewRow('h3', 'Lemon Herb Chicken', '28')}
                      </div>
                   ) : (
                      <div style={{ width: '100%' }}>
                         {renderPreviewRow('h1', 'Introduction: The Journey Begins', '1')}
                         {renderPreviewRow('h2', 'Why Low Fodmap?', '3')}
                         {renderPreviewRow('h3', 'Understanding your gut', '4')}
                         {renderPreviewRow('h1', 'Chapter 1: Breakfasts', '12')}
                         {renderPreviewRow('h2', 'Pancakes and Waffles', '14')}
                         {renderPreviewRow('h3', 'Gluten-Free Berry Pancakes', '15')}
                         {renderPreviewRow('h3', 'Oatmeal Banana Waffles', '18')}
                         {renderPreviewRow('h1', 'Chapter 2: Main Dishes', '24')}
                         {renderPreviewRow('h2', 'Poultry & Meat', '26')}
                         {renderPreviewRow('h3', 'Lemon Herb Chicken', '28')}
                      </div>
                   )}
                </div>

                {/* Decorative overlay to simulate page boundary */}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
             </div>
          </div>

          <div className="absolute bottom-0 inset-x-0 p-4 bg-white border-t border-slate-200 flex items-center justify-between shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
            <button onClick={onRemove} className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors">
              Remove Existing TOC
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors">
                Cancel
              </button>
              <button onClick={() => onInsert(settings)} className="px-6 py-2 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-md shadow-md hover:shadow-lg transition-all active:scale-95">
                Apply Design & Insert
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TOCModal;

