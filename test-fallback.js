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
        const wrapper = document.getElementById('wrapper');
        const box = document.getElementById('box');
        
        let msg = '';
        const isSplitContainer = (el) => {
            const tag = el.tagName.toLowerCase();
            return ['div', 'section', 'article', 'main'].includes(tag);
        };

        if (isSplitContainer(wrapper) && wrapper.children.length > 1) {
             msg = 'Will forcefully move the last child out of the container to break the logjam.';
        } else {
             msg = 'Will return false - truly unsplittable';
        }

        return {
            msg,
            wrapperChildrenLength: wrapper.children.length,
            boxChildrenLength: box.children.length
        };
    });

    console.log(JSON.stringify(results, null, 2));
    await browser.close();
})();
