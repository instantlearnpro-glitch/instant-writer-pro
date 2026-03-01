import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

// Simple implementation of what PatternDetector is doing under the hood
const html = readFileSync('/Users/ari/Downloads/OOK3.html', 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

function getElementSignature(el: Element) {
    const htmlEl = el as unknown as HTMLElement;
    const computed = dom.window.getComputedStyle(htmlEl);
    return `${el.tagName}|${computed.fontSize}|${computed.fontWeight}|${computed.color}`;
}

const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, .mission-box span, span'));

const signatures = new Map<string, number>();
const sampleText = new Map<string, string>();

for (const h of headers) {
    // Only check short header-like things
    if (h.textContent && h.textContent.length < 150 && h.textContent.trim().length > 0) {
        const sig = getElementSignature(h);
        signatures.set(sig, (signatures.get(sig) || 0) + 1);

        if (!sampleText.has(sig)) {
            sampleText.set(sig, h.textContent.trim().substring(0, 30));
        }
    }
}

console.log("=== Signature Patterns Found ===");
for (const [sig, count] of signatures.entries()) {
    if (count > 2) { // Show recurrent patterns
        console.log(`\nSignature: ${sig}`);
        console.log(`Count: ${count}`);
        console.log(`Sample: "${sampleText.get(sig)}"`);
    }
}
