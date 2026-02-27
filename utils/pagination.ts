
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
    const pos = window.getComputedStyle(el).position;
    return pos !== 'absolute' && pos !== 'fixed';
};

const shouldAvoidBreak = (el: HTMLElement): boolean => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table' || tag === 'img' || tag === 'hr' || tag === 'textarea') return true;
    const keepTogetherClasses = [
        'worksheet',
        'recipe-card',
        'mission-box',
        'shape-rectangle',
        'shape-circle',
        'shape-pill',
        'shape-speech',
        'shape-cloud',
        'writing-lines',
        'tracing-line',
        'floating-text'
    ];
    if (keepTogetherClasses.some(cls => el.classList.contains(cls))) return true;
    if (el.classList.contains('recipe') && el.classList.contains('card')) return true;
    if (el.getAttribute('data-keep-together') === 'true') return true;
    const style = window.getComputedStyle(el);
    const breakInside = (style as any).breakInside || (style as any).webkitBreakInside || '';
    const pageBreakInside = (style as any).pageBreakInside || '';
    if (typeof breakInside === 'string' && breakInside.includes('avoid')) return true;
    if (typeof pageBreakInside === 'string' && pageBreakInside.includes('avoid')) return true;
    return false;
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
const getElementBottomWithMargin = (el: HTMLElement, scale: number = 1) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const marginBottom = parseFloat(style.marginBottom) || 0;
    return rect.bottom + marginBottom * scale;
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
    const pageRect = page.getBoundingClientRect();
    const scale = getScale(page);
    const computed = window.getComputedStyle(page);
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    let allowedBottom = pageRect.bottom - paddingBottom * scale;
    const footerLimit = getFooterLimit(page);
    if (footerLimit !== null) {
        allowedBottom = Math.min(allowedBottom, footerLimit);
    }
    const contentHeight = getContentHeight(page, scale);
    if (contentHeight <= 0) return false;
    const contentBottom = pageRect.top + contentHeight;
    return contentBottom > allowedBottom + 1 * scale;
};

/**
 * Gets the actual content height by measuring the last child's bottom position
 */
const getContentHeight = (page: HTMLElement, scale: number = 1): number => {
    const children = Array.from(page.children).filter(child => isFlowElement(child as HTMLElement));
    if (children.length === 0) return 0;

    const pageRect = page.getBoundingClientRect();
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;

    let maxBottom = 0;
    children.forEach(child => {
        const childBottom = getElementBottomWithMargin(child as HTMLElement, scale);
        const relativeBottom = childBottom - pageRect.top;
        if (relativeBottom > maxBottom) {
            maxBottom = relativeBottom;
        }
    });

    return maxBottom;
};

const getLastOverflowingFlowChild = (page: HTMLElement, pageBottom: number, scale: number): HTMLElement | null => {
    const els = Array.from(page.children).filter(child => isFlowElement(child as HTMLElement)) as HTMLElement[];
    if (els.length === 0) return null;
    let overflowEl: HTMLElement | null = null;
    els.forEach(el => {
        const bottom = getElementBottomWithMargin(el, scale);
        if (bottom > pageBottom + 1 * scale) {
            overflowEl = el;
        }
    });
    return overflowEl;
};

/**
 * Checks if a page has significant empty space at the bottom.
 * Returns true if we can likely fit content from the next page.
 * Accounts for padding (margins) when calculating available space.
 */
export const hasPageSpace = (page: HTMLElement, threshold: number = 20): boolean => {
    const pageRect = page.getBoundingClientRect();
    const scale = getScale(page);
    const computed = window.getComputedStyle(page);
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;

    // Calculate the actual content area height (excluding padding)
    let contentAreaHeight = pageRect.height - (paddingTop + paddingBottom) * scale;
    const footerLimit = getFooterLimit(page);
    if (footerLimit !== null) {
        const effectiveHeight = footerLimit - pageRect.top - paddingTop * scale;
        contentAreaHeight = Math.min(contentAreaHeight, Math.max(0, effectiveHeight));
    }

    // Get the actual content height within the page
    const contentHeight = getContentHeight(page, scale);
    // Adjust content height to be relative to content area (subtract padding top)
    const adjustedContentHeight = contentHeight - paddingTop * scale;

    const availableSpace = contentAreaHeight - adjustedContentHeight;

    return availableSpace > threshold * scale;
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
    // Only treat a page as a user-inserted page break if it carries data-user-page-break.
    // The legacy data-page-break attribute is also supported for backward compatibility,
    // but ONLY when it appears on a child element (not on the page div itself).
    // This distinction prevents automatic reflow pages (that may carry data-page-break
    // from imported HTML) from blocking the pullUp behaviour.
    if (page.getAttribute('data-user-page-break') === 'true') return page;
    return page.querySelector('[data-user-page-break="true"]') as HTMLElement | null;
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
export const reflowPages = (editor: HTMLElement, options?: { pullUp?: boolean; timeBudgetMs?: number; maxIterations?: number }) => {
    // 1. Sanitize first
    ensureContentIsPaginated(editor);

    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    let changesMade = false;
    let iterations = 0;
    const maxIterations = options?.maxIterations ?? 1200; // Safety limit
    const start = performance.now();
    const timeBudgetMs = options?.timeBudgetMs ?? 60;
    const pullUp = options?.pullUp ?? true;
    let budgetExceeded = false;

    for (let i = 0; i < pages.length && iterations < maxIterations; i++) {
        if (performance.now() - start > timeBudgetMs) {
            budgetExceeded = true;
            break;
        }
        const page = pages[i];
        const computed = window.getComputedStyle(page);
        const scale = getScale(page);
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        let pageBottom = page.getBoundingClientRect().bottom - paddingBottom * scale;
        const footerLimit = getFooterLimit(page);
        if (footerLimit !== null) {
            pageBottom = Math.min(pageBottom, footerLimit);
        }
        const pageTop = page.getBoundingClientRect().top;
        const availableHeight = Math.max(0, pageBottom - pageTop - paddingTop * scale);

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
            const lastElRectHeight = lastEl.getBoundingClientRect().height;
            if (avoidBreak && !hardKeep && availableHeight > 0 && lastElRectHeight > availableHeight + 1 * scale) {
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
            if (availableHeight > 0 && lastElRectHeight > availableHeight + 1 * scale && isOnlyFlow) {
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
        if (budgetExceeded) break;

        // Pull content UP if there is space on this page
        if (pullUp) {
            let nextPage = pages[i + 1];
            if (nextPage && getPageBreakMarker(nextPage)) {
                continue;
            }
            // Use 1px threshold so even minimal free space pulls content back
            while (nextPage && hasPageSpace(page, 1) && iterations < maxIterations) {
                if (performance.now() - start > timeBudgetMs) {
                    budgetExceeded = true;
                    break;
                }

                const firstEl = getFirstFlowChild(nextPage);
                if (!firstEl) break;

                // Try moving element up
                page.appendChild(firstEl);
                if (!isPageOverflowing(page)) {
                    changesMade = true;
                    continue;
                }

                let avoidBreak = shouldAvoidBreak(firstEl);
                const hardKeep = isHardKeepTogether(firstEl);
                const firstElRectHeight = firstEl.getBoundingClientRect().height;
                if (avoidBreak && !hardKeep && availableHeight > 0 && firstElRectHeight > availableHeight + 1 * scale) {
                    avoidBreak = false;
                }

                if (!avoidBreak && isSplitContainer(firstEl)) {
                    const split = splitContainerByChildren(firstEl, pageBottom) || splitContainerByRange(firstEl, pageBottom);
                    if (split) {
                        if (nextPage.firstChild) {
                            nextPage.insertBefore(split, nextPage.firstChild);
                        } else {
                            nextPage.appendChild(split);
                        }
                        changesMade = true;
                        if (!isPageOverflowing(page)) {
                            continue;
                        }
                    }
                }

                if (!avoidBreak && isTextSplitTarget(firstEl)) {
                    const split = splitTextBlockByRange(firstEl, pageBottom);
                    if (split) {
                        if (nextPage.firstChild) {
                            nextPage.insertBefore(split, nextPage.firstChild);
                        } else {
                            nextPage.appendChild(split);
                        }
                        changesMade = true;
                        if (!isPageOverflowing(page)) {
                            continue;
                        }
                    }
                }

                // Still doesn't fit: move back and stop pulling
                if (nextPage.firstChild) {
                    nextPage.insertBefore(firstEl, nextPage.firstChild);
                } else {
                    nextPage.appendChild(firstEl);
                }
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

    if (budgetExceeded) {
        const scheduled = editor.getAttribute('data-reflow-scheduled');
        if (!scheduled) {
            editor.setAttribute('data-reflow-scheduled', 'true');
            requestAnimationFrame(() => {
                editor.removeAttribute('data-reflow-scheduled');
                reflowPages(editor, options);
            });
        }
    }

    return changesMade;
};

/**
 * Aggressive reflow used for imports.
 * - Splits oversized flow elements when possible
 * - No time budget, but uses a safety max iteration limit
 */
export const reflowPagesAggressive = (editor: HTMLElement, options?: { maxIterations?: number }) => {
    return reflowPages(editor, {
        pullUp: true,
        timeBudgetMs: 80,
        maxIterations: options?.maxIterations ?? 5000
    });
};
