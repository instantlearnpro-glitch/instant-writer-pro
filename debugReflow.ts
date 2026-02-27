import { reflowPages } from './utils/pagination';

export const debugReflow = () => {
    const pages = document.querySelectorAll('.page');
    if (pages.length < 4) return "Not enough pages";
    const page4 = pages[3];

    // Check initial height
    const initialHeight = page4.scrollHeight;

    // We run reflowPages with an enormous budget and check if it makes changes
    const editor = document.querySelector('.editor-workspace');
    if (!editor) return "No editor workspace";

    const startNumPages = pages.length;

    try {
        const hasChanges = reflowPages(editor as HTMLElement, { timeBudgetMs: 50000, maxIterations: 10000 });

        // After reflow, let's see page 4 height again
        const testPage4 = document.querySelectorAll('.page')[3];
        const finalHeight = testPage4 ? testPage4.scrollHeight : -1;

        return JSON.stringify({
            initialHeight,
            hasChanges,
            startNumPages,
            finalNumPages: document.querySelectorAll('.page').length,
            finalHeight
        });
    } catch (e) {
        return JSON.stringify({ error: e.message, stack: e.stack });
    }
}

// Make it global for testing
(window as any).debugReflow = debugReflow;
