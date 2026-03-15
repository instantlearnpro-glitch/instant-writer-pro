/**
 * Auto-detect side-by-side elements and wrap them in .column-row containers.
 * 
 * Algorithm:
 * 1. For each page, scan direct children (or first-level blocks)
 * 2. Elements that overlap vertically but not horizontally → side-by-side → wrap in .column-row
 * 3. Elements stacked in the same horizontal band go into the same column
 */
export function autoDetectColumns(workspace: HTMLElement): number {
  let convertedCount = 0;
  const pages = Array.from(workspace.querySelectorAll('.page')) as HTMLElement[];

  for (const page of pages) {
    convertedCount += detectColumnsInContainer(page);
  }

  return convertedCount;
}

interface BlockInfo {
  el: HTMLElement;
  rect: DOMRect;
}

function detectColumnsInContainer(container: HTMLElement): number {
  let converted = 0;

  // Get direct children that are block-level (skip already converted column-rows)
  const children = Array.from(container.children).filter(
    el => el instanceof HTMLElement &&
      !el.classList.contains('column-row') &&
      !el.classList.contains('page') &&
      el.tagName !== 'STYLE' &&
      el.tagName !== 'SCRIPT'
  ) as HTMLElement[];

  if (children.length < 2) return 0;

  // Gather bounding rects
  const blocks: BlockInfo[] = children.map(el => ({
    el,
    rect: el.getBoundingClientRect()
  }));

  // Find groups of elements that are side-by-side (overlapping Y, non-overlapping X)
  const used = new Set<number>();
  const groups: BlockInfo[][] = [];

  for (let i = 0; i < blocks.length; i++) {
    if (used.has(i)) continue;
    const group: BlockInfo[] = [blocks[i]];
    used.add(i);

    // Look for other blocks at the same vertical position
    for (let j = i + 1; j < blocks.length; j++) {
      if (used.has(j)) continue;

      // Check if block j overlaps vertically with the group's Y range
      const groupTop = Math.min(...group.map(b => b.rect.top));
      const groupBottom = Math.max(...group.map(b => b.rect.bottom));
      const bj = blocks[j];

      const yOverlap = bj.rect.top < groupBottom - 5 && bj.rect.bottom > groupTop + 5;
      if (!yOverlap) continue;

      // Check non-overlapping X with ALL elements in the group
      const xOverlaps = group.some(g => {
        return g.rect.left < bj.rect.right - 5 && g.rect.right > bj.rect.left + 5 &&
          // Must actually be side-by-side, not stacked — check if they have similar widths
          // as the container (full-width elements aren't side-by-side)
          g.rect.width < container.clientWidth * 0.8;
      });

      if (!xOverlaps && bj.rect.width < container.clientWidth * 0.8) {
        group.push(bj);
        used.add(j);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  // Convert each group to a .column-row
  for (const group of groups) {
    // Sort by X position
    group.sort((a, b) => a.rect.left - b.rect.left);

    // Group elements by approximate X position into columns
    const columns: HTMLElement[][] = [];
    let currentCol: HTMLElement[] = [group[0].el];
    let currentX = group[0].rect.left;
    const colThreshold = 20; // px tolerance for "same column"

    for (let i = 1; i < group.length; i++) {
      if (Math.abs(group[i].rect.left - currentX) < colThreshold) {
        // Same column
        currentCol.push(group[i].el);
      } else {
        // New column
        columns.push(currentCol);
        currentCol = [group[i].el];
        currentX = group[i].rect.left;
      }
    }
    columns.push(currentCol);

    if (columns.length < 2 || columns.length > 4) continue;

    // Create the column-row
    const row = document.createElement('div');
    row.className = 'column-row';

    // Insert the row before the first element of the group
    const firstEl = group.sort((a, b) => {
      // Find position in container's children
      const allKids = Array.from(container.children);
      return allKids.indexOf(a.el) - allKids.indexOf(b.el);
    })[0].el;
    container.insertBefore(row, firstEl);

    // Create columns and move elements into them
    for (const colElements of columns) {
      const col = document.createElement('div');
      col.className = 'column';
      col.contentEditable = 'true';

      // Sort column elements by their vertical position
      colElements.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.top - rb.top;
      });

      for (const el of colElements) {
        col.appendChild(el);
      }
      row.appendChild(col);
    }

    converted++;
  }

  return converted;
}
