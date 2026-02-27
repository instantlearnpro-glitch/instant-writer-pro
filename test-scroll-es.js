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
      .overflowing {
        height: 0.3in; background: lightgreen; margin-bottom: 2in;
      }
      .tall {
        height: 3in; background: lightcoral;
      }
      .page-flow-root {
        width: 8.5in; height: 11in; padding: 0.75in;
        background: white; border: 1px solid black;
        box-sizing: border-box;
        display: flow-root;
        overflow: visible;
      }
    </style>
    </head>
    <body>
      <div class="page" id="page1" style="overflow: hidden;">
        <div class="child"></div>
        <div class="overflowing"></div>
      </div>
      <div class="page" id="page2" style="overflow: hidden;">
        <div class="child"></div>
        <div class="tall"></div>
      </div>
      <div class="page-flow-root" id="page1-vis">
        <div class="child"></div>
        <div class="overflowing"></div>
      </div>
      <div class="page-flow-root" id="page2-vis">
        <div class="child"></div>
        <div class="tall"></div>
      </div>
    </body>
    </html>
  `);

    const results = await page.evaluate(() => {
        const p1 = document.getElementById('page1');
        const p2 = document.getElementById('page2');
        const p1v = document.getElementById('page1-vis');
        const p2v = document.getElementById('page2-vis');

        return {
            p1: { scrollHeight: p1.scrollHeight, clientHeight: p1.clientHeight },
            p2: { scrollHeight: p2.scrollHeight, clientHeight: p2.clientHeight },
            p1v: { scrollHeight: p1v.scrollHeight, clientHeight: p1v.clientHeight },
            p2v: { scrollHeight: p2v.scrollHeight, clientHeight: p2v.clientHeight },
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
