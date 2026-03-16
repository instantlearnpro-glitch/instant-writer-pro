/**
 * DocumentSanitizer — automatic text cleaning pipeline.
 *
 * Fixes common artefacts from PDF→text, LLM output, copy-paste,
 * OCR and HTML imports.  Runs ON_IMPORT, ON_PASTE, ON_EXPORT —
 * never during live editing.
 *
 * Pipeline order matters — each step expects the output of the previous one.
 */

// ---------------------------------------------------------------------------
// Individual sanitisation rules
// ---------------------------------------------------------------------------

/**
 * Rule 5 — Remove page numbers inserted inside sentences.
 *
 * Typical PDF artefact:
 *   "Recognizing dead tiles also tells you which hands are no\n\n78\n\nlonger possible"
 *
 * Detects a 1-3 digit number on its own line, surrounded by word characters
 * on the lines above and below.  Removes the number and joins with a space.
 *
 * Handles optional blank lines and whitespace around the number.
 */
export const removePageNumberBreaks = (text: string): string => {
    return text.replace(/(\w)\s*\n\s*\d{1,3}\s*\n\s*(\w)/g, '$1 $2');
};

/**
 * Rule 2 — Fix broken sentences caused by line breaks (English).
 *
 * Typical PDF/OCR artefact:
 *   "What suit? What\nnumber? Update your mental\nmap."
 *
 * If a letter is followed by a newline and then a lowercase letter,
 * the newline was almost certainly a soft line-break, not a paragraph break.
 * Replace it with a space.
 */
export const fixBrokenSentences = (text: string): string => {
    return text.replace(/([a-zA-Z])\n([a-z])/g, '$1 $2');
};

/**
 * Rule 6 — Normalize whitespace.
 * Replace runs of 2+ spaces with a single space.
 * Operates on text only — never touches markup or attributes.
 */
export const normalizeWhitespace = (text: string): string => {
    return text.replace(/ {2,}/g, ' ');
};

// ---------------------------------------------------------------------------
// DOM-aware helpers
// ---------------------------------------------------------------------------

/**
 * Walk every text node inside `root` and apply `fn` to its content.
 * Skips <pre>, <code>, <script>, <style> and contenteditable="false" subtrees.
 */
const walkTextNodes = (root: Node, fn: (text: string) => string): void => {
    const SKIP_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'TEXTAREA']);

    const walk = (node: Node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (SKIP_TAGS.has(el.tagName)) return;
            if (el.getAttribute('contenteditable') === 'false') return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            const original = node.textContent ?? '';
            const cleaned = fn(original);
            if (cleaned !== original) {
                node.textContent = cleaned;
            }
            return;
        }

        // Recurse into children (snapshot to avoid live-list mutations)
        const children = Array.from(node.childNodes);
        for (const child of children) {
            walk(child);
        }
    };

    walk(root);
};

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full sanitisation pipeline on an HTML string.
 * Returns the cleaned HTML.
 *
 * The pipeline has two phases:
 *   1. Pre-parse (raw string) — rules that span across elements/lines
 *   2. DOM-aware (text nodes) — rules that operate within individual nodes
 *
 * This guarantees we never corrupt HTML attributes, tag names, or
 * protected content (pre/code).
 */
export const sanitizeDocument = (html: string): string => {
    // --- Phase 1: Raw string rules (cross-element patterns) ---

    // 5. Remove page numbers inside sentences (must run before DOM parse
    //    because the pattern word\n123\nword spans across elements)
    let cleaned = removePageNumberBreaks(html);

    // 2. Fix broken sentences (must run AFTER page-number removal so that
    //    newly-joined text doesn't contain stale line breaks)
    cleaned = fixBrokenSentences(cleaned);

    // --- Phase 2: DOM-aware rules (per text-node) ---

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${cleaned}</body>`, 'text/html');

    // 6. Normalize whitespace (safe, no side-effects)
    walkTextNodes(doc.body, normalizeWhitespace);

    // Future rules will be added here in order:
    // 1. removeOrphanPageNumbers   (with user confirmation)
    // 4. fixMissingSpaces          (with user confirmation)

    return doc.body.innerHTML;
};

// ---------------------------------------------------------------------------
// Interactive detection (user-confirmation rules)
// ---------------------------------------------------------------------------

export interface SanitizeIssue {
    /** Unique id so React can key on it */
    id: string;
    /** The DOM element containing the orphan number */
    element: HTMLElement;
    /** Human-readable preview, e.g. "76" */
    preview: string;
    /** Which page (1-indexed) the issue is on */
    page: number;
    /** Rule identifier */
    rule: 'orphan-page-number' | 'missing-space';
}

/**
 * Rule 1 — Detect orphan page numbers in the live DOM.
 *
 * Looks for elements whose trimmed text content is a 1-3 digit number
 * and nothing else.  Skips headings, list items, table cells, and
 * elements inside styled containers (borders, backgrounds) because
 * those are intentional content.
 *
 * Returns an array of SanitizeIssue objects for user review.
 * Call this on the live workspace AFTER import + reflow.
 */
export const detectOrphanPageNumbers = (workspace: HTMLElement): SanitizeIssue[] => {
    const issues: SanitizeIssue[] = [];
    const SKIP_PARENTS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TH', 'TD', 'LABEL', 'FIGCAPTION']);
    const ORPHAN_RE = /^\s*\d{1,3}\s*$/;

    const allPages = Array.from(workspace.querySelectorAll('.page'));

    // Check all paragraphs, divs, and spans that are direct children of pages
    const candidates = workspace.querySelectorAll('p, div:not(.page):not(.editor-workspace), span');

    candidates.forEach(el => {
        const htmlEl = el as HTMLElement;
        const text = htmlEl.textContent ?? '';

        // Must match the orphan pattern
        if (!ORPHAN_RE.test(text)) return;

        // Skip if inside a heading, list, table, or other structural element
        const parentTag = htmlEl.parentElement?.tagName ?? '';
        if (SKIP_PARENTS.has(htmlEl.tagName) || SKIP_PARENTS.has(parentTag)) return;

        // Skip if the element IS or is INSIDE a footer, page-number, TOC, or styled box
        if (htmlEl.closest('.page-footer, .page-number, footer, [data-page-footer], [data-page-number], .toc-container, .toc-table, [data-toc-target], [data-toc-page], .mission-box, .shape-rectangle')) return;

        // Skip page containers themselves
        if (htmlEl.classList.contains('page') || htmlEl.classList.contains('editor-workspace')) return;

        // Skip if the element has children beyond text (e.g. contains images)
        if (htmlEl.querySelector('img, table, svg')) return;

        // Find which page it's on
        const page = htmlEl.closest('.page');
        let pageNum = 1;
        if (page) {
            allPages.forEach((p, idx) => { if (p === page) pageNum = idx + 1; });
        }

        // Give it a unique ID if it doesn't have one
        if (!htmlEl.id) {
            htmlEl.id = `orphan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        }

        issues.push({
            id: htmlEl.id,
            element: htmlEl,
            preview: text.trim(),
            page: pageNum,
            rule: 'orphan-page-number'
        });
    });

    return issues;
};
