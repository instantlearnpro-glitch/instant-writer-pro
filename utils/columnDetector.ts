/**
 * Auto-detect side-by-side elements and wrap them in .column-row containers.
 * 
 * Algorithm:
 * 1. Find all potential container blocks (bottom-up).
 * 2. Segment children of each container into horizontal "Bands".
 * 3. Inside each Band, cluster elements horizontally into columns.
 * 4. If a Band has >1 column, convert it to a .column-row.
 */

interface BlockInfo {
  el: HTMLElement;
  rect: DOMRect;
}

export function autoDetectColumns(workspace: HTMLElement): number {
  let convertedCount = 0;

  // Find all potential containers (including pages, unwrapped divs)
  // Process bottom-up (deepest first) to handle nested layouts
  const allElements = Array.from(workspace.querySelectorAll('*'));
  const containers = allElements.filter(el => 
    el instanceof HTMLElement && 
    el.children.length >= 2 &&
    !el.closest('.column-row') && // Skip if already inside a column-row
    !['TR', 'TBODY', 'TABLE', 'THEAD', 'UL', 'OL'].includes(el.tagName)
  ).reverse() as HTMLElement[];

  // Also include the page containers themselves just in case they weren't matched
  const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];
  for (const page of pages) {
      if (!containers.includes(page)) {
          containers.push(page);
      }
  }

  for (const container of containers) {
    // Re-check in case a previous iteration modified its parent path
    if (container.closest('.column-row')) continue;
    convertedCount += detectColumnsInContainer(container);
  }

  return convertedCount;
}

function detectColumnsInContainer(container: HTMLElement): number {
  let converted = 0;

  // We consider all non-UI children for band mapping, but we might only convert specific ones.
  const children = Array.from(container.children).filter(
    el => el instanceof HTMLElement &&
      !el.classList.contains('page-footer') &&
      !el.classList.contains('floating-text') &&
      el.tagName !== 'STYLE' &&
      el.tagName !== 'SCRIPT' &&
      el.tagName !== 'BR' &&
      el.tagName !== 'HR'
  ) as HTMLElement[];

  if (children.length < 2) return 0;

  const blocks: BlockInfo[] = children
    .map(el => ({ el, rect: el.getBoundingClientRect() }))
    .filter(b => b.rect.height > 0 && b.rect.width > 0);

  if (blocks.length < 2) return 0;

  // 1. Sort top-to-bottom to create slices (Bands)
  blocks.sort((a, b) => a.rect.top - b.rect.top);

  const bands: BlockInfo[][] = [];
  let currentBand: BlockInfo[] = [blocks[0]];
  let currentBandBottom = blocks[0].rect.bottom;

  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    // If element's top is strictly below the current band's bottom, start a new band
    if (b.rect.top > currentBandBottom - 2) {
      bands.push(currentBand);
      currentBand = [b];
      currentBandBottom = b.rect.bottom;
    } else {
      currentBand.push(b);
      currentBandBottom = Math.max(currentBandBottom, b.rect.bottom);
    }
  }
  bands.push(currentBand);

  // 2. Process each Band and cluster into columns
  for (const band of bands) {
    if (band.length < 2) continue;

    // Filter out naturally full-width or non-convertible items before deciding if it's a multi-col band
    // e.g., if a .column-row is already in the band, we shouldn't wrap it again.
    const convertibleBand = band.filter(b => !b.el.classList.contains('column-row'));
    if (convertibleBand.length < 2) continue;

    // Group the convertible items into horizontal clusters (columns)
    convertibleBand.sort((a, b) => a.rect.left - b.rect.left);

    const columns: BlockInfo[][] = [];
    for (const b of convertibleBand) {
      let placed = false;
      for (const col of columns) {
        const colLeft = Math.min(...col.map(c => c.rect.left));
        const colRight = Math.max(...col.map(c => c.rect.right));
        
        // Check X overlap
        if (b.rect.right > colLeft + 2 && b.rect.left < colRight - 2) {
          col.push(b);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columns.push([b]);
      }
    }

    // Must be a multi-column layout with 2 to 4 columns.
    if (columns.length > 1 && columns.length <= 4) {
      // Create column-row wrapper
      const row = document.createElement('div');
      row.className = 'column-row';

      // Insert it in the DOM just before the physically first element of this band
      const firstEl = convertibleBand.sort((a, b) => {
        const allKids = Array.from(container.children);
        return allKids.indexOf(a.el) - allKids.indexOf(b.el);
      })[0].el;
      
      container.insertBefore(row, firstEl);

      // Create .column containers and populate
      for (const col of columns) {
        const colDiv = document.createElement('div');
        colDiv.className = 'column';
        colDiv.contentEditable = 'true';
        
        // Important: maintain vertical stacking order within each column
        col.sort((a, b) => a.rect.top - b.rect.top);
        for (const b of col) {
          colDiv.appendChild(b.el);
        }
        
        // Distribute widths evenly initially
        colDiv.style.flex = '1 1 0';
        
        row.appendChild(colDiv);
      }
      converted++;
    }
  }

  return converted;
}

