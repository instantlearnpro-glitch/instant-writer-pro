// utils/pdfExport.ts — Extracted PDF export logic from App.tsx

interface JsPDFInstance {
    addPage(format: number[], orientation: string): void;
    addImage(data: string, format: string, x: number, y: number, w: number, h: number, alias?: string, compression?: string): void;
    output(type: 'blob'): Blob;
}

interface PageFormat {
    id: string;
    width: string;
    height: string;
    margins: Record<string, number>;
}

export interface PdfExportOptions {
    fileName: string;
    pageFormatId: string;
    customPageSize: { width: string; height: string };
    cssContent: string;
    pageFormats: Record<string, PageFormat>;
    detectPageSizeFromCss: (css: string) => { width: string; height: string } | null;
    onProgress?: (percent: number) => void;
}

const toInches = (val: string): number => {
    const num = parseFloat(val);
    if (isNaN(num)) return 8.5;
    if (val.includes('mm')) return num / 25.4;
    if (val.includes('cm')) return num / 2.54;
    if (val.includes('pt')) return num / 72;
    if (val.includes('px')) return num / 96;
    return num;
};

export const exportPdf = async (options: PdfExportOptions): Promise<void> => {
    const {
        fileName,
        pageFormatId,
        customPageSize,
        cssContent,
        pageFormats,
        detectPageSizeFromCss,
        onProgress,
    } = options;

    // --- Verify libraries ---
    if (!window.html2canvas) {
        alert('html2canvas library is not loaded. Please refresh the page and try again.');
        return;
    }

    const JsPDF = (window as unknown as { jspdf?: { jsPDF: new (opts: Record<string, unknown>) => JsPDFInstance } }).jspdf?.jsPDF;
    if (!JsPDF) {
        alert('jsPDF library is not loaded. Please refresh the page and try again.');
        return;
    }

    console.log('[PDF Export] Starting export for:', fileName);
    onProgress?.(0);

    // --- 1. Determine page dimensions ---
    let pageWidthIn = 8.5;
    let pageHeightIn = 11;

    const activeFormat = Object.values(pageFormats).find(f => f.id === pageFormatId);
    if (pageFormatId === 'custom') {
        pageWidthIn = toInches(customPageSize.width);
        pageHeightIn = toInches(customPageSize.height);
    } else if (activeFormat) {
        pageWidthIn = toInches(activeFormat.width);
        pageHeightIn = toInches(activeFormat.height);
    }

    const cssSize = detectPageSizeFromCss(cssContent);
    if (cssSize) {
        pageWidthIn = toInches(cssSize.width);
        pageHeightIn = toInches(cssSize.height);
    }

    const pageWidthPx = Math.round(pageWidthIn * 96);
    const pageHeightPx = Math.round(pageHeightIn * 96);
    const orientation = pageWidthIn > pageHeightIn ? 'landscape' : 'portrait';

    console.log('[PDF Export] Page size:', pageWidthIn, 'x', pageHeightIn, 'in');

    // --- 2. Find the .page elements in the workspace ---
    const workspace = document.querySelector('.editor-workspace');
    if (!workspace) {
        alert('Workspace not found.');
        return;
    }

    const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
    if (pages.length === 0) {
        alert('No pages found to export.');
        return;
    }

    console.log('[PDF Export] Found', pages.length, 'pages');

    // Signal to MutationObservers that we're exporting (prevents button re-injection loop)
    workspace.setAttribute('data-pdf-exporting', 'true');

    // --- 3. Temporarily clean up editor UI elements ---
    const removedElements: { parent: Node; element: Node; nextSibling: Node | null }[] = [];
    const editorSelectors = '.image-overlay, .resize-handle, .drag-handle, .text-mode-badge, .marquee, .context-menu, .page-ruler, .margin-guides, .toc-refresh-btn';

    workspace.querySelectorAll(editorSelectors).forEach(el => {
        if (el.parentNode) {
            removedElements.push({
                parent: el.parentNode,
                element: el,
                nextSibling: el.nextSibling
            });
            el.parentNode.removeChild(el);
        }
    });

    // Remove data-selected attributes temporarily
    const selectedEls = workspace.querySelectorAll('[data-selected]');
    selectedEls.forEach(el => el.removeAttribute('data-selected'));
    const multiSelectedEls = workspace.querySelectorAll('[data-multi-selected]');
    multiSelectedEls.forEach(el => el.removeAttribute('data-multi-selected'));

    const overflowFixedElements: { el: HTMLElement; originalOverflow: string; originalBoxShadow?: string }[] = [];
    const tocTextBackups: { el: HTMLElement; origStyle: string }[] = [];

    pages.forEach(page => {
        overflowFixedElements.push({ el: page, originalOverflow: page.style.overflow, originalBoxShadow: page.style.boxShadow });
        page.style.overflow = 'visible';
        page.style.boxShadow = 'none';

        // Fix TOC text spans
        page.querySelectorAll('.toc-dyn-text').forEach(textNode => {
            const textEl = textNode as HTMLElement;
            tocTextBackups.push({ el: textEl, origStyle: textEl.getAttribute('style') || '' });
            textEl.style.overflow = 'visible';
            textEl.style.whiteSpace = 'normal';
            textEl.style.textOverflow = 'clip';
        });
    });

    // --- Pre-process TOC leader dots: html2canvas can't render CSS radial-gradient,
    // so we temporarily replace gradient-based leaders with border-bottom styles ---
    const tocLeaderBackups: { el: HTMLElement; originalStyle: string; originalAriaHidden: string | null }[] = [];
    pages.forEach(page => {
        page.querySelectorAll('.toc-dyn-leader').forEach(leaderNode => {
            const leader = leaderNode as HTMLElement;
            const inlineStyle = leader.getAttribute('style') || '';

            tocLeaderBackups.push({
                el: leader,
                originalStyle: inlineStyle,
                originalAriaHidden: leader.getAttribute('aria-hidden')
            });

            leader.removeAttribute('aria-hidden');

            const colorMatch = inlineStyle.match(/(#[0-9a-fA-F]{3,8})/);
            const color = colorMatch ? colorMatch[1] : '#9ca3af';

            if (inlineStyle.includes('radial-gradient')) {
                leader.style.cssText = `flex: 1 1 auto; display: block; align-self: center; min-width: 20px; height: 0px; border-bottom: 2px dotted ${color}; background: none;`;
            } else if (inlineStyle.includes('repeating-linear-gradient')) {
                leader.style.cssText = `flex: 1 1 auto; display: block; align-self: center; min-width: 20px; height: 0px; border-bottom: 2px dashed ${color}; background: none;`;
            } else if (inlineStyle.includes('border-bottom')) {
                leader.style.background = 'none';
            }
        });
    });

    try {
        // --- 4. Render each page with html2canvas ---
        const pdf = new JsPDF({
            unit: 'in',
            format: [pageWidthIn, pageHeightIn],
            orientation: orientation
        });

        for (let i = 0; i < pages.length; i++) {
            const pct = Math.round(((i) / pages.length) * 90);
            onProgress?.(pct);
            console.log(`[PDF Export] Rendering page ${i + 1}/${pages.length}... (${pct}%)`);

            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const canvas = await window.html2canvas(pages[i], {
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: pageWidthPx,
                height: pageHeightPx,
                backgroundColor: '#ffffff',
                imageTimeout: 5000,
                removeContainer: true
            });

            if (i > 0) {
                pdf.addPage([pageWidthIn, pageHeightIn], orientation);
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.85);
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthIn, pageHeightIn, undefined, 'FAST');
        }

        onProgress?.(95);
        console.log('[PDF Export] All pages rendered, generating PDF blob...');

        // --- 5. Trigger download ---
        const pdfBlob = pdf.output('blob');
        console.log('[PDF Export] PDF blob size:', pdfBlob.size, 'bytes');

        const blobUrl = URL.createObjectURL(pdfBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = `${fileName}.pdf`;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        downloadLink.click();

        setTimeout(() => {
            document.body.removeChild(downloadLink);
            URL.revokeObjectURL(blobUrl);
        }, 1000);

        onProgress?.(100);
        console.log('[PDF Export] Download triggered successfully');

    } catch (err) {
        console.error('[PDF Export] Error:', err);
        alert('An error occurred during PDF export. Please try again.');
    } finally {
        // --- 6. Restore removed editor UI elements & styles ---

        // Restore TOC leader dots (revert border→gradient conversion)
        tocLeaderBackups.forEach(({ el, originalStyle, originalAriaHidden }) => {
            el.setAttribute('style', originalStyle);
            if (originalAriaHidden !== null) {
                el.setAttribute('aria-hidden', originalAriaHidden);
            }
        });

        // Restore TOC text spans (revert overflow:visible → original hidden+ellipsis)
        tocTextBackups.forEach(({ el, origStyle }) => {
            el.setAttribute('style', origStyle);
        });

        overflowFixedElements.forEach(({ el, originalOverflow, originalBoxShadow }) => {
            el.style.overflow = originalOverflow;
            if (originalBoxShadow !== undefined) el.style.boxShadow = originalBoxShadow;
        });
        removedElements.forEach(({ parent, element, nextSibling }) => {
            if (nextSibling) {
                parent.insertBefore(element, nextSibling);
            } else {
                parent.appendChild(element);
            }
        });
        console.log('[PDF Export] Cleanup complete');

        // Remove export flag
        workspace.removeAttribute('data-pdf-exporting');
    }
};
