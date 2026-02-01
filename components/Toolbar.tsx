import React, { useState } from 'react';
import { 
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, 
  Image as ImageIcon, FileUp, Download, Save, Sun, Contrast, Settings, ImagePlus,
  ArrowBigUpDash, List, PanelLeft, PanelRight, Crop, FilePlus,
  Square, Minus, PaintBucket, Minimize, MoveHorizontal, Shapes, Hash,
  RotateCcw, RotateCw, RefreshCw, LayoutTemplate
} from 'lucide-react';
import { SelectionState, ImageProperties, HRProperties } from '../types';
import { PAGE_FORMATS } from '../constants';
import { FontDefinition } from '../utils/fontUtils';

interface ToolbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onFormat: (command: string, value?: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInsertImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onPageSizeChange: (formatId: string) => void;
  pageFormatId: string;
  customPageSize: { width: string, height: string };
  onCustomPageSizeChange: (width: string, height: string) => void;
  onUpdateStyle: () => void;
  onOpenTOCModal: () => void;
  onOpenPageNumberModal: () => void;
  onInsertHorizontalRule: () => void;
  onToggleCrop: () => void;
  onPageBreak: () => void;
  onBlockStyleUpdate: (style: Record<string, string>) => void;
  showFrameTools: boolean;
  onToggleFrameTools: () => void;
  selectionState: SelectionState;
  fileName: string;
  selectedImage: HTMLImageElement | null;
  selectedHR: HTMLHRElement | null;
  selectedFooter: HTMLElement | null;
  imageProperties: ImageProperties;
  hrProperties: HRProperties;
  onImagePropertyChange: (prop: keyof ImageProperties, value: any) => void;
  onHRPropertyChange: (prop: keyof HRProperties, value: any) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  availableFonts: FontDefinition[];
  showMarginGuides: boolean;
  onToggleMarginGuides: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({
  isSidebarOpen,
  onToggleSidebar,
  onFormat,
  onFileUpload, 
  onInsertImage,
  onSave, 
  onPageSizeChange,
  pageFormatId,
  customPageSize,
  onCustomPageSizeChange,
  onUpdateStyle,
  onOpenTOCModal,
  onOpenPageNumberModal,
  onInsertHorizontalRule,
  onToggleCrop,
  onPageBreak,
  onBlockStyleUpdate,
  showFrameTools,
  onToggleFrameTools,
  selectionState,
  fileName,
  selectedImage,
  selectedHR,
  selectedFooter,
  imageProperties,
  hrProperties,
  onImagePropertyChange,
  onHRPropertyChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  availableFonts,
  showMarginGuides,
  onToggleMarginGuides
}) => {
  const ButtonClass = (isActive: boolean, disabled?: boolean) => 
    `p-2 rounded transition-colors ${disabled ? 'text-gray-300 cursor-not-allowed' : 'hover:bg-gray-100 text-gray-700 ' + (isActive ? 'bg-blue-100 text-blue-600' : '')}`;

  // Helper to handle real-time border updates
  const handleBorderUpdate = (prop: string, value: string) => {
      // If we are setting width > 0 and style is none/empty, force solid
      let extraStyles: Record<string, string> = {};
      if (prop === 'borderWidth' && parseInt(value) > 0 && (!selectionState.borderStyle || selectionState.borderStyle === 'none')) {
          extraStyles.borderStyle = 'solid';
      }
      onBlockStyleUpdate({ [prop]: value, ...extraStyles });
  };

  // Determine which fonts to show
  // If the current selection has a font that isn't in our list, add it temporarily to the dropdown
  // so the user can see what it is (with a warning if it's missing)
  const currentFontName = selectionState.fontName ? selectionState.fontName.replace(/['"]/g, '') : 'inherit';
  
  // Create a display list
  let displayFonts = [...availableFonts];
  
  // Check if current font is in the list (relaxed check)
  const fontExists = displayFonts.some(f => 
      f.name.toLowerCase() === currentFontName.toLowerCase() || 
      f.value.toLowerCase().includes(currentFontName.toLowerCase())
  );

  if (!fontExists && currentFontName !== 'inherit') {
      displayFonts.unshift({
          name: currentFontName,
          value: currentFontName,
          available: false // Assume unavailable if not found in our rigorous list
      });
  }

  return (
    <div className="flex flex-col border-b border-gray-200 shadow-sm z-10 sticky top-0 bg-white">
        {/* === MAIN TOOLBAR (Always Visible) === */}
        <div className="h-16 flex items-center px-4 justify-between bg-white z-20 relative">
            <div className="flex items-center space-x-2">
                <div className="mr-4 flex items-center space-x-2 border-r border-gray-200 pr-4">
                <h1 className="font-bold text-lg text-gray-800 tracking-tight flex items-center gap-2">
                    <span className="bg-blue-600 text-white p-1 rounded">SW</span>
                </h1>
                <button onClick={onToggleSidebar} className={ButtonClass(false)} title="Toggle Sidebar">
                    {isSidebarOpen ? <PanelLeft size={18} /> : <PanelRight size={18} />}
                </button>
                </div>

                {/* Undo / Redo */}
                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2">
                    <button onClick={onUndo} disabled={!canUndo} className={ButtonClass(false, !canUndo)} title="Undo (Ctrl+Z)">
                        <RotateCcw size={18} />
                    </button>
                    <button onClick={onRedo} disabled={!canRedo} className={ButtonClass(false, !canRedo)} title="Redo (Ctrl+Y)">
                        <RotateCw size={18} />
                    </button>
                </div>

                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2">
                    <label className={`${ButtonClass(false)} cursor-pointer`} title="Open File (Select HTML + Images to link)">
                        <input type="file" multiple accept=".html,.htm,.docx,image/*" onChange={onFileUpload} className="hidden" />
                        <FileUp size={18} />
                    </label>
                    <button onClick={onSave} className={ButtonClass(false)} title="Save HTML">
                        <Save size={18} />
                    </button>
                    <label className={`${ButtonClass(false)} cursor-pointer`} title="Insert Image">
                        <input type="file" accept="image/*" onChange={onInsertImage} className="hidden" />
                        <ImagePlus size={18} />
                    </label>
                </div>
                
                {/* Insertions */}
                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2 pl-2">
                    <button onClick={onPageBreak} className={ButtonClass(false)} title="Insert Page Break (Cmd+Enter)">
                        <FilePlus size={18} />
                    </button>
                    <button onClick={onOpenTOCModal} className={ButtonClass(false)} title="Insert Table of Contents">
                        <List size={18} />
                    </button>
                    <button onClick={onOpenPageNumberModal} className={ButtonClass(false)} title="Insert Page Numbers">
                        <Hash size={18} />
                    </button>
                    <button onClick={onInsertHorizontalRule} className={ButtonClass(false)} title="Insert Horizontal Line">
                        <Minus size={18} />
                    </button>
                    <button 
                        onClick={onToggleFrameTools} 
                        className={ButtonClass(showFrameTools)} 
                        title="Frame / Borders (Toggle Controls)"
                    >
                        <Square size={18} />
                    </button>
                </div>

                {/* Page Size Selector */}
                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2 pl-2">
                    <Settings size={16} className="text-gray-400 mr-1" />
                    <select 
                        className="h-9 border border-gray-300 rounded px-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 bg-white"
                        onChange={(e) => onPageSizeChange(e.target.value)}
                        value={pageFormatId}
                    >
                        <option value={PAGE_FORMATS.LETTER.id}>{PAGE_FORMATS.LETTER.name}</option>
                        <option value={PAGE_FORMATS.TRADE.id}>{PAGE_FORMATS.TRADE.name}</option>
                        <option value={PAGE_FORMATS.CUSTOM.id}>{PAGE_FORMATS.CUSTOM.name}</option>
                    </select>
                    
                    {pageFormatId === 'custom' && (
                        <div className="flex items-center gap-1 ml-1">
                            <input 
                                type="text" 
                                value={customPageSize.width} 
                                onChange={(e) => onCustomPageSizeChange(e.target.value, customPageSize.height)}
                                className="w-12 h-7 border border-gray-300 rounded px-1 text-xs text-center"
                                placeholder="W"
                                title="Width (e.g. 8.5in, 800px)"
                            />
                            <span className="text-gray-400 text-xs">x</span>
                            <input 
                                type="text" 
                                value={customPageSize.height} 
                                onChange={(e) => onCustomPageSizeChange(customPageSize.width, e.target.value)}
                                className="w-12 h-7 border border-gray-300 rounded px-1 text-xs text-center"
                                placeholder="H"
                                title="Height (e.g. 11in, 1200px)"
                            />
                        </div>
                    )}

                    <div className="w-px h-6 bg-gray-300 mx-1"></div>
                    
                    {/* Toggle Margins */}
                    <button 
                        onClick={onToggleMarginGuides} 
                        className={ButtonClass(showMarginGuides)}
                        title="Show/Edit Page Margins"
                    >
                        <LayoutTemplate size={18} />
                    </button>
                </div>

                {/* Text Styles */}
                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2 pl-2">
                <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                        <select 
                                className="h-6 border-none bg-transparent text-xs font-bold text-gray-800 focus:outline-none w-24"
                                value={selectionState.blockType || 'p'}
                                onChange={(e) => onFormat('formatBlock', e.target.value)}
                        >
                            <option value="p">Normal</option>
                            <option value="h1">Heading 1</option>
                            <option value="h2">Heading 2</option>
                            <option value="h3">Heading 3</option>
                            <option value="blockquote">Quote</option>
                            <option value="pre">Code</option>
                        </select>

                        <select 
                            className="h-6 border-none bg-transparent text-xs text-gray-800 focus:outline-none w-28"
                            onChange={(e) => onFormat('fontName', e.target.value)}
                            value={selectionState.fontName || 'inherit'}
                            title="Font Family"
                        >
                            {displayFonts.map((font, idx) => (
                                <option key={idx} value={font.value}>
                                    {font.name} {font.available === false ? '⚠️' : ''}
                                </option>
                            ))}
                        </select>

                            <select 
                                className="h-6 border-none bg-transparent text-xs text-gray-800 focus:outline-none w-16"
                                onChange={(e) => onFormat('fontSize', e.target.value)}
                                value={selectionState.fontSize || '3'}
                        >
                            <option value="1">10px</option>
                            <option value="2">13px</option>
                            <option value="3">16px</option>
                            <option value="4">18px</option>
                            <option value="5">24px</option>
                            <option value="6">32px</option>
                            <option value="7">48px</option>
                        </select>
                    </div>
                    
                    {/* Update Style Button */}
                    <button 
                        onClick={onUpdateStyle}
                        className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-1 leading-none pb-1"
                        title={`Update ${selectionState.blockType} to match current selection`}
                    >
                        <ArrowBigUpDash size={10} /> Update {selectionState.blockType}
                    </button>
                </div>
                </div>

                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2 pl-2">
                <button onClick={() => onFormat('bold')} className={ButtonClass(selectionState.bold)}>
                    <Bold size={18} />
                </button>
                <button onClick={() => onFormat('italic')} className={ButtonClass(selectionState.italic)}>
                    <Italic size={18} />
                </button>
                <button onClick={() => onFormat('underline')} className={ButtonClass(selectionState.underline)}>
                    <Underline size={18} />
                </button>
                </div>

                <div className="flex items-center space-x-1 border-r border-gray-200 pr-2 pl-2">
                <button onClick={() => onFormat('justifyLeft')} className={ButtonClass(selectionState.alignLeft)}>
                    <AlignLeft size={18} />
                </button>
                <button onClick={() => onFormat('justifyCenter')} className={ButtonClass(selectionState.alignCenter)}>
                    <AlignCenter size={18} />
                </button>
                <button onClick={() => onFormat('justifyRight')} className={ButtonClass(selectionState.alignRight)}>
                    <AlignRight size={18} />
                </button>
                </div>
            </div>

            <div className="flex items-center space-x-3">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2">
                <Download size={16} /> PDF
                </button>
            </div>
        </div>

        {/* === CONTEXTUAL TOOLBARS (Below Main) === */}
        
        {/* 1. Image Tools */}
        {selectedImage && (
            imageProperties.isCropping ? (
                <div className="h-14 border-b border-gray-200 bg-gray-800 text-white flex items-center px-4 justify-between shadow-inner">
                    <div className="flex items-center gap-2 font-semibold">
                        <Crop size={18} />
                        <span>Crop Mode</span>
                    </div>
                    <div className="text-xs text-gray-300">Drag corners to crop.</div>
                    <div>{/* Controls are in overlay */}</div>
                </div>
            ) : (
                <div className="h-16 border-b border-gray-200 bg-blue-50 flex items-center px-4 justify-between shadow-inner overflow-x-auto">
                    <div className="flex items-center space-x-6">
                        <div className="flex items-center gap-2 text-blue-800 font-semibold border-r border-blue-200 pr-4">
                            <ImageIcon size={18} />
                            <span className="hidden sm:inline text-sm">Image</span>
                        </div>
                        
                        {/* Image Actions */}
                        <div className="flex flex-col gap-0.5 border-r border-blue-200 pr-4">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Actions</label>
                        <div className="flex items-center gap-2">
                            <label className={`${ButtonClass(false)} cursor-pointer`} title="Replace Image">
                                <input type="file" accept="image/*" onChange={onInsertImage} className="hidden" />
                                <RefreshCw size={16} />
                                <span className="text-xs ml-1 hidden lg:inline">Replace</span>
                            </label>
                            <button onClick={onToggleCrop} className={ButtonClass(false)} title="Crop Image">
                                <Crop size={16} />
                                <span className="text-xs ml-1 hidden lg:inline">Crop</span>
                            </button>
                        </div>
                        </div>

                        {/* Adjustments */}
                        <div className="flex items-center gap-4 border-r border-blue-200 pr-4">
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1">
                                    <Sun size={9} /> Brightness
                                </label>
                                <input 
                                    type="range" min="0" max="200" 
                                    value={imageProperties.brightness} 
                                    onChange={(e) => onImagePropertyChange('brightness', parseInt(e.target.value))}
                                    className="w-20 accent-blue-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1">
                                    <Contrast size={9} /> Contrast
                                </label>
                                <input 
                                    type="range" min="0" max="200" 
                                    value={imageProperties.contrast} 
                                    onChange={(e) => onImagePropertyChange('contrast', parseInt(e.target.value))}
                                    className="w-20 accent-blue-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Layout */}
                        <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Layout</label>
                        <div className="flex items-center space-x-1">
                            <button onClick={() => onImagePropertyChange('alignment', 'left')} className={ButtonClass(imageProperties.alignment === 'left')}><AlignLeft size={14} /></button>
                            <button onClick={() => onImagePropertyChange('alignment', 'center')} className={ButtonClass(imageProperties.alignment === 'center')}><AlignCenter size={14} /></button>
                            <button onClick={() => onImagePropertyChange('alignment', 'right')} className={ButtonClass(imageProperties.alignment === 'right')}><AlignRight size={14} /></button>
                            <button onClick={() => onImagePropertyChange('alignment', 'float-left')} className={ButtonClass(imageProperties.alignment === 'float-left')}><PanelLeft size={14} /></button>
                            <button onClick={() => onImagePropertyChange('alignment', 'float-right')} className={ButtonClass(imageProperties.alignment === 'float-right')}><PanelRight size={14} /></button>
                        </div>
                        </div>

                        {/* Size */}
                        <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Size: {imageProperties.width}%</label>
                        <input 
                                type="range" min="10" max="100" 
                                value={imageProperties.width} 
                                onChange={(e) => onImagePropertyChange('width', parseInt(e.target.value))}
                                className="w-16 accent-blue-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>
                    <div>
                        <button onClick={() => onFormat('removeSelection')} className="text-xs text-blue-600 underline font-medium ml-4">Close Tools</button>
                    </div>
                </div>
            )
        )}

        {/* 2. HR Tools */}
        {selectedHR && (
             <div className="h-16 border-b border-gray-200 bg-orange-50 flex items-center px-4 justify-between shadow-inner overflow-x-auto">
                <div className="flex items-center space-x-6">
                   <div className="flex items-center gap-2 text-orange-800 font-semibold border-r border-orange-200 pr-4">
                       <Minus size={18} />
                       <span className="hidden sm:inline text-sm">Line</span>
                   </div>
   
                   {/* Color */}
                   <div className="flex flex-col gap-0.5">
                       <label className="text-[9px] font-bold text-gray-500 uppercase">Color</label>
                       <input 
                           type="color" 
                           value={hrProperties.color} 
                           onChange={(e) => onHRPropertyChange('color', e.target.value)}
                           className="w-8 h-6 p-0 border-none cursor-pointer bg-transparent"
                       />
                   </div>
   
                   {/* Height / Thickness */}
                   <div className="flex flex-col gap-0.5">
                       <label className="text-[9px] font-bold text-gray-500 uppercase">Thickness: {hrProperties.height}px</label>
                       <input 
                           type="range" min="1" max="50" 
                           value={hrProperties.height} 
                           onChange={(e) => onHRPropertyChange('height', parseInt(e.target.value))}
                           className="w-20 accent-orange-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                       />
                   </div>
   
                   {/* Width */}
                   <div className="flex flex-col gap-0.5">
                       <label className="text-[9px] font-bold text-gray-500 uppercase">Width: {hrProperties.width}%</label>
                       <input 
                           type="range" min="10" max="100" 
                           value={hrProperties.width} 
                           onChange={(e) => onHRPropertyChange('width', parseInt(e.target.value))}
                           className="w-20 accent-orange-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                       />
                   </div>
   
                   {/* Alignment */}
                   <div className="flex flex-col gap-0.5">
                      <label className="text-[9px] font-bold text-gray-500 uppercase">Align</label>
                      <div className="flex items-center space-x-1">
                         <button onClick={() => onHRPropertyChange('alignment', 'left')} className={ButtonClass(hrProperties.alignment === 'left')}><AlignLeft size={14} /></button>
                         <button onClick={() => onHRPropertyChange('alignment', 'center')} className={ButtonClass(hrProperties.alignment === 'center')}><AlignCenter size={14} /></button>
                         <button onClick={() => onHRPropertyChange('alignment', 'right')} className={ButtonClass(hrProperties.alignment === 'right')}><AlignRight size={14} /></button>
                      </div>
                   </div>
   
                   <div className="w-px h-8 bg-orange-200"></div>
   
                   {/* Style */}
                   <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Style</label>
                        <select 
                           className="text-xs border border-gray-300 rounded p-1"
                           value={hrProperties.style}
                           onChange={(e) => onHRPropertyChange('style', e.target.value)}
                        >
                            <option value="solid">Solid</option>
                            <option value="dashed">Dashed</option>
                            <option value="dotted">Dotted</option>
                            <option value="tapered">Tapered (Fade)</option>
                        </select>
                   </div>
   
                </div>
                <div>
                    <button onClick={() => onFormat('removeSelection')} className="text-xs text-orange-600 underline font-medium ml-4">Close Tools</button>
                </div>
           </div>
        )}
        
        {/* 3. Footer Tools */}
        {selectedFooter && (
            <div className="h-16 border-b border-gray-200 bg-orange-50 flex items-center px-4 justify-between shadow-inner overflow-x-auto">
                <div className="flex items-center space-x-6">
                    <div className="flex items-center gap-2 text-orange-800 font-semibold border-r border-orange-200 pr-4">
                        <Hash size={18} />
                        <span className="hidden sm:inline text-sm">Footer</span>
                    </div>

                    {/* Font & Size */}
                    <div className="flex flex-col gap-0.5 border-r border-orange-200 pr-4">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Text</label>
                        <div className="flex items-center gap-1">
                            <select 
                                className="text-xs border border-gray-300 rounded p-1 w-24"
                                value={selectionState.fontName || 'inherit'}
                                onChange={(e) => onFormat('fontName', e.target.value)}
                            >
                                {displayFonts.map((font, idx) => (
                                    <option key={idx} value={font.value}>{font.name}</option>
                                ))}
                            </select>
                            <select 
                                className="text-xs border border-gray-300 rounded p-1 w-12"
                                value={selectionState.fontSize || '3'}
                                onChange={(e) => onFormat('fontSize', e.target.value)}
                            >
                                <option value="1">8</option>
                                <option value="2">10</option>
                                <option value="3">12</option>
                                <option value="4">14</option>
                                <option value="5">18</option>
                                <option value="6">24</option>
                                <option value="7">36</option>
                            </select>
                        </div>
                    </div>

                    {/* Style */}
                    <div className="flex flex-col gap-0.5 border-r border-orange-200 pr-4">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Style</label>
                        <div className="flex items-center gap-1">
                            <button onClick={() => onFormat('bold')} className={ButtonClass(selectionState.bold)}><Bold size={14} /></button>
                            <button onClick={() => onFormat('italic')} className={ButtonClass(selectionState.italic)}><Italic size={14} /></button>
                            <button onClick={() => onFormat('underline')} className={ButtonClass(selectionState.underline)}><Underline size={14} /></button>
                        </div>
                    </div>

                    {/* Alignment */}
                    <div className="flex flex-col gap-0.5 border-r border-orange-200 pr-4">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Align</label>
                        <div className="flex items-center gap-1">
                            <button onClick={() => onFormat('justifyLeft')} className={ButtonClass(selectionState.alignLeft)}><AlignLeft size={14} /></button>
                            <button onClick={() => onFormat('justifyCenter')} className={ButtonClass(selectionState.alignCenter)}><AlignCenter size={14} /></button>
                            <button onClick={() => onFormat('justifyRight')} className={ButtonClass(selectionState.alignRight)}><AlignRight size={14} /></button>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-0.5">
                        <label className="text-[9px] font-bold text-gray-500 uppercase">Actions</label>
                        <button 
                            onClick={() => onFormat('deleteFooter')} 
                            className="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded text-xs flex items-center gap-1"
                        >
                            Delete All
                        </button>
                    </div>
                </div>
                <div>
                    <button onClick={() => onFormat('removeSelection')} className="text-xs text-orange-600 underline font-medium ml-4">Close</button>
                </div>
            </div>
        )}

        {/* 4. Frame / Border Tools (Contextual or toggled) */}
        {showFrameTools && !selectedImage && !selectedHR && !selectedFooter && (
            <div className="h-12 bg-gray-50 border-b border-gray-200 flex items-center px-4 space-x-6 overflow-x-auto shadow-inner">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase">
                    <Square size={14} />
                    <span>Frame Tools</span>
                </div>

                {/* Shape Selection */}
                <div className="flex items-center gap-2 border-r border-gray-200 pr-4">
                     <label className="text-xs text-gray-600 flex items-center gap-1"><Shapes size={12} /> Shape:</label>
                     <select 
                        className="text-xs border border-gray-300 rounded p-1"
                        value={selectionState.shape || 'none'}
                        onChange={(e) => handleBorderUpdate('shape', e.target.value)}
                     >
                         <option value="none">No Shape</option>
                         <option value="rectangle">Rectangle</option>
                         <option value="circle">Circle</option>
                         <option value="pill">Pill / Oval</option>
                         <option value="speech">Speech Bubble</option>
                         <option value="cloud">Cloud</option>
                     </select>
                </div>

                {/* Border Width */}
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Thickness:</label>
                    <input 
                        type="range" min="0" max="20" step="1"
                        value={parseInt(selectionState.borderWidth || '0') || 0}
                        onChange={(e) => handleBorderUpdate('borderWidth', e.target.value + 'px')}
                        className="w-20 accent-blue-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-600 w-4">{parseInt(selectionState.borderWidth || '0') || 0}</span>
                </div>

                {/* Border Color */}
                <div className="flex items-center gap-2">
                     <label className="text-xs text-gray-600">Color:</label>
                     <input 
                        type="color" 
                        value={selectionState.borderColor || '#000000'} 
                        onChange={(e) => handleBorderUpdate('borderColor', e.target.value)}
                        className="w-6 h-6 border-none p-0 cursor-pointer bg-transparent"
                     />
                </div>

                {/* Border Style */}
                <div className="flex items-center gap-2">
                     <label className="text-xs text-gray-600">Style:</label>
                     <select 
                        className="text-xs border border-gray-300 rounded p-1"
                        value={selectionState.borderStyle || 'solid'}
                        onChange={(e) => handleBorderUpdate('borderStyle', e.target.value)}
                     >
                         <option value="solid">Solid</option>
                         <option value="dashed">Dashed</option>
                         <option value="dotted">Dotted</option>
                         <option value="double">Double</option>
                         <option value="none">None</option>
                     </select>
                </div>
                
                <div className="w-px h-4 bg-gray-300"></div>

                 {/* Radius (Conditional on shape?) No, let user override if they want */}
                 <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Radius:</label>
                    <input 
                        type="number" min="0" max="50"
                        value={parseInt(selectionState.borderRadius || '0')}
                        onChange={(e) => handleBorderUpdate('borderRadius', e.target.value + 'px')}
                        className="w-10 text-xs border border-gray-300 rounded px-1"
                    />
                </div>

                {/* Padding */}
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 flex items-center gap-1"><Minimize size={10} /> Pad:</label>
                    <input 
                        type="number" min="0" max="100"
                        value={parseInt(selectionState.padding || '0')}
                        onChange={(e) => handleBorderUpdate('padding', e.target.value + 'px')}
                        className="w-10 text-xs border border-gray-300 rounded px-1"
                    />
                </div>
                
                <div className="w-px h-4 bg-gray-300"></div>

                {/* Width */}
                <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 flex items-center gap-1"><MoveHorizontal size={10} /> Width:</label>
                    <input 
                        type="range" min="10" max="100" step="5"
                        value={parseInt(selectionState.width || '0') || 100}
                        onChange={(e) => handleBorderUpdate('width', e.target.value + '%')}
                        className="w-20 accent-blue-600 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-600 w-6 text-right">{parseInt(selectionState.width || '0') || 'Auto'}%</span>
                </div>

                <div className="w-px h-4 bg-gray-300"></div>

                {/* Text Align inside Frame */}
                <div className="flex items-center gap-1">
                    <button onClick={() => handleBorderUpdate('textAlign', 'left')} className={ButtonClass(selectionState.textAlign === 'left')}><AlignLeft size={14} /></button>
                    <button onClick={() => handleBorderUpdate('textAlign', 'center')} className={ButtonClass(selectionState.textAlign === 'center')}><AlignCenter size={14} /></button>
                    <button onClick={() => handleBorderUpdate('textAlign', 'right')} className={ButtonClass(selectionState.textAlign === 'right')}><AlignRight size={14} /></button>
                </div>

                <div className="w-px h-4 bg-gray-300"></div>

                {/* Background */}
                <div className="flex items-center gap-2">
                     <label className="text-xs text-gray-600 flex items-center gap-1"><PaintBucket size={10} /> Fill:</label>
                     <div className="flex items-center gap-1">
                        <input 
                            type="color" 
                            value={selectionState.backgroundColor === 'transparent' ? '#ffffff' : selectionState.backgroundColor} 
                            onChange={(e) => handleBorderUpdate('backgroundColor', e.target.value)}
                            className="w-6 h-6 border-none p-0 cursor-pointer bg-transparent"
                        />
                        <button 
                            onClick={() => handleBorderUpdate('backgroundColor', 'transparent')}
                            className="text-[10px] underline text-gray-500 hover:text-red-500"
                        >
                            Clear
                        </button>
                     </div>
                </div>

            </div>
        )}
    </div>
  );
};

export default Toolbar;
