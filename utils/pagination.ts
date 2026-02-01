
// utils/pagination.ts

/**
 * Checks if the content of a page is overflowing its fixed height.
 */
export const isPageOverflowing = (page: HTMLElement): boolean => {
    // We check if scrollHeight (total content height) is greater than clientHeight (visible fixed height)
    // We add a small buffer (1px) to avoid precision errors
    return page.scrollHeight > page.clientHeight + 1;
};

/**
 * Checks if a page has significant empty space at the bottom.
 * Returns true if we can likely fit content from the next page.
 */
export const hasPageSpace = (page: HTMLElement, threshold: number = 20): boolean => {
    return (page.scrollHeight + threshold) < page.clientHeight;
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
 * The core reflow logic.
 * Iterates through pages and pushes overflowing content to the next page,
 * or pulls content up if there is space.
 */
export const reflowPages = (editor: HTMLElement) => {
    // 1. Sanitize first
    ensureContentIsPaginated(editor);

    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    let changesMade = false;

    // Helper to get bounding rect relative to viewport
    // We use this to detect strict visual overflow
    
    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageRect = page.getBoundingClientRect();
        // The visible 'bottom' of the page content area (minus padding)
        // We assume standard padding, but getComputedStyle is safer.
        const computed = window.getComputedStyle(page);
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const pageBottom = pageRect.bottom - paddingBottom; 

        // --- 1. HANDLE OVERFLOW (Push Down) ---
        // We check visual overflow relative to the page bottom limit
        while (isPageOverflowing(page)) {
            changesMade = true;
            
            // Get the next page, or create it if it doesn't exist
            let nextPage = pages[i + 1];
            if (!nextPage) {
                nextPage = document.createElement('div');
                nextPage.className = 'page';
                editor.appendChild(nextPage);
                pages.push(nextPage); 
            }

            // Find the LAST child.
            // If it's fully below, move it.
            // If it's straddling, SPLIT it.
            const lastChild = page.lastChild as HTMLElement;
            
            if (lastChild) {
                // If it's a text node (orphan text directly in page), wrap it? 
                // ensureContentIsPaginated mostly prevents this, but let's handle Element only for split.
                if (lastChild.nodeType === Node.ELEMENT_NODE) {
                     const splitResult = splitElement(lastChild, pageBottom);
                     
                     if (splitResult === lastChild) {
                         // Move the WHOLE node
                         if (nextPage.firstChild) {
                             nextPage.insertBefore(lastChild, nextPage.firstChild);
                         } else {
                             nextPage.appendChild(lastChild);
                         }
                     } else if (splitResult) {
                         // We have a new "overflow" part.
                         if (nextPage.firstChild) {
                             nextPage.insertBefore(splitResult, nextPage.firstChild);
                         } else {
                             nextPage.appendChild(splitResult);
                         }
                         // The original 'lastChild' stays, but shorter.
                     } else {
                         // splitElement returned null, meaning it thought it fit?
                         // But isPageOverflowing is true. 
                         // This implies we have many small elements and the last one just barely crosses?
                         // Or precision issues.
                         // Fallback: Just move the last node entirely to avoid infinite loop.
                         if (nextPage.firstChild) {
                             nextPage.insertBefore(lastChild, nextPage.firstChild);
                         } else {
                             nextPage.appendChild(lastChild);
                         }
                     }
                } else {
                    // Text node or other -> just move it
                    if (nextPage.firstChild) {
                        nextPage.insertBefore(lastChild, nextPage.firstChild);
                    } else {
                        nextPage.appendChild(lastChild);
                    }
                }
            } else {
                break;
            }
        }

        // --- 2. HANDLE UNDERFLOW (Pull Up) ---
        // Only pull up if we are not the last page
        if (i < pages.length - 1) {
            const nextPage = pages[i + 1];
            
            // Try to move nodes from next page to current page until full
            while (nextPage.firstChild && hasPageSpace(page, 10)) {
                const firstChild = nextPage.firstChild;
                
                // Tentatively move
                page.appendChild(firstChild);
                
                // Check if we caused overflow
                if (isPageOverflowing(page)) {
                    // Oops, too big. Put it back.
                    if (nextPage.firstChild) {
                        nextPage.insertBefore(firstChild, nextPage.firstChild);
                    } else {
                        nextPage.appendChild(firstChild);
                    }
                    break; // Stop pulling
                }
                changesMade = true;
            }

            // If next page is now empty, remove it
            if (!nextPage.hasChildNodes() || (nextPage.childNodes.length === 1 && nextPage.firstChild?.nodeType === Node.TEXT_NODE && !nextPage.textContent?.trim())) {
                nextPage.remove();
                pages.splice(i + 1, 1); 
                i--; 
                changesMade = true;
            }
        }
    }

    return changesMade;
};
