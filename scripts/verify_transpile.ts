import { transpileCode } from '../src/utils/exportUtils';

const testCases = [
    { input: "solve(x=1)", expected: "solve( Eq(x, 1))" },
    { input: "solve(x+1=0)", expected: "solve( Eq(x+1, 0))" },
    { input: "solve(x, check=True)", expected: "solve(x, check=True)" },
    { input: "nsolve(x=y, z)", expected: "nsolve( Eq(x, y), z)" },
    { input: "dsolve(f(x).diff(x) = x)", expected: "dsolve( Eq(f(x).diff(x), x))" },
    { input: "solve(x=1, y=2)", expected: "solve( Eq(x, 1), Eq(y, 2))" },
    { input: "plot(x**2)", expected: "plot(x**2)" }, // Should not change
    { input: "func(x=1)", expected: "func(x=1)" } // Should not change (not in target list)
];

let failed = false;

console.log("Starting Transpilation Tests...");

testCases.forEach(({ input, expected }, index) => {
    const result = transpileCode(input);

    // Normalize spaces for comparison (regex logic might add/remove spaces slightly differently than expected string)
    // Actually our logic adds " Eq(" so let's be strict first, then lenient if needed.
    // The logic returns ` Eq(${key}, ${value})` -> space before Eq.

    // Simple normalization: remove all spaces for check if strict check fails?
    // Let's try strict check first.

    if (result.replace(/\s+/g, '') === expected.replace(/\s+/g, '')) {
        console.log(`[PASS] ${input} -> ${result}`);
    } else {
        console.error(`[FAIL] ${input}`);
        console.error(`  Expected: ${expected}`);
        console.error(`  Actual:   ${result}`);
        failed = true;
    }
});

if (failed) {
    console.error("Some tests failed!");
    process.exit(1);
} else {
    console.log("All tests passed!");
    process.exit(0);
}
