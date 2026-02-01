import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SelectionState, ImageProperties, HRProperties, StructureEntry } from '../types';
import ImageOverlay from './ImageOverlay';
import { reflowPages } from '../utils/pagination';
import MarginGuides from './MarginGuides';
import PageRuler from './PageRuler';

interface EditorProps {
  htmlContent: string;
  cssContent: string;
  onContentChange: (html: string) => void;
  onSelectionChange: (state: SelectionState, activeBlock: HTMLElement | null) => void;
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
  showMarginGuides: boolean;
  pageMargins: { top: number, bottom: number, left: number, right: number };
  onMarginChange: (key: 'top' | 'bottom' | 'left' | 'right', value: number) => void;
  selectionMode?: { active: boolean; level: string | null; selectedIds: string[] };
  onBlockSelection?: (id: string) => void;
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

const Editor: React.FC<EditorProps> = ({ 
  htmlContent, 
  cssContent, 
  onContentChange,
  onSelectionChange,
  onImageSelect,
  onHRSelect,
  selectedFooter,
  onFooterSelect,
  containerRef,
  selectedImage,
  showMarginGuides,
  pageMargins,
  onMarginChange,
  selectionMode,
  onBlockSelection,
  imageProperties,
  onCropComplete,
  onCancelCrop,
  onPageBreak
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageRects, setPageRects] = useState<{ top: number; left: number; width: number; height: number }[]>([]);

  // Generate dynamic CSS for selection highlights
  const selectionStyle = selectionMode?.active && selectionMode.selectedIds.length > 0
    ? `${selectionMode.selectedIds.map(id => `#${id}`).join(', ')} { outline: 2px dashed #2563eb !important; cursor: pointer !important; position: relative; z-index: 10; }`
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
  }, [htmlContent, showMarginGuides, containerRef]);

  const handleSelectionChange = useCallback(() => {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!contentRef.current?.contains(range.commonAncestorContainer)) return;

    const state: SelectionState = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      blockType: document.queryCommandValue('formatBlock') || 'p',
      alignLeft: document.queryCommandState('justifyLeft'),
      alignCenter: document.queryCommandState('justifyCenter'),
      alignRight: document.queryCommandState('justifyRight'),
      fontName: document.queryCommandValue('fontName') || 'sans-serif',
      fontSize: document.queryCommandValue('fontSize') || '3',
      foreColor: rgbToHex(document.queryCommandValue('foreColor')),
      borderWidth: '0',
      borderColor: '#000000',
      borderRadius: '0',
      backgroundColor: '#ffffff',
      padding: '0',
      borderStyle: 'none',
      textAlign: 'left',
      shape: 'none',
      range: range
    };

    const element = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer as HTMLElement : range.commonAncestorContainer.parentElement;
    const block = element?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle, .page-footer');
    
    if (block) {
        const b = block as HTMLElement;
        const computed = window.getComputedStyle(b);
        const safeParseInt = (val: string) => {
            const parsed = parseInt(val);
            return isNaN(parsed) ? '0' : parsed.toString();
        };
        state.borderWidth = safeParseInt(computed.borderTopWidth);
        state.borderColor = rgbToHex(computed.borderTopColor);
        state.borderStyle = computed.borderTopStyle;
        state.borderRadius = safeParseInt(computed.borderRadius);
        state.padding = safeParseInt(computed.paddingTop);
        state.backgroundColor = rgbToHex(computed.backgroundColor);
        state.textAlign = computed.textAlign;
        state.width = b.style.width || '';
    }

    onSelectionChange(state, block as HTMLElement | null);
  }, [onSelectionChange]);

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

  useEffect(() => {
      const container = contentRef.current;
      if (!container) return;

      const handleClick = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
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

          if (target.tagName === 'IMG') {
              onImageSelect(target as HTMLImageElement);
          } else {
              onImageSelect(null);
          }
      };

      const handleInput = () => {
          if (contentRef.current) {
              reflowPages(contentRef.current);
              onContentChange(contentRef.current.innerHTML);
          }
      };

      container.addEventListener('click', handleClick);
      container.addEventListener('input', handleInput);
      document.addEventListener('selectionchange', handleSelectionChange);
      
      return () => {
          container.removeEventListener('click', handleClick);
          container.removeEventListener('input', handleInput);
          document.removeEventListener('selectionchange', handleSelectionChange);
      };
  }, [handleSelectionChange, onImageSelect, onContentChange, selectionMode, onBlockSelection]);

  return (
    <div 
        ref={containerRef}
        className="flex-1 bg-gray-200 overflow-y-auto h-[calc(100vh-64px)] relative p-8 flex flex-col items-center"
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
        `}</style>

        <div 
            ref={contentRef}
            className={`editor-workspace w-full flex flex-col items-center outline-none relative ${selectionMode?.active ? 'cursor-crosshair' : ''}`}
            contentEditable={!imageProperties.isCropping && !selectionMode?.active}
            onKeyDown={handleKeyDown}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
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
                            <PageRuler width={rect.width} height={rect.height} />
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
                onCropComplete={onCropComplete}
                onCancelCrop={onCancelCrop}
            />
        )}
    </div>
  );
};

export default Editor;