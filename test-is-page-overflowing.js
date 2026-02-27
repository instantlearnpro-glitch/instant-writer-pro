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
        overflow: hidden;
      }
      .child {
        height: 9.3in; background: lightblue;
      }
      .tall {
        height: 3in; background: lightcoral; margin-bottom: 1in;
      }
    </style>
    </head>
    <body>
      <div class="page" id="page1" style="overflow: hidden;">
        <div class="child"></div>
        <div class="tall" id="tall"></div>
      </div>
    </body>
    </html>
  `);

    const results = await page.evaluate(() => {
        const p1 = document.getElementById('page1');
        const scale = 1;

        // Simulate withPageOverflowVisible
        p1.style.display = 'flow-root';
        p1.style.overflow = 'visible';
        p1.style.maxHeight = 'none';
        void p1.offsetHeight;

        const contentScrollHeight = p1.scrollHeight;
        const pageClientHeight = p1.clientHeight; // wait, if overflow is visible, what is clientHeight?
        const computed = window.getComputedStyle(p1);
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;

        const innerPageBottom = p1.getBoundingClientRect().bottom - paddingBottom;

        let overflowEl = null;
        const tall = document.getElementById('tall');
        const style = window.getComputedStyle(tall);
        const mb = parseFloat(style.marginBottom) || 0;
        const bottom = tall.getBoundingClientRect().bottom + mb;

        if (bottom > innerPageBottom + 1) {
            overflowEl = tall.id;
        }

        return {
            scrollHeight: contentScrollHeight,
            clientHeight: pageClientHeight,
            innerPageBottom,
            tallBottom: bottom,
            overflowEl,
            rectBottom: p1.getBoundingClientRect().bottom
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
