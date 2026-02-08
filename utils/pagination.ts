// utils/pagination.ts

const getScale = (el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    const h = el.offsetHeight || 1;
    return rect.height / h || 1;
};

const isFlowElement = (el: HTMLElement): boolean => {
    if (el.classList.contains('page-footer')) return false;
    if (el.classList.contains('image-overlay')) return false;
    if (el.classList.contains('resize-handle')) return false;
    if (el.tagName === 'STYLE') return false;
    const pos = window.getComputedStyle(el).position;
    return pos !== 'absolute' && pos !== 'fixed';
};

const getDirectFlowChildren = (page: HTMLElement): HTMLElement[] => {
    return (Array.from(page.children) as HTMLElement[]).filter(isFlowElement);
};

const getDirectFooter = (page: HTMLElement): HTMLElement | null => {
    const children = Array.from(page.children) as HTMLElement[];
    return children.find(c => c.classList.contains('page-footer')) ?? null;
};

const getPageContentBottom = (page: HTMLElement): number => {
    const scale = getScale(page);
    const pageRect = page.getBoundingClientRect();
    const cs = window.getComputedStyle(page);
    const paddingBottom = (parseFloat(cs.paddingBottom) || 0) * scale;
    let contentBottom = pageRect.bottom - paddingBottom;

    const footer = getDirectFooter(page);
    if (footer) {
        const footerRect = footer.getBoundingClientRect();
        if (footerRect.height > 0) {
            contentBottom = Math.min(contentBottom, footerRect.top);
        }
    }

    return contentBottom;
};

const getElementBottom = (el: HTMLElement): number => {
    return el.getBoundingClientRect().bottom;
};

export const isPageOverflowing = (page: HTMLElement): boolean => {
    const flowKids = getDirectFlowChildren(page);
    if (flowKids.length === 0) return false;

    const contentBottom = getPageContentBottom(page);

    for (let i = flowKids.length - 1; i >= 0; i--) {
        if (getElementBottom(flowKids[i]) > contentBottom + 1) return true;
    }
    return false;
};

export const hasPageSpace = (page: HTMLElement, threshold: number = 20): boolean => {
    const flowKids = getDirectFlowChildren(page);
    if (flowKids.length === 0) return true;
    const contentBottom = getPageContentBottom(page);
    const lastBottom = getElementBottom(flowKids[flowKids.length - 1]);
    return (contentBottom - lastBottom) > threshold;
};

const getLastFlowChild = (page: HTMLElement): HTMLElement | null => {
    const els = Array.from(page.children) as HTMLElement[];
    for (let i = els.length - 1; i >= 0; i--) {
        if (isFlowElement(els[i])) return els[i];
    }
    return null;
};

export const ensureContentIsPaginated = (editor: HTMLElement): boolean => {
    const children = Array.from(editor.childNodes);
    let currentPage: HTMLElement | null = editor.querySelector('.page') as HTMLElement;
    let createdAnyPage = false;

    if (!currentPage) {
        currentPage = document.createElement('div');
        currentPage.className = 'page';
        editor.insertBefore(currentPage, editor.firstChild);
        createdAnyPage = true;
    }

    const orphans: Node[] = [];
    children.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.classList.contains('page')) {
                currentPage = el;
            } else if (
                !el.classList.contains('image-overlay') &&
                !el.classList.contains('resize-handle') &&
                el.tagName !== 'STYLE'
            ) {
                orphans.push(node);
            }
        } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            orphans.push(node);
        }
    });

    if (orphans.length > 0 && currentPage) {
        orphans.forEach(orphan => {
            if (orphan.parentNode === editor) currentPage!.appendChild(orphan);
        });
        return true;
    }

    return createdAnyPage;
};

const isSafeToUnwrap = (el: HTMLElement): boolean => {
    if (el.tagName !== 'DIV' && el.tagName !== 'SECTION' && el.tagName !== 'ARTICLE') return false;
    if (el.classList.contains('page') || el.classList.contains('page-footer')) return false;
    if (el.classList.contains('mission-box') || el.classList.contains('spacer')) return false;
    if (el.className && el.className.startsWith && /shape-/.test(el.className)) return false;
    if (el.classList.contains('toc-style-dotted')) return false;
    if (el.children.length === 0) return false;

    const cs = window.getComputedStyle(el);
    const hasPadding = (parseFloat(cs.paddingTop) || 0) > 0 ||
        (parseFloat(cs.paddingBottom) || 0) > 0;
    const hasBorder = (parseFloat(cs.borderTopWidth) || 0) > 0 ||
        (parseFloat(cs.borderBottomWidth) || 0) > 0;
    const hasBg = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';

    return !hasPadding && !hasBorder && !hasBg;
};

const flattenWrappers = (page: HTMLElement): boolean => {
    let changed = false;
    let passes = 0;
    while (passes < 10) {
        passes++;
        const flowKids = getDirectFlowChildren(page);
        if (flowKids.length !== 1) break;
        if (!isSafeToUnwrap(flowKids[0])) break;

        const wrapper = flowKids[0];
        const footer = getDirectFooter(page);
        while (wrapper.firstChild) {
            page.insertBefore(wrapper.firstChild, footer);
        }
        wrapper.remove();
        changed = true;
    }
    return changed;
};

const SPLITTABLE_TAGS = new Set(['UL', 'OL', 'BLOCKQUOTE', 'DIV', 'SECTION']);

const genSplitId = () => `split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Split a container element (ul, ol, blockquote, div) at the overflow point.
 * Returns the remainder element to be placed on the next page, or null if can't split.
 */
const splitContainer = (container: HTMLElement, contentBottom: number): HTMLElement | null => {
    if (!SPLITTABLE_TAGS.has(container.tagName)) return null;

    const children = Array.from(container.children) as HTMLElement[];
    if (children.length <= 1) return null;

    // Find the first child that overflows
    let splitIndex = -1;
    for (let i = 0; i < children.length; i++) {
        if (children[i].getBoundingClientRect().bottom > contentBottom + 1) {
            splitIndex = i;
            break;
        }
    }

    if (splitIndex <= 0) return null;

    if (!container.getAttribute('data-split-id')) {
        container.setAttribute('data-split-original', container.outerHTML);
    }

    const remainder = container.cloneNode(false) as HTMLElement;
    remainder.removeAttribute('id');

    const splitId = container.getAttribute('data-split-id') ?? genSplitId();
    container.setAttribute('data-split-id', splitId);
    remainder.setAttribute('data-split-id', splitId);

    for (let i = splitIndex; i < children.length; i++) {
        remainder.appendChild(children[i]);
    }

    return remainder;
};

/**
 * Recursively try to split the last overflowing element.
 * If the element is a splittable container, split it and put the remainder on the next page.
 * Returns true if a split was performed.
 */
const trySplitOverflow = (page: HTMLElement, nextPage: HTMLElement): boolean => {
    const contentBottom = getPageContentBottom(page);
    const flowKids = getDirectFlowChildren(page);

    // Find the last flow child that overflows
    for (let i = flowKids.length - 1; i >= 0; i--) {
        const el = flowKids[i];
        if (getElementBottom(el) <= contentBottom + 1) continue;

        // This element overflows. Try to split it.
        const remainder = splitContainer(el, contentBottom);
        if (remainder) {
            insertAtPageStart(nextPage, remainder);
            return true;
        }

        // Can't split — check if it has splittable children (nested lists, etc.)
        if (SPLITTABLE_TAGS.has(el.tagName)) {
            const innerChildren = Array.from(el.children) as HTMLElement[];
            for (let j = innerChildren.length - 1; j >= 0; j--) {
                const inner = innerChildren[j];
                if (getElementBottom(inner) <= contentBottom + 1) continue;
                const innerRemainder = splitContainer(inner, contentBottom);
                if (innerRemainder) {
                    // Create a wrapper clone on the next page
                    const outerRemainder = el.cloneNode(false) as HTMLElement;
                    outerRemainder.removeAttribute('id');
                    outerRemainder.appendChild(innerRemainder);
                    // Move all subsequent siblings of inner too
                    for (let k = j + 1; k < innerChildren.length; k++) {
                        outerRemainder.appendChild(innerChildren[k]);
                    }
                    insertAtPageStart(nextPage, outerRemainder);
                    return true;
                }
                break;
            }
        }

        break;
    }

    return false;
};

const insertAtPageStart = (page: HTMLElement, node: HTMLElement) => {
    const firstFlow = getDirectFlowChildren(page)[0];
    const footer = getDirectFooter(page);
    if (firstFlow) page.insertBefore(node, firstFlow);
    else if (footer) page.insertBefore(node, footer);
    else page.appendChild(node);
};

const appendBeforeFooter = (page: HTMLElement, node: HTMLElement) => {
    const footer = getDirectFooter(page);
    if (footer) page.insertBefore(node, footer);
    else page.appendChild(node);
};

const mergeIfSplitPair = (prev: HTMLElement | null, next: HTMLElement | null): boolean => {
    if (!prev || !next) return false;
    const idA = prev.getAttribute('data-split-id');
    const idB = next.getAttribute('data-split-id');
    if (!idA || idA !== idB) return false;
    if (prev.tagName !== next.tagName) return false;

    while (next.firstChild) prev.appendChild(next.firstChild);
    next.remove();
    prev.removeAttribute('data-split-id');
    prev.removeAttribute('data-split-original');
    return true;
};

const HEURISTIC_MERGE_TAGS = new Set([
    'UL', 'OL', 'BLOCKQUOTE', 'DIV', 'SECTION', 'TABLE'
]);

const SKIP_CLASSES = new Set([
    'page', 'page-footer', 'spacer', 'mission-box', 'editor-workspace',
    'floating-text', 'image-overlay', 'resize-handle',
    'toc-style-dotted'
]);

const hasSkipClass = (el: HTMLElement): boolean => {
    for (const cls of SKIP_CLASSES) {
        if (el.classList.contains(cls)) return true;
    }
    if (/shape-/.test(el.className)) return true;
    return false;
};

const canHeuristicMerge = (prev: HTMLElement, next: HTMLElement): boolean => {
    if (prev.tagName !== next.tagName) return false;
    if (!HEURISTIC_MERGE_TAGS.has(prev.tagName)) return false;
    if (hasSkipClass(prev) || hasSkipClass(next)) return false;
    if (prev.tagName === 'DIV') {
        const prevHasKids = prev.children.length > 0;
        const nextHasKids = next.children.length > 0;
        if (!prevHasKids || !nextHasKids) return false;
        const prevFirstTag = prev.children[0]?.tagName;
        const nextFirstTag = next.children[0]?.tagName;
        if (prevFirstTag !== nextFirstTag) return false;
    }
    return true;
};

const mergeAdjacentPair = (prev: HTMLElement, next: HTMLElement): boolean => {
    while (next.firstChild) prev.appendChild(next.firstChild);
    next.remove();
    prev.removeAttribute('data-split-id');
    prev.removeAttribute('data-split-original');
    return true;
};

const autoMergeSplitSiblings = (page: HTMLElement): boolean => {
    let merged = false;
    let changed = true;
    while (changed) {
        changed = false;
        const kids = getDirectFlowChildren(page);
        for (let i = 0; i < kids.length - 1; i++) {
            if (mergeIfSplitPair(kids[i], kids[i + 1])) {
                merged = true;
                changed = true;
                break;
            }
        }
    }
    return merged;
};

const autoMergeHeuristic = (page: HTMLElement): boolean => {
    let merged = false;
    let changed = true;
    while (changed) {
        changed = false;
        const kids = getDirectFlowChildren(page);
        for (let i = 0; i < kids.length - 1; i++) {
            if (canHeuristicMerge(kids[i], kids[i + 1])) {
                mergeAdjacentPair(kids[i], kids[i + 1]);
                merged = true;
                changed = true;
                break;
            }
        }
    }
    return merged;
};

export const reflowPages = (editor: HTMLElement): boolean => {
    if (!editor || !editor.isConnected) return false;

    let changesMade = ensureContentIsPaginated(editor);

    const pages: HTMLElement[] = Array.from(editor.querySelectorAll('.page'));
    if (pages.length === 0) return changesMade;

    // Flatten imported wrappers so blocks are direct page children
    for (const p of pages) {
        if (flattenWrappers(p)) changesMade = true;
    }

    let iterations = 0;
    const maxIterations = 5000;

    // Process each page: PUSH overflow forward, then PULL UP from next page
    for (let i = 0; i < pages.length && iterations < maxIterations; i++) {
        const page = pages[i];
        flattenWrappers(page);

        // PUSH: move overflowing elements to next page
        while (isPageOverflowing(page) && iterations < maxIterations) {
            iterations++;
            const lastEl = getLastFlowChild(page);
            if (!lastEl) break;

            let nextPage = pages[i + 1];
            if (!nextPage) {
                nextPage = document.createElement('div');
                nextPage.className = 'page';
                editor.appendChild(nextPage);
                pages.push(nextPage);
            }

            const flowCount = getDirectFlowChildren(page).length;

            if (flowCount <= 1) {
                if (!trySplitOverflow(page, nextPage)) break;
            } else if (SPLITTABLE_TAGS.has(lastEl.tagName) && lastEl.getBoundingClientRect().top < getPageContentBottom(page)) {
                if (!trySplitOverflow(page, nextPage)) {
                    insertAtPageStart(nextPage, lastEl);
                }
            } else {
                insertAtPageStart(nextPage, lastEl);
            }

            changesMade = true;
        }

        // Auto-merge split siblings that ended up on the same page after push
        if (autoMergeSplitSiblings(page)) {
            changesMade = true;
        }

        // PULL UP: fill remaining space from next page (skip page-break boundaries)
        if (i + 1 < pages.length) {
            const nextPage = pages[i + 1];
            if (nextPage.hasAttribute('data-page-break')) continue;
            flattenWrappers(nextPage);

            while (iterations < maxIterations) {
                const firstNext = getDirectFlowChildren(nextPage)[0];
                if (!firstNext) break;

                appendBeforeFooter(page, firstNext);

                if (isPageOverflowing(page)) {
                    insertAtPageStart(nextPage, firstNext);
                    break;
                }

                const flowKids = getDirectFlowChildren(page);
                const prevSibling = flowKids.length >= 2 ? flowKids[flowKids.length - 2] : null;
                const movedEl = flowKids[flowKids.length - 1];
                if (mergeIfSplitPair(prevSibling, movedEl)) {
                    changesMade = true;
                }

                iterations++;
                changesMade = true;
            }

            // Auto-merge after pull-up completed for this page
            if (autoMergeSplitSiblings(page)) {
                changesMade = true;
                // After merge the element may be overflowing, re-check
                if (isPageOverflowing(page)) {
                    i--;
                    continue;
                }
            }

            // Remove empty pages
            if (getDirectFlowChildren(nextPage).length === 0) {
                nextPage.remove();
                pages.splice(i + 1, 1);
            }
        }
    }

    // Cleanup trailing empty pages
    for (let i = pages.length - 1; i >= 1; i--) {
        if (getDirectFlowChildren(pages[i]).length === 0) {
            pages[i].remove();
            pages.splice(i, 1);
            changesMade = true;
        } else {
            break;
        }
    }

    return changesMade;
};

export const autoMergeAll = (editor: HTMLElement): boolean => {
    if (!editor || !editor.isConnected) return false;
    const pages = Array.from(editor.querySelectorAll('.page')) as HTMLElement[];
    let merged = false;

    console.group('[AutoMerge] Scanning pages...');
    for (let p = 0; p < pages.length; p++) {
        const kids = getDirectFlowChildren(pages[p]);
        const tags = kids.map(k => `${k.tagName}${k.className ? '.' + k.className.split(' ')[0] : ''}`);
        console.log(`Page ${p + 1}: ${kids.length} flow children → [${tags.join(', ')}]`);

        const pairs: string[] = [];
        for (let i = 0; i < kids.length - 1; i++) {
            if (kids[i].tagName === kids[i + 1].tagName) {
                pairs.push(`${kids[i].tagName} @ index ${i}-${i + 1}`);
            }
        }
        if (pairs.length > 0) {
            console.log(`  Same-type adjacent pairs: ${pairs.join('; ')}`);
        }

        if (autoMergeSplitSiblings(pages[p])) merged = true;
        if (autoMergeHeuristic(pages[p])) merged = true;
    }
    console.groupEnd();
    console.log(`[AutoMerge] Result: ${merged ? 'merged elements' : 'nothing to merge'}`);

    if (merged) {
        reflowPages(editor);
    }
    return merged;
};
