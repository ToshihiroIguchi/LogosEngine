import type { languages } from 'monaco-editor';
import type { CompletionResponse } from '../worker/workerTypes';

const isRegistered = { value: false };

export function registerPythonCompletionProvider(
    monaco: typeof import('monaco-editor'),
    getCompletions: (code: string, position: number) => Promise<CompletionResponse>
): void {
    if (isRegistered.value) {
        return;
    }

    console.log('[Monaco] Registering Python completion provider');
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: async (model, position) => {
            // Log only on first activation or minimal logging if needed
            // console.log('[Monaco] provideCompletionItems called');
            const code = model.getValue();
            const offset = model.getOffsetAt(position);
            // console.log('[Monaco] Code:', code, 'Offset:', offset);

            const response = await getCompletions(code, offset);
            console.log('[Monaco] Got completions:', response);

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

            console.log('[Monaco] Returning suggestions:', suggestions);
            return { suggestions };
        }
    });

    isRegistered.value = true;
}
