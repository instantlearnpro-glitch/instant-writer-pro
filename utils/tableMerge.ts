const mergeTables = (target: HTMLTableElement, source: HTMLTableElement): boolean => {
  const sourceChildren = Array.from(source.children) as HTMLElement[];
  const getOrCreateSection = (tagName: string) => {
    const existing = Array.from(target.children).find(child => child.tagName.toLowerCase() === tagName) as HTMLElement | undefined;
    if (existing) return existing;
    const created = document.createElement(tagName);
    target.appendChild(created);
    return created;
  };

  sourceChildren.forEach(child => {
    const tag = child.tagName.toLowerCase();
    if (tag === 'caption') {
      child.remove();
      return;
    }
    if (tag === 'colgroup') {
      if (!target.querySelector(':scope > colgroup')) {
        target.appendChild(child.cloneNode(true));
      }
      child.remove();
      return;
    }
    if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      const targetSection = getOrCreateSection(tag);
      while (child.firstChild) {
        targetSection.appendChild(child.firstChild);
      }
      child.remove();
      return;
    }
    if (tag === 'tr') {
      const targetBody = getOrCreateSection('tbody');
      targetBody.appendChild(child);
    }
  });

  if (!source.querySelector('tr')) {
    source.remove();
  }

  return true;
};

const resolveSplitGroupTables = (table: HTMLTableElement): HTMLTableElement[] => {
  const group = table.getAttribute('data-split-group');
  if (!group) return [];
  const root = table.closest('.editor-workspace') || table.closest('.page')?.parentElement || table.ownerDocument.body;
  if (!root) return [];
  try {
    const selector = `table[data-split-group="${CSS.escape(group)}"]`;
    return Array.from(root.querySelectorAll(selector)) as HTMLTableElement[];
  } catch {
    return Array.from(root.querySelectorAll('table[data-split-group]'))
      .filter(el => (el as HTMLElement).getAttribute('data-split-group') === group) as HTMLTableElement[];
  }
};

export const mergeSplitTableParts = (table: HTMLTableElement, direction: 'prev' | 'next'): boolean => {
  const tables = resolveSplitGroupTables(table);
  if (tables.length < 2) return false;
  const index = tables.findIndex(t => t === table);
  if (index < 0) return false;
  const neighbor = direction === 'prev' ? tables[index - 1] : tables[index + 1];
  if (!neighbor) return false;

  const target = direction === 'prev' ? neighbor : table;
  const source = direction === 'prev' ? table : neighbor;
  return mergeTables(target, source);
};

export const mergeAdjacentTables = (target: HTMLTableElement, source: HTMLTableElement): boolean => {
  return mergeTables(target, source);
};
