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
import { PatternTracker, findSimilarElements, getElementSignature, PatternMatch, ActionType } from '../utils/patternDetector';

interface EditorProps {
  htmlContent: string;
  cssContent: string;
  onContentChange: (html: string) => void;
  onSelectionChange: (state: SelectionState, activeBlock: HTMLElement | null) => void;
  onBlockClick?: (block: HTMLElement | null) => void;
  onImageSelect: (img: HTMLImageElement | null) => void;
  onHRSelect: (hr: HTMLHRElement | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedImage: HTMLImageElement | null;
  selectedHR: HTMLHRElement | null;
  selectedFooter: HTMLElement | null;
  onFooterSelect: (footer: HTMLElement | null) => void;
  imageProperties: ImageProperties;
  onCropComplete: (newSrc: string, width: number, height: number) => void;
  onCancelCrop: () => void;
  onPageBreak: () => void;
  onInsertHorizontalRule: () => void;
  onInsertImage: () => void;
  showMarginGuides: boolean;
  showSmartGuides: boolean;
  pageMargins: { top: number, bottom: number, left: number, right: number };
  onMarginChange: (key: 'top' | 'bottom' | 'left' | 'right', value: number) => void;
  selectionMode?: { active: boolean; level: string | null; selectedIds: string[] };
  onBlockSelection?: (id: string) => void;
  zoom: number;
  viewMode: 'single' | 'double';
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
  const sizes = [10, 13, 16, 18, 24, 32, 48];
  let closestIndex = 0;
  let smallestDiff = Infinity;
  sizes.forEach((size, index) => {
    const diff = Math.abs(size - fontSizePx);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestIndex = index;
    }
  });
  return (closestIndex + 1).toString();
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
  onHRSelect,
  selectedFooter,
  onFooterSelect,
  containerRef,
  selectedImage,
  showMarginGuides,
  showSmartGuides,
  pageMargins,
  onMarginChange,
  selectionMode,
  onBlockSelection,
  imageProperties,
  onCropComplete,
  onCancelCrop,
  onPageBreak,
  onInsertHorizontalRule,
  onInsertImage,
  zoom,
  viewMode
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageRects, setPageRects] = useState<{ top: number; left: number; width: number; height: number }[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; block: HTMLElement | null; linkUrl?: string } | null>(null);
  const [activeBlock, setActiveBlock] = useState<HTMLElement | null>(null);
  const [qrModal, setQrModal] = useState<{ isOpen: boolean; url: string }>({ isOpen: false, url: '' });
  const [activeLink, setActiveLink] = useState<{ url: string; x: number; y: number; element: HTMLAnchorElement } | null>(null);
  
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
  useEffect(() => {
    if (selectionMode?.active) return;
    if (contentRef.current) {
        if (contentRef.current.innerHTML !== htmlContent) {
            contentRef.current.innerHTML = htmlContent;
            const imgs = contentRef.current.querySelectorAll('img');
            imgs.forEach(img => {
                img.onerror = () => { img.classList.add('broken-image'); };
            });
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
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!contentRef.current?.contains(range.commonAncestorContainer)) return;

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          onPageBreak();
          return;
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
      setContextMenu({ x: e.clientX, y: e.clientY, block, linkUrl });
  };

  const insertAtCursor = (html: string) => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
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
          const target = e.target as HTMLElement;
          
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
          } else {
              onImageSelect(null);
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
      
      const handleInput = () => {
          if (contentRef.current) {
              // Debounce reflow to avoid excessive calls
              if (reflowTimeout) clearTimeout(reflowTimeout);
              reflowTimeout = window.setTimeout(() => {
                  if (contentRef.current) {
                      reflowPages(contentRef.current);
                      onContentChange(contentRef.current.innerHTML);
                  }
              }, 50);
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
  }, [handleSelectionChange, onImageSelect, onContentChange, selectionMode, onBlockSelection, buildSelectionStateFromElement, onSelectionChange]);

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
        className="flex-1 bg-gray-200 overflow-auto h-[calc(100vh-68px)] relative p-8 flex flex-col items-center"
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
            .editor-workspace hr[data-selected="true"] {
                outline: 2px solid #8d55f1;
                outline-offset: 2px;
            }
            .editor-workspace [data-selected="true"] {
                outline: 2px solid #8d55f1 !important;
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

        <div 
            ref={contentRef}
            className={`${workspaceClasses} ${selectionMode?.active ? 'cursor-crosshair' : ''}`}
            style={zoomStyle}
            contentEditable={!imageProperties.isCropping && !selectionMode?.active}
            onKeyDown={handleKeyDown}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onContextMenu={handleContextMenu}
            suppressContentEditableWarning={true}
        />
        
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

        {selectedImage && (
            <ImageOverlay 
                image={selectedImage}
                containerRef={containerRef}
                isCropping={imageProperties.isCropping}
                showSmartGuides={showSmartGuides}
                onCropComplete={onCropComplete}
                onCancelCrop={onCancelCrop}
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
                onCreateQRCode={contextMenu.linkUrl ? () => setQrModal({ isOpen: true, url: contextMenu.linkUrl! }) : undefined}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onDelete={handleDeleteBlock}
                onDuplicate={handleDuplicateBlock}
                hasBlock={!!contextMenu.block}
            />
        )}

        {activeBlock && !contextMenu && (
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
