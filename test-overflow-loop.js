import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      body { margin: 0; }
      .page {
        width: 8.5in; height: 11in; padding: 0.75in;
        background: white; border: 1px solid black;
        box-sizing: border-box;
      }
      .child-area { margin-bottom: 1em; }
      .box-scale-it {
        background: #E0F7FA;
        border-left: 5px solid #00838F;
        padding: 0.8em 1em;
        margin: 1em 0;
        border-radius: 0 6px 6px 0;
      }
    </style>
    </head>
    <body>
      <div class="page" id="page1">
        <div style="height: 8.5in; background: #eee;">Filler</div>
        <div class="child-area" id="wrapper">
          <h3 id="h3">Scale It (Ages 4/8/12)</h3>
          <div class="box-scale-it" id="box">
            <p id="p1" style="height: 2in; background: lightblue;">Child 1</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);

    const results = await page.evaluate(() => {
        const p1 = document.getElementById('page1');
        const wrapper = document.getElementById('wrapper');
        const box = document.getElementById('box');
        
        const computed = window.getComputedStyle(p1);
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const pageBottom = p1.getBoundingClientRect().bottom - paddingBottom;
        
        const isFlowElement = (el) => {
            if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
            if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.tagName === 'LINK') return false;
            if (el.classList.contains('page-footer') || el.classList.contains('drag-handle') || el.id === 'caret-cursor') return false;
            const style = window.getComputedStyle(el);
            if (style.position === 'absolute' || style.position === 'fixed') return false;
            // Ignore tiny elements
            if (el.getBoundingClientRect().height < 1 && el.getBoundingClientRect().width < 1) return false;
            return true;
        };

        const getLastOverflowingFlowChild = (parent, pBottom) => {
            const els = Array.from(parent.children);
            for (let i = els.length - 1; i >= 0; i--) {
                const el = els[i];
                if (!isFlowElement(el)) continue;
                
                // Get accurate dimensions considering margins
                const style = window.getComputedStyle(el);
                const mb = parseFloat(style.marginBottom) || 0;
                const rect = el.getBoundingClientRect();
                const bottom = rect.bottom + mb;

                if (bottom > pBottom + 1) {
                    return el;
                }
            }
            return null;
        };

        return {
            pageBottom,
            overflowTargetId: getLastOverflowingFlowChild(p1, pageBottom)?.id,
            wrapperBottom: wrapper.getBoundingClientRect().bottom + parseFloat(window.getComputedStyle(wrapper).marginBottom || 0),
            boxBottom: box.getBoundingClientRect().bottom + parseFloat(window.getComputedStyle(box).marginBottom || 0)
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
