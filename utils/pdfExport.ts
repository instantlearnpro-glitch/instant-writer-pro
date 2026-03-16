// utils/pdfExport.ts — True screenshot-based PDF export
// Uses the Screen Capture API (getDisplayMedia) to capture ACTUAL rendered pixels.
// Flow: modal closes → getDisplayMedia permission → scroll & capture each page → build PDF

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

// ---------- Inline progress bar (shown at the top of the screen) ----------

const createProgressBar = () => {
    const container = document.createElement('div');
    container.id = 'pdf-export-progress';
    container.innerHTML = `
        <div style="position:fixed; top:0; left:0; right:0; z-index:99999;
                    background:rgba(17,24,39,0.92); backdrop-filter:blur(8px);
                    padding:10px 20px; display:flex; align-items:center; gap:14px;
                    box-shadow:0 4px 20px rgba(0,0,0,0.3); font-family:Inter,sans-serif;">
            <span style="color:white; font-size:13px; font-weight:600; white-space:nowrap;">
                📸 Rendering PDF…
            </span>
            <div style="flex:1; height:6px; background:rgba(255,255,255,0.15);
                        border-radius:3px; overflow:hidden;">
                <div id="pdf-progress-fill"
                     style="height:100%; width:0%; background:linear-gradient(90deg,#8d55f1,#c4a7ff);
                            border-radius:3px; transition:width 0.2s;"></div>
            </div>
            <span id="pdf-progress-text"
                  style="color:white; font-size:13px; font-weight:700; min-width:36px; text-align:right;">
                0%
            </span>
        </div>
    `;
    document.body.appendChild(container);
    return container;
};

const updateProgressBar = (pct: number) => {
    const fill = document.getElementById('pdf-progress-fill');
    const text = document.getElementById('pdf-progress-text');
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${Math.round(pct)}%`;
};

const removeProgressBar = () => {
    document.getElementById('pdf-export-progress')?.remove();
};

// ---------- Capture helpers ----------

/**
 * Capture a single video frame from the screen capture stream,
 * cropped to the given element's bounding rect on screen.
 */
const captureElementFromStream = (
    video: HTMLVideoElement,
    element: HTMLElement,
): string => {
    const rect = element.getBoundingClientRect();

    // Map CSS viewport pixels → video stream pixels
    const scaleX = video.videoWidth / window.innerWidth;
    const scaleY = video.videoHeight / window.innerHeight;

    const srcX = Math.round(rect.left * scaleX);
    const srcY = Math.round(rect.top * scaleY);
    const srcW = Math.round(rect.width * scaleX);
    const srcH = Math.round(rect.height * scaleY);

    const canvas = document.createElement('canvas');
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    // JPEG is ~5-10x smaller than PNG — critical for large documents
    return canvas.toDataURL('image/jpeg', 0.92);
};

// ---------- Main export function ----------

export const exportPdf = async (options: PdfExportOptions): Promise<void> => {
    const {
        fileName,
        pageFormatId,
        customPageSize,
        cssContent,
        pageFormats,
        detectPageSizeFromCss,
    } = options;

    // --- Verify jsPDF ---
    const JsPDF = (window as unknown as { jspdf?: { jsPDF: new (opts: Record<string, unknown>) => JsPDFInstance } }).jspdf?.jsPDF;
    if (!JsPDF) {
        alert('jsPDF library is not loaded. Please refresh the page and try again.');
        return;
    }

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

    const orientation = pageWidthIn > pageHeightIn ? 'landscape' : 'portrait';

    // --- 2. Find elements ---
    const workspace = document.querySelector('.editor-workspace') as HTMLElement | null;
    const editorContainer = document.querySelector('.editor-container') as HTMLElement | null;
    if (!workspace || !editorContainer) {
        alert('Editor not found.');
        return;
    }

    const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
    if (pages.length === 0) {
        alert('No pages found to export.');
        return;
    }

    console.log('[PDF Export] Starting screen capture for', pages.length, 'pages');

    // --- 3. Request screen capture permission (browser dialog) ---
    let stream: MediaStream;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                // @ts-ignore — displaySurface hint for Chromium
                displaySurface: 'browser',
            },
            // @ts-ignore — preferCurrentTab is Chromium-specific
            preferCurrentTab: true,
            // @ts-ignore
            selfBrowserSurface: 'include',
        } as DisplayMediaStreamOptions);
    } catch {
        alert('Screen capture was denied. Please try again and share the current tab.');
        return;
    }

    // --- 4. Set up video element from stream ---
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Wait for video dimensions to stabilize
    await new Promise(r => setTimeout(r, 500));
    console.log(`[PDF Export] Video stream: ${video.videoWidth}x${video.videoHeight}`);

    // --- 5. Prepare editor: hide UI, adjust zoom ---

    // Save current state
    const savedTransform = workspace.style.transform;
    const savedTransformOrigin = workspace.style.transformOrigin;

    // Calculate zoom so a full page fits in the editor container's height
    const pageComputedStyle = getComputedStyle(pages[0]);
    const pageRealHeight = parseFloat(pageComputedStyle.height);
    const containerHeight = editorContainer.clientHeight;
    const fitZoom = Math.min(100, Math.floor((containerHeight / pageRealHeight) * 96));

    // Hide editor UI elements and remove page shadows
    const hideStyle = document.createElement('style');
    hideStyle.id = 'pdf-export-hide';
    hideStyle.textContent = `
        .image-overlay, .resize-handle, .drag-handle,
        .text-mode-badge, .marquee, .context-menu,
        .page-ruler, .margin-guides, .toc-refresh-btn {
            display: none !important;
        }
        .editor-workspace .page {
            box-shadow: none !important;
        }
        [data-selected], [data-multi-selected] {
            outline: none !important;
        }
        #pdf-export-progress {
            /* Keep progress bar visible during capture */
        }
    `;
    document.head.appendChild(hideStyle);

    // Set zoom to fit
    workspace.style.transform = `scale(${fitZoom / 100})`;
    workspace.style.transformOrigin = 'top center';
    workspace.setAttribute('data-pdf-exporting', 'true');

    // Wait for repaint
    await new Promise(r => setTimeout(r, 300));

    // Show progress bar
    const progressContainer = createProgressBar();

    try {
        const pdf = new JsPDF({
            unit: 'in',
            format: [pageWidthIn, pageHeightIn],
            orientation: orientation
        });

        // Process pages incrementally: capture → add to PDF → discard.
        // This avoids holding ALL page screenshots in memory at once,
        // which was causing the browser to freeze/crash on large documents.
        for (let i = 0; i < pages.length; i++) {
            const pct = Math.round(((i) / pages.length) * 95);
            updateProgressBar(pct);
            console.log(`[PDF Export] Page ${i + 1}/${pages.length} (${pct}%)`);

            // Scroll this page into the center of the editor
            pages[i].scrollIntoView({ behavior: 'instant', block: 'center' });

            // Wait for scroll + repaint
            await new Promise(r => setTimeout(r, 350));

            // Capture actual screen pixels for this page
            const imgData = captureElementFromStream(video, pages[i]);

            // Add to PDF immediately instead of storing (saves memory)
            if (i > 0) {
                pdf.addPage([pageWidthIn, pageHeightIn], orientation);
            }
            pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthIn, pageHeightIn, `page-${i}`, 'FAST');

            // Yield to the browser event loop every page to prevent UI freeze
            await new Promise(r => setTimeout(r, 0));
        }

        // Stop capture
        stream.getTracks().forEach(t => t.stop());
        video.remove();

        updateProgressBar(97);

        // Yield before heavy blob generation
        await new Promise(r => setTimeout(r, 10));

        // Trigger download
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

        updateProgressBar(100);
        console.log('[PDF Export] Done!');

        // Brief moment to show 100% before removing
        await new Promise(r => setTimeout(r, 600));

    } catch (err) {
        console.error('[PDF Export] Error:', err);
        try { stream.getTracks().forEach(t => t.stop()); } catch { /* */ }
        video.remove();
        alert('An error occurred during PDF export.');
    } finally {
        // Restore everything
        workspace.removeAttribute('data-pdf-exporting');
        workspace.style.transform = savedTransform;
        workspace.style.transformOrigin = savedTransformOrigin;
        hideStyle.remove();
        removeProgressBar();
        console.log('[PDF Export] Cleanup complete');
    }
};
