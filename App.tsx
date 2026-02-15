import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import TOCModal from './components/TOCModal';
import PageNumberModal from './components/PageNumberModal';
import ZoomControls from './components/ZoomControls';
import { DocumentState, SelectionState, ImageProperties, TOCEntry, TOCSettings, HRProperties, PageAnchor, StructureEntry } from './types';
import { DEFAULT_CSS, DEFAULT_HTML, PAGE_FORMATS, FONTS } from './constants';
import { getSystemFonts, FontDefinition } from './utils/fontUtils';
import { scanStructure } from './utils/structureScanner';
import { PatternTracker, findSimilarElements, getElementSignature, PatternMatch, ActionType } from './utils/patternDetector';
import PatternModal from './components/PatternModal';
import ExportModal from './components/ExportModal';
import SettingsModal from './components/SettingsModal';
import AutoLogModal from './components/AutoLogModal';
import { reflowPages, autoMergeAll } from './utils/pagination';
import { initAutoLog, downloadAutoLog, clearAutoLog } from './utils/autoLog';

declare global {
  interface Window {
    html2pdf: any;
    html2canvas: (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;
    htmlDocx: {
      asBlob: (html: string, options?: Record<string, unknown>) => Blob;
    };
  }
}

const rgbToHex = (rgb: string) => {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return '#000000';
  const r = parseInt(result[0], 10).toString(16).padStart(2, '0');
  const g = parseInt(result[1], 10).toString(16).padStart(2, '0');
  const b = parseInt(result[2], 10).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

const mapFontSizeToCommandValue = (fontSizePx: number) => {
  return String(Math.max(1, Math.round(fontSizePx)));
};

type StyleClipboard =
  | {
      type: 'text';
      inline: Record<string, string>;
      block: Record<string, string>;
    }
  | {
      type: 'image';
      image: Record<string, string>;
    };

const buildSelectionStateFromElement = (element: HTMLElement): SelectionState => {
  const selection = window.getSelection();
  const selectionNode = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
  const selectionElement = selectionNode
    ? (selectionNode.nodeType === Node.TEXT_NODE ? selectionNode.parentElement : selectionNode as HTMLElement)
    : null;
  const textElement = selectionElement && element.contains(selectionElement) ? selectionElement : element;

  const computedBlock = window.getComputedStyle(element);
  const computedText = window.getComputedStyle(textElement);
  const fontSizePx = parseFloat(computedText.fontSize || '16');
  const fontWeight = computedText.fontWeight;
  const isBold = fontWeight === 'bold' || parseInt(fontWeight, 10) >= 600;
  const textDecoration = computedText.textDecorationLine || computedText.textDecoration;
  const isUnderline = textDecoration.includes('underline');
  const fontStyle = computedText.fontStyle || 'normal';
  const textAlign = computedBlock.textAlign || 'left';
  const ulTag = element.tagName === 'LI' && element.parentElement?.tagName === 'UL';
  const olTag = element.tagName === 'LI' && element.parentElement?.tagName === 'OL';

  const shapeClass = element.classList.contains('shape-circle')
    ? 'circle'
    : element.classList.contains('shape-pill')
    ? 'pill'
    : element.classList.contains('shape-speech')
    ? 'speech'
    : element.classList.contains('shape-cloud')
    ? 'cloud'
    : element.classList.contains('shape-rectangle')
    ? 'rectangle'
    : element.classList.contains('mission-box')
    ? 'mission-box'
    : 'none';

  const safeParseInt = (val: string) => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? '0' : parsed.toString();
  };

  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  return {
    bold: isBold,
    italic: fontStyle === 'italic' || fontStyle === 'oblique',
    underline: isUnderline,
    ul: ulTag,
    ol: olTag,
    blockType: element.tagName.toLowerCase(),
    alignLeft: textAlign === 'left' || textAlign === 'start',
    alignCenter: textAlign === 'center',
    alignRight: textAlign === 'right' || textAlign === 'end',
    alignJustify: textAlign === 'justify',
    fontName: computedText.fontFamily || 'sans-serif',
    fontSize: mapFontSizeToCommandValue(fontSizePx),
    lineHeight: computedBlock.lineHeight || 'normal',
    letterSpacing: computedText.letterSpacing || 'normal',
    foreColor: rgbToHex(computedText.color),
    borderWidth: safeParseInt(computedBlock.borderTopWidth),
    borderColor: rgbToHex(computedBlock.borderTopColor),
    borderRadius: safeParseInt(computedBlock.borderRadius),
    backgroundColor: rgbToHex(computedBlock.backgroundColor),
    padding: safeParseInt(computedBlock.paddingTop),
    borderStyle: computedBlock.borderTopStyle || 'none',
    textAlign: textAlign,
    shape: shapeClass,
    width: element.style.width || '',
    range: range
  };
};

const App: React.FC = () => {
  const [docState, setDocState] = useState<DocumentState>({
    htmlContent: DEFAULT_HTML,
    cssContent: DEFAULT_CSS,
    fileName: 'untitled_mission.html'
  });

  const [availableFonts, setAvailableFonts] = useState<FontDefinition[]>(FONTS.map(f => ({ ...f, available: true })));
  const [structureEntries, setStructureEntries] = useState<StructureEntry[]>([]);
  const [structureManualMode, setStructureManualMode] = useState(true);
  const structureManualModeRef = useRef(true);
  const structureClearCounterRef = useRef(0);
  
  // Manual Structure Selection State
  const [selectionMode, setSelectionMode] = useState<{ active: boolean; level: string | null; selectedIds: string[] }>({
      active: false,
      level: null,
      selectedIds: []
  });

  // Load available system fonts on mount and when web fonts are ready
  useEffect(() => {
      const openFontDb = () => new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('spywriter-fonts', 1);
          request.onupgradeneeded = () => {
              const db = request.result;
              if (!db.objectStoreNames.contains('fonts')) {
                  db.createObjectStore('fonts', { keyPath: 'name' });
              }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });

      const loadFontsFromDb = async () => {
          try {
              const db = await openFontDb();
              const tx = db.transaction('fonts', 'readonly');
              const store = tx.objectStore('fonts');
              const getAll = store.getAll();
              return await new Promise<Array<{ name: string; dataUrl: string }>>((resolve) => {
                  getAll.onsuccess = () => resolve(getAll.result || []);
                  getAll.onerror = () => resolve([]);
              });
          } catch {
              return [];
          }
      };

      const loadFonts = async () => {
          const fonts = await getSystemFonts();
          setAvailableFonts(fonts);
      };
      
      loadFonts();

      // Re-check when document fonts are fully loaded (handles web font latency)
      document.fonts.ready.then(() => {
          loadFonts();
      });

      const storedKey = localStorage.getItem('openai_api_key') || '';
      if (storedKey) setOpenAiApiKey(storedKey);

      // Restore custom fonts (localStorage + IndexedDB)
      const storedFonts = localStorage.getItem('custom_fonts');
      if (storedFonts) {
          try {
              const fonts = JSON.parse(storedFonts) as Array<{ name: string; dataUrl: string; }>
              fonts.forEach(font => {
                  const fontFace = new FontFace(font.name, `url(${font.dataUrl})`);
                  fontFace.load().then(() => {
                      document.fonts.add(fontFace);
                      setAvailableFonts(prev => {
                          const exists = prev.some(f => f.name.toLowerCase() === font.name.toLowerCase());
                          if (exists) return prev;
                          return [{ name: font.name, value: `'${font.name}', sans-serif`, available: true }, ...prev];
                      });
                  });
              });
          } catch (e) {
              // ignore invalid storage
          }
      }

      loadFontsFromDb().then(fonts => {
          fonts.forEach(font => {
              const fontFace = new FontFace(font.name, `url(${font.dataUrl})`);
              fontFace.load().then(() => {
                  document.fonts.add(fontFace);
                  setAvailableFonts(prev => {
                      const exists = prev.some(f => f.name.toLowerCase() === font.name.toLowerCase());
                      if (exists) return prev;
                      return [{ name: font.name, value: `'${font.name}', sans-serif`, available: true }, ...prev];
                  });
              });
          });
      });
  }, []);


  const handleReloadFonts = async () => {
      const fonts = await getSystemFonts();
      setAvailableFonts(fonts);
  };

  const handleAddFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const fontName = file.name.replace(/\.(ttf|otf|woff2?|)$/i, '').trim() || 'Custom Font';
      try {
          const buffer = await file.arrayBuffer();
          const fontFace = new FontFace(fontName, buffer);
          await fontFace.load();
          document.fonts.add(fontFace);
          setAvailableFonts(prev => {
              const exists = prev.some(font => font.name.toLowerCase() === fontName.toLowerCase());
              if (exists) return prev;
              return [{ name: fontName, value: `'${fontName}', sans-serif`, available: true }, ...prev];
          });

          const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('Failed to read font file'));
              reader.readAsDataURL(file);
          });

          let savedToStorage = false;
          try {
              const storedFonts = localStorage.getItem('custom_fonts');
              const list = storedFonts ? (JSON.parse(storedFonts) as Array<{ name: string; dataUrl: string }>) : [];
              const filtered = list.filter(font => font.name.toLowerCase() !== fontName.toLowerCase());
              filtered.unshift({ name: fontName, dataUrl });
              localStorage.setItem('custom_fonts', JSON.stringify(filtered.slice(0, 20)));
              savedToStorage = true;
          } catch {
              savedToStorage = false;
          }

          try {
              const dbRequest = indexedDB.open('spywriter-fonts', 1);
              dbRequest.onupgradeneeded = () => {
                  const db = dbRequest.result;
                  if (!db.objectStoreNames.contains('fonts')) {
                      db.createObjectStore('fonts', { keyPath: 'name' });
                  }
              };
              dbRequest.onsuccess = () => {
                  const db = dbRequest.result;
                  const tx = db.transaction('fonts', 'readwrite');
                  tx.objectStore('fonts').put({ name: fontName, dataUrl });
              };
          } catch {
              // ignore db errors
          }

          setFontUploadMessage(savedToStorage ? `Font loaded: ${fontName}` : `Font loaded (stored in DB): ${fontName}`);
          window.setTimeout(() => setFontUploadMessage(''), 2500);
      } catch (err) {
          alert('Failed to load font file. Please try a .ttf, .otf, .woff, or .woff2 file.');
      } finally {
          e.target.value = '';
      }
  };

  // History State
  const [history, setHistory] = useState<DocumentState[]>([{ 
    htmlContent: DEFAULT_HTML,
    cssContent: DEFAULT_CSS,
    fileName: 'untitled_mission.html'
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const structureScanTimeoutRef = useRef<number | null>(null);

  const [selectionState, setSelectionState] = useState<SelectionState>({
    bold: false,
    italic: false,
    underline: false,
    ul: false,
    ol: false,
    blockType: 'p',
    alignLeft: false,
    alignCenter: false,
    alignRight: false,
    alignJustify: false,
    fontName: 'sans-serif',
    fontSize: '16',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    foreColor: '#000000',
    // Defaults
    borderWidth: '0',
    borderColor: '#000000',
    borderRadius: '0',
    backgroundColor: '#ffffff',
    padding: '0',
    borderStyle: 'none',
    textAlign: 'left',
    shape: 'none'
  });

  const [activeBlock, setActiveBlock] = useState<HTMLElement | null>(null);

  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [selectedTextLayer, setSelectedTextLayer] = useState<HTMLElement | null>(null);
  const [isTextLayerMode, setIsTextLayerMode] = useState(false);
  const [multiSelectedElements, setMultiSelectedElements] = useState<string[]>([]);
  const [distributeAdjustAxis, setDistributeAdjustAxis] = useState<'x' | 'y' | null>(null);
  const [styleClipboard, setStyleClipboard] = useState<StyleClipboard | null>(null);

  useEffect(() => {
      document.body.classList.remove('text-layer-mode');
  }, []);

  const [imageProperties, setImageProperties] = useState<ImageProperties>({
    brightness: 100,
    contrast: 100,
    width: 100,
    alignment: 'center',
    isCropping: false
  });

  const [selectedHR, setSelectedHR] = useState<HTMLHRElement | null>(null);
  const [hrProperties, setHrProperties] = useState<HRProperties>({
      color: '#000000',
      height: 2,
      width: 100,
      alignment: 'center',
      style: 'solid'
  });

  const [selectedFooter, setSelectedFooter] = useState<HTMLElement | null>(null);

  const [pageFormatId, setPageFormatId] = useState<string>('letter');
  const [customPageSize, setCustomPageSize] = useState<{ width: string, height: string }>({ width: '8.5in', height: '11in' });
  const [pageMargins, setPageMargins] = useState<{ top: number, bottom: number, left: number, right: number }>({ top: 0.5, bottom: 0.5, left: 0.375, right: 0.5 });
  const [showMarginGuides, setShowMarginGuides] = useState(false);
  const [showSmartGuides, setShowSmartGuides] = useState(false);

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isTOCModalOpen, setIsTOCModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isAutoLogModalOpen, setIsAutoLogModalOpen] = useState(false);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [fontUploadMessage, setFontUploadMessage] = useState('');
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'assistant' | 'system'; content: string }[]>([
    {
      role: 'system',
      content: 'You are a document automation assistant. Respond with JSON only.'
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [isPageNumberModalOpen, setIsPageNumberModalOpen] = useState(false);
  const [pageAnchors, setPageAnchors] = useState<PageAnchor[]>([]);
  
  const [showFrameTools, setShowFrameTools] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  // Zoom and View Mode
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');

  const [tocEditorOpen, setTocEditorOpen] = useState(false);
  const [tocSettings, setTocSettings] = useState<{fontSize: number; fontFamily: string; h2Indent: number; h3Indent: number; showLeader: boolean; lineHeight: number}>({
    fontSize: 11, fontFamily: 'inherit', h2Indent: 20, h3Indent: 40, showLeader: true, lineHeight: 1.6
  });

  const handleTocSelect = () => {
    const workspace = document.querySelector('.editor-workspace');
    if (!workspace) return;
    const firstEntry = workspace.querySelector('.toc-entry') as HTMLElement;
    if (!firstEntry) return;

    const computed = window.getComputedStyle(firstEntry);
    const fontSize = parseFloat(computed.fontSize) || 11;
    const fontFamily = firstEntry.style.fontFamily || 'inherit';
    const lineHeight = parseFloat(computed.lineHeight) / parseFloat(computed.fontSize) || 1.6;

    const h2Entry = workspace.querySelector('.toc-entry[data-level="h2"]') as HTMLElement;
    const h3Entry = workspace.querySelector('.toc-entry[data-level="h3"]') as HTMLElement;
    const h2Title = h2Entry?.querySelector('span:first-child') as HTMLElement;
    const h3Title = h3Entry?.querySelector('span:first-child') as HTMLElement;
    const h2Indent = h2Title ? parseFloat(h2Title.style.paddingLeft) || 20 : 20;
    const h3Indent = h3Title ? parseFloat(h3Title.style.paddingLeft) || 40 : 40;

    const leaderSpan = firstEntry.children[1] as HTMLElement;
    const showLeader = leaderSpan ? leaderSpan.style.borderBottom !== '' && leaderSpan.style.borderBottom !== 'none' : true;

    setTocSettings({ fontSize, fontFamily, h2Indent, h3Indent, showLeader, lineHeight: Math.round(lineHeight * 10) / 10 });
    setTocEditorOpen(true);
  };

  const applyTocSettings = (newSettings: typeof tocSettings) => {
    setTocSettings(newSettings);
    const workspace = document.querySelector('.editor-workspace');
    if (!workspace) return;

    const entries = workspace.querySelectorAll('.toc-entry') as NodeListOf<HTMLElement>;
    entries.forEach(entry => {
      const level = entry.getAttribute('data-level') || 'h1';
      const indent = level === 'h2' ? newSettings.h2Indent : level === 'h3' ? newSettings.h3Indent : 0;
      const weight = level === 'h1' ? 'bold' : 'normal';
      const fStyle = level === 'h3' ? 'italic' : 'normal';

      entry.style.fontSize = `${newSettings.fontSize}px`;
      entry.style.lineHeight = String(newSettings.lineHeight);
      entry.style.fontWeight = weight;
      entry.style.fontStyle = fStyle;
      if (newSettings.fontFamily !== 'inherit') {
        entry.style.fontFamily = newSettings.fontFamily;
      } else {
        entry.style.removeProperty('font-family');
      }

      const titleSpan = entry.children[0] as HTMLElement;
      if (titleSpan) titleSpan.style.paddingLeft = `${indent}px`;

      const leaderSpan = entry.children[1] as HTMLElement;
      if (leaderSpan) {
        leaderSpan.style.borderBottom = newSettings.showLeader ? '1px dotted #aaa' : 'none';
      }
    });
  };

  const handleTocEditorClose = () => {
    setTocEditorOpen(false);
    const workspace = document.querySelector('.editor-workspace');
    if (workspace) {
      updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
    }
  };

  const handleZoomChange = (nextZoom: number) => {
      const container = editorContainerRef.current;
      const prevZoom = zoom || 100;
      if (!container) {
          setZoom(nextZoom);
          return;
      }

      const containerRect = container.getBoundingClientRect();
      const selection = window.getSelection();
      let anchorViewportY = containerRect.height / 2;

      if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (container.contains(range.commonAncestorContainer)) {
              const rect = range.getBoundingClientRect();
              if (rect.top) {
                  anchorViewportY = rect.top - containerRect.top;
              }
          }
      }

      const anchorContentY = container.scrollTop + anchorViewportY;
      const scale = nextZoom / prevZoom;

      setZoom(nextZoom);

      requestAnimationFrame(() => {
          container.scrollTop = anchorContentY * scale - anchorViewportY;
      });
  };
  
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const suppressSelectionRef = useRef(false);

  // Pattern detection for image/style changes
  const patternTrackerRef = useRef(new PatternTracker());
  const [patternModal, setPatternModal] = useState<{
    isOpen: boolean;
    actionType: string;
    matches: PatternMatch[];
    applyStyle?: (el: HTMLElement) => void;
  }>({ isOpen: false, actionType: '', matches: [] });

  // --- HISTORY MANAGEMENT (Undo/Redo) ---

  const latestDocStateRef = useRef(docState);

  useEffect(() => {
      latestDocStateRef.current = docState;
  }, [docState]);

  useEffect(() => {
      historyRef.current = history;
  }, [history]);

  useEffect(() => {
      historyIndexRef.current = historyIndex;
  }, [historyIndex]);

  useEffect(() => {
      const cleanup = initAutoLog({
          getContext: () => ({ fileName: latestDocStateRef.current?.fileName })
      });
      return () => {
          cleanup();
      };
  }, []);

  const resetHistory = useCallback((nextState: DocumentState) => {
      if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
      }
      setHistory([nextState]);
      historyRef.current = [nextState];
      setHistoryIndex(0);
      historyIndexRef.current = 0;
  }, []);

  const pushHistoryState = useCallback((newState: DocumentState, options?: { skipIfSameHtml?: string }) => {
      setHistory(prevHistory => {
          const baseIndex = Math.min(historyIndexRef.current, prevHistory.length - 1);
          const newHistory = prevHistory.slice(0, baseIndex + 1);
          if (options?.skipIfSameHtml) {
              const last = newHistory[newHistory.length - 1];
              if (last && last.htmlContent === options.skipIfSameHtml) {
                  return prevHistory;
              }
          }
          newHistory.push(newState);
          if (newHistory.length > 50) newHistory.shift();
          const newIndex = newHistory.length - 1;
          historyIndexRef.current = newIndex;
          historyRef.current = newHistory;
          setHistoryIndex(newIndex);
          return newHistory;
      });
  }, []);

  // Unified function to update state and manage history
  const updateDocState = (newState: DocumentState, saveToHistory: boolean = false) => {
      setDocState(newState);

      if (saveToHistory) {
          // Clear any pending debounce since we are forcing a save
          if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
          }
          pushHistoryState(newState);
      }
  };


  const handleUndo = () => {
      const currentIndex = historyIndexRef.current;
      if (currentIndex > 0) {
          const newIndex = currentIndex - 1;
          historyIndexRef.current = newIndex;
          setHistoryIndex(newIndex);
          const nextState = historyRef.current[newIndex];
          if (nextState) {
              setDocState(nextState);
          }
      }
  };

  const handleRedo = () => {
      const currentIndex = historyIndexRef.current;
      const maxIndex = historyRef.current.length - 1;
      if (currentIndex < maxIndex) {
          const newIndex = currentIndex + 1;
          historyIndexRef.current = newIndex;
          setHistoryIndex(newIndex);
          const nextState = historyRef.current[newIndex];
          if (nextState) {
              setDocState(nextState);
          }
      }
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
              e.preventDefault();
              if (e.shiftKey) {
                  handleRedo();
              } else {
                  handleUndo();
              }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
              e.preventDefault();
              handleRedo();
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  // Helper for text input (debounced history)
  const handleContentChange = (html: string) => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
          const node = selection.getRangeAt(0).commonAncestorContainer;
          const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
          if (el?.closest('.floating-text')) {
              return;
          }
      }
      const newState = { ...docState, htmlContent: html };
      setDocState(newState); // Immediate update for UI

      // Debounce history save
      if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
          pushHistoryState(newState, { skipIfSameHtml: html });
      }, 1000); // Wait 1s after typing stops
  };

  const updateDocStatePreserveScroll = (html: string) => {
      const container = editorContainerRef.current;
      const prevScroll = container ? container.scrollTop : 0;
      updateDocState({ ...docState, htmlContent: html }, true);
      if (container) {
          requestAnimationFrame(() => {
              container.scrollTop = prevScroll;
          });
      }
  };


  // Parse HTML to count pages when content changes
  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(docState.htmlContent, 'text/html');
    const pages = doc.querySelectorAll('.page');
    setPageCount(pages.length || 1);
  }, [docState.htmlContent]);

  // Scan headings (H1/H2/H3) for Structure panel (debounced)
  // Only runs when NOT in manual mode (auto-scan)
  useEffect(() => {
    if (structureScanTimeoutRef.current) {
      window.clearTimeout(structureScanTimeoutRef.current);
      structureScanTimeoutRef.current = null;
    }

    if (structureManualMode) return;
    if (!isSidebarOpen) return;

    // Capture counter so stale callbacks from before Clear are discarded
    const counterAtSchedule = structureClearCounterRef.current;

    structureScanTimeoutRef.current = window.setTimeout(() => {
      if (structureManualModeRef.current) return;
      if (structureClearCounterRef.current !== counterAtSchedule) return;

      const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
      if (!workspace) return;

      const { entries, modifiedHtml } = scanStructure(workspace);

      if (modifiedHtml && modifiedHtml !== latestDocStateRef.current.htmlContent) {
        updateDocState({ ...latestDocStateRef.current, htmlContent: modifiedHtml }, false);
      }

      setStructureEntries(entries);
    }, 500);

    return () => {
      if (structureScanTimeoutRef.current) {
        window.clearTimeout(structureScanTimeoutRef.current);
        structureScanTimeoutRef.current = null;
      }
    };
  }, [docState.htmlContent, isSidebarOpen, structureManualMode]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    // 1. Find the main document file
    const docFile = files.find(f => f.name.endsWith('.html') || f.name.endsWith('.htm') || f.name.endsWith('.docx'));
    if (!docFile) {
        alert("Please select an HTML or DOCX file.");
        return;
    }

    // 2. Process based on type
    if (docFile.name.endsWith('.docx')) {
        // ... (Existing Mammoth Logic)
        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            if (arrayBuffer) {
                // @ts-ignore
                if (window.mammoth) {
                    // @ts-ignore
                    window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                        .then((result: any) => {
                            const html = result.value;
                            const bodyContent = `<div class="page">${html}</div>`;
                            const newState = {
                                htmlContent: bodyContent,
                                cssContent: DEFAULT_CSS,
                                fileName: docFile.name
                            };
                            updateDocState(newState, true);
                        })
                        .catch((err: any) => { console.error(err); alert("Error converting Word document."); });
                }
            }
        };
        reader.readAsArrayBuffer(docFile);
    } 
    else {
        // 3. HTML Handling with "Smart Image Linking"
        
        // A. Load all companion images into a map: filename -> DataURL
        const imageMap = new Map<string, string>();
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        
        await Promise.all(imageFiles.map(file => new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (evt.target?.result) {
                    imageMap.set(file.name, evt.target.result as string);
                }
                resolve();
            };
            reader.readAsDataURL(file);
        })));

        // B. Read and parse HTML
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (text) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                
                // Extract and Clean CSS
                const styleTags = doc.querySelectorAll('style');
                let extractedCss = '';
                styleTags.forEach(tag => {
                    const css = tag.innerHTML;
                    extractedCss += css + '\n';
                    tag.remove();
                });

                // C. Auto-link Images
                const images = doc.querySelectorAll('img');
                let linkedCount = 0;
                images.forEach(img => {
                    const src = img.getAttribute('src');
                    if (src) {
                        // Extract just the filename from path (e.g., /Users/me/img.png -> img.png)
                        // Handle both forward and backslashes
                        const rawFilename = src.split(/[\\/]/).pop();
                        // Also try decoding URI (e.g. Screenshot%20(7).png)
                        const decodedFilename = rawFilename ? decodeURIComponent(rawFilename) : '';

                        if (decodedFilename && imageMap.has(decodedFilename)) {
                            img.src = imageMap.get(decodedFilename)!;
                            linkedCount++;
                        }
                    }
                });

                let bodyContent = doc.body.innerHTML;
                
                // Wrap in page if needed
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = bodyContent;
                
                // Only remove contenteditable="false" attributes that block editing
                tempDiv.querySelectorAll('[contenteditable="false"]').forEach(el => {
                    el.removeAttribute('contenteditable');
                });
                
                bodyContent = tempDiv.innerHTML;
                
                if (!tempDiv.querySelector('.page')) {
                    bodyContent = `<div class="page">${bodyContent}</div>`;
                }

                const finalCss = (extractedCss.trim() ? extractedCss + '\n' : '') + DEFAULT_CSS;

                const newState = {
                    htmlContent: bodyContent,
                    cssContent: finalCss,
                    fileName: docFile.name
                };
                
                updateDocState(newState, true);
                
                if (imageFiles.length > 0) {
                    if (linkedCount > 0) {
                        console.log(`Linked ${linkedCount} images from selection.`);
                    } else {
                        // If user selected images but none matched, warn them
                        alert("Images were selected but didn't match the filenames in the HTML. Please ensure filenames (e.g., 'image.png') match exactly.");
                    }
                }
            }
        };
        reader.readAsText(docFile);
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleSaveApiKey = (apiKey: string) => {
    setOpenAiApiKey(apiKey);
    if (apiKey) {
      localStorage.setItem('openai_api_key', apiKey);
    } else {
      localStorage.removeItem('openai_api_key');
    }
    setIsSettingsModalOpen(false);
  };

  const handleCaptureSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0).cloneRange();
          setSelectionState(prev => ({ ...prev, range }));
      }
      suppressSelectionRef.current = true;
      window.setTimeout(() => {
          suppressSelectionRef.current = false;
      }, 0);
  };

  const getTextStyleSource = () => {
      const selection = window.getSelection();
      let textEl: HTMLElement | null = null;
      if (selection && selection.rangeCount > 0) {
          const node = selection.getRangeAt(0).commonAncestorContainer;
          textEl = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
      }

      const blockEl =
          textEl?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page):not(.editor-workspace), .floating-text') as HTMLElement | null
          || selectedTextLayer
          || (activeBlock && activeBlock.tagName !== 'IMG' ? activeBlock : null);

      const inlineEl = textEl || blockEl;
      return { inlineEl, blockEl };
  };

  const handleCopyStyle = () => {
      if (selectedImage) {
          const computed = window.getComputedStyle(selectedImage);
          const width = selectedImage.style.width || `${selectedImage.offsetWidth}px`;
          const height = selectedImage.style.height || `${selectedImage.offsetHeight}px`;
          const imageStyles: Record<string, string> = {
              width,
              height,
              filter: computed.filter !== 'none' ? computed.filter : selectedImage.style.filter,
              objectFit: computed.objectFit,
              borderRadius: computed.borderRadius,
              opacity: computed.opacity,
              display: computed.display,
              float: computed.float,
              margin: computed.margin
          };
          setStyleClipboard({ type: 'image', image: imageStyles });
          return;
      }

      const { inlineEl, blockEl } = getTextStyleSource();
      if (!inlineEl || !blockEl) {
          alert('Select text to copy the style.');
          return;
      }

      const inlineComputed = window.getComputedStyle(inlineEl);
      const blockComputed = window.getComputedStyle(blockEl);
      const inlineStyles: Record<string, string> = {
          'font-family': inlineComputed.fontFamily,
          'font-size': inlineComputed.fontSize,
          'font-weight': inlineComputed.fontWeight,
          'font-style': inlineComputed.fontStyle,
          'text-decoration': inlineComputed.textDecorationLine || inlineComputed.textDecoration,
          'color': inlineComputed.color,
          'letter-spacing': inlineComputed.letterSpacing,
          'text-transform': inlineComputed.textTransform
      };
      const blockStyles: Record<string, string> = {
          'line-height': blockComputed.lineHeight,
          'text-align': blockComputed.textAlign
      };
      setStyleClipboard({ type: 'text', inline: inlineStyles, block: blockStyles });
  };

  const applyTextStyles = (inlineStyles: Record<string, string>, blockStyles: Record<string, string>) => {
      if (multiSelectedElements.length > 1) {
          multiSelectedElements.forEach(id => {
              const el = document.getElementById(id) as HTMLElement | null;
              if (!el || el.tagName === 'IMG') return;
              Object.entries(blockStyles).forEach(([key, val]) => {
                  el.style.setProperty(key, val, 'important');
              });
              Object.entries(inlineStyles).forEach(([key, val]) => {
                  el.style.setProperty(key, val, 'important');
              });
          });
      } else {
          const selection = window.getSelection();
          const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
          const hasRange = range && !range.collapsed;

          const blockEl =
              (range
                  ? (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                      ? (range.commonAncestorContainer as HTMLElement)
                      : range.commonAncestorContainer.parentElement)
                  : null)?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page):not(.editor-workspace), .floating-text') as HTMLElement | null
              || selectedTextLayer
              || (activeBlock && activeBlock.tagName !== 'IMG' ? activeBlock : null);

          if (blockEl) {
              Object.entries(blockStyles).forEach(([key, val]) => {
                  blockEl.style.setProperty(key, val, 'important');
              });
          }

          if (hasRange && range) {
              const span = document.createElement('span');
              Object.entries(inlineStyles).forEach(([key, val]) => {
                  span.style.setProperty(key, val, 'important');
              });
              span.appendChild(range.extractContents());
              range.insertNode(span);
              selection?.removeAllRanges();
              const newRange = document.createRange();
              newRange.selectNodeContents(span);
              newRange.collapse(false);
              selection?.addRange(newRange);
          } else if (blockEl) {
              Object.entries(inlineStyles).forEach(([key, val]) => {
                  blockEl.style.setProperty(key, val, 'important');
              });
          }
      }

      const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
      if (workspace) {
          updateDocStatePreserveScroll(workspace.innerHTML);
      }
  };

  const applyImageStyles = (imageStyles: Record<string, string>) => {
      const targets: HTMLImageElement[] = [];
      if (multiSelectedElements.length > 1) {
          multiSelectedElements.forEach(id => {
              const el = document.getElementById(id);
              if (el && el.tagName === 'IMG') targets.push(el as HTMLImageElement);
          });
      } else if (selectedImage) {
          targets.push(selectedImage);
      } else if (activeBlock && activeBlock.tagName === 'IMG') {
          targets.push(activeBlock as HTMLImageElement);
      }

      if (targets.length === 0) return;

      targets.forEach(img => {
          Object.entries(imageStyles).forEach(([key, val]) => {
              if (!val) return;
              if (key === 'float') {
                  img.style.float = val;
                  return;
              }
              img.style.setProperty(key, val, 'important');
          });
      });

      const workspace = document.querySelector('.editor-workspace');
      if (workspace) {
          updateDocStatePreserveScroll(workspace.innerHTML);
      }

      if (selectedImage) {
          handleImageSelect(selectedImage);
      }
  };

  const handlePasteStyle = () => {
      if (!styleClipboard) {
          alert('Copy a style first.');
          return;
      }

      if (styleClipboard.type === 'text') {
          applyTextStyles(styleClipboard.inline, styleClipboard.block);
      } else if (styleClipboard.type === 'image') {
          applyImageStyles(styleClipboard.image);
      }
  };

  const applyAiActions = (actions: Array<{ type: string; selector?: string; fontFamily?: string; style?: Record<string, string> }>) => {
    const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
    if (!workspace || actions.length === 0) return;

    actions.forEach(action => {
      if (action.type === 'apply_font' && action.selector && action.fontFamily) {
        const elements = workspace.querySelectorAll(action.selector);
        elements.forEach(el => {
          (el as HTMLElement).style.setProperty('font-family', action.fontFamily, 'important');
        });
      }

      if (action.type === 'set_style' && action.selector && action.style) {
        const elements = workspace.querySelectorAll(action.selector);
        elements.forEach(el => {
          Object.entries(action.style || {}).forEach(([key, value]) => {
            (el as HTMLElement).style.setProperty(key, value, 'important');
          });
        });
      }
    });

    reflowPages(workspace);
    updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
  };

  const handleAiSend = async () => {
    const prompt = aiInput.trim();
    if (!prompt || aiLoading) return;
    if (!openAiApiKey) {
      setIsSettingsModalOpen(true);
      return;
    }

    const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
    const plainText = workspace ? workspace.innerText.replace(/\s+/g, ' ').trim() : '';
    const textSnippet = plainText.length > 2000 ? `${plainText.slice(0, 2000)}…` : plainText;
    const fontNames = availableFonts.map(f => f.name).join(', ');

    const systemPrompt = `You are a document automation assistant for a rich text editor. Return JSON only with keys: assistant_message (string) and actions (array).\nActions supported:\n- {"type":"apply_font","selector":"CSS_SELECTOR","fontFamily":"Font Name"}\n- {"type":"set_style","selector":"CSS_SELECTOR","style":{"css-property":"value"}}\n\nAvailable selectors you can use include: .writing-lines, .tracing-line, .mission-box, .shape-rectangle, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, p, h1, h2, h3, li, blockquote, table, td, th.\nIf the user asks for a handwriting-like font, choose the closest from the available fonts list. If unsure, respond with an assistant_message and no actions.`;

    const userPrompt = `User request: ${prompt}\n\nAvailable fonts: ${fontNames}\n\nDocument snippet:\n${textSnippet}`;

    setAiLoading(true);
    setAiMessages(prev => [...prev, { role: 'user', content: prompt }]);

    const parseAiJson = (text: string) => {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (e) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const slice = text.slice(start, end + 1);
          try {
            return JSON.parse(slice);
          } catch (err) {
            return null;
          }
        }
        return null;
      }
    };

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data?.error?.message || 'AI request failed.';
        setAiMessages(prev => [...prev, { role: 'assistant', content: `AI error: ${message}` }]);
        return;
      }

      const content = data?.choices?.[0]?.message?.content || '';
      const parsed = parseAiJson(content);

      if (parsed && (parsed.assistant_message || parsed.actions)) {
        if (parsed.actions && Array.isArray(parsed.actions)) {
          applyAiActions(parsed.actions);
        }
        setAiMessages(prev => [...prev, { role: 'assistant', content: parsed.assistant_message || 'Done.' }]);
      } else {
        setAiMessages(prev => [...prev, { role: 'assistant', content: content || 'No response.' }]);
      }
    } catch (err: any) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: 'AI request failed. Check API key and network.' }]);
    } finally {
      setAiLoading(false);
      setAiInput('');
    }
  };

  const handleInsertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const imgUrl = event.target?.result as string;
        if (imgUrl) {
            if (selectedImage) {
                selectedImage.src = imgUrl;
                selectedImage.classList.remove('broken-image');
                handleImageSelect(selectedImage);
                // Image attribute change doesn't automatically trigger react state update via Editor unless observed
                // Editor observers mutation, so onContentChange will fire eventually. 
                // But replacing src is immediate. 
            } else {
                const editor = document.querySelector('.editor-workspace') as HTMLElement;
                editor?.focus();
                document.execCommand('insertImage', false, imgUrl);
                // execCommand triggers input event -> handleContentChange
            }
        }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  const handleInsertTextLayerMode = () => {
      setIsTextLayerMode(prev => !prev);
  };

  const handleInsertTextLayerAt = (page: HTMLElement, x: number, y: number) => {
      const workspace = document.querySelector('.editor-workspace');
      if (!workspace) return;

      const textLayer = document.createElement('div');
      textLayer.className = 'floating-text';
      textLayer.contentEditable = 'true';
      textLayer.style.position = 'absolute';
      textLayer.style.left = `${Math.max(0, x)}px`;
      textLayer.style.top = `${Math.max(0, y)}px`;
      textLayer.style.fontSize = '16px';
      textLayer.style.fontFamily = 'inherit';
      textLayer.style.zIndex = '5';
      textLayer.style.minWidth = '120px';
      textLayer.style.minHeight = '24px';
      textLayer.style.color = '#111';
      textLayer.style.cursor = 'text';
      textLayer.innerHTML = '<br>';

      page.appendChild(textLayer);

      textLayer.focus();

      const range = document.createRange();
      range.selectNodeContents(textLayer);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      reflowPages(workspace as HTMLElement);
      updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
      handleTextLayerSelect(textLayer);
  };

  const handleImageSelect = (img: HTMLImageElement | null) => {
      if (selectedImage && selectedImage !== img) {
          selectedImage.removeAttribute('data-selected');
      }

      if (img) {
          img.setAttribute('data-selected', 'true');
          
          const filter = img.style.filter || '';
          const styleWidth = img.style.width || '100%';
          const styleFloat = img.style.float;
          const styleDisplay = img.style.display;
          const styleMargin = img.style.margin;

          let brightness = 100;
          let contrast = 100;
          
          // Robust regex to handle spaces, % or decimals
          const bMatch = filter.match(/brightness\s*\(\s*([\d\.]+)(%?)\s*\)/);
          if (bMatch) {
              let val = parseFloat(bMatch[1]);
              if (!bMatch[2] && val <= 2) val *= 100; // Handle decimal 1.0 = 100%
              brightness = Math.round(val);
          }
          
          const cMatch = filter.match(/contrast\s*\(\s*([\d\.]+)(%?)\s*\)/);
          if (cMatch) {
              let val = parseFloat(cMatch[1]);
              if (!cMatch[2] && val <= 2) val *= 100; 
              contrast = Math.round(val);
          }

          let width = 100;
          if (styleWidth.includes('%')) {
              width = parseInt(styleWidth);
          } else if (styleWidth.includes('px')) {
              width = 100; 
          }

          let alignment: 'left' | 'center' | 'right' | 'float-left' | 'float-right' = 'center';
          if (styleFloat === 'left') alignment = 'float-left';
          else if (styleFloat === 'right') alignment = 'float-right';
          else if (styleDisplay === 'block' && styleMargin === '0px auto') alignment = 'center';
          else alignment = 'left';

          setImageProperties({
              brightness,
              contrast,
              width,
              alignment,
              isCropping: false
          });
      } else {
          setImageProperties(prev => ({ ...prev, isCropping: false }));
      }

      setSelectedImage(img);
      if (img) {
          setSelectedHR(null);
          setSelectedFooter(null);
          setSelectedTextLayer(null);
      }
  };

  const handleTextLayerSelect = (el: HTMLElement | null) => {
      if (selectedTextLayer && selectedTextLayer !== el) {
          selectedTextLayer.removeAttribute('data-selected');
      }

      setSelectedTextLayer(el);
      if (el) {
          setSelectedImage(null);
          setSelectedHR(null);
          setSelectedFooter(null);
      }
  };

  const handleToggleMultiSelect = (el: HTMLElement | null) => {
      if (!el) return;
      setMultiSelectedElements(prev => {
          if (!el.id) {
              el.id = `multi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          }
          const id = el.id;
          const exists = prev.includes(id);
          const next = exists ? prev.filter(item => item !== id) : [...prev, id];
          if (exists) {
              el.removeAttribute('data-multi-selected');
          } else {
              el.setAttribute('data-multi-selected', 'true');
          }
          return next;
      });
  };

  const handleClearMultiSelect = () => {
      setMultiSelectedElements(prev => {
          prev.forEach(id => {
              const el = document.getElementById(id);
              el?.removeAttribute('data-multi-selected');
          });
          return [];
      });
  };

  const distributeMultiSelection = (axis: 'x' | 'y', delta: number = 0) => {
      const fallbackSelected = Array.from(document.querySelectorAll('.editor-workspace [data-multi-selected="true"]')) as HTMLElement[];
      const selectedIds = multiSelectedElements.length > 0
          ? multiSelectedElements
          : fallbackSelected.map(el => el.id).filter(Boolean);
      if ((selectedIds.length || fallbackSelected.length) < 2) return;

      const getRelativeToPage = (el: HTMLElement, page: HTMLElement) => {
          const pageRect = page.getBoundingClientRect();
          const scaleX = pageRect.width / page.offsetWidth || 1;
          const scaleY = pageRect.height / page.offsetHeight || 1;
          const rect = el.getBoundingClientRect();
          return {
              x: (rect.left - pageRect.left) / scaleX,
              y: (rect.top - pageRect.top) / scaleY,
              w: rect.width / scaleX,
              h: rect.height / scaleY
          };
      };

      const grouped = new Map<HTMLElement, HTMLElement[]>();
      let elements = selectedIds.length > 0
          ? selectedIds.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
          : fallbackSelected;
      if (elements.length === 0) {
          elements = fallbackSelected;
      }

      elements.forEach(el => {
          if (!el) return;
          const page = el.closest('.page') as HTMLElement | null;
          if (!page) return;
          const list = grouped.get(page) || [];
          list.push(el);
          grouped.set(page, list);
      });

      grouped.forEach((elements, page) => {
          if (elements.length < 2) return;

          const allFloating = elements.every(el => el.classList.contains('floating-text'));
          if (allFloating) {
              const items = elements.map(el => {
                  const left = parseFloat(el.style.left) || el.offsetLeft;
                  const top = parseFloat(el.style.top) || el.offsetTop;
                  const width = el.offsetWidth;
                  const height = el.offsetHeight;
                  return {
                      el,
                      left,
                      top,
                      width,
                      height,
                      centerX: left + width / 2,
                      centerY: top + height / 2
                  };
              });

              const sorted = items.sort((a, b) => axis === 'x' ? a.centerX - b.centerX : a.centerY - b.centerY);
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              const span = axis === 'x'
                  ? (last.centerX - first.centerX)
                  : (last.centerY - first.centerY);
              const gap = span / (sorted.length - 1) + delta;

              let cursorCenter = axis === 'x' ? first.centerX : first.centerY;
              sorted.forEach((item, index) => {
                  if (index === 0) {
                      cursorCenter = axis === 'x' ? item.centerX : item.centerY;
                  }
                  if (axis === 'x') {
                      item.el.style.left = `${cursorCenter - item.width / 2}px`;
                      item.el.style.top = `${item.top}px`;
                      cursorCenter += gap;
                  } else {
                      item.el.style.top = `${cursorCenter - item.height / 2}px`;
                      item.el.style.left = `${item.left}px`;
                      cursorCenter += gap;
                  }
              });

              return;
          }
          const items = elements.map(el => {
              const pos = getRelativeToPage(el, page);
              return {
                  el,
                  left: pos.x,
                  top: pos.y,
                  width: pos.w,
                  height: pos.h,
                  centerX: pos.x + pos.w / 2,
                  centerY: pos.y + pos.h / 2
              };
          });

          const sorted = items.sort((a, b) => axis === 'x' ? a.centerX - b.centerX : a.centerY - b.centerY);
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          const span = axis === 'x'
              ? (last.centerX - first.centerX)
              : (last.centerY - first.centerY);
          const gap = span / (sorted.length - 1) + delta;

          let cursorCenter = axis === 'x' ? first.centerX : first.centerY;
          sorted.forEach((item, index) => {
              if (index === 0) {
                  cursorCenter = axis === 'x' ? item.centerX : item.centerY;
              }

              if (item.el.parentElement !== page) {
                  page.appendChild(item.el);
              }

              item.el.style.position = 'absolute';
              item.el.style.margin = '0';
              item.el.style.float = 'none';
              item.el.style.display = 'inline-block';
              if (axis === 'x') {
                  item.el.style.left = `${cursorCenter - item.width / 2}px`;
                  item.el.style.top = `${item.top}px`;
                  cursorCenter += gap;
              } else {
                  item.el.style.top = `${cursorCenter - item.height / 2}px`;
                  item.el.style.left = `${item.left}px`;
                  cursorCenter += gap;
              }
          });
      });

      const workspace = document.querySelector('.editor-workspace');
      if (workspace) {
          updateDocStatePreserveScroll(workspace.innerHTML);
      }
  };

  const startDistributeAdjust = (axis: 'x' | 'y') => {
      distributeMultiSelection(axis, 0);
      setDistributeAdjustAxis(axis);
  };

  const endDistributeAdjust = () => {
      setDistributeAdjustAxis(null);
  };

  const alignMultiSelection = (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      const fallbackSelected = Array.from(document.querySelectorAll('.editor-workspace [data-multi-selected="true"]')) as HTMLElement[];
      const selectedIds = multiSelectedElements.length > 0
          ? multiSelectedElements
          : fallbackSelected.map(el => el.id).filter(Boolean);
      if ((selectedIds.length || fallbackSelected.length) < 2) return;

      const elements = selectedIds.length > 0
          ? selectedIds.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]
          : fallbackSelected;

      const grouped = new Map<HTMLElement, HTMLElement[]>();
      elements.forEach(el => {
          const page = el.closest('.page') as HTMLElement | null;
          if (!page) return;
          const list = grouped.get(page) || [];
          list.push(el);
          grouped.set(page, list);
      });

      grouped.forEach((elements, page) => {
          if (elements.length < 2) return;
          const pageRect = page.getBoundingClientRect();
          const scaleX = pageRect.width / page.offsetWidth || 1;
          const scaleY = pageRect.height / page.offsetHeight || 1;

          const items = elements.map(el => {
              const rect = el.getBoundingClientRect();
              const x = (rect.left - pageRect.left) / scaleX;
              const y = (rect.top - pageRect.top) / scaleY;
              const w = rect.width / scaleX;
              const h = rect.height / scaleY;
              return {
                  el,
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  centerX: x + w / 2,
                  centerY: y + h / 2,
                  right: x + w,
                  bottom: y + h
              };
          });

          const minLeft = Math.min(...items.map(i => i.left));
          const maxRight = Math.max(...items.map(i => i.right));
          const minTop = Math.min(...items.map(i => i.top));
          const maxBottom = Math.max(...items.map(i => i.bottom));
          const ref = items[0];

          items.forEach(item => {
              item.el.style.position = 'absolute';
              item.el.style.margin = '0';
              item.el.style.float = 'none';
              item.el.style.display = 'inline-block';

              if (mode === 'left') {
                  item.el.style.left = `${minLeft}px`;
                  item.el.style.top = `${item.top}px`;
              } else if (mode === 'center') {
                  item.el.style.left = `${ref.centerX - item.width / 2}px`;
                  item.el.style.top = `${item.top}px`;
              } else if (mode === 'right') {
                  item.el.style.left = `${maxRight - item.width}px`;
                  item.el.style.top = `${item.top}px`;
              } else if (mode === 'top') {
                  item.el.style.top = `${minTop}px`;
                  item.el.style.left = `${item.left}px`;
              } else if (mode === 'middle') {
                  item.el.style.top = `${ref.centerY - item.height / 2}px`;
                  item.el.style.left = `${item.left}px`;
              } else if (mode === 'bottom') {
                  item.el.style.top = `${maxBottom - item.height}px`;
                  item.el.style.left = `${item.left}px`;
              }
          });
      });

      const workspace = document.querySelector('.editor-workspace');
      if (workspace) {
          updateDocStatePreserveScroll(workspace.innerHTML);
      }
  };

  const handleFooterSelect = (footer: HTMLElement | null) => {
      const workspace = document.querySelector('.editor-workspace');
      if (!workspace) return;
      const allFooters = workspace.querySelectorAll('.page-footer');

      // Clear previous outlines
      allFooters.forEach(f => (f as HTMLElement).style.outline = '');
      
      if (footer) {
          // Visual feedback: Highlight ALL footers to show global selection
          allFooters.forEach(f => (f as HTMLElement).style.outline = '2px dashed #f97316');
          
          // Parse current styles from the CLICKED footer (as representative)
          const computed = window.getComputedStyle(footer);
          const footerFontSize = parseFloat(computed.fontSize || '12');
          setSelectionState(prev => ({
              ...prev,
              fontSize: String(Math.round(footerFontSize)),
              fontName: computed.fontFamily.replace(/['"]/g, ''),
              bold: computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 700,
              italic: computed.fontStyle === 'italic',
              underline: computed.textDecoration.includes('underline'),
              alignLeft: computed.textAlign === 'left',
              alignCenter: computed.textAlign === 'center',
              alignRight: computed.textAlign === 'right',
              alignJustify: computed.textAlign === 'justify'
          }));
      }

      setSelectedFooter(footer);
      if (footer) {
          setSelectedImage(null);
          setSelectedHR(null);
      }
  };

  const handleRemoveFooter = () => {
      const workspace = document.querySelector('.editor-workspace');
      if (workspace) {
          const footers = workspace.querySelectorAll('.page-footer');
          footers.forEach(f => f.remove());
          setSelectedFooter(null);
          updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
      }
  };

  const restoreSelection = () => {
      const range = selectionState.range;
      const workspace = document.querySelector('.editor-workspace');
      if (!range || !workspace) return false;
      const selection = window.getSelection();
      if (!selection) return false;
      if (!workspace.contains(range.commonAncestorContainer)) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
  };

  const applyStyleToMultiSelection = (styles: Record<string, string>) => {
      if (multiSelectedElements.length === 0) return false;
      multiSelectedElements.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          Object.entries(styles).forEach(([key, val]) => {
              el.style.setProperty(key, val, 'important');
          });
      });
      const workspace = document.querySelector('.editor-workspace');
      if (workspace) {
          updateDocStatePreserveScroll(workspace.innerHTML);
      }
      return true;
  };

  const handleFormat = (command: string, value?: string) => {
    if (command === 'removeSelection') {
        setSelectedImage(null);
        setSelectedHR(null);
        if (selectedFooter) {
            const workspace = document.querySelector('.editor-workspace');
            workspace?.querySelectorAll('.page-footer').forEach(f => (f as HTMLElement).style.outline = '');
            setSelectedFooter(null);
        }
        return;
    }

    if (command === 'deleteFooter') {
        handleRemoveFooter();
        return;
    }

    if (multiSelectedElements.length > 0) {
        if (command === 'fontName' && value) {
            if (applyStyleToMultiSelection({ 'font-family': value })) return;
        }
        if (command === 'fontSize') {
            const sizeValue = value || '16';
            const sizePx = sizeValue.includes('px') ? sizeValue : `${sizeValue}px`;
            const textTargets = multiSelectedElements
                .map(id => document.getElementById(id))
                .filter(Boolean)
                .map(el => (el as HTMLElement).closest('.floating-text, .writing-lines, textarea.writing-lines, p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page):not(.editor-workspace)') as HTMLElement | null)
                .filter(Boolean) as HTMLElement[];
            if (textTargets.length > 0) {
                textTargets.forEach(el => el.style.setProperty('font-size', sizePx, 'important'));
                const workspace = document.querySelector('.editor-workspace');
                if (workspace) {
                    updateDocStatePreserveScroll(workspace.innerHTML);
                }
                setSelectionState(prev => ({ ...prev, fontSize: sizeValue.replace('px', '') }));
                return;
            }
        }
        if (command === 'foreColor' && value) {
            if (applyStyleToMultiSelection({ 'color': value })) return;
        }
        if (command === 'lineHeight' && value) {
            if (applyStyleToMultiSelection({ 'line-height': value })) return;
        }
        if (command === 'letterSpacing' && value) {
            if (applyStyleToMultiSelection({ 'letter-spacing': value })) {
                setSelectionState(prev => ({ ...prev, letterSpacing: value || 'normal' }));
                return;
            }
        }
        if (command === 'textTransform' && value) {
            if (applyStyleToMultiSelection({ 'text-transform': value })) return;
        }
        if (command === 'bold') {
            const next = selectionState.bold ? 'normal' : 'bold';
            if (applyStyleToMultiSelection({ 'font-weight': next })) {
                setSelectionState(prev => ({ ...prev, bold: !prev.bold }));
                return;
            }
        }
        if (command === 'italic') {
            const next = selectionState.italic ? 'normal' : 'italic';
            if (applyStyleToMultiSelection({ 'font-style': next })) {
                setSelectionState(prev => ({ ...prev, italic: !prev.italic }));
                return;
            }
        }
        if (command === 'underline') {
            const next = selectionState.underline ? 'none' : 'underline';
            if (applyStyleToMultiSelection({ 'text-decoration': next })) {
                setSelectionState(prev => ({ ...prev, underline: !prev.underline }));
                return;
            }
        }
        if (command === 'justifyLeft') {
            if (applyStyleToMultiSelection({ 'text-align': 'left' })) return;
        }
        if (command === 'justifyCenter') {
            if (applyStyleToMultiSelection({ 'text-align': 'center' })) return;
        }
        if (command === 'justifyRight') {
            if (applyStyleToMultiSelection({ 'text-align': 'right' })) return;
        }
        if (command === 'justifyFull') {
            if (applyStyleToMultiSelection({ 'text-align': 'justify' })) return;
        }
    }

    const commandsNeedingSelection = new Set([
        'bold', 'italic', 'underline', 'fontName', 'fontSize', 'foreColor',
        'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
        'insertOrderedList', 'insertUnorderedList', 'textTransform'
    ]);
    if (commandsNeedingSelection.has(command)) {
        restoreSelection();
    }

    // --- Footer Global Styling ---
    if (selectedFooter) {
        const workspace = document.querySelector('.editor-workspace');
        if (!workspace) return;
        const footers = workspace.querySelectorAll('.page-footer');
        
        footers.forEach((footerEl) => {
            const footer = footerEl as HTMLElement;
            if (command === 'fontSize') {
                const size = value || '12';
                footer.style.fontSize = size.includes('px') ? size : `${size}px`;
            } else if (command === 'fontName') {
                footer.style.fontFamily = value || 'inherit';
            } else if (command === 'bold') {
                footer.style.fontWeight = footer.style.fontWeight === 'bold' ? 'normal' : 'bold';
            } else if (command === 'italic') {
                footer.style.fontStyle = footer.style.fontStyle === 'italic' ? 'normal' : 'italic';
            } else if (command === 'underline') {
                footer.style.textDecoration = footer.style.textDecoration.includes('underline') ? 'none' : 'underline';
            } else if (command === 'justifyLeft') {
                footer.style.textAlign = 'left';
                footer.style.paddingLeft = '0.6in'; 
                footer.style.paddingRight = '0';
            } else if (command === 'justifyCenter') {
                footer.style.textAlign = 'center';
                footer.style.padding = '0';
            } else if (command === 'justifyRight') {
                footer.style.textAlign = 'right';
                footer.style.paddingRight = '0.6in';
                footer.style.paddingLeft = '0';
            } else if (command === 'justifyFull') {
                footer.style.textAlign = 'justify';
                footer.style.paddingLeft = '0.6in';
                footer.style.paddingRight = '0.6in';
            } else if (command === 'foreColor') {
                footer.style.color = value || '#000000';
            } else if (command === 'lineHeight') {
                footer.style.lineHeight = value || 'normal';
            } else if (command === 'textTransform') {
                footer.style.textTransform = value || 'none';
            }
        });

        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        return;
    }

    // 1. Handle formatBlock for divs with special classes
    if (command === 'formatBlock' && activeBlock) {
        const targetDiv = activeBlock.closest('div[class]:not(.page):not(.editor-workspace)') as HTMLElement;
        if (targetDiv) {
            const divClass = targetDiv.className.split(' ')[0];
            const workspace = document.querySelector('.editor-workspace');
            if (workspace && divClass) {
                const newTag = value?.replace(/[<>]/g, '') || 'p';
                const divsToConvert = workspace.querySelectorAll(`div.${divClass}`);
                divsToConvert.forEach(div => {
                    const newEl = document.createElement(newTag);
                    newEl.innerHTML = div.innerHTML;
                    newEl.className = div.className;
                    const oldStyle = (div as HTMLElement).getAttribute('style');
                    if (oldStyle) newEl.setAttribute('style', oldStyle);
                    div.replaceWith(newEl);
                });
                updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
                return;
            }
        }
    }

    if (command === 'lineHeight') {
        // 1. Recover activeBlock if detached
        let targetBlock = activeBlock;
        if (targetBlock && !targetBlock.isConnected) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                 const node = selection.getRangeAt(0).commonAncestorContainer;
                 const el = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
                 targetBlock = el?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), li, blockquote') as HTMLElement | null;
            }
        }

        // 2. Fallback to current selection if no activeBlock
        if (!targetBlock) {
             const selection = window.getSelection();
             if (selection && selection.rangeCount > 0) {
                 const node = selection.getRangeAt(0).commonAncestorContainer;
                 const el = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
                 targetBlock = el?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), li, blockquote') as HTMLElement | null;
             }
        }

        if (targetBlock) {
            targetBlock.style.lineHeight = value || 'normal';
            
            // Check if selection spans multiple blocks and apply to all
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
                 const range = selection.getRangeAt(0);
                 const wrapper = document.createElement('div');
                 wrapper.appendChild(range.cloneContents());
                 const blocks = wrapper.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, li, blockquote');
                 if (blocks.length > 0) {
                      // Complex multi-block selection - for now, just apply to the common ancestor if it's a block,
                      // or iterate through siblings if possible. 
                      // Simpler approach: Document.execCommand doesn't support lineHeight.
                      // We will iterate next siblings from start node until end node.
                      
                      let current = targetBlock;
                      const endNode = selection.focusNode?.parentElement?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page), li, blockquote');
                      
                      // Safety limit to prevent infinite loops
                      let loops = 0;
                      while (current && loops < 50) {
                          (current as HTMLElement).style.lineHeight = value || 'normal';
                          if (current === endNode || !current.nextElementSibling) break;
                          current = current.nextElementSibling as HTMLElement;
                          loops++;
                      }
                 }
            }

            // Force history update
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
            }
        }
        return;
    }

    if (command === 'fontSize') {
        const sizeValue = value || '16';
        const sizePx = sizeValue.includes('px') ? sizeValue : `${sizeValue}px`;
        const selection = window.getSelection();
        let range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        if ((!range || range.collapsed) && selectionState.range) {
            range = selectionState.range;
        }
        const workspace = document.querySelector('.editor-workspace');
        if (range && workspace && !workspace.contains(range.commonAncestorContainer)) {
            range = null;
        }

        const targetBlock =
            (range
                ? (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
                    ? (range.commonAncestorContainer as HTMLElement)
                    : range.commonAncestorContainer.parentElement)
                : null)?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, .floating-text, .writing-lines, textarea.writing-lines, div:not(.page):not(.editor-workspace)') as HTMLElement | null
            || selectedTextLayer
            || (activeBlock && activeBlock.tagName !== 'IMG' ? activeBlock : null);

        if (range && !range.collapsed) {
            const span = document.createElement('span');
            span.style.fontSize = sizePx;
            span.appendChild(range.extractContents());
            range.insertNode(span);

            selection?.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection?.addRange(newRange);
        } else if (targetBlock) {
            targetBlock.style.fontSize = sizePx;
        }

        setSelectionState(prev => ({ ...prev, fontSize: sizeValue.replace('px', '') }));
        if (workspace) {
            updateDocStatePreserveScroll(workspace.innerHTML);
        }
        return;
    }

    if (command === 'letterSpacing') {
        restoreSelection();
        const selection = window.getSelection();
        const workspace = document.querySelector('.editor-workspace');
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            if (workspace && !workspace.contains(range.commonAncestorContainer)) {
                return;
            }
            const span = document.createElement('span');
            span.style.letterSpacing = value || 'normal';
            span.appendChild(range.extractContents());
            range.insertNode(span);

            selection.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            selection.addRange(newRange);

            if (workspace) {
                updateDocStatePreserveScroll(workspace.innerHTML);
            }
            setSelectionState(prev => ({ ...prev, letterSpacing: value || 'normal' }));
            return;
        }

        let targetBlock = activeBlock;
        if (targetBlock && !targetBlock.isConnected) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const node = sel.getRangeAt(0).commonAncestorContainer;
                const el = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
                targetBlock = el?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), li, blockquote') as HTMLElement | null;
            }
        }

        if (!targetBlock) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const node = sel.getRangeAt(0).commonAncestorContainer;
                const el = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
                targetBlock = el?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), li, blockquote') as HTMLElement | null;
            }
        }

        if (targetBlock) {
            targetBlock.style.letterSpacing = value || 'normal';
            setSelectionState(prev => ({ ...prev, letterSpacing: value || 'normal' }));
            if (workspace) {
                updateDocStatePreserveScroll(workspace.innerHTML);
            }
        }
        return;
    }

    if (command === 'textTransform') {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const node = range.commonAncestorContainer;
            const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
            const targetBlock = el?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, .floating-text, .writing-lines, textarea.writing-lines, div:not(.page):not(.editor-workspace)') as HTMLElement | null;
            if (targetBlock) {
                targetBlock.style.textTransform = value || 'none';
                const workspace = document.querySelector('.editor-workspace');
                if (workspace) {
                    updateDocStatePreserveScroll(workspace.innerHTML);
                }
                return;
            }
        }
        return;
    }

    // 3. Standard Text Command (if not inside a shape)
    document.execCommand(command, false, value);
    
    // For font size, ensure we force focus back if dropdown was used
    const editor = document.querySelector('.editor-workspace') as HTMLElement;
    editor?.focus();
    
    // NOTE: execCommand triggers the Editor's mutation observer or input listener, 
    // which calls handleContentChange. So history will be saved via debounce.
  };

  const handleUpdateStyle = (targetTagName?: string) => {
    const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
    const styledElement = activeBlock?.closest('h1, h2, h3, h4, h5, h6, p, blockquote, div[class]:not(.page):not(.editor-workspace)');
    const headingTags = ['h1', 'h2', 'h3'];

    const inferHeadingFromHR = () => {
      if (!selectedHR) return null;
      let prev = selectedHR.previousElementSibling as HTMLElement | null;
      while (prev && prev.tagName === 'BR') prev = prev.previousElementSibling as HTMLElement | null;
      const tag = prev?.tagName.toLowerCase();
      return tag && headingTags.includes(tag) ? tag : null;
    };

    const selector = targetTagName?.toLowerCase() || styledElement?.nodeName.toLowerCase() || inferHeadingFromHR();
    const normalizedSelector = selector && headingTags.includes(selector) ? selector : null;

    if (!selector) {
      alert("Select text inside a paragraph or heading first.");
      return;
    }

    let htmlModified = false;

    const applyShapeToHeadings = (tagName: string, sourceShape: HTMLElement) => {
      if (!workspace) return false;
      const shapeClasses = ['shape-circle', 'shape-pill', 'shape-speech', 'shape-cloud', 'shape-rectangle'];
      const sourceShapeClass = shapeClasses.find(cls => sourceShape.classList.contains(cls));
      const sourceBorderVar = sourceShape.style.getPropertyValue('--shape-border');
      const sourceBgVar = sourceShape.style.getPropertyValue('--shape-bg');
      const sourceComputed = window.getComputedStyle(sourceShape);

      const headings = Array.from(workspace.querySelectorAll(tagName)) as HTMLElement[];
      let changed = false;

      headings.forEach(heading => {
        let shapeEl = heading.querySelector('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle') as HTMLElement | null;

        if (!shapeEl) {
          shapeEl = document.createElement('span');
          while (heading.firstChild) {
            shapeEl.appendChild(heading.firstChild);
          }
          heading.appendChild(shapeEl);
        }

        shapeEl.classList.remove('mission-box', ...shapeClasses);
        shapeEl.classList.add('mission-box');
        if (sourceShapeClass) shapeEl.classList.add(sourceShapeClass);

        const styleProps: Array<keyof CSSStyleDeclaration> = ['borderColor', 'backgroundColor', 'borderWidth', 'borderStyle', 'padding', 'borderRadius', 'width', 'maxWidth'];
        styleProps.forEach(prop => {
          const inlineValue = (sourceShape.style as any)[prop] as string;
          if (inlineValue) {
            (shapeEl!.style as any)[prop] = inlineValue;
            return;
          }

          const computedValue = (sourceComputed as any)[prop] as string;
          if (computedValue && computedValue !== 'none' && computedValue !== 'auto') {
            (shapeEl!.style as any)[prop] = computedValue;
          }
        });

        if (sourceBorderVar) shapeEl.style.setProperty('--shape-border', sourceBorderVar);
        if (sourceBgVar) shapeEl.style.setProperty('--shape-bg', sourceBgVar);

        changed = true;
      });

      return changed;
    };

    const applyHrToHeadings = (tagName: string, sourceHr: HTMLHRElement) => {
      if (!workspace) return false;
      const headings = Array.from(workspace.querySelectorAll(tagName)) as HTMLElement[];
      let changed = false;

      headings.forEach(heading => {
        let next = heading.nextElementSibling as HTMLElement | null;
        while (next && next.tagName === 'BR') next = next.nextElementSibling as HTMLElement | null;

        let hrEl: HTMLHRElement;
        if (next && next.tagName === 'HR') {
          hrEl = next as HTMLHRElement;
        } else {
          hrEl = document.createElement('hr');
          heading.parentNode?.insertBefore(hrEl, heading.nextSibling);
        }

        hrEl.style.cssText = sourceHr.style.cssText;
        hrEl.removeAttribute('data-selected');
        changed = true;
      });

      return changed;
    };

    if (normalizedSelector) {
      const sourceShape = activeBlock?.closest('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle') as HTMLElement | null;
      if (sourceShape) {
        htmlModified = applyShapeToHeadings(normalizedSelector, sourceShape) || htmlModified;
      }

      if (selectedHR) {
        htmlModified = applyHrToHeadings(normalizedSelector, selectedHR) || htmlModified;
      }
    }

    if (!styledElement) {
      if (htmlModified && workspace) {
        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
      }
      alert(`Updated style for ${selector}. All matching elements will now use this style.`);
      return;
    }

    const computed = window.getComputedStyle(styledElement as Element);

    // Get inline styles from selection (font, color etc are applied via execCommand to inner elements)
    const color = selectionState.foreColor || computed.color;
    const fontFamily = selectionState.fontName || computed.fontFamily;
    const fontWeight = selectionState.bold ? 'bold' : computed.fontWeight;
    const fontStyle = selectionState.italic ? 'italic' : computed.fontStyle;
    const textDecoration = selectionState.underline ? 'underline' : computed.textDecoration;

    const newRule = `
 ${selector} {
    font-family: ${fontFamily} !important;
    font-size: ${computed.fontSize} !important;
    color: ${color} !important;
    font-weight: ${fontWeight} !important;
    text-align: ${computed.textAlign} !important;
    font-style: ${fontStyle} !important;
    text-decoration: ${textDecoration} !important;
    margin-top: ${computed.marginTop} !important;
    margin-bottom: ${computed.marginBottom} !important;
    line-height: ${computed.lineHeight} !important;
 }
 `;

    const nextHtml = htmlModified && workspace ? workspace.innerHTML : docState.htmlContent;

    updateDocState({
        ...docState,
        htmlContent: nextHtml,
        cssContent: docState.cssContent + '\n' + newRule
    }, true);
    
    alert(`Updated style for ${selector}. All matching elements will now use this style.`);
  };

  // --- Feature: Real-time Block Styling (Frames & Pudding & Shapes) ---
  const handleBlockStyleUpdate = (styles: Record<string, string>) => {
      // 1. Check if we should wrap selected text in a new block (for shapes)
      if (styles.shape) {
          // Try to get the freshest range possible
          let range = selectionState.range;
          const liveSelection = window.getSelection();
          if (liveSelection && liveSelection.rangeCount > 0 && !liveSelection.isCollapsed) {
              range = liveSelection.getRangeAt(0);
          }
          
          // Check if selection is ALREADY inside a shape to prevent nesting
          let existingShape = null;
          if (range) {
              const node = range.commonAncestorContainer;
              const element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
              existingShape = element?.closest('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle');
          }

          // If we are already inside a shape, FORCE update the existing one
          if (existingShape) {
              const shapeEl = existingShape as HTMLElement;
              
              // Update shape class
              shapeEl.classList.remove('shape-circle', 'shape-pill', 'shape-speech', 'shape-cloud', 'mission-box', 'shape-rectangle');
              shapeEl.classList.add('mission-box'); 
              if (styles.shape !== 'none') {
                  shapeEl.classList.add(`shape-${styles.shape}`);
              }

              // Update styles
              if (styles.borderColor) {
                  shapeEl.style.borderColor = styles.borderColor;
                  shapeEl.style.setProperty('--shape-border', styles.borderColor);
              }
              if (styles.backgroundColor) {
                  shapeEl.style.backgroundColor = styles.backgroundColor;
                  shapeEl.style.setProperty('--shape-bg', styles.backgroundColor);
              }
              if (styles.borderWidth) shapeEl.style.borderWidth = styles.borderWidth;
              if (styles.borderStyle) shapeEl.style.borderStyle = styles.borderStyle;

              // Force history update and exit
              const workspace = document.querySelector('.editor-workspace');
              if (workspace) {
                  updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
              }
              return;
          }

          // Verify range is valid for NEW creation
          const workspace = document.querySelector('.editor-workspace');
          const isRangeValid = range && 
                               !range.collapsed && 
                               (document.contains(range.commonAncestorContainer) || (workspace && workspace.contains(range.commonAncestorContainer)));

          if (isRangeValid) {
              const content = range!.extractContents();
              
              // --- SANITIZATION START ---
              // Helper to unwrap elements
              const unwrap = (element: HTMLElement) => {
                  const parent = element.parentNode;
                  if (!parent) return;
                  
                  // Preserve styles (especially font-family) by wrapping content in a span
                  if (element.hasAttribute('style')) {
                      const span = document.createElement('span');
                      span.setAttribute('style', element.getAttribute('style')!);
                      
                      // Move all children into the span
                      while (element.firstChild) {
                          span.appendChild(element.firstChild);
                      }
                      element.appendChild(span);
                  }

                  const isBlock = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(element.tagName);
                  
                  while (element.firstChild) {
                      parent.insertBefore(element.firstChild, element);
                  }
                  
                  if (isBlock && element.nextSibling) {
                      parent.insertBefore(document.createElement('br'), element);
                  }
                  
                  parent.removeChild(element);
              };

              // 1. Un-nest: Remove existing shapes
              content.querySelectorAll('.mission-box').forEach(el => unwrap(el as HTMLElement));

              // 2. Flatten Blocks: Convert P/DIV inside selection to inline text + BR
              content.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote').forEach(el => unwrap(el as HTMLElement));
              // --- SANITIZATION END ---

              // Create new shape wrapper
              const wrapper = document.createElement('span');
              const shapeClass = styles.shape === 'none' ? '' : ` shape-${styles.shape}`;
              wrapper.className = `mission-box${shapeClass}`;
              
              // Set initial styles
              if (styles.borderColor) {
                  wrapper.style.borderColor = styles.borderColor;
                  wrapper.style.setProperty('--shape-border', styles.borderColor);
              }
              if (styles.backgroundColor) {
                  wrapper.style.backgroundColor = styles.backgroundColor;
                  wrapper.style.setProperty('--shape-bg', styles.backgroundColor);
              }
              if (styles.borderWidth) wrapper.style.borderWidth = styles.borderWidth;
              if (styles.borderStyle) wrapper.style.borderStyle = styles.borderStyle;
              
              wrapper.appendChild(content);
              range!.insertNode(wrapper);
              
              // Clear selection
              if (liveSelection) liveSelection.removeAllRanges();
              
              // Force history update
              const workspace = document.querySelector('.editor-workspace');
              if (workspace) {
                  updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
              }
              return;
          }
      }

      // 2. Standard behavior: Apply to active block
      
      // RECOVERY: If activeBlock is detached (due to re-render), try to find it again via selection
      let currentBlock = activeBlock;
      if (currentBlock && !currentBlock.isConnected) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
              const node = selection.getRangeAt(0).commonAncestorContainer;
              const el = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
              // Re-select based on the same criteria as Editor.tsx
              const recovered = el?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle');
              if (recovered) {
                  currentBlock = recovered as HTMLElement;
                  setActiveBlock(currentBlock); // Sync state
              }
          }
      }

      if (!currentBlock) return;

      const shapeSelectors = '.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle';
      const pendingStyles = { ...styles };

      // Shape alignment: move the container instead of aligning text
      const shapeAlignmentTarget = pendingStyles.textAlign
        ? (currentBlock.matches(shapeSelectors)
            ? currentBlock
            : currentBlock.closest(shapeSelectors))
        : null;

      if (shapeAlignmentTarget && (pendingStyles.textAlign === 'left' || pendingStyles.textAlign === 'center' || pendingStyles.textAlign === 'right')) {
          if (!shapeAlignmentTarget.style.width || shapeAlignmentTarget.style.width === '100%') {
              shapeAlignmentTarget.style.width = 'fit-content';
          }
          shapeAlignmentTarget.style.display = 'block';

          shapeAlignmentTarget.style.marginLeft = '';
          shapeAlignmentTarget.style.marginRight = '';

          if (pendingStyles.textAlign === 'left') {
              shapeAlignmentTarget.style.setProperty('margin-left', '0', 'important');
              shapeAlignmentTarget.style.setProperty('margin-right', 'auto', 'important');
          } else if (pendingStyles.textAlign === 'center') {
              shapeAlignmentTarget.style.setProperty('margin-left', 'auto', 'important');
              shapeAlignmentTarget.style.setProperty('margin-right', 'auto', 'important');
          } else if (pendingStyles.textAlign === 'right') {
              shapeAlignmentTarget.style.setProperty('margin-left', 'auto', 'important');
              shapeAlignmentTarget.style.setProperty('margin-right', '0', 'important');
          }

          setSelectionState(prev => ({ ...prev, textAlign: pendingStyles.textAlign as string }));

          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
              updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
          }

          delete pendingStyles.textAlign;
      }

      if (Object.keys(pendingStyles).length === 0) return;

      // RESOLVE TARGET: If applying shape properties, look for the shape container
      const isShapeProperty = pendingStyles.shape || pendingStyles.borderColor || pendingStyles.backgroundColor || pendingStyles.borderWidth || pendingStyles.borderStyle || pendingStyles.padding;
      
      let targetBlock = currentBlock;
      let isShape = currentBlock.matches(shapeSelectors);

      if (isShapeProperty && !isShape) {
          // Try to find a parent shape
          const parentShape = currentBlock.closest(shapeSelectors);
          if (parentShape) {
              targetBlock = parentShape as HTMLElement;
              isShape = true;
          }
      }

      if (isShapeProperty && !isShape) {
          // Exception: If we are just aligning text (textAlign), that's allowed on paragraphs.
          // But if we are setting borders/backgrounds/shapes, abort if it's not a shape.
          // This prevents "Page Rectangle" layout breakage.
          if (!pendingStyles.textAlign && !pendingStyles.blockType && !pendingStyles.fontSize && !pendingStyles.fontName) {
             return;
          }
      }

      Object.entries(pendingStyles).forEach(([key, value]) => {
          if (key === 'shape') {
              // Remove existing shape classes
              targetBlock.classList.remove('shape-circle', 'shape-pill', 'shape-speech', 'shape-cloud', 'shape-rectangle');
              
              if (value !== 'none') {
                  targetBlock.style.borderRadius = ''; 
                  targetBlock.classList.add(`shape-${value}`);
              }
          } 
          else if (key === 'padding') {
              (targetBlock.style as any).padding = value;
          } 
          else if (key === 'borderColor') {
              (targetBlock.style as any).borderColor = value;
              targetBlock.style.setProperty('--shape-border', value);
          }
          else if (key === 'backgroundColor') {
              (targetBlock.style as any).backgroundColor = value;
              targetBlock.style.setProperty('--shape-bg', value);
          }
          else if (key === 'borderWidth') {
              (targetBlock.style as any).borderWidth = value;
              // Auto-set style to solid if width > 0 and style is missing/none
              if (parseInt(value) > 0) {
                  const computedStyle = window.getComputedStyle(targetBlock);
                  if (!computedStyle.borderStyle || computedStyle.borderStyle === 'none') {
                      targetBlock.style.borderStyle = 'solid';
                  }
              }
          }
          else if (key === 'width') {
              (targetBlock.style as any).width = value;
              (targetBlock.style as any).maxWidth = '100%'; // Constraint to prevent page overflow
          }
          else {
              (targetBlock.style as any)[key] = value;
          }
      });

      setSelectionState(prev => ({ ...prev, ...styles }));
      
      // Debounce history for slider moves
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
             const newState = { ...docState, htmlContent: workspace.innerHTML };
             updateDocState(newState, true);
          }
      }, 500);
  };

  const handleInsertHorizontalRule = () => {
      // Focus the editor first to ensure insertion happens in the content
      const editor = document.querySelector('.editor-workspace') as HTMLElement;
      editor?.focus();
      
      // Insert an explicitly styled HR to avoid it being invisible due to default CSS
      const hrHtml = '<hr style="width: 100%; border-top: 2px solid #000; border-bottom: none; border-left: none; border-right: none; height: 0px; background-color: transparent; margin: 20px auto;" />';
      document.execCommand('insertHTML', false, hrHtml);
      // History saved by content change debounce
  };

  // --- Feature: Page Break ---
  const handlePageBreak = () => {
     const selection = window.getSelection();
     if (!selection || selection.rangeCount === 0) return;
     const range = selection.getRangeAt(0);

     const startNode = range.startContainer.nodeType === 1 ? range.startContainer as HTMLElement : range.startContainer.parentElement;
     const currentPage = startNode?.closest('.page') as HTMLElement | null;

     if (!currentPage) return;

     const newPage = document.createElement('div');
     newPage.className = 'page';
     newPage.setAttribute('data-page-break', 'true');

     const marker = document.createElement('span');
     marker.id = 'page-break-marker-' + Date.now();
     range.collapse(true);
     range.insertNode(marker);

     let topBlock: HTMLElement | null = marker;
     while (topBlock && topBlock.parentElement !== currentPage) {
         topBlock = topBlock.parentElement;
     }

     if (topBlock && topBlock.parentElement === currentPage) {
         const isAtStart = (() => {
             let node: Node | null = marker;
             while (node && node !== topBlock) {
                 if (node.previousSibling) {
                     const prev = node.previousSibling;
                     if (prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()) {
                         node = prev;
                         continue;
                     }
                     return false;
                 }
                 node = node.parentElement;
             }
             return true;
         })();

         const isAtEnd = (() => {
             let node: Node | null = marker;
             while (node && node !== topBlock) {
                 if (node.nextSibling) {
                     const next = node.nextSibling;
                     if (next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()) {
                         node = next;
                         continue;
                     }
                     return false;
                 }
                 node = node.parentElement;
             }
             return true;
         })();

         if (isAtStart) {
             let node: Node | null = topBlock;
             const nodesToMove: Node[] = [];
             while (node) {
                 const next = node.nextSibling;
                 if (node !== marker && !(node instanceof HTMLElement && node.classList.contains('page-footer'))) {
                     nodesToMove.push(node);
                 }
                 node = next;
             }
             nodesToMove.forEach(n => newPage.appendChild(n));
         } else if (isAtEnd) {
             let nextSibling = topBlock.nextSibling;
             const nodesToMove: Node[] = [];
             while (nextSibling) {
                 if (!(nextSibling instanceof HTMLElement && nextSibling.classList.contains('page-footer'))) {
                     nodesToMove.push(nextSibling);
                 }
                 nextSibling = nextSibling.nextSibling;
             }
             nodesToMove.forEach(n => newPage.appendChild(n));
         } else {
             const remainder = topBlock.cloneNode(false) as HTMLElement;
             if (remainder.id) remainder.id = '';

             let moveMode = false;
             const childNodes = Array.from(topBlock.childNodes);
             for (const child of childNodes) {
                 if (child === marker) {
                     moveMode = true;
                     continue;
                 }
                 if (moveMode) {
                     remainder.appendChild(child);
                 }
             }

             if (!remainder.hasChildNodes()) {
                 const innerBlock = startNode?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page)') as HTMLElement | null;
                 if (innerBlock && innerBlock !== topBlock && topBlock.contains(innerBlock)) {
                     const innerRemainder = innerBlock.cloneNode(false) as HTMLElement;
                     if (innerRemainder.id) (innerRemainder as HTMLElement).id = '';
                     let innerMove = false;
                     const innerNodes = Array.from(innerBlock.childNodes);
                     for (const child of innerNodes) {
                         if (child === marker) {
                             innerMove = true;
                             continue;
                         }
                         if (innerMove) {
                             innerRemainder.appendChild(child);
                         }
                     }
                     if (innerRemainder.hasChildNodes()) {
                         let sibling = innerBlock.nextSibling;
                         const siblings: Node[] = [];
                         while (sibling) {
                             if (!(sibling instanceof HTMLElement && sibling.classList.contains('page-footer'))) {
                                 siblings.push(sibling);
                             }
                             sibling = sibling.nextSibling;
                         }

                         const outerRemainder = topBlock.cloneNode(false) as HTMLElement;
                         if (outerRemainder.id) outerRemainder.id = '';
                         outerRemainder.appendChild(innerRemainder);
                         siblings.forEach(s => outerRemainder.appendChild(s));
                         newPage.appendChild(outerRemainder);

                         let afterTop = topBlock.nextSibling;
                         const afterNodes: Node[] = [];
                         while (afterTop) {
                             if (!(afterTop instanceof HTMLElement && afterTop.classList.contains('page-footer'))) {
                                 afterNodes.push(afterTop);
                             }
                             afterTop = afterTop.nextSibling;
                         }
                         afterNodes.forEach(n => newPage.appendChild(n));
                     }
                 }
             } else {
                 newPage.appendChild(remainder);
                 let nextSibling = topBlock.nextSibling;
                 const nodesToMove: Node[] = [];
                 while (nextSibling) {
                     if (!(nextSibling instanceof HTMLElement && nextSibling.classList.contains('page-footer'))) {
                         nodesToMove.push(nextSibling);
                     }
                     nextSibling = nextSibling.nextSibling;
                 }
                 nodesToMove.forEach(n => newPage.appendChild(n));
             }
         }

         currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
         marker.remove();
     } else {
         currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
         marker.remove();
     }

     const rangeNew = document.createRange();
     if (newPage.firstChild) {
         rangeNew.setStart(newPage.firstChild, 0);
     } else {
         rangeNew.setStart(newPage, 0);
     }
     rangeNew.collapse(true);
     selection.removeAllRanges();
     selection.addRange(rangeNew);

     const workspace = document.querySelector('.editor-workspace');
     if (workspace) {
         reflowPages(workspace as HTMLElement);
         updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
     }
  };

  const handleInsertTOC = (settings: TOCSettings) => {
      const workspace = document.querySelector('.editor-workspace');
      if (!workspace) return;

      const pages = workspace.querySelectorAll('.page');
      const tocEntries: TOCEntry[] = [];
      
      const selectors = [];
      if (settings.includeH1) selectors.push('h1');
      if (settings.includeH2) selectors.push('h2');
      if (settings.includeH3) selectors.push('h3');
      
      if (selectors.length === 0) {
          alert("Please select at least one heading level.");
          return;
      }
      const selectorString = selectors.join(', ');

      pages.forEach((page, pageIndex) => {
          const headings = page.querySelectorAll(selectorString);
          headings.forEach((heading, hIndex) => {
              if (!heading.id) {
                  heading.id = `toc-${pageIndex}-${hIndex}-${Date.now()}`;
              }
              
              tocEntries.push({
                  id: heading.id,
                  text: heading.textContent || 'Untitled Section',
                  page: pageIndex + 1,
                  level: heading.tagName.toLowerCase()
              });
          });
      });

      if (tocEntries.length === 0) {
          alert("No matching headings found.");
          setIsTOCModalOpen(false);
          return;
      }

      let tocHtml = '';

      tocEntries.forEach(entry => {
          const level = entry.level;
          const indent = level === 'h2' ? settings.h2Indent : level === 'h3' ? settings.h3Indent : 0;
          const weight = level === 'h1' ? 'bold' : 'normal';
          const fStyle = level === 'h3' ? 'italic' : 'normal';
          const fontFam = settings.fontFamily === 'inherit' ? '' : `font-family:${settings.fontFamily};`;

          const entryStyle = `display:flex;align-items:baseline;width:100%;white-space:nowrap;overflow:hidden;margin:0;padding:1px 0;line-height:${settings.lineHeight};font-size:${settings.fontSize}px;font-weight:${weight};font-style:${fStyle};${fontFam}`;
          const titleStyle = `flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:${indent}px`;
          const leaderStyle = `flex:1 1 auto;min-width:20px;height:0;margin:0 4px;${settings.showLeader ? 'border-bottom:1px dotted #aaa' : ''}`;
          const pageStyle = `flex-shrink:0;min-width:2ch;text-align:right;font-variant-numeric:tabular-nums`;

          tocHtml += `<div class="toc-entry" data-level="${level}" style="${entryStyle}"><span style="${titleStyle}"><a href="#${entry.id}" style="color:inherit;text-decoration:none" onclick="const el = document.getElementById('${entry.id}'); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return false;">${entry.text}</a></span><span style="${leaderStyle}"></span><span style="${pageStyle}">${entry.page}</span></div>`;
      });

      // Insert TOC using DOM manipulation (execCommand fails after modal focus loss)
      const savedRange = selectionState.range;
      if (savedRange && workspace.contains(savedRange.commonAncestorContainer)) {
          // Restore saved selection and insert there
          const sel = window.getSelection();
          if (sel) {
              sel.removeAllRanges();
              sel.addRange(savedRange);
              document.execCommand('insertHTML', false, tocHtml);
          }
      } else {
          // Fallback: insert at the beginning of the first page
          const firstPage = workspace.querySelector('.page') as HTMLElement;
          if (firstPage) {
              const temp = document.createElement('div');
              temp.innerHTML = tocHtml;
              const fragment = document.createDocumentFragment();
              while (temp.firstChild) {
                  fragment.appendChild(temp.firstChild);
              }
              firstPage.insertBefore(fragment, firstPage.firstChild);
          }
      }

      // Save state
      const ws = document.querySelector('.editor-workspace');
      if (ws) {
          updateDocState({ ...docState, htmlContent: ws.innerHTML }, true);
      }

      setIsTOCModalOpen(false);
  };

  const preparePageAnchors = () => {
      const workspace = document.querySelector('.editor-workspace');
      if (!workspace) {
          setPageAnchors([]);
          return;
      }

      const headings = workspace.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const anchors: PageAnchor[] = [];

      // Always add "Start of Document"
      anchors.push({
          id: 'DOC_START',
          text: 'Start of Document',
          tagName: 'DOC_START'
      });

      headings.forEach((heading, index) => {
          if (!heading.id) {
              heading.id = `anchor-${index}-${Date.now()}`;
          }
          anchors.push({
              id: heading.id,
              text: heading.textContent || 'Untitled Section',
              tagName: heading.tagName.toLowerCase()
          });
      });

      setPageAnchors(anchors);
      setIsPageNumberModalOpen(true);
  };

  const updatePageNumbers = (startAnchorId: string, font: string, fontSize: string, position: 'top' | 'bottom', align: 'left' | 'center' | 'right', margin: number) => {
      const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
      if (!workspace) return;

      const pages = workspace.querySelectorAll('.page');
      let startPageIndex = 0;

      if (startAnchorId !== 'DOC_START') {
          const anchorEl = document.getElementById(startAnchorId);
          if (anchorEl) {
              const pageEl = anchorEl.closest('.page');
              if (pageEl) {
                  for (let i = 0; i < pages.length; i++) {
                      if (pages[i] === pageEl) {
                          startPageIndex = i;
                          break;
                      }
                  }
              }
          }
      }

      const sizePt = Number.parseFloat(fontSize);
      const lineHeightPt = (Number.isFinite(sizePt) ? sizePt : 12) * 1.2;
      const footerHeightIn = lineHeightPt / 72;
      const bottomGapIn = pageMargins.bottom - margin;
      const topGapIn = pageMargins.top - margin;
      const footerReserveIn = position === 'bottom'
          ? Math.max(0, footerHeightIn - bottomGapIn)
          : 0;
      const headerReserveIn = position === 'top'
          ? Math.max(0, footerHeightIn - topGapIn)
          : 0;
      workspace.style.setProperty('--footer-reserve', `${footerReserveIn}in`);
      workspace.style.setProperty('--header-reserve', `${headerReserveIn}in`);

      pages.forEach((page, index) => {
          const existingFooter = page.querySelector('.page-footer');
          if (existingFooter) {
              existingFooter.remove();
          }

          if (index >= startPageIndex) {
              const footer = document.createElement('div');
              footer.className = 'page-footer';
              footer.style.fontFamily = font;
              footer.style.fontSize = `${fontSize}pt`;
              footer.style.textAlign = align;
              footer.style.position = 'absolute';
              footer.style.left = '0';
              footer.style.width = '100%';
              footer.style.pointerEvents = 'none';
              footer.style.zIndex = '10';
              
              if (position === 'top') {
                  footer.style.top = `${margin}in`;
                  footer.style.bottom = 'auto';
              } else {
                  footer.style.bottom = `${margin}in`;
                  footer.style.top = 'auto';
              }

              if (align === 'left') {
                  footer.style.paddingLeft = '0.6in';
                  footer.style.paddingRight = '0';
              } else if (align === 'right') {
                   footer.style.paddingRight = '0.6in';
                   footer.style.paddingLeft = '0';
              } else {
                  footer.style.padding = '0';
              }

              footer.textContent = (index - startPageIndex + 1).toString(); 
              footer.setAttribute('contenteditable', 'false');
              page.appendChild(footer);
          }
      });
      
      return workspace.innerHTML;
  };

  const handlePageNumberPreview = (startAnchorId: string, font: string, fontSize: string, position: 'top' | 'bottom', align: 'left' | 'center' | 'right', margin: number) => {
      const updatedHtml = updatePageNumbers(startAnchorId, font, fontSize, position, align, margin);
      if (updatedHtml) {
          setDocState(prev => ({ ...prev, htmlContent: updatedHtml }));
      }
  };

  const handleInsertPageNumbers = (startAnchorId: string, font: string, fontSize: string, position: 'top' | 'bottom', align: 'left' | 'center' | 'right', margin: number) => {
      const updatedHtml = updatePageNumbers(startAnchorId, font, fontSize, position, align, margin);
      if (updatedHtml) {
          updateDocState({ ...docState, htmlContent: updatedHtml }, true);
      }
      setIsPageNumberModalOpen(false);
  };

  const updatePageCSS = (width: string, height: string, margins: { top: number, bottom: number, left: number, right: number }) => {
    const markerStart = '/* SPYWRITER_LAYOUT_OVERRIDE_START */';
    const markerEnd = '/* SPYWRITER_LAYOUT_OVERRIDE_END */';

    const newCssBlock = `
${markerStart}
@page {
    size: ${width} ${height};
    margin: 0; /* Use padding on .page instead for better control */
}
.page {
    width: ${width} !important;
    height: ${height} !important;
    padding: calc(${margins.top}in + var(--header-reserve, 0in)) ${margins.right}in calc(${margins.bottom}in + var(--footer-reserve, 0in)) ${margins.left}in !important;
    overflow: hidden !important;
}
${markerEnd}
`;

    let updatedCss = docState.cssContent;
    const regex = new RegExp(`\\/\\* SPYWRITER_LAYOUT_OVERRIDE_START \\*\\/[\\s\\S]*?\\/\\* SPYWRITER_LAYOUT_OVERRIDE_END \\*\\/`, 'g');
    if (regex.test(updatedCss)) {
        updatedCss = updatedCss.replace(regex, newCssBlock.trim());
    } else {
        updatedCss = updatedCss + '\n' + newCssBlock.trim();
    }

    updateDocState({ ...docState, cssContent: updatedCss }, true);
  };

  const handlePageSizeChange = (formatId: string) => {
    setPageFormatId(formatId);
    
    const format = Object.values(PAGE_FORMATS).find(f => f.id === formatId);
    if (!format) return;

    // Update margins to format defaults
    setPageMargins(format.margins);

    if (formatId === 'custom') {
        updatePageCSS(customPageSize.width, customPageSize.height, format.margins);
    } else {
        updatePageCSS(format.width, format.height, format.margins);
    }
  };

  const handleCustomPageSizeChange = (width: string, height: string) => {
      setCustomPageSize({ width, height });
      if (pageFormatId === 'custom') {
          updatePageCSS(width, height, pageMargins);
      }
  };

  const handleMarginChange = (key: keyof typeof pageMargins, value: number) => {
      const newMargins = { ...pageMargins, [key]: value };
      setPageMargins(newMargins);
      
      const format = Object.values(PAGE_FORMATS).find(f => f.id === pageFormatId);
      const width = pageFormatId === 'custom' ? customPageSize.width : (format?.width || '8.5in');
      const height = pageFormatId === 'custom' ? customPageSize.height : (format?.height || '11in');
      
      updatePageCSS(width, height, newMargins);
  };

  // --- HR (Horizontal Rule) Selection & Logic ---
  const handleHRSelect = (hr: HTMLHRElement | null) => {
      if (selectedHR && selectedHR !== hr) {
          selectedHR.removeAttribute('data-selected');
      }

      if (hr) {
          hr.setAttribute('data-selected', 'true');
          const computed = window.getComputedStyle(hr);
          
          let style: 'solid' | 'dashed' | 'dotted' | 'tapered' = 'solid';
          // Check for border-style override or standard
          if (computed.borderTopStyle !== 'none' && computed.borderTopStyle !== 'hidden' && computed.borderTopStyle !== 'inset') {
             style = computed.borderTopStyle as any;
          }
          
          // Detect tapered gradient
          if (hr.style.background && hr.style.background.includes('gradient')) {
              style = 'tapered';
          }

          let width = 100;
          if (hr.style.width.includes('%')) width = parseInt(hr.style.width);

          let alignment: 'left' | 'center' | 'right' = 'center';
          if (hr.style.marginLeft === '0px' && (hr.style.marginRight === 'auto' || hr.style.marginRight !== '0px')) alignment = 'left';
          else if (hr.style.marginLeft === 'auto' && hr.style.marginRight === '0px') alignment = 'right';
          else alignment = 'center';

          // Determine color
          let color = '#000000';
          if (style !== 'tapered') {
              const hex = computed.borderTopColor;
              if (hex.startsWith('rgb')) {
                  const rgb = hex.match(/\d+/g);
                  if (rgb && rgb.length >= 3) {
                      color = "#" +
                      parseInt(rgb[0]).toString(16).padStart(2, '0') +
                      parseInt(rgb[1]).toString(16).padStart(2, '0') +
                      parseInt(rgb[2]).toString(16).padStart(2, '0');
                  }
              } else {
                  if (hex.startsWith('#')) color = hex;
              }
          }

          // Height / Thickness
          let height = 2;
          if (style === 'tapered') {
              const h = parseInt(hr.style.height);
              if (!isNaN(h)) height = h;
          } else {
              const b = parseInt(computed.borderTopWidth);
              if (!isNaN(b) && b > 0) height = b;
          }

          setHrProperties({
              color: color, 
              height: height,
              width: width,
              alignment: alignment,
              style: style
          });
      }

      setSelectedHR(hr);
  };

  const handleHRPropertyChange = (prop: keyof HRProperties, value: any) => {
      if (!selectedHR) return;
      const newProps = { ...hrProperties, [prop]: value };
      setHrProperties(newProps);

      // Width and Alignment
      if (prop === 'width' || prop === 'alignment') {
         selectedHR.style.width = `${newProps.width}%`;
         if (newProps.alignment === 'left') {
              selectedHR.style.marginLeft = '0';
              selectedHR.style.marginRight = 'auto';
          } else if (newProps.alignment === 'right') {
              selectedHR.style.marginLeft = 'auto';
              selectedHR.style.marginRight = '0';
          } else {
              selectedHR.style.marginLeft = 'auto';
              selectedHR.style.marginRight = 'auto';
          }
      }

      // Visual Style (Color, Height, Style)
      // Force reset essential properties to ensure clean switch
      selectedHR.style.borderRadius = '0';
      selectedHR.style.opacity = '1';
      selectedHR.style.border = 'none'; // Clear all borders first
      selectedHR.style.background = 'none'; // Clear background

      if (newProps.style === 'tapered') {
          // Tapered look: centered radial gradient
          selectedHR.style.height = `${newProps.height}px`;
          selectedHR.style.background = `radial-gradient(ellipse at center, ${newProps.color} 0%, transparent 80%)`;
          selectedHR.style.borderRadius = '4px'; 
          selectedHR.style.border = 'none';
      } else {
          // Standard Border styling
          selectedHR.style.height = '0px'; 
          selectedHR.style.borderTopWidth = `${newProps.height}px`;
          selectedHR.style.borderTopStyle = newProps.style;
          selectedHR.style.borderTopColor = newProps.color;
          selectedHR.style.backgroundColor = 'transparent'; // Ensure no bg color
      }

      // Trigger debounced history save
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
             const newState = { ...docState, htmlContent: workspace.innerHTML };
             updateDocState(newState, true);
          }
      }, 500);
  };


  const handleToggleCrop = () => {
      if (!selectedImage) return;
      setImageProperties(prev => ({ ...prev, isCropping: !prev.isCropping }));
  };

  const handleCropComplete = (newSrc: string, newWidth: number, newHeight: number) => {
      if (selectedImage) {
          selectedImage.src = newSrc;
          // Update dimensions to match the new crop size exactly
          selectedImage.style.width = `${newWidth}px`;
          selectedImage.style.height = `${newHeight}px`;
          selectedImage.style.maxWidth = 'none'; // Allow exact sizing
          
          setImageProperties(prev => ({ ...prev, isCropping: false }));
          // Save history after crop
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
              updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
          }
      }
  };

  const handleCancelCrop = () => {
      setImageProperties(prev => ({ ...prev, isCropping: false }));
  };

  // Helper to apply image style
  const applyImageStyle = (img: HTMLElement, prop: keyof ImageProperties, value: any, props: ImageProperties) => {
      if (prop === 'brightness' || prop === 'contrast') {
          const filterString = `brightness(${props.brightness}%) contrast(${props.contrast}%)`;
          img.style.filter = filterString;
      }
      if (prop === 'width') {
          img.style.width = `${value}%`;
      }
      if (prop === 'alignment') {
          img.style.float = 'none';
          img.style.display = 'inline-block';
          img.style.margin = '0';
          switch (value) {
              case 'center':
                  img.style.display = 'block';
                  img.style.margin = '0 auto';
                  break;
              case 'left':
                  img.style.display = 'inline-block';
                  break;
              case 'right':
                  img.style.display = 'block';
                  img.style.marginLeft = 'auto';
                  break;
              case 'float-left':
                  img.style.float = 'left';
                  img.style.marginRight = '15px';
                  img.style.marginBottom = '10px';
                  break;
              case 'float-right':
                  img.style.float = 'right';
                  img.style.marginLeft = '15px';
                  img.style.marginBottom = '10px';
                  break;
          }
      }
  };

  // Track image pattern and check for similar
  const trackImagePattern = (type: ActionType, img: HTMLElement, prop: keyof ImageProperties, value: any, props: ImageProperties) => {
      patternTrackerRef.current.recordAction(type, img, prop, String(value));
      
      const pattern = patternTrackerRef.current.detectPattern();
      if (pattern) {
          const workspace = document.querySelector('.editor-workspace') as HTMLElement;
          if (workspace) {
              const signature = getElementSignature(img);
              const matches = findSimilarElements(signature, img, workspace);
              
              if (matches.length > 0) {
                  setPatternModal({
                      isOpen: true,
                      actionType: pattern.actionType,
                      matches: matches,
                      applyStyle: (el: HTMLElement) => {
                          applyImageStyle(el, prop, value, props);
                      }
                  });
              }
          }
      }
  };

  const handleImagePropertyChange = (prop: keyof ImageProperties, value: any) => {
      if (!selectedImage) return;

      const newProps = { ...imageProperties, [prop]: value };
      setImageProperties(newProps);

      // Apply style to current image
      applyImageStyle(selectedImage, prop, value, newProps);

      // Track for pattern detection
      const actionTypes: Record<string, ActionType> = {
          'width': 'imageWidth',
          'alignment': 'imageAlign',
          'brightness': 'imageBrightness',
          'contrast': 'imageContrast'
      };
      const actionType = actionTypes[prop] || 'imageStyle';
      trackImagePattern(actionType, selectedImage, prop, value, newProps);

      // Debounce history for sliders
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = setTimeout(() => {
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
             const newState = { ...docState, htmlContent: workspace.innerHTML };
             updateDocState(newState, true);
          }
      }, 500);
  };

  // Pattern modal handlers
  const handlePatternConfirmApp = (selectedIds: string[]) => {
      const { applyStyle } = patternModal;
      
      selectedIds.forEach(id => {
          const element = document.getElementById(id);
          if (element && applyStyle) {
              applyStyle(element);
          }
      });
      
      const workspace = document.querySelector('.editor-workspace') as HTMLElement;
      if (workspace) {
          reflowPages(workspace);
          updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
      }
      
      patternTrackerRef.current.clear();
      setPatternModal({ isOpen: false, actionType: '', matches: [] });
  };

  const handlePatternCancelApp = () => {
      patternTrackerRef.current.clear();
      setPatternModal({ isOpen: false, actionType: '', matches: [] });
  };

  // Clean workspace before export
  const getCleanWorkspace = () => {
    const workspace = document.querySelector('.editor-workspace');
    if (!workspace) return null;
    
    // Clone to avoid modifying the actual DOM
    const clone = workspace.cloneNode(true) as HTMLElement;
    
    // Remove selection attributes
    clone.querySelectorAll('[data-selected]').forEach(el => {
        el.removeAttribute('data-selected');
    });
    clone.querySelectorAll('[data-structure-status]').forEach(el => {
        el.removeAttribute('data-structure-status');
    });
    
    return clone;
  };

  const handleExportHTML = (fileName: string) => {
    // Use the actual document state, not the live DOM
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = docState.htmlContent;
    
    // Clean up selection attributes
    tempDiv.querySelectorAll('[data-selected]').forEach(el => el.removeAttribute('data-selected'));
    tempDiv.querySelectorAll('[data-structure-status]').forEach(el => el.removeAttribute('data-structure-status'));
    
    const workspace = tempDiv;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${fileName}</title>
    <style>
${docState.cssContent}
    </style>
</head>
<body>
${workspace.innerHTML}
</body>
</html>`;
    
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAutoLog = () => {
    downloadAutoLog();
  };

  const handleClearAutoLog = () => {
    clearAutoLog();
  };

  const handleExportPDF = async (fileName: string) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = docState.htmlContent;

    tempDiv.querySelectorAll('[data-selected]').forEach(el => el.removeAttribute('data-selected'));
    tempDiv.querySelectorAll('[data-multi-selected]').forEach(el => el.removeAttribute('data-multi-selected'));
    tempDiv.querySelectorAll('[data-structure-status]').forEach(el => el.removeAttribute('data-structure-status'));

    tempDiv
      .querySelectorAll('.image-overlay, .resize-handle, .drag-handle, .text-mode-badge, .marquee, .context-menu, .page-ruler, .margin-guides')
      .forEach(el => el.remove());

    const fontLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(link => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href) && href.includes('fonts.googleapis.com'));
    const fontLinksHtml = fontLinks.map(href => `<link rel="stylesheet" href="${href}">`).join('\n');

    let customFontCss = '';
    try {
      const storedFonts = localStorage.getItem('custom_fonts');
      if (storedFonts) {
        const list = JSON.parse(storedFonts) as Array<{ name: string; dataUrl: string }>;
        customFontCss = list
          .map(font => {
            const safeName = font.name.replace(/'/g, "\\'");
            return `@font-face { font-family: '${safeName}'; src: url("${font.dataUrl}"); font-display: swap; }`;
          })
          .join('\n');
      }
    } catch {
      customFontCss = '';
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      iframe.remove();
      alert('Unable to prepare PDF print frame.');
      return;
    }

    const printOverrides = `
@media print {
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: white; }
  .page {
    margin: 0 auto !important;
    box-shadow: none !important;
    page-break-after: always;
    page-break-inside: avoid;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
}
    `;

    const baseHref = document.baseURI || window.location.href;

    // Grab SVG defs (cloud clip-path, etc.) from the main document
    const svgDefs = document.querySelector('svg > defs');
    const svgDefsHtml = svgDefs
      ? `<svg width="0" height="0" style="position:absolute">${svgDefs.outerHTML}</svg>`
      : '';

    // Unscope .editor-workspace prefixed selectors so they work in the iframe body
    const exportCss = docState.cssContent.replace(/\.editor-workspace\s+/g, '');

    doc.open();
    doc.write(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base href="${baseHref}">
  <title>${fileName}</title>
  ${fontLinksHtml}
  <style>
${customFontCss}
${exportCss}
${printOverrides}
  </style>
</head>
<body>
${svgDefsHtml}
${tempDiv.innerHTML}
</body>
</html>
    `);
    doc.close();

    const waitForImages = () => {
      const images = Array.from(doc.images);
      if (images.length === 0) return Promise.resolve();
      return Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>(resolve => {
          const done = () => {
            img.removeEventListener('load', done);
            img.removeEventListener('error', done);
            resolve();
          };
          img.addEventListener('load', done);
          img.addEventListener('error', done);
        });
      }));
    };

    const frameReady = new Promise<void>(resolve => {
      if (doc.readyState === 'complete') resolve();
      else iframe.onload = () => resolve();
    });

    const fontReady = (doc.fonts && doc.fonts.ready) ? doc.fonts.ready : Promise.resolve();
    await Promise.all([frameReady, fontReady, waitForImages()]);

    const triggerPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        window.setTimeout(() => iframe.remove(), 1000);
      }
    };

    requestAnimationFrame(() => {
      window.setTimeout(triggerPrint, 100);
    });
  };
  
  // Helper function to inline computed styles for export
  const inlineComputedStyles = (element: HTMLElement) => {
    const allElements = element.querySelectorAll('*');
    
    allElements.forEach((el) => {
        if (el instanceof HTMLElement) {
            const computed = window.getComputedStyle(el);
            const originalEl = document.querySelector(`.editor-workspace ${el.tagName.toLowerCase()}[class="${el.className}"]`) as HTMLElement;
            
            // Copy key style properties
            const propsToInline = [
                'font-family', 'font-size', 'font-weight', 'font-style',
                'color', 'background-color', 'text-align', 'line-height',
                'margin', 'padding', 'border', 'border-radius',
                'width', 'height', 'max-width', 'min-width',
                'display', 'position', 'top', 'bottom', 'left', 'right',
                'text-transform', 'letter-spacing', 'text-decoration'
            ];
            
            propsToInline.forEach(prop => {
                const value = computed.getPropertyValue(prop);
                if (value && value !== 'initial' && value !== 'normal') {
                    el.style.setProperty(prop, value);
                }
            });
            
            // Handle images specifically
            if (el.tagName === 'IMG') {
                const img = el as HTMLImageElement;
                if (originalEl) {
                    const origImg = originalEl as HTMLImageElement;
                    img.style.width = `${origImg.offsetWidth}px`;
                    img.style.height = `${origImg.offsetHeight}px`;
                }
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
            }
        }
    });
  };

  const handleExportDOCX = async (fileName: string) => {
    if (!window.html2canvas || !window.htmlDocx) {
      alert('DOCX export requires html2canvas and html-docx-js to be loaded.');
      return;
    }

    // Helper: px to pt
    const pxToPt = (px: string): string => {
      const num = parseFloat(px);
      return isNaN(num) ? px : `${Math.round(num * 0.75)}pt`;
    };

    // Render element as image using html2canvas
    const renderElementAsImage = async (el: HTMLElement): Promise<string> => {
      try {
        const scale = 2;
        const canvas = await window.html2canvas(el, {
          scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: null,
          logging: false,
          windowWidth: el.scrollWidth + 50,
          windowHeight: el.scrollHeight + 50
        });
        const imgData = canvas.toDataURL('image/png', 1.0);
        const width = Math.min(Math.round(el.offsetWidth * scale), 800);
        const height = Math.round(canvas.height * (width / canvas.width));
        return `<p style="margin: 8pt 0; text-align: center;"><img src="${imgData}" width="${width}" height="${height}" style="max-width: 100%;"></p>`;
      } catch (e) {
        console.error('Error rendering element as image:', e);
        return `<p style="margin: 8pt 0;">${el.textContent || ''}</p>`;
      }
    };

    // Check if element should be rendered as image
    const shouldRenderAsImage = (el: HTMLElement): boolean => {
      const classList = el.classList;
      const computed = window.getComputedStyle(el);
      const hasBackgroundImage = computed.backgroundImage && computed.backgroundImage !== 'none';

      if (classList.contains('tracing-line') ||
          classList.contains('writing-lines') ||
          classList.contains('toc-container')) {
        return true;
      }
      if (el.tagName === 'TABLE') return true;
      if (hasBackgroundImage) return true;
      return false;
    };

    // Get inline styles for text elements using computed styles
    const getInlineStyle = (el: HTMLElement): string => {
      const styles: string[] = [];
      const style = el.style;
      const computed = window.getComputedStyle(el);

      const color = style.color || computed.color;
      const backgroundColor = style.backgroundColor || computed.backgroundColor;
      const fontFamily = style.fontFamily || computed.fontFamily;
      const fontSize = style.fontSize || computed.fontSize;
      const fontWeight = style.fontWeight || computed.fontWeight;
      const fontStyle = style.fontStyle || computed.fontStyle;
      const textDecoration = style.textDecoration || computed.textDecoration;
      const textAlign = style.textAlign || computed.textAlign;
      const lineHeight = style.lineHeight || computed.lineHeight;
      const letterSpacing = style.letterSpacing || computed.letterSpacing;
      const borderRadius = style.borderRadius || computed.borderRadius;
      const border = style.border || computed.border;
      const paddingTop = style.paddingTop || computed.paddingTop;
      const paddingRight = style.paddingRight || computed.paddingRight;
      const paddingBottom = style.paddingBottom || computed.paddingBottom;
      const paddingLeft = style.paddingLeft || computed.paddingLeft;
      const marginTop = style.marginTop || computed.marginTop;
      const marginBottom = style.marginBottom || computed.marginBottom;

      if (color) styles.push(`color: ${color}`);
      if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        styles.push(`background-color: ${backgroundColor}`);
      }
      if (fontFamily) styles.push(`font-family: ${fontFamily}`);
      if (fontSize) styles.push(`font-size: ${pxToPt(fontSize)}`);
      if (fontWeight && fontWeight !== '400') styles.push(`font-weight: ${fontWeight}`);
      if (fontStyle && fontStyle !== 'normal') styles.push(`font-style: ${fontStyle}`);
      if (textDecoration && textDecoration !== 'none') styles.push(`text-decoration: ${textDecoration}`);
      if (textAlign && textAlign !== 'start') styles.push(`text-align: ${textAlign}`);
      if (lineHeight && lineHeight !== 'normal') styles.push(`line-height: ${lineHeight}`);
      if (letterSpacing && letterSpacing !== 'normal') styles.push(`letter-spacing: ${letterSpacing}`);
      if (borderRadius && borderRadius !== '0px') styles.push(`border-radius: ${borderRadius}`);
      if (border && border !== 'none') styles.push(`border: ${border}`);
      if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
        styles.push(`padding: ${pxToPt(paddingTop)} ${pxToPt(paddingRight)} ${pxToPt(paddingBottom)} ${pxToPt(paddingLeft)}`);
      }
      if (marginTop && marginTop !== '0px') styles.push(`margin-top: ${pxToPt(marginTop)}`);
      if (marginBottom && marginBottom !== '0px') styles.push(`margin-bottom: ${pxToPt(marginBottom)}`);

      return styles.length > 0 ? styles.join('; ') : '';
    };

    // Process element recursively
    const processElement = async (el: Node): Promise<string> => {
      if (el.nodeType === Node.TEXT_NODE) {
        return el.textContent || '';
      }
      if (!(el instanceof HTMLElement)) return '';

      const tagName = el.tagName.toLowerCase();
      if (tagName === 'style' || tagName === 'script' || tagName === 'head' || tagName === 'meta') return '';

      if (shouldRenderAsImage(el)) {
        return await renderElementAsImage(el);
      }

      // Handle images - apply filters (brightness/contrast/saturate)
      if (tagName === 'img') {
        const img = el as HTMLImageElement;
        let src = img.src || img.getAttribute('src') || '';
        if (!src) return '';

        const computed = window.getComputedStyle(img);
        const filter = img.style.filter || computed.filter || '';

        try {
          if (img.complete && img.naturalWidth > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              if (filter && filter !== 'none') {
                ctx.filter = filter;
              }
              ctx.drawImage(img, 0, 0);
              src = canvas.toDataURL('image/png');
            }
          }
        } catch (e) { }

        const width = img.offsetWidth || img.naturalWidth || 300;
        const height = img.offsetHeight || img.naturalHeight || 'auto';
        return `<p style="text-align: center; margin: 10pt 0;"><img src="${src}" width="${width}" height="${height}" style="max-width: 100%;"></p>`;
      }

      if (tagName === 'hr') {
        return `<hr style="border: none; border-top: 1.5pt solid #000; margin: 12pt 0;">`;
      }

      let childrenHtml = '';
      for (const child of Array.from(el.childNodes)) {
        childrenHtml += await processElement(child);
      }

      if (el.classList.contains('page')) {
        return childrenHtml;
      }

      if (el.classList.contains('page-footer')) {
        return `<p style="text-align: center; font-size: 10pt; margin-top: 16pt; color: #666;">${childrenHtml}</p>`;
      }

      const inlineStyle = getInlineStyle(el);
      const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';

      switch (tagName) {
        case 'h1':
          return `<h1${styleAttr}><strong>${childrenHtml}</strong></h1>`;
        case 'h2':
          return `<h2${styleAttr}><strong>${childrenHtml}</strong></h2>`;
        case 'h3':
          return `<h3${styleAttr}><strong>${childrenHtml}</strong></h3>`;
        case 'p':
          return `<p${styleAttr}>${childrenHtml}</p>`;
        case 'ul':
          return `<ul style="margin: 10pt 0 10pt 20pt;">${childrenHtml}</ul>`;
        case 'ol':
          return `<ol style="margin: 10pt 0 10pt 20pt;">${childrenHtml}</ol>`;
        case 'li':
          return `<li${styleAttr}>${childrenHtml}</li>`;
        case 'strong':
        case 'b':
          return `<b>${childrenHtml}</b>`;
        case 'em':
        case 'i':
          return `<i>${childrenHtml}</i>`;
        case 'u':
          return `<u>${childrenHtml}</u>`;
        case 'br':
          return '<br>';
        case 'span':
        case 'div':
          if (childrenHtml.trim()) {
            return `<${tagName}${styleAttr}>${childrenHtml}</${tagName}>`;
          }
          return childrenHtml;
        default:
          return childrenHtml;
      }
    };

    // Create a temporary container and render the content
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = docState.htmlContent;
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '0';
    tempContainer.style.width = '816px'; // Approx 8.5in at 96dpi
    tempContainer.style.background = 'white';
    document.body.appendChild(tempContainer);

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const images = tempContainer.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      if ((img as HTMLImageElement).complete) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));

    const pages = tempContainer.querySelectorAll('.page');
    let contentHtml = '';

    for (let i = 0; i < pages.length; i++) {
      if (i > 0) {
        contentHtml += `<br clear="all" style="page-break-before: always;">`;
      }
      contentHtml += await processElement(pages[i]);
    }

    document.body.removeChild(tempContainer);

    const htmlContent = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="ProgId" content="Word.Document">
<!--[if gte mso 9]>
<xml>
<w:WordDocument>
<w:View>Print</w:View>
<w:Zoom>100</w:Zoom>
</w:WordDocument>
</xml>
<![endif]-->
<style>
@page { size: 8.5in 11in; margin: 0.6in; }
body { font-size: 12pt; margin: 0; padding: 0; line-height: 1.5; }
h1, h2, h3, p, div, span { display: block; }
ul, ol { margin-left: 24pt; }
img { max-width: 100%; height: auto; }
.page { page-break-after: always; }
</style>
</head>
<body>
${contentHtml}
</body>
</html>`;

    const docxBlob = window.htmlDocx.asBlob(htmlContent);
    const url = URL.createObjectURL(docxBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const scrollToPage = (pageIndex: number) => {
    setCurrentPage(pageIndex);
    const editorEl = document.querySelector('.editor-workspace');
    if (editorEl) {
        const pages = editorEl.querySelectorAll('.page');
        if (pages[pageIndex]) {
            pages[pageIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
  };

  const handleScroll = () => {
      if (!editorContainerRef.current) return;
      const pages = document.querySelectorAll('.editor-workspace .page');
      
      pages.forEach((page, index) => {
          const rect = page.getBoundingClientRect();
          if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
              setCurrentPage(index);
          }
      });
  };

  // Update selection handler to capture active block
  const onSelectionChange = (state: SelectionState, block: HTMLElement | null) => {
      setSelectionState(state);
      // Only update if not null, to avoid clearing selection when clicking toolbar
      if (block) {
          setActiveBlock(block);
          
                // Automatically show frame tools if it's a shape
                const isShape = block.matches('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle');
                if (isShape || state.shape !== 'none') {
                    setShowFrameTools(true);
                }      }
  };

  // --- Structure & Navigation ---
  const handleStartSelection = (level: string) => {
      structureManualModeRef.current = true;
      setStructureManualMode(true);
      setSelectionMode({ active: true, level, selectedIds: [] });
  };

  const handleBlockSelection = (elementId: string) => {
      if (!selectionMode.active) return;
      
      setSelectionMode(prev => {
          const exists = prev.selectedIds.includes(elementId);
          if (exists) {
              return { ...prev, selectedIds: prev.selectedIds.filter(id => id !== elementId) };
          } else {
              return { ...prev, selectedIds: [...prev.selectedIds, elementId] };
          }
      });
  };

  const handleConfirmSelection = () => {
      if (!selectionMode.active || !selectionMode.level) return;

      const targetTag = selectionMode.level; // e.g., 'h1'
      const newEntries: StructureEntry[] = [];
      let domModified = false;
      const confirmedElements: HTMLElement[] = [];

      // Capture signatures BEFORE converting tags (so we match against original styles)
      const preConvertSignatures: string[] = [];
      selectionMode.selectedIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) preConvertSignatures.push(getElementSignature(el));
      });

      selectionMode.selectedIds.forEach(id => {
          const element = document.getElementById(id);
          if (!element) return;

          // 1. Convert Tag if needed
          if (element.tagName.toLowerCase() !== targetTag) {
              const newElement = document.createElement(targetTag);
              Array.from(element.attributes).forEach(attr => {
                  newElement.setAttribute(attr.name, attr.value);
              });
              newElement.innerHTML = element.innerHTML;
              element.parentNode?.replaceChild(newElement, element);
              domModified = true;
          }

          // 2. Get the live element (may have been replaced)
          const liveElement = document.getElementById(id);
          if (!liveElement) return;
          liveElement.setAttribute('data-structure-status', 'approved');
          confirmedElements.push(liveElement);

          // 3. Find page number
          const page = liveElement.closest('.page');
          const pages = document.querySelectorAll('.page');
          let pageNum = 1;
          pages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });

          newEntries.push({
              id: `manual-${id}-${Date.now()}`,
              elementId: id,
              text: liveElement.innerText.substring(0, 50),
              page: pageNum,
              type: targetTag,
              status: 'approved'
          });
      });

      if (newEntries.length > 0) {
          setStructureEntries(prev => {
              const existingIds = new Set(newEntries.map(e => e.elementId));
              const filtered = prev.filter(e => !existingIds.has(e.elementId));
              return [...filtered, ...newEntries];
          });
      }

      if (domModified || newEntries.length > 0) {
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
              updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
          }
      }

      setSelectionMode({ active: false, level: null, selectedIds: [] });

      // --- Pattern Recognition: find similar elements ---
      if (confirmedElements.length > 0 && preConvertSignatures.length > 0) {
          const workspace = document.querySelector('.editor-workspace') as HTMLElement;
          if (workspace) {
              // Use the pre-conversion signature to find elements that look like the originals
              const refSignature = preConvertSignatures[0];
              const confirmedIds = new Set(confirmedElements.map(el => el.id));

              // Find all similar elements that weren't already selected
              const similarMatches = findSimilarElements(refSignature, null, workspace)
                  .filter(m => !confirmedIds.has(m.element.id));

              if (similarMatches.length > 0) {
                  const capturedTag = targetTag;
                  setPatternModal({
                      isOpen: true,
                      actionType: `Apply ${capturedTag.toUpperCase()} to similar elements`,
                      matches: similarMatches,
                      applyStyle: (el: HTMLElement) => {
                          // Convert tag
                          if (el.tagName.toLowerCase() !== capturedTag) {
                              const newEl = document.createElement(capturedTag);
                              Array.from(el.attributes).forEach(attr => {
                                  newEl.setAttribute(attr.name, attr.value);
                              });
                              newEl.innerHTML = el.innerHTML;
                              if (!newEl.id) {
                                  newEl.id = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                              }
                              el.parentNode?.replaceChild(newEl, el);
                          }
                          // Mark as approved for structure
                          const live = document.getElementById(el.id);
                          if (live) {
                              live.setAttribute('data-structure-status', 'approved');
                              const page = live.closest('.page');
                              const pages = document.querySelectorAll('.page');
                              let pageNum = 1;
                              pages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });
                              setStructureEntries(prev => {
                                  if (prev.some(e => e.elementId === live.id)) return prev;
                                  return [...prev, {
                                      id: `pattern-${live.id}-${Date.now()}`,
                                      elementId: live.id,
                                      text: live.innerText.substring(0, 50),
                                      page: pageNum,
                                      type: capturedTag,
                                      status: 'approved' as const
                                  }];
                              });
                          }
                      }
                  });
              }
          }
      }
  };

  const handleCancelSelection = () => {
      setSelectionMode({ active: false, level: null, selectedIds: [] });
  };

  const handleNavigateToEntry = (elementId: string) => {
      const element = document.getElementById(elementId);
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Visual cue
          const originalOutline = element.style.outline;
          element.style.outline = '2px solid #a855f7'; // Purple highlight
          element.style.transition = 'outline 0.3s';
          setTimeout(() => {
              element.style.outline = originalOutline;
          }, 1500);
      }
  };

  const handleUpdateEntryStatus = (id: string, status: 'approved' | 'rejected') => {
      // 1. Update local list state for immediate UI feedback
      setStructureEntries(prev => prev.map(e => e.id === id ? { ...e, status } : e));

      // 2. Persist to DOM/HTML
      const element = document.getElementById(id);
      if (element) {
          element.setAttribute('data-structure-status', status);
          
          // --- Feature: Auto-convert detected tags on approval ---
          if (status === 'approved') {
              // Retrieve the entry to check type
              const entry = structureEntries.find(e => e.id === id);
              if (entry && entry.type.startsWith('detected-')) {
                  const targetTag = entry.type.replace('detected-', ''); // e.g. 'h1'
                  
                  // Only convert if it's not already that tag
                  if (element.tagName.toLowerCase() !== targetTag) {
                      const newElement = document.createElement(targetTag);
                      // Copy attributes (id, style, class, etc.)
                      Array.from(element.attributes).forEach(attr => {
                          newElement.setAttribute(attr.name, attr.value);
                      });
                      // Copy content
                      newElement.innerHTML = element.innerHTML;
                      
                      // Replace in DOM
                      element.parentNode?.replaceChild(newElement, element);
                  }
              }
          }

          // Trigger a save so this persistence is kept in history
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
              updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
          }
      }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <Toolbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        onFormat={handleFormat} 
        onFileUpload={handleFileUpload}
        onInsertImage={handleInsertImage}
        onExport={() => setIsExportModalOpen(true)}
        onPageSizeChange={handlePageSizeChange}
        pageFormatId={pageFormatId}
        customPageSize={customPageSize}
        onCustomPageSizeChange={handleCustomPageSizeChange}
        onUpdateStyle={handleUpdateStyle}
        onOpenTOCModal={() => setIsTOCModalOpen(true)}
        onOpenPageNumberModal={preparePageAnchors} 
        onInsertHorizontalRule={handleInsertHorizontalRule}
        onInsertTextLayer={handleInsertTextLayerMode}
        onToggleCrop={handleToggleCrop}
        onPageBreak={handlePageBreak}
        onBlockStyleUpdate={handleBlockStyleUpdate}
        showFrameTools={showFrameTools}
        onToggleFrameTools={() => setShowFrameTools(!showFrameTools)}
        selectionState={selectionState}
        isTextLayerMode={isTextLayerMode}
        fileName={docState.fileName}
        selectedImage={selectedImage}
        selectedHR={selectedHR}
        selectedFooter={selectedFooter}
        imageProperties={imageProperties}
        hrProperties={hrProperties}
        onImagePropertyChange={handleImagePropertyChange}
        onHRPropertyChange={handleHRPropertyChange}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        availableFonts={availableFonts}
        pageMargins={pageMargins}
        onMarginChange={handleMarginChange}
        showMarginGuides={showMarginGuides}
        onToggleMarginGuides={() => setShowMarginGuides(!showMarginGuides)}
        showSmartGuides={showSmartGuides}
        onToggleSmartGuides={() => setShowSmartGuides(!showSmartGuides)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onReloadFonts={handleReloadFonts}
        onAddFont={handleAddFont}
        onCaptureSelection={handleCaptureSelection}
        onOpenLogs={() => setIsAutoLogModalOpen(true)}
        onAutoMerge={() => {
          const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
          if (!workspace) return;
          const didMerge = autoMergeAll(workspace);
          if (didMerge) {
            updateDocStatePreserveScroll(workspace.innerHTML);
            setFontUploadMessage('✔ Auto Merge completato');
          } else {
            setFontUploadMessage('Nessun elemento da unire trovato');
          }
          window.setTimeout(() => setFontUploadMessage(''), 2500);
        }}
      />

      {fontUploadMessage && (
        <div className="fixed top-20 right-6 z-50 bg-black text-white text-xs font-semibold px-3 py-2 rounded shadow-lg">
          {fontUploadMessage}
        </div>
      )}
      
      <div className="app-main flex flex-1 overflow-hidden">
        <Sidebar
          isSidebarOpen={isSidebarOpen}
          pageCount={pageCount} 
          currentPage={currentPage}
          onPageSelect={scrollToPage}
          structureEntries={structureEntries}
          selectionMode={selectionMode}
          onStartSelection={handleStartSelection}
          onConfirmSelection={handleConfirmSelection}
          onCancelSelection={handleCancelSelection}
          onNavigateToEntry={handleNavigateToEntry}
          onUpdateEntryStatus={handleUpdateEntryStatus}
          aiMessages={aiMessages}
          aiInput={aiInput}
          aiLoading={aiLoading}
          hasApiKey={!!openAiApiKey}
          onAiInputChange={setAiInput}
          onAiSend={handleAiSend}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onClearStructure={() => {
            structureManualModeRef.current = true;
            structureClearCounterRef.current += 1;
            if (structureScanTimeoutRef.current) {
              window.clearTimeout(structureScanTimeoutRef.current);
              structureScanTimeoutRef.current = null;
            }
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
              workspace.querySelectorAll('[data-structure-status]').forEach(el => {
                el.removeAttribute('data-structure-status');
              });
            }
            setStructureEntries([]);
            setStructureManualMode(true);
          }}
          onResetAutoScan={() => { structureManualModeRef.current = false; setStructureManualMode(false); }}
          isManualMode={structureManualMode}
        />
        
        <div className="flex-1 relative" onScroll={handleScroll}>
            <Editor 
                htmlContent={docState.htmlContent}
                cssContent={docState.cssContent}
                onContentChange={handleContentChange}
                onSelectionChange={onSelectionChange}
                onBlockClick={(block) => {
                    setActiveBlock(block);
                }}
                onImageSelect={handleImageSelect}
                onTextLayerSelect={handleTextLayerSelect}
                onHRSelect={handleHRSelect}
                onFooterSelect={handleFooterSelect}
                selectedImage={selectedImage}
                selectedTextLayer={selectedTextLayer}
                selectedHR={selectedHR}
                selectedFooter={selectedFooter}
                containerRef={editorContainerRef}
                imageProperties={imageProperties}
                onCropComplete={handleCropComplete}
                onCancelCrop={handleCancelCrop}
                onPageBreak={handlePageBreak}
                onInsertHorizontalRule={handleInsertHorizontalRule}
                onInsertImage={handleInsertImage}
                onInsertTextLayerAt={handleInsertTextLayerAt}
                showMarginGuides={showMarginGuides}
                showSmartGuides={showSmartGuides}
                pageMargins={pageMargins}
                onMarginChange={handleMarginChange}
                selectionMode={selectionMode}
                onBlockSelection={handleBlockSelection}
                suppressSelectionRef={suppressSelectionRef}
                isTextLayerMode={isTextLayerMode}
                zoom={zoom}
                viewMode={viewMode}
                onToggleMultiSelect={handleToggleMultiSelect}
                onClearMultiSelect={handleClearMultiSelect}
                multiSelectedElements={multiSelectedElements}
                onDistributeMultiSelection={distributeMultiSelection}
                onAlignMultiSelection={alignMultiSelection}
                distributeAdjustAxis={distributeAdjustAxis}
                onStartDistributeAdjust={startDistributeAdjust}
                onEndDistributeAdjust={endDistributeAdjust}
                onCopyStyle={handleCopyStyle}
                onPasteStyle={handlePasteStyle}
                hasStyleClipboard={!!styleClipboard}
                onTocSelect={handleTocSelect}
            />
            <ZoomControls
                zoom={zoom}
                viewMode={viewMode}
                onZoomChange={handleZoomChange}
                onViewModeChange={setViewMode}
            />
        </div>
      </div>

      {tocEditorOpen && (
        <div className="fixed right-4 top-1/3 z-40 bg-white rounded-lg shadow-2xl border border-gray-200 w-64 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-violet-50 border-b border-violet-200">
            <span className="text-xs font-bold text-violet-800 uppercase">Edit TOC</span>
            <button onClick={handleTocEditorClose} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
          </div>
          <div className="p-3 space-y-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">Font Size ({tocSettings.fontSize}px)</label>
              <input type="range" min={8} max={18} value={tocSettings.fontSize} onChange={(e) => applyTocSettings({...tocSettings, fontSize: Number(e.target.value)})} className="w-full accent-violet-600 h-1.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">Font</label>
              <select value={tocSettings.fontFamily} onChange={(e) => applyTocSettings({...tocSettings, fontFamily: e.target.value})} className="w-full border border-gray-300 rounded px-2 py-1 text-xs mt-0.5">
                <option value="inherit">Document Font</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="Georgia, serif">Georgia</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">H2 Indent ({tocSettings.h2Indent}px)</label>
              <input type="range" min={0} max={60} value={tocSettings.h2Indent} onChange={(e) => applyTocSettings({...tocSettings, h2Indent: Number(e.target.value)})} className="w-full accent-violet-600 h-1.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">H3 Indent ({tocSettings.h3Indent}px)</label>
              <input type="range" min={0} max={80} value={tocSettings.h3Indent} onChange={(e) => applyTocSettings({...tocSettings, h3Indent: Number(e.target.value)})} className="w-full accent-violet-600 h-1.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase">Line Height ({tocSettings.lineHeight})</label>
              <input type="range" min={1.0} max={2.5} step={0.1} value={tocSettings.lineHeight} onChange={(e) => applyTocSettings({...tocSettings, lineHeight: Number(e.target.value)})} className="w-full accent-violet-600 h-1.5" />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={tocSettings.showLeader} onChange={(e) => applyTocSettings({...tocSettings, showLeader: e.target.checked})} className="rounded text-violet-600" />
              Dotted leader
            </label>
          </div>
        </div>
      )}

      <TOCModal 
        isOpen={isTOCModalOpen} 
        onClose={() => setIsTOCModalOpen(false)} 
        onInsert={handleInsertTOC} 
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        initialApiKey={openAiApiKey}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSaveApiKey}
      />

      <AutoLogModal
        isOpen={isAutoLogModalOpen}
        onClose={() => setIsAutoLogModalOpen(false)}
        onDownload={handleDownloadAutoLog}
        onClear={handleClearAutoLog}
      />

      <PageNumberModal
        isOpen={isPageNumberModalOpen}
        onClose={() => setIsPageNumberModalOpen(false)}
        onApply={handleInsertPageNumbers}
        onPreview={handlePageNumberPreview}
        anchors={pageAnchors}
      />

      <PatternModal
        isOpen={patternModal.isOpen}
        actionType={patternModal.actionType}
        matches={patternModal.matches}
        onConfirm={handlePatternConfirmApp}
        onCancel={handlePatternCancelApp}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        currentFileName={docState.fileName}
        onClose={() => setIsExportModalOpen(false)}
        onExportPDF={handleExportPDF}
        onExportHTML={handleExportHTML}
        onExportDOCX={handleExportDOCX}
      />
    </div>
  );
};

export default App;
