// utils/pdfImport.ts — Import PDF files by rendering each page to a high-res image
// Uses pdf.js (loaded via CDN on window.pdfjsLib) to parse and render PDF pages.

declare global {
    interface Window {
        pdfjsLib: {
            getDocument(src: { data: ArrayBuffer }): {
                promise: Promise<PDFDocumentProxy>;
            };
        };
    }
}

interface PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFTextItem {
    str: string;
    // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
    transform: number[];
    width: number;
    height: number;
    fontName: string;
}

interface PDFPageProxy {
    getViewport(params: { scale: number }): { width: number; height: number };
    render(params: {
        canvasContext: CanvasRenderingContext2D;
        viewport: { width: number; height: number };
    }): { promise: Promise<void> };
    getTextContent(): Promise<{ items: PDFTextItem[] }>;
}

/** A single text fragment extracted from a PDF page */
export interface PdfTextItem {
    text: string;
    fontSize: number;
    x: number;
    y: number;
    width: number;
    fontName: string;
}

/** All text extracted from one PDF page */
export interface PdfPageText {
    pageNum: number;
    items: PdfTextItem[];
}

export interface PdfImportResult {
    htmlContent: string;
    pageCount: number;
    /** Detected page size from the first PDF page (inches) */
    detectedSize?: { width: string; height: string };
    /** Extracted text content per page (for heading detection) */
    textByPage: PdfPageText[];
}

/**
 * Import a PDF file, rendering each page as a high-resolution image
 * wrapped in a `.page` div that matches the editor's page system.
 *
 * Quality strategy:
 * - Render at 4x scale (288 DPI equivalent) for razor-sharp text
 * - Use PNG format (lossless) to avoid JPEG compression artefacts on text
 * - Size each .page div to exactly match the PDF page dimensions (in inches)
 *   so there's no stretching, squishing, or aspect ratio mismatch
 *
 * Also extracts text content from each page (via pdf.js getTextContent)
 * for heading detection and TOC building.
 *
 * @param file - The PDF File object
 * @param onProgress - Optional progress callback (0-100)
 * @returns The HTML content string with all pages + extracted text data
 */
export const importPdf = async (
    file: File,
    onProgress?: (percent: number) => void
): Promise<PdfImportResult> => {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
        throw new Error('PDF.js library is not loaded. Please refresh the page.');
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const totalPages = pdf.numPages;
    const pageHtmlParts: string[] = [];
    const textByPage: PdfPageText[] = [];

    // Render scale: 4x for crystal-clear text (PDF points are 1/72 inch,
    // so scale 4 = 288 DPI — enough for retina and print-quality rendering)
    const RENDER_SCALE = 4;

    // We'll detect page size from the first page
    let detectedSize: { width: string; height: string } | undefined;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);

        // Get the 1x viewport to know the PDF page dimensions in points
        const baseViewport = page.getViewport({ scale: 1 });
        // PDF points → inches (72 points = 1 inch)
        const pageWidthIn = baseViewport.width / 72;
        const pageHeightIn = baseViewport.height / 72;

        if (pageNum === 1) {
            detectedSize = {
                width: `${pageWidthIn.toFixed(3)}in`,
                height: `${pageHeightIn.toFixed(3)}in`,
            };
        }

        // ── Extract text content for heading detection ──
        try {
            const textContent = await page.getTextContent();
            const pageItems: PdfTextItem[] = [];
            for (const item of textContent.items) {
                const text = item.str?.trim();
                if (!text) continue;
                // transform[0] = horizontal scale ≈ font size
                // transform[3] = vertical scale ≈ font size (more reliable)
                const fontSize = Math.abs(item.transform?.[3] || item.transform?.[0] || 12);
                pageItems.push({
                    text,
                    fontSize: Math.round(fontSize * 100) / 100,
                    x: item.transform?.[4] || 0,
                    y: item.transform?.[5] || 0,
                    width: item.width || 0,
                    fontName: item.fontName || '',
                });
            }
            textByPage.push({ pageNum, items: pageItems });
        } catch (err) {
            console.warn(`[PDF Import] Could not extract text from page ${pageNum}:`, err);
            textByPage.push({ pageNum, items: [] });
        }

        // Hi-res viewport for rendering
        const viewport = page.getViewport({ scale: RENDER_SCALE });

        // Create an offscreen canvas at full resolution
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error(`Failed to get canvas context for page ${pageNum}`);
        }

        // Render the page to canvas
        await page.render({
            canvasContext: ctx,
            viewport: viewport,
        }).promise;

        // Convert canvas to blob URL using PNG (lossless — no JPEG artefacts on text)
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => {
                    if (b) resolve(b);
                    else reject(new Error(`Failed to create blob for page ${pageNum}`));
                },
                'image/png'
            );
        });

        const blobUrl = URL.createObjectURL(blob);

        // Build page HTML:
        // - The .page div is sized to the exact PDF page dimensions (in inches)
        // - The img fills it completely with no padding
        // - image-rendering: auto lets the browser use high-quality bicubic downscaling
        pageHtmlParts.push(
            `<div class="page" data-page-index="${pageNum}" data-pdf-page="true" ` +
            `style="width:${pageWidthIn.toFixed(3)}in; min-height:${pageHeightIn.toFixed(3)}in; height:${pageHeightIn.toFixed(3)}in; padding:0; overflow:hidden;">` +
            `<img src="${blobUrl}" alt="PDF Page ${pageNum}" ` +
            `style="width:100%; height:100%; display:block; pointer-events:none; image-rendering:auto;" ` +
            `data-pdf-image="true" />` +
            `</div>`
        );

        // Report progress
        if (onProgress) {
            onProgress(Math.round((pageNum / totalPages) * 100));
        }

        // Yield to browser event loop to keep UI responsive
        await new Promise((r) => setTimeout(r, 0));
    }

    return {
        htmlContent: pageHtmlParts.join('\n'),
        pageCount: totalPages,
        detectedSize,
        textByPage,
    };
};

// ── Heading Detection from PDF Text ─────────────────────────────────────────

export interface DetectedHeading {
    text: string;
    level: 'h1' | 'h2' | 'h3';
    page: number;
    fontSize: number;
}

/**
 * Analyze extracted PDF text across all pages to detect headings
 * based on font size heuristics.
 *
 * Strategy:
 * 1. Collect all unique font sizes used in the document
 * 2. Build lines by grouping items on the same Y position
 * 3. Identify the top 2-3 largest font sizes as heading levels
 * 4. Lines in those sizes that are short enough to be titles → headings
 */
export const detectPdfHeadings = (textByPage: PdfPageText[]): DetectedHeading[] => {
    // 1. Collect all font sizes and build lines per page
    const allFontSizes: number[] = [];
    interface TextLine {
        text: string;
        fontSize: number;
        page: number;
        y: number;
        x: number;
    }
    const allLines: TextLine[] = [];

    for (const page of textByPage) {
        if (page.items.length === 0) continue;

        // Group items by approximate Y position (within 2pt tolerance = same line)
        const lineMap = new Map<number, { items: PdfTextItem[]; fontSize: number; y: number; x: number }>();
        for (const item of page.items) {
            const roundedY = Math.round(item.y / 2) * 2; // snap to 2pt grid
            const existing = lineMap.get(roundedY);
            if (existing) {
                existing.items.push(item);
                // Keep the largest font size on this line
                if (item.fontSize > existing.fontSize) {
                    existing.fontSize = item.fontSize;
                }
                existing.x = Math.min(existing.x, item.x);
            } else {
                lineMap.set(roundedY, {
                    items: [item],
                    fontSize: item.fontSize,
                    y: item.y,
                    x: item.x,
                });
            }
        }

        for (const [, line] of lineMap) {
            const text = [...line.items]
                .sort((a, b) => a.x - b.x)
                .map(item => item.text)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!text || text.length < 2) continue;
            allFontSizes.push(line.fontSize);
            allLines.push({
                text,
                fontSize: line.fontSize,
                page: page.pageNum,
                y: line.y,
                x: line.x,
            });
        }
    }

    if (allLines.length === 0) return [];

    // 2. Find unique font sizes, sorted descending
    const uniqueSizes = [...new Set(allFontSizes)].sort((a, b) => b - a);

    // 3. Identify body text size (the most common font size)
    const sizeFreq = new Map<number, number>();
    for (const sz of allFontSizes) {
        sizeFreq.set(sz, (sizeFreq.get(sz) || 0) + 1);
    }
    let bodySize = uniqueSizes[uniqueSizes.length - 1]; // fallback to smallest
    let maxFreq = 0;
    for (const [sz, freq] of sizeFreq) {
        if (freq > maxFreq) {
            maxFreq = freq;
            bodySize = sz;
        }
    }

    // 4. Heading sizes = sizes significantly larger than body text
    //    At least 1.2x body size to be considered H3
    //    At least 1.5x body size to be considered H2
    //    At least 1.8x body size to be considered H1
    const headings: DetectedHeading[] = [];

    // Alternatively: just use the top 3 largest sizes if they're bigger than body
    const h1Threshold = bodySize * 1.8;
    const h2Threshold = bodySize * 1.4;
    const h3Threshold = bodySize * 1.15;

    for (const line of allLines) {
        // Skip very long lines (likely body paragraphs)
        if (line.text.length > 150) continue;
        // Skip if same as body size
        if (line.fontSize <= bodySize) continue;

        let level: 'h1' | 'h2' | 'h3';
        if (line.fontSize >= h1Threshold) {
            level = 'h1';
        } else if (line.fontSize >= h2Threshold) {
            level = 'h2';
        } else if (line.fontSize >= h3Threshold) {
            level = 'h3';
        } else {
            continue; // Not big enough to be a heading
        }

        headings.push({
            text: line.text,
            level,
            page: line.page,
            fontSize: line.fontSize,
        });
    }

    const isTocLikeLine = (text: string) =>
        /^(table\s+of\s+contents?|contents?|toc|indice|sommario)$/i.test(text)
        || (/\d{1,4}\s*$/.test(text) && /[.\u2022·•]{2,}/.test(text));

    const meaningfulPrimaryHeadings = headings.filter(h => !isTocLikeLine(h.text.trim()));
    if (meaningfulPrimaryHeadings.length >= 2) return meaningfulPrimaryHeadings;

    // Fallback for image-heavy/activity PDFs where every extracted title may
    // share the same font size. Pick the most plausible title near the top of
    // each page, excluding TOC rows, page numbers and very long/body-like text.
    const fallbackHeadings: DetectedHeading[] = [];
    const seenPages = new Set<number>();
    const sortedByPageTop = [...allLines].sort((a, b) => {
        if (a.page !== b.page) return a.page - b.page;
        return b.y - a.y; // PDF y grows upward, so larger y is nearer top.
    });

    for (const line of sortedByPageTop) {
        if (seenPages.has(line.page)) continue;
        const text = line.text.trim();
        if (!text || text.length < 3 || text.length > 90) continue;
        if (/^\d+$/.test(text)) continue;
        if (isTocLikeLine(text)) continue;
        if (line.y < 120) continue;

        fallbackHeadings.push({
            text,
            level: 'h1',
            page: line.page,
            fontSize: line.fontSize,
        });
        seenPages.add(line.page);
    }

    const merged = [...meaningfulPrimaryHeadings];
    const seen = new Set(merged.map(h => `${h.page}:${h.text.toLowerCase()}`));
    fallbackHeadings.forEach(heading => {
        const key = `${heading.page}:${heading.text.toLowerCase()}`;
        if (!seen.has(key)) {
            merged.push(heading);
            seen.add(key);
        }
    });

    return merged;
};
