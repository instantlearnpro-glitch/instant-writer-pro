
// utils/pagination.ts

/**
 * Get the scale factor applied to an element (e.g., from zoom transform)
 */
const getScale = (el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const h = el.offsetHeight || 1;
    return rect.height / h || 1;
};

/**
 * Check if an element is in normal document flow (not absolute/fixed positioned)
 */
const isFlowElement = (el: HTMLElement): boolean => {
    if (el.classList.contains('page-footer')) return false;
    if (el.classList.contains('image-overlay')) return false;
    if (el.classList.contains('resize-handle')) return false;
    const pos = window.getComputedStyle(el).position;
    return pos !== 'absolute' && pos !== 'fixed';
};

/**
 * Checks if the content of a page is overflowing its fixed height.
 * Temporarily removes constraints to measure true content height.
 */
export const isPageOverflowing = (page: HTMLElement): boolean => {
    // Save original styles
    const originalHeight = page.style.height;
    const originalMaxHeight = page.style.maxHeight;
    const originalOverflow = page.style.overflow;
    
    // Remove constraints to measure true content height
    page.style.height = 'auto';
    page.style.maxHeight = 'none';
    page.style.overflow = 'visible';
    
    // Get the natural content height
    const contentHeight = page.scrollHeight;
    
    // Restore original styles
    page.style.height = originalHeight;
    page.style.maxHeight = originalMaxHeight;
    page.style.overflow = originalOverflow;
    
    // Get the fixed page height from computed style (the CSS value)
    const computed = window.getComputedStyle(page);
    const pageHeight = parseFloat(computed.height) || page.clientHeight;
    
    return contentHeight > pageHeight + 1;
};

/**
 * Gets the actual content height by measuring the last child's bottom position
 */
const getContentHeight = (page: HTMLElement): number => {
    const children = Array.from(page.children);
    if (children.length === 0) return 0;
    
    const pageRect = page.getBoundingClientRect();
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    
    let maxBottom = 0;
    children.forEach(child => {
        const childRect = child.getBoundingClientRect();
        const relativeBottom = childRect.bottom - pageRect.top;
        if (relativeBottom > maxBottom) {
            maxBottom = relativeBottom;
        }
    });
    
    return maxBottom;
};

/**
 * Checks if a page has significant empty space at the bottom.
 * Returns true if we can likely fit content from the next page.
 * Accounts for padding (margins) when calculating available space.
 */
export const hasPageSpace = (page: HTMLElement, threshold: number = 20): boolean => {
    const pageRect = page.getBoundingClientRect();
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    
    // Calculate the actual content area height (excluding padding)
    const contentAreaHeight = pageRect.height - paddingTop - paddingBottom;
    
    // Get the actual content height within the page
    const contentHeight = getContentHeight(page);
    // Adjust content height to be relative to content area (subtract padding top)
    const adjustedContentHeight = contentHeight - paddingTop;
    
    const availableSpace = contentAreaHeight - adjustedContentHeight;
    
    return availableSpace > threshold;
};

/**
 * Ensures that all content in the editor workspace is contained within .page divs.
 * If any orphan content is found (e.g., from drag-and-drop or accidental breaks),
 * it moves it into the nearest page or creates a new one.
 */
export const ensureContentIsPaginated = (editor: HTMLElement) => {
    const children = Array.from(editor.childNodes);
    let currentPage: HTMLElement | null = null;
    let createdAnyPage = false;

    // First pass: Find the first existing page
    currentPage = editor.querySelector('.page') as HTMLElement;

    // If absolutely no page exists, create one
    if (!currentPage) {
        currentPage = document.createElement('div');
        currentPage.className = 'page';
        // Insert at start
        editor.insertBefore(currentPage, editor.firstChild);
        createdAnyPage = true;
    }

    // Identify orphans
    const orphans: Node[] = [];
    
    // We iterate to find nodes that are NOT .page and NOT tool/overlay elements
    children.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('page')) {
                currentPage = el; // Update current context
            } else if (!el.classList.contains('image-overlay') && !el.classList.contains('resize-handle')) {
                // It's an orphan element
                orphans.push(node);
            }
        } else if (node.nodeType === Node.TEXT_NODE) {
             if (node.textContent?.trim()) {
                 orphans.push(node);
             }
        }
    });

    if (orphans.length > 0) {
        // Move orphans to the last known page (or the one we created)
        // If we are iterating, we might want to put them in the page *before* them if possible,
        // but simple logic: put them in the last active page found.
        if (currentPage) {
            orphans.forEach(orphan => {
                // Check if the orphan is actually currently a child of editor (it might have been moved already)
                if (orphan.parentNode === editor) {
                     currentPage!.appendChild(orphan);
                }
            });
        }
        return true; // We made changes
    }

    return createdAnyPage;
};

/**
 * Splits a block element (P, DIV, H*, LI) at the point where it overflows the page bottom.
 * Returns the new element containing the overflow content, or null if no split occurred.
 */
const splitElement = (element: HTMLElement, pageBottom: number): HTMLElement | null => {
    // Only split block text elements. Don't split images, tables, or generic wrappers yet.
    // Also check if the element ITSELF is below the page bottom (fully overflowing) - in that case just return it all.
    const rect = element.getBoundingClientRect();
    if (rect.top >= pageBottom) {
        return element; // Move the whole thing
    }
    if (rect.bottom <= pageBottom) {
        return null; // It fits completely
    }

    // It's straddling the line. Time to split.
    // We iterate through child nodes to find the breakpoint.
    const children = Array.from(element.childNodes);
    let splitNodeIndex = -1;
    let splitOffset = -1;

    // 1. Find the child node causing the overflow
    for (let i = 0; i < children.length; i++) {
        const node = children[i];
        let nodeBottom = 0;
        
        if (node.nodeType === Node.ELEMENT_NODE) {
            nodeBottom = (node as HTMLElement).getBoundingClientRect().bottom;
        } else if (node.nodeType === Node.TEXT_NODE) {
             const range = document.createRange();
             range.selectNode(node);
             nodeBottom = range.getBoundingClientRect().bottom;
        }

        if (nodeBottom > pageBottom) {
            splitNodeIndex = i;
            break;
        }
    }

    if (splitNodeIndex === -1) return null; // Should not happen if parent rect.bottom > pageBottom

    const targetNode = children[splitNodeIndex];
    
    // 2. If it's a text node, binary search for the character
    if (targetNode.nodeType === Node.TEXT_NODE) {
        const text = targetNode.textContent || '';
        let start = 0;
        let end = text.length;
        let mid = 0;
        let found = false;
        
        const range = document.createRange();

        while (start < end) {
            mid = Math.floor((start + end) / 2);
            range.setStart(targetNode, 0);
            range.setEnd(targetNode, mid);
            const rect = range.getBoundingClientRect();
            
            // If the *end* of this range is below the line? 
            // Actually getBoundingClientRect for a range wraps the whole text.
            // We want to know if the character at 'mid' is below the line.
            
            // Better strategy: Check rects of range from 0 to mid.
            // If rect.bottom > pageBottom, then the split is BEFORE mid.
            // But this depends on line wrapping.
            
            if (rect.bottom > pageBottom) {
                // The text up to 'mid' is ALREADY overflowing. So split must be earlier.
                end = mid;
            } else {
                // Text fits. Try adding more.
                start = mid + 1;
            }
        }
        splitOffset = start - 1; // Approximate
        // Refine: Ensure we don't split in the middle of a word if possible? 
        // For now, strict char split is okay, or spaces.
        if (splitOffset < 0) splitOffset = 0;
    }

    // 3. Create the new element (clone)
    const newElement = element.cloneNode(false) as HTMLElement;
    newElement.id = ''; // Remove ID to avoid duplicates
    
    // Move content
    // If we split a text node:
    if (splitOffset >= 0 && targetNode.nodeType === Node.TEXT_NODE) {
        const textNode = targetNode as Text;
        // Split the text node into two
        const remainingText = textNode.splitText(splitOffset);
        newElement.appendChild(remainingText);
    } else {
        // If we didn't split INSIDE the node (e.g. it was an element), 
        // we just move this node and all subsequent ones.
        if (targetNode.nodeType === Node.ELEMENT_NODE && (targetNode as HTMLElement).getBoundingClientRect().top > pageBottom) {
             // Whole node is below
             newElement.appendChild(targetNode);
        } else {
             // Node straddles? Recursive split? 
             // For simplicity in this version, if a child ELEMENT straddles, we move the whole child.
             newElement.appendChild(targetNode);
        }
    }

    // Move all SUBSEQUENT siblings to the new element
    for (let i = splitNodeIndex + 1; i < children.length; i++) {
        newElement.appendChild(children[i]);
    }
    
    // Cleanup empty text nodes in old element
    // (Optional but good for cleanliness)

    return newElement;
};

/**
 * Get the last flow element (in normal document flow) from a page
 */
const getLastFlowChild = (page: HTMLElement): HTMLElement | null => {
    const els = Array.from(page.children) as HTMLElement[];
    for (let i = els.length - 1; i >= 0; i--) {
        if (isFlowElement(els[i])) return els[i];
    }
    return null;
};

/**
 * The core reflow logic.
 * CONSERVATIVE: Only moves WHOLE elements to next page when they overflow.
 * Never splits elements, never pulls content up, never removes pages.
 * This preserves the original document structure and spacing.
 */
export const reflowPages = (editor: HTMLElement) => {
    // 1. Sanitize first
    ensureContentIsPaginated(editor);

    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    let changesMade = false;
    let iterations = 0;
    const maxIterations = 100; // Safety limit
    
    for (let i = 0; i < pages.length && iterations < maxIterations; i++) {
        const page = pages[i];
        
        // Only handle overflow - push elements to next page
        while (isPageOverflowing(page) && iterations < maxIterations) {
            iterations++;
            
            // Get the last flow element (skip non-flow elements like footers)
            const lastEl = getLastFlowChild(page);
            if (!lastEl) break;
            
            // Get or create next page
            let nextPage = pages[i + 1];
            if (!nextPage) {
                nextPage = document.createElement('div');
                nextPage.className = 'page';
                editor.appendChild(nextPage);
                pages.push(nextPage);
            }
            
            // Move the WHOLE element to the beginning of next page
            if (nextPage.firstChild) {
                nextPage.insertBefore(lastEl, nextPage.firstChild);
            } else {
                nextPage.appendChild(lastEl);
            }
            
            changesMade = true;
        }
    }

    return changesMade;
};
