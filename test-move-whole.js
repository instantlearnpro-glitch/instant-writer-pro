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
      <div id="editor">
          <div class="page" id="page1">
            <div style="height: 6in; background: #eee;">Filler</div>
            <div class="child-area" id="wrapper">
              <h3 id="h3">Scale It (Ages 4/8/12)</h3>
              <div class="box-scale-it" id="box">
                <p id="p1" style="height: 20in; background: lightblue;">Child 1</p>
              </div>
            </div>
          </div>
      </div>
    </body>
    </html>
  `);

    const results = await page.evaluate(() => {
        const p1 = document.getElementById('page1');
        const wrapper = document.getElementById('wrapper');
        const editor = document.getElementById('editor');
        const pages = [p1];

        // Simulate "Move WHOLE element to next page"
        let nextPage = pages[1];
        if (!nextPage) {
            nextPage = document.createElement('div');
            nextPage.className = 'page';
            editor.appendChild(nextPage);
            pages.push(nextPage);
        }

        const getMatchingContainer = (container, tp) => null; // Simplify for test
        
        const breakMarker = null;
        let method = '';
        if (breakMarker && breakMarker.parentElement === nextPage) {
            nextPage.insertBefore(wrapper, breakMarker.nextSibling);
            method = 'marker';
        } else if (nextPage.firstChild) {
            nextPage.insertBefore(wrapper, nextPage.firstChild);
            method = 'firstChild';
        } else {
            nextPage.appendChild(wrapper);
            method = 'appendChild';
        }

        return {
            method,
            wrapperParentId: wrapper.parentElement.id,
            pagesLength: pages.length,
            p1Children: p1.children.length,
            p2Children: pages[1].children.length
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
