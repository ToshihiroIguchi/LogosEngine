"""Loads the worker's Python sources into one namespace, exactly like the Pyodide worker does."""
import pathlib

import pytest

PY_DIR = pathlib.Path(__file__).resolve().parent.parent
CORE_IMPORTS = (
    "symbols, Symbol, Integer, Float, Rational, S, solve, nsolve, dsolve, solveset, linsolve, "
    "nonlinsolve, Eq, diff, integrate, limit, series, summation, product, simplify, expand, factor, "
    "collect, cancel, apart, sin, cos, tan, exp, log, sqrt, asin, acos, atan, ceiling, floor, "
    "factorial, binomial, gcd, lcm, Matrix, eye, zeros, ones, diag, re, im, Abs, arg, conjugate, "
    "pi, E, I, oo, nan, zoo, true, false, latex"
)


def load_namespace():
    ns = {'__name__': 'logos_worker'}
    for name in ('preprocess.py', 'runtime.py'):
        source = (PY_DIR / name).read_text(encoding='utf-8').replace('__CORE_SYMPY_IMPORTS__', CORE_IMPORTS)
        exec(compile(source, name, 'exec'), ns)
    return ns


@pytest.fixture(scope='module')
def ns():
    return load_namespace()


@pytest.fixture
def ctx(ns):
    c = {}
    ns['setup_context'](c)
    return c
