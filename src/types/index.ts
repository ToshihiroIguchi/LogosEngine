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
  executionTime?: number;
  isExecuting: boolean;
  isEditing?: boolean; // Used for Markdown cells
}

export interface NotebookState {
  cells: Cell[];
}

export interface VariableAssumptions {
  positive?: boolean;
  negative?: boolean;
  nonnegative?: boolean;
  nonpositive?: boolean;
  real?: boolean;
  integer?: boolean;
  complex?: boolean;
  nonzero?: boolean;
  even?: boolean;
  odd?: boolean;
  prime?: boolean;
  [key: string]: boolean | undefined;
}

export interface Variable {
  name: string;
  type: string;
  value: string;
  assumptions?: VariableAssumptions;
  rangeSummary?: string;
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
