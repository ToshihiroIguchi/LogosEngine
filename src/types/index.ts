export type CellType = 'code' | 'markdown';

export interface Output {
  type: 'text' | 'latex' | 'image' | 'error';
  value: string;
  rawText?: string;
  tsv?: string;
  lineNo?: number;
  traceback?: string;
  errorName?: string;
  missingVariables?: string[];
  timestamp: number;
  isResult?: boolean;
}

export interface Cell {
  id: string;
  type: CellType;
  content: string;
  outputs: Output[];
  executionCount?: number;
  isExecuting: boolean;
  isEditing?: boolean; // Used for Markdown cells
}

export interface NotebookState {
  cells: Cell[];
}

export interface Variable {
  name: string;
  type: string;
  value: string;
}

export interface Documentation {
  name: string;
  signature: string;
  docstring: string;
  htmlContent?: string;
  module: string | null;
  snippet?: string; // For search results
}

export interface SearchResults {
  symbols: Documentation[];
  mentions: Documentation[];
}

export interface NotebookMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}
