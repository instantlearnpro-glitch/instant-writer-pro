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

    // --- 3. Temporarily clean up editor UI elements ---
    const removedElements: { parent: Node; element: Node; nextSibling: Node | null }[] = [];
    const editorSelectors = '.image-overlay, .resize-handle, .drag-handle, .text-mode-badge, .marquee, .context-menu, .page-ruler, .margin-guides';

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

    // Save and override overflow styles to prevent text clipping in PDF
    const overflowFixedElements: { el: HTMLElement; originalOverflow: string }[] = [];
    pages.forEach(page => {
        overflowFixedElements.push({ el: page, originalOverflow: page.style.overflow });
        page.style.overflow = 'visible';
        page.style.boxShadow = 'none';

        page.querySelectorAll('*').forEach(child => {
            const el = child as HTMLElement;
            const computed = window.getComputedStyle(el);
            if (computed.overflow === 'hidden' || computed.overflowX === 'hidden' || computed.overflowY === 'hidden') {
                overflowFixedElements.push({ el, originalOverflow: el.style.overflow });
                el.style.overflow = 'visible';
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

            // Small yield to let React update the progress bar
            await new Promise(resolve => setTimeout(resolve, 10));

            const canvas = await window.html2canvas(pages[i], {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: pageWidthPx,
                height: pageHeightPx,
                backgroundColor: '#ffffff'
            });

            if (i > 0) {
                pdf.addPage([pageWidthIn, pageHeightIn], orientation);
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
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
        overflowFixedElements.forEach(({ el, originalOverflow }) => {
            el.style.overflow = originalOverflow;
        });
        removedElements.forEach(({ parent, element, nextSibling }) => {
            if (nextSibling) {
                parent.insertBefore(element, nextSibling);
            } else {
                parent.appendChild(element);
            }
        });
        console.log('[PDF Export] Cleanup complete');
    }
};
