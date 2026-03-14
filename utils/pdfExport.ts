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

    // Save and override overflow styles to prevent text clipping in PDF
    // Only target pages and known clipping elements (avoid expensive getComputedStyle on every element)
    const overflowFixedElements: { el: HTMLElement; originalOverflow: string; originalBoxShadow?: string }[] = [];
    const tocTextBackups: { el: HTMLElement; origStyle: string }[] = [];
    const pageBgBackups: { el: HTMLElement; origBgImage: string; origBgSize: string; origBgColor: string }[] = [];

    pages.forEach(page => {
        overflowFixedElements.push({ el: page, originalOverflow: page.style.overflow, originalBoxShadow: page.style.boxShadow });
        page.style.overflow = 'visible';
        page.style.boxShadow = 'none';

        // Fix TOC text spans that have overflow:hidden + text-overflow:ellipsis (causes text clipping in PDF)
        page.querySelectorAll('.toc-dyn-text').forEach(textNode => {
            const textEl = textNode as HTMLElement;
            tocTextBackups.push({ el: textEl, origStyle: textEl.getAttribute('style') || '' });
            textEl.style.overflow = 'visible';
            textEl.style.whiteSpace = 'normal';
            textEl.style.textOverflow = 'clip';
        });

        // Convert gradient backgrounds to SVG data URLs on ALL elements (html2canvas can't render CSS gradients)
        // Scan the page itself + all children for gradient backgrounds
        const elementsToCheck = [page, ...Array.from(page.querySelectorAll('*'))];
        for (const node of elementsToCheck) {
            const el = node as HTMLElement;
            if (!el.style && !el.getAttribute) continue;
            const computedBg = window.getComputedStyle(el).backgroundImage;
            if (!computedBg || computedBg === 'none') continue;

            if (computedBg.includes('radial-gradient')) {
                pageBgBackups.push({
                    el,
                    origBgImage: el.style.backgroundImage,
                    origBgSize: el.style.backgroundSize,
                    origBgColor: el.style.backgroundColor
                });

                // Extract dot color
                const colorMatch = computedBg.match(/rgb\([^)]+\)|rgba\([^)]+\)|#[0-9a-fA-F]{3,8}/);
                const dotColor = colorMatch ? colorMatch[0] : '#cccccc';

                // Extract background-size for spacing
                const computedBgSize = window.getComputedStyle(el).backgroundSize;
                const sizeMatch = computedBgSize.match(/(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/);
                const spacingX = sizeMatch ? parseFloat(sizeMatch[1]) : 20;
                const spacingY = sizeMatch ? parseFloat(sizeMatch[2]) : 20;

                // Get background-color
                const computedBgColor = window.getComputedStyle(el).backgroundColor;

                // Create SVG dot pattern
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spacingX}" height="${spacingY}"><rect width="${spacingX}" height="${spacingY}" fill="${computedBgColor}"/><circle cx="1" cy="1" r="0.8" fill="${dotColor}"/></svg>`;
                const svgDataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
                el.style.backgroundImage = svgDataUrl;
                el.style.backgroundSize = `${spacingX}px ${spacingY}px`;

            } else if (computedBg.includes('linear-gradient')) {
                pageBgBackups.push({
                    el,
                    origBgImage: el.style.backgroundImage,
                    origBgSize: el.style.backgroundSize,
                    origBgColor: el.style.backgroundColor
                });

                // Extract line color
                const colorMatch = computedBg.match(/rgb\([^)]+\)|rgba\([^)]+\)|#[0-9a-fA-F]{3,8}/);
                const lineColor = colorMatch ? colorMatch[0] : '#cccccc';

                // Extract background-size for spacing
                const computedBgSize = window.getComputedStyle(el).backgroundSize;
                const sizeMatch = computedBgSize.match(/(\d+(?:\.\d+)?)px\s*(?:(\d+(?:\.\d+)?)px)?/);
                const sizeW = sizeMatch ? parseFloat(sizeMatch[1]) : 100;
                const sizeH = sizeMatch && sizeMatch[2] ? parseFloat(sizeMatch[2]) : sizeW;

                // Get background-color
                const computedBgColor = window.getComputedStyle(el).backgroundColor;

                // Create SVG with horizontal line
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeW}" height="${sizeH}"><rect width="${sizeW}" height="${sizeH}" fill="${computedBgColor}"/><line x1="0" y1="${sizeH - 1}" x2="${sizeW}" y2="${sizeH - 1}" stroke="${lineColor}" stroke-width="1"/></svg>`;
                const svgDataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
                el.style.backgroundImage = svgDataUrl;
                el.style.backgroundSize = `${sizeW}px ${sizeH}px`;
            }
        }
    });

    // --- Pre-process TOC leader dots: html2canvas can't render CSS radial-gradient,
    // so we temporarily replace gradient-based leaders with border-bottom styles ---
    const tocLeaderBackups: { el: HTMLElement; originalStyle: string; originalAriaHidden: string | null }[] = [];
    pages.forEach(page => {
        page.querySelectorAll('.toc-dyn-leader').forEach(leaderNode => {
            const leader = leaderNode as HTMLElement;
            const inlineStyle = leader.getAttribute('style') || '';

            // Save original state
            tocLeaderBackups.push({
                el: leader,
                originalStyle: inlineStyle,
                originalAriaHidden: leader.getAttribute('aria-hidden')
            });

            // Remove aria-hidden so html2canvas doesn't skip it
            leader.removeAttribute('aria-hidden');

            // Extract color from the inline style
            const colorMatch = inlineStyle.match(/(#[0-9a-fA-F]{3,8})/);
            const color = colorMatch ? colorMatch[1] : '#9ca3af';

            if (inlineStyle.includes('radial-gradient')) {
                // Dots → border-bottom: dotted
                leader.style.cssText = `flex: 1 1 auto; display: block; align-self: center; min-width: 20px; height: 0px; border-bottom: 2px dotted ${color}; background: none;`;
            } else if (inlineStyle.includes('repeating-linear-gradient')) {
                // Dashes → border-bottom: dashed
                leader.style.cssText = `flex: 1 1 auto; display: block; align-self: center; min-width: 20px; height: 0px; border-bottom: 2px dashed ${color}; background: none;`;
            } else if (inlineStyle.includes('border-bottom')) {
                // Solid line — border already there, just ensure it's visible
                leader.style.background = 'none';
            }
            // 'none' style — leave as is
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

            // Yield to UI every 5 pages (less often = faster overall)
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            const canvas = await window.html2canvas(pages[i], {
                scale: 1.5,       // 144 DPI — great for print, 44% faster than scale:2
                useCORS: true,
                allowTaint: true,
                logging: false,
                width: pageWidthPx,
                height: pageHeightPx,
                backgroundColor: null,  // Use the page's actual background (pattern, color, etc.)
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

        // Restore page backgrounds (revert SVG→gradient conversion)
        pageBgBackups.forEach(({ el, origBgImage, origBgSize, origBgColor }) => {
            el.style.backgroundImage = origBgImage;
            el.style.backgroundSize = origBgSize;
            el.style.backgroundColor = origBgColor;
        });

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
