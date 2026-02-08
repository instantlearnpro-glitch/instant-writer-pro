import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SelectionState, ImageProperties, HRProperties, StructureEntry } from '../types';
import ImageOverlay from './ImageOverlay';
import { reflowPages } from '../utils/pagination';
import MarginGuides from './MarginGuides';
import PageRuler from './PageRuler';
import BlockContextMenu from './BlockContextMenu';
import DragHandle from './DragHandle';
import PatternModal from './PatternModal';
import QRCodeModal from './QRCodeModal';
import LinkToolbar from './LinkToolbar';
import TableTocModal from './TableTocModal';
import { PatternTracker, findSimilarElements, getElementSignature, PatternMatch, ActionType } from '../utils/patternDetector';

interface EditorProps {
  htmlContent: string;
  cssContent: string;
  onContentChange: (html: string) => void;
  onSelectionChange: (state: SelectionState, activeBlock: HTMLElement | null) => void;
  onBlockClick?: (block: HTMLElement | null) => void;
  onImageSelect: (img: HTMLImageElement | null) => void;
  onTextLayerSelect: (el: HTMLElement | null) => void;
  onHRSelect: (hr: HTMLHRElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedImage: HTMLImageElement | null;
  selectedTextLayer: HTMLElement | null;
  selectedHR: HTMLHRElement | null;
  selectedFooter: HTMLElement | null;
  onFooterSelect: (footer: HTMLElement | null) => void;
  imageProperties: ImageProperties;
  onCropComplete: (newSrc: string, width: number, height: number) => void;
  onCancelCrop: () => void;
  onPageBreak: () => void;
  onInsertHorizontalRule: () => void;
  onInsertImage: () => void;
  onInsertTextLayerAt: (page: HTMLElement, x: number, y: number) => void;
  isTextLayerMode: boolean;
  onToggleMultiSelect: (el: HTMLElement | null) => void;
  onClearMultiSelect: () => void;
  multiSelectedElements: string[];
  onDistributeMultiSelection: (axis: 'x' | 'y', delta?: number) => void;
  onAlignMultiSelection: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeAdjustAxis: 'x' | 'y' | null;
  onStartDistributeAdjust: (axis: 'x' | 'y') => void;
  onEndDistributeAdjust: () => void;
  showMarginGuides: boolean;
  showSmartGuides: boolean;
  pageMargins: { top: number, bottom: number, left: number, right: number };
  onMarginChange: (key: 'top' | 'bottom' | 'left' | 'right', value: number) => void;
  selectionMode?: { active: boolean; level: string | null; selectedIds: string[] };
  onBlockSelection?: (id: string) => void;
  suppressSelectionRef?: React.MutableRefObject<boolean>;
  zoom: number;
  viewMode: 'single' | 'double';
  onCopyStyle: () => void;
  onPasteStyle: () => void;
  hasStyleClipboard: boolean;
}

// Helper to convert RGB/RGBA to Hex
const rgbToHex = (rgb: string) => {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff'; 
  const result = rgb.match(/\d+/g);
  if (!result || result.length < 3) return '#000000';
  
  const r = parseInt(result[0]).toString(16).padStart(2, '0');
  const g = parseInt(result[1]).toString(16).padStart(2, '0');
  const b = parseInt(result[2]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
};

const mapFontSizeToCommandValue = (fontSizePx: number) => {
  return String(Math.max(1, Math.round(fontSizePx)));
};

const hasAncestorTag = (node: Node | null, tagNames: string[], stopAt?: HTMLElement | null) => {
  let element = node
    ? (node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement)
    : null;
  const tags = tagNames.map(tag => tag.toUpperCase());
  while (element) {
    if (tags.includes(element.tagName)) return true;
    if (stopAt && element === stopAt) break;
    element = element.parentElement;
  }
  return false;
};

const Editor: React.FC<EditorProps> = ({ 
  htmlContent, 
  cssContent, 
  onContentChange,
  onSelectionChange,
  onBlockClick,
  onImageSelect,
  onTextLayerSelect,
  onHRSelect,
  selectedFooter,
  onFooterSelect,
  containerRef,
  selectedImage,
  selectedTextLayer,
  showMarginGuides,
  showSmartGuides,
  pageMargins,
  onMarginChange,
  selectionMode,
  onBlockSelection,
  suppressSelectionRef,
  imageProperties,
  onCropComplete,
  onCancelCrop,
  onPageBreak,
  onInsertHorizontalRule,
  onInsertImage,
  onInsertTextLayerAt,
  isTextLayerMode,
  onToggleMultiSelect,
  onClearMultiSelect,
  multiSelectedElements,
  onDistributeMultiSelection = (_axis: 'x' | 'y', _delta?: number) => {},
  onAlignMultiSelection = (_mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {},
  distributeAdjustAxis = null,
  onStartDistributeAdjust = (_axis: 'x' | 'y') => {},
  onEndDistributeAdjust = () => {},
  zoom,
  viewMode,
  onCopyStyle,
  onPasteStyle,
  hasStyleClipboard
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageRects, setPageRects] = useState<{ top: number; left: number; width: number; height: number }[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; block: HTMLElement | null; linkUrl?: string; page?: HTMLElement | null } | null>(null);
  const [activeBlock, setActiveBlock] = useState<HTMLElement | null>(null);
  const [qrModal, setQrModal] = useState<{ isOpen: boolean; url: string }>({ isOpen: false, url: '' });
  const [activeLink, setActiveLink] = useState<{ url: string; x: number; y: number; element: HTMLAnchorElement } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [marginOverflowRects, setMarginOverflowRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const distributeDragRef = useRef<{ active: boolean; lastClient: number }>({ active: false, lastClient: 0 });
  const marqueeRef = useRef<{ active: boolean; startX: number; startY: number; didDrag: boolean; suppressClick: boolean }>({
      active: false,
      startX: 0,
      startY: 0,
      didDrag: false,
      suppressClick: false
  });
  const marginCheckRafRef = useRef<number | null>(null);
  const [tableTocModal, setTableTocModal] = useState<{
      isOpen: boolean;
      tableId: string;
      rows: { index: number; label: string; selectedId: string }[];
      anchors: { id: string; label: string; page: number }[];
  }>({ isOpen: false, tableId: '', rows: [], anchors: [] });

  const safeDistribute = (axis: 'x' | 'y', delta: number = 0) => {
      if (typeof onDistributeMultiSelection === 'function') {
          onDistributeMultiSelection(axis, delta);
      }
  };

  const startDistributeDrag = (e: React.MouseEvent) => {
      if (!distributeAdjustAxis) return;
      e.preventDefault();
      e.stopPropagation();
      const startClient = distributeAdjustAxis === 'x' ? e.clientX : e.clientY;
      distributeDragRef.current = { active: true, lastClient: startClient };

      const onMove = (ev: MouseEvent) => {
          if (!distributeDragRef.current.active) return;
          const current = distributeAdjustAxis === 'x' ? ev.clientX : ev.clientY;
          const delta = current - distributeDragRef.current.lastClient;
          if (delta !== 0) {
              onDistributeMultiSelection(distributeAdjustAxis, delta);
              distributeDragRef.current.lastClient = current;
          }
      };

      const onUp = () => {
          distributeDragRef.current.active = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
  };

  const safeAlign = (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (typeof onAlignMultiSelection === 'function') {
          onAlignMultiSelection(mode);
      }
  };

  const normalizeText = (text: string) => text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const getPageIndexForElement = (el: HTMLElement, pages: HTMLElement[]) => {
      const pageEl = el.closest('.page');
      if (!pageEl) return 1;
      const index = pages.findIndex(page => page === pageEl);
      return index >= 0 ? index + 1 : 1;
  };

  const findHeadingMatch = (label: string, headings: { id: string; text: string; page: number }[]) => {
      const exact = headings.find(h => h.text === label);
      if (exact) return exact;
      const starts = headings.find(h => h.text.startsWith(label));
      if (starts) return starts;
      const contains = headings.find(h => h.text.includes(label));
      return contains || null;
  };

  const updateTocTablePageNumbers = (workspace: HTMLElement) => {
      const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
      const tables = Array.from(workspace.querySelectorAll('table.toc-table, table[data-toc-table="true"]')) as HTMLTableElement[];

      tables.forEach(table => {
          const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
          rows.forEach(row => {
              const targetId = row.getAttribute('data-toc-target');
              if (!targetId) return;
              const target = workspace.querySelector(`#${CSS.escape(targetId)}`) as HTMLElement | null;
              if (!target) return;
              const page = getPageIndexForElement(target, pages);
              const cells = Array.from(row.querySelectorAll('th, td')) as HTMLElement[];
              if (cells.length === 0) return;
              const pageCell = cells[cells.length - 1];
              pageCell.textContent = String(page);
              pageCell.setAttribute('data-toc-page', 'true');
          });
      });
  };

  const openTableTocModal = (table: HTMLTableElement) => {
      if (!contentRef.current) return;
      const workspace = contentRef.current;
      if (!table.id) {
          table.id = `toc-table-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
      const anchorEls = Array.from(workspace.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, blockquote')) as HTMLElement[];
      const anchors = anchorEls
          .map((el, index) => {
              if (!el.id) {
                  el.id = `toc-${index}-${Date.now()}`;
              }
              const raw = (el.textContent || '').trim();
              if (!raw) return null;
              return {
                  id: el.id,
                  label: raw.length > 140 ? `${raw.slice(0, 140)}…` : raw,
                  page: getPageIndexForElement(el, pages),
                  normalized: normalizeText(raw)
              };
          })
          .filter(Boolean) as Array<{ id: string; label: string; page: number; normalized: string }>;

      const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];
      const rowMappings = rows.map((row, index) => {
          const cells = Array.from(row.querySelectorAll('th, td')) as HTMLElement[];
          const labelCell = cells[0];
          const rawLabel = (labelCell?.textContent || '').trim();
          const normalized = normalizeText(rawLabel);
          let selectedId = '';
          if (normalized) {
              const exact = anchors.find(a => a.normalized === normalized);
              const starts = anchors.find(a => a.normalized.startsWith(normalized));
              const contains = anchors.find(a => a.normalized.includes(normalized));
              const match = exact || starts || contains || null;
              if (match) selectedId = match.id;
          }
          return { index, label: rawLabel, selectedId };
      });

      setTableTocModal({
          isOpen: true,
          tableId: table.id,
          rows: rowMappings,
          anchors: anchors.map(a => ({ id: a.id, label: a.label, page: a.page }))
      });
  };

  const applyTableTocMapping = (tableId: string, rows: { index: number; label: string; selectedId: string }[]) => {
      if (!contentRef.current) return;
      const workspace = contentRef.current;
      const table = workspace.querySelector(`#${CSS.escape(tableId)}`) as HTMLTableElement | null;
      if (!table) return;

      const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
      const tableRows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[];

      rows.forEach(row => {
          const targetId = row.selectedId;
          const target = targetId ? (workspace.querySelector(`#${CSS.escape(targetId)}`) as HTMLElement | null) : null;
          const tableRow = tableRows[row.index];
          if (!tableRow) return;
          const cells = Array.from(tableRow.querySelectorAll('th, td')) as HTMLElement[];
          if (cells.length < 2) return;

          if (!target) {
              tableRow.removeAttribute('data-toc-target');
              return;
          }

          const labelCell = cells[0];
          const pageCell = cells[cells.length - 1];
          const rawLabel = (labelCell.textContent || '').trim();

          tableRow.setAttribute('data-toc-target', targetId);
          table.setAttribute('data-toc-table', 'true');
          table.classList.add('toc-table');

          const existingLink = labelCell.querySelector('a') as HTMLAnchorElement | null;
          if (existingLink) {
              existingLink.href = `#${targetId}`;
              existingLink.setAttribute('data-toc-link', 'true');
              existingLink.setAttribute('onclick', `const el = document.getElementById('${targetId}'); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return false;`);
              existingLink.textContent = rawLabel;
          } else {
              labelCell.innerHTML = `<a href="#${targetId}" data-toc-link="true" onclick="const el = document.getElementById('${targetId}'); if(el) { el.scrollIntoView({behavior: 'smooth', block: 'start'}); } return false;">${rawLabel}</a>`;
          }

          const page = getPageIndexForElement(target, pages);
          pageCell.textContent = String(page);
          pageCell.setAttribute('data-toc-page', 'true');
      });

      updateTocTablePageNumbers(workspace);
      reflowPages(workspace);
      onContentChange(workspace.innerHTML);
  };
  
  // Pattern detection
  const patternTrackerRef = useRef(new PatternTracker());
  const [patternModal, setPatternModal] = useState<{
    isOpen: boolean;
    actionType: string;
    signature: string;
    matches: PatternMatch[];
    command?: string;
    value?: string;
  }>({ isOpen: false, actionType: '', signature: '', matches: [] });

  // Generate dynamic CSS for selection highlights
  const selectionStyle = selectionMode?.active && selectionMode.selectedIds.length > 0
    ? `${selectionMode.selectedIds.map(id => `#${id}`).join(', ')} { outline: 2px dashed #8d55f1 !important; cursor: pointer !important; position: relative; z-index: 10; }`
    : '';

  // Initialize content
  const processingRef = useRef(false);
  useEffect(() => {
    if (selectionMode?.active) return;
    if (contentRef.current) {
        if (contentRef.current.innerHTML !== htmlContent) {
            contentRef.current.innerHTML = htmlContent;
            const imgs = contentRef.current.querySelectorAll('img');
            imgs.forEach(img => {
                img.onerror = () => { img.classList.add('broken-image'); };
            });
            if (!processingRef.current) {
                processingRef.current = true;
                try {
                    if (reflowPages(contentRef.current)) {
                        onContentChange(contentRef.current.innerHTML);
                    }
                } catch (err) {
                    console.error('Reflow error on load:', err);
                }
                setTimeout(() => { processingRef.current = false; }, 100);
            }
        }
    }
  }, [htmlContent]);

  // Measure pages for overlays
  useEffect(() => {
      if (!showMarginGuides || !contentRef.current || !containerRef.current) return;

      const updateRects = () => {
          if (!contentRef.current || !containerRef.current) return;
          
          const containerRect = containerRef.current.getBoundingClientRect();
          const pages = Array.from(contentRef.current.querySelectorAll('.page')) as HTMLElement[];
          
          const rects = pages.map(page => {
              const pageRect = page.getBoundingClientRect();
              return {
                  top: pageRect.top - containerRect.top + containerRef.current!.scrollTop,
                  left: pageRect.left - containerRect.left + containerRef.current!.scrollLeft,
                  width: pageRect.width,
                  height: pageRect.height
              };
          });
          setPageRects(rects);
      };

      updateRects();
      
      const observer = new ResizeObserver(updateRects);
      observer.observe(contentRef.current);
      window.addEventListener('resize', updateRects);
      
      return () => {
          observer.disconnect();
          window.removeEventListener('resize', updateRects);
      };
  }, [htmlContent, showMarginGuides, containerRef, zoom, cssContent]);

  const handleSelectionChange = useCallback(() => {
    if (suppressSelectionRef?.current) return;
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!contentRef.current?.contains(range.commonAncestorContainer)) return;

    const selectionNode = range.commonAncestorContainer;
    const selectionEl = selectionNode.nodeType === Node.ELEMENT_NODE
        ? (selectionNode as HTMLElement)
        : selectionNode.parentElement;
    if (selectionEl?.closest('.floating-text')) return;

    const startNode = range.startContainer;
    const targetElement = startNode.nodeType === Node.TEXT_NODE ? startNode.parentElement : startNode as HTMLElement;
    const block = targetElement?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle, .page-footer') as HTMLElement | null;

    if (!block) return;

    const computedBlock = window.getComputedStyle(block);
    const computedTarget = targetElement ? window.getComputedStyle(targetElement) : computedBlock;
    const fontSizePx = parseFloat(computedTarget.fontSize || '16');
    const fontWeight = computedTarget.fontWeight;
    const computedBold = fontWeight === 'bold' || parseInt(fontWeight, 10) >= 600;
    const textDecoration = computedTarget.textDecorationLine || computedTarget.textDecoration;
    const computedUnderline = textDecoration.includes('underline');
    const fontStyle = computedTarget.fontStyle || 'normal';
    const computedItalic = fontStyle === 'italic' || fontStyle === 'oblique';
    const boldTag = hasAncestorTag(range.startContainer, ['B', 'STRONG'], block) || hasAncestorTag(range.endContainer, ['B', 'STRONG'], block);
    const italicTag = hasAncestorTag(range.startContainer, ['I', 'EM'], block) || hasAncestorTag(range.endContainer, ['I', 'EM'], block);
    const underlineTag = hasAncestorTag(range.startContainer, ['U'], block) || hasAncestorTag(range.endContainer, ['U'], block);
    const ulTag = block.tagName === 'LI' && block.parentElement?.tagName === 'UL';
    const olTag = block.tagName === 'LI' && block.parentElement?.tagName === 'OL';
    const textAlign = computedBlock.textAlign || 'left';

    const shapeClass = block.classList.contains('shape-circle')
      ? 'circle'
      : block.classList.contains('shape-pill')
      ? 'pill'
      : block.classList.contains('shape-speech')
      ? 'speech'
      : block.classList.contains('shape-cloud')
      ? 'cloud'
      : block.classList.contains('shape-rectangle')
      ? 'rectangle'
      : block.classList.contains('mission-box')
      ? 'mission-box'
      : 'none';

    const safeParseInt = (val: string) => {
      const parsed = parseInt(val, 10);
      return isNaN(parsed) ? '0' : parsed.toString();
    };

    const state: SelectionState = {
      bold: computedBold || boldTag,
      italic: computedItalic || italicTag,
      underline: computedUnderline || underlineTag,
      ul: ulTag,
      ol: olTag,
      blockType: block.tagName.toLowerCase(),
      alignLeft: textAlign === 'left' || textAlign === 'start',
      alignCenter: textAlign === 'center',
      alignRight: textAlign === 'right' || textAlign === 'end',
      alignJustify: textAlign === 'justify',
      fontName: computedTarget.fontFamily || 'sans-serif',
      fontSize: mapFontSizeToCommandValue(fontSizePx),
      lineHeight: computedBlock.lineHeight || 'normal',
      letterSpacing: computedTarget.letterSpacing || 'normal',
      foreColor: rgbToHex(computedTarget.color),
      borderWidth: safeParseInt(computedBlock.borderTopWidth),
      borderColor: rgbToHex(computedBlock.borderTopColor),
      borderRadius: safeParseInt(computedBlock.borderRadius),
      backgroundColor: rgbToHex(computedBlock.backgroundColor),
      padding: safeParseInt(computedBlock.paddingTop),
      borderStyle: computedBlock.borderTopStyle || 'none',
      textAlign: textAlign,
      shape: shapeClass,
      width: block.style.width || '',
      range: range.cloneRange()
    };

    onSelectionChange(state, block);
  }, [onSelectionChange]);

  const buildSelectionStateFromElement = useCallback((element: HTMLElement, sourceElement?: HTMLElement | null): SelectionState => {
    const selection = window.getSelection();
    const selectionNode = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
    const selectionElement = selectionNode
      ? (selectionNode.nodeType === Node.TEXT_NODE ? selectionNode.parentElement : selectionNode as HTMLElement)
      : null;
    const textElement = sourceElement || (selectionElement && element.contains(selectionElement) ? selectionElement : element);

    const computedBlock = window.getComputedStyle(element);
    const computedText = window.getComputedStyle(textElement);
    const fontSizePx = parseFloat(computedText.fontSize || '16');
    const fontWeight = computedText.fontWeight;
    const isBold = fontWeight === 'bold' || parseInt(fontWeight, 10) >= 600;
    const textDecoration = computedText.textDecorationLine || computedText.textDecoration;
    const isUnderline = textDecoration.includes('underline');
    const fontStyle = computedText.fontStyle || 'normal';
    const textAlign = computedBlock.textAlign || 'left';

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

    const boldTag = hasAncestorTag(range?.startContainer || null, ['B', 'STRONG'], element) || hasAncestorTag(range?.endContainer || null, ['B', 'STRONG'], element);
    const italicTag = hasAncestorTag(range?.startContainer || null, ['I', 'EM'], element) || hasAncestorTag(range?.endContainer || null, ['I', 'EM'], element);
    const underlineTag = hasAncestorTag(range?.startContainer || null, ['U'], element) || hasAncestorTag(range?.endContainer || null, ['U'], element);
    const ulTag = element.tagName === 'LI' && element.parentElement?.tagName === 'UL';
    const olTag = element.tagName === 'LI' && element.parentElement?.tagName === 'OL';

    return {
      bold: isBold || boldTag,
      italic: (fontStyle === 'italic' || fontStyle === 'oblique') || italicTag,
      underline: isUnderline || underlineTag,
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
  }, []);

  const getMarqueeCandidates = useCallback(() => {
    if (!contentRef.current) return [] as HTMLElement[];
    const selector = [
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'li',
        'div:not(.page):not(.editor-workspace)',
        'span.mission-box',
        'span.shape-circle',
        'span.shape-pill',
        'span.shape-speech',
        'span.shape-cloud',
        'span.shape-rectangle',
        'table',
        'img',
        'hr',
        '.floating-text',
        '.writing-lines',
        '.tracing-line',
        'textarea'
    ].join(', ');

    const nestedContainers = [
        '.floating-text',
        '.writing-lines',
        '.tracing-line',
        '.mission-box',
        '.shape-rectangle',
        '.shape-circle',
        '.shape-pill',
        '.shape-speech',
        '.shape-cloud'
    ];

    const elements = Array.from(contentRef.current.querySelectorAll(selector)) as HTMLElement[];
    return elements.filter(el => {
        if (el.classList.contains('page') || el.classList.contains('editor-workspace')) return false;
        if (el.closest('table') && el.tagName !== 'TABLE') return false;
        for (const selector of nestedContainers) {
            const container = el.closest(selector);
            if (container && container !== el) return false;
        }
        return true;
    });
  }, []);

  const getMarginCandidates = useCallback(() => {
    if (!contentRef.current) return [] as HTMLElement[];
    const selector = [
        'p',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'blockquote',
        'li',
        'div:not(.page):not(.editor-workspace)',
        'span.mission-box',
        'span.shape-circle',
        'span.shape-pill',
        'span.shape-speech',
        'span.shape-cloud',
        'span.shape-rectangle',
        'table',
        'img',
        'hr',
        '.floating-text',
        '.writing-lines',
        '.tracing-line',
        'textarea'
    ].join(', ');

    const nestedContainers = [
        '.floating-text',
        '.writing-lines',
        '.tracing-line',
        '.mission-box',
        '.shape-rectangle',
        '.shape-circle',
        '.shape-pill',
        '.shape-speech',
        '.shape-cloud'
    ];

    const elements = Array.from(contentRef.current.querySelectorAll(selector)) as HTMLElement[];
    return elements.filter(el => {
        if (el.classList.contains('page') || el.classList.contains('editor-workspace')) return false;
        if (el.classList.contains('page-footer')) return false;
        if (el.closest('table') && el.tagName !== 'TABLE') return false;
        for (const selector of nestedContainers) {
            const container = el.closest(selector);
            if (container && container !== el) return false;
        }
        return true;
    });
  }, []);

  const updateMarginOverflows = useCallback(() => {
    if (!contentRef.current || !containerRef.current) {
        setMarginOverflowRects([]);
        return;
    }

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const overflows: Array<{ x: number; y: number; width: number; height: number }> = [];
    const PPI = 96;

    const elements = getMarginCandidates();
    elements.forEach(el => {
        if (el.getAttribute('data-ignore-margins') === 'true') return;
        const page = el.closest('.page') as HTMLElement | null;
        if (!page) return;
        const pageRect = page.getBoundingClientRect();
        const scale = pageRect.width / page.offsetWidth || 1;
        const leftBound = pageRect.left + pageMargins.left * PPI * scale;
        const rightBound = pageRect.right - pageMargins.right * PPI * scale;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const top = rect.top - containerRect.top + container.scrollTop;
        const height = rect.height;

        if (rect.left < leftBound) {
            const width = Math.min(leftBound, rect.right) - rect.left;
            if (width > 0) {
                overflows.push({
                    x: rect.left - containerRect.left + container.scrollLeft,
                    y: top,
                    width,
                    height
                });
            }
        }

        if (rect.right > rightBound) {
            const start = Math.max(rect.left, rightBound);
            const width = rect.right - start;
            if (width > 0) {
                overflows.push({
                    x: start - containerRect.left + container.scrollLeft,
                    y: top,
                    width,
                    height
                });
            }
        }
    });

    setMarginOverflowRects(overflows);
  }, [getMarginCandidates, pageMargins, containerRef]);

  useEffect(() => {
    if (!contentRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const workspace = contentRef.current;

    let marginTimeout: number | null = null;
    const scheduleUpdate = () => {
        if (marginTimeout) return;
        marginTimeout = window.setTimeout(() => {
            marginTimeout = null;
            if (marginCheckRafRef.current) return;
            marginCheckRafRef.current = window.requestAnimationFrame(() => {
                marginCheckRafRef.current = null;
                updateMarginOverflows();
            });
        }, 120);
    };

    scheduleUpdate();

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(workspace, { attributes: true, childList: true, subtree: true });
    container.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
        observer.disconnect();
        container.removeEventListener('scroll', scheduleUpdate);
        window.removeEventListener('resize', scheduleUpdate);
        if (marginTimeout) {
            window.clearTimeout(marginTimeout);
            marginTimeout = null;
        }
        if (marginCheckRafRef.current) {
            window.cancelAnimationFrame(marginCheckRafRef.current);
            marginCheckRafRef.current = null;
        }
    };
  }, [updateMarginOverflows, htmlContent, zoom, pageMargins]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
          // Clear page-break markers so reflow can pull content up
          if (contentRef.current) {
              contentRef.current.querySelectorAll('[data-page-break]').forEach(el => el.removeAttribute('data-page-break'));
          }

          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
              if (!selection.isCollapsed) {
                  return;
              }
              const range = selection.getRangeAt(0);
              const node = range.commonAncestorContainer;
              const element = node.nodeType === Node.ELEMENT_NODE
                  ? (node as HTMLElement)
                  : node.parentElement;

              // Cross-page backspace: merge first block on page with last block on previous page
              if (e.key === 'Backspace' && element) {
                  const textBlockSel = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, .floating-text, div[contenteditable="true"]';
                  const block = element.closest(textBlockSel) as HTMLElement | null;
                  const page = block?.closest('.page') as HTMLElement | null;

                  if (block && page) {
                      const isFlowEl = (el: Element): el is HTMLElement =>
                          el instanceof HTMLElement &&
                          !el.classList.contains('page-footer') &&
                          !el.classList.contains('image-overlay') &&
                          !el.classList.contains('resize-handle') &&
                          el.tagName !== 'STYLE' &&
                          window.getComputedStyle(el).position !== 'absolute' &&
                          window.getComputedStyle(el).position !== 'fixed';

                      const flowChildren = (Array.from(page.children) as HTMLElement[]).filter(isFlowEl);
                      const firstFlow = flowChildren[0] ?? null;
                      const isFirstBlock = firstFlow === block || (firstFlow && firstFlow.contains(block));

                      if (isFirstBlock) {
                          const pre = range.cloneRange();
                          pre.selectNodeContents(block);
                          pre.setEnd(range.startContainer, range.startOffset);
                          const caretAtStart = pre.toString() === '';

                          if (caretAtStart) {
                              const prevPage = page.previousElementSibling as HTMLElement | null;
                              if (prevPage && prevPage.classList.contains('page')) {
                                  const prevFlowChildren = (Array.from(prevPage.children) as HTMLElement[]).filter(isFlowEl);
                                  const prevBlock = prevFlowChildren.length > 0 ? prevFlowChildren[prevFlowChildren.length - 1] : null;

                                  if (prevBlock) {
                                      e.preventDefault();

                                      const sameTag = prevBlock.tagName === block.tagName;
                                      const isTextTag = /^(P|H[1-6]|LI|BLOCKQUOTE)$/.test(block.tagName);

                                      if (sameTag && isTextTag) {
                                          const caretRange = document.createRange();
                                          if (prevBlock.lastChild) {
                                              caretRange.setStartAfter(prevBlock.lastChild);
                                          } else {
                                              caretRange.setStart(prevBlock, 0);
                                          }
                                          caretRange.collapse(true);
                                          selection.removeAllRanges();
                                          selection.addRange(caretRange);

                                          while (block.firstChild) prevBlock.appendChild(block.firstChild);
                                          block.remove();
                                      } else {
                                          const footer = Array.from(prevPage.children).find(
                                              c => (c as HTMLElement).classList?.contains('page-footer')
                                          ) as HTMLElement | undefined;
                                          if (footer) prevPage.insertBefore(block, footer);
                                          else prevPage.appendChild(block);
                                      }

                                      if (contentRef.current) {
                                          reflowPages(contentRef.current);
                                          onContentChange(contentRef.current.innerHTML);
                                      }
                                      return;
                                  }
                              }
                          }
                      }
                  }
              }

              const inTextBlock = !!element?.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, .floating-text, div[contenteditable="true"]');
              if (inTextBlock) {
                  return;
              }
          }

          if (activeBlock) {
              e.preventDefault();
              activeBlock.remove();
              setActiveBlock(null);
              onImageSelect(null);
              onTextLayerSelect(null);
              onHRSelect(null);
              onFooterSelect(null);
              if (contentRef.current) {
                  reflowPages(contentRef.current);
                  onContentChange(contentRef.current.innerHTML);
              }
              return;
          }
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          onPageBreak();
          return;
      }

      if (e.key === 'Enter') {
          const selection = window.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          const range = selection.getRangeAt(0);
          const container = range.commonAncestorContainer;
          const element = container.nodeType === Node.ELEMENT_NODE
              ? (container as HTMLElement)
              : container.parentElement;
          const shape = element?.closest('.mission-box, .shape-rectangle, .shape-circle, .shape-pill, .shape-speech, .shape-cloud');
          if (shape && contentRef.current) {
              e.preventDefault();
              const paragraph = document.createElement('p');
              paragraph.appendChild(document.createElement('br'));
              shape.insertAdjacentElement('afterend', paragraph);
              const newRange = document.createRange();
              newRange.setStart(paragraph, 0);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
              reflowPages(contentRef.current);
              onContentChange(contentRef.current.innerHTML);
          }
      }
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
          const file = files[0];
          if (file.type.startsWith('image/')) {
              const reader = new FileReader();
              reader.onload = (event) => {
                  const imgUrl = event.target?.result as string;
                  if (imgUrl) {
                      document.execCommand('insertImage', false, imgUrl);
                      if (contentRef.current) {
                          reflowPages(contentRef.current);
                          onContentChange(contentRef.current.innerHTML);
                      }
                  }
              };
              reader.readAsDataURL(file);
          }
      }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      const target = e.target as HTMLElement;
      
      // Check for link or selection content
      let linkUrl: string | undefined = undefined;
      
      // 1. Check if target is a link or inside a link
      const link = target.closest('a') as HTMLAnchorElement | null;
      if (link) {
          linkUrl = link.href;
      } else {
          // 2. Check if current selection is a URL
          const selection = window.getSelection();
          if (selection && selection.toString().trim().length > 0) {
              const text = selection.toString().trim();
              // Simple URL validation
              if (text.match(/^(http|https):\/\/[^ "]+$/) || text.match(/^www\.[^ "]+$/)) {
                  linkUrl = text.startsWith('www.') ? `https://${text}` : text;
              }
          }
      }

      // Try to find any selectable block element - prioritize special elements
      let block = target.closest('.tracing-line, .writing-lines, .mission-box, .shape-rectangle, .shape-circle, .shape-pill, textarea') as HTMLElement | null;
      if (!block) {
          block = target.closest('hr') as HTMLElement | null;
      }
      if (!block) {
          block = target.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, img, table, tr, td, th, span:not(.editor-workspace), a') as HTMLElement | null;
      }

      if (block && (block.tagName === 'TD' || block.tagName === 'TH' || block.tagName === 'TR')) {
          const table = block.closest('table');
          if (table) block = table as HTMLElement;
      }
      
      // If we're on the target itself and it's selectable, use it
      if (!block && (target.tagName === 'HR' || target.tagName === 'IMG')) {
          block = target;
      }
      
      // SAFETY: Never select structural elements
      if (block && (
          block.classList.contains('page') || 
          block.classList.contains('editor-workspace') ||
          block.tagName === 'BODY' ||
          block.tagName === 'HTML'
      )) {
          block = null;
      }
      
      // Clear previous selection
      if (activeBlock) {
          activeBlock.removeAttribute('data-selected');
      }
      
      // Set new selection with visual feedback
      if (block) {
          block.setAttribute('data-selected', 'true');
      }
      
      setActiveBlock(block);
      const page = target.closest('.page') as HTMLElement | null;
      setContextMenu({ x: e.clientX, y: e.clientY, block, linkUrl, page });
  };

  const handleToggleMarginOverride = useCallback((block: HTMLElement | null) => {
      if (!block || block.classList.contains('page-footer')) return;
      if (block.getAttribute('data-ignore-margins') === 'true') {
          block.removeAttribute('data-ignore-margins');
      } else {
          block.setAttribute('data-ignore-margins', 'true');
      }
      if (contentRef.current) {
          onContentChange(contentRef.current.innerHTML);
      }
      updateMarginOverflows();
  }, [onContentChange, updateMarginOverflows]);

  const insertAtCursor = (html: string) => {
      const selection = window.getSelection();
      let range: Range | null = null;
      if (selection && selection.rangeCount > 0) {
          const candidate = selection.getRangeAt(0);
          if (contentRef.current?.contains(candidate.commonAncestorContainer)) {
              range = candidate;
          }
      }

      if (range) {
          const fragment = document.createRange().createContextualFragment(html);
          range.insertNode(fragment);
          range.collapse(false);
      } else if (activeBlock) {
          activeBlock.insertAdjacentHTML('afterend', html);
      } else if (contentRef.current) {
          const firstPage = contentRef.current.querySelector('.page');
          if (firstPage) {
              firstPage.insertAdjacentHTML('beforeend', html);
          }
      }
      if (contentRef.current) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
  };

  const handleInsertSpace = (size: 'small' | 'medium' | 'large') => {
      const heights = { small: '0.5in', medium: '1in', large: '2in' };
      insertAtCursor(`<div class="spacer" style="height: ${heights[size]}; width: 100%;"></div>`);
  };

  const handleInsertParagraph = () => {
      insertAtCursor('<p>Nuovo paragrafo...</p>');
  };

  // Handle action and check for patterns - MUST be defined before handleDeleteBlock
  const handleAction = (type: ActionType, element: HTMLElement, command?: string, value?: string) => {
      patternTrackerRef.current.recordAction(type, element, command, value);
      
      const pattern = patternTrackerRef.current.detectPattern();
      if (pattern && contentRef.current) {
          const signature = getElementSignature(element);
          const matches = findSimilarElements(signature, element, contentRef.current);
          
          if (matches.length > 0) {
              setPatternModal({
                  isOpen: true,
                  actionType: pattern.actionType,
                  signature: signature,
                  matches: matches,
                  command: pattern.command,
                  value: pattern.value
              });
          }
      }
  };

  const handleMoveUp = () => {
      if (!activeBlock || !activeBlock.previousElementSibling) return;
      const prev = activeBlock.previousElementSibling;
      activeBlock.parentNode?.insertBefore(activeBlock, prev);
      if (contentRef.current) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
  };

  const handleMoveDown = () => {
      if (!activeBlock || !activeBlock.nextElementSibling) return;
      const next = activeBlock.nextElementSibling;
      activeBlock.parentNode?.insertBefore(next, activeBlock);
      if (contentRef.current) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
  };

  const handleDeleteBlock = () => {
      if (!activeBlock) return;
      
      // SAFETY: Never delete structural elements
      if (activeBlock.classList.contains('page') || 
          activeBlock.classList.contains('editor-workspace') ||
          activeBlock.tagName === 'BODY' ||
          activeBlock.tagName === 'HTML') {
          console.warn('Cannot delete structural element');
          return;
      }
      
      // SAFETY: Don't delete if it's the only content in the document
      if (contentRef.current) {
          const pages = contentRef.current.querySelectorAll('.page');
          if (pages.length === 1) {
              const firstPage = pages[0];
              const children = firstPage.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div:not(.page), img, hr, table, blockquote, li');
              if (children.length <= 1 && firstPage.contains(activeBlock)) {
                  console.warn('Cannot delete last element in document');
                  return;
              }
          }
      }
      
      // Track action for pattern detection BEFORE removing
      handleAction('delete', activeBlock);
      
      activeBlock.remove();
      setActiveBlock(null);
      if (contentRef.current) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
  };

  const handleDuplicateBlock = () => {
     if (!activeBlock) return;
     const clone = activeBlock.cloneNode(true) as HTMLElement;
     if (clone.id) {
         clone.id = `dup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
     }
     activeBlock.parentNode?.insertBefore(clone, activeBlock.nextSibling);
     if (contentRef.current) {
         reflowPages(contentRef.current);
         onContentChange(contentRef.current.innerHTML);
     }
  };

  const MERGEABLE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'DIV', 'SECTION', 'TABLE']);

  const getMergeableElements = (): HTMLElement[] | null => {
     if (!contentRef.current) return null;

     if (multiSelectedElements.length === 2) {
         const elA = document.getElementById(multiSelectedElements[0]);
         const elB = document.getElementById(multiSelectedElements[1]);
         if (!elA || !elB) return null;
         if (elA.tagName === elB.tagName && MERGEABLE_TAGS.has(elA.tagName)) {
             const posA = elA.compareDocumentPosition(elB);
             if (posA & Node.DOCUMENT_POSITION_FOLLOWING) return [elA, elB];
             return [elB, elA];
         }
         return null;
     }

     if (contextMenu?.block) {
         const block = contextMenu.block;
         const splitId = block.getAttribute('data-split-id');
         if (!splitId) return null;
         const all = Array.from(contentRef.current.querySelectorAll(`[data-split-id="${CSS.escape(splitId)}"]`)) as HTMLElement[];
         if (all.length >= 2 && all.every(el => el.tagName === all[0].tagName)) return all;
     }

     return null;
  };

  const handleMerge = () => {
     const parts = getMergeableElements();
     if (!parts || parts.length < 2 || !contentRef.current) return;

     const first = parts[0];
     const originalHtml = first.getAttribute('data-split-original');

     if (originalHtml) {
         const temp = document.createElement('div');
         temp.innerHTML = originalHtml;
         const restored = temp.firstElementChild as HTMLElement | null;
         if (restored) {
             restored.removeAttribute('data-split-id');
             restored.removeAttribute('data-split-original');
             first.replaceWith(restored);
             for (let i = 1; i < parts.length; i++) {
                 parts[i].remove();
             }
             reflowPages(contentRef.current);
             onContentChange(contentRef.current.innerHTML);
             return;
         }
     }

     for (let i = 1; i < parts.length; i++) {
         while (parts[i].firstChild) {
             first.appendChild(parts[i].firstChild);
         }
         parts[i].remove();
     }
     first.removeAttribute('data-split-id');
     first.removeAttribute('data-split-original');
     reflowPages(contentRef.current);
     onContentChange(contentRef.current.innerHTML);
  };

  const handleMergePageElements = () => {
      const page = contextMenu?.page;
      if (!page || !contentRef.current) return;

      const isFlow = (el: Element): el is HTMLElement =>
          el instanceof HTMLElement &&
          !el.classList.contains('page-footer') &&
          !el.classList.contains('image-overlay') &&
          !el.classList.contains('resize-handle') &&
          el.tagName !== 'STYLE' &&
          window.getComputedStyle(el).position !== 'absolute' &&
          window.getComputedStyle(el).position !== 'fixed';

      let merged = false;
      let changed = true;
      while (changed) {
          changed = false;
          const kids = (Array.from(page.children) as HTMLElement[]).filter(isFlow);
          for (let i = 0; i < kids.length - 1; i++) {
              const a = kids[i];
              const b = kids[i + 1];
              if (a.tagName === b.tagName) {
                  while (b.firstChild) a.appendChild(b.firstChild);
                  b.remove();
                  a.removeAttribute('data-split-id');
                  a.removeAttribute('data-split-original');
                  merged = true;
                  changed = true;
                  break;
              }
          }
      }

      if (merged) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
  };

  // Clipboard operations
  const handleCopy = () => {
      document.execCommand('copy');
  };

  const handleCut = () => {
      document.execCommand('cut');
      if (contentRef.current) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
  };

  const handlePaste = async () => {
      try {
          const clipboardData = await navigator.clipboard.readText();
          document.execCommand('insertText', false, clipboardData);
          if (contentRef.current) {
              reflowPages(contentRef.current);
              onContentChange(contentRef.current.innerHTML);
          }
      } catch {
          document.execCommand('paste');
      }
  };

  // Track formatting commands
  const trackFormatAction = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const element = container.nodeType === Node.TEXT_NODE 
          ? container.parentElement 
          : container as HTMLElement;
      
      if (element && contentRef.current?.contains(element)) {
          const block = element.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), li, blockquote, span') as HTMLElement;
          return block;
      }
      return null;
  }, []);

  // Intercept execCommand for pattern tracking
  useEffect(() => {
      const originalExecCommand = document.execCommand.bind(document);
      
      document.execCommand = (command: string, showUI?: boolean, value?: string): boolean => {
          const result = originalExecCommand(command, showUI, value);
          
          if (result) {
              const formatCommands: Record<string, ActionType> = {
                  'bold': 'bold',
                  'italic': 'italic',
                  'underline': 'underline',
                  'insertUnorderedList': 'list',
                  'insertOrderedList': 'list',
                  'indent': 'indent',
                  'outdent': 'indent',
                  'justifyLeft': 'align',
                  'justifyCenter': 'align',
                  'justifyRight': 'align',
                  'justifyFull': 'align',
                  'fontSize': 'fontSize',
                  'foreColor': 'fontColor',
                  'hiliteColor': 'fontColor'
              };
              
              const actionType = formatCommands[command];
              if (actionType) {
                  const block = trackFormatAction();
                  if (block) {
                      handleAction(actionType, block, command, value);
                  }
              }
          }
          
          return result;
      };
      
      return () => {
          document.execCommand = originalExecCommand;
      };
  }, [trackFormatAction]);

  const handlePatternConfirm = (selectedIds: string[]) => {
      const { actionType, command, value } = patternModal;
      
      selectedIds.forEach(id => {
          const element = document.getElementById(id);
          if (element) {
              if (actionType === 'Delete') {
                  element.remove();
              } else if (command) {
                  // Apply formatting to element
                  const selection = window.getSelection();
                  const range = document.createRange();
                  range.selectNodeContents(element);
                  selection?.removeAllRanges();
                  selection?.addRange(range);
                  document.execCommand(command, false, value || undefined);
                  selection?.removeAllRanges();
              }
          }
      });
      
      if (contentRef.current) {
          reflowPages(contentRef.current);
          onContentChange(contentRef.current.innerHTML);
      }
      
      patternTrackerRef.current.clear();
      setPatternModal({ isOpen: false, actionType: '', signature: '', matches: [] });
  };

  const handlePatternCancel = () => {
      patternTrackerRef.current.clear();
      setPatternModal({ isOpen: false, actionType: '', signature: '', matches: [] });
  };

  useEffect(() => {
      const container = contentRef.current;
      if (!container) return;

      const handleClick = (e: MouseEvent) => {
          if (marqueeRef.current.suppressClick) {
              marqueeRef.current.suppressClick = false;
              return;
          }
          const target = e.target as HTMLElement;

          if (e.metaKey || e.ctrlKey) {
              const overlay = target.closest('[data-overlay="true"]');
              let block: HTMLElement | null = null;
              if (overlay) {
                  block = (selectedTextLayer || selectedImage) as HTMLElement | null;
              }
              if (!block) {
                  block = target.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle, table, img, .floating-text, .writing-lines') as HTMLElement | null;
              }
              if (block) {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleMultiSelect(block);
                  return;
              }
          } else if (multiSelectedElements.length > 0) {
              onClearMultiSelect();
          }

          if (isTextLayerMode) {
              let page = target.closest('.page') as HTMLElement | null;
              if (!page) {
                  const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
                  page = elementsAtPoint
                      .map(el => (el as HTMLElement).closest('.page') as HTMLElement | null)
                      .find(p => p) || null;
              }
              if (page) {
                  console.log('[TextLayer] insert at click', { x: e.clientX, y: e.clientY });
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = page.getBoundingClientRect();
                  const scale = zoom / 100 || 1;
                  const x = (e.clientX - rect.left) / scale;
                  const y = (e.clientY - rect.top) / scale;
                  onInsertTextLayerAt(page, x, y);
                  return;
              }
          }

          const tocPageCell = target.closest('td[data-toc-page], th[data-toc-page]') as HTMLElement | null;
          if (tocPageCell) {
              const row = tocPageCell.closest('tr[data-toc-target]') as HTMLTableRowElement | null;
              if (row) {
                  e.preventDefault();
                  e.stopPropagation();
                  const targetId = row.getAttribute('data-toc-target') || '';
                  if (targetId) {
                      const el = document.getElementById(targetId);
                      if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                  }
                  return;
              }
          }

          const tocRow = target.closest('tr[data-toc-target]') as HTMLTableRowElement | null;
          if (tocRow) {
              e.preventDefault();
              e.stopPropagation();
              const targetId = tocRow.getAttribute('data-toc-target') || '';
              if (targetId) {
                  const el = document.getElementById(targetId);
                  if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
              }
              return;
          }

          const tocLink = target.closest('a[data-toc-link="true"]') as HTMLAnchorElement | null;
          if (tocLink) {
              e.preventDefault();
              e.stopPropagation();
              const href = tocLink.getAttribute('href') || '';
              const id = href.startsWith('#') ? href.slice(1) : href;
              if (id) {
                  const el = document.getElementById(id);
                  if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
              }
              return;
          }

          const isPageSurface = target.classList.contains('page') || target.classList.contains('editor-workspace');
          if (isPageSurface) {
              if (activeBlock) {
                  activeBlock.removeAttribute('data-selected');
                  setActiveBlock(null);
              }
              const selectedElements = contentRef.current?.querySelectorAll('[data-selected="true"]');
              selectedElements?.forEach(el => el.removeAttribute('data-selected'));
              onImageSelect(null);
              onTextLayerSelect(null);
              onHRSelect(null);
              setActiveLink(null);

              const page = target.classList.contains('page') ? target : target.closest('.page');
              if (page) {
                  const doc = page.ownerDocument;
                  const selection = doc.getSelection();
                  let range: Range | null = null;
                  const anyDoc = doc as Document & {
                      caretRangeFromPoint?: (x: number, y: number) => Range | null;
                      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
                  };

                  if (anyDoc.caretRangeFromPoint) {
                      range = anyDoc.caretRangeFromPoint(e.clientX, e.clientY);
                  } else if (anyDoc.caretPositionFromPoint) {
                      const pos = anyDoc.caretPositionFromPoint(e.clientX, e.clientY);
                      if (pos) {
                          range = doc.createRange();
                          range.setStart(pos.offsetNode, pos.offset);
                          range.collapse(true);
                      }
                  }

                  const setCaretAfter = (anchor: Element) => {
                      const newRange = doc.createRange();
                      newRange.setStartAfter(anchor);
                      newRange.collapse(true);
                      selection?.removeAllRanges();
                      selection?.addRange(newRange);
                  };

                  if (range) {
                      const container = range.commonAncestorContainer;
                      const element = container.nodeType === Node.ELEMENT_NODE
                          ? (container as Element)
                          : container.parentElement;
                      const blocked = element?.closest('table, .writing-lines, .tracing-line, .mission-box, .shape-rectangle, .shape-circle, .shape-pill, .shape-speech, .shape-cloud');
                      if (blocked) {
                          const rect = blocked.getBoundingClientRect();
                          if (e.clientY > rect.bottom - 2) {
                              setCaretAfter(blocked);
                              return;
                          }
                      }

                      range.collapse(true);
                      selection?.removeAllRanges();
                      selection?.addRange(range);
                  }
              }
              return;
          }
          
          // Handle Link Click
          const link = target.closest('a') as HTMLAnchorElement | null;
          if (link) {
              const rect = link.getBoundingClientRect();
              setActiveLink({
                  url: link.href,
                  x: rect.left + rect.width / 2,
                  y: rect.top,
                  element: link
              });
          } else {
              setActiveLink(null);
          }

          if (selectionMode?.active && onBlockSelection) {
              e.preventDefault();
              e.stopPropagation();
              // Include div to catch mission-boxes or other containers
              const block = target.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, div');
              if (block) {
                  // Ignore the workspace container itself if clicked
                  if (block.classList.contains('editor-workspace') || block.classList.contains('page')) return;

                  let dirty = false;
                  if (!block.id) {
                      block.id = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                      dirty = true;
                  }
                  
                  onBlockSelection(block.id);

                  // Persist ID to App state immediately
                  if (dirty && contentRef.current) {
                      onContentChange(contentRef.current.innerHTML);
                  }
              }
              return;
          }

          const setCaretAfter = (anchor: Element) => {
              const selection = window.getSelection();
              const newRange = document.createRange();
              newRange.setStartAfter(anchor);
              newRange.collapse(true);
              selection?.removeAllRanges();
              selection?.addRange(newRange);
          };

          const shapeContainer = target.closest('.mission-box, .shape-rectangle, .shape-circle, .shape-pill, .shape-speech, .shape-cloud') as HTMLElement | null;
          if (shapeContainer) {
              const rect = shapeContainer.getBoundingClientRect();
              const children = Array.from(shapeContainer.children) as HTMLElement[];
              const maxChildBottom = children.length
                  ? Math.max(...children.map(child => child.getBoundingClientRect().bottom))
                  : rect.top;

              if (e.clientY > maxChildBottom + 4 && e.clientY <= rect.bottom + 2) {
                  setCaretAfter(shapeContainer);
                  return;
              }
          }

          // Clear previous block selection
          if (activeBlock) {
              activeBlock.removeAttribute('data-selected');
          }

          if (target.tagName === 'IMG') {
              onImageSelect(target as HTMLImageElement);
              target.setAttribute('data-selected', 'true');
              setActiveBlock(target);
          } else if (target.tagName === 'TEXTAREA' || target.classList.contains('writing-lines')) {
              // Treat writing-lines like images for selection overlay
              onImageSelect(target as unknown as HTMLImageElement);
              target.setAttribute('data-selected', 'true');
              setActiveBlock(target);
          } else if (target.closest('.floating-text')) {
              const floating = target.closest('.floating-text') as HTMLElement;
              onTextLayerSelect(floating);
              floating.setAttribute('data-selected', 'true');
              setActiveBlock(floating);
          } else {
              onImageSelect(null);
              onTextLayerSelect(null);
          }

          // Find and select block elements
          let block = target.closest('hr') as HTMLElement | null;
          if (!block) {
              block = target.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle, table, img') as HTMLElement | null;
          }
          
          if (block) {
              block.setAttribute('data-selected', 'true');
              setActiveBlock(block);
              const selection = window.getSelection();
              const hasSelection = selection && selection.rangeCount > 0 && !selection.isCollapsed;
              const selectionInBlock = hasSelection && block.contains(selection.getRangeAt(0).commonAncestorContainer);
              if (selectionInBlock) {
                  handleSelectionChange();
              } else {
                  onSelectionChange(buildSelectionStateFromElement(block), block);
              }
          }
          
          if (onBlockClick) {
              onBlockClick(block);
          }

          const hr = target.closest('hr') as HTMLHRElement | null;
          if (hr) {
              onHRSelect(hr);
              hr.setAttribute('data-selected', 'true');
              setActiveBlock(hr);
          } else {
              onHRSelect(null);
          }
      };

      let reflowTimeout: number | null = null;
      
      const handleInput = (e?: Event) => {
          const target = (e?.target as HTMLElement | null) || null;
          const isFloatingText = !!target?.closest?.('.floating-text');
          if (contentRef.current) {
              if (reflowTimeout) clearTimeout(reflowTimeout);
              const delay = isFloatingText ? 0 : 180;
              reflowTimeout = window.setTimeout(() => {
                  if (contentRef.current) {
                      try {
                          if (!isFloatingText) {
                              reflowPages(contentRef.current);
                              updateTocTablePageNumbers(contentRef.current);
                          }
                      } catch (err) {
                          console.error('Reflow error:', err);
                      }
                      onContentChange(contentRef.current.innerHTML);
                  }
              }, delay);
          }
      };

      container.addEventListener('click', handleClick);
      container.addEventListener('input', handleInput);
      container.addEventListener('keyup', handleInput);
      container.addEventListener('mouseup', handleSelectionChange);
      document.addEventListener('selectionchange', handleSelectionChange);
      
      return () => {
          if (reflowTimeout) clearTimeout(reflowTimeout);
          container.removeEventListener('click', handleClick);
          container.removeEventListener('input', handleInput);
          container.removeEventListener('keyup', handleInput);
          container.removeEventListener('mouseup', handleSelectionChange);
          document.removeEventListener('selectionchange', handleSelectionChange);
      };
  }, [handleSelectionChange, onImageSelect, onContentChange, selectionMode, onBlockSelection, buildSelectionStateFromElement, onSelectionChange, isTextLayerMode, onInsertTextLayerAt]);

  useEffect(() => {
      if (!isTextLayerMode) return;
      const handleGlobalInsert = (e: MouseEvent) => {
          const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY);
          const page = elementsAtPoint
              .map(el => (el as HTMLElement).closest('.page') as HTMLElement | null)
              .find(p => p) || null;
          if (!page) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = page.getBoundingClientRect();
          const scale = zoom / 100 || 1;
          const x = (e.clientX - rect.left) / scale;
          const y = (e.clientY - rect.top) / scale;
          onInsertTextLayerAt(page, x, y);
      };
      document.addEventListener('mousedown', handleGlobalInsert, true);
      return () => {
          document.removeEventListener('mousedown', handleGlobalInsert, true);
      };
  }, [isTextLayerMode, onInsertTextLayerAt, zoom]);

  useEffect(() => {
      const workspace = contentRef.current;
      const container = containerRef.current;
      if (workspace) {
          workspace.classList.toggle('text-layer-mode', isTextLayerMode);
      }
      if (container) {
          container.classList.toggle('text-layer-mode', isTextLayerMode);
      }
      document.body.style.cursor = isTextLayerMode ? 'crosshair' : '';
      return () => {
          document.body.style.cursor = '';
      };
  }, [isTextLayerMode, containerRef]);

  useEffect(() => {
      if (!distributeAdjustAxis) return;
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              onEndDistributeAdjust();
          }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [distributeAdjustAxis, onEndDistributeAdjust]);

  const zoomStyle = {
    transform: `scale(${zoom / 100})`,
    transformOrigin: 'top center',
  };

  const workspaceClasses = viewMode === 'double' 
    ? 'editor-workspace flex flex-row flex-wrap justify-center gap-4 outline-none relative'
    : 'editor-workspace w-full flex flex-col items-center outline-none relative';

  return (
    <div 
        ref={containerRef}
        className={`editor-container flex-1 bg-gray-200 overflow-auto h-[calc(100vh-68px)] relative p-8 flex flex-col items-center ${isTextLayerMode ? 'text-layer-mode' : ''}`}
    >
        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
        <style>{selectionStyle}</style>
        <style>{`
            .editor-workspace .page {
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                margin-bottom: 2rem;
                background-color: white;
                display: block; 
                outline: none;
                position: relative; 
            }
            .cursor-crosshair, .cursor-crosshair * {
                cursor: crosshair !important;
            }
            .editor-workspace * {
                user-select: text !important;
                -webkit-user-select: text !important;
            }
            .editor-workspace p, 
            .editor-workspace h1, 
            .editor-workspace h2, 
            .editor-workspace h3, 
            .editor-workspace h4, 
            .editor-workspace h5, 
            .editor-workspace h6,
            .editor-workspace div:not(.page),
            .editor-workspace span,
            .editor-workspace li,
            .editor-workspace blockquote {
                cursor: text;
            }
            .editor-workspace.text-layer-mode {
                cursor: crosshair !important;
            }
            .editor-workspace.text-layer-mode * {
                cursor: crosshair !important;
            }
            .editor-workspace .spacer {
                cursor: pointer;
                min-height: 20px;
                border: 1px dashed transparent;
                transition: border-color 0.2s;
            }
            .editor-workspace .spacer:hover {
                border-color: #c4a7ff;
            }
            .editor-workspace hr {
                cursor: pointer;
                transition: outline 0.2s;
            }
            .editor-workspace hr:hover {
                outline: 2px dashed #8d55f1;
                outline-offset: 2px;
            }
            .text-mode-badge {
                position: fixed;
                top: 90px;
                left: 16px;
                z-index: 9999;
                background: #111827;
                color: #fff;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.04em;
                padding: 6px 10px;
                border-radius: 999px;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
            }
            .editor-workspace table.toc-table tr[data-toc-target] {
                cursor: pointer;
            }
            .editor-workspace table.toc-table td[data-toc-page],
            .editor-workspace table.toc-table th[data-toc-page] {
                cursor: pointer;
            }
            .editor-workspace.toc-modal-open * {
                outline: none !important;
                outline-offset: 0 !important;
            }
            .editor-workspace.toc-modal-open *:hover {
                outline: none !important;
                background-color: transparent !important;
            }
            .editor-workspace.toc-modal-open [data-selected="true"] {
                outline: none !important;
            }
            .editor-workspace hr[data-selected="true"] {
                outline: 2px solid #8d55f1;
                outline-offset: 2px;
            }
            .editor-workspace [data-selected="true"] {
                outline: 2px solid #8d55f1 !important;
                outline-offset: 2px !important;
            }
            .editor-workspace [data-multi-selected="true"] {
                outline: 2px dashed #10b981 !important;
                outline-offset: 2px !important;
            }
            .editor-workspace p,
            .editor-workspace h1,
            .editor-workspace h2,
            .editor-workspace h3,
            .editor-workspace h4,
            .editor-workspace h5,
            .editor-workspace h6,
            .editor-workspace div:not(.page):not(.editor-workspace),
            .editor-workspace blockquote,
            .editor-workspace li,
            .editor-workspace table,
            .editor-workspace img,
            .editor-workspace hr {
                cursor: grab;
                transition: outline 0.15s, background-color 0.15s;
            }
            .editor-workspace p:hover,
            .editor-workspace h1:hover,
            .editor-workspace h2:hover,
            .editor-workspace h3:hover,
            .editor-workspace h4:hover,
            .editor-workspace h5:hover,
            .editor-workspace h6:hover,
            .editor-workspace div:not(.page):not(.editor-workspace):hover,
            .editor-workspace blockquote:hover,
            .editor-workspace li:hover,
            .editor-workspace table:hover,
            .editor-workspace img:hover,
            .editor-workspace hr:hover {
                outline: 2px dashed #8d55f1;
                outline-offset: 2px;
                background-color: rgba(141, 85, 241, 0.06);
            }
            ${viewMode === 'double' ? `
            .editor-workspace {
                display: flex !important;
                flex-direction: row !important;
                flex-wrap: wrap !important;
                justify-content: center !important;
                align-items: flex-start !important;
                gap: 1.5rem !important;
            }
            .editor-workspace .page {
                flex-shrink: 0 !important;
                margin-bottom: 0 !important;
            }
            ` : ''}
        `}</style>

        {isTextLayerMode && (
            <div className="text-mode-badge">TEXT MODE ON</div>
        )}

        <div 
            ref={contentRef}
            className={`${workspaceClasses} ${selectionMode?.active ? 'cursor-crosshair' : ''} ${isTextLayerMode ? 'text-layer-mode' : ''} ${tableTocModal.isOpen ? 'toc-modal-open' : ''}`}
            style={zoomStyle}
            contentEditable={!imageProperties.isCropping && !selectionMode?.active}
            suppressContentEditableWarning={true}
            onMouseDown={(e) => {
                if (e.metaKey && e.button === 0 && !isTextLayerMode && !imageProperties.isCropping && !selectionMode?.active) {
                    const container = containerRef.current;
                    if (!container) return;
                    marqueeRef.current.active = true;
                    marqueeRef.current.startX = e.clientX;
                    marqueeRef.current.startY = e.clientY;
                    marqueeRef.current.didDrag = false;
                    marqueeRef.current.suppressClick = false;

                    const containerRect = container.getBoundingClientRect();

                    const updateBox = (clientX: number, clientY: number) => {
                        const left = Math.min(clientX, marqueeRef.current.startX) - containerRect.left + container.scrollLeft;
                        const top = Math.min(clientY, marqueeRef.current.startY) - containerRect.top + container.scrollTop;
                        const width = Math.abs(clientX - marqueeRef.current.startX);
                        const height = Math.abs(clientY - marqueeRef.current.startY);
                        setMarqueeBox({ x: left, y: top, width, height });
                    };

                    const handleMove = (ev: MouseEvent) => {
                        if (!marqueeRef.current.active) return;
                        const dx = Math.abs(ev.clientX - marqueeRef.current.startX);
                        const dy = Math.abs(ev.clientY - marqueeRef.current.startY);
                        if (!marqueeRef.current.didDrag && (dx > 4 || dy > 4)) {
                            marqueeRef.current.didDrag = true;
                            marqueeRef.current.suppressClick = true;
                            document.body.style.userSelect = 'none';
                        }
                        if (marqueeRef.current.didDrag) {
                            updateBox(ev.clientX, ev.clientY);
                        }
                    };

                    const handleUp = (ev: MouseEvent) => {
                        if (!marqueeRef.current.active) return;
                        marqueeRef.current.active = false;
                        window.removeEventListener('mousemove', handleMove);
                        window.removeEventListener('mouseup', handleUp);
                        document.body.style.userSelect = '';

                        if (!marqueeRef.current.didDrag) {
                            setMarqueeBox(null);
                            return;
                        }

                        const left = Math.min(ev.clientX, marqueeRef.current.startX);
                        const right = Math.max(ev.clientX, marqueeRef.current.startX);
                        const top = Math.min(ev.clientY, marqueeRef.current.startY);
                        const bottom = Math.max(ev.clientY, marqueeRef.current.startY);

                        const selected = getMarqueeCandidates().filter(el => {
                            const rect = el.getBoundingClientRect();
                            return !(rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom);
                        });

                        if (selected.length > 0) {
                            const existing = new Set(multiSelectedElements);
                            selected.forEach(el => {
                                if (!el.id) {
                                    el.id = `multi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                                }
                                if (!existing.has(el.id)) {
                                    onToggleMultiSelect(el);
                                }
                            });
                        }

                        setMarqueeBox(null);
                    };

                    window.addEventListener('mousemove', handleMove);
                    window.addEventListener('mouseup', handleUp);
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                const target = e.target as HTMLElement;
                const tocLink = target.closest('a[data-toc-link="true"]') as HTMLAnchorElement | null;
                if (tocLink) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
            onKeyDown={handleKeyDown}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onContextMenu={handleContextMenu}
        />

        {marqueeBox && marqueeBox.width > 0 && marqueeBox.height > 0 && (
            <div
                style={{
                    position: 'absolute',
                    left: marqueeBox.x,
                    top: marqueeBox.y,
                    width: marqueeBox.width,
                    height: marqueeBox.height,
                    border: '1px dashed #8d55f1',
                    background: 'rgba(141, 85, 241, 0.12)',
                    boxShadow: '0 0 0 1px rgba(141, 85, 241, 0.2) inset',
                    pointerEvents: 'none',
                    zIndex: 50
                }}
            />
        )}

        {distributeAdjustAxis && multiSelectedElements.length > 1 && (() => {
            const elements = multiSelectedElements
                .map(id => document.getElementById(id))
                .filter(Boolean) as HTMLElement[];
            if (elements.length < 2) return null;
            const container = containerRef.current;
            if (!container) return null;
            const containerRect = container.getBoundingClientRect();
            const rects = elements.map(el => el.getBoundingClientRect());
            const minX = Math.min(...rects.map(r => r.left));
            const maxX = Math.max(...rects.map(r => r.right));
            const minY = Math.min(...rects.map(r => r.top));
            const maxY = Math.max(...rects.map(r => r.bottom));
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            const lineStyle = distributeAdjustAxis === 'x'
                ? { left: minX - containerRect.left, top: centerY - containerRect.top, width: maxX - minX, height: 2 }
                : { left: centerX - containerRect.left, top: minY - containerRect.top, width: 2, height: maxY - minY };

            const handleStyle = distributeAdjustAxis === 'x'
                ? { left: centerX - containerRect.left - 8, top: centerY - containerRect.top - 8 }
                : { left: centerX - containerRect.left - 8, top: centerY - containerRect.top - 8 };

            return (
                <div className="absolute inset-0 pointer-events-none">
                    <div
                        style={{
                            position: 'absolute',
                            background: '#8d55f1',
                            ...lineStyle
                        }}
                    />
                    <div
                        onMouseDown={startDistributeDrag}
                        title="Drag to adjust spacing"
                        style={{
                            position: 'absolute',
                            width: 16,
                            height: 16,
                            borderRadius: '999px',
                            background: '#8d55f1',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                            cursor: distributeAdjustAxis === 'x' ? 'ew-resize' : 'ns-resize',
                            pointerEvents: 'auto',
                            ...handleStyle
                        }}
                    />
                </div>
            );
        })()}
        
        {showMarginGuides && (
            <div className="absolute inset-0 pointer-events-none">
                <div className="relative w-full h-full">
                    {pageRects.map((rect, i) => (
                        <div 
                            key={i}
                            className="absolute pointer-events-none"
                            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
                        >
                            <PageRuler width={rect.width} height={rect.height} margins={pageMargins} />
                            <MarginGuides width={rect.width} height={rect.height} margins={pageMargins} onMarginChange={onMarginChange} />
                        </div>
                    ))}
                </div>
            </div>
        )}

        {marginOverflowRects.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
                {marginOverflowRects.map((rect, i) => (
                    <div
                        key={`margin-overflow-${i}`}
                        style={{
                            position: 'absolute',
                            left: rect.x,
                            top: rect.y,
                            width: rect.width,
                            height: rect.height,
                            background: 'rgba(239, 68, 68, 0.35)',
                            boxShadow: '0 0 0 1px rgba(239, 68, 68, 0.6) inset',
                            zIndex: 55
                        }}
                    />
                ))}
            </div>
        )}

        {selectedImage && (
            <ImageOverlay 
                image={selectedImage}
                containerRef={containerRef}
                isCropping={imageProperties.isCropping}
                showSmartGuides={showSmartGuides}
                onCropComplete={onCropComplete}
                onCancelCrop={onCancelCrop}
                multiSelectedElements={multiSelectedElements}
                pageMargins={pageMargins}
                onResize={() => {
                    if (contentRef.current) {
                        reflowPages(contentRef.current);
                        onContentChange(contentRef.current.innerHTML);
                    }
                }}
            />
        )}

        {selectedTextLayer && (
            <ImageOverlay
                image={selectedTextLayer}
                containerRef={containerRef}
                isCropping={false}
                showSmartGuides={showSmartGuides}
                onCropComplete={() => {}}
                onCancelCrop={() => {}}
                multiSelectedElements={multiSelectedElements}
                pageMargins={pageMargins}
                onResize={() => {
                    if (contentRef.current) {
                        reflowPages(contentRef.current);
                        onContentChange(contentRef.current.innerHTML);
                    }
                }}
            />
        )}

        {contextMenu && (
            <BlockContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
                onCopy={handleCopy}
                onCut={handleCut}
                onPaste={handlePaste}
                onCopyStyle={onCopyStyle}
                onPasteStyle={onPasteStyle}
                canPasteStyle={hasStyleClipboard}
                onCreateQRCode={() => setQrModal({ isOpen: true, url: contextMenu.linkUrl || '' })}
                onTransformToTOC={contextMenu.block?.closest('table') ? () => openTableTocModal(contextMenu.block!.closest('table') as HTMLTableElement) : undefined}
                onDistributeHoriz={multiSelectedElements.length > 1 ? () => onStartDistributeAdjust('x') : undefined}
                onDistributeVert={multiSelectedElements.length > 1 ? () => onStartDistributeAdjust('y') : undefined}
                onAlignLeft={multiSelectedElements.length > 1 ? () => safeAlign('left') : undefined}
                onAlignCenter={multiSelectedElements.length > 1 ? () => safeAlign('center') : undefined}
                onAlignRight={multiSelectedElements.length > 1 ? () => safeAlign('right') : undefined}
                onAlignTop={multiSelectedElements.length > 1 ? () => safeAlign('top') : undefined}
                onAlignMiddle={multiSelectedElements.length > 1 ? () => safeAlign('middle') : undefined}
                onAlignBottom={multiSelectedElements.length > 1 ? () => safeAlign('bottom') : undefined}
                onToggleMarginOverride={contextMenu.block && !contextMenu.block.classList.contains('page-footer') ? () => handleToggleMarginOverride(contextMenu.block) : undefined}
                isMarginOverride={contextMenu.block?.getAttribute('data-ignore-margins') === 'true'}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDelete={handleDeleteBlock}
                onDuplicate={handleDuplicateBlock}
                onMerge={getMergeableElements() ? handleMerge : undefined}
                onMergePageElements={contextMenu.page ? handleMergePageElements : undefined}
                hasBlock={!!contextMenu.block}
            />
        )}

        {activeBlock && !contextMenu && !activeBlock.classList.contains('floating-text') && (
            <DragHandle
                element={activeBlock}
                containerRef={containerRef}
                showSmartGuides={showSmartGuides}
                onUpdate={() => {
                    if (contentRef.current) {
                        reflowPages(contentRef.current);
                        onContentChange(contentRef.current.innerHTML);
                    }
                    setActiveBlock(null);
                }}
                onAction={handleAction}
            />
        )}

        {activeLink && (
            <LinkToolbar
                url={activeLink.url}
                x={activeLink.x}
                y={activeLink.y}
                onEdit={() => {}} // Placeholder
                onRemove={() => {}} // Placeholder
                onCreateQRCode={() => {
                    setQrModal({ isOpen: true, url: activeLink.url });
                    setActiveLink(null);
                }}
                onClose={() => setActiveLink(null)}
            />
        )}

        <TableTocModal
            isOpen={tableTocModal.isOpen}
            rows={tableTocModal.rows}
            anchors={tableTocModal.anchors}
            onClose={() => setTableTocModal({ isOpen: false, tableId: '', rows: [], anchors: [] })}
            onApply={(rows) => {
                applyTableTocMapping(tableTocModal.tableId, rows);
                setTableTocModal({ isOpen: false, tableId: '', rows: [], anchors: [] });
            }}
        />

        <PatternModal
            isOpen={patternModal.isOpen}
            actionType={patternModal.actionType}
            matches={patternModal.matches}
            onConfirm={handlePatternConfirm}
            onCancel={handlePatternCancel}
        />

        <QRCodeModal
            isOpen={qrModal.isOpen}
            initialUrl={qrModal.url}
            onClose={() => setQrModal({ ...qrModal, isOpen: false })}
            onInsert={(dataUrl, url) => {
                insertAtCursor(`<img src="${dataUrl}" data-original-url="${url}" class="qr-code" style="width: 150px; height: auto; display: inline-block;" />`);
            }}
        />
    </div>
  );
};

export default Editor;
