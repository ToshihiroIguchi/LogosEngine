/**
 * Does this code need the graphics extensions (matplotlib, sympy.plotting, sympy.vector)?
 * Used for the QUEUED badge; the worker makes the same decision before it runs a cell.
 */
const GRAPHICS_PATTERN = /\b(?:plt|matplotlib|CoordSys3D)\b|\b(?:plot\w*|divergence|curl|gradient)\s*\(/;

/** Replaces comments and string literals with blanks so words inside them never match. */
export function stripCommentsAndStrings(code: string): string {
    let out = '';
    let i = 0;
    const n = code.length;
    while (i < n) {
        const ch = code[i];

        if (ch === '#') {
            while (i < n && code[i] !== '\n') i++;
            continue;
        }

        if (ch === '"' || ch === "'") {
            const triple = code.startsWith(ch.repeat(3), i);
            const quote = triple ? ch.repeat(3) : ch;
            i += quote.length;
            while (i < n) {
                if (code[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (code.startsWith(quote, i)) {
                    i += quote.length;
                    break;
                }
                // A single-quoted string ends at the line break (unterminated literal)
                if (!triple && code[i] === '\n') break;
                i++;
            }
            out += ' ';
            continue;
        }

        out += ch;
        i++;
    }
    return out;
}

export function needsGraphics(code: string): boolean {
    return GRAPHICS_PATTERN.test(stripCommentsAndStrings(code));
}
