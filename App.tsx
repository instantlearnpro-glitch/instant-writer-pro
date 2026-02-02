import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { reflowPages } from './utils/pagination';

const App: React.FC = () => {
  const [docState, setDocState] = useState<DocumentState>({
    htmlContent: DEFAULT_HTML,
    cssContent: DEFAULT_CSS,
    fileName: 'untitled_mission.html'
  });

  const [availableFonts, setAvailableFonts] = useState<FontDefinition[]>(FONTS.map(f => ({ ...f, available: true })));
  const [structureEntries, setStructureEntries] = useState<StructureEntry[]>([]);
  
  // Manual Structure Selection State
  const [selectionMode, setSelectionMode] = useState<{ active: boolean; level: string | null; selectedIds: string[] }>({
      active: false,
      level: null,
      selectedIds: []
  });

  // Load available system fonts on mount and when web fonts are ready
  useEffect(() => {
      const loadFonts = async () => {
          const fonts = await getSystemFonts();
          setAvailableFonts(fonts);
      };
      
      loadFonts();

      // Re-check when document fonts are fully loaded (handles web font latency)
      document.fonts.ready.then(() => {
          loadFonts();
      });
  }, []);

  // History State
  const [history, setHistory] = useState<DocumentState[]>([{ 
    htmlContent: DEFAULT_HTML,
    cssContent: DEFAULT_CSS,
    fileName: 'untitled_mission.html'
  }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [selectionState, setSelectionState] = useState<SelectionState>({
    bold: false,
    italic: false,
    underline: false,
    blockType: 'p',
    alignLeft: false,
    alignCenter: false,
    alignRight: false,
    fontName: 'sans-serif',
    fontSize: '3',
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

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isTOCModalOpen, setIsTOCModalOpen] = useState(false);
  const [isPageNumberModalOpen, setIsPageNumberModalOpen] = useState(false);
  const [pageAnchors, setPageAnchors] = useState<PageAnchor[]>([]);
  
  const [showFrameTools, setShowFrameTools] = useState(false);
  
  // Zoom and View Mode
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<'single' | 'double'>('single');
  
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Pattern detection for image/style changes
  const patternTrackerRef = useRef(new PatternTracker());
  const [patternModal, setPatternModal] = useState<{
    isOpen: boolean;
    actionType: string;
    matches: PatternMatch[];
    applyStyle?: (el: HTMLElement) => void;
  }>({ isOpen: false, actionType: '', matches: [] });

  // --- HISTORY MANAGEMENT ---

  // Unified function to update state and manage history
  const updateDocState = (newState: DocumentState, saveToHistory: boolean = false) => {
      setDocState(newState);

      if (saveToHistory) {
          // Clear any pending debounce since we are forcing a save
          if (debounceTimeoutRef.current) {
              clearTimeout(debounceTimeoutRef.current);
          }

          const newHistory = history.slice(0, historyIndex + 1);
          newHistory.push(newState);
          
          // Optional: Limit history size
          if (newHistory.length > 50) newHistory.shift();

          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
      }
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setDocState(history[newIndex]);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setDocState(history[newIndex]);
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
      const newState = { ...docState, htmlContent: html };
      setDocState(newState); // Immediate update for UI

      // Debounce history save
      if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
          setHistory(prevHistory => {
              const newHistory = prevHistory.slice(0, historyIndex + 1);
              // Only push if different from last saved state
              if (newHistory[newHistory.length - 1].htmlContent !== html) {
                  newHistory.push(newState);
                  if (newHistory.length > 50) newHistory.shift();
                  setHistoryIndex(newHistory.length - 1);
                  return newHistory;
              }
              return prevHistory;
          });
      }, 1000); // Wait 1s after typing stops
  };


  // Parse HTML to count pages when content changes
  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(docState.htmlContent, 'text/html');
    const pages = doc.querySelectorAll('.page');
    setPageCount(pages.length || 1);
  }, [docState.htmlContent]);

  // Scan headings (H1/H2/H3) for Structure panel
  useEffect(() => {
    const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
    if (!workspace) return;

    const { entries, modifiedHtml } = scanStructure(workspace);

    if (modifiedHtml && modifiedHtml !== docState.htmlContent) {
      updateDocState({ ...docState, htmlContent: modifiedHtml }, false);
    }

    setStructureEntries(entries);
  }, [docState.htmlContent]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
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
                    let css = tag.innerHTML.replace(/!important/g, '');
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

                const finalCss = extractedCss ? `${DEFAULT_CSS}\n/* Imported Styles */\n${extractedCss}` : DEFAULT_CSS;

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
          setSelectionState(prev => ({
              ...prev,
              fontSize: '3', 
              fontName: computed.fontFamily.replace(/['"]/g, ''),
              bold: computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 700,
              italic: computed.fontStyle === 'italic',
              underline: computed.textDecoration.includes('underline'),
              alignLeft: computed.textAlign === 'left',
              alignCenter: computed.textAlign === 'center',
              alignRight: computed.textAlign === 'right'
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

    // --- Footer Global Styling ---
    if (selectedFooter) {
        const workspace = document.querySelector('.editor-workspace');
        if (!workspace) return;
        const footers = workspace.querySelectorAll('.page-footer');
        
        footers.forEach((footerEl) => {
            const footer = footerEl as HTMLElement;
            if (command === 'fontSize') {
                const sizes = { '1': '8pt', '2': '10pt', '3': '12pt', '4': '14pt', '5': '18pt', '6': '24pt', '7': '36pt' };
                // @ts-ignore
                const pt = sizes[value] || '12pt';
                footer.style.fontSize = pt;
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
            } else if (command === 'foreColor') {
                footer.style.color = value || '#000000';
            }
        });

        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        return;
    }

    // 1. Check for Shape Alignment FIRST
    if (command === 'justifyLeft' || command === 'justifyCenter' || command === 'justifyRight') {
        // Use direct DOM check to find if we are inside a shape
        const selection = window.getSelection();
        let shapeContainer: HTMLElement | null = null;

        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentElement!; // Fix text node
            
            shapeContainer = (node as HTMLElement).closest('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle');
        }

        // If we found a shape container, move THE CONTAINER, not the text
        if (shapeContainer) {
            // CRITICAL: A block must have width < 100% to be aligned via margins.
            // If it's a full-width block (default div), margins do nothing visible.
            // We force fit-content if no specific width is set, to allow movement.
            if (!shapeContainer.style.width || shapeContainer.style.width === '100%') {
                shapeContainer.style.width = 'fit-content';
            }
            shapeContainer.style.display = 'block'; 

            // Reset margins first
            shapeContainer.style.marginLeft = '';
            shapeContainer.style.marginRight = '';

            if (command === 'justifyLeft') {
                shapeContainer.style.setProperty('margin-left', '0', 'important');
                shapeContainer.style.setProperty('margin-right', 'auto', 'important');
            } else if (command === 'justifyCenter') {
                shapeContainer.style.setProperty('margin-left', 'auto', 'important');
                shapeContainer.style.setProperty('margin-right', 'auto', 'important');
            } else if (command === 'justifyRight') {
                shapeContainer.style.setProperty('margin-left', 'auto', 'important');
                shapeContainer.style.setProperty('margin-right', '0', 'important');
            }
            
            // Update state manually since we bypassed execCommand
            setSelectionState(prev => ({
                ...prev,
                alignLeft: command === 'justifyLeft',
                alignCenter: command === 'justifyCenter',
                alignRight: command === 'justifyRight'
            }));
            
            // Force save history for alignment change
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
            }
            
            return;
        }
    }

    // 2. Handle formatBlock for divs with special classes
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
          const isRangeValid = range && 
                               !range.collapsed && 
                               (document.contains(range.commonAncestorContainer) || (contentRef.current && contentRef.current.contains(range.commonAncestorContainer)));

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

      // RESOLVE TARGET: If applying shape properties, look for the shape container
      const isShapeProperty = styles.shape || styles.borderColor || styles.backgroundColor || styles.borderWidth || styles.borderStyle || styles.padding;
      
      let targetBlock = currentBlock;
      let isShape = currentBlock.matches('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle');

      if (isShapeProperty && !isShape) {
          // Try to find a parent shape
          const parentShape = currentBlock.closest('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle');
          if (parentShape) {
              targetBlock = parentShape as HTMLElement;
              isShape = true;
          }
      }

      if (isShapeProperty && !isShape) {
          // Exception: If we are just aligning text (textAlign), that's allowed on paragraphs.
          // But if we are setting borders/backgrounds/shapes, abort if it's not a shape.
          // This prevents "Page Rectangle" layout breakage.
          if (!styles.textAlign && !styles.blockType && !styles.fontSize && !styles.fontName) {
             return;
          }
      }

      Object.entries(styles).forEach(([key, value]) => {
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
             const newHistory = history.slice(0, historyIndex + 1);
             const newState = { ...docState, htmlContent: workspace.innerHTML };
             newHistory.push(newState);
             setHistory(newHistory);
             setHistoryIndex(newHistory.length - 1);
             setDocState(newState);
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
      const currentPage = startNode?.closest('.page');

      if (!currentPage) return;

      const newPage = document.createElement('div');
      newPage.className = 'page';
      
      const marker = document.createElement('span');
      marker.id = 'page-break-marker-' + Date.now();
      range.insertNode(marker);

      const blockParent = marker.closest('p, h1, h2, h3, div:not(.page)');
      
      if (blockParent && blockParent.parentElement === currentPage) {
           let nextSibling = blockParent.nextSibling;
           const nodesToMove = [];
           while (nextSibling) {
               nodesToMove.push(nextSibling);
               nextSibling = nextSibling.nextSibling;
           }
           
           nodesToMove.forEach(n => newPage.appendChild(n));
           currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
           marker.remove();
      } else {
           currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
           marker.remove();
      }

      const rangeNew = document.createRange();
      rangeNew.setStart(newPage, 0);
      rangeNew.collapse(true);
      selection.removeAllRanges();
      selection.addRange(rangeNew);
      
      // Page break is a significant structural change
      const workspace = document.querySelector('.editor-workspace');
      if (workspace) {
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

      let tocHtml = `
      <div class="toc-container toc-style-${settings.style}" contenteditable="false">
          <div class="toc-title">Table of Contents</div>
          <ul class="toc-list">
      `;

      tocEntries.forEach(entry => {
          tocHtml += `
            <li class="toc-item toc-${entry.level}">
                <a href="#${entry.id}" onclick="const el = document.getElementById('${entry.id}'); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return false;">
                    ${entry.text}
                </a>
                <span class="toc-page">${entry.page}</span>
            </li>
          `;
      });

      tocHtml += `</ul></div><br/>`;

      document.execCommand('insertHTML', false, tocHtml);
      setIsTOCModalOpen(false);
      // History saved by content change debounce
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
      const workspace = document.querySelector('.editor-workspace');
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
    padding: ${margins.top}in ${margins.right}in ${margins.bottom}in ${margins.left}in !important;
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
             const newHistory = history.slice(0, historyIndex + 1);
             const newState = { ...docState, htmlContent: workspace.innerHTML };
             newHistory.push(newState);
             setHistory(newHistory);
             setHistoryIndex(newHistory.length - 1);
             setDocState(newState);
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
             const newHistory = history.slice(0, historyIndex + 1);
             const newState = { ...docState, htmlContent: workspace.innerHTML };
             newHistory.push(newState);
             setHistory(newHistory);
             setHistoryIndex(newHistory.length - 1);
             setDocState(newState);
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

  const handleSave = () => {
    const workspace = document.querySelector('.editor-workspace');
    if (workspace) {
        workspace.querySelectorAll('img[data-selected]').forEach(img => {
            img.removeAttribute('data-selected');
        });
        workspace.querySelectorAll('hr[data-selected]').forEach(hr => {
            hr.removeAttribute('data-selected');
        });
    }

    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${docState.fileName}</title>
    <style>
        ${docState.cssContent}
    </style>
</head>
<body>
    ${workspace?.innerHTML || ''}
</body>
</html>`;
    
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docState.fileName;
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

      selectionMode.selectedIds.forEach(id => {
          const element = document.getElementById(id);
          if (element) {
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

              const updatedElement = document.getElementById(id);
              if (updatedElement) {
                updatedElement.setAttribute('data-structure-status', 'approved');
              }

              // 2. Add to Structure List (avoid duplicates)
              if (!structureEntries.some(e => e.id === id)) {
                  // Find page number (approximate)
                  const page = element.closest('.page');
                  const pages = document.querySelectorAll('.page');
                  let pageNum = 1;
                  pages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });

                  newEntries.push({
                      id: id,
                      elementId: id, // ID persists even if tag changes if we copied attrs
                      text: element.innerText.substring(0, 50),
                      page: pageNum,
                      type: targetTag,
                      status: 'approved'
                  });
              }
          }
      });

      if (newEntries.length > 0) {
          setStructureEntries(prev => [...prev, ...newEntries]);
      }

      if (domModified || newEntries.length > 0) {
          const workspace = document.querySelector('.editor-workspace');
          if (workspace) {
              updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
          }
      }

      setSelectionMode({ active: false, level: null, selectedIds: [] });
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
        onSave={handleSave}
        onPageSizeChange={handlePageSizeChange}
        pageFormatId={pageFormatId}
        customPageSize={customPageSize}
        onCustomPageSizeChange={handleCustomPageSizeChange}
        onUpdateStyle={handleUpdateStyle}
        onOpenTOCModal={() => setIsTOCModalOpen(true)}
        onOpenPageNumberModal={preparePageAnchors} 
        onInsertHorizontalRule={handleInsertHorizontalRule}
        onToggleCrop={handleToggleCrop}
        onPageBreak={handlePageBreak}
        onBlockStyleUpdate={handleBlockStyleUpdate}
        showFrameTools={showFrameTools}
        onToggleFrameTools={() => setShowFrameTools(!showFrameTools)}
        selectionState={selectionState}
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
      />
      
      <div className="flex flex-1 overflow-hidden">
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
        />
        
        <div className="flex-1 relative" onScroll={handleScroll}>
            <Editor 
                htmlContent={docState.htmlContent}
                cssContent={docState.cssContent}
                onContentChange={handleContentChange}
                onSelectionChange={onSelectionChange}
                onBlockClick={(block) => setActiveBlock(block)}
                onImageSelect={handleImageSelect}
                onHRSelect={handleHRSelect}
                onFooterSelect={handleFooterSelect}
                selectedImage={selectedImage}
                selectedHR={selectedHR}
                selectedFooter={selectedFooter}
                containerRef={editorContainerRef}
                imageProperties={imageProperties}
                onCropComplete={handleCropComplete}
                onCancelCrop={handleCancelCrop}
                onPageBreak={handlePageBreak}
                onInsertHorizontalRule={handleInsertHorizontalRule}
                onInsertImage={handleInsertImage}
                showMarginGuides={showMarginGuides}
                pageMargins={pageMargins}
                onMarginChange={handleMarginChange}
                selectionMode={selectionMode}
                onBlockSelection={handleBlockSelection}
                zoom={zoom}
                viewMode={viewMode}
            />
            <ZoomControls
                zoom={zoom}
                viewMode={viewMode}
                onZoomChange={setZoom}
                onViewModeChange={setViewMode}
            />
        </div>
      </div>

      <TOCModal 
        isOpen={isTOCModalOpen} 
        onClose={() => setIsTOCModalOpen(false)} 
        onInsert={handleInsertTOC} 
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
    </div>
  );
};

export default App;
