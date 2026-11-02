import { describe, expect, it } from 'vitest';
import { needsGraphics } from './graphicsDetect';

describe('needsGraphics', () => {
    it.each([
        'plot(sin(x))',
        'plot3d(x*y, (x,-1,1), (y,-1,1))',
        'plot_parametric (cos(t), sin(t), (t, 0, 6))',
        'plt.plot([1,2,3])',
        'import matplotlib',
        'N = CoordSys3D("N")',
        'gradient (f)',
    ])('detects %j', (code) => {
        expect(needsGraphics(code)).toBe(true);
    });

    it.each([
        'expand((x+1)**5)',
        'solve(x**2 - 4, x)',
        '# plot(sin(x))\nx + 1',
        'plotted = 3',
        'hist = [1, 2]',
        'figure = 1',
    ])('ignores %j', (code) => {
        expect(needsGraphics(code)).toBe(false);
    });
});
