/**
 * Page Break Insertion – standalone utility extracted from App.tsx.
 *
 * Handles inserting a manual page break at the current cursor position,
 * correctly splitting text even when nested inside inline elements.
 */

import { reflowPages } from './pagination';
import { DocumentState } from '../types';

interface PageBreakParams {
    docState: DocumentState;
    updateDocState: (newState: DocumentState, saveToHistory: boolean) => void;
}

export const insertPageBreak = ({ docState, updateDocState }: PageBreakParams) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    const startNode = range.startContainer.nodeType === 1 ? range.startContainer as HTMLElement : range.startContainer.parentElement;
    const currentPage = startNode?.closest('.page') as HTMLElement | null;

    if (!currentPage) return;

    const newPage = document.createElement('div');
    newPage.className = 'page';
    newPage.setAttribute('data-user-page-break', 'true');
    // Also insert a dedicated child marker so getPageBreakMarker() can find it
    // via ':scope > [data-user-page-break="true"]'.
    const breakChildMarker = document.createElement('div');
    breakChildMarker.setAttribute('data-user-page-break', 'true');
    breakChildMarker.style.cssText = 'display:none;height:0;overflow:hidden;';
    newPage.appendChild(breakChildMarker);

    const marker = document.createElement('span');
    marker.id = 'page-break-marker-' + Date.now();
    range.collapse(true);
    range.insertNode(marker);

    let topBlock: HTMLElement | null = marker as unknown as HTMLElement;
    while (topBlock && topBlock.parentElement !== currentPage) {
        topBlock = topBlock.parentElement;
    }

    if (topBlock && topBlock.parentElement === currentPage) {
        // Guard: if topBlock is a non-splittable container (TOC, styled box, etc.),
        // do NOT split it. Instead, insert the page break AFTER the entire element.
        const NON_SPLITTABLE = [
            'toc-container', 'toc-table', 'mission-box',
            'shape-rectangle', 'shape-circle', 'shape-pill',
            'shape-speech', 'shape-cloud', 'writing-lines',
            'tracing-line', 'exercise-block'
        ];
        const isNonSplittable = NON_SPLITTABLE.some(cls => topBlock!.classList.contains(cls))
            || topBlock.tagName === 'TABLE';
        if (isNonSplittable) {
            // Move all siblings AFTER topBlock to the new page
            let nextSib = topBlock.nextSibling;
            const toMove: Node[] = [];
            while (nextSib) {
                if (!(nextSib instanceof HTMLElement && nextSib.classList.contains('page-footer'))) {
                    toMove.push(nextSib);
                }
                nextSib = nextSib.nextSibling;
            }
            toMove.forEach(n => newPage.appendChild(n));
            // Stamp the first flow element so the break follows it through reflow
            const firstFlow = Array.from(newPage.children).find(c => {
                const el = c as HTMLElement;
                return el.tagName !== 'DIV' || el.getAttribute('data-user-page-break') !== 'true';
            }) as HTMLElement | undefined;
            if (firstFlow) firstFlow.setAttribute('data-page-break-before', 'true');
            currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
            marker.remove();
            const rangeNew = document.createRange();
            if (newPage.firstChild) {
                rangeNew.setStart(newPage.firstChild, 0);
            } else {
                rangeNew.setStart(newPage, 0);
            }
            rangeNew.collapse(true);
            selection.removeAllRanges();
            selection.addRange(rangeNew);
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                try { reflowPages(workspace as HTMLElement); } catch (e) { /* non-fatal */ }
                updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
            }
            return;
        }

        const markerIsTopBlock = (topBlock as unknown as Node) === marker;
        if (markerIsTopBlock) {
            let nextSib: Node | null = marker.nextSibling;
            const toMove: Node[] = [];
            while (nextSib) {
                if (!(nextSib instanceof HTMLElement && nextSib.classList.contains('page-footer'))) {
                    toMove.push(nextSib);
                }
                nextSib = nextSib.nextSibling;
            }
            toMove.forEach(n => newPage.appendChild(n));
            currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
            marker.remove();
            const rangeNew = document.createRange();
            if (newPage.firstChild) {
                rangeNew.setStart(newPage.firstChild, 0);
            } else {
                rangeNew.setStart(newPage, 0);
            }
            rangeNew.collapse(true);
            selection.removeAllRanges();
            selection.addRange(rangeNew);
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                try { reflowPages(workspace as HTMLElement); } catch (e) { /* non-fatal */ }
                updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
            }
            return;
        }

        const isAtStart = (() => {
            let node: Node | null = marker;
            while (node && node !== topBlock) {
                if (node.previousSibling) {
                    const prev = node.previousSibling;
                    if (prev.nodeType === Node.TEXT_NODE && !prev.textContent?.trim()) {
                        node = prev;
                        continue;
                    }
                    return false;
                }
                node = node.parentElement;
            }
            return true;
        })();

        const isAtEnd = (() => {
            let node: Node | null = marker;
            while (node && node !== topBlock) {
                if (node.nextSibling) {
                    const next = node.nextSibling;
                    if (next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()) {
                        node = next;
                        continue;
                    }
                    return false;
                }
                node = node.parentElement;
            }
            return true;
        })();

        if (isAtStart) {
            let node: Node | null = topBlock;
            const nodesToMove: Node[] = [];
            while (node) {
                const next = node.nextSibling;
                if (node !== marker && !(node instanceof HTMLElement && node.classList.contains('page-footer'))) {
                    nodesToMove.push(node);
                }
                node = next;
            }
            nodesToMove.forEach(n => newPage.appendChild(n));
            // Stamp the first flow element so the break follows it through reflow
            const firstFlowStart = Array.from(newPage.children).find(c => {
                const el = c as HTMLElement;
                return el.tagName !== 'DIV' || el.getAttribute('data-user-page-break') !== 'true';
            }) as HTMLElement | undefined;
            if (firstFlowStart) firstFlowStart.setAttribute('data-page-break-before', 'true');
        } else if (isAtEnd) {
            let nextSibling = topBlock.nextSibling;
            const nodesToMove: Node[] = [];
            while (nextSibling) {
                if (!(nextSibling instanceof HTMLElement && nextSibling.classList.contains('page-footer'))) {
                    nodesToMove.push(nextSibling);
                }
                nextSibling = nextSibling.nextSibling;
            }
            nodesToMove.forEach(n => newPage.appendChild(n));
        } else {
            // Mid-block split: use Range API to correctly extract content after the cursor,
            // even when the marker is nested inside inline elements (spans, strong, em, etc.)
            const remainder = topBlock.cloneNode(false) as HTMLElement;
            if (remainder.id) remainder.id = '';

            // Create a range from the marker position to the end of topBlock
            const extractRange = document.createRange();
            extractRange.setStartAfter(marker);
            extractRange.setEndAfter(topBlock.lastChild || topBlock);

            // Extract the content after the cursor
            const extractedFragment = extractRange.extractContents();
            if (extractedFragment.childNodes.length > 0) {
                remainder.appendChild(extractedFragment);
            }

            // If remainder has content, move it and all following siblings to new page
            if (remainder.hasChildNodes()) {
                newPage.appendChild(remainder);
            }

            // Move all siblings after topBlock to new page
            let nextSibling = topBlock.nextSibling;
            const nodesToMove: Node[] = [];
            while (nextSibling) {
                if (!(nextSibling instanceof HTMLElement && nextSibling.classList.contains('page-footer'))) {
                    nodesToMove.push(nextSibling);
                }
                nextSibling = nextSibling.nextSibling;
            }
            nodesToMove.forEach(n => newPage.appendChild(n));

            // Stamp the first flow element so the break follows it through reflow
            const firstFlowMid = Array.from(newPage.children).find(c => {
                const el = c as HTMLElement;
                return el.tagName !== 'DIV' || el.getAttribute('data-user-page-break') !== 'true';
            }) as HTMLElement | undefined;
            if (firstFlowMid) firstFlowMid.setAttribute('data-page-break-before', 'true');
        }

        currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
        marker.remove();
    } else {
        currentPage.parentNode?.insertBefore(newPage, currentPage.nextSibling);
        marker.remove();
    }

    const rangeNew = document.createRange();
    if (newPage.firstChild) {
        rangeNew.setStart(newPage.firstChild, 0);
    } else {
        rangeNew.setStart(newPage, 0);
    }
    rangeNew.collapse(true);
    selection.removeAllRanges();
    selection.addRange(rangeNew);

    const workspace = document.querySelector('.editor-workspace');
    if (workspace) {
        try {
            reflowPages(workspace as HTMLElement);
        } catch (e) {
            console.warn('[handlePageBreak] reflowPages error (non-fatal):', e);
        }
        updateDocState({ ...docState, htmlContent: workspace.innerHTML }, true);
    }
};
