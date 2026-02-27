const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
    <style>
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
        height: 0.3in; background: lightgreen; margin-bottom: 1in;
      }
      .abs {
        position: absolute; top: 10.5in; height: 1in;
      }
    </style>
    </head>
    <body>
      <div class="page" id="page1">
        <div class="child"></div>
        <div class="overflowing"></div>
      </div>
      <div class="page" id="page2">
        <div class="child"></div>
        <div class="abs"></div>
      </div>
      <div class="page" id="page3">
        <div style="column-count: 2; height: 9.5in;">
            <div style="height: 10in; background: red;"></div>
        </div>
      </div>
    </body>
    </html>
  `);

    const results = await page.evaluate(() => {
        const p1 = document.getElementById('page1');
        const p2 = document.getElementById('page2');
        const p3 = document.getElementById('page3');

        return {
            p1: { scrollHeight: p1.scrollHeight, clientHeight: p1.clientHeight },
            p2: { scrollHeight: p2.scrollHeight, clientHeight: p2.clientHeight },
            p3: { scrollHeight: p3.scrollHeight, clientHeight: p3.clientHeight },
        };
    });

    console.log(results);
    await browser.close();
})();
