import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('/Users/ari/Downloads/BOOK_FINAL.html', 'utf8');

const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    resources: 'usable'
});

const window = dom.window;
const document = window.document;

// Mock window/document properties
window.getComputedStyle = element => {
    return {
        display: element.tagName === 'SPAN' || element.tagName === 'A' || element.tagName === 'EM' || element.tagName === 'STRONG' || element.tagName === 'IMG' ? 'inline' : (element.tagName === 'DIV' || element.tagName === 'P' || element.tagName === 'H1' || element.tagName === 'H2' || element.tagName === 'H3' || element.tagName === 'H4' ? 'block' : 'inline'),
        position: 'static',
        marginTop: '0px',
        marginBottom: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        borderTopWidth: '0px',
        borderBottomWidth: '0px',
        lineHeight: '1.5',
    };
};

// ... we need to mock pagination.ts functions properly.
// Let's just import them using esbuild/ts-node.
