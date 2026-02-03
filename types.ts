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

export interface GeminiResponse {
  text: string;
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

export interface TOCSettings {
  includeH1: boolean;
  includeH2: boolean;
  includeH3: boolean;
  style: 'classic' | 'modern' | 'dotted';
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
}
