export type ActionType = 'delete' | 'move' | 'resize' | 'bold' | 'italic' | 'underline' | 'list' | 'indent' | 'align' | 'fontSize' | 'fontColor' | 'style' | 'imageWidth' | 'imageAlign' | 'imageBrightness' | 'imageContrast' | 'imageStyle';

export interface ActionRecord {
  type: ActionType;
  elementSignature: string;
  styleCommand?: string;
  styleValue?: string;
  timestamp: number;
}

export interface PatternMatch {
  element: HTMLElement;
  preview: string;
}

// Generate a signature for an element based on its characteristics
export const getElementSignature = (element: HTMLElement): string => {
  const tag = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).sort().join('.');
  const style = element.getAttribute('style') || '';
  
  // Extract key style properties
  const computed = window.getComputedStyle(element);
  const fontSize = computed.fontSize;
  const color = computed.color;
  const position = computed.position;
  
  // Get content pattern (first 20 chars, or check if numeric, etc.)
  const text = element.textContent?.trim() || '';
  const isNumeric = /^\d+$/.test(text);
  const isShortText = text.length < 10;
  const contentPattern = isNumeric ? 'numeric' : (isShortText ? 'short' : 'long');
  
  // Parent context
  const parent = element.parentElement?.tagName.toLowerCase() || '';
  const isInFooter = !!element.closest('.page-footer, footer, [class*="footer"]');
  const isAtPageEnd = isNearPageEnd(element);
  
  return `${tag}|${classes}|${fontSize}|${contentPattern}|${parent}|${isInFooter}|${isAtPageEnd}`;
};

const isNearPageEnd = (element: HTMLElement): boolean => {
  const page = element.closest('.page');
  if (!page) return false;
  
  const pageRect = page.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  
  // Element is in the bottom 15% of the page
  return elementRect.bottom > pageRect.bottom - (pageRect.height * 0.15);
};

// Find similar elements in the document
export const findSimilarElements = (
  signature: string, 
  excludeElement: HTMLElement | null,
  workspace: HTMLElement
): PatternMatch[] => {
  const matches: PatternMatch[] = [];
  
  // Get all potential elements
  const allElements = workspace.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, div:not(.page):not(.editor-workspace), span, img, hr, table, li, blockquote'
  );
  
  allElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl === excludeElement) return;
    if (!htmlEl.id) {
      htmlEl.id = `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
    
    const elSignature = getElementSignature(htmlEl);
    
    // Check if signatures match (allow some flexibility)
    if (signaturesMatch(signature, elSignature)) {
      matches.push({
        element: htmlEl,
        preview: getElementPreview(htmlEl)
      });
    }
  });
  
  return matches;
};

const signaturesMatch = (sig1: string, sig2: string): boolean => {
  const parts1 = sig1.split('|');
  const parts2 = sig2.split('|');
  
  // Must match: tag, classes, fontSize, contentPattern
  // Can differ: parent, isInFooter, isAtPageEnd (but similar is better)
  
  if (parts1[0] !== parts2[0]) return false; // tag must match
  if (parts1[1] !== parts2[1]) return false; // classes must match
  if (parts1[2] !== parts2[2]) return false; // fontSize must match
  if (parts1[3] !== parts2[3]) return false; // content pattern must match
  
  // Additional matching points for context similarity
  let matchScore = 4; // Base score for required matches
  if (parts1[4] === parts2[4]) matchScore++; // parent
  if (parts1[5] === parts2[5]) matchScore++; // isInFooter
  if (parts1[6] === parts2[6]) matchScore++; // isAtPageEnd
  
  return matchScore >= 4; // At least base requirements
};

const getElementPreview = (element: HTMLElement): string => {
  const tag = element.tagName.toLowerCase();
  const text = element.textContent?.trim() || '';
  
  if (element.tagName === 'IMG') {
    return `<img> ${(element as HTMLImageElement).alt || 'image'}`;
  }
  
  if (element.tagName === 'HR') {
    return '<hr> linea orizzontale';
  }
  
  const truncatedText = text.length > 50 ? text.substring(0, 50) + '...' : text;
  return `<${tag}> ${truncatedText || '(vuoto)'}`;
};

// Pattern detection - checks if user is repeating same action
export class PatternTracker {
  private actions: ActionRecord[] = [];
  private readonly THRESHOLD = 3; // Actions needed to detect pattern
  private readonly TIME_WINDOW = 60000; // 1 minute window
  
  recordAction(type: ActionType, element: HTMLElement, command?: string, value?: string): void {
    const signature = getElementSignature(element);
    const now = Date.now();
    
    // Clean old actions
    this.actions = this.actions.filter(a => now - a.timestamp < this.TIME_WINDOW);
    
    this.actions.push({
      type,
      elementSignature: signature,
      styleCommand: command,
      styleValue: value,
      timestamp: now
    });
  }
  
  detectPattern(): { detected: boolean; actionType: string; signature: string; command?: string; value?: string } | null {
    if (this.actions.length < this.THRESHOLD) return null;
    
    // Get recent actions of same type
    const recentActions = this.actions.slice(-this.THRESHOLD);
    
    // Guard against empty array
    if (recentActions.length === 0) return null;
    
    // Check if all actions are same type
    const actionType = recentActions[0].type;
    if (!recentActions.every(a => a.type === actionType)) return null;
    
    // For style actions, also check if same command
    if (recentActions[0].styleCommand) {
      const command = recentActions[0].styleCommand;
      if (!recentActions.every(a => a.styleCommand === command)) return null;
    }
    
    // Check if all signatures are similar
    const firstSig = recentActions[0].elementSignature;
    const allSimilar = recentActions.every(a => signaturesMatch(firstSig, a.elementSignature));
    
    if (allSimilar) {
      return {
        detected: true,
        actionType: this.getActionLabel(actionType),
        signature: firstSig,
        command: recentActions[0].styleCommand,
        value: recentActions[0].styleValue
      };
    }
    
    return null;
  }
  
  getLastAction(): ActionRecord | null {
    return this.actions.length > 0 ? this.actions[this.actions.length - 1] : null;
  }
  
  private getActionLabel(type: ActionType): string {
    switch (type) {
      case 'delete': return 'Delete';
      case 'move': return 'Move';
      case 'resize': return 'Resize';
      case 'bold': return 'Bold';
      case 'italic': return 'Italic';
      case 'underline': return 'Underline';
      case 'list': return 'List';
      case 'indent': return 'Indent';
      case 'align': return 'Align';
      case 'fontSize': return 'Text size';
      case 'fontColor': return 'Text color';
      case 'imageWidth': return 'Image size';
      case 'imageAlign': return 'Image alignment';
      case 'imageBrightness': return 'Image brightness';
      case 'imageContrast': return 'Image contrast';
      case 'imageStyle': return 'Image style';
      case 'style': return 'Style edit';
      default: return type;
    }
  }
  
  clear(): void {
    this.actions = [];
  }
}
