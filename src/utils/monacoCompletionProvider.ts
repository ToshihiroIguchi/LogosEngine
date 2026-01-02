import type { languages } from 'monaco-editor';
import type { CompletionResponse } from '../worker/workerTypes';

export function registerPythonCompletionProvider(
    monaco: typeof import('monaco-editor'),
    getCompletions: (code: string, position: number) => Promise<CompletionResponse>
): void {
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: async (model, position) => {
            const code = model.getValue();
            const offset = model.getOffsetAt(position);

            const response = await getCompletions(code, offset);

            const suggestions: languages.CompletionItem[] = response.completions.map(item => {
                let kind: languages.CompletionItemKind;
                switch (item.kind) {
                    case 'Function':
                        kind = monaco.languages.CompletionItemKind.Function;
                        break;
                    case 'Variable':
                        kind = monaco.languages.CompletionItemKind.Variable;
                        break;
                    case 'Class':
                        kind = monaco.languages.CompletionItemKind.Class;
                        break;
                    case 'Module':
                        kind = monaco.languages.CompletionItemKind.Module;
                        break;
                    case 'Keyword':
                        kind = monaco.languages.CompletionItemKind.Keyword;
                        break;
                    default:
                        kind = monaco.languages.CompletionItemKind.Text;
                }

                return {
                    label: item.label,
                    kind,
                    detail: item.detail,
                    documentation: item.documentation,
                    insertText: item.label,
                    range: undefined as any
                };
            });

            return { suggestions };
        }
    });
}
