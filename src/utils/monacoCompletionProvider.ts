import type { languages } from 'monaco-editor';
import type { CompletionResponse } from '../worker/workerTypes';

let isRegistered = false;
let activeGetCompletions: ((code: string, position: number) => Promise<CompletionResponse>) | null = null;

export function updateActiveCompletionProvider(
    getCompletions: (code: string, position: number) => Promise<CompletionResponse>
): void {
    activeGetCompletions = getCompletions;
}

export function registerPythonCompletionProvider(
    monaco: typeof import('monaco-editor'),
    getCompletions: (code: string, position: number) => Promise<CompletionResponse>
): void {
    // Keep reference updated
    activeGetCompletions = getCompletions;

    if (isRegistered) {
        return;
    }

    console.log('[Monaco] Registering Python completion provider');
    monaco.languages.registerCompletionItemProvider('python', {
        provideCompletionItems: async (model, position) => {
            if (!activeGetCompletions) {
                return { suggestions: [] };
            }

            const code = model.getValue();
            const offset = model.getOffsetAt(position);
            console.log('[Monaco] Code length:', code.length, 'Offset:', offset);

            try {
                const response = await activeGetCompletions(code, offset);
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
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        range: undefined as any
                    };
                });

                return { suggestions };
            } catch (err) {
                console.error('[Monaco] Completion provider error:', err);
                return { suggestions: [] };
            }
        }
    });
    isRegistered = true;
}
