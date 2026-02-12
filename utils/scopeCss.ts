const GLOBAL_SELECTORS = new Set([
  'html', 'body', ':root',
]);

const STRIP_AT_RULES = new Set([
  '@charset', '@import', '@namespace',
]);

export function scopeCss(raw: string, scope: string = '.editor-workspace'): string {
  if (!raw || !raw.trim()) return raw;

  let result = '';
  let i = 0;
  const len = raw.length;

  while (i < len) {
    // Skip whitespace
    if (/\s/.test(raw[i])) {
      result += raw[i];
      i++;
      continue;
    }

    // Skip comments
    if (raw[i] === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      if (end === -1) {
        result += raw.slice(i);
        break;
      }
      result += raw.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    // Handle @-rules
    if (raw[i] === '@') {
      const atRuleMatch = raw.slice(i).match(/^@[\w-]+/);
      if (atRuleMatch) {
        const atName = atRuleMatch[0].toLowerCase();

        // Strip @charset, @import, @namespace entirely
        if (STRIP_AT_RULES.has(atName)) {
          const semi = raw.indexOf(';', i);
          i = semi === -1 ? len : semi + 1;
          continue;
        }

        // @media, @supports, @layer etc. – recurse into the block
        if (atName === '@media' || atName === '@supports' || atName === '@layer' ||
            atName === '@container' || atName.startsWith('@-')) {
          // Find the opening brace
          const braceStart = raw.indexOf('{', i);
          if (braceStart === -1) {
            result += raw.slice(i);
            break;
          }
          result += raw.slice(i, braceStart + 1);
          i = braceStart + 1;

          // Find matching closing brace
          let depth = 1;
          let blockStart = i;
          while (i < len && depth > 0) {
            if (raw[i] === '{') depth++;
            else if (raw[i] === '}') depth--;
            if (depth > 0) i++;
          }
          const innerBlock = raw.slice(blockStart, i);
          result += scopeCss(innerBlock, scope);
          result += '}';
          i++; // skip closing brace
          continue;
        }

        // @page – strip it (conflicts with the app's own @page)
        if (atName === '@page') {
          const braceStart = raw.indexOf('{', i);
          if (braceStart === -1) {
            const semi = raw.indexOf(';', i);
            i = semi === -1 ? len : semi + 1;
            continue;
          }
          let depth = 1;
          let j = braceStart + 1;
          while (j < len && depth > 0) {
            if (raw[j] === '{') depth++;
            else if (raw[j] === '}') depth--;
            j++;
          }
          i = j;
          continue;
        }

        // @font-face, @keyframes etc – pass through as-is
        const braceStart = raw.indexOf('{', i);
        if (braceStart === -1) {
          result += raw.slice(i);
          break;
        }
        let depth = 1;
        let j = braceStart + 1;
        while (j < len && depth > 0) {
          if (raw[j] === '{') depth++;
          else if (raw[j] === '}') depth--;
          j++;
        }
        result += raw.slice(i, j);
        i = j;
        continue;
      }
    }

    // Regular rule: selector { declarations }
    const braceStart = raw.indexOf('{', i);
    if (braceStart === -1) {
      // No more rules, just leftover text
      result += raw.slice(i);
      break;
    }

    const selectorText = raw.slice(i, braceStart).trim();

    // Find matching closing brace
    let depth = 1;
    let j = braceStart + 1;
    while (j < len && depth > 0) {
      if (raw[j] === '{') depth++;
      else if (raw[j] === '}') depth--;
      j++;
    }
    const declarationBlock = raw.slice(braceStart, j);

    // Scope each selector
    const scopedSelectors = selectorText.split(',').map(sel => {
      sel = sel.trim();
      if (!sel) return sel;

      const lower = sel.toLowerCase().replace(/\s+/g, ' ').trim();

      // Replace html/body/:root with the scope
      if (GLOBAL_SELECTORS.has(lower)) {
        return scope;
      }

      // `body.foo` or `html .something` – replace the global part
      if (/^(html|body|:root)\s/i.test(lower)) {
        return scope + ' ' + sel.replace(/^(html|body|:root)\s+/i, '');
      }
      if (/^(html|body|:root)\./i.test(lower)) {
        return scope + sel.replace(/^(html|body|:root)/i, '');
      }

      // Already has scope
      if (sel.startsWith(scope)) {
        return sel;
      }

      // Universal selector alone – scope it
      if (lower === '*') {
        return scope + ' *';
      }

      // Prefix with scope
      return scope + ' ' + sel;
    }).join(', ');

    result += scopedSelectors + ' ' + declarationBlock;
    i = j;
  }

  return result;
}
