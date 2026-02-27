(() => {
    const runSim = () => {
        const pages = document.querySelectorAll('.page');
        if (pages.length < 4) return "Not enough pages";
        const page = pages[3]; // Page 4

        let report = [];
        let iterations = 0;
        let p = page.cloneNode(true);
        document.body.appendChild(p); // Add to end of body for testing styling
        p.style.position = 'absolute';
        p.style.top = '0';
        p.style.left = '-9999px';

        const scale = 1; // Simplify for isolated test
        const computed = window.getComputedStyle(p);
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        let pageBottom = p.getBoundingClientRect().bottom - paddingBottom;

        while (p.scrollHeight > p.clientHeight + 1 && iterations < 10) {
            iterations++;
            // Re-calc pageBottom
            pageBottom = p.getBoundingClientRect().bottom - paddingBottom;

            const els = Array.from(p.children).filter(child => {
                if (child.classList.contains('page-footer') || child.classList.contains('page-number')) return false;
                const pos = window.getComputedStyle(child).position;
                return pos !== 'absolute' && pos !== 'fixed';
            });

            let overflowEl = null;
            els.forEach(el => {
                const bottom = el.getBoundingClientRect().bottom + (parseFloat(window.getComputedStyle(el).marginBottom) || 0);
                if (bottom > pageBottom + 1) {
                    overflowEl = el;
                }
            });

            if (!overflowEl) {
                report.push(`Iter ${iterations}: No overflowEl found despite scrollHeight ${p.scrollHeight} > clientHeight ${p.clientHeight}`);
                break;
            }

            report.push(`Iter ${iterations}: overflowEl is ${overflowEl.tagName}.${overflowEl.className}. Bottom: ${overflowEl.getBoundingClientRect().bottom}`);

            // Try splitContainerByChildren
            const children = Array.from(overflowEl.children);
            let splitIndex = -1;
            for (let i = 0; i < children.length; i++) {
                if (children[i].getBoundingClientRect().bottom > pageBottom) {
                    splitIndex = i;
                    break;
                }
            }

            if (splitIndex > 0) {
                report.push(`Iter ${iterations}: Split container at index ${splitIndex}/${children.length}. Removing those children.`);
                for (let i = children.length - 1; i >= splitIndex; i--) {
                    children[i].remove();
                }
            } else if (splitIndex === 0) {
                report.push(`Iter ${iterations}: Split index is 0. Cannot split further. Breaking.`);
                break;
            } else {
                report.push(`Iter ${iterations}: Split index is -1. Cannot split children. Breaking.`);
                break;
            }
        }

        report.push(`Final scrollHeight: ${p.scrollHeight}, clientHeight: ${p.clientHeight}`);
        p.remove();
        return JSON.stringify(report, null, 2);
    }
    window.runPageBreakSimLoop = runSim;
})();
