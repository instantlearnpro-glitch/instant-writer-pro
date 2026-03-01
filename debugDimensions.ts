import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// We want to load OOK3.html and see if there are any inline styles or tags that enforce width.
const html = readFileSync('/Users/ari/Downloads/OOK3.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

console.log("=== CHECKING FOR FIXED WIDTHS ===");
let hasFixedWidths = false;
document.querySelectorAll('*').forEach(el => {
    const htmlEl = el as unknown as HTMLElement;
    // Check style
    if (htmlEl.style && htmlEl.style.width) {
        if (htmlEl.style.width.includes('px') || htmlEl.style.width.includes('in')) {
            const tag = htmlEl.tagName;
            // Ignore the page wrapper itself since we override it
            if (!htmlEl.classList.contains('page')) {
                console.log(`Found fixed width on <${tag}>: ${htmlEl.style.width}`);
                hasFixedWidths = true;
            }
        }
    }

    // Check width attribute (e.g., <td width="500"> or <hr width="50%">)
    if (el.hasAttribute('width')) {
        const w = el.getAttribute('width');
        if (w && !w.includes('%')) {
            console.log(`Found width attribute on <${el.tagName}>: ${w}`);
            hasFixedWidths = true;
        }
    }
});

console.log("=== CHECKING FOR CSS WHITE-SPACE OR MIN-WIDTH ===");
document.querySelectorAll('*').forEach(el => {
    const htmlEl = el as unknown as HTMLElement;
    if (htmlEl.style) {
        if (htmlEl.style.whiteSpace === 'nowrap' || htmlEl.style.whiteSpace === 'pre') {
            console.log(`Found non-wrapping text on <${htmlEl.tagName}>`);
            hasFixedWidths = true;
        }
        if (htmlEl.style.minWidth) {
            console.log(`Found minWidth on <${htmlEl.tagName}>: ${htmlEl.style.minWidth}`);
            hasFixedWidths = true;
        }
    }
});

if (!hasFixedWidths) {
    console.log("No inline fixed widths found inside the body (excluding .page). The overflow must be caused by something else, like a CSS class in the <style> block.");
}
