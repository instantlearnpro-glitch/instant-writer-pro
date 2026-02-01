import { StructureEntry, StructureStatus } from '../types';

interface StyleSignature {
    tagName: string; // 'h1', 'h2', 'h3'
    fontSize: number;
    fontWeight: number;
    color: string;
}

interface Candidate {
    element: HTMLElement;
    text: string;
    page: number;
    tagName: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    isExplicit: boolean;
    isPageTop: boolean;
    matchedRef?: string; // 'h1', 'h2' etc.
    score: number;
}

/**
 * Scans the editor workspace for headings using a "Learn & Match" approach.
 * 1. Learns from explicit H tags (H1-H6).
 * 2. Scans for elements matching those styles.
 * 3. Uses page-position heuristics (top of page) for chapter detection.
 */
export const scanStructure = (workspace: HTMLElement): { entries: StructureEntry[], modifiedHtml: string | null } => {
    if (!workspace) return { entries: [], modifiedHtml: null };

    const candidates: Candidate[] = [];
    const pages = workspace.querySelectorAll('.page');
    let domModified = false;

    // --- PHASE 1: LEARN (Identify Reference Styles) ---
    const referenceStyles: StyleSignature[] = [];
    
    // We only care about H1, H2, H3 for structure mostly
    ['h1', 'h2', 'h3'].forEach(tag => {
        const exemplar = workspace.querySelector(tag) as HTMLElement;
        if (exemplar) {
            const style = window.getComputedStyle(exemplar);
            referenceStyles.push({
                tagName: tag,
                fontSize: parseFloat(style.fontSize),
                fontWeight: parseWeight(style.fontWeight),
                color: style.color
            });
        }
    });

    // --- PHASE 2: SCAN & MATCH ---
    pages.forEach((page, pageIndex) => {
        // Get all relevant blocks
        const nodes = page.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div.mission-box');
        
        nodes.forEach((el, index) => {
            const element = el as HTMLElement;
            const text = element.innerText.trim();
            if (!text || text.length > 150) return; // Ignore long text

            const tagName = element.tagName.toLowerCase();
            const isExplicit = tagName.startsWith('h');
            
            // Heuristic: Top of Page?
            // Index 0 in querySelectorAll might not be absolute first child if there are BRs or empty text nodes, 
            // but it's the first *content* element we care about.
            // Let's check strict DOM position for stronger signal.
            let isPageTop = false;
            if (element.parentElement === page) {
                let prev = element.previousElementSibling;
                while (prev && (prev.tagName === 'BR' || (prev as HTMLElement).innerText.trim() === '')) {
                    prev = prev.previousElementSibling;
                }
                if (!prev) isPageTop = true;
            }

            const style = window.getComputedStyle(element);
            const fontSize = parseFloat(style.fontSize);
            const fontWeight = parseWeight(style.fontWeight);
            const color = style.color;

            // Match against References
            let matchedRef: string | undefined;
            if (!isExplicit) {
                // Try to find a style match
                const match = referenceStyles.find(ref => 
                    Math.abs(ref.fontSize - fontSize) < 1 && // 1px tolerance
                    Math.abs(ref.fontWeight - fontWeight) < 100 // weight tolerance
                );
                if (match) matchedRef = match.tagName;
            }

            // Visual Prominence Check (if no match found)
            // > 14px Bold OR > 18px Regular
            const isVisuallyProminent = (fontSize > 18) || (fontWeight >= 600 && fontSize > 13);

            if (isExplicit || matchedRef || (isPageTop && isVisuallyProminent)) {
                // Ensure ID
                if (!element.id) {
                    element.id = `struct-${pageIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                    domModified = true;
                }

                // Score Calculation for Fallback Sorting
                let score = fontSize * fontWeight;
                if (isPageTop) score *= 1.5; // Massive boost for start of page (likely Chapter)
                if (matchedRef === 'h1' || tagName === 'h1') score *= 2.0; // Proven H1 style

                candidates.push({
                    element,
                    text,
                    page: pageIndex + 1,
                    tagName,
                    fontSize,
                    fontWeight,
                    color,
                    isExplicit,
                    isPageTop,
                    matchedRef,
                    score
                });
            }
        });
    });

    // --- PHASE 3: CLASSIFY ---
    const entries: StructureEntry[] = [];

    // If we have NO reference styles (user never used H1/H2), we fallback to clustering
    // But if we found matches, we rely on them.
    
    // Group candidates by inferred type
    candidates.forEach(c => {
        const existingStatus = c.element.getAttribute('data-structure-status') as StructureStatus || 'pending';
        if (existingStatus === 'rejected') return;

        let type = c.tagName;

        if (c.isExplicit) {
            type = c.tagName;
        } 
        else if (c.matchedRef) {
            type = `detected-${c.matchedRef}`; // "detected-h1"
        } 
        else if (c.isPageTop) {
            // Unmatched but Top of Page -> Likely Chapter Title (H1) or Section (H2)
            // If it's really big, H1. If smaller, H2.
            // Let's be aggressive: Page Top + Prominent = H1 Candidate usually.
            type = 'detected-h1';
        } 
        else {
            // It was prominent but not matched and not top of page.
            // Infer level from score relative to max score seen?
            // Simple heuristic: 
            // > 24px = H1, > 18px = H2, > 14px = H3
            if (c.fontSize >= 24) type = 'detected-h1';
            else if (c.fontSize >= 18) type = 'detected-h2';
            else type = 'detected-h3';
        }

        entries.push({
            id: c.element.id,
            elementId: c.element.id,
            text: c.text,
            page: c.page,
            type: type,
            status: existingStatus
        });
    });

    return { 
        entries, 
        modifiedHtml: domModified ? workspace.innerHTML : null 
    };
};

// Helper
const parseWeight = (weight: string): number => {
    if (weight === 'bold') return 700;
    if (weight === 'normal') return 400;
    const parsed = parseInt(weight);
    return isNaN(parsed) ? 400 : parsed;
};
