/**
 * DOCX Export – standalone utility extracted from App.tsx.
 *
 * This module contains the full DOCX export pipeline:
 *   1. Prepare the DOM (remove overlays, fix overflow)
 *   2. Convert pages into docx Paragraphs (text-based + image fallback)
 *   3. Pack and download the .docx file via file-saver
 *
 * Keeping this separate from App.tsx means edits here cannot accidentally
 * break other features, and the AI context window can focus on just this file.
 */

// Dynamic imports – the docx library is large so it's imported at call-time
// to avoid loading it on every page load.

declare global {
    interface Window {
        html2canvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>;
    }
}

export const exportDOCX = async (fileName: string, onProgress?: (percent: number) => void) => {
    if (!window.html2canvas) {
        alert('DOCX export requires html2canvas to be loaded.');
        return;
    }

    // Dynamically import heavy dependencies
    const { Document, Paragraph, TextRun, ImageRun, Packer, AlignmentType, HeadingLevel, PageBreak, convertInchesToTwip } = await import('docx');
    const { saveAs } = await import('file-saver');

    console.log('[DOCX Export] Starting native export for:', fileName);
    onProgress?.(0);

    // --- Find visible workspace pages ---
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

    console.log('[DOCX Export] Found', pages.length, 'pages');

    // --- Temporarily clean up editor UI elements ---
    const removedElements: { parent: Node; element: Node; nextSibling: Node | null }[] = [];
    const editorSelectors = '.image-overlay, .resize-handle, .drag-handle, .text-mode-badge, .marquee, .context-menu, .page-ruler, .margin-guides';

    workspace.querySelectorAll(editorSelectors).forEach(el => {
        if (el.parentNode) {
            removedElements.push({ parent: el.parentNode, element: el, nextSibling: el.nextSibling });
            el.parentNode.removeChild(el);
        }
    });

    const selectedEls = workspace.querySelectorAll('[data-selected]');
    selectedEls.forEach(el => el.removeAttribute('data-selected'));
    const multiSelectedEls = workspace.querySelectorAll('[data-multi-selected]');
    multiSelectedEls.forEach(el => el.removeAttribute('data-multi-selected'));

    const overflowFixedElements: { el: HTMLElement; originalOverflow: string }[] = [];
    pages.forEach(page => {
        overflowFixedElements.push({ el: page, originalOverflow: page.style.overflow });
        page.style.overflow = 'visible';
        page.querySelectorAll('*').forEach(child => {
            const el = child as HTMLElement;
            const computed = window.getComputedStyle(el);
            if (computed.overflow === 'hidden' || computed.overflowX === 'hidden' || computed.overflowY === 'hidden') {
                overflowFixedElements.push({ el, originalOverflow: el.style.overflow });
                el.style.overflow = 'visible';
            }
        });
    });

    // Convert CSS colors to Hex for DOCX
    const parseColorToHex = (colorString: string): string | undefined => {
        if (!colorString || colorString === 'transparent' || colorString === 'rgba(0, 0, 0, 0)') return undefined;
        if (colorString.startsWith('#')) return colorString.replace('#', '');
        const rgb = colorString.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            return ((1 << 24) + (parseInt(rgb[0]) << 16) + (parseInt(rgb[1]) << 8) + parseInt(rgb[2])).toString(16).slice(1).toUpperCase();
        }
        return undefined;
    };

    const cssPxToHalfPoint = (px: string): number => {
        if (!px) return 24; // default 12pt
        const num = parseFloat(px);
        if (isNaN(num)) return 24;
        if (px.includes('pt')) return Math.round(num * 2);
        return Math.round(num * 0.75 * 2); // px to pt to half-points
    };

    const cssToTwip = (px: string): number => {
        if (!px) return 0;
        const num = parseFloat(px);
        if (isNaN(num)) return 0;
        if (px.includes('pt')) return Math.round(num * 20); // 1pt = 20 twips
        if (px.includes('in')) return Math.round(num * 1440); // 1in = 1440 twips
        return Math.round(num * 15); // 1px = 15 twips
    };

    const getSpacingOption = (computed: CSSStyleDeclaration) => {
        const spacing: { after?: number; line?: number; lineRule?: 'atLeast' | 'exactly' | 'auto' } = {};
        const mb = cssToTwip(computed.marginBottom);
        if (mb > 0) spacing.after = mb;

        const lh = computed.lineHeight;
        if (lh === 'normal') {
            spacing.line = 240 * 1.5;
        } else if (lh.includes('px') || lh.includes('pt')) {
            spacing.line = cssToTwip(lh);
        } else if (!isNaN(parseFloat(lh))) {
            spacing.line = Math.round(parseFloat(lh) * 240);
        }
        return Object.keys(spacing).length > 0 ? spacing : undefined;
    };

    const renderElementAsImageRun = async (el: HTMLElement): Promise<InstanceType<typeof Paragraph> | null> => {
        try {
            const scale = 1.5;
            const canvas = await window.html2canvas(el, {
                scale, useCORS: true, allowTaint: true, backgroundColor: '#ffffff', logging: false,
            });

            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            const base64Data = dataUrl.split(',')[1];
            const uint8Array = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

            const maxDocxWidth = 650;
            let widthPx = Math.min(Math.round(canvas.width), maxDocxWidth);
            if (el.offsetWidth > 400 || el.tagName === 'TABLE') {
                widthPx = maxDocxWidth;
            }
            const heightPx = Math.round(canvas.height * (widthPx / canvas.width));

            return new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 240 },
                children: [
                    new ImageRun({
                        type: 'jpg',
                        data: uint8Array,
                        transformation: { width: widthPx, height: heightPx },
                    })
                ]
            });
        } catch (e) {
            console.error('[DOCX Export] Error rendering element as image:', e);
            return null;
        }
    };

    const shouldRenderAsImage = (el: HTMLElement): boolean => {
        const classList = el.classList;
        const computed = window.getComputedStyle(el);
        const hasBgImage = computed.backgroundImage && computed.backgroundImage !== 'none';
        const hasBgColor = computed.backgroundColor && computed.backgroundColor !== 'transparent' && computed.backgroundColor !== 'rgba(0, 0, 0, 0)' && computed.backgroundColor !== 'rgb(255, 255, 255)';
        const hasBorder = computed.borderStyle && computed.borderStyle !== 'none';
        const hasBorderRadius = computed.borderRadius && computed.borderRadius !== '0px';

        if (classList.contains('tracing-line') || classList.contains('writing-lines') || classList.contains('toc-container') || classList.contains('toc-table')) return true;
        if (el.tagName === 'TABLE') return true;
        if (hasBgImage) return true;
        if ((hasBgColor || hasBorder) && hasBorderRadius) return true;
        if (computed.display === 'flex' || computed.display === 'grid') {
            const isSimpleText = el.children.length <= 1 && !el.querySelector('img, table, svg');
            if (!isSimpleText) return true;
        }
        return false;
    };

    const parseTextNodeStyles = (el: HTMLElement, text: string): InstanceType<typeof TextRun> => {
        const computed = window.getComputedStyle(el);
        const isBold = computed.fontWeight === 'bold' || parseInt(computed.fontWeight) >= 600 || el.tagName === 'B' || el.tagName === 'STRONG';
        const isItalic = computed.fontStyle === 'italic' || el.tagName === 'I' || el.tagName === 'EM';
        const isUnderline = computed.textDecoration.includes('underline') || el.tagName === 'U';
        const sizeString = computed.fontSize;

        return new TextRun({
            text: text,
            bold: isBold,
            italics: isItalic,
            underline: isUnderline ? {} : undefined,
            color: parseColorToHex(computed.color),
            size: cssPxToHalfPoint(sizeString),
            font: computed.fontFamily.split(',')[0].replace(/['"]/g, ''),
            shading: parseColorToHex(computed.backgroundColor) ? {
                type: "solid" as const,
                color: parseColorToHex(computed.backgroundColor)
            } : undefined
        });
    };

    // Recursively build docx sub-elements (TextRuns)
    const processInlineChildren = (el: Node): InstanceType<typeof TextRun>[] => {
        let runs: InstanceType<typeof TextRun>[] = [];
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                let text = child.textContent;
                if (text) {
                    const computed = window.getComputedStyle(el as HTMLElement);
                    if (computed.whiteSpace !== 'pre' && computed.whiteSpace !== 'pre-wrap') {
                        text = text.replace(/[\r\n\t]+/g, ' ').replace(/ +/g, ' ');
                    }
                    runs.push(parseTextNodeStyles(el as HTMLElement, text));
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const childEl = child as HTMLElement;
                if (childEl.tagName === 'BR') {
                    runs.push(new TextRun({ break: 1 }));
                } else {
                    runs = runs.concat(processInlineChildren(childEl));
                }
            }
        }
        return runs;
    };

    const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'TABLE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'FIGCAPTION', 'PRE']);

    const hasBlockChildren = (el: HTMLElement): boolean => {
        for (const child of Array.from(el.children)) {
            if (BLOCK_TAGS.has(child.tagName)) return true;
        }
        return false;
    };

    // Build top-level document structure
    const docChildren: any[] = [];
    let wasLastParagraphEmpty = false;

    const processBlockElement = async (el: HTMLElement): Promise<void> => {
        if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.classList.contains('page-footer')) return;

        if (shouldRenderAsImage(el)) {
            const imgPara = await renderElementAsImageRun(el);
            if (imgPara) { docChildren.push(imgPara); wasLastParagraphEmpty = false; }
            return;
        }

        if (el.tagName === 'IMG') {
            const img = el as HTMLImageElement;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width || 300;
                canvas.height = img.naturalHeight || img.height || 300;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
                    const uint8Array = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                    docChildren.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 240 },
                        children: [
                            new ImageRun({
                                type: 'jpg',
                                data: uint8Array,
                                transformation: { width: Math.min(canvas.width, 650), height: Math.min(canvas.height, Math.round(canvas.height * (650 / canvas.width))) }
                            })
                        ]
                    }));
                    wasLastParagraphEmpty = false;
                }
            } catch (e) { }
            return;
        }

        if (el.tagName === 'HR') {
            docChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
            wasLastParagraphEmpty = false;
            return;
        }

        // If the element has block-level children, recurse instead of flattening
        if (hasBlockChildren(el)) {
            for (const child of Array.from(el.children)) {
                await processBlockElement(child as HTMLElement);
            }
            return;
        }

        // Leaf block element — produce a single DOCX Paragraph
        const computed = window.getComputedStyle(el);
        let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT;
        if (computed.textAlign === 'center') alignment = AlignmentType.CENTER;
        if (computed.textAlign === 'right') alignment = AlignmentType.RIGHT;
        if (computed.textAlign === 'justify') alignment = AlignmentType.JUSTIFIED;

        const inlineRuns = processInlineChildren(el);

        const isWhitespaceOnly = !el.textContent || !el.textContent.trim();
        if (isWhitespaceOnly && el.tagName !== 'IMG') {
            if (wasLastParagraphEmpty) return;
            wasLastParagraphEmpty = true;
        } else {
            wasLastParagraphEmpty = false;
        }

        if (inlineRuns.length > 0 || isWhitespaceOnly) {
            let wantsPageBreak = computed.pageBreakBefore === 'always' || computed.breakBefore === 'always' || computed.breakBefore === 'page';
            let headingLevel = undefined;
            let lineSpacingMultiplier = undefined;

            if (el.tagName === 'H1') { headingLevel = HeadingLevel.HEADING_1; lineSpacingMultiplier = 1.1; wantsPageBreak = true; }
            if (el.tagName === 'H2') { headingLevel = HeadingLevel.HEADING_2; lineSpacingMultiplier = 1.15; wantsPageBreak = true; }
            if (el.tagName === 'H3') { headingLevel = HeadingLevel.HEADING_3; lineSpacingMultiplier = 1.15; }
            if (el.tagName === 'H4') { headingLevel = HeadingLevel.HEADING_4; lineSpacingMultiplier = 1.15; }
            if (el.tagName === 'H5') { headingLevel = HeadingLevel.HEADING_5; lineSpacingMultiplier = 1.15; }
            if (el.tagName === 'H6') { headingLevel = HeadingLevel.HEADING_6; lineSpacingMultiplier = 1.15; }

            const spacing = getSpacingOption(computed);
            let indent = undefined;
            const indentTwip = cssToTwip(computed.textIndent);
            if (indentTwip > 0) {
                indent = { firstLine: indentTwip };
            }

            if (headingLevel && spacing && (!spacing.line || spacing.line > 240 * 1.2)) {
                spacing.line = Math.round(240 * (lineSpacingMultiplier || 1.15));
            }

            if (wantsPageBreak && docChildren.length > 0) {
                docChildren.push(new Paragraph({ children: [new PageBreak()] }));
            }

            docChildren.push(new Paragraph({
                children: inlineRuns,
                alignment: alignment,
                heading: headingLevel,
                spacing: spacing || { after: 120 },
                indent: indent
            }));
        }
    };

    try {
        for (let i = 0; i < pages.length; i++) {
            const pct = Math.round((i / pages.length) * 90);
            onProgress?.(pct);
            console.log(`[DOCX Export] Processing page ${i + 1}/${pages.length}... (${pct}%)`);

            await new Promise(resolve => setTimeout(resolve, 10));

            const page = pages[i];
            for (const child of Array.from(page.children)) {
                await processBlockElement(child as HTMLElement);
            }
        }

        onProgress?.(95);
        console.log('[DOCX Export] Building DOCX file...');

        const doc = new Document({
            sections: [{
                properties: {
                    page: {
                        margin: {
                            top: convertInchesToTwip(0.6),
                            right: convertInchesToTwip(0.6),
                            bottom: convertInchesToTwip(0.6),
                            left: convertInchesToTwip(0.6),
                        },
                        size: {
                            width: convertInchesToTwip(8.5),
                            height: convertInchesToTwip(11),
                        }
                    }
                },
                children: docChildren
            }]
        });

        const docxBlob = await Packer.toBlob(doc);
        console.log('[DOCX Export] DOCX blob size:', docxBlob.size, 'bytes');

        saveAs(docxBlob, `${fileName}.docx`);

        onProgress?.(100);
        console.log('[DOCX Export] Download triggered successfully');

    } catch (err: unknown) {
        console.error('[DOCX Export] Error:', err);
        alert(`An error occurred during DOCX export:\n${err instanceof Error ? err.message : String(err)}\n\nPlease check the console for more details.`);
    } finally {
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
        console.log('[DOCX Export] Cleanup complete');
    }
};
