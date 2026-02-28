
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
        breakInside: (style as any).breakInside || (style as any).webkitBreakInside || null,
        pageBreakInside: (style as any).pageBreakInside || null
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
    // eslint-disable-next-line no-console
    console.warn('[reflow-debug]', entry);
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

const shouldAvoidBreak = (_el: HTMLElement): boolean => {
    // ALL elements are kept together as a single block.
    // If an element doesn't fit on the current page, it moves whole to the next page.
    // This prevents text blocks, containers, etc. from being split across pages.
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
    }

    return newElement;
};

const isSplitContainer = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    if (el.classList.contains('page')) return false;
    if (el.classList.contains('editor-workspace')) return false;
    if (el.classList.contains('page-footer')) return false;
    return ['div', 'section', 'article', 'main', 'ul', 'ol'].includes(tag);
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

    for (let i = splitIndex; i < children.length; i++) {
        newContainer.appendChild(children[i]);
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

    const fragment = splitRange.extractContents();
    if (!fragment || fragment.childNodes.length === 0) return null;

    const newContainer = container.cloneNode(false) as HTMLElement;
    newContainer.removeAttribute('id');
    newContainer.appendChild(fragment);

    if (!container.textContent?.trim() && container.children.length === 0) {
        container.remove();
    }

    return newContainer;
};

/**
 * The core reflow logic.
 * CONSERVATIVE: Only moves WHOLE elements to next page when they overflow.
 * Never splits elements, never pulls content up, never removes pages.
 * This preserves the original document structure and spacing.
 */
export const reflowPages = (editor: HTMLElement, options?: { pullUp?: boolean; timeBudgetMs?: number; maxIterations?: number }): { changed: boolean; budgetExceeded: boolean } => {
    // 1. Sanitize first
    ensureContentIsPaginated(editor);

    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    let changesMade = false;
    let iterations = 0;
    const maxIterations = options?.maxIterations ?? 2000; // Safety limit
    const start = performance.now();
    const timeBudgetMs = options?.timeBudgetMs ?? 500; // Per-while-loop budget, not per-page
    const pullUp = options?.pullUp ?? true;
    let budgetExceeded = false;

    for (let i = 0; i < pages.length && iterations < maxIterations; i++) {
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

            if (!avoidBreak && isSplitContainer(lastEl)) {
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
            const pgContentArea = page.offsetHeight - pgPtop - pgPbot;
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

                // Element doesn't fit whole: stop pulling into this page.
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
    }

    // Return both whether changes were made and whether the budget was exceeded.
    // The caller (reflowPagesUntilStable) uses budgetExceeded to decide whether to
    // schedule another pass even when changesMade is false (so we don't miss work).
    return { changed: changesMade, budgetExceeded };
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
    // 50 passes maximum: each pass can cascade one level of pages.
    // For a document where content needs to rise 40 pages, we need 40 passes.
    const maxPasses = options?.maxPasses ?? 50;
    const pullUp = options?.pullUp ?? true;
    const onDone = options?.onDone;

    // Pass 1: synchronous — process pages with a tight budget for UI responsiveness.
    // 80ms = roughly 1 frame at 60fps. This processes ~20 pages per pass.
    // For the full 170-page document, reflowPagesUntilStable uses rAF passes.
    const result1 = reflowPages(editor, { pullUp, timeBudgetMs: 80, maxIterations: 3000 });

    if (!result1.changed && !result1.budgetExceeded) {
        onDone?.();
        return;
    }

    // Pass 2+: schedule via rAF so the browser can render between passes
    let pass = 1;
    const scheduleNextPass = () => {
        if (pass >= maxPasses) { onDone?.(); return; }
        requestAnimationFrame(() => {
            const result = reflowPages(editor, { pullUp, timeBudgetMs: 150, maxIterations: 3000 });
            pass++;
            if (result.changed || result.budgetExceeded) {
                scheduleNextPass(); // More work to do
            } else {
                onDone?.(); // Stable
            }
        });
    };

    scheduleNextPass();
};


