import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import TOCModal from './components/TOCModal';
import PageNumberModal from './components/PageNumberModal';
import { DocumentState, SelectionState, ImageProperties, TOCEntry, TOCSettings, HRProperties, PageAnchor } from './types';
import { DEFAULT_CSS, DEFAULT_HTML, PAGE_FORMATS } from './constants';

const App: React.FC = () => {
  const [docState, setDocState] = useState<DocumentState>({
    htmlContent: DEFAULT_HTML,
    cssContent: DEFAULT_CSS,
    fileName: 'untitled_mission.html'
  });

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

  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [isTOCModalOpen, setIsTOCModalOpen] = useState(false);
  const [isPageNumberModalOpen, setIsPageNumberModalOpen] = useState(false);
  const [pageAnchors, setPageAnchors] = useState<PageAnchor[]>([]);
  
  const [showFrameTools, setShowFrameTools] = useState(false);
  
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Parse HTML to count pages when content changes
  useEffect(() => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(docState.htmlContent, 'text/html');
    const pages = doc.querySelectorAll('.page');
    setPageCount(pages.length || 1);
  }, [docState.htmlContent]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        const styleTags = doc.querySelectorAll('style');
        let extractedCss = '';
        styleTags.forEach(tag => {
            extractedCss += tag.innerHTML + '\n';
            tag.remove();
        });

        const bodyContent = doc.body.innerHTML;

        setDocState({
          htmlContent: bodyContent,
          cssContent: extractedCss || DEFAULT_CSS,
          fileName: file.name
        });
      }
    };
    reader.readAsText(file);
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
            } else {
                const editor = document.querySelector('.editor-workspace') as HTMLElement;
                editor?.focus();
                document.execCommand('insertImage', false, imgUrl);
            }
        }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  const handleFormat = (command: string, value?: string) => {
    if (command === 'removeSelection') {
        setSelectedImage(null);
        setSelectedHR(null);
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
            
            shapeContainer = (node as HTMLElement).closest('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud');
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
            
            // CRITICAL: Return immediately to prevent text alignment
            return;
        }
    }

    // 2. Standard Text Command (if not inside a shape)
    document.execCommand(command, false, value);
    
    // For font size, ensure we force focus back if dropdown was used
    const editor = document.querySelector('.editor-workspace') as HTMLElement;
    editor?.focus();
  };

  const handleUpdateStyle = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const parentBlock = range.commonAncestorContainer.parentElement?.closest('h1, h2, h3, h4, h5, h6, p, blockquote');
    
    if (!parentBlock) {
        alert("Select text inside a paragraph or heading first.");
        return;
    }

    const tagName = parentBlock.nodeName.toLowerCase();
    const computed = window.getComputedStyle(parentBlock as Element);
    
    const newRule = `
${tagName} {
    font-family: ${computed.fontFamily} !important;
    font-size: ${computed.fontSize} !important;
    color: ${computed.color} !important;
    font-weight: ${computed.fontWeight} !important;
    text-align: ${computed.textAlign} !important;
    font-style: ${computed.fontStyle} !important;
    text-decoration: ${computed.textDecoration} !important;
    margin-top: ${computed.marginTop} !important;
    margin-bottom: ${computed.marginBottom} !important;
    line-height: ${computed.lineHeight} !important;
}
`;
    setDocState(prev => ({
        ...prev,
        cssContent: prev.cssContent + '\n' + newRule
    }));
    
    alert(`Updated style for <${tagName}> to match selection.`);
  };

  // --- Feature: Real-time Block Styling (Frames & Pudding & Shapes) ---
  const handleBlockStyleUpdate = (styles: Record<string, string>) => {
      if (!activeBlock) return;

      Object.entries(styles).forEach(([key, value]) => {
          if (key === 'shape') {
              // Remove existing shape classes
              activeBlock.classList.remove('shape-circle', 'shape-pill', 'shape-speech', 'shape-cloud');
              
              if (value !== 'none') {
                  activeBlock.style.borderRadius = ''; 
                  activeBlock.classList.add(`shape-${value}`);
              }
          } 
          else if (key === 'padding') {
              (activeBlock.style as any).padding = value;
          } else {
              (activeBlock.style as any)[key] = value;
          }
      });

      setSelectionState(prev => ({ ...prev, ...styles }));
  };

  const handleInsertHorizontalRule = () => {
      // Focus the editor first to ensure insertion happens in the content
      const editor = document.querySelector('.editor-workspace') as HTMLElement;
      editor?.focus();
      
      // Insert an explicitly styled HR to avoid it being invisible due to default CSS
      const hrHtml = '<hr style="width: 100%; border-top: 2px solid #000; border-bottom: none; border-left: none; border-right: none; height: 0px; background-color: transparent; margin: 20px auto;" />';
      document.execCommand('insertHTML', false, hrHtml);
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
      
      setDocState(prev => ({ ...prev }));
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

  const handleInsertPageNumbers = (startAnchorId: string, font: string, fontSize: string) => {
      const workspace = document.querySelector('.editor-workspace');
      if (!workspace) return;

      const pages = workspace.querySelectorAll('.page');
      
      let startPageIndex = 0; // Default to first page (0-based)

      if (startAnchorId !== 'DOC_START') {
          const anchorEl = document.getElementById(startAnchorId);
          if (anchorEl) {
              const pageEl = anchorEl.closest('.page');
              if (pageEl) {
                  // Find index of this page
                  for (let i = 0; i < pages.length; i++) {
                      if (pages[i] === pageEl) {
                          startPageIndex = i;
                          break;
                      }
                  }
              }
          }
      }

      // Re-query parser only to reconstruct full HTML properly, but rely on page indices
      // Ideally we should manipulate the existing DOM nodes in workspace directly, but docState is truth.
      // However, footer manipulation is tricky in pure string regex.
      // Let's operate on the live DOM nodes in `pages` then serialize back.

      pages.forEach((page, index) => {
          // Remove existing footers first
          const existingFooter = page.querySelector('.page-footer');
          if (existingFooter) {
              existingFooter.remove();
          }

          // Check if we should number this page
          if (index >= startPageIndex) {
              const footer = document.createElement('div');
              footer.className = 'page-footer';
              footer.style.fontFamily = font;
              footer.style.fontSize = `${fontSize}pt`;
              // Number starts at 1 relative to the start page
              footer.textContent = (index - startPageIndex + 1).toString(); 
              
              // Prevent editing of the footer itself
              footer.setAttribute('contenteditable', 'false');
              
              page.appendChild(footer);
          }
      });

      setDocState(prev => ({
          ...prev,
          htmlContent: workspace.innerHTML // Capture the modified live DOM
      }));
      setIsPageNumberModalOpen(false);
  };

  const handlePageSizeChange = (formatId: string) => {
    const format = PAGE_FORMATS[formatId as keyof typeof PAGE_FORMATS];
    if (!format) return;

    const markerStart = '/* SPYWRITER_LAYOUT_OVERRIDE_START */';
    const markerEnd = '/* SPYWRITER_LAYOUT_OVERRIDE_END */';

    const newCssBlock = `
${markerStart}
@page {
    size: ${format.width} ${format.height};
    margin: ${format.margin};
}
.page {
    width: ${format.width} !important;
    min-height: ${format.height} !important;
    padding: ${format.margin} !important;
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

    setDocState(prev => ({ ...prev, cssContent: updatedCss }));
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
  };


  const handleToggleCrop = () => {
      if (!selectedImage) return;
      setImageProperties(prev => ({ ...prev, isCropping: !prev.isCropping }));
  };

  const handleCropComplete = (newSrc: string) => {
      if (selectedImage) {
          selectedImage.src = newSrc;
          setImageProperties(prev => ({ ...prev, isCropping: false }));
      }
  };

  const handleCancelCrop = () => {
      setImageProperties(prev => ({ ...prev, isCropping: false }));
  };

  const handleImagePropertyChange = (prop: keyof ImageProperties, value: any) => {
      if (!selectedImage) return;

      const newProps = { ...imageProperties, [prop]: value };
      setImageProperties(newProps);

      const filterString = `brightness(${newProps.brightness}%) contrast(${newProps.contrast}%)`;
      selectedImage.style.filter = filterString;

      if (prop === 'width') {
           selectedImage.style.width = `${newProps.width}%`;
      }

      if (prop === 'alignment') {
        selectedImage.style.float = 'none';
        selectedImage.style.display = 'inline-block';
        selectedImage.style.margin = '0';

        switch (newProps.alignment) {
            case 'center':
                selectedImage.style.display = 'block';
                selectedImage.style.margin = '0 auto';
                break;
            case 'left':
                selectedImage.style.display = 'inline-block';
                break;
            case 'right':
                selectedImage.style.display = 'block';
                selectedImage.style.marginLeft = 'auto';
                break;
            case 'float-left':
                selectedImage.style.float = 'left';
                selectedImage.style.marginRight = '15px';
                selectedImage.style.marginBottom = '10px';
                break;
            case 'float-right':
                selectedImage.style.float = 'right';
                selectedImage.style.marginLeft = '15px';
                selectedImage.style.marginBottom = '10px';
                break;
        }
      }
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
          const isShape = block.matches('.mission-box, .tracing-line, .shape-circle, .shape-pill, .shape-speech, .shape-cloud');
          if (isShape || state.shape !== 'none') {
              setShowFrameTools(true);
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
        imageProperties={imageProperties}
        hrProperties={hrProperties}
        onImagePropertyChange={handleImagePropertyChange}
        onHRPropertyChange={handleHRPropertyChange}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isSidebarOpen={isSidebarOpen}
          pageCount={pageCount} 
          currentPage={currentPage}
          onPageSelect={scrollToPage}
        />
        
        <div className="flex-1 relative" onScroll={handleScroll}>
            <Editor 
                htmlContent={docState.htmlContent}
                cssContent={docState.cssContent}
                onContentChange={(html) => setDocState(prev => ({ ...prev, htmlContent: html }))}
                onSelectionChange={onSelectionChange}
                onImageSelect={handleImageSelect}
                onHRSelect={handleHRSelect}
                selectedImage={selectedImage}
                selectedHR={selectedHR}
                containerRef={editorContainerRef}
                imageProperties={imageProperties}
                onCropComplete={handleCropComplete}
                onCancelCrop={handleCancelCrop}
                onPageBreak={handlePageBreak}
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
        totalPages={pageCount}
        anchors={pageAnchors}
      />
    </div>
  );
};

export default App;
