export interface DocumentState {
  htmlContent: string;
  cssContent: string;
  fileName: string;
}

export enum EditorTool {
  SELECT = 'SELECT',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
}

export interface SelectionState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  ul: boolean;
  ol: boolean;
  blockType: string;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  alignJustify: boolean;
  fontName: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  foreColor: string;
  // Frame/Border props
  borderWidth: string;
  borderColor: string;
  borderRadius: string;
  backgroundColor: string;
  padding: string;
  borderStyle: string;
  textAlign: string;
  shape: string; // New property for shape class
  width?: string;
  range?: Range | null;
}

export interface HRProperties {
  color: string;
  height: number;
  width: number; // percentage
  alignment: 'left' | 'center' | 'right';
  style: 'solid' | 'dashed' | 'dotted' | 'tapered'; // tapered = linear gradient
}


export interface ImageProperties {
  brightness: number;
  contrast: number;
  width: number; // Percentage
  alignment: 'left' | 'center' | 'right' | 'float-left' | 'float-right';
  isCropping: boolean;
}

export interface TOCEntry {
  id: string;
  text: string;
  page: number;
  level: string; // h1 or h2
}

export interface TOCLevelStyle {
  enabled: boolean;
  color?: string;
  fontSize?: number; // Relative or absolute size
  fontWeight?: string;
  fontFamily?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  leaderStyle?: 'dots' | 'dashes' | 'line' | 'none';
  leaderColor?: string;
  borderBottom?: string; // e.g. '1px solid black'
  borderTop?: string;
  paddingTop?: number;
  paddingBottom?: number;
}

export interface TOCSettings {
  includeH1: boolean;
  includeH2: boolean;
  includeH3: boolean;
  
  // Overall Layout
  theme: 'classic' | 'modern' | 'minimalist' | 'centered';
  useBookInheritance: boolean; // If true, auto-extracts colors/lines from document headings
  
  // Global text settings (if not overridden per level)
  globalFontFamily: string;
  textFontSize: number;
  pageNumberFontSize: number;
  rowGap: number;
  
  // Global leader settings (if not overridden)
  leaderStyle: 'dots' | 'dashes' | 'line' | 'none';
  leaderColor: string;
  leaderSpacing: number;
  
  // Per-level explicit overrides (used when inheritance is off or mixed)
  levelStyles: {
    h1: TOCLevelStyle;
    h2: TOCLevelStyle;
    h3: TOCLevelStyle;
  };
}

export interface BorderSettings {
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  backgroundColor: string;
  padding: number;
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
}

export interface PageAnchor {
  id: string;
  text: string;
  tagName: string;
}

export type StructureStatus = 'pending' | 'approved' | 'rejected';

export interface StructureEntry {
  id: string; // Unique ID for the list
  elementId: string; // DOM ID of the element
  text: string;
  page: number;
  type: string; // 'h1', 'h2', 'style-match', etc.
  status: StructureStatus;
  context?: string; // Snippet of text for context
  hasCustomStyle?: boolean; // True if it has the data-custom-styled attribute
}

/** A heading found in the document, used for TOC mapping */
export interface DocumentHeading {
  id: string;
  text: string;
  level: string; // 'h1' | 'h2' | 'h3' | 'h4' | 'h5'
  page: number;
}

/** A row in the TOC mapping modal – links a TOC line to a document heading */
export interface TOCMappingRow {
  lineIndex: number;
  lineText: string;
  matchedHeadingId: string | null;
  matchedHeadingText: string | null;
  isTitle: boolean; // True = section header, no page number
  confidence: number; // 0-1 auto-match confidence
  isManual?: boolean; // True = row was manually added by user, not extracted from page
}

/** Styling options for the dynamic TOC */
export interface TOCStyleOptions {
  textFontSize: number;             // px, font size of the TOC text lines
  pageNumberFontSize: number;       // px, font size of the page numbers
  leaderStyle: 'dots' | 'dashes' | 'line' | 'none';  // style of the filler between text and number
  leaderSpacing: number;            // px, gap between text end and leader start / leader end and number
  leaderColor: string;              // color of the dots/dashes/line
}
