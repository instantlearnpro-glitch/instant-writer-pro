
export const DEFAULT_CSS = `
@page {
    size: 8.5in 11in;
    margin: 0.6in;
}

* {
    box-sizing: border-box;
}

.page {
    width: 8.5in;
    min-height: 11in;
    padding: 0.6in;
    margin: 0 auto 0.5in auto;
    position: relative;
    background: #fff;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    overflow: hidden; /* Prevent floating elements from breaking layout */
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

/* --- Shapes --- */
.shape-circle {
    border-radius: 50% !important;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1;
    width: fit-content;
    margin: 10px auto;
    min-width: 100px;
    min-height: 100px;
    background-color: #fff; /* Default to white for visibility */
}

.shape-pill {
    border-radius: 9999px !important;
    width: fit-content;
    padding-left: 20px !important;
    padding-right: 20px !important;
    margin: 10px auto;
    text-align: center;
    background-color: #fff;
}

.shape-speech {
    border-radius: 15px !important;
    width: fit-content;
    margin: 10px 10px 10px 20px;
    position: relative;
    background-color: #fff;
    border: 2px solid #000;
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
    border-top: 10px solid #000; /* Matches border color if black */
    z-index: 1;
}
/* Inner triangle to hide border and make it look like outline */
.shape-speech::before {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 22px;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid #fff; /* Matches background */
    z-index: 2;
}

.shape-cloud {
    clip-path: path("M 209.78 176.49 C199.27,178.97 190.51,177.99 181.62,173.35 C177.98,171.45 177.38,171.41 171.62,172.77 C159.80,175.54 148.20,173.46 138.85,166.87 C135.49,164.51 134.14,164.52 131.56,166.93 C127.70,170.54 118.23,174.78 111.23,176.03 C101.76,177.72 93.00,175.63 83.56,169.43 C79.85,166.99 76.17,165.00 75.39,165.00 C74.61,165.00 71.29,165.74 68.02,166.65 C62.50,168.19 61.60,168.19 55.42,166.66 C42.94,163.58 33.05,153.32 30.78,141.08 C29.82,135.94 28.93,134.32 24.48,129.61 C17.68,122.42 14.67,114.66 14.78,104.57 C14.97,85.86 27.89,72.09 46.99,70.23 L 54.48 69.50 L 55.13 64.91 C56.03,58.63 60.55,49.44 65.26,44.34 C72.58,36.39 82.61,32.15 96.16,31.27 C107.50,30.54 125.78,36.89 132.40,43.86 L 135.29 46.91 L 139.63 43.10 C144.58,38.74 153.64,35.10 161.59,34.28 C169.27,33.49 178.57,36.22 186.66,41.64 L 193.21 46.03 L 196.35 44.09 C204.41,39.13 216.87,36.95 226.05,38.91 C229.05,39.55 234.65,41.89 238.50,44.12 C251.30,51.51 258.89,64.33 258.98,78.69 C259.00,82.78 259.15,82.96 264.94,86.05 C278.93,93.51 285.99,108.07 283.13,123.60 C281.62,131.79 278.76,136.86 271.79,143.70 C264.10,151.26 256.57,154.46 246.71,154.34 L 238.93 154.25 L 235.99 158.52 C232.43,163.69 224.84,170.52 219.78,173.11 C217.74,174.15 213.24,175.67 209.78,176.49 Z");
    background-color: #e0f2f7; /* Light blue for cloud */
    border: 1px solid #a7d9ed; /* Lighter border */
    box-shadow: 2px 2px 5px rgba(0,0,0,0.1); /* Softer shadow */
    position: relative;
    width: fit-content;
    text-align: center;
    margin: 20px auto;
    padding: 50px 60px; /* Adjust padding for the new shape */
    box-sizing: border-box; /* Ensure padding is included in the element's total width and height */
}
/* Making it bumpy is hard with just CSS on the element itself without breaking text flow. 
   We stick to a rounded box with a "cartoon" thick border and shadow for reliability. */

.mission-box {
    border: 2px solid #000;
    padding: 15px 20px;
    margin: 20px 0;
    background: #fafafa;
    font-family: 'Roboto', sans-serif;
}

.tracing-line {
    font-family: 'Courier Prime', monospace;
    font-size: 20pt;
    color: #aaa;
    letter-spacing: 6px;
    height: 50px;
    line-height: 50px;
    background-image: linear-gradient(#000 1px, transparent 1px);
    background-size: 100% 50px;
    background-position: 0 48px;
    background-repeat: repeat-y;
    margin-bottom: 10px;
}

/* --- Table of Contents Styles --- */
.toc-container {
    padding: 20px;
    margin-bottom: 20px;
    font-family: 'Roboto', sans-serif;
}

.toc-title {
    font-size: 18pt;
    font-weight: bold;
    text-align: center;
    margin-bottom: 20px;
    text-transform: uppercase;
}

.toc-list {
    list-style: none;
    padding: 0;
}

.toc-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
}

.toc-item a {
    text-decoration: none;
    color: inherit;
}

/* Indentation levels */
.toc-h1 { font-weight: bold; margin-top: 10px; }
.toc-h2 { margin-left: 20px; font-size: 0.95em; }
.toc-h3 { margin-left: 40px; font-size: 0.9em; font-style: italic; }

/* Styles */
/* Classic: Simple links */
.toc-style-classic .toc-item {
    border-bottom: none;
}
.toc-style-classic .toc-page {
    font-weight: bold;
}

/* Modern: Clean lines */
.toc-style-modern {
    background: #f8f9fa;
    border-left: 4px solid #333;
}
.toc-style-modern .toc-item {
    padding: 5px 0;
    border-bottom: 1px solid #e9ecef;
}

/* Dotted: Classic book leaders */
.toc-style-dotted .toc-item a {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
}
.toc-style-dotted .toc-item a::after {
    content: " . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ";
    color: #999;
    margin-left: 5px;
}
.toc-style-dotted .toc-page {
    flex-shrink: 0;
    margin-left: 5px;
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

export const PAGE_FORMATS = {
  LETTER: { 
    id: 'letter', 
    name: 'US Letter (8.5" x 11")', 
    width: '8.5in', 
    height: '11in', 
    margin: '0.6in' 
  },
  TRADE: { 
    id: 'trade', 
    name: 'Trade (6" x 9")', 
    width: '6in', 
    height: '9in', 
    margin: '0.5in' 
  }
};
