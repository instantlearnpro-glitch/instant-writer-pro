import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('/Users/ari/Downloads/SYSTEMATIC_THEOLOGY_FOR_KIDS.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// Mock enough DOM methods for pagination to work
window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { top: 0, bottom: 2000, height: 2000, left: 0, right: 800, width: 800 };
};
Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { get: function () { return 2000; } });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get: function () { return 1000; } });

// ... this is too complex to mock completely. It's better to log from the browser or use playwright.
