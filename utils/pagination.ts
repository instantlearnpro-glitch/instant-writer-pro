
// utils/pagination.ts

/**
 * Get the scale factor applied to an element (e.g., from zoom transform)
 */
const getScale = (el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const h = el.offsetHeight || 1;
    return rect.height / h || 1;
};

declare global {
    interface Window {
        __reflowDebug?: Array<Record<string, unknown>>;
        __dumpReflowDebug?: () => string;
    }
}

const initReflowDebug = () => {
    if (!window.__reflowDebug) {
        window.__reflowDebug = [];
    }
    if (!window.__dumpReflowDebug) {
        window.__dumpReflowDebug = () => JSON.stringify(window.__reflowDebug, null, 2);
    }
};

const summarizeElement = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        rect: {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            height: Math.round(rect.height)
        },
        position: style.position,
        display: style.display,
        overflow: `${style.overflowX}/${style.overflowY}`,
        breakInside: style.getPropertyValue('break-inside') || style.getPropertyValue('-webkit-break-inside') || null,
        pageBreakInside: style.getPropertyValue('page-break-inside') || null
    };
};

const recordReflowIssue = (entry: Record<string, unknown>) => {
    initReflowDebug();
    window.__reflowDebug?.push({
        ts: new Date().toISOString(),
        ...entry
    });
    if ((window.__reflowDebug?.length || 0) > 50) {
        window.__reflowDebug?.shift();
    }
};

/**
 * Check if an element is in normal document flow (not absolute/fixed positioned)
 */
const isFooterElement = (el: HTMLElement): boolean => {
    if (el.classList.contains('page-footer')) return true;
    if (el.classList.contains('page-number')) return true;
    if (el.getAttribute('data-page-footer') === 'true') return true;
    if (el.getAttribute('data-page-number') === 'true') return true;
    if (el.tagName.toLowerCase() === 'footer') return true;
    return false;
};

const isFlowElement = (el: HTMLElement): boolean => {
    if (isFooterElement(el)) return false;
    if (el.classList.contains('image-overlay')) return false;
    if (el.classList.contains('resize-handle')) return false;
    if (el.getAttribute('data-page-break') === 'true') return false;
    if (el.getAttribute('data-user-page-break') === 'true') return false;
    const pos = window.getComputedStyle(el).position;
    return pos !== 'absolute' && pos !== 'fixed';
};

const shouldAvoidBreak = (el: HTMLElement): boolean => {
    const tag = el.tagName.toLowerCase();
    // Lists can be split at child boundaries during overflow.
    if ((tag === 'ul' || tag === 'ol') && isSplitContainer(el)) return false;
    // Text-level elements can be split mid-paragraph (Word-like behavior).
    // splitTextBlockByRange will handle splitting at the correct line.
    if (tag === 'p' || tag === 'li' || tag === 'blockquote' ||
        tag === 'h1' || tag === 'h2' || tag === 'h3' ||
        tag === 'h4' || tag === 'h5' || tag === 'h6') {
        return false;
    }
    // ALL other elements (divs, images, tables, etc.) are kept together.
    return true;
};

const isHardKeepTogether = (el: HTMLElement): boolean => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table' || tag === 'img' || tag === 'hr' || tag === 'textarea') return true;
    return false;
};

/**
 * Checks if the content of a page is overflowing its fixed height.
 * Temporarily removes constraints to measure true content height.
 */
/**
 * Get the height of an element including its bottom margin (in CSS pixels, scale-corrected).
 * Uses offsetHeight which is scroll-independent.
 */
const getElementHeightWithMargin = (el: HTMLElement, scale: number = 1): number => {
    const style = window.getComputedStyle(el);
    const marginBottom = parseFloat(style.marginBottom) || 0;
    // offsetHeight is scroll-independent and accounts for borders/padding
    // but NOT for CSS transforms. We need getBoundingClientRect().height for that.
    const rect = el.getBoundingClientRect();
    return rect.height / scale + marginBottom;
};

/**
 * Get the top position of an element RELATIVE to its containing page.
 * This is scroll-independent because both el and page move together when scrolled.
 */
const getElementTopRelPage = (el: HTMLElement, page: HTMLElement): number => {
    const elRect = el.getBoundingClientRect();
    const pageRect = page.getBoundingClientRect();
    const scale = getScale(page);
    return (elRect.top - pageRect.top) / scale;
};

/**
 * Get the bottom position (+ margin) of an element RELATIVE to its containing page, in CSS pixels.
 * Scroll-independent.
 */
const getElementBottomRelPage = (el: HTMLElement, page: HTMLElement, scale: number = 1): number => {
    return getElementTopRelPage(el, page) + getElementHeightWithMargin(el, scale);
};

const getFooterLimit = (page: HTMLElement): number | null => {
    const candidates = Array.from(page.querySelectorAll('.page-footer, .page-number, [data-page-footer="true"], [data-page-number="true"], footer')) as HTMLElement[];
    let limit: number | null = null;
    candidates.forEach(el => {
        if (!el.isConnected) return;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0 || rect.width <= 0) return;
        const style = window.getComputedStyle(el);
        const isAbsolute = style.position === 'absolute' || style.position === 'fixed';
        const isNamed = isFooterElement(el);
        if (!isNamed && !isAbsolute) return;
        const top = rect.top;
        if (limit === null || top < limit) {
            limit = top;
        }
    });
    return limit;
};

const summarizeFooterCandidates = (page: HTMLElement) => {
    const candidates = Array.from(page.querySelectorAll('.page-footer, .page-number, [data-page-footer="true"], [data-page-number="true"], footer')) as HTMLElement[];
    return candidates.map(el => summarizeElement(el));
};

export const isPageOverflowing = (page: HTMLElement): boolean => {
    const scale = getScale(page);
    const computed = window.getComputedStyle(page);
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const pageRect = page.getBoundingClientRect();
    const pageHeightCss = pageRect.height / scale;

    // Available height in CSS pixels (excludes padding)
    let allowedHeightCss = pageHeightCss - paddingTop - paddingBottom;

    // Footer limit: in viewport coords, convert to page-relative CSS px
    const footerLimit = getFooterLimit(page);
    if (footerLimit !== null) {
        const footerRelCss = (footerLimit - pageRect.top) / scale - paddingTop;
        allowedHeightCss = Math.min(allowedHeightCss, footerRelCss);
    }

    const contentHeightCss = getContentHeight(page, scale);
    if (contentHeightCss <= 0) return false;
    return contentHeightCss > allowedHeightCss + 1;
};

/**
 * Gets content height in CSS pixels, relative to the page's padding-top.
 * I.e., how much of the content area is used (0 means completely empty).
 * Scroll-independent.
 */
const getContentHeight = (page: HTMLElement, scale: number = 1): number => {
    const children = Array.from(page.children).filter(child => isFlowElement(child as HTMLElement));
    if (children.length === 0) return 0;

    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;

    let maxBottomRelPage = 0;
    children.forEach(child => {
        const bottomRelPage = getElementBottomRelPage(child as HTMLElement, page, scale);
        if (bottomRelPage > maxBottomRelPage) {
            maxBottomRelPage = bottomRelPage;
        }
    });

    // Return content height relative to the CONTENT AREA start (after paddingTop)
    return Math.max(0, maxBottomRelPage - paddingTop);
};

const getLastOverflowingFlowChild = (page: HTMLElement, _pageBottom: number, scale: number): HTMLElement | null => {
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const pageRect = page.getBoundingClientRect();
    const pageHeightCss = pageRect.height / scale;
    let allowedHeightCss = pageHeightCss - paddingTop - paddingBottom;

    const footerLimit = getFooterLimit(page);
    if (footerLimit !== null) {
        const footerRelCss = (footerLimit - pageRect.top) / scale - paddingTop;
        allowedHeightCss = Math.min(allowedHeightCss, footerRelCss);
    }

    const els = Array.from(page.children).filter(child => isFlowElement(child as HTMLElement)) as HTMLElement[];
    if (els.length === 0) return null;
    let overflowEl: HTMLElement | null = null;
    els.forEach(el => {
        // bottomRelPage is relative to page top (not content area), in CSS px
        const bottomRelPage = getElementBottomRelPage(el, page, scale);
        // allowedHeightCss is from page top (not content area) = paddingTop + contentArea
        if (bottomRelPage > paddingTop + allowedHeightCss + 1) {
            overflowEl = el;
        }
    });
    return overflowEl;
};

/**
 * Checks if a page has significant empty space at the bottom.
 * Returns true if we can likely fit content from the next page.
 * Scroll-independent: uses CSS pixel heights relative to the page.
 */
export const hasPageSpace = (page: HTMLElement, threshold: number = 20): boolean => {
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const pageH = page.offsetHeight; // always correct, scroll-independent

    // Content area in CSS px (no scale needed for offsetHeight — it's already CSS px)
    let contentAreaH = pageH - paddingTop - paddingBottom;

    // Footer limit using offsetTop (scroll-independent)
    const footerCandidates = Array.from(page.querySelectorAll('.page-footer, .page-number, [data-page-footer="true"], [data-page-number="true"], footer')) as HTMLElement[];
    footerCandidates.forEach(el => {
        if (!el.isConnected) return;
        if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return;
        const style = window.getComputedStyle(el);
        const isAbsolute = style.position === 'absolute' || style.position === 'fixed';
        const isNamed = isFooterElement(el);
        if (!isNamed && !isAbsolute) return;
        // el.offsetTop is relative to the page (offsetParent = page)
        const footerRelH = el.offsetTop - paddingTop;
        contentAreaH = Math.min(contentAreaH, Math.max(0, footerRelH));
    });

    // Content used: find the lowest flow child bottom using offset properties
    const used = getContentHeightOffset(page);
    const availableSpace = contentAreaH - used;
    return availableSpace > threshold;
};

/**
 * Get content height using offsetTop/offsetHeight (scroll-independent).
 * Returns how much of the content area is used in CSS px.
 */
const getContentHeightOffset = (page: HTMLElement): number => {
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const children = Array.from(page.children).filter(child => isFlowElement(child as HTMLElement)) as HTMLElement[];
    if (children.length === 0) return 0;
    let maxBottom = 0;
    children.forEach(child => {
        // offsetTop is relative to offsetParent (the page div with position: relative)
        const mb = parseFloat(window.getComputedStyle(child).marginBottom) || 0;
        const bottom = child.offsetTop + child.offsetHeight + mb;
        if (bottom > maxBottom) maxBottom = bottom;
    });
    return Math.max(0, maxBottom - paddingTop);
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
        let madeChanges = false;
        if (currentPage) {
            orphans.forEach(orphan => {
                // Check if the orphan is actually currently a child of editor (it might have been moved already)
                if (orphan.parentNode !== editor) return;

                // Safety: if this orphan contains nested .page elements (e.g., imported HTML wrapper),
                // promote those pages to workspace level first to avoid HierarchyRequestError.
                if (orphan instanceof HTMLElement && orphan.querySelector('.page')) {
                    const nestedPages = Array.from(orphan.querySelectorAll('.page')) as HTMLElement[];
                    nestedPages.forEach(nestedPage => {
                        // Insert the nested page directly into the workspace before the orphan
                        editor.insertBefore(nestedPage, orphan);
                        currentPage = nestedPage; // Track the last promoted page
                    });
                }

                // Now move the orphan (page-free) into the current page
                if (orphan.parentNode === editor) {
                    currentPage!.appendChild(orphan);
                    madeChanges = true;
                }
            });
        }
        return madeChanges || createdAnyPage;
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

const getFirstFlowChild = (page: HTMLElement): HTMLElement | null => {
    const els = Array.from(page.children) as HTMLElement[];
    for (let i = 0; i < els.length; i++) {
        if (isFlowElement(els[i])) return els[i];
    }
    return null;
};

const getPageBreakMarker = (page: HTMLElement): HTMLElement | null => {
    // A user page break is ONLY when a child element explicitly carries data-user-page-break='true'.
    // This is an element inserted by the user via the editor's "Insert Page Break" action.
    //
    // IMPORTANT: We do NOT check if the page div ITSELF has data-user-page-break='true',
    // because this attribute is set on the page div during HTML import (from CSS page-break rules).
    // That should NOT block the pullUp from filling the page's empty space.
    return page.querySelector(':scope > [data-user-page-break="true"]') as HTMLElement | null;
};

const isTextSplitTarget = (el: HTMLElement) => {
    return el.matches('p, h1, h2, h3, h4, h5, h6, li, blockquote');
};

const splitTextBlockByRange = (element: HTMLElement, pageBottom: number): HTMLElement | null => {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
        if (node.textContent && node.textContent.trim().length > 0) {
            textNodes.push(node);
        }
        node = walker.nextNode() as Text | null;
    }

    if (textNodes.length === 0) return null;

    let overflowNode: Text | null = null;
    for (const textNode of textNodes) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getBoundingClientRect();
        if (rect.bottom > pageBottom + 1) {
            overflowNode = textNode;
            break;
        }
    }

    if (!overflowNode) return null;

    const text = overflowNode.textContent || '';
    let low = 0;
    let high = text.length;
    let best = 0;
    const range = document.createRange();

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        range.setStart(overflowNode, 0);
        range.setEnd(overflowNode, Math.max(0, mid));
        const rect = range.getBoundingClientRect();
        if (rect.bottom <= pageBottom) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const splitOffset = Math.max(0, best);
    const splitRange = document.createRange();
    splitRange.selectNodeContents(element);
    try {
        splitRange.setStart(overflowNode, splitOffset);
    } catch {
        return null;
    }

    const fragment = splitRange.extractContents();
    if (!fragment || fragment.childNodes.length === 0) return null;

    const newElement = element.cloneNode(false) as HTMLElement;
    newElement.removeAttribute('id');
    newElement.appendChild(fragment);

    if (!element.textContent?.trim() && element.children.length === 0) {
        element.remove();
    } else {
        // Mark both halves for auto-merge when they end up on the same page
        const splitId = element.getAttribute('data-split-source')
            || `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        element.setAttribute('data-split-source', splitId);
        newElement.setAttribute('data-split-source', splitId);
    }

    return newElement;
};

const isSplitContainer = (el: HTMLElement, availableHeight?: number) => {
    const tag = el.tagName.toLowerCase();
    if (el.classList.contains('page')) return false;
    if (el.classList.contains('editor-workspace')) return false;
    if (el.classList.contains('page-footer')) return false;
    if (!['div', 'section', 'article', 'main', 'ul', 'ol'].includes(tag)) return false;

    // Don't split styled containers — these are intentional visual boxes
    if (el.classList.contains('mission-box') || el.classList.contains('shape-rectangle')
        || el.classList.contains('shape-circle') || el.classList.contains('shape-pill')
        || el.classList.contains('shape-speech') || el.classList.contains('shape-cloud')
        || el.classList.contains('toc-container')
        || el.classList.contains('writing-lines')
        || el.classList.contains('tracing-line')
        || el.classList.contains('exercise-block')) return false;

    const cs = window.getComputedStyle(el);
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
    const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
    if (hasBorder || hasBg) {
        // Allow splitting styled containers if they are taller than the available
        // page content area — otherwise all their content stays trapped and leaves
        // large empty spaces on the page.
        if (availableHeight != null && el.offsetHeight > availableHeight + 1) {
            return true;
        }
        return false;
    }

    return true;
};

const splitContainerByChildren = (container: HTMLElement, pageBottom: number): HTMLElement | null => {
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length < 2) return null;

    let splitIndex = -1;
    for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (rect.bottom > pageBottom) {
            splitIndex = i;
            break;
        }
    }

    if (splitIndex <= 0) return null;

    const newContainer = container.cloneNode(false) as HTMLElement;
    newContainer.removeAttribute('id');

    // Preserve numbered list continuation
    if (container.tagName.toLowerCase() === 'ol') {
        const existingStart = parseInt(container.getAttribute('start') || '1', 10);
        // Count only VISIBLE items before splitIndex
        let visibleBefore = 0;
        for (let i = 0; i < splitIndex; i++) {
            const li = children[i] as HTMLElement;
            if (li.style?.listStyleType !== 'none') {
                visibleBefore++;
            }
        }
        newContainer.setAttribute('start', String(existingStart + visibleBefore));
    }

    for (let i = splitIndex; i < children.length; i++) {
        newContainer.appendChild(children[i]);
    }

    // Clean up: if the original container is now empty, remove it
    if (container.children.length === 0 && !container.textContent?.trim()) {
        container.remove();
    } else {
        // Mark both halves for auto-merge and continuation detection
        const splitId = container.getAttribute('data-split-source')
            || `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        container.setAttribute('data-split-source', splitId);
        newContainer.setAttribute('data-split-source', splitId);
    }

    return newContainer;
};

const splitContainerByRange = (container: HTMLElement, pageBottom: number): HTMLElement | null => {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    while (node) {
        if (node.textContent && node.textContent.trim().length > 0) {
            textNodes.push(node);
        }
        node = walker.nextNode() as Text | null;
    }

    if (textNodes.length === 0) return null;

    let overflowNode: Text | null = null;
    for (const textNode of textNodes) {
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getBoundingClientRect();
        if (rect.bottom > pageBottom + 1) {
            overflowNode = textNode;
            break;
        }
    }

    if (!overflowNode) return null;

    const text = overflowNode.textContent || '';
    let low = 0;
    let high = text.length;
    let best = 0;
    const range = document.createRange();

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        range.setStart(overflowNode, 0);
        range.setEnd(overflowNode, Math.max(0, mid));
        const rect = range.getBoundingClientRect();
        if (rect.bottom <= pageBottom) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const splitRange = document.createRange();
    splitRange.selectNodeContents(container);
    try {
        splitRange.setStart(overflowNode, Math.max(0, best));
    } catch {
        return null;
    }

    // Count OL items BEFORE extractContents (extraction alters the DOM)
    const isOl = container.tagName.toLowerCase() === 'ol';
    const isUl = container.tagName.toLowerCase() === 'ul';
    let olItemCountBefore = 0;
    let olExistingStart = 1;
    if (isOl) {
        olExistingStart = parseInt(container.getAttribute('start') || '1', 10);
        olItemCountBefore = container.querySelectorAll(':scope > li').length;
    }

    const fragment = splitRange.extractContents();
    if (!fragment || fragment.childNodes.length === 0) return null;

    const newContainer = container.cloneNode(false) as HTMLElement;
    newContainer.removeAttribute('id');
    newContainer.appendChild(fragment);

    // Fix numbered/bullet list continuation
    if (isOl || isUl) {
        const newLIs = Array.from(newContainer.querySelectorAll(':scope > li'));

        // Rule: if an LI's text starts with a lowercase letter, it's a
        // continuation of a split sentence — hide its bullet/number.
        let hiddenCount = 0;
        for (const li of newLIs) {
            const text = (li.textContent || '').trimStart();
            const firstChar = text.charAt(0);
            if (firstChar && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
                // Starts with lowercase letter → hide bullet
                (li as HTMLElement).style.listStyleType = 'none';
                // For OL: don't count this item in CSS counter
                (li as HTMLElement).style.setProperty('counter-increment', 'none');
                hiddenCount++;
            }
        }

        if (isOl) {
            // Count only VISIBLE items remaining in original (skip hidden continuations)
            const remainingLIs = Array.from(container.querySelectorAll(':scope > li'));
            let visibleCount = 0;
            for (const li of remainingLIs) {
                const el = li as HTMLElement;
                if (el.style.listStyleType !== 'none') {
                    visibleCount++;
                }
            }
            newContainer.setAttribute('start', String(olExistingStart + visibleCount));
        }
        if (hiddenCount > 0) {
            newContainer.setAttribute('data-list-continuation', 'true');
        }
    }

    if (!container.textContent?.trim() && container.children.length === 0) {
        container.remove();
    } else {
        const splitId = container.getAttribute('data-split-source')
            || `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        container.setAttribute('data-split-source', splitId);
        newContainer.setAttribute('data-split-source', splitId);
    }

    return newContainer;
};

/**
 * Recursively pulls up children from a split container into a partial clone.
 * Handles nested containers (e.g., div > ol > li).
 * Returns the partial container (caller appends it) and updated free space.
 */
const pullUpSplitContainer = (
    container: HTMLElement,
    pgFree: number
): { partial: HTMLElement | null; movedAny: boolean; pgFree: number } => {
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length < 1) return { partial: null, movedAny: false, pgFree };

    const partialContainer = container.cloneNode(false) as HTMLElement;
    partialContainer.removeAttribute('id');
    let movedAny = false;
    const isOl = container.tagName.toLowerCase() === 'ol';
    const originalStart = isOl ? parseInt(container.getAttribute('start') || '1', 10) : 1;

    // Deduct only the TOP vertical overhead for the partial container.
    // The partial is the "top half" — it needs top padding/border but
    // the bottom is open.  The original keeps the bottom styling.
    const ccs = window.getComputedStyle(container);
    const cPadTop = parseFloat(ccs.paddingTop) || 0;
    const cBorderTop = parseFloat(ccs.borderTopWidth) || 0;
    const cMarginTop = parseFloat(ccs.marginTop) || 0;
    const cMarginBot = parseFloat(ccs.marginBottom) || 0;
    const topOverhead = cPadTop + cBorderTop + cMarginTop + cMarginBot;
    pgFree -= topOverhead;
    if (pgFree <= 0) return { partial: null, movedAny: false, pgFree: pgFree + topOverhead };

    for (const child of [...children]) {
        const childH = child.offsetHeight;
        const childS = window.getComputedStyle(child);
        const childMt = parseFloat(childS.marginTop) || 0;
        const childMb = parseFloat(childS.marginBottom) || 0;
        const childTotal = childH + childMt + childMb;


        if (childTotal <= pgFree + 1) {
            // Child fits whole — move it
            partialContainer.appendChild(child);
            pgFree -= childTotal;
            movedAny = true;
        } else if (isSplitContainer(child)) {
            // Child doesn't fit but is itself a split container — recurse
            const nested = pullUpSplitContainer(child, pgFree);
            if (nested.movedAny && nested.partial) {
                // Nest the partial child inside our partial container
                partialContainer.appendChild(nested.partial);
                pgFree = nested.pgFree;
                movedAny = true;
                // If the original child is now empty, remove it from source
                if (child.children.length === 0) {
                    child.remove();
                }
            }
            break; // Stop after first non-fitting child (even if partially split)
        } else if (isTextSplitTarget(child)) {
            // Child is a text block (p, h*, li, blockquote) — try line-level split
            const pulled = pullUpTextBlock(child, pgFree);
            if (pulled) {
                partialContainer.appendChild(pulled.partial);
                pgFree -= pulled.usedHeight;
                movedAny = true;
                if (!child.textContent?.trim() && child.children.length === 0) {
                    child.remove();
                }
            }
            break; // Stop after first split attempt
        } else {
            break; // Stop at the first non-fitting, non-splittable child
        }
    }

    // Update start on the remaining original <ol> ONCE after the loop
    if (isOl && movedAny) {
        // Count only VISIBLE moved items
        let movedVisible = 0;
        partialContainer.querySelectorAll(':scope > li').forEach(li => {
            if ((li as HTMLElement).style.listStyleType !== 'none') {
                movedVisible++;
            }
        });
        container.setAttribute('start', String(originalStart + movedVisible));
    }

    // Mark both halves so auto-merge can reunite them later.
    if (movedAny && partialContainer) {
        const splitId = container.getAttribute('data-split-source')
            || `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        container.setAttribute('data-split-source', splitId);
        partialContainer.setAttribute('data-split-source', splitId);
    }

    return { partial: movedAny ? partialContainer : null, movedAny, pgFree };
};

/**
 * Splits a text block (p, h1-h6, li, blockquote) so that the portion
 * fitting within `budgetPx` vertical pixels is extracted into a clone.
 *
 * This is the pull-up counterpart of `splitTextBlockByRange()` (which is
 * used during push-down).  It uses a binary search on Range bounding
 * rects to find the last character/word boundary that still falls within
 * the vertical budget, then extracts the leading fragment into a clone
 * and leaves the remainder in the original element.
 *
 * Returns `{ partial, usedHeight }` or `null` when nothing fits (e.g.
 * the very first rendered line already exceeds the budget).
 */
const pullUpTextBlock = (
    element: HTMLElement,
    budgetPx: number
): { partial: HTMLElement; usedHeight: number } | null => {
    // Collect all non-empty text nodes inside the element
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let n = walker.nextNode() as Text | null;
    while (n) {
        if (n.textContent && n.textContent.trim().length > 0) {
            textNodes.push(n);
        }
        n = walker.nextNode() as Text | null;
    }
    if (textNodes.length === 0) return null;

    // Account for CSS transform scale (zoom).
    // getBoundingClientRect() returns viewport pixels (scaled),
    // but budgetPx comes from offsetHeight (CSS pixels, unscaled).
    const scale = getScale(element);
    // Convert budgetPx to viewport pixels and subtract a safety margin
    // so we never spill into the footer/page-number zone.
    const budgetViewport = budgetPx * scale - 2;
    if (budgetViewport <= 0) return null;

    // We need to know the element's top so we can compute how many
    // viewport pixels a given text prefix occupies.
    const elRect = element.getBoundingClientRect();
    const elTop = elRect.top;
    // The budget line in viewport coordinates:
    const budgetLine = elTop + budgetViewport;

    // Quick check: does the first rendered line already overflow?
    // Measure the first text node's first character.
    const firstRange = document.createRange();
    firstRange.setStart(textNodes[0], 0);
    firstRange.setEnd(textNodes[0], Math.min(1, (textNodes[0].textContent || '').length));
    const firstRect = firstRange.getBoundingClientRect();
    if (firstRect.bottom > budgetLine + 1) {
        // Even a single character doesn't fit — nothing we can pull up.
        return null;
    }

    // Binary search for the split point.
    // We search across ALL text nodes in document order.  The split
    // point is defined as: the last character whose Range(0..char)
    // bounding rect bottom <= budgetLine.
    let splitTextNode: Text = textNodes[0];
    let splitOffset = 0;

    // Find which text node first crosses the budget line
    let targetNode: Text | null = null;
    for (const tn of textNodes) {
        const r = document.createRange();
        r.selectNodeContents(tn);
        const tnRect = r.getBoundingClientRect();
        if (tnRect.bottom > budgetLine + 1) {
            targetNode = tn;
            break;
        }
        // This entire text node fits — record it as our latest safe point
        splitTextNode = tn;
        splitOffset = (tn.textContent || '').length;
    }

    if (targetNode) {
        // Binary search within targetNode for the exact split offset
        const text = targetNode.textContent || '';
        let low = 0;
        let high = text.length;
        let best = 0;
        const range = document.createRange();

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            range.setStart(targetNode, 0);
            range.setEnd(targetNode, Math.max(0, mid));
            const rect = range.getBoundingClientRect();
            if (rect.bottom <= budgetLine) {
                best = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        if (best === 0 && targetNode === textNodes[0]) {
            // Nothing fits at all
            return null;
        }

        splitTextNode = targetNode;
        splitOffset = best;
    }

    // Safety: if nothing meaningful was identified, bail out
    if (splitOffset <= 0 && splitTextNode === textNodes[0]) {
        return null;
    }

    // Create a range from the start of the element to the split point,
    // then extract the fitting fragment into a clone.
    const splitRange = document.createRange();
    splitRange.selectNodeContents(element);
    try {
        splitRange.setEnd(splitTextNode, splitOffset);
    } catch {
        return null;
    }

    const fragment = splitRange.extractContents();
    if (!fragment || fragment.childNodes.length === 0) return null;

    // Check the fragment actually has text
    const fragText = fragment.textContent || '';
    if (!fragText.trim()) return null;

    const partial = element.cloneNode(false) as HTMLElement;
    partial.removeAttribute('id');
    partial.appendChild(fragment);

    // Preserve computed text-related styles as inline styles so the partial
    // doesn't lose inherited styling when moved out of a styled container.
    // Track which styles we stamp so merge can remove them later.
    const computedStyle = window.getComputedStyle(element);
    const textStyleProps = [
        'lineHeight', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
        'letterSpacing', 'wordSpacing', 'textAlign', 'color', 'textIndent'
    ];
    const stampedProps: string[] = [];
    for (const prop of textStyleProps) {
        const kebab = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        const val = computedStyle.getPropertyValue(kebab);
        if (val && !partial.style.getPropertyValue(kebab)) {
            partial.style.setProperty(kebab, val);
            stampedProps.push(kebab);
        }
    }
    if (stampedProps.length > 0) {
        partial.setAttribute('data-reflow-styles', stampedProps.join(','));
    }
    // Also apply the same preservation to the remaining element so it
    // stays consistent even if it's moved later.
    const stampedPropsB: string[] = [];
    for (const prop of textStyleProps) {
        const kebab = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        const val = computedStyle.getPropertyValue(kebab);
        if (val && !element.style.getPropertyValue(kebab)) {
            element.style.setProperty(kebab, val);
            stampedPropsB.push(kebab);
        }
    }
    if (stampedPropsB.length > 0) {
        element.setAttribute('data-reflow-styles', stampedPropsB.join(','));
    }

    // Mark both halves so auto-merge can reunite them later.
    const splitId = element.getAttribute('data-split-source')
        || `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    element.setAttribute('data-split-source', splitId);
    partial.setAttribute('data-split-source', splitId);

    // Conservative: assume we used all the available space.
    // This ensures pgFree drops to ~0 and we stop pulling for this page.
    const usedHeight = budgetPx;

    // Clean up: if the original element is now empty, let the caller remove it.
    return { partial, usedHeight };
};

/**
 * The core reflow logic.
 * CONSERVATIVE: Only moves WHOLE elements to next page when they overflow.
 * Never splits elements, never pulls content up, never removes pages.
 * This preserves the original document structure and spacing.
 */
export const reflowPages = (editor: HTMLElement, options?: { pullUp?: boolean; timeBudgetMs?: number; maxIterations?: number; startPage?: number }): { changed: boolean; budgetExceeded: boolean; lastProcessedPage: number } => {
    // 1. Sanitize first
    ensureContentIsPaginated(editor);

    // 1b. Clean up orphaned page-footer content.
    // Browser contentEditable sometimes merges .page-footer text into adjacent
    // paragraphs when the user deletes at a boundary.  Find any .page-footer
    // that is NOT a direct child of a .page and remove it.
    const orphanedFooters = editor.querySelectorAll('.page-footer, [data-page-footer="true"]');
    orphanedFooters.forEach(f => {
        const parent = f.parentElement;
        if (parent && !parent.classList.contains('page')) {
            f.remove();
        }
    });

    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    let changesMade = false;
    let iterations = 0;
    const maxIterations = options?.maxIterations ?? 2000; // Safety limit
    const start = performance.now();
    const timeBudgetMs = options?.timeBudgetMs ?? 500; // Per-while-loop budget, not per-page
    const pullUp = options?.pullUp ?? true;
    let budgetExceeded = false;
    const startPage = options?.startPage ?? 0;
    let lastProcessedPage = startPage;

    for (let i = startPage; i < pages.length && iterations < maxIterations; i++) {
        lastProcessedPage = i;
        // Time budget check on the outer loop to keep the UI responsive.
        // If we exceed the budget, stop and let reflowPagesUntilStable
        // schedule the remaining work in the next animation frame.
        if (performance.now() - start > timeBudgetMs) {
            budgetExceeded = true;
            break;
        }
        const page = pages[i];
        const computed = window.getComputedStyle(page);
        const scale = getScale(page);
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const pageRect = page.getBoundingClientRect();
        const pageHeightCss = pageRect.height / scale;
        let contentAreaHeightCss = pageHeightCss - paddingTop - paddingBottom;
        const footerLimit = getFooterLimit(page);
        // pageBottom is still used by split functions that rely on viewport coords.
        // We keep it for backward compat with splitContainerByChildren/splitTextBlockByRange.
        let pageBottom = pageRect.bottom - paddingBottom * scale;
        if (footerLimit !== null) {
            pageBottom = Math.min(pageBottom, footerLimit);
            const footerRelCss = (footerLimit - pageRect.top) / scale - paddingTop;
            contentAreaHeightCss = Math.min(contentAreaHeightCss, footerRelCss);
        }
        const availableHeight = Math.max(0, contentAreaHeightCss);  // CSS px

        // Only handle overflow - push elements to next page
        while (isPageOverflowing(page) && iterations < maxIterations) {
            if (performance.now() - start > timeBudgetMs) {
                budgetExceeded = true;
                break;
            }
            iterations++;

            const overflowEl = getLastOverflowingFlowChild(page, pageBottom, scale);
            if (!overflowEl) break;
            const lastEl = overflowEl;

            let avoidBreak = shouldAvoidBreak(lastEl);
            const hardKeep = isHardKeepTogether(lastEl);
            // Use scroll-independent height for element height check
            const lastElHeightCss = lastEl.getBoundingClientRect().height / scale;
            if (avoidBreak && !hardKeep && availableHeight > 0 && lastElHeightCss > availableHeight + 1) {
                avoidBreak = false;
            }

            if (!avoidBreak && isSplitContainer(lastEl, availableHeight)) {
                const split = splitContainerByChildren(lastEl, pageBottom) || splitContainerByRange(lastEl, pageBottom);
                if (split) {
                    let nextPage = pages[i + 1];
                    if (!nextPage) {
                        nextPage = document.createElement('div');
                        nextPage.className = 'page';
                        editor.appendChild(nextPage);
                        pages.push(nextPage);
                    }

                    if (nextPage.firstChild) {
                        nextPage.insertBefore(split, nextPage.firstChild);
                    } else {
                        nextPage.appendChild(split);
                    }
                    changesMade = true;
                    continue;
                }
            }

            if (!avoidBreak && isTextSplitTarget(lastEl)) {
                const split = splitTextBlockByRange(lastEl, pageBottom);
                if (split) {
                    let nextPage = pages[i + 1];
                    if (!nextPage) {
                        nextPage = document.createElement('div');
                        nextPage.className = 'page';
                        editor.appendChild(nextPage);
                        pages.push(nextPage);
                    }

                    if (nextPage.firstChild) {
                        nextPage.insertBefore(split, nextPage.firstChild);
                    } else {
                        nextPage.appendChild(split);
                    }
                    changesMade = true;
                    continue;
                }
            }

            // Fallback: ANY container (even styled) that overflows — split by
            // children.  This handles the common case where the user presses
            // Enter inside a styled container near the page bottom, causing
            // overflow.  Without this, the ENTIRE container is pushed to the
            // next page, making text "disappear".
            if (!avoidBreak && !isSplitContainer(lastEl, availableHeight)) {
                const tag = lastEl.tagName.toLowerCase();
                if (['div', 'section', 'article', 'main'].includes(tag)
                    && lastEl.children.length >= 2) {
                    const split = splitContainerByChildren(lastEl, pageBottom);
                    if (split) {
                        let nextPage = pages[i + 1];
                        if (!nextPage) {
                            nextPage = document.createElement('div');
                            nextPage.className = 'page';
                            editor.appendChild(nextPage);
                            pages.push(nextPage);
                        }
                        if (nextPage.firstChild) {
                            nextPage.insertBefore(split, nextPage.firstChild);
                        } else {
                            nextPage.appendChild(split);
                        }
                        changesMade = true;
                        continue;
                    }
                }
            }

            // If the element itself is taller than the page, don't keep moving it forever
            const firstFlow = getFirstFlowChild(page);
            const isOnlyFlow = firstFlow && firstFlow === lastEl;
            if (availableHeight > 0 && lastElHeightCss > availableHeight + 1 && isOnlyFlow) {
                break;
            }

            // Get or create next page
            let nextPage = pages[i + 1];
            if (!nextPage) {
                nextPage = document.createElement('div');
                nextPage.className = 'page';
                editor.appendChild(nextPage);
                pages.push(nextPage);
            }

            // Move the WHOLE element to the beginning of next page
            const breakMarker = getPageBreakMarker(nextPage);
            if (breakMarker && breakMarker.parentElement === nextPage) {
                nextPage.insertBefore(lastEl, breakMarker.nextSibling);
            } else if (nextPage.firstChild) {
                nextPage.insertBefore(lastEl, nextPage.firstChild);
            } else {
                nextPage.appendChild(lastEl);
            }

            changesMade = true;
        }
        // IMPORTANT: Do NOT break the for loop here even if budgetExceeded during pushDown.
        // We must still run pullUp for this page and continue to all subsequent pages.
        // budgetExceeded only affects whether we schedule additional rAF passes.


        // Pull content UP if there is space on this page.
        // PERFORMANCE: We calculate free space ONCE and track it mathematically.
        // NO layout flush per element — this prevents browser freezing on large documents.
        if (pullUp) {
            let nextPage = pages[i + 1];
            if (nextPage && getPageBreakMarker(nextPage)) {
                continue;
            }

            // Calculate free space ONCE using offset-based measurements (scroll-independent)
            const pgComp = window.getComputedStyle(page);
            const pgPtop = parseFloat(pgComp.paddingTop) || 0;
            const pgPbot = parseFloat(pgComp.paddingBottom) || 0;
            let pgContentArea = page.offsetHeight - pgPtop - pgPbot;

            // Respect footer / page-number zone — content must NEVER overlap it.
            // This mirrors the same logic used in hasPageSpace().
            const pullFooterCandidates = Array.from(page.querySelectorAll(
                '.page-footer, .page-number, [data-page-footer="true"], [data-page-number="true"], footer'
            )) as HTMLElement[];
            pullFooterCandidates.forEach(el => {
                if (!el.isConnected) return;
                if (el.offsetWidth <= 0 || el.offsetHeight <= 0) return;
                const fStyle = window.getComputedStyle(el);
                const isAbsolute = fStyle.position === 'absolute' || fStyle.position === 'fixed';
                const isNamed = isFooterElement(el);
                if (!isNamed && !isAbsolute) return;
                // el.offsetTop is relative to the page (offsetParent = page)
                const footerRelH = el.offsetTop - pgPtop;
                pgContentArea = Math.min(pgContentArea, Math.max(0, footerRelH));
            });

            const pgUsed = getContentHeightOffset(page);
            let pgFree = pgContentArea - pgUsed;


            while (nextPage && pgFree > 1 && iterations < maxIterations) {
                const firstEl = getFirstFlowChild(nextPage);
                if (!firstEl) {
                    // nextPage is empty — skip to the next page
                    const nextIdx = pages.indexOf(nextPage);
                    const candidate = nextIdx + 1 < pages.length ? pages[nextIdx + 1] : null;
                    if (!candidate || getPageBreakMarker(candidate)) break;
                    nextPage = candidate;
                    iterations++;
                    continue;
                }

                // Measure element height (scroll-independent via offsetHeight)
                const elH = firstEl.offsetHeight;
                const elS = window.getComputedStyle(firstEl);
                const elMt = parseFloat(elS.marginTop) || 0;
                const elMb = parseFloat(elS.marginBottom) || 0;
                const elTotal = elH + elMt + elMb;


                if (elTotal <= pgFree + 1) {
                    // Element fits — move it up
                    page.appendChild(firstEl);
                    pgFree -= elTotal; // Track mathematically, no layout flush needed
                    changesMade = true;
                    iterations++;
                    continue;
                }

                // Element doesn't fit whole — try to split and pull up children.
                // Pass availableHeight so that oversized styled containers (with
                // border/bg) can also be split when they exceed the page height.
                if (isSplitContainer(firstEl, availableHeight)) {
                    const pulled = pullUpSplitContainer(firstEl, pgFree);
                    if (pulled.movedAny && pulled.partial) {
                        page.appendChild(pulled.partial);
                        pgFree = pulled.pgFree;
                        changesMade = true;
                        iterations++;
                        if (firstEl.children.length === 0) {
                            firstEl.remove();
                        }
                        continue;
                    }
                }

                // Fallback: styled container that doesn't exceed full page height
                // but IS bigger than pgFree — try to split it anyway to fill the gap.
                {
                    const tag = firstEl.tagName.toLowerCase();
                    if (['div', 'section', 'article', 'main', 'ul', 'ol'].includes(tag)
                        && firstEl.children.length >= 2
                        && pgFree > 30) {
                        const pulled = pullUpSplitContainer(firstEl, pgFree);
                        if (pulled.movedAny && pulled.partial) {
                            page.appendChild(pulled.partial);
                            pgFree = pulled.pgFree;
                            changesMade = true;
                            iterations++;
                            if (firstEl.children.length === 0) {
                                firstEl.remove();
                            }
                            continue;
                        }
                    }
                }

                // Element doesn't fit and can't be split: stop pulling into this page.
                break;
            }
        }

        if (isPageOverflowing(page)) {
            const overflowEl = getLastOverflowingFlowChild(page, pageBottom, scale);
            recordReflowIssue({
                reason: 'overflow-after-reflow',
                pageIndex: i,
                pageRect: {
                    top: Math.round(page.getBoundingClientRect().top),
                    bottom: Math.round(page.getBoundingClientRect().bottom),
                    height: Math.round(page.getBoundingClientRect().height)
                },
                pageBottom: Math.round(pageBottom),
                footerLimit: footerLimit !== null ? Math.round(footerLimit) : null,
                overflowElement: overflowEl ? summarizeElement(overflowEl) : null,
                footerCandidates: summarizeFooterCandidates(page)
            });
        }
    }

    // Sweep: remove empty flow containers left behind by split operations.
    // These are divs/sections with no visible content that still occupy
    // space (e.g., styled boxes whose children were all pulled up).
    if (pullUp) {
        for (const page of pages) {
            const containers = Array.from(page.querySelectorAll('div:not(.page):not(.page-footer), section, article')) as HTMLElement[];
            for (const c of containers) {
                if (!c.isConnected) continue;
                // Preserve page break markers — they are empty divs by design
                if (c.getAttribute('data-page-break') === 'true') continue;
                if (c.getAttribute('data-user-page-break') === 'true') continue;
                // Preserve writing-lines — they're intentionally empty but visual
                if (c.classList.contains('writing-lines')) continue;
                if (c.classList.contains('tracing-line')) continue;
                // Check for meaningful content: text, images, tables, HR, etc.
                if (c.textContent?.trim()) continue;
                if (c.querySelector('img, table, hr, svg, canvas, video')) continue;
                // It's a container with no meaningful content — remove it
                c.remove();
                changesMade = true;
            }
        }
    }

    // Auto-merge pass: reunite split fragments on the same page.
    // Merges via (a) data-split-source markers, or (b) same tag+class for
    // styled containers (border/background/padding).  Plain text blocks
    // (p, h*, li, blockquote) are only merged via markers, never by style.
    if (pullUp) {
        const textTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'UL', 'OL']);

        const isStyledContainer = (el: HTMLElement): boolean => {
            const cs = window.getComputedStyle(el);
            const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
            const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
            const hasPad = parseFloat(cs.paddingTop) > 4 || parseFloat(cs.paddingLeft) > 4;
            return hasBg || hasBorder || hasPad;
        };

        for (const page of pages) {
            const kids = Array.from(page.children) as HTMLElement[];
            let i = 0;
            while (i < kids.length - 1) {
                const a = kids[i];
                const b = kids[i + 1];
                if (!a.isConnected || !b.isConnected) { i++; continue; }

                let shouldMerge = false;
                const splitA = a.getAttribute('data-split-source');
                const splitB = b.getAttribute('data-split-source');

                // Only merge via split-source markers (fragments split by reflow)
                if (splitA && splitB && splitA === splitB) {
                    shouldMerge = true;
                }
                // Also merge styled containers with same tag+class, but ONLY if
                // at least one has a split marker (i.e., was split by reflow,
                // not two unrelated containers from the original document).
                if (!shouldMerge && (splitA || splitB) &&
                    a.tagName === b.tagName &&
                    a.className === b.className &&
                    !textTags.has(a.tagName) &&
                    isStyledContainer(a)) {
                    shouldMerge = true;
                }

                // Merge text blocks (p, h1-h6, etc.) split mid-sentence.
                // Guards: same tag, same class, same font-size, same font-weight,
                // first must NOT end with terminal punctuation,
                // and second must NOT start with a number (numbered list/TOC entry).
                // NOTE: LI excluded — list items merge ONLY via data-split-source.
                if (!shouldMerge &&
                    textTags.has(a.tagName) &&
                    a.tagName !== 'LI' &&
                    a.tagName === b.tagName &&
                    a.className === b.className) {
                    const csA = window.getComputedStyle(a);
                    const csB = window.getComputedStyle(b);
                    if (csA.fontSize === csB.fontSize && csA.fontWeight === csB.fontWeight) {
                        const aText = (a.textContent || '').trimEnd();
                        const bText = (b.textContent || '').trimStart();
                        const lastChar = aText.slice(-1);
                        const startsWithNumber = /^\d/.test(bText);
                        if (lastChar && !'.!?:'.includes(lastChar) && !startsWithNumber) {
                            shouldMerge = true;
                        }
                    }
                }

                if (shouldMerge) {
                    while (b.firstChild) {
                        a.appendChild(b.firstChild);
                    }
                    b.remove();
                    kids.splice(i + 1, 1);
                    changesMade = true;

                    // Remove inline styles that were stamped during split
                    // to preserve styling across page boundaries.
                    // Now that the halves are reunited, these overrides
                    // would fight the CSS class rules (especially line-height).
                    const reflowStyles = a.getAttribute('data-reflow-styles');
                    if (reflowStyles) {
                        for (const prop of reflowStyles.split(',')) {
                            a.style.removeProperty(prop.trim());
                        }
                        a.removeAttribute('data-reflow-styles');
                    }
                    // Also clean the empty style attribute if nothing is left
                    if (a.style.length === 0) {
                        a.removeAttribute('style');
                    }

                    // Normalize adjacent text nodes to prevent spurious
                    // line breaks at the merge boundary.
                    a.normalize();

                    if (splitA) {
                        const nextKid = kids[i + 1];
                        if (!nextKid || nextKid.getAttribute('data-split-source') !== splitA) {
                            a.removeAttribute('data-split-source');
                        }
                    }
                    // Clean up list continuation markers after merge
                    a.removeAttribute('data-list-continuation');
                    a.querySelectorAll('[data-list-continuation]').forEach(el => el.removeAttribute('data-list-continuation'));
                    a.querySelectorAll('li').forEach(li => {
                        if ((li as HTMLElement).style.listStyleType === 'none') {
                            (li as HTMLElement).style.listStyleType = '';
                        }
                        li.removeAttribute('value');
                    });
                } else {
                    i++;
                }
            }
        }
    }

    // Remove pages that became empty after reflow (only when pullUp is active).
    // This handles the case where the user deleted spacers/empty paragraphs and the
    // page they were on is now empty — content on subsequent pages should flow back.
    if (pullUp) {
        // Iterate backwards so that removing a page doesn't shift the index of earlier pages.
        for (let i = pages.length - 1; i >= 1; i--) {
            const emptyPage = pages[i];
            // Never remove pages with an explicit page-break marker (user-inserted break).
            if (getPageBreakMarker(emptyPage)) continue;
            const flowKids = Array.from(emptyPage.children).filter(c =>
                isFlowElement(c as HTMLElement)
            );
            if (flowKids.length === 0) {
                emptyPage.remove();
                pages.splice(i, 1);
                changesMade = true;
            }
        }

        // Renumber page footers after page removal.
        // Find the first page that has a footer to determine the start page.
        let footerStartIdx = -1;
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].querySelector('.page-footer')) {
                footerStartIdx = i;
                break;
            }
        }
        if (footerStartIdx >= 0) {
            let counter = 1;
            for (let i = footerStartIdx; i < pages.length; i++) {
                const ft = pages[i].querySelector('.page-footer') as HTMLElement | null;
                if (ft) {
                    ft.textContent = String(counter);
                }
                counter++;
            }
        }
    }

    // --- Post-reflow list cleanup ---
    // This runs AFTER all splitting/merging and does NOT set changesMade
    // to avoid triggering infinite reflow cycles.
    for (const page of pages) {
        // 1. Remove empty LI shells left behind by split operations
        const listItems = Array.from(page.querySelectorAll('li')) as HTMLElement[];
        for (const li of listItems) {
            const text = (li.textContent || '').replace(/[\u200B\u00A0\s]/g, '');
            if (text === '' && !li.querySelector('img, table, hr, textarea')) {
                const parent = li.parentElement;
                li.remove();
                if (parent && (parent.tagName === 'UL' || parent.tagName === 'OL') && parent.children.length === 0) {
                    parent.remove();
                }
            }
        }

        // 2. Mark continuation LIs (first LI in a split UL/OL that continues from previous page)
        //    A UL/OL with data-split-source as the FIRST flow child of a page is a continuation.
        const firstFlow = Array.from(page.children).find(c => isFlowElement(c as HTMLElement)) as HTMLElement | null;
        if (firstFlow && (firstFlow.tagName === 'UL' || firstFlow.tagName === 'OL') && firstFlow.hasAttribute('data-split-source')) {
            const firstLi = firstFlow.querySelector(':scope > li') as HTMLElement | null;
            if (firstLi && !firstLi.hasAttribute('data-list-continuation')) {
                // Only mark it if the PREVIOUS page has a matching split-source UL/OL as its last flow child
                const pageIdx = pages.indexOf(page);
                if (pageIdx > 0) {
                    const prevPage = pages[pageIdx - 1];
                    const prevKids = Array.from(prevPage.children).filter(c => isFlowElement(c as HTMLElement)) as HTMLElement[];
                    const lastPrevFlow = prevKids[prevKids.length - 1];
                    if (lastPrevFlow && lastPrevFlow.tagName === firstFlow.tagName &&
                        lastPrevFlow.getAttribute('data-split-source') === firstFlow.getAttribute('data-split-source')) {
                        // Check if the last LI in the previous page's list has text — if so, this is a mid-sentence continuation
                        const lastPrevLi = lastPrevFlow.querySelector(':scope > li:last-child') as HTMLElement | null;
                        if (lastPrevLi && lastPrevLi.textContent?.trim()) {
                            firstLi.setAttribute('data-list-continuation', 'true');
                        }
                    }
                }
            }
        }
    }

    // Post-reflow: auto-hide bullets on LIs starting with lowercase,
    // Then renumber all OLs — each OL starts from 1 unless it's a
    // page-split continuation (same data-split-source as previous OL).
    if (changesMade) {
        editor.querySelectorAll('ol > li, ul > li').forEach(li => {
            const el = li as HTMLElement;
            const text = (el.textContent || '').trimStart();
            const fc = text.charAt(0);
            const isLower = fc && fc === fc.toLowerCase() && fc !== fc.toUpperCase();
            if (isLower && el.style.listStyleType !== 'none') {
                el.style.listStyleType = 'none';
            }
        });

        // Smart renumber: chain only OLs with matching data-split-source
        const allOLs = Array.from(editor.querySelectorAll('ol')) as HTMLElement[];
        // Map: splitSource → running count
        const chainCounters = new Map<string, number>();
        
        for (const ol of allOLs) {
            const splitSrc = ol.getAttribute('data-split-source');
            let startNum = 1;
            
            if (splitSrc && chainCounters.has(splitSrc)) {
                // Continuation of a split list — pick up from where we left off
                startNum = chainCounters.get(splitSrc)!;
            }
            
            // Renumber visible items
            let num = startNum;
            ol.setAttribute('start', String(startNum));
            ol.querySelectorAll(':scope > li').forEach(li => {
                const el = li as HTMLElement;
                if (el.style.listStyleType !== 'none') {
                    el.setAttribute('value', String(num));
                    num++;
                } else {
                    el.removeAttribute('value');
                }
            });
            
            // Store the next number for this chain
            if (splitSrc) {
                chainCounters.set(splitSrc, num);
            }
        }
    }

    return { changed: changesMade, budgetExceeded, lastProcessedPage };
};

/**
 * Aggressive reflow used for imports.
 * - Splits oversized flow elements when possible
 * - No time budget, but uses a safety max iteration limit
 */
export const reflowPagesAggressive = (editor: HTMLElement, options?: { maxIterations?: number }) => {
    return reflowPages(editor, {
        pullUp: true,
        timeBudgetMs: 200,
        maxIterations: options?.maxIterations ?? 5000
    });
};

/**
 * Runs reflowPages in a non-blocking cascade until the document is stable.
 *
 * - Pass 1: synchronous, 80ms budget (immediate visual feedback)
 * - Pass 2+: asynchronous via requestAnimationFrame (non-blocking)
 * - Stops automatically when no more changes are detected (stable)
 *
 * This achieves full bidirectional cascading (100→1 like 1→100) without
 * freezing the UI.
 */
export const reflowPagesUntilStable = (
    editor: HTMLElement,
    options?: { pullUp?: boolean; maxPasses?: number; onDone?: () => void }
) => {
    const maxPasses = options?.maxPasses ?? 200;
    const pullUp = options?.pullUp ?? true;
    const onDone = options?.onDone;

    const result1 = reflowPages(editor, { pullUp, timeBudgetMs: 80, maxIterations: 3000 });

    if (!result1.changed && !result1.budgetExceeded) {
        onDone?.();
        return;
    }

    // Track where the previous pass stopped so the next pass continues
    // from there instead of re-processing stable pages from page 0.
    let nextStart = result1.budgetExceeded ? result1.lastProcessedPage : 0;
    let pass = 1;

    const scheduleNextPass = () => {
        if (pass >= maxPasses) { onDone?.(); return; }
        requestAnimationFrame(() => {
            const result = reflowPages(editor, {
                pullUp,
                timeBudgetMs: 300,
                maxIterations: 3000,
                startPage: nextStart
            });
            pass++;
            if (result.changed || result.budgetExceeded) {
                nextStart = result.budgetExceeded ? result.lastProcessedPage : 0;
                scheduleNextPass();
            } else if (nextStart > 0) {
                nextStart = 0;
                scheduleNextPass();
            } else {
                onDone?.();
            }
        });
    };

    scheduleNextPass();
};


/**
 * Rejoin paragraphs that were split mid-sentence by the reflow engine and saved
 * as separate elements. This heals documents where a <p> was split across pages
 * into two <p> elements, creating spurious line breaks and spacing changes.
 *
 * Rules:
 * - Merges consecutive elements with the same tag (p, h1-h6, blockquote)
 * - Same className and similar computed font-size / font-weight
 * - First element does NOT end with terminal punctuation (. ! ? :)
 * - Second element does NOT start with a number (avoids merging numbered entries)
 * - Also merges via data-split-source markers if present
 *
 * Should be called AFTER ensureContentIsPaginated and BEFORE reflowPagesUntilStable.
 */
export const rejoinSplitParagraphs = (editor: HTMLElement): number => {
    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    const textTags = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);
    let totalMerged = 0;

    for (const page of pages) {
        const kids = Array.from(page.children) as HTMLElement[];
        let i = 0;

        while (i < kids.length - 1) {
            const a = kids[i];
            const b = kids[i + 1];

            if (!a.isConnected || !b.isConnected) { i++; continue; }
            if (!textTags.has(a.tagName)) { i++; continue; }
            if (a.tagName !== b.tagName) { i++; continue; }
            if (a.className !== b.className) { i++; continue; }

            // Check via split markers first (highest confidence)
            const splitA = a.getAttribute('data-split-source');
            const splitB = b.getAttribute('data-split-source');
            let shouldMerge = false;

            if (splitA && splitB && splitA === splitB) {
                shouldMerge = true;
            }

            // Heuristic merge: same tag, same class, compatible text styles,
            // and first block doesn't end with terminal punctuation
            if (!shouldMerge) {
                const csA = window.getComputedStyle(a);
                const csB = window.getComputedStyle(b);

                if (csA.fontSize === csB.fontSize && csA.fontWeight === csB.fontWeight) {
                    const aText = (a.textContent || '').trimEnd();
                    const bText = (b.textContent || '').trimStart();
                    const lastChar = aText.slice(-1);
                    const startsWithNumber = /^\d/.test(bText);

                    // Only merge if the first block clearly ends mid-sentence
                    if (lastChar && !'.!?:'.includes(lastChar) && !startsWithNumber && bText.length > 0) {
                        shouldMerge = true;
                    }
                }
            }

            if (shouldMerge) {
                // Move all child nodes from b into a
                while (b.firstChild) {
                    a.appendChild(b.firstChild);
                }
                b.remove();
                kids.splice(i + 1, 1);
                totalMerged++;

                // Remove reflow-stamped inline styles
                const reflowStyles = a.getAttribute('data-reflow-styles');
                if (reflowStyles) {
                    for (const prop of reflowStyles.split(',')) {
                        a.style.removeProperty(prop.trim());
                    }
                    a.removeAttribute('data-reflow-styles');
                }

                // Clean up split markers if no more fragments remain
                if (splitA) {
                    const nextKid = kids[i + 1];
                    if (!nextKid || nextKid.getAttribute('data-split-source') !== splitA) {
                        a.removeAttribute('data-split-source');
                    }
                }

                // Clean empty style attribute
                if (a.style.length === 0) {
                    a.removeAttribute('style');
                }

                // Normalize to join adjacent text nodes
                a.normalize();

                // Don't advance i — check if the NEXT element also merges
            } else {
                i++;
            }
        }
    }

    return totalMerged;
};

