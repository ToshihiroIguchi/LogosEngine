export type CellType = 'code' | 'markdown';

export interface Output {
  type: 'text' | 'latex' | 'image' | 'error';
  value: string;
  timestamp: number;
}

export interface Cell {
  id: string;
  type: CellType;
  content: string;
  outputs: Output[];
  executionCount?: number;
  isExecuting: boolean;
}

export interface NotebookState {
  cells: Cell[];
}
