import pytest


@pytest.fixture
def pp(ns):
    return ns['preprocess_equation_syntax']


def test_caret_becomes_power(pp):
    assert pp('x^2 + 2^3') == 'x**2 + 2**3'


def test_caret_assign(pp):
    assert pp('x ^= 2') == 'x **= 2'


def test_untouched_when_nothing_to_do(pp):
    code = 'print(  f"{x=}"  )  # keep   spacing\n'
    assert pp(code) == code


def test_fstring_debug_specifier_survives_with_caret(pp):
    out = pp('x = 3\nprint(f"{x=}", 2^3)\n')
    assert 'f"{x=}"' in out and '2**3' in out


def test_fstring_format_spec_survives(pp):
    out = pp('print(f"{1.5:%H %M}")\ny = 2^2\n')
    assert 'f"{1.5:%H %M}"' in out and 'y = 2**2' in out


def test_line_continuation_and_line_count_preserved(pp):
    code = 'a = 1 + \\\n    2\nb = a^2\nsolve(x=1)\n'
    out = pp(code)
    assert out.count('\n') == code.count('\n')
    assert 'a = 1 + \\\n    2' in out


def test_strings_and_comments_untouched(pp):
    code = 's = "2^3 solve(x=1)"\n# 2^3 solve(x=1)\n'
    assert pp(code) == code


def test_simple_equation(pp):
    assert pp('solve(x = 1)') == 'solve(x -( 1))'


def test_equation_with_complex_lhs(pp):
    assert pp('solve(x**2 + 1 = 5, x)') == 'solve(x**2 + 1 -( 5), x)'


def test_equation_system_in_list(pp):
    assert pp('solve([x + y = 1, x - y = 2], [x, y])') == 'solve([x + y -( 1), x - y -( 2)], [x, y])'


def test_eq_mode(ns):
    assert ns['transpile_code']('solve(x^2 = 4, x)') == 'solve(Eq(x**2, 4), x)'


def test_eq_mode_list(ns):
    out = ns['transpile_code']('solve([x + y = 1, x - y = 2])')
    assert out == 'solve([Eq(x + y, 1), Eq(x - y, 2)])'


@pytest.mark.parametrize('code', [
    'solve(x, check=True)',
    'dsolve(f(x).diff(x) - f(x), f(x), ics={f(0): 1})',
    'dsolve(eq, func=f(x))',
    'nsolve(x**2 - 2, x, 1, prec=30, tol=1e-10)',
    'solve(x, rational=False, dict=True)',
    'dsolve(eq, f(x), hint="separable", n=6)',
])
def test_reserved_keywords_untouched(pp, code):
    assert pp(code) == code


def test_n_is_equation_outside_dsolve(pp):
    assert pp('solve(n = 5)') == 'solve(n -( 5))'


def test_method_call_untouched(pp):
    code = 'M.solve(b, method="LU")\nobj.solve(a=1)'
    assert pp(code) == code


def test_sympy_qualified_is_converted(pp):
    assert pp('sympy.solve(x = 1)') == 'sympy.solve(x -( 1))'


def test_inner_call_kwarg_untouched(pp):
    code = 'solve(f(a=1), x)'
    assert pp(code) == code


def test_def_not_treated_as_call(pp):
    code = 'def solve(x=1):\n    return x\n'
    assert pp(code) == code


def test_multiline_call(pp):
    code = 'solve(\n    x + y = 3,\n    x - y = 1,  # why\n)\n'
    out = pp(code)
    assert out.count('\n') == code.count('\n')
    assert 'x + y -( 3)' in out and 'x - y -( 1)' in out


def test_syntax_error_returns_original(pp):
    code = 'solve(x = (1'
    assert pp(code) == code


def test_unicode_columns(pp):
    out = pp('s = "日本語"; y = 2^3')
    assert out == 's = "日本語"; y = 2**3'
