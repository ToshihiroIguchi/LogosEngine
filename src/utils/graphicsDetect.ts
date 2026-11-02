/**
 * Single source of truth for "does this code need the graphics extensions?"
 * (matplotlib, sympy.plotting, sympy.vector). Used both when queueing execution
 * and when showing the QUEUED badge, so the two can never disagree.
 */
const GRAPHICS_PATTERN = /\b(?:plt|matplotlib|CoordSys3D)\b|\b(?:plot\w*|divergence|curl|gradient)\s*\(/;

export function needsGraphics(code: string): boolean {
    // Drop whole-line and trailing comments so commented-out plots do not block execution.
    const withoutComments = code.replace(/^\s*#.*$/gm, '');
    return GRAPHICS_PATTERN.test(withoutComments);
}
