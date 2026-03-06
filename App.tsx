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
import ExportModal from './components/ExportModal';
import SettingsModal from './components/SettingsModal';
import AutoLogModal from './components/AutoLogModal';
import { ensureContentIsPaginated, reflowPages, reflowPagesUntilStable } from './utils/pagination';
import { initAutoLog, downloadAutoLog, clearAutoLog } from './utils/autoLog';
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, convertInchesToTwip, HeadingLevel, PageBreak } from 'docx';
import { saveAs } from 'file-saver';

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

// Helper: standard conversion (96 DPI)
const pxToPt = (px: string): string => {
    const num = parseFloat(px);
    return isNaN(num) ? px : `${Math.round(num * 0.75)}pt`;
};

const mapFontSizeToCommandValue = (fontSizeStr: string) => {
    // execCommand fontSize expects 1-7, but we are moving away from it.
    // However, if it's called, we just return the raw string or rounded number.
    const num = parseFloat(fontSizeStr);
    if (isNaN(num)) return fontSizeStr;
    return String(Math.max(1, Math.round(num)));
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

const LAYOUT_MARKER_START = '/* SPYWRITER_LAYOUT_OVERRIDE_START */';
const LAYOUT_MARKER_END = '/* SPYWRITER_LAYOUT_OVERRIDE_END */';

const applyLayoutOverride = (
    cssContent: string,
    width: string,
    height: string,
    margins: { top: number; bottom: number; left: number; right: number }
) => {
    const newCssBlock = `
${LAYOUT_MARKER_START}
@page {
    size: ${width} ${height};
    margin: 0; /* Use padding on .page instead for better control */
}
.editor-workspace .page {
    width: ${width} !important;
    height: ${height} !important;
    min-height: ${height} !important;
    max-height: ${height} !important;
    padding: calc(${margins.top}in + var(--header-reserve, 0in)) ${margins.right}in calc(${margins.bottom}in + var(--footer-reserve, 0in)) ${margins.left}in !important;
    overflow: hidden !important;
}
${LAYOUT_MARKER_END}
`;

    const regex = new RegExp(`\\/\\* SPYWRITER_LAYOUT_OVERRIDE_START \\\*\\/[\\s\\S]*?\\/\\* SPYWRITER_LAYOUT_OVERRIDE_END \\\*\\/`, 'g');
    if (regex.test(cssContent)) {
        return cssContent.replace(regex, newCssBlock.trim());
    }
    return `${cssContent}\n${newCssBlock.trim()}`.trim();
};

const normalizeSizeValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
    return trimmed;
};

const PAGE_SIZE_KEYWORDS: Record<string, { width: string; height: string }> = {
    letter: { width: '8.5in', height: '11in' },
    legal: { width: '8.5in', height: '14in' },
    tabloid: { width: '11in', height: '17in' },
    a4: { width: '210mm', height: '297mm' },
    a5: { width: '148mm', height: '210mm' }
};

const parsePageSize = (rawValue: string) => {
    const normalized = rawValue.trim().toLowerCase();
    if (!normalized) return null;

    const tokens = normalized.split(/\s+/).filter(Boolean);
    const keyword = tokens.find(token => PAGE_SIZE_KEYWORDS[token]);
    const isLandscape = tokens.includes('landscape');
    const isPortrait = tokens.includes('portrait');

    if (keyword) {
        const size = PAGE_SIZE_KEYWORDS[keyword];
        if (isLandscape) return { width: size.height, height: size.width };
        if (isPortrait) return size;
        return size;
    }

    if (tokens.length >= 2) {
        const width = normalizeSizeValue(tokens[0]);
        const height = normalizeSizeValue(tokens[1]);
        if (width && height) return { width, height };
    }

    return null;
};

const detectPageSizeFromCss = (css: string) => {
    // Use the LAST @page rule with a size property — the layout override comes after
    // the base DEFAULT_CSS, so the last one is the user's actual page size.
    const pageMatches = [...css.matchAll(/@page\s*{[^}]*size\s*:\s*([^;]+);/gi)];
    if (pageMatches.length > 0) {
        const lastMatch = pageMatches[pageMatches.length - 1];
        const parsed = parsePageSize(lastMatch[1]);
        if (parsed) return parsed;
    }

    const pageBlockMatch = css.match(/\.page\s*{[^}]*}/i);
    if (pageBlockMatch) {
        const block = pageBlockMatch[0];
        const widthMatch = block.match(/width\s*:\s*([^;]+);/i);
        const heightMatch = block.match(/height\s*:\s*([^;]+);/i);
        if (widthMatch && heightMatch) {
            const width = normalizeSizeValue(widthMatch[1]);
            const height = normalizeSizeValue(heightMatch[1]);
            if (width && height) return { width, height };
        }
    }

    return null;
};

const detectPageSizeFromElement = (pageEl: HTMLElement | null) => {
    if (!pageEl) return null;
    const width = pageEl.style.width ? normalizeSizeValue(pageEl.style.width) : '';
    const height = pageEl.style.height ? normalizeSizeValue(pageEl.style.height) : '';
    if (width && height) return { width, height };
    return null;
};

const scopeImportedCss = (css: string, scopeSelector = '.editor-workspace') => {
    if (!css.trim()) return '';
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks: string[] = [];
    let start = 0;
    let depth = 0;
    for (let i = 0; i < withoutComments.length; i += 1) {
        const ch = withoutComments[i];
        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                const block = withoutComments.slice(start, i + 1).trim();
                if (block) blocks.push(block);
                start = i + 1;
            }
        }
    }

    const baseScope = `${scopeSelector} .page`;
    const prefixSelector = (selector: string) => {
        const trimmed = selector.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith(baseScope) || trimmed.startsWith(scopeSelector)) return trimmed;
        if (trimmed.startsWith(':root')) return scopeSelector;
        if (/^(html|body)\b/.test(trimmed)) {
            return trimmed.replace(/^(html|body)\b/, baseScope);
        }
        if (trimmed.startsWith('.page')) return `${scopeSelector} ${trimmed}`;
        if (trimmed.startsWith('*')) return `${baseScope} ${trimmed}`;
        if (trimmed.startsWith(':')) return `${baseScope}${trimmed}`;
        return `${baseScope} ${trimmed}`;
    };

    const scopedBlocks = blocks.map(block => {
        if (block.startsWith('@font-face') || block.startsWith('@keyframes')) return block;
        if (block.startsWith('@page')) return '';
        if (block.startsWith('@import')) return block;
        if (block.startsWith('@media') || block.startsWith('@supports') || block.startsWith('@layer')) {
            const open = block.indexOf('{');
            const head = block.slice(0, open + 1);
            const inner = block.slice(open + 1, -1);
            const scopedInner = scopeImportedCss(inner, scopeSelector);
            return `${head}${scopedInner}}`;
        }

        const open = block.indexOf('{');
        if (open === -1) return block;
        const selectors = block.slice(0, open).trim();
        let body = block.slice(open + 1, -1).trim();
        const scopedSelectors = selectors
            .split(',')
            .map(prefixSelector)
            .filter(Boolean)
            .join(', ');
        if (!scopedSelectors) return '';

        // If the imported CSS targets the page container, strip out fixed dimensions
        // because we want our `applyLayoutOverride` to control the physical page size.
        if (scopedSelectors.includes('.page')) {
            body = body.replace(/width\s*:\s*[^;]+;?/gi, '')
                .replace(/height\s*:\s*[^;]+;?/gi, '')
                .replace(/min-height\s*:\s*[^;]+;?/gi, '')
                .replace(/max-height\s*:\s*[^;]+;?/gi, '');
        }

        return `${scopedSelectors} { ${body} }`;
    });

    return scopedBlocks.filter(Boolean).join('\n');
};

const unwrapSingleContainer = (page: HTMLElement) => {
    if (page.children.length !== 1) return;
    const child = page.children[0] as HTMLElement;
    if (!child || child.classList.contains('page-footer')) return;
    if (child.classList.contains('page')) return;
    if (child.children.length === 0) return;

    // Don't unwrap if the wrapper carries meaningful styles (font, border, bg, padding, etc.)
    const cs = window.getComputedStyle(child);
    const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0
        || parseFloat(cs.borderLeftWidth) > 0 || parseFloat(cs.borderRightWidth) > 0;
    const hasPadding = parseFloat(cs.paddingTop) > 4 || parseFloat(cs.paddingBottom) > 4
        || parseFloat(cs.paddingLeft) > 4 || parseFloat(cs.paddingRight) > 4;
    const hasFont = child.style.fontFamily && child.style.fontFamily.trim() !== '';
    const hasClass = child.className && child.className.trim() !== '';

    if (hasBg || hasBorder || hasPadding || hasFont || hasClass) {
        return; // Preserve styled wrapper
    }

    while (child.firstChild) {
        page.insertBefore(child.firstChild, child);
    }
    child.remove();
};


const fixClippedContainers = (page: HTMLElement) => {
    const candidates = page.querySelectorAll('div, section, article, main, ul, ol');
    candidates.forEach(node => {
        const el = node as HTMLElement;
        if (!el.isConnected) return;
        if (el.classList.contains('page')) return;
        if (el.classList.contains('page-footer')) return;

        // Skip styled containers — they likely have intentional overflow control
        const computed = window.getComputedStyle(el);
        const hasBg = computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'transparent';
        const hasBorder = parseFloat(computed.borderTopWidth) > 0 || parseFloat(computed.borderLeftWidth) > 0;
        if (hasBg || hasBorder) return;
        if (el.classList.contains('mission-box') || el.classList.contains('shape-rectangle')
            || el.classList.contains('toc-container')) return;

        const overflowY = computed.overflowY || computed.overflow;
        const overflowX = computed.overflowX || computed.overflow;
        const isClipping = ['hidden', 'clip', 'scroll', 'auto'].includes(overflowY)
            || ['hidden', 'clip', 'scroll', 'auto'].includes(overflowX);

        if (!isClipping) return;

        if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
            el.style.overflow = 'visible';
            el.style.overflowX = 'visible';
            el.style.overflowY = 'visible';
            el.style.height = 'auto';
            el.style.maxHeight = 'none';
        }
    });
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
        fontSize: mapFontSizeToCommandValue(String(fontSizePx)),
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

    // Manual Structure Selection State
    const [selectionMode, setSelectionMode] = useState<{ active: boolean; level: string | null; selectedIds: string[] }>({
        active: false,
        level: null,
        selectedIds: []
    });
    const [autoStructureEnabled, setAutoStructureEnabled] = useState(false);
    const [autoStructureSuggested, setAutoStructureSuggested] = useState(false);
    const [autoStructureSuggestion, setAutoStructureSuggestion] = useState<{ level: 'h1' | 'h2' | 'h3'; signature: string } | null>(null);
    const [manualHeadingCounts, setManualHeadingCounts] = useState<{ h1: number; h2: number; h3: number }>({
        h1: 0,
        h2: 0,
        h3: 0
    });
    const [manualHeadingSignatures, setManualHeadingSignatures] = useState<{ h1?: string; h2?: string; h3?: string }>({});
    const [savedHeadingStyles, setSavedHeadingStyles] = useState<{
        h1?: Record<string, string>;
        h2?: Record<string, string>;
        h3?: Record<string, string>;
        p?: Record<string, string>;
        blockquote?: Record<string, string>;
        pre?: Record<string, string>;
    }>({});
    const savedHeadingStylesRef = useRef(savedHeadingStyles);

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
    const marginReflowTimeoutRef = useRef<number | null>(null);
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
    const activeBlockRef = useRef<HTMLElement | null>(null);

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
    const [pageMargins, setPageMargins] = useState<{ top: number, bottom: number, left: number, right: number }>({ top: 0.5, bottom: 0.5, left: 0.45, right: 0.5 });
    const [showMarginGuides, setShowMarginGuides] = useState(false);
    const [showSmartGuides, setShowSmartGuides] = useState(false);

    const [pageCount, setPageCount] = useState(0);
    const [currentPage, setCurrentPage] = useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const [isTOCModalOpen, setIsTOCModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isAutoLogModalOpen, setIsAutoLogModalOpen] = useState(false);
    const [fontUploadMessage, setFontUploadMessage] = useState('');
    const [isPageNumberModalOpen, setIsPageNumberModalOpen] = useState(false);
    const [pageAnchors, setPageAnchors] = useState<PageAnchor[]>([]);

    const [showFrameTools, setShowFrameTools] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Zoom and View Mode
    const [zoom, setZoom] = useState(100);
    const [viewMode, setViewMode] = useState<'single' | 'double'>('single');

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
        // Use functional update to preserve the LATEST cssContent.
        // Without this, the stale docState closure overwrites cssContent
        // (e.g. reverts 8.5x11 back to 6x9 after a format change).
        setDocState(prev => {
            const newState = { ...prev, htmlContent: html };
            // Debounce history save
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
            debounceTimeoutRef.current = setTimeout(() => {
                pushHistoryState(newState, { skipIfSameHtml: html });
            }, 1000);
            return newState;
        });
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


    // Parse HTML to count pages when content changes (for initial load / state-driven updates)
    useEffect(() => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(docState.htmlContent, 'text/html');
        const pages = doc.querySelectorAll('.page');
        setPageCount(pages.length || 1);
    }, [docState.htmlContent]);

    // MutationObserver: keep pageCount in sync with the live DOM during reflow
    // (reflowPages modifies the DOM directly without always triggering htmlContent update)
    useEffect(() => {
        let rafId: number | null = null;
        const syncCount = () => {
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                const count = workspace.querySelectorAll(':scope > .page').length;
                if (count > 0) setPageCount(count);
            }
        };
        const observer = new MutationObserver(() => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(syncCount);
        });
        const workspace = document.querySelector('.editor-workspace');
        if (workspace) {
            observer.observe(workspace, { childList: true, subtree: false });
        }
        return () => {
            observer.disconnect();
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []); // mount-time only — workspace element doesn't change

    const runStructureScan = () => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (!workspace) return;

        const { entries, modifiedHtml } = scanStructure(workspace);

        if (modifiedHtml && modifiedHtml !== latestDocStateRef.current.htmlContent) {
            updateDocState({ ...latestDocStateRef.current, htmlContent: modifiedHtml }, false);
        }

        setStructureEntries(entries);
    };

    useEffect(() => {
        if (!autoStructureEnabled) return;
        if (!isSidebarOpen && !selectionMode.active) return;

        if (structureScanTimeoutRef.current) {
            window.clearTimeout(structureScanTimeoutRef.current);
        }

        structureScanTimeoutRef.current = window.setTimeout(() => {
            runStructureScan();
        }, 350);

        return () => {
            if (structureScanTimeoutRef.current) {
                window.clearTimeout(structureScanTimeoutRef.current);
                structureScanTimeoutRef.current = null;
            }
        };
    }, [docState.htmlContent, isSidebarOpen, selectionMode.active, autoStructureEnabled]);

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
            // 3. HTML Handling with "Smart Asset Linking"

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

            // B. Load any companion CSS files: filename -> CSS text
            const cssMap = new Map<string, string>();
            const cssFiles = files.filter(f => f.name.toLowerCase().endsWith('.css') || f.type === 'text/css');

            await Promise.all(cssFiles.map(file => new Promise<void>((resolve) => {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    if (evt.target?.result) {
                        cssMap.set(file.name, String(evt.target.result));
                    }
                    resolve();
                };
                reader.readAsText(file);
            })));

            // C. Read and parse HTML
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target?.result as string;
                if (text) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');

                    // Extract and Clean CSS (inline <style>)
                    const styleTags = doc.querySelectorAll('style');
                    let inlineCss = '';
                    styleTags.forEach(tag => {
                        const css = tag.innerHTML;
                        inlineCss += css + '\n';
                        tag.remove();
                    });

                    // Extract linked CSS <link rel="stylesheet">
                    const linkTags = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
                    let linkedCss = '';
                    linkTags.forEach(link => {
                        const href = link.getAttribute('href') || '';
                        const rawFilename = href.split(/[\\/]/).pop();
                        const decodedFilename = rawFilename ? decodeURIComponent(rawFilename) : '';

                        if (decodedFilename && cssMap.has(decodedFilename)) {
                            linkedCss += (cssMap.get(decodedFilename) || '') + '\n';
                            link.remove();
                            return;
                        }

                        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
                            linkedCss += `@import url("${href}");\n`;
                            link.remove();
                        }
                    });

                    // D. Auto-link Images
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

                    // E. Sanitize fixed widths that cause margin overflow
                    // Only target plain layout containers — skip styled boxes with borders/backgrounds
                    doc.body.querySelectorAll('*').forEach(el => {
                        const htmlEl = el as HTMLElement;

                        // Skip elements that look like intentionally styled boxes
                        const isStyledBox = htmlEl.style.border || htmlEl.style.borderWidth
                            || htmlEl.style.backgroundColor || htmlEl.style.background
                            || htmlEl.classList.contains('mission-box')
                            || htmlEl.classList.contains('shape-rectangle')
                            || htmlEl.classList.contains('toc-container');

                        if (!isStyledBox && htmlEl.style.width && htmlEl.style.width.includes('px')) {
                            const w = parseFloat(htmlEl.style.width);
                            if (w > 700) { // Only strip very large widths that would overflow the page
                                htmlEl.style.maxWidth = '100%';
                                htmlEl.style.width = 'auto';
                            }
                        }

                        // Sanitize whiteSpace only on plain text containers, not preformatted blocks
                        if (htmlEl.style.whiteSpace === 'nowrap') {
                            htmlEl.style.whiteSpace = 'normal';
                        }
                        // Keep 'pre' whiteSpace — it's intentional for code blocks / preformatted text

                        // Remove hardcoded min-widths on text spans which prevent wrapping
                        if (htmlEl.style.minWidth && (htmlEl.tagName === 'SPAN')) {
                            htmlEl.style.minWidth = '';
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

                    const rawImportedCss = `${linkedCss}\n${inlineCss}`.trim();
                    const detectedSize = detectPageSizeFromElement(tempDiv.querySelector('.page'))
                        || detectPageSizeFromCss(rawImportedCss);
                    const activeFormat = Object.values(PAGE_FORMATS).find(f => f.id === pageFormatId);
                    const fallbackSize = pageFormatId === 'custom'
                        ? customPageSize
                        : { width: activeFormat?.width || '8.5in', height: activeFormat?.height || '11in' };
                    const targetSize = detectedSize || fallbackSize;

                    const scopedImportedCss = scopeImportedCss(rawImportedCss, '.editor-workspace');
                    let finalCss = `${DEFAULT_CSS}\n${scopedImportedCss}`.trim();

                    // Determine the correct format and margins to use for the layout
                    let importMargins = pageMargins;
                    if (detectedSize) {
                        // Match detected size against known formats before falling back to 'custom'
                        const sizeToInches = (val: string): number => {
                            const num = parseFloat(val);
                            if (isNaN(num)) return 0;
                            if (val.includes('mm')) return num / 25.4;
                            if (val.includes('cm')) return num / 2.54;
                            if (val.includes('pt')) return num / 72;
                            if (val.includes('px')) return num / 96;
                            return num; // assumes 'in' or unitless
                        };
                        const detectedW = sizeToInches(targetSize.width);
                        const detectedH = sizeToInches(targetSize.height);
                        const tolerance = 0.1; // Allow small rounding differences

                        // Find the first matching known format (skip 'custom')
                        const matchedFormat = Object.values(PAGE_FORMATS).find(f => {
                            if (f.id === 'custom') return false;
                            const fw = sizeToInches(f.width);
                            const fh = sizeToInches(f.height);
                            return Math.abs(fw - detectedW) < tolerance && Math.abs(fh - detectedH) < tolerance;
                        });

                        if (matchedFormat) {
                            setPageFormatId(matchedFormat.id);
                            setPageMargins(matchedFormat.margins);
                            importMargins = matchedFormat.margins;
                            console.log(`[Import] Matched page size to format: ${matchedFormat.id} (${matchedFormat.width} x ${matchedFormat.height})`);
                        } else {
                            setPageFormatId('custom');
                            setCustomPageSize({ width: targetSize.width, height: targetSize.height });
                            console.log(`[Import] Custom page size: ${targetSize.width} x ${targetSize.height}`);
                        }
                    }

                    // Apply layout override with the correct dimensions and margins
                    finalCss = applyLayoutOverride(finalCss, targetSize.width, targetSize.height, importMargins);

                    const newState = {
                        htmlContent: bodyContent,
                        cssContent: finalCss,
                        fileName: docFile.name
                    };

                    updateDocState(newState, false);

                    const finalizeImport = () => {
                        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
                        if (!workspace) {
                            updateDocState(newState, true);
                            return;
                        }
                        const changed = ensureContentIsPaginated(workspace);
                        const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
                        pages.forEach(page => {
                            // Remove legacy data-page-break attribute from page divs
                            // (these come from old HTML imports with CSS page-break rules).
                            page.removeAttribute('data-page-break');
                            // Remove data-user-page-break from the PAGE DIV itself
                            // (the pullUp logic only checks child elements via getPageBreakMarker).
                            // But DO NOT remove the hidden child marker divs — those represent
                            // user-intentional page breaks that must be preserved across save/reopen.
                            page.removeAttribute('data-user-page-break');
                            unwrapSingleContainer(page);
                            fixClippedContainers(page);
                        });
                        // Use reflowPagesUntilStable for full convergence, not single pass.
                        // Use onDone callback because reflowPagesUntilStable is async (uses rAF).
                        reflowPagesUntilStable(workspace, {
                            onDone: () => {
                                // Rebuild structure entries from saved data-structure-status attributes
                                const rebuiltEntries: StructureEntry[] = [];
                                const allPages = Array.from(workspace!.querySelectorAll('.page'));
                                workspace!.querySelectorAll('[data-structure-status="approved"]').forEach(el => {
                                    const htmlEl = el as HTMLElement;
                                    const tag = htmlEl.tagName.toLowerCase();
                                    if (!['h1', 'h2', 'h3'].includes(tag)) return;

                                    const elId = htmlEl.id || `struct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                    if (!htmlEl.id) htmlEl.id = elId;

                                    const page = htmlEl.closest('.page');
                                    let pageNum = 1;
                                    allPages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });

                                    rebuiltEntries.push({
                                        id: elId,
                                        elementId: elId,
                                        text: htmlEl.innerText.substring(0, 50),
                                        page: pageNum,
                                        type: tag,
                                        status: 'approved'
                                    });
                                });

                                if (rebuiltEntries.length > 0) {
                                    setStructureEntries(rebuiltEntries);
                                }

                                // Use functional update to get the LATEST docState, not the stale
                                // closure value. Between import and finalize, handleContentChange
                                // may have overwritten cssContent with stale old CSS.
                                setDocState(prev => {
                                    // Re-apply layout override to ensure the correct page size
                                    const correctedCss = applyLayoutOverride(
                                        newState.cssContent, // Use the import's CSS as base
                                        targetSize.width,
                                        targetSize.height,
                                        importMargins
                                    );
                                    const finalState = {
                                        ...newState,
                                        htmlContent: workspace!.innerHTML,
                                        cssContent: correctedCss
                                    };
                                    pushHistoryState(finalState);
                                    return finalState;
                                });
                            }
                        });
                    };

                    const fontReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
                    fontReady.then(() => {
                        requestAnimationFrame(() => {
                            window.setTimeout(finalizeImport, 0);
                        });
                    });

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

    const captureHeadingStyles = (element: HTMLElement): Record<string, string> => {
        const computed = window.getComputedStyle(element);
        return {
            'font-family': computed.fontFamily,
            'font-size': computed.fontSize,
            'font-weight': computed.fontWeight,
            'font-style': computed.fontStyle,
            'color': computed.color,
            'text-transform': computed.textTransform,
            'text-align': computed.textAlign,
            'line-height': computed.lineHeight,
            'letter-spacing': computed.letterSpacing,
            'text-decoration': computed.textDecorationLine || computed.textDecoration,
            'margin-top': computed.marginTop,
            'margin-bottom': computed.marginBottom
        };
    };

    const applyInlineHeadingStyles = (element: HTMLElement, styles: Record<string, string>) => {
        // FIRST: Strip ALL heading-related inline styles from the element
        // so that pre-existing !important styles don't override our new ones.
        const headingProps = [
            'font-family', 'font-size', 'font-weight', 'font-style',
            'color', 'text-transform', 'text-align', 'line-height',
            'letter-spacing', 'text-decoration', 'margin-top', 'margin-bottom'
        ];
        headingProps.forEach(prop => element.style.removeProperty(prop));

        // Also strip from any child spans/elements that might carry inline styles
        element.querySelectorAll('span, b, i, strong, em, font').forEach(child => {
            const childEl = child as HTMLElement;
            headingProps.forEach(prop => childEl.style.removeProperty(prop));
        });

        // THEN: Apply the new heading styles.
        // CRITICAL: Apply ALL values including 'none', 'normal', '0px' — these are needed
        // to explicitly override CSS rules from imported files. For example, if the imported
        // CSS has `h1 { text-transform: uppercase }`, we MUST set `text-transform: none`
        // on the element to prevent the imported style from taking effect.
        Object.entries(styles).forEach(([key, val]) => {
            if (val) {
                element.style.setProperty(key, val, 'important');
            }
        });
        // Always ensure color is set - fallback to black if missing
        if (!element.style.color) {
            element.style.setProperty('color', '#000', 'important');
        }
    };

    const findExistingHeadingStyles = (level: 'h1' | 'h2' | 'h3'): Record<string, string> | null => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (!workspace) return null;
        const existing = workspace.querySelector(level) as HTMLElement | null;
        if (existing) {
            return captureHeadingStyles(existing);
        }
        return null;
    };

    const getHeadingStyleSignature = (element: HTMLElement) => {
        const normalizeFontFamily = (value: string) => {
            const primary = value.split(',')[0] || value;
            return primary.replace(/['"]/g, '').trim().toLowerCase();
        };
        const normalizeFontSize = (value: string) => {
            const size = parseFloat(value);
            if (Number.isFinite(size)) return `${Math.round(size * 100) / 100}px`;
            return value.trim().toLowerCase();
        };
        const normalizeFontWeight = (value: string) => {
            const lower = value.trim().toLowerCase();
            if (lower === 'normal') return '400';
            if (lower === 'bold') return '700';
            const parsed = parseInt(lower, 10);
            return Number.isFinite(parsed) ? String(parsed) : lower;
        };
        const normalizeTextTransform = (value: string) => value.trim().toLowerCase();
        const normalizeTextAlign = (value: string) => {
            const lower = value.trim().toLowerCase();
            if (lower === 'start') return 'left';
            if (lower === 'end') return 'right';
            return lower;
        };
        const computed = window.getComputedStyle(element);
        return [
            normalizeFontFamily(computed.fontFamily),
            normalizeFontSize(computed.fontSize),
            normalizeFontWeight(computed.fontWeight),
            computed.fontStyle.trim().toLowerCase(),
            normalizeTextTransform(computed.textTransform),
            normalizeTextAlign(computed.textAlign)
        ].join('|');
    };

    const getHeadingPreview = (element: HTMLElement) => {
        const tag = element.tagName.toLowerCase();
        const text = element.textContent?.trim() || '';
        const truncated = text.length > 50 ? `${text.substring(0, 50)}...` : text;
        return `<${tag}> ${truncated || '(vuoto)'}`;
    };

    const ensureElementId = (element: HTMLElement) => {
        if (!element.id) {
            element.id = `struct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        }
        return element.id;
    };

    const applyHeadingStructureToElement = (element: HTMLElement, level: 'h1' | 'h2' | 'h3', stylesToApply?: Record<string, string>) => {
        let target = element;
        if (target.tagName.toLowerCase() !== level) {
            const newElement = document.createElement(level);
            Array.from(target.attributes).forEach(attr => {
                newElement.setAttribute(attr.name, attr.value);
            });
            newElement.innerHTML = target.innerHTML;
            target.parentNode?.replaceChild(newElement, target);
            target = newElement;
        }

        // Apply saved heading styles ONLY if the user has explicitly defined them
        // via the "Update style" button (Word-like behavior).
        // Do NOT auto-capture styles from existing headings in the document —
        // imported files should not dictate the style for new headings.
        const styles = stylesToApply || savedHeadingStylesRef.current[level] || null;
        if (styles) {
            applyInlineHeadingStyles(target, styles);
        }

        ensureElementId(target);
        target.setAttribute('data-structure-status', 'approved');

        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (workspace) {
            const page = target.closest('.page');
            const pages = workspace.querySelectorAll('.page');
            let pageNum = 1;
            pages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });

            setStructureEntries(prev => {
                const existing = prev.find(e => e.elementId === target.id);
                if (existing) {
                    return prev.map(e => e.elementId === target.id
                        ? { ...e, status: 'approved', type: level, page: pageNum, text: target.innerText.substring(0, 50) }
                        : e
                    );
                }
                return [...prev, {
                    id: target.id,
                    elementId: target.id,
                    text: target.innerText.substring(0, 50),
                    page: pageNum,
                    type: level,
                    status: 'approved'
                }];
            });
        }

        return target;
    };

    const openStructurePatternModal = (level: 'h1' | 'h2' | 'h3', signature: string) => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (!workspace) return;
        const matches = findHeadingMatchesBySignature(signature, workspace)
            .map(el => {
                ensureElementId(el);
                return { element: el, preview: getHeadingPreview(el) };
            })
            .filter(match => match.element.getAttribute('data-structure-status') !== 'rejected');

        if (matches.length === 0) return;

        setPatternModal({
            isOpen: true,
            actionType: `Apply ${level.toUpperCase()} style`,
            matches,
            applyStyle: (el: HTMLElement) => {
                applyHeadingStructureToElement(el, level);
            }
        });
    };

    const findHeadingMatchesBySignature = (signature: string, workspace: HTMLElement) => {
        const candidates = Array.from(workspace.querySelectorAll(
            'p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page):not(.editor-workspace)'
        )) as HTMLElement[];

        return candidates.filter(el => {
            if (el.closest('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle')) return false;
            if (el.closest('.page-footer')) return false;
            const elSignature = getHeadingStyleSignature(el);
            return elSignature === signature;
        });
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

    const addHeadingToStructure = (tag: 'h1' | 'h2' | 'h3', baseSignature?: string) => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (!workspace) return;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        const node = selection.getRangeAt(0).commonAncestorContainer;
        const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
        const heading = element?.closest(tag) as HTMLElement | null;
        if (!heading) return;

        const signature = baseSignature || getHeadingStyleSignature(heading);
        applyHeadingStructureToElement(heading, tag);
        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);

        const prevSig = manualHeadingSignatures[tag];
        const prevCount = manualHeadingCounts[tag];
        const nextCount = prevCount + 1;

        setManualHeadingCounts(prev => ({ ...prev, [tag]: nextCount } as { h1: number; h2: number; h3: number }));

        if (!prevSig) {
            setManualHeadingSignatures(prev => ({ ...prev, [tag]: signature }));
            return;
        }

        if (prevSig === signature && nextCount >= 2) {
            openStructurePatternModal(tag, signature);
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

        // Image alignment: apply CSS centering directly to the selected image
        if (selectedImage && (command === 'justifyLeft' || command === 'justifyCenter' || command === 'justifyRight')) {
            if (command === 'justifyCenter') {
                selectedImage.style.display = 'block';
                selectedImage.style.marginLeft = 'auto';
                selectedImage.style.marginRight = 'auto';
            } else if (command === 'justifyRight') {
                selectedImage.style.display = 'block';
                selectedImage.style.marginLeft = 'auto';
                selectedImage.style.marginRight = '0';
            } else {
                // justifyLeft — reset to default
                selectedImage.style.display = '';
                selectedImage.style.marginLeft = '';
                selectedImage.style.marginRight = '';
            }
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                updateDocStatePreserveScroll(workspace.innerHTML);
            }
            handleImageSelect(selectedImage);
            return;
        }

        if (multiSelectedElements.length > 0) {
            if (command === 'fontName' && value) {
                if (applyStyleToMultiSelection({ 'font-family': value })) return;
            }
            if (command === 'fontSize') {
                const sizeValue = value || '16pt';
                let sizeFinal = sizeValue;
                if (!sizeValue.includes('pt') && !sizeValue.includes('px') && !sizeValue.includes('em')) {
                    sizeFinal = `${sizeValue}pt`;
                }
                const textTargets = multiSelectedElements
                    .map(id => document.getElementById(id))
                    .filter(Boolean)
                    .map(el => (el as HTMLElement).closest('.floating-text, .writing-lines, textarea.writing-lines, p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page):not(.editor-workspace)') as HTMLElement | null)
                    .filter(Boolean) as HTMLElement[];
                if (textTargets.length > 0) {
                    textTargets.forEach(el => el.style.setProperty('font-size', sizeFinal, 'important'));
                    const workspace = document.querySelector('.editor-workspace');
                    if (workspace) {
                        updateDocStatePreserveScroll(workspace.innerHTML);
                    }
                    setSelectionState(prev => ({ ...prev, fontSize: sizeValue.replace('pt', '').replace('px', '') }));
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
                    const size = value || '12pt';
                    footer.style.fontSize = (!size.includes('px') && !size.includes('pt')) ? `${size}pt` : size;
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
        // Only enter this path when the activeBlock *itself* is a div with a class,
        // NOT when it's a standard block (p, h1, etc.) that happens to be inside a classed div.
        if (command === 'formatBlock' && activeBlock) {
            const standardBlockTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);
            if (!standardBlockTags.has(activeBlock.tagName)) {
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
        }

        if (command === 'lineHeight') {
            // 1. Recover activeBlock if detached (use ref for fresh value)
            let targetBlock = activeBlockRef.current;
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
            const sizeValue = value || '16pt';
            let sizeFinal = sizeValue;
            if (!sizeValue.includes('pt') && !sizeValue.includes('px') && !sizeValue.includes('em')) {
                sizeFinal = `${sizeValue}pt`;
            }
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

            // Apply size to elements and selection
            if (range && (!range.collapsed || selectedTextLayer)) {
                const spansWholeBlock = targetBlock && range.toString() === targetBlock.innerText;

                if (spansWholeBlock || selectedTextLayer) {
                    if (targetBlock) targetBlock.style.setProperty('font-size', sizeFinal, 'important');
                } else {
                    const span = document.createElement('span');
                    span.style.fontSize = sizeFinal;
                    try {
                        span.appendChild(range.extractContents());
                        range.insertNode(span);
                        selection?.removeAllRanges();
                        const newRange = document.createRange();
                        newRange.selectNodeContents(span);
                        selection?.addRange(newRange);
                    } catch (e) {
                        console.error("DOM split failed for fontSize:", e);
                        if (targetBlock) targetBlock.style.setProperty('font-size', sizeFinal, 'important');
                    }
                }
            } else if (targetBlock) {
                targetBlock.style.setProperty('font-size', sizeFinal, 'important');
            }

            setSelectionState(prev => ({ ...prev, fontSize: sizeValue.replace('pt', '').replace('px', '') }));
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
                const workspace = document.querySelector('.editor-workspace');

                if (targetBlock) {
                    // If selection spans the whole block (or is collapsed), apply to block
                    const spansWholeBlock = range.collapsed || range.toString() === targetBlock.innerText;

                    if (spansWholeBlock) {
                        targetBlock.style.textTransform = value || 'none';
                    } else {
                        // Wrap only the selected text in a span
                        const span = document.createElement('span');
                        span.style.textTransform = value || 'none';
                        try {
                            span.appendChild(range.extractContents());
                            range.insertNode(span);
                            selection.removeAllRanges();
                            const newRange = document.createRange();
                            newRange.selectNodeContents(span);
                            selection.addRange(newRange);
                        } catch (e) {
                            console.error("DOM split failed for textTransform:", e);
                            // Fallback to block level
                            targetBlock.style.textTransform = value || 'none';
                        }
                    }

                    if (workspace) {
                        updateDocStatePreserveScroll(workspace.innerHTML);
                    }
                    return;
                }
            }
            return;
        }

        let formatBlockSignature: string | null = null;
        let formatBlockTag: 'h1' | 'h2' | 'h3' | null = null;
        if (command === 'formatBlock' && value) {
            const nextTag = value.replace(/[<>]/g, '').toLowerCase();
            if (nextTag === 'h1' || nextTag === 'h2' || nextTag === 'h3') {
                formatBlockTag = nextTag;
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const node = range.commonAncestorContainer;
                    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
                    const block = el?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div:not(.page):not(.editor-workspace)') as HTMLElement | null;
                    if (block) {
                        formatBlockSignature = getHeadingStyleSignature(block);
                    }
                }
            }
        }

        // Restore selection first — clicking toolbar items can cause focus loss,
        // leaving execCommand with no valid selection target.
        if (command === 'formatBlock') {
            restoreSelection();
        }
        document.execCommand(command, false, value);

        // For font size, ensure we force focus back if dropdown was used
        const editor = document.querySelector('.editor-workspace') as HTMLElement;
        editor?.focus();

        // NOTE: execCommand triggers the Editor's mutation observer or input listener, 
        // which calls handleContentChange. So history will be saved via debounce.

        // For formatBlock: verify it worked, and if not, use DOM manipulation fallback
        if (command === 'formatBlock' && value) {
            const appliedTagStr = value.replace(/[<>]/g, '').toLowerCase();

            // Check if execCommand actually changed the block
            let targetBlock: HTMLElement | null = null;
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const node = sel.getRangeAt(0).commonAncestorContainer;
                const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
                targetBlock = el?.closest(appliedTagStr) as HTMLElement | null;
            }

            // If execCommand didn't work (selection was lost), use DOM manipulation fallback
            if (!targetBlock && activeBlock) {
                const blockToConvert = activeBlock.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, div:not(.page):not(.editor-workspace)') as HTMLElement | null;
                if (blockToConvert && blockToConvert.nodeName.toLowerCase() !== appliedTagStr) {
                    const newEl = document.createElement(appliedTagStr);
                    // Copy all children
                    while (blockToConvert.firstChild) {
                        newEl.appendChild(blockToConvert.firstChild);
                    }
                    // Copy attributes (class, style, id, data-*)
                    for (const attr of Array.from(blockToConvert.attributes)) {
                        newEl.setAttribute(attr.name, attr.value);
                    }
                    // Replace in DOM
                    blockToConvert.parentNode?.replaceChild(newEl, blockToConvert);
                    targetBlock = newEl;
                    console.log(`[Style] formatBlock fallback: converted ${blockToConvert.nodeName} → ${appliedTagStr}`);
                }
            }

            // Add to structure if heading
            if (appliedTagStr === 'h1' || appliedTagStr === 'h2' || appliedTagStr === 'h3') {
                addHeadingToStructure(appliedTagStr as 'h1' | 'h2' | 'h3', formatBlockSignature || undefined);
            }

            // Apply saved styles (Word-like behavior)
            const stylesToApply = savedHeadingStylesRef.current[appliedTagStr as keyof typeof savedHeadingStyles];
            console.log('[FormatBlock] targetBlock:', targetBlock?.tagName, 'stylesToApply:', stylesToApply ? Object.keys(stylesToApply).length + ' props' : 'none');
            if (stylesToApply && targetBlock) {
                applyInlineHeadingStyles(targetBlock, stylesToApply);
            }

            // Save state
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                updateDocStatePreserveScroll(workspace.innerHTML);
            }
        } else if (formatBlockTag) {
            addHeadingToStructure(formatBlockTag, formatBlockSignature || undefined);
        }
    };

    const handleUpdateStyle = (targetTagName?: string) => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;

        // When targetTagName is provided (from clicking ↻ in dropdown), we want to capture
        // styles from whatever the user is CURRENTLY looking at (activeBlock or selection),
        // regardless of its tag. This enables the Word-like workflow:
        //   1. User styles a paragraph how they want H1 to look
        //   2. User clicks ↻ next to "H1" → that look becomes the H1 definition
        let styledElement: Element | null = null;

        if (targetTagName && workspace) {
            // First try activeBlockRef (ref is always fresh, unlike state which can be stale in closures)
            const currentActiveBlock = activeBlockRef.current;
            if (currentActiveBlock && workspace.contains(currentActiveBlock)) {
                styledElement = currentActiveBlock;
                console.log('[UpdateStyle] Captured from activeBlockRef:', currentActiveBlock.tagName, currentActiveBlock.textContent?.substring(0, 40));
            }
            // Then try the current selection
            if (!styledElement) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const node = selection.getRangeAt(0).commonAncestorContainer;
                    const element = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
                    const block = element?.closest('p, h1, h2, h3, h4, h5, h6, blockquote, div:not(.page):not(.editor-workspace)');
                    if (block && workspace.contains(block)) {
                        styledElement = block;
                    }
                }
            }
            // DO NOT fall back to workspace.querySelector(targetTagName).
            // We should only capture from what the user is actively looking at.
        } else {
            // No targetTagName — use activeBlock or selection (original behavior)
            styledElement = activeBlock?.closest('h1, h2, h3, h4, h5, h6, p, blockquote, div[class]:not(.page):not(.editor-workspace)') || null;
            if (!styledElement) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const node = selection.getRangeAt(0).commonAncestorContainer;
                    const element = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
                    styledElement = element?.closest('h1, h2, h3, h4, h5, h6, p, blockquote, div[class]:not(.page):not(.editor-workspace)') || null;
                }
            }
        }
        // Derive inlineEl from styledElement directly, since getTextStyleSource() relies on
        // window.getSelection() which is lost when focus moved to the toolbar.
        // Look for the first styled inline child inside the block element.
        let inlineEl: Element | null = null;
        if (styledElement) {
            // Check for an inline child that carries text styling (span, b, i, em, strong, etc.)
            const firstInline = styledElement.querySelector('span, b, i, em, strong, a, font') as HTMLElement | null;
            inlineEl = firstInline || styledElement;
        } else {
            // Fallback to getTextStyleSource if no styledElement found
            const source = getTextStyleSource();
            inlineEl = source.inlineEl;
        }
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
            console.log(`[Style] Updated style for ${selector} (shape/HR only)`);
            return;
        }

        const computedBlock = window.getComputedStyle(styledElement as Element);
        const computedText = window.getComputedStyle(inlineEl || styledElement);

        const color = computedText.color;
        const fontFamily = computedText.fontFamily;
        const fontWeight = computedText.fontWeight;
        const fontStyle = computedText.fontStyle;
        const textDecoration = computedText.textDecorationLine || computedText.textDecoration;
        const textTransform = computedText.textTransform;
        const letterSpacing = computedText.letterSpacing;

        // Capture styles BEFORE any tag conversion
        const capturedStylesForSave: Record<string, string> = {
            'font-family': fontFamily,
            'font-size': computedText.fontSize,
            'font-weight': fontWeight,
            'font-style': fontStyle,
            'color': color,
            'text-align': computedBlock.textAlign,
            'text-decoration': textDecoration,
            'text-transform': textTransform,
            'letter-spacing': letterSpacing,
            'margin-top': computedBlock.marginTop,
            'margin-bottom': computedBlock.marginBottom,
            'line-height': computedBlock.lineHeight
        };

        // CONVERT the element to the target tag if different (e.g., <p> → <h1>)
        // This makes clicking ↻ next to H1 both capture the style AND set the element as H1
        if (targetTagName && styledElement instanceof HTMLElement
            && styledElement.tagName.toLowerCase() !== targetTagName.toLowerCase()
            && !styledElement.classList.contains('page')
            && !styledElement.classList.contains('editor-workspace')) {
            const newElement = document.createElement(targetTagName);
            Array.from(styledElement.attributes).forEach(attr => {
                newElement.setAttribute(attr.name, attr.value);
            });
            newElement.innerHTML = styledElement.innerHTML;
            styledElement.parentNode?.replaceChild(newElement, styledElement);
            styledElement = newElement;
            // Re-apply the ORIGINAL styles so the element looks identical after tag conversion
            applyInlineHeadingStyles(newElement, capturedStylesForSave);
            ensureElementId(newElement);
            newElement.setAttribute('data-structure-status', 'approved');
            htmlModified = true;

            // Add to structure entries
            const page = newElement.closest('.page');
            const pages = workspace?.querySelectorAll('.page') || [];
            let pageNum = 1;
            pages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });
            setStructureEntries(prev => {
                const exists = prev.find(e => e.elementId === newElement.id);
                if (exists) {
                    return prev.map(e => e.elementId === newElement.id
                        ? { ...e, status: 'approved', type: targetTagName, page: pageNum, text: newElement.innerText.substring(0, 50) }
                        : e
                    );
                }
                return [...prev, {
                    id: newElement.id,
                    elementId: newElement.id,
                    text: newElement.innerText.substring(0, 50),
                    page: pageNum,
                    type: targetTagName,
                    status: 'approved'
                }];
            });
        }

        // Save captured styles for inline application on future elements.
        const validStyleTags = ['h1', 'h2', 'h3', 'p', 'blockquote', 'pre'];
        if (selector && validStyleTags.includes(selector)) {
            setSavedHeadingStyles(prev => {
                const next = { ...prev, [selector]: capturedStylesForSave };
                savedHeadingStylesRef.current = next;
                return next;
            });

            // For NORMAL TEXT (p, blockquote, pre): update ALL existing elements of this type.
            // Body text should be consistent — when user updates "Normal" style, ALL paragraphs change.
            // For HEADINGS (h1, h2, h3): do NOT update existing elements.
            // Heading elements keep their imported appearance; only future assignments use the saved style.
            const isBodyText = ['p', 'blockquote', 'pre'].includes(selector);
            if (isBodyText && workspace) {
                const existingElements = workspace.querySelectorAll(selector);
                existingElements.forEach(el => {
                    const htmlEl = el as HTMLElement;
                    // Skip elements inside special containers
                    if (!htmlEl.closest('.mission-box, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle, .page-footer')) {
                        // Skip elements that are already tagged as headings in the structure
                        if (htmlEl.getAttribute('data-structure-status') === 'approved') return;
                        applyInlineHeadingStyles(htmlEl, capturedStylesForSave);
                    }
                });
                htmlModified = true;
            }
        }

        updateDocState({
            ...docState,
            htmlContent: workspace ? workspace.innerHTML : docState.htmlContent
        }, true);

        console.log(`[Style] Updated style for ${selector}`);
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
                    activeBlockRef.current = currentBlock;
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
        newPage.setAttribute('data-user-page-break', 'true');
        // Also insert a dedicated child marker so getPageBreakMarker() can find it
        // via ':scope > [data-user-page-break="true"]'. This distinguishes user-inserted
        // page breaks from the page div attribute set during HTML import.
        const breakChildMarker = document.createElement('div');
        breakChildMarker.setAttribute('data-user-page-break', 'true');
        breakChildMarker.style.cssText = 'display:none;height:0;overflow:hidden;';
        newPage.appendChild(breakChildMarker);

        const marker = document.createElement('span');
        marker.id = 'page-break-marker-' + Date.now();
        range.collapse(true);
        range.insertNode(marker);

        let topBlock: HTMLElement | null = marker as unknown as HTMLElement;
        while (topBlock && topBlock.parentElement !== currentPage) {
            topBlock = topBlock.parentElement;
        }

        if (topBlock && topBlock.parentElement === currentPage) {
            // Edge case: cursor was positioned directly between block-level children of the page
            // (e.g., between <p>prev</p> and <h2>Chapter 3</h2>). In this case topBlock IS the
            // marker span itself, so the normal isAtStart/isAtEnd logic fails (no children to iterate).
            // Fix: simply move everything after the marker to the new page.
            const markerIsTopBlock = (topBlock as unknown as Node) === marker;
            if (markerIsTopBlock) {
                let nextSib: Node | null = marker.nextSibling;
                const toMove: Node[] = [];
                while (nextSib) {
                    if (!(nextSib instanceof HTMLElement && nextSib.classList.contains('page-footer'))) {
                        toMove.push(nextSib);
                    }
                    nextSib = nextSib.nextSibling;
                }
                toMove.forEach(n => newPage.appendChild(n));
                currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
                marker.remove();
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
                    try { reflowPages(workspace as HTMLElement); } catch (e) { /* non-fatal */ }
                    updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
                }
                return;
            }

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
            try {
                reflowPages(workspace as HTMLElement);
            } catch (e) {
                console.warn('[handlePageBreak] reflowPages error (non-fatal):', e);
            }
            updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        }
    };


    const handleInsertTOC = (settings: TOCSettings) => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (!workspace) return;

        const tocId = `toc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const tocEntries: TOCEntry[] = [];
        const include = {
            h1: settings.includeH1,
            h2: settings.includeH2,
            h3: settings.includeH3
        };

        if (!include.h1 && !include.h2 && !include.h3) {
            alert("Please select at least one heading level.");
            return;
        }

        const resolveLevel = (type: string) => {
            if (type.includes('h1')) return 'h1';
            if (type.includes('h2')) return 'h2';
            if (type.includes('h3')) return 'h3';
            return null;
        };

        const approvedEntries = structureEntries.filter(entry => entry.status !== 'rejected');
        approvedEntries.forEach(entry => {
            const level = resolveLevel(entry.type);
            if (!level || !include[level]) return;

            const element = workspace.querySelector(`#${CSS.escape(entry.elementId)}`) as HTMLElement | null;
            if (!element) return;

            if (!element.id) {
                element.id = entry.elementId || `toc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            }

            const pageEl = element.closest('.page');
            const pages = workspace.querySelectorAll('.page');
            let pageNum = entry.page || 1;
            pages.forEach((p, idx) => { if (p === pageEl) pageNum = idx + 1; });

            tocEntries.push({
                id: element.id,
                text: entry.text || element.textContent || 'Untitled Section',
                page: pageNum,
                level
            });
        });

        if (tocEntries.length === 0) {
            alert("No approved Structure entries found.");
            setIsTOCModalOpen(false);
            return;
        }

        tocEntries.sort((a, b) => a.page - b.page);

        const tocBg = settings.style === 'modern' ? '#f8f9fa' : 'transparent';
        const leaderStyle = settings.style === 'dotted'
            ? `flex:1 1 auto; height:2px; min-height:2px; display:block; align-self:center; background-image: radial-gradient(circle at 1px 1px, #9ca3af 1px, transparent 1.5px); background-size: ${settings.dotSpacing}px 2px; background-repeat: repeat-x; background-position: left center;`
            : settings.style === 'modern'
                ? 'flex:1 1 auto; height:1px; min-height:1px; display:block; align-self:center; border-bottom: 1px solid #e2e5ea;'
                : 'flex:1 1 auto; height:1px;';

        let tocHtml = `
      <div class="toc-container toc-style-${settings.style}" data-toc-id="${tocId}" data-toc-h1="${settings.includeH1 ? '1' : '0'}" data-toc-h2="${settings.includeH2 ? '1' : '0'}" data-toc-h3="${settings.includeH3 ? '1' : '0'}" data-toc-dot-spacing="${settings.dotSpacing}" style="--toc-dot-gap: ${settings.dotSpacing}px; background:${tocBg};">
          <div class="toc-rows">
      `;

        tocEntries.forEach(entry => {
            const indent = entry.level === 'h2' ? 20 : entry.level === 'h3' ? 40 : 0;
            tocHtml += `
            <div class="toc-row toc-${entry.level}" style="display:flex; align-items:baseline; gap:8px; margin:0 0 8px 0; width:100%;">
                <span class="toc-title-cell" style="flex:0 1 auto; min-width:0; padding-left:${indent}px; padding-right:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    <a href="#${entry.id}" onclick="const el = document.getElementById('${entry.id}'); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return false;" style="color:inherit; text-decoration:none; display:block;">
                        <span class="toc-text" style="background:${tocBg}; padding-right:6px; display:inline-block;">${entry.text}</span>
                    </a>
                </span>
                <span class="toc-leader-cell" aria-hidden="true" style="${leaderStyle}"></span>
                <span class="toc-page-cell" style="flex:0 0 auto; min-width:4ch; text-align:right; white-space:nowrap; padding-left:8px; background:${tocBg};">${entry.page}</span>
            </div>
          `;
        });

        tocHtml += `</div></div><br/>`;

        const selection = window.getSelection();
        let range: Range | null = null;
        if (selection && selection.rangeCount > 0) {
            const candidate = selection.getRangeAt(0);
            if (workspace.contains(candidate.commonAncestorContainer)) {
                range = candidate;
            }
        }

        if (range) {
            const fragment = document.createRange().createContextualFragment(tocHtml);
            range.insertNode(fragment);
            range.collapse(false);
        } else {
            const firstPage = workspace.querySelector('.page');
            if (firstPage) {
                firstPage.insertAdjacentHTML('beforeend', tocHtml);
            } else {
                workspace.insertAdjacentHTML('beforeend', tocHtml);
            }
        }

        reflowPages(workspace, { pullUp: true });
        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        setIsTOCModalOpen(false);
    };

    const handleRefreshTOC = (tocId?: string) => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (!workspace) return;
        const selector = tocId ? `.toc-container[data-toc-id="${tocId}"]` : '.toc-container';
        const container = workspace.querySelector(selector) as HTMLElement | null;
        if (!container) return;

        const include = {
            h1: container.getAttribute('data-toc-h1') !== '0',
            h2: container.getAttribute('data-toc-h2') !== '0',
            h3: container.getAttribute('data-toc-h3') !== '0'
        };
        const resolveLevel = (type: string) => {
            if (type.includes('h1')) return 'h1';
            if (type.includes('h2')) return 'h2';
            if (type.includes('h3')) return 'h3';
            return null;
        };

        const tocEntries: TOCEntry[] = [];
        const approvedEntries = structureEntries.filter(entry => entry.status !== 'rejected');
        approvedEntries.forEach(entry => {
            const level = resolveLevel(entry.type);
            if (!level || !include[level]) return;
            const element = workspace.querySelector(`#${CSS.escape(entry.elementId)}`) as HTMLElement | null;
            if (!element) return;
            if (!element.id) element.id = entry.elementId || `toc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const pageEl = element.closest('.page');
            const pages = workspace.querySelectorAll('.page');
            let pageNum = entry.page || 1;
            pages.forEach((p, idx) => { if (p === pageEl) pageNum = idx + 1; });
            tocEntries.push({
                id: element.id,
                text: entry.text || element.textContent || 'Untitled Section',
                page: pageNum,
                level
            });
        });

        if (tocEntries.length === 0) return;
        tocEntries.sort((a, b) => a.page - b.page);

        const dotSpacingAttr = container.getAttribute('data-toc-dot-spacing');
        const dotSpacing = dotSpacingAttr ? Number(dotSpacingAttr) : 6;
        if (Number.isFinite(dotSpacing)) {
            container.style.setProperty('--toc-dot-gap', `${dotSpacing}px`);
        }
        const tocBg = container.classList.contains('toc-style-modern') ? '#f8f9fa' : 'transparent';
        const leaderStyle = container.classList.contains('toc-style-dotted')
            ? `flex:1 1 auto; height:2px; min-height:2px; display:block; align-self:center; background-image: radial-gradient(circle at 1px 1px, #9ca3af 1px, transparent 1.5px); background-size: ${dotSpacing}px 2px; background-repeat: repeat-x; background-position: left center;`
            : container.classList.contains('toc-style-modern')
                ? 'flex:1 1 auto; height:1px; min-height:1px; display:block; align-self:center; border-bottom: 1px solid #e2e5ea;'
                : 'flex:1 1 auto; height:1px;';

        const rowsHtml = tocEntries.map(entry => {
            const indent = entry.level === 'h2' ? 20 : entry.level === 'h3' ? 40 : 0;
            return `
          <div class="toc-row toc-${entry.level}" style="display:flex; align-items:baseline; gap:8px; margin:0 0 8px 0; width:100%;">
              <span class="toc-title-cell" style="flex:0 1 auto; min-width:0; padding-left:${indent}px; padding-right:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  <a href="#${entry.id}" onclick="const el = document.getElementById('${entry.id}'); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return false;" style="color:inherit; text-decoration:none; display:block;">
                      <span class="toc-text" style="background:${tocBg}; padding-right:6px; display:inline-block;">${entry.text}</span>
                  </a>
              </span>
              <span class="toc-leader-cell" aria-hidden="true" style="${leaderStyle}"></span>
              <span class="toc-page-cell" style="flex:0 0 auto; min-width:4ch; text-align:right; white-space:nowrap; padding-left:8px; background:${tocBg};">${entry.page}</span>
          </div>
        `;
        }).join('');

        const rowsContainer = container.querySelector('.toc-rows') as HTMLElement | null;
        if (rowsContainer) {
            rowsContainer.innerHTML = rowsHtml;
        } else {
            container.querySelector('table.toc-table')?.remove();
            const newRows = document.createElement('div');
            newRows.className = 'toc-rows';
            newRows.innerHTML = rowsHtml;
            const actions = container.querySelector('.toc-actions');
            if (actions && actions.nextSibling) {
                container.insertBefore(newRows, actions.nextSibling);
            } else {
                container.appendChild(newRows);
            }
        }

        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
    };

    const handleRemoveTOC = () => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (workspace) {
            workspace.querySelectorAll('.toc-container, table.toc-table, table[data-toc-table="true"]').forEach(el => el.remove());
            updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        } else {
            const parser = new DOMParser();
            const doc = parser.parseFromString(docState.htmlContent, 'text/html');
            doc.querySelectorAll('.toc-container, table.toc-table, table[data-toc-table="true"]').forEach(el => el.remove());
            updateDocState({ ...docState, htmlContent: doc.body.innerHTML }, true);
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
        // Use functional update so rapid dragging always has the latest CSS content, avoiding stale closure bugs
        setDocState(prev => {
            const updatedCss = applyLayoutOverride(prev.cssContent, width, height, margins);
            return { ...prev, cssContent: updatedCss };
        });

        if (marginReflowTimeoutRef.current) {
            clearTimeout(marginReflowTimeoutRef.current);
        }
        marginReflowTimeoutRef.current = window.setTimeout(() => {
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                reflowPagesUntilStable(workspace as HTMLElement, { pullUp: true });
            }
            // Save to history once drag is completed (or paused) rather than 60 times a second
            setDocState(prev => {
                if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
                pushHistoryState(prev);
                return prev;
            });
        }, 300);
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
            // Append 'in' if the user types a raw number so CSS doesn't break
            const validWidth = /^\d+(\.\d+)?$/.test(width) ? `${width}in` : width;
            const validHeight = /^\d+(\.\d+)?$/.test(height) ? `${height}in` : height;
            updatePageCSS(validWidth || '8.5in', validHeight || '11in', pageMargins);
        }
    };

    const handleMarginChange = (key: keyof typeof pageMargins, value: number) => {
        // Use functional update so subsequent calls in the same frame don't overwrite each other with stale margins
        setPageMargins(prev => {
            const newMargins = { ...prev, [key]: value };

            const format = Object.values(PAGE_FORMATS).find(f => f.id === pageFormatId);
            const width = pageFormatId === 'custom' ? customPageSize.width : (format?.width || '8.5in');
            const height = pageFormatId === 'custom' ? customPageSize.height : (format?.height || '11in');

            updatePageCSS(width, height, newMargins);

            return newMargins;
        });
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
        const { applyStyle, actionType } = patternModal;

        if (actionType === 'remove-structure') {
            // 1. Persist the rejection to DOM for all selected similar elements
            selectedIds.forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.setAttribute('data-structure-status', 'rejected');
                }
            });

            // 2. Update React state immediately to remove them from the UI Sidebar
            setStructureEntries(prev => prev.map(e =>
                selectedIds.includes(e.id) ? { ...e, status: 'rejected' } : e
            ));

        } else {
            // Handle regular stylistic patterns
            selectedIds.forEach(id => {
                const element = document.getElementById(id);
                if (element && applyStyle) {
                    applyStyle(element);
                }
            });
        }

        const workspace = document.querySelector('.editor-workspace') as HTMLElement;
        if (workspace) {
            reflowPages(workspace);
            updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        }

        patternTrackerRef.current.clear();
        setPatternModal({ isOpen: false, actionType: '', matches: [] });
    };

    const handlePatternCancelApp = () => {
        // If they cancelled a bulk structural delete, we must still save the original manually deleted item to the DOM history
        if (patternModal.actionType === 'remove-structure') {
            const workspace = document.querySelector('.editor-workspace') as HTMLElement;
            if (workspace) {
                updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
            }
        }

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
        // Keep data-structure-status for round-trip fidelity (structure is preserved on reimport)

        return clone;
    };

    const handleExportHTML = (fileName: string) => {
        // Use the actual document state, not the live DOM
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = docState.htmlContent;

        // Clean up selection attributes
        tempDiv.querySelectorAll('[data-selected]').forEach(el => el.removeAttribute('data-selected'));
        // Keep data-structure-status for round-trip fidelity

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

    const handleExportPDF = async (fileName: string, onProgress?: (percent: number) => void) => {
        // --- Direct html2canvas + jsPDF approach ---
        // Renders the already-visible .page elements in the workspace directly.
        // This bypasses html2pdf.js which produced blank PDFs.

        if (!window.html2canvas) {
            alert('html2canvas library is not loaded. Please refresh the page and try again.');
            return;
        }

        const JsPDF = (window as any).jspdf?.jsPDF;
        if (!JsPDF) {
            alert('jsPDF library is not loaded. Please refresh the page and try again.');
            return;
        }

        console.log('[PDF Export] Starting export for:', fileName);
        onProgress?.(0);

        // --- 1. Determine page dimensions ---
        const toInches = (val: string): number => {
            const num = parseFloat(val);
            if (isNaN(num)) return 8.5;
            if (val.includes('mm')) return num / 25.4;
            if (val.includes('cm')) return num / 2.54;
            if (val.includes('pt')) return num / 72;
            if (val.includes('px')) return num / 96;
            return num;
        };

        let pageWidthIn = 8.5;
        let pageHeightIn = 11;

        const activeFormat = Object.values(PAGE_FORMATS).find(f => f.id === pageFormatId);
        if (pageFormatId === 'custom') {
            pageWidthIn = toInches(customPageSize.width);
            pageHeightIn = toInches(customPageSize.height);
        } else if (activeFormat) {
            pageWidthIn = toInches(activeFormat.width);
            pageHeightIn = toInches(activeFormat.height);
        }

        const cssSize = detectPageSizeFromCss(docState.cssContent);
        if (cssSize) {
            pageWidthIn = toInches(cssSize.width);
            pageHeightIn = toInches(cssSize.height);
        }

        const pageWidthPx = Math.round(pageWidthIn * 96);
        const pageHeightPx = Math.round(pageHeightIn * 96);
        const orientation = pageWidthIn > pageHeightIn ? 'landscape' : 'portrait';

        console.log('[PDF Export] Page size:', pageWidthIn, 'x', pageHeightIn, 'in');

        // --- 2. Find the .page elements in the workspace ---
        const workspace = document.querySelector('.editor-workspace');
        if (!workspace) {
            alert('Workspace not found.');
            return;
        }

        const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
        if (pages.length === 0) {
            alert('No pages found to export.');
            return;
        }

        console.log('[PDF Export] Found', pages.length, 'pages');

        // --- 3. Temporarily clean up editor UI elements ---
        const removedElements: { parent: Node; element: Node; nextSibling: Node | null }[] = [];
        const editorSelectors = '.image-overlay, .resize-handle, .drag-handle, .text-mode-badge, .marquee, .context-menu, .page-ruler, .margin-guides';

        workspace.querySelectorAll(editorSelectors).forEach(el => {
            if (el.parentNode) {
                removedElements.push({
                    parent: el.parentNode,
                    element: el,
                    nextSibling: el.nextSibling
                });
                el.parentNode.removeChild(el);
            }
        });

        // Remove data-selected attributes temporarily
        const selectedEls = workspace.querySelectorAll('[data-selected]');
        selectedEls.forEach(el => el.removeAttribute('data-selected'));
        const multiSelectedEls = workspace.querySelectorAll('[data-multi-selected]');
        multiSelectedEls.forEach(el => el.removeAttribute('data-multi-selected'));

        // Save and override overflow styles to prevent text clipping in PDF
        // This fixes TOC entries and other elements that use overflow:hidden + text-overflow:ellipsis
        const overflowFixedElements: { el: HTMLElement; originalOverflow: string }[] = [];
        pages.forEach(page => {
            // Fix the page itself
            overflowFixedElements.push({ el: page, originalOverflow: page.style.overflow });
            page.style.overflow = 'visible';
            page.style.boxShadow = 'none';

            // Fix ALL descendant elements that have overflow:hidden
            page.querySelectorAll('*').forEach(child => {
                const el = child as HTMLElement;
                const computed = window.getComputedStyle(el);
                if (computed.overflow === 'hidden' || computed.overflowX === 'hidden' || computed.overflowY === 'hidden') {
                    overflowFixedElements.push({ el, originalOverflow: el.style.overflow });
                    el.style.overflow = 'visible';
                }
            });
        });

        try {
            // --- 4. Render each page with html2canvas ---
            const pdf = new JsPDF({
                unit: 'in',
                format: [pageWidthIn, pageHeightIn],
                orientation: orientation
            });

            for (let i = 0; i < pages.length; i++) {
                const pct = Math.round(((i) / pages.length) * 90);
                onProgress?.(pct);
                console.log(`[PDF Export] Rendering page ${i + 1}/${pages.length}... (${pct}%)`);

                // Small yield to let React update the progress bar
                await new Promise(resolve => setTimeout(resolve, 10));

                const canvas = await window.html2canvas(pages[i], {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    logging: false,
                    width: pageWidthPx,
                    height: pageHeightPx,
                    backgroundColor: '#ffffff'
                });

                if (i > 0) {
                    pdf.addPage([pageWidthIn, pageHeightIn], orientation);
                }

                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthIn, pageHeightIn, undefined, 'FAST');
            }

            onProgress?.(95);
            console.log('[PDF Export] All pages rendered, generating PDF blob...');

            // --- 5. Trigger download ---
            const pdfBlob = pdf.output('blob');
            console.log('[PDF Export] PDF blob size:', pdfBlob.size, 'bytes');

            const blobUrl = URL.createObjectURL(pdfBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = `${fileName}.pdf`;
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();

            setTimeout(() => {
                document.body.removeChild(downloadLink);
                URL.revokeObjectURL(blobUrl);
            }, 1000);

            onProgress?.(100);
            console.log('[PDF Export] Download triggered successfully');

        } catch (err) {
            console.error('[PDF Export] Error:', err);
            alert('An error occurred during PDF export. Please try again.');
        } finally {
            // --- 6. Restore removed editor UI elements & styles ---
            overflowFixedElements.forEach(({ el, originalOverflow }) => {
                el.style.overflow = originalOverflow;
            });
            removedElements.forEach(({ parent, element, nextSibling }) => {
                if (nextSibling) {
                    parent.insertBefore(element, nextSibling);
                } else {
                    parent.appendChild(element);
                }
            });
            console.log('[PDF Export] Cleanup complete');
        }
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

    const handleExportDOCX = async (fileName: string, onProgress?: (percent: number) => void) => {
        if (!window.html2canvas) {
            alert('DOCX export requires html2canvas to be loaded.');
            return;
        }

        console.log('[DOCX Export] Starting native export for:', fileName);
        onProgress?.(0);

        // --- Find visible workspace pages ---
        const workspace = document.querySelector('.editor-workspace');
        if (!workspace) {
            alert('Workspace not found.');
            return;
        }

        const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
        if (pages.length === 0) {
            alert('No pages found to export.');
            return;
        }

        console.log('[DOCX Export] Found', pages.length, 'pages');

        // --- Temporarily clean up editor UI elements ---
        const removedElements: { parent: Node; element: Node; nextSibling: Node | null }[] = [];
        const editorSelectors = '.image-overlay, .resize-handle, .drag-handle, .text-mode-badge, .marquee, .context-menu, .page-ruler, .margin-guides';

        workspace.querySelectorAll(editorSelectors).forEach(el => {
            if (el.parentNode) {
                removedElements.push({ parent: el.parentNode, element: el, nextSibling: el.nextSibling });
                el.parentNode.removeChild(el);
            }
        });

        const selectedEls = workspace.querySelectorAll('[data-selected]');
        selectedEls.forEach(el => el.removeAttribute('data-selected'));
        const multiSelectedEls = workspace.querySelectorAll('[data-multi-selected]');
        multiSelectedEls.forEach(el => el.removeAttribute('data-multi-selected'));

        const overflowFixedElements: { el: HTMLElement; originalOverflow: string }[] = [];
        pages.forEach(page => {
            overflowFixedElements.push({ el: page, originalOverflow: page.style.overflow });
            page.style.overflow = 'visible';
            page.querySelectorAll('*').forEach(child => {
                const el = child as HTMLElement;
                const computed = window.getComputedStyle(el);
                if (computed.overflow === 'hidden' || computed.overflowX === 'hidden' || computed.overflowY === 'hidden') {
                    overflowFixedElements.push({ el, originalOverflow: el.style.overflow });
                    el.style.overflow = 'visible';
                }
            });
        });

        // Convert CSS colors to Hex for DOCX
        const parseColorToHex = (colorString: string): string => {
            if (!colorString || colorString === 'transparent' || colorString === 'rgba(0, 0, 0, 0)') return undefined as any;
            if (colorString.startsWith('#')) return colorString.replace('#', '');
            const rgb = colorString.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                return ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1).toUpperCase();
            }
            return undefined as any;
        };

        const cssPxToHalfPoint = (px: string): number => {
            if (!px) return 24; // default 12pt
            const num = parseFloat(px);
            if (isNaN(num)) return 24;
            if (px.includes('pt')) return Math.round(num * 2);
            return Math.round(num * 0.75 * 2); // px to pt to half-points
        };

        const cssToTwip = (px: string): number => {
            if (!px) return 0;
            const num = parseFloat(px);
            if (isNaN(num)) return 0;
            if (px.includes('pt')) return Math.round(num * 20); // 1pt = 20 twips
            if (px.includes('in')) return Math.round(num * 1440); // 1in = 1440 twips
            return Math.round(num * 15); // 1px = 15 twips
        };

        const getSpacingOption = (computed: CSSStyleDeclaration) => {
            const spacing: any = {};
            const mb = cssToTwip(computed.marginBottom);
            if (mb > 0) spacing.after = mb;

            const lh = computed.lineHeight;
            if (lh === 'normal') {
                spacing.line = 240 * 1.5; // Default word normal is often 1.15, but writer app defaults to 1.5
            } else if (lh.includes('px') || lh.includes('pt')) {
                spacing.line = cssToTwip(lh);
            } else if (!isNaN(parseFloat(lh))) {
                spacing.line = Math.round(parseFloat(lh) * 240); // Multiplier (e.g. 1.5 * 240)
            }
            return Object.keys(spacing).length > 0 ? spacing : undefined;
        };

        const renderElementAsImageRun = async (el: HTMLElement): Promise<Paragraph | null> => {
            try {
                const scale = 1.5; // lower scale to save memory for huge books
                const canvas = await window.html2canvas(el, {
                    scale, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
                });

                // Get buffer array from canvas
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // jpeg is much smaller than png
                const base64Data = dataUrl.split(',')[1];
                const uint8Array = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

                // Max width available in DOCX considering 0.6in margins on 8.5in page = 7.3in = ~700px
                const maxDocxWidth = 650;
                // Scale up image to fill page width if it's close, or just use natural size up to maxDocxWidth
                let widthPx = Math.min(Math.round(canvas.width), maxDocxWidth);
                if (el.offsetWidth > 400 || el.tagName === 'TABLE') {
                    widthPx = maxDocxWidth; // Force full width for large blocks/tables
                }
                const heightPx = Math.round(canvas.height * (widthPx / canvas.width));

                return new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 240 }, // Added space below images
                    children: [
                        new ImageRun({
                            type: 'jpg',
                            data: uint8Array,
                            transformation: { width: widthPx, height: heightPx },
                        })
                    ]
                });
            } catch (e) {
                console.error('[DOCX Export] Error rendering element as image:', e);
                return null;
            }
        };

        const shouldRenderAsImage = (el: HTMLElement): boolean => {
            const classList = el.classList;
            const computed = window.getComputedStyle(el);
            const hasBgImage = computed.backgroundImage && computed.backgroundImage !== 'none';
            const hasBgColor = computed.backgroundColor && computed.backgroundColor !== 'transparent' && computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'rgb(255, 255, 255)';
            const hasBorder = computed.borderStyle && computed.borderStyle !== 'none';
            const hasBorderRadius = computed.borderRadius && computed.borderRadius !== '0px';

            if (classList.contains('tracing-line') || classList.contains('writing-lines') || classList.contains('toc-container') || classList.contains('toc-table')) return true;
            if (el.tagName === 'TABLE') return true;
            if (hasBgImage) return true;
            if ((hasBgColor || hasBorder) && hasBorderRadius) return true;
            if (computed.display === 'flex' || computed.display === 'grid') {
                const isSimpleText = el.children.length <= 1 && !el.querySelector('img, table, svg');
                if (!isSimpleText) return true;
            }
            return false;
        };

        const parseTextNodeStyles = (el: HTMLElement, text: string): TextRun => {
            const computed = window.getComputedStyle(el);
            const isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600 || el.tagName === 'B' || el.tagName === 'STRONG';
            const isItalic = computed.fontStyle === 'italic' || el.tagName === 'I' || el.tagName === 'EM';
            const isUnderline = computed.textDecoration.includes('underline') || el.tagName === 'U';
            const sizeString = computed.fontSize;

            return new TextRun({
                text: text,
                bold: isBold,
                italics: isItalic,
                underline: isUnderline ? {} : undefined,
                color: parseColorToHex(computed.color),
                size: cssPxToHalfPoint(sizeString),
                font: computed.fontFamily.split(',')[0].replace(/['"]/g, ''),
                shading: parseColorToHex(computed.backgroundColor) ? {
                    type: "solid",
                    color: parseColorToHex(computed.backgroundColor)
                } : undefined
            });
        };

        // Recursively build docx sub-elements (TextRuns)
        const processInlineChildren = (el: Node, inheritedStyles?: CSSStyleDeclaration): TextRun[] => {
            let runs: TextRun[] = [];
            for (const child of Array.from(el.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) {
                    let text = child.textContent;
                    if (text) {
                        const computed = window.getComputedStyle(el as HTMLElement);
                        if (computed.whiteSpace !== 'pre' && computed.whiteSpace !== 'pre-wrap') {
                            text = text.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
                        }
                        runs.push(parseTextNodeStyles(el as HTMLElement, text));
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const childEl = child as HTMLElement;
                    if (childEl.tagName === 'BR') {
                        runs.push(new TextRun({ break: 1 }));
                    } else {
                        runs = runs.concat(processInlineChildren(childEl));
                    }
                }
            }
            return runs;
        };

        // Build top-level document structure
        const docChildren: any[] = [];

        try {
            let wasLastParagraphEmpty = false;

            for (let i = 0; i < pages.length; i++) {
                const pct = Math.round((i / pages.length) * 90);
                onProgress?.(pct);
                console.log(`[DOCX Export] Processing page ${i + 1}/${pages.length}... (${pct}%)`);

                await new Promise(resolve => setTimeout(resolve, 10));

                const page = pages[i];

                // Process elements in page
                const topLevelElements = Array.from(page.children);
                for (const child of topLevelElements) {
                    const el = child as HTMLElement;
                    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.classList.contains('page-footer')) continue;

                    if (shouldRenderAsImage(el)) {
                        const imgPara = await renderElementAsImageRun(el);
                        if (imgPara) docChildren.push(imgPara);
                        continue;
                    }

                    if (el.tagName === 'IMG') {
                        const img = el as HTMLImageElement;
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth || img.width || 300;
                            canvas.height = img.naturalHeight || img.height || 300;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                                const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                                const uint8Array = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                                docChildren.push(new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    spacing: { after: 240 }, // Added space below images
                                    children: [
                                        new ImageRun({
                                            type: 'jpg',
                                            data: uint8Array,
                                            transformation: { width: Math.min(canvas.width, 650), height: Math.min(canvas.height, Math.round(canvas.height * (650 / canvas.width))) }
                                        })
                                    ]
                                }));
                            }
                        } catch (e) { }
                        continue;
                    }

                    const computed = window.getComputedStyle(el);
                    let alignment: any = AlignmentType.LEFT;
                    if (computed.textAlign === 'center') alignment = AlignmentType.CENTER;
                    if (computed.textAlign === 'right') alignment = AlignmentType.RIGHT;
                    if (computed.textAlign === 'justify') alignment = AlignmentType.JUSTIFIED;

                    const inlineRuns = processInlineChildren(el);

                    const isWhitespaceOnly = !el.textContent || !el.textContent.trim();
                    // Skip multiple consecutive empty paragraphs
                    if (isWhitespaceOnly && el.tagName !== 'IMG' && !shouldRenderAsImage(el)) {
                        if (wasLastParagraphEmpty) continue;
                        wasLastParagraphEmpty = true;
                    } else {
                        wasLastParagraphEmpty = false;
                    }

                    if (inlineRuns.length > 0 || isWhitespaceOnly) {
                        let wantsPageBreak = computed.pageBreakBefore === 'always' || computed.breakBefore === 'always' || computed.breakBefore === 'page';
                        let headingLevel = undefined;
                        let lineSpacingMultiplier = undefined;

                        if (el.tagName === 'H1') { headingLevel = HeadingLevel.HEADING_1; lineSpacingMultiplier = 1.1; wantsPageBreak = true; }
                        if (el.tagName === 'H2') { headingLevel = HeadingLevel.HEADING_2; lineSpacingMultiplier = 1.15; wantsPageBreak = true; }
                        if (el.tagName === 'H3') { headingLevel = HeadingLevel.HEADING_3; lineSpacingMultiplier = 1.15; }
                        if (el.tagName === 'H4') { headingLevel = HeadingLevel.HEADING_4; lineSpacingMultiplier = 1.15; }
                        if (el.tagName === 'H5') { headingLevel = HeadingLevel.HEADING_5; lineSpacingMultiplier = 1.15; }
                        if (el.tagName === 'H6') { headingLevel = HeadingLevel.HEADING_6; lineSpacingMultiplier = 1.15; }

                        const spacing = getSpacingOption(computed);
                        let indent = undefined;
                        const indentTwip = cssToTwip(computed.textIndent);
                        if (indentTwip > 0) {
                            indent = { firstLine: indentTwip };
                        }

                        // Apply tighter line spacing for headings if not explicitly set
                        if (headingLevel && spacing && (!spacing.line || spacing.line > 240 * 1.2)) {
                            spacing.line = Math.round(240 * (lineSpacingMultiplier || 1.15));
                        }

                        // Insert an editable PageBreak before the element, except if it's the very first element in the document
                        if (wantsPageBreak && docChildren.length > 0) {
                            docChildren.push(new Paragraph({ children: [new PageBreak()] }));
                        }

                        docChildren.push(new Paragraph({
                            children: inlineRuns,
                            alignment: alignment,
                            heading: headingLevel,
                            spacing: spacing || { after: 120 },
                            indent: indent
                        }));
                    }
                }
            }

            onProgress?.(95);
            console.log('[DOCX Export] Building DOCX file...');

            const doc = new Document({
                sections: [{
                    properties: {
                        page: {
                            margin: {
                                top: convertInchesToTwip(0.6),
                                right: convertInchesToTwip(0.6),
                                bottom: convertInchesToTwip(0.6),
                                left: convertInchesToTwip(0.6),
                            },
                            size: {
                                width: convertInchesToTwip(8.5),
                                height: convertInchesToTwip(11),
                            }
                        }
                    },
                    children: docChildren
                }]
            });

            const docxBlob = await Packer.toBlob(doc);
            console.log('[DOCX Export] DOCX blob size:', docxBlob.size, 'bytes');

            saveAs(docxBlob, `${fileName}.docx`);

            onProgress?.(100);
            console.log('[DOCX Export] Download triggered successfully');

        } catch (err: any) {
            console.error('[DOCX Export] Error:', err);
            alert(`An error occurred during DOCX export:\n${err.message || String(err)}\n\nPlease check the console for more details.`);
        } finally {
            overflowFixedElements.forEach(({ el, originalOverflow }) => {
                el.style.overflow = originalOverflow;
            });
            removedElements.forEach(({ parent, element, nextSibling }) => {
                if (nextSibling) {
                    parent.insertBefore(element, nextSibling);
                } else {
                    parent.appendChild(element);
                }
            });
            console.log('[DOCX Export] Cleanup complete');
        }
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
            activeBlockRef.current = block;

            // Automatically show frame tools if it's a shape
            const isShape = block.matches('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle');
            if (isShape || state.shape !== 'none') {
                setShowFrameTools(true);
            }
        }
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
        let signature: string | null = null;

        // Resolve heading styles with correct priority:
        // 1. Already-saved heading styles (from previous H1 tagging or handleUpdateStyle)
        // 2. Styles from existing headings of the same level in the document
        // 3. Only as a LAST RESORT: capture from the selected element (if it's already that heading type)
        let resolvedStyles: Record<string, string> | undefined = undefined;
        if (targetTag === 'h1' || targetTag === 'h2' || targetTag === 'h3') {
            const firstId = selectionMode.selectedIds[0];
            if (firstId) {
                const el = document.getElementById(firstId) as HTMLElement | null;
                if (el) {
                    signature = getHeadingStyleSignature(el);
                }
            }

            // Priority 1: Already-saved styles for this heading level
            // ONLY use styles the user has explicitly set via "Update style" button.
            if (savedHeadingStylesRef.current[targetTag]) {
                resolvedStyles = savedHeadingStylesRef.current[targetTag];
            }
            // Do NOT auto-capture styles from existing headings in the document.
            // The user must explicitly define their H1/H2/H3 style via "Update style".
            // This ensures Word-like behavior where imported file styles don't dictate
            // future heading appearances.
        }

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
                    // Apply saved heading styles to ensure visual consistency
                    if (resolvedStyles) {
                        applyInlineHeadingStyles(updatedElement as HTMLElement, resolvedStyles);
                    }
                }

                // 2. Add to Structure List (avoid duplicates)
                if (!structureEntries.some(e => e.id === id)) {
                    // Use the updated element (old one may be detached from DOM after replaceChild)
                    const liveEl = document.getElementById(id) as HTMLElement | null;
                    const page = liveEl?.closest('.page');
                    const pages = document.querySelectorAll('.page');
                    let pageNum = 1;
                    pages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });

                    newEntries.push({
                        id: id,
                        elementId: id,
                        text: (liveEl || element).innerText.substring(0, 50),
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

        if (targetTag === 'h1' || targetTag === 'h2' || targetTag === 'h3') {
            const prevSig = manualHeadingSignatures[targetTag];
            const prevCount = manualHeadingCounts[targetTag];
            const nextCount = prevCount + selectionMode.selectedIds.length;

            setManualHeadingCounts(prev => ({
                ...prev,
                [targetTag]: nextCount
            } as { h1: number; h2: number; h3: number }));

            if (signature) {
                if (!prevSig) {
                    setManualHeadingSignatures(prev => ({ ...prev, [targetTag]: signature }));
                    if (nextCount >= 2) {
                        openStructurePatternModal(targetTag, signature);
                    }
                } else if (prevSig === signature && nextCount >= 2) {
                    openStructurePatternModal(targetTag, signature);
                }
            }
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
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        const element = workspace?.querySelector(`#${CSS.escape(elementId)}`) as HTMLElement | null
            || document.getElementById(elementId);
        if (!element) return;

        const container = editorContainerRef.current;
        const page = element.closest('.page') as HTMLElement | null;
        if (page) {
            page.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (container) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const targetTop = elementRect.top - containerRect.top + container.scrollTop - 80;
            container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
        } else {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        if (container && page) {
            requestAnimationFrame(() => {
                const containerRect = container.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                const targetTop = elementRect.top - containerRect.top + container.scrollTop - 80;
                container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
            });
        }

        const originalOutline = element.style.outline;
        element.style.outline = '2px solid #a855f7';
        element.style.transition = 'outline 0.3s';
        setTimeout(() => {
            element.style.outline = originalOutline;
        }, 1500);
    };

    const handleUpdateEntryStatus = (id: string, status: 'approved' | 'rejected') => {
        // 1. Update local list state for immediate UI feedback
        setStructureEntries(prev => prev.map(e => e.id === id ? { ...e, status } : e));

        const entry = structureEntries.find(e => e.id === id);
        if (!entry) return;

        // 2. Persist to DOM/HTML
        const element = document.getElementById(entry.elementId);
        if (element) {
            element.setAttribute('data-structure-status', status);

            // --- Feature: Auto-convert detected tags on approval ---
            if (status === 'approved') {
                if (entry.type.startsWith('detected-')) {
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
            } else if (status === 'rejected') {
                // Feature: Auto-remove similar structure elements when one is deleted
                const workspace = document.querySelector('.editor-workspace');
                if (workspace) {
                    const sig = getElementSignature(element, true);

                    // Find similar items that are currently in the TOC or auto-detected
                    const rawMatches = findSimilarElements(sig, null, workspace as HTMLElement, true);

                    const filteredMatches = rawMatches.filter(match => {
                        const el = match.element;
                        // Exclude the one we just manually deleted
                        if (el.id === entry.elementId) return false;

                        // Check if it's currently an active entry in the sidebar
                        const isPendingEntry = structureEntries.some(e => e.elementId === el.id && e.status !== 'rejected');
                        const hasAttr = el.hasAttribute('data-structure-status');
                        const isHTag = /^H[1-6]$/.test(el.tagName);

                        return isPendingEntry || hasAttr || isHTag;
                    });

                    if (filteredMatches.length > 0) {
                        setPatternModal({
                            isOpen: true,
                            actionType: 'remove-structure',
                            matches: filteredMatches
                        });
                        return; // Defer `updateDocState` to the PatternModal's OK/Cancel buttons
                    }
                }
            }

            // Fallback: If no patterns found or it's an approval, trigger standard save
            const workspaceToSave = document.querySelector('.editor-workspace');
            if (workspaceToSave) {
                updateDocState({ ...docState, htmlContent: workspaceToSave.innerHTML }, true);
            }
        }
    };

    const handleClearStructure = () => {
        const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
        if (workspace) {
            workspace.querySelectorAll('h1, h2, h3, [data-structure-status]').forEach(el => {
                (el as HTMLElement).setAttribute('data-structure-status', 'rejected');
            });
            updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
        } else {
            const parser = new DOMParser();
            const doc = parser.parseFromString(docState.htmlContent, 'text/html');
            doc.querySelectorAll('h1, h2, h3, [data-structure-status]').forEach(el => {
                (el as HTMLElement).setAttribute('data-structure-status', 'rejected');
            });
            updateDocState({ ...docState, htmlContent: doc.body.innerHTML }, true);
        }

        setStructureEntries(prev => prev.map(entry => ({ ...entry, status: 'rejected' })));
        requestAnimationFrame(() => {
            setStructureEntries([]);
        });
        setAutoStructureEnabled(false);
        setAutoStructureSuggested(false);
        setAutoStructureSuggestion(null);
    };
    const handleAutoFillStructure = () => {
        runStructureScan();
    };

    const handleToggleAutoStructure = () => {
        setAutoStructureEnabled(prev => !prev);
    };

    const handleApplyAutoStructureSuggestion = () => {
        if (!autoStructureSuggestion) return;
        openStructurePatternModal(autoStructureSuggestion.level, autoStructureSuggestion.signature);
        setAutoStructureSuggested(false);
    };

    const handleDismissAutoStructureSuggestion = () => {
        setAutoStructureSuggested(false);
        setAutoStructureSuggestion(null);
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
                    onClearStructure={handleClearStructure}
                    onAutoFillStructure={handleAutoFillStructure}
                    autoStructureEnabled={autoStructureEnabled}
                    onToggleAutoStructure={handleToggleAutoStructure}
                    autoStructureSuggested={autoStructureSuggested}
                    autoStructureSuggestionLevel={autoStructureSuggestion?.level || null}
                    onApplyAutoStructureSuggestion={handleApplyAutoStructureSuggestion}
                    onDismissAutoStructureSuggestion={handleDismissAutoStructureSuggestion}
                />

                <div className="flex-1 relative" onScroll={handleScroll}>
                    <Editor
                        htmlContent={docState.htmlContent}
                        cssContent={docState.cssContent}
                        onContentChange={handleContentChange}
                        onSelectionChange={onSelectionChange}
                        onBlockClick={(block) => {
                            setActiveBlock(block);
                            activeBlockRef.current = block;
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
                        onRefreshTOC={handleRefreshTOC}
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
                    />
                    <ZoomControls
                        zoom={zoom}
                        viewMode={viewMode}
                        onZoomChange={handleZoomChange}
                        onViewModeChange={setViewMode}
                    />
                </div>
            </div>

            <TOCModal
                isOpen={isTOCModalOpen}
                onClose={() => setIsTOCModalOpen(false)}
                onInsert={handleInsertTOC}
                onRemove={handleRemoveTOC}
            />

            <SettingsModal
                isOpen={isSettingsModalOpen}
                onClose={() => setIsSettingsModalOpen(false)}
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
