import React, { useRef, useEffect, useState, useCallback } from 'react';
import { SelectionState, ImageProperties, HRProperties } from '../types';
import ImageOverlay from './ImageOverlay';

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
  imageProperties: ImageProperties;
  onCropComplete: (newSrc: string, width: number, height: number) => void;
  onCancelCrop: () => void;
  onPageBreak: () => void;
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
  containerRef,
  selectedImage,
  selectedHR,
  imageProperties,
  onCropComplete,
  onCancelCrop,
  onPageBreak
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize content
  useEffect(() => {
    if (contentRef.current) {
        // Prevent cursor jumping and reference loss by only updating if content actually changed
        if (contentRef.current.innerHTML !== htmlContent) {
            contentRef.current.innerHTML = htmlContent;
            
            const imgs = contentRef.current.querySelectorAll('img');
            imgs.forEach(img => {
                img.onerror = () => {
                    img.classList.add('broken-image');
                };
            });
        }
        setIsReady(true);
    }
  }, [htmlContent]);

  const handleSelectionChange = useCallback(() => {
    const selection = document.getSelection();
    
    // Safety check: if selection is null or rangeCount is 0, we generally don't want to wipe state 
    // IF the user is just clicking the toolbar. However, we need to know if focus is truly lost.
    // We return early if there's no selection to preserve the last active block state in the parent.
    if (!selection || selection.rangeCount === 0) return;

    // Check if the selection is actually inside our editor content
    const range = selection.getRangeAt(0);
    const commonNode = range.commonAncestorContainer;
    
    // If we clicked outside the content (e.g. on the gray background or toolbar), ignore
    if (!contentRef.current?.contains(commonNode)) return;

    // Default selection state
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
      // Defaults
      borderWidth: '0',
      borderColor: '#000000',
      borderRadius: '0',
      backgroundColor: '#ffffff',
      padding: '0',
      borderStyle: 'none',
      textAlign: 'left',
      shape: 'none',
      range: range // Store the range to persist selection
    };

    let activeBlock: HTMLElement | null = null;
    const element = commonNode.nodeType === 1 ? commonNode as HTMLElement : commonNode.parentElement;
    
    // CRITICAL FIX: Explicitly exclude .editor-workspace and .page to prevent layout framing issues
    // We only want to select actual content elements. Added spans with specific classes.
    const block = element?.closest('p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), blockquote, li, span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle');
    
    if (block) {
        activeBlock = block as HTMLElement;
        const computed = window.getComputedStyle(block);
        
        // Read current styles to update toolbar
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
        // Read width if explicit, otherwise let toolbar handle default
        state.width = activeBlock.style.width || '';

        // Detect Shape
        const shapeContainer = activeBlock.closest('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle') as HTMLElement;
        if (shapeContainer) {
            if (shapeContainer.classList.contains('shape-circle')) state.shape = 'circle';
            else if (shapeContainer.classList.contains('shape-pill')) state.shape = 'pill';
            else if (shapeContainer.classList.contains('shape-speech')) state.shape = 'speech';
            else if (shapeContainer.classList.contains('shape-cloud')) state.shape = 'cloud';
            else if (shapeContainer.classList.contains('shape-rectangle')) state.shape = 'rectangle';
            else state.shape = 'none'; // mission-box or tracing-line don't have a shape type in the dropdown
        } else {
            state.shape = 'none';
        }

        // Detect Alignment for Shapes
        if (shapeContainer) {
            const computedContainer = window.getComputedStyle(shapeContainer);
            const ml = parseInt(computedContainer.marginLeft);
            const mr = parseInt(computedContainer.marginRight);
            
            // Heuristic for alignment
            if (ml < 10 && mr > 10) {
                state.alignLeft = true;
                state.alignCenter = false;
                state.alignRight = false;
            } else if (mr < 10 && ml > 10) {
                state.alignLeft = false;
                state.alignCenter = false;
                state.alignRight = true;
            } else {
                state.alignLeft = false;
                state.alignCenter = true;
                state.alignRight = false;
            }
        }
    }

    onSelectionChange(state, activeBlock);
  }, [onSelectionChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
      // CMD/CTRL + ENTER for Page Break
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          onPageBreak();
          return;
      }

      // Handle breaking out of special blocks (Enter key)
      if (e.key === 'Enter' && !e.shiftKey) {
          const selection = document.getSelection();
          if (!selection || selection.rangeCount === 0) return;
          
          const range = selection.getRangeAt(0);
          const node = range.commonAncestorContainer;
          const element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
          
          // Check if we are inside a special container
          const specialBlock = element?.closest('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud, .shape-rectangle') as HTMLElement;
          
          if (specialBlock) {
             // Logic for SPAN-based shapes (inline-block)
             // Default behavior usually inserts <br>, which keeps text inside the shape.
             // We want to break out into a new Paragraph.
             if (specialBlock.tagName === 'SPAN') {
                 e.preventDefault();
                 
                 range.deleteContents(); // Clear selection if any
                 
                 // Create a range from caret to end of shape
                 const afterRange = document.createRange();
                 afterRange.setStart(range.endContainer, range.endOffset);
                 afterRange.setEndAfter(specialBlock);
                 
                 const contentAfter = afterRange.extractContents();
                 
                 const newP = document.createElement('p');
                 // If content is just empty text nodes, treat as empty
                 if (!contentAfter.textContent?.trim()) {
                     newP.innerHTML = '<br>'; 
                 } else {
                     newP.appendChild(contentAfter);
                 }
                 
                 // Insert new P after the shape
                 if (specialBlock.parentNode) {
                     specialBlock.parentNode.insertBefore(newP, specialBlock.nextSibling);
                 }
                 
                 // Move Selection to new P
                 const newRange = document.createRange();
                 newRange.setStart(newP, 0);
                 newRange.collapse(true);
                 selection.removeAllRanges();
                 selection.addRange(newRange);
                 
                 // Force update
                 if (contentRef.current) {
                     onContentChange(contentRef.current.innerHTML);
                 }
                 return;
             }

             // Logic for Block-based shapes (P/DIV/H*)
             // Default behavior creates a duplicate block with the same classes.
             // We want to revert the new block to a standard P.
             setTimeout(() => {
                 const selection = document.getSelection();
                 if (!selection || selection.rangeCount === 0) return;
                 const newRange = selection.getRangeAt(0);
                 const newNode = newRange.commonAncestorContainer;
                 const newElement = newNode.nodeType === 1 ? newNode as HTMLElement : newNode.parentElement;
                 const newBlock = newElement?.closest('.mission-box, .tracing-line, h1, h2, h3, h4, h5, h6, .shape-speech, .shape-cloud, .shape-circle, .shape-rectangle');

                 if (newBlock && newBlock !== specialBlock) {
                     // We created a duplicate block! Convert it to a paragraph
                     const p = document.createElement('p');
                     p.innerHTML = '<br>'; // Placeholder to allow caret
                     
                     // Move content if any (unlikely for immediate Enter, but safe to check)
                     while (newBlock.firstChild) {
                         p.appendChild(newBlock.firstChild);
                     }
                     if (p.innerHTML === '') p.innerHTML = '<br>';

                     newBlock.parentNode?.replaceChild(p, newBlock);
                     
                     // Move caret to new P
                     const r = document.createRange();
                     r.selectNodeContents(p);
                     r.collapse(true);
                     selection.removeAllRanges();
                     selection.addRange(r);
                 }
             }, 0);
          }
      }
  };

  // --- Drag and Drop Handling ---
  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
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
                      // Check if dropped onto an existing image
                      const target = e.target as HTMLElement;
                      if (target.tagName === 'IMG') {
                          const img = target as HTMLImageElement;
                          img.src = imgUrl;
                          img.classList.remove('broken-image');
                          onImageSelect(img); // Re-select to update tools
                      } else {
                          // Standard insert
                          // We need to restore focus or range if dropped elsewhere, 
                          // but for simplicity, execCommand inserts at caret (or last focus).
                          // Ideally, we move caret to drop point, but that's complex with React events.
                          // Browsers often handle caret move on dragover automatically.
                          document.execCommand('insertImage', false, imgUrl);
                      }
                      
                      // Trigger save
                      if (contentRef.current) {
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
          
          // Image Selection
          if (target.tagName === 'IMG') {
              onImageSelect(target as HTMLImageElement);
              onHRSelect(null);
          } 
          // HR Selection - stopPropagation to prevent immediate deselection if logic bubbles
          else if (target.tagName === 'HR') {
              e.stopPropagation(); 
              onHRSelect(target as HTMLHRElement);
              onImageSelect(null);
          }
          else {
              // Ignore resize handles
              if ((e.target as HTMLElement).closest('.cursor-nw-resize')) return;
              
              // Only clear if we clicked something that isn't a tool
              onImageSelect(null);
              onHRSelect(null);
          }
      };

      const handleInput = () => {
          if (contentRef.current) {
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
  }, [handleSelectionChange, onImageSelect, onHRSelect, onContentChange]);


  return (
    <div 
        ref={containerRef}
        className="flex-1 bg-gray-200 overflow-y-auto h-[calc(100vh-64px)] relative p-8 flex flex-col items-center"
        onClick={(e) => {
            // Only clear if clicking the gray background directly
            if (e.target === containerRef.current) {
                onImageSelect(null);
                onHRSelect(null);
            }
        }}
    >
        <style dangerouslySetInnerHTML={{ __html: cssContent }} />
        <style>{`
            .editor-workspace .page {
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                margin-bottom: 2rem;
                background-color: white;
                display: block; 
                outline: none;
                position: relative; 
            }
            .editor-workspace input, .editor-workspace textarea {
                pointer-events: auto;
            }
            img:hover {
                cursor: pointer;
            }
            /* Highlight selected HR */
            hr[data-selected="true"] {
                outline: 2px dashed #3b82f6;
                outline-offset: 4px; 
                cursor: pointer;
                position: relative;
                z-index: 10;
            }
            hr {
                cursor: pointer;
                background-color: transparent;
                /* Increased click area without affecting visuals */
                padding: 4px 0; 
                background-clip: content-box;
            }
        `}</style>

        <div 
            ref={contentRef}
            className="editor-workspace w-full flex flex-col items-center outline-none"
            contentEditable={!imageProperties.isCropping}
            onKeyDown={handleKeyDown}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            suppressContentEditableWarning={true}
        />
        
        {selectedImage && (
            <ImageOverlay 
                image={selectedImage}
                containerRef={containerRef}
                isCropping={imageProperties.isCropping}
                onCropComplete={onCropComplete}
                onCancelCrop={onCancelCrop}
            />
        )}
        
        {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200 z-50">
                <span className="text-gray-500 font-medium">Loading document...</span>
            </div>
        )}
    </div>
  );
};

export default Editor;
