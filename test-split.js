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
        <div style="height: 6in; background: #eee;">Filler</div>
        <div class="child-area" id="wrapper">
          <h3 id="h3">Scale It (Ages 4/8/12)</h3>
          <div class="box-scale-it" id="box">
            <p id="p1" style="height: 20in; background: lightblue;">Child 1</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);

    const results = await page.evaluate(() => {
        const isHardKeepTogether = (el) => {
            if (el.matches('h1, h2, h3, h4, h5, h6')) return true;
            if (el.tagName === 'IMG' || el.tagName === 'FIGURE') return true;
            if (el.classList.contains('keep-together') || el.style.breakInside === 'avoid' || el.style.pageBreakInside === 'avoid') return true;
            const style = window.getComputedStyle(el);
            if (style.breakInside === 'avoid' || style.pageBreakInside === 'avoid') return true;
            return false;
        };

        const shouldAvoidBreak = (el) => {
            if (isHardKeepTogether(el)) return true;
            const textContent = el.textContent || '';
            const isWrapper = el.tagName === 'DIV' || el.tagName === 'SECTION' || el.tagName === 'ARTICLE';
            const shortText = textContent.trim().length > 0 && textContent.length < 200;
            const singleBlockChild = el.children.length === 1 && el.firstElementChild && window.getComputedStyle(el.firstElementChild).display === 'block';
            if (isWrapper && shortText && singleBlockChild) return true;
            return false;
        };

        return {
            wrapperAvoid: shouldAvoidBreak(document.getElementById('wrapper')),
            boxAvoid: shouldAvoidBreak(document.getElementById('box')),
            p1Avoid: shouldAvoidBreak(document.getElementById('p1'))
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
