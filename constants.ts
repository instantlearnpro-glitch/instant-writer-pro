
export const DEFAULT_CSS = `
@page {
    size: 8.5in 11in;
    margin: 0.5in 0.5in 0.5in 0.45in;
}

* {
    box-sizing: border-box;
}

.page {
    width: 8.5in;
    height: 11in;
    min-height: 11in;
    max-height: 11in;
    padding: calc(0.5in + var(--header-reserve, 0in)) 0.5in calc(0.5in + var(--footer-reserve, 0in)) 0.45in;
    margin: 0 auto 0.5in auto;
    position: relative;
    background: #fff;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden;
}

/* Ensure images fit within the page */
img {
    max-width: 100%;
    height: auto;
    transition: filter 0.2s ease;
}

/* Style for broken images - visible to user so they can click to fix */
img:not([src]), img[src=""], img.broken-image {
    display: inline-block;
    min-width: 100px;
    min-height: 100px;
    background-color: #f3f4f6;
    border: 2px dashed #9ca3af;
    position: relative;
    content: "Image Not Found (Click to Fix)";
    text-align: center;
    line-height: 100px;
    color: #6b7280;
    font-size: 12px;
    font-family: sans-serif;
}

h1, .book-title {
    font-family: 'Black Ops One', cursive;
    font-size: 28pt;
    text-transform: uppercase;
    text-align: center;
    letter-spacing: 3px;
    margin-bottom: 15px;
    line-height: 1.2;
    margin-top: 0;
}

h2 {
    font-family: 'Roboto', sans-serif;
    font-size: 18pt;
    font-weight: 700;
    margin-top: 20px;
    margin-bottom: 10px;
}

h3, .book-subtitle {
    font-family: 'Roboto', sans-serif;
    font-size: 14pt;
    font-weight: 700;
    font-style: italic;
    margin-bottom: 15px;
    color: #444;
}

p {
    font-family: 'Roboto', sans-serif;
    font-size: 12pt;
    line-height: 1.5;
    margin-bottom: 10px;
}

/* Horizontal rules - make them interactive */
hr {
    border: none;
    border-top: 1px solid #000;
    margin: 15px 0;
    cursor: pointer;
    min-height: 10px;
    padding: 5px 0;
    background: transparent;
}

hr:hover {
    background-color: rgba(141, 85, 241, 0.12);
}

hr:focus, hr[data-selected="true"] {
    outline: 2px dashed #8d55f1;
    outline-offset: 2px;
}

/* --- Shapes --- */
.shape-circle {
    border-radius: 50%;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1;
    width: fit-content;
    margin: 10px auto;
    min-width: 100px;
    min-height: 100px;
    background-color: var(--shape-bg, #fff);
    border: 2px solid var(--shape-border, #000);
    overflow-wrap: break-word; /* Ensure text wraps */
    cursor: pointer;
}

.shape-pill {
    border-radius: 9999px;
    width: fit-content;
    padding-left: 20px;
    padding-right: 20px;
    margin: 10px auto;
    text-align: center;
    background-color: var(--shape-bg, #fff);
    border: 2px solid var(--shape-border, #000);
    overflow-wrap: break-word;
    cursor: pointer;
}

.shape-speech {
    border-radius: 15px;
    width: fit-content;
    margin: 10px 10px 10px 20px;
    position: relative;
    background-color: var(--shape-bg, #fff);
    border: 2px solid var(--shape-border, #000);
    overflow-wrap: break-word;
    cursor: pointer;
}
/* Speech bubble tail effect using pseudo-element */
.shape-speech::after {
    content: '';
    position: absolute;
    bottom: -10px;
    left: 20px;
    width: 0;
    height: 0;
    border-left: 10px solid transparent;
    border-right: 10px solid transparent;
    border-top: 10px solid var(--shape-border, #000); /* Matches border color */
    z-index: 1;
}
/* Inner triangle to hide border and make it look like outline */
.shape-speech::before {
    content: '';
    position: absolute;
    bottom: -7px; /* Adjusted for better overlap */
    left: 22px;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid var(--shape-bg, #fff); /* Matches background */
    z-index: 2;
}

.shape-cloud {
    clip-path: url(#cloud-shape);
    background-color: #efe5ff; /* Light lilac for cloud shape */
    border: none;
    position: relative;
    width: fit-content;
    text-align: center;
    margin: 20px auto;
    padding: 50px 60px; /* Adjust padding for the new shape */
    box-sizing: border-box; /* Ensure padding is included in the element's total width and height */
    overflow-wrap: break-word;
    cursor: pointer;
}
/* Making it bumpy is hard with just CSS on the element itself without breaking text flow. 
   We stick to a rounded box with a "cartoon" thick border and shadow for reliability. */

.mission-box {
    border: 2px solid #000;
    padding: 15px 20px;
    margin: 20px 0;
    background: #fafafa;
    /* font-family removed to preserve user selection */
    overflow-wrap: break-word;
    cursor: pointer;
    box-sizing: border-box;
}

.shape-rectangle {
    /* Identical to mission-box, ensures specific targeting works */
    border: 2px solid #000;
    padding: 15px 20px;
    margin: 20px 0;
    background: #fafafa;
    overflow-wrap: break-word;
    cursor: pointer;
    box-sizing: border-box;
}

/* Allow shapes to be inline-block when applied to spans (text selection) */
span.mission-box, span.shape-circle, span.shape-pill, span.shape-speech, span.shape-cloud, span.shape-rectangle {
    display: inline-block;
    margin: 5px; /* Smaller margin for inline flow */
    vertical-align: middle;
    width: auto; /* Allow auto width */
}

.tracing-line {
    font-family: 'Courier Prime', monospace;
    font-size: 20pt;
    color: #b9a7e6;
    letter-spacing: 6px;
    min-height: 50px;
    line-height: 50px;
    background-image: linear-gradient(#8d55f1 1px, transparent 1px);
    background-size: 100% 50px;
    background-position: 0 48px;
    background-repeat: repeat-y;
    margin-bottom: 10px;
    cursor: text;
    user-select: text;
    -webkit-user-select: text;
}

.tracing-line:empty::before {
    content: '\\00a0';
    color: transparent;
}

/* Writing lines (textarea for handwriting practice) */
.writing-lines, textarea.writing-lines {
    width: 100%;
    min-height: 50px;
    font-family: 'Courier Prime', monospace;
    font-size: 20pt;
    color: #333;
    border: none;
    outline: none;
    resize: vertical;
    background-image: linear-gradient(#8d55f1 1px, transparent 1px), linear-gradient(#dbc9ff 1px, transparent 1px);
    background-size: 100% 50px;
    background-position: 0 48px, 0 24px;
    line-height: 50px;
    padding: 0;
    cursor: text;
}

.writing-lines:focus, textarea.writing-lines:focus {
    outline: 2px solid #8d55f1;
    outline-offset: 2px;
}

.writing-lines:hover, textarea.writing-lines:hover {
    background-color: rgba(141, 85, 241, 0.03);
}

/* Floating text layer (free position) */
.floating-text {
    position: absolute;
    z-index: 5;
    min-width: 120px;
    min-height: 24px;
    padding: 2px 4px;
    background: transparent;
    outline: none;
}

.floating-text:focus {
    outline: 1px dashed #8d55f1;
    outline-offset: 2px;
}

/* --- Table of Contents Styles --- */
.toc-container {
    padding: 20px;
    margin-bottom: 20px;
    font-family: 'Roboto', sans-serif;
    box-sizing: border-box;
    max-width: 100%;
    --toc-dot-gap: 6px;
    position: relative;
    overflow: visible;
}


.toc-table {
    width: 100% !important;
    border-collapse: collapse !important;
    table-layout: fixed !important;
    border: none !important;
}

.toc-table td {
    padding: 4px 0 !important;
    vertical-align: baseline !important;
    border: none !important;
}

.toc-col-title { width: 65%; }
.toc-col-leader { width: 30%; }
.toc-col-page { width: 5ch; }

.toc-title-cell {
    overflow: hidden;
    padding-right: 10px;
}

.toc-title-cell a {
    text-decoration: none;
    color: inherit;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toc-text {
    display: inline-block;
    background: #fff;
    padding-right: 6px;
}

.toc-leader-cell {
    background: transparent;
    height: 0.9em;
    padding: 0 8px;
}

.toc-page-cell {
    text-align: right;
    white-space: nowrap;
    padding-left: 10px;
}

/* Indentation levels */
.toc-h1 { font-weight: bold; }
.toc-h2 .toc-title-cell { padding-left: 20px; font-size: 0.95em; }
.toc-h3 .toc-title-cell { padding-left: 40px; font-size: 0.9em; font-style: italic; }

/* Classic: no leaders */
.toc-style-classic .toc-leader-cell { background: none; }
.toc-style-classic .toc-page-cell { font-weight: bold; }
.toc-style-classic .toc-col-leader { width: 0 !important; }

/* Modern: solid line leader */
.toc-style-modern { background: #f8f9fa; border-left: 4px solid #333; }
.toc-style-modern .toc-leader-cell { border-bottom: 1px solid #e2e5ea; }
.toc-style-modern .toc-text { background: #f8f9fa; }
.toc-style-modern .toc-page-cell { background: #f8f9fa; }

/* Dotted: dotted leader */
.toc-style-dotted .toc-leader-cell {
    border-bottom: 2px dotted #9ca3af;
}

/* --- Page Footer (Numbering) --- */
.page-footer {
    position: absolute;
    bottom: 0.4in; /* Inside the bottom margin */
    left: 0;
    width: 100%;
    text-align: center;
    pointer-events: auto; /* Allow interaction */
    color: #000;
}
.page-footer:hover {
    outline: 2px dashed #f97316;
    cursor: pointer;
}

/* List Styles - Override Tailwind Reset */
ul {
    list-style: disc outside none !important;
    margin-left: 0 !important;
    padding-left: 40px !important;
}
ol {
    list-style: decimal outside none !important;
    margin-left: 0 !important;
    padding-left: 40px !important;
}
li {
    display: list-item !important;
    margin-bottom: 5px;
    padding-left: 5px;
}
`;

export const DEFAULT_HTML = `
<div class="page">
    <h1 class="book-title">TOP SECRET MISSION</h1>
    <h3 class="book-subtitle">Operation: Creative Writing</h3>
    <hr style="width: 50%; margin: 20px auto; border-top: 2px solid #000;">
    <p>Welcome, Agent. Your mission, should you choose to accept it, is to write a compelling story using the tools provided.</p>
    <div class="mission-box">
        <strong>OBJECTIVE 1:</strong> Replace this text with your opening paragraph.
    </div>
    <p>Good luck.</p>
</div>
`;

// Official margin values based on page count
// Pages 110-150: gutter (inside) values
// Pages 151-200: larger gutter values
// Format: { top, bottom, left (gutter/inside), right (outside) }
export const PAGE_FORMATS = {
  LETTER: {
    id: 'letter',
    name: 'US Letter (8.5" x 11")',
    width: '8.5in',
    height: '11in',
    // 110-150 pages: gutter 0.45", outside 0.5", top/bottom 0.5"
    margins: { top: 0.5, bottom: 0.5, left: 0.45, right: 0.5 }
  },
  LETTER_THICK: {
    id: 'letter-thick',
    name: 'US Letter 151-200pp (8.5" x 11")',
    width: '8.5in',
    height: '11in',
    // 151-200 pages: gutter 0.5", outside 0.5", top/bottom 0.5"
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
  },
  TRADE: {
    id: '6x9',
    name: 'Trade 110-150pp (6" x 9")',
    width: '6in',
    height: '9in',
    // 110-150 pages: gutter 0.375", outside 0.25", top/bottom 0.5"
    margins: { top: 0.5, bottom: 0.5, left: 0.375, right: 0.25 }
  },
  TRADE_THICK: {
    id: '6x9-thick',
    name: 'Trade 151-200pp (6" x 9")',
    width: '6in',
    height: '9in',
    // 151-200 pages: gutter 0.5", outside 0.25", top/bottom 0.5"
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.25 }
  },
  CUSTOM: {
    id: 'custom',
    name: 'Custom Size',
    width: '8.5in',
    height: '11in',
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
  }
};  
  export const FONTS = [
    { name: 'Default', value: 'inherit' },
    // App Specific
    { name: 'Courier Prime', value: "'Courier Prime', monospace" },
    { name: 'Black Ops One', value: "'Black Ops One', cursive" },
    { name: 'Lobster', value: "'Lobster', cursive" },
    // Sans Serif
    { name: 'Arial', value: "Arial, Helvetica, sans-serif" },
    { name: 'Arial Black', value: "'Arial Black', Gadget, sans-serif" },
    { name: 'Verdana', value: "Verdana, Geneva, sans-serif" },
    { name: 'Tahoma', value: "Tahoma, Geneva, sans-serif" },
    { name: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
    { name: 'Impact', value: "Impact, Charcoal, sans-serif" },
    { name: 'Helvetica', value: "Helvetica, Arial, sans-serif" },
    { name: 'Optima', value: "Optima, Segoe, 'Segoe UI', Candara, Calibri, Arial, sans-serif" },
    { name: 'Segoe UI', value: "'Segoe UI', Frutiger, 'Frutiger Linotype', 'Dejavu Sans', 'Helvetica Neue', Arial, sans-serif" },
    // Serif
    { name: 'Times New Roman', value: "'Times New Roman', Times, serif" },
    { name: 'Didot', value: "Didot, 'Didot LT STD', 'Hoefler Text', Garamond, 'Times New Roman', serif" },
    { name: 'Georgia', value: "Georgia, serif" },
    { name: 'American Typewriter', value: "'American Typewriter', serif" },
    // Monospace
    { name: 'Andale Mono', value: "'Andale Mono', monospace" },
    { name: 'Courier', value: "Courier, monospace" },
    { name: 'Lucida Console', value: "'Lucida Console', Monaco, monospace" },
    { name: 'Monaco', value: "Monaco, Consolas, 'Lucida Console', monospace" },
    // Fantasy / Cursive
    { name: 'Bradley Hand', value: "'Bradley Hand', cursive" },
    { name: 'Brush Script MT', value: "'Brush Script MT', cursive" },
    { name: 'Luminari', value: "Luminari, fantasy" },
    { name: 'Comic Sans MS', value: "'Comic Sans MS', cursive, sans-serif" },
    // Google Fonts / Web Standards (if available)
    { name: 'Roboto', value: "'Roboto', sans-serif" },
    { name: 'Open Sans', value: "'Open Sans', sans-serif" },
    { name: 'Lato', value: "'Lato', sans-serif" },
    { name: 'Montserrat', value: "'Montserrat', sans-serif" },
    { name: 'Oswald', value: "'Oswald', sans-serif" },
    { name: 'Source Sans Pro', value: "'Source Sans Pro', sans-serif" },
    { name: 'Slabo 27px', value: "'Slabo 27px', serif" },
    { name: 'Raleway', value: "'Raleway', sans-serif" },
    { name: 'PT Sans', value: "'PT Sans', sans-serif" },
    { name: 'Merriweather', value: "'Merriweather', serif" },
    { name: 'Noto Sans', value: "'Noto Sans', sans-serif" },
    { name: 'Nunito', value: "'Nunito', sans-serif" },
    { name: 'Concert One', value: "'Concert One', cursive" },
    { name: 'Prompt', value: "'Prompt', sans-serif" },
    { name: 'Work Sans', value: "'Work Sans', sans-serif" }
  ];
