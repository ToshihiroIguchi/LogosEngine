import pytest


def run(ns, ctx, code, count=1):
    return ns['execute_cell'](code, ctx, count)


def stdout_of(res):
    return ''.join(i['text'] for i in res['items'] if i['kind'] == 'stream' and i['stream'] == 'stdout')


def test_result_and_latex(ns, ctx):
    res = run(ns, ctx, 'expand((x + 1)**2)')
    assert res['error'] is None
    assert res['result']['text'] == 'x**2 + 2*x + 1'
    assert res['result']['latex'] == 'x^{2} + 2 x + 1'
    assert ctx['Out'][1] is not None


def test_caret_syntax(ns, ctx):
    res = run(ns, ctx, 'solve(x^2 = 4, x)')
    assert res['error'] is None
    assert res['result']['text'] == '[-2, 2]'


def test_fstring_debug_preserved_in_cell(ns, ctx):
    res = run(ns, ctx, 'a = 3\nprint(f"{a=}", 2^3)')
    assert stdout_of(res).strip() == 'a=3 8'


def test_display_orders_outputs(ns, ctx):
    res = run(ns, ctx, 'print("a")\ndisplay(expand((x+1)**2), factor(x**2-1))\nprint("b")\nx + 1')
    kinds = [i['kind'] for i in res['items']]
    assert kinds == ['stream', 'display', 'display', 'stream']
    assert res['items'][1]['text'] == 'x**2 + 2*x + 1'
    assert res['items'][2]['text'] == '(x - 1)*(x + 1)'
    assert res['result']['text'] == 'x + 1'


def test_stderr_captured(ns, ctx):
    res = run(ns, ctx, 'import sys\nsys.stderr.write("warn")')
    assert any(i['kind'] == 'stream' and i['stream'] == 'stderr' for i in res['items'])


def test_non_sympy_result_is_text_only(ns, ctx):
    res = run(ns, ctx, 'object()')
    assert res['result']['latex'] is None


def test_string_result_is_repr_text(ns, ctx):
    res = run(ns, ctx, '"hi"')
    assert res['result']['text'] == "'hi'" and res['result']['latex'] is None


def test_none_result_has_no_output(ns, ctx):
    assert run(ns, ctx, 'None')['result'] is None


def test_matrix_tsv(ns, ctx):
    res = run(ns, ctx, 'Matrix([[1, 2], [3, 4]])')
    assert res['result']['tsv'] == '1\t2\n3\t4'


def test_error_line_and_name(ns, ctx):
    res = run(ns, ctx, 'a = 1\nb = 1/0')
    err = res['error']
    assert err['errorName'] == 'ZeroDivisionError' and err['lineNo'] == 2


def test_error_with_empty_message_still_reported(ns, ctx):
    err = run(ns, ctx, 'assert False')['error']
    assert err['errorName'] == 'AssertionError' and err['message'] == ''


def test_syntax_error_line(ns, ctx):
    err = run(ns, ctx, 'x = 1\ny = (')['error']
    assert err['errorName'] == 'SyntaxError' and err['lineNo'] == 2


def test_error_in_function_from_other_cell_uses_current_cell_line(ns, ctx):
    run(ns, ctx, 'def boom():\n    pass\n    pass\n    pass\n    return 1/0', count=1)
    err = run(ns, ctx, '# one\n# two\nboom()', count=2)['error']
    assert err['lineNo'] == 3
    assert '<cell-2>' in err['traceback'] and '<cell-1>' in err['traceback']


def test_traceback_hides_runner_frames(ns, ctx):
    tb = run(ns, ctx, '1/0')['error']['traceback']
    assert 'execute_cell' not in tb


def test_name_error_suggests_variables(ns, ctx):
    err = run(ns, ctx, 'a + b*c')['error']
    assert err['errorName'] == 'NameError'
    assert err['missingVariables'] == ['a', 'b', 'c']


def test_sys_exit_is_error_not_crash(ns, ctx):
    err = run(ns, ctx, 'import sys\nsys.exit(1)')['error']
    assert err['errorName'] == 'SystemExit'
    assert run(ns, ctx, '1 + 1')['result']['text'] == '2'


def test_stdout_restored_after_error(ns, ctx):
    import sys
    before = sys.stdout
    run(ns, ctx, 'raise ValueError("x")')
    assert sys.stdout is before


def test_keyboard_interrupt_reported(ns, ctx):
    err = run(ns, ctx, 'raise KeyboardInterrupt()')['error']
    assert err['errorName'] == 'KeyboardInterrupt'


def test_has_unresolved_names(ns, ctx):
    f = ns['has_unresolved_names']
    assert f('plot3d(x)', ctx)
    assert not f('x + 1', ctx)
    assert not f('def g(*args, **kw):\n    return args, kw\ng()', ctx)
    assert not f('lambda p, /, q: p + q', ctx)
    assert not f('import math\nmath.pi', ctx)


def test_transpile_code(ns):
    assert ns['transpile_code']('solve(x^2 = 4)') == 'solve(Eq(x**2, 4))'


# ---- variables ---------------------------------------------------------------

def test_variables_hide_system_and_show_user(ns, ctx):
    run(ns, ctx, 'a = 5\nm = Matrix([[1]])')
    names = {v['name'] for v in ns['_get_variables'](ctx)}
    assert {'a', 'm', 'x', 'y', 'z', 't'} <= names
    assert 'pi' not in names and 'display' not in names


def test_variable_assumptions_are_only_explicit(ns, ctx):
    ns['_define_variable'](ctx, 'r', {'positive': True})
    v = next(v for v in ns['_get_variables'](ctx) if v['name'] == 'r')
    assert v['assumptions'] == {'positive': True}
    assert v['rangeSummary'] == 'r > 0'


def test_non_symbol_has_no_assumptions(ns, ctx):
    run(ns, ctx, 'a = 5')
    v = next(v for v in ns['_get_variables'](ctx) if v['name'] == 'a')
    assert v['assumptions'] is None


def test_define_variable_validation(ns, ctx):
    with pytest.raises(ValueError):
        ns['_define_variable'](ctx, 'lambda', {})
    with pytest.raises(ValueError):
        ns['_define_variable'](ctx, '1abc', {})
    with pytest.raises(ValueError):
        ns['_define_variable'](ctx, '  ', {})


def test_define_multiple_variables(ns, ctx):
    ns['_define_variable'](ctx, 'p, q', {'integer': True})
    assert ctx['p'].is_integer and ctx['q'].is_integer


# ---- extensions never clobber user data ---------------------------------------

def test_extended_context_keeps_user_definitions(ns, ctx):
    pytest.importorskip('matplotlib')
    run(ns, ctx, 'beta = 123\nN = "mine"')
    ns['load_extended_context'](ctx)
    assert ctx['beta'] == 123 and ctx['N'] == 'mine'
    assert 'gamma' in ctx and 'plt' in ctx
    names = {v['name'] for v in ns['_get_variables'](ctx)}
    assert 'gamma' not in names and 'beta' in names


# ---- completions & docs -------------------------------------------------------

def test_completions_need_prefix(ns, ctx):
    assert ns['_get_completions']('', ctx) == []
    labels = {c['label'] for c in ns['_get_completions']('sol', ctx)}
    assert 'solve' in labels


def test_search_docs_defers_html(ns, ctx):
    res = ns['_search_docs']('integrate', ctx)
    assert res['symbols'] and res['symbols'][0]['name'] == 'integrate'
    assert res['symbols'][0]['htmlContent'] is None


def test_get_help_returns_docstring(ns, ctx):
    h = ns['_get_help']('simplify', ctx)
    assert h['name'] == 'simplify' and h['docstring']


def test_rst_fallback_is_escaped(ns):
    out = ns['convert_rst_to_html']('a <b> & c')
    assert '<b>' not in out


def test_missing_out_entry_has_helpful_message(ns, ctx):
    err = run(ns, ctx, 'expand(Out[99])')['error']
    assert err['errorName'] == 'KeyError' and 'Run the cell again' in err['message']
