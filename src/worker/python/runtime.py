"""LogosEngine runtime: cell execution, error reporting, docs, completions, variables.

Executed inside Pyodide after preprocess.py, in the same global namespace.
The core import list in CORE_SYMPY_IMPORTS is substituted by the worker.
"""
import ast
import base64
import builtins
import html as _html
import inspect
import io
import keyword
import linecache
import sys
import traceback

CORE_SYMPY_IMPORTS = "__CORE_SYMPY_IMPORTS__"

EQUATION_FUNCS = ('solve', 'dsolve', 'nsolve', 'solveset', 'nonlinsolve', 'linsolve')


# ---------------------------------------------------------------------------
# Output collection
# ---------------------------------------------------------------------------

class _Sink(io.TextIOBase):
    """Ordered text sink shared by stdout and stderr."""

    def __init__(self, items, stream):
        self._items = items
        self._stream = stream

    def writable(self):
        return True

    def write(self, s):
        if not s:
            return 0
        items = self._items
        if items and items[-1].get('kind') == 'stream' and items[-1]['stream'] == self._stream:
            items[-1]['text'] += s
        else:
            items.append({'kind': 'stream', 'stream': self._stream, 'text': s})
        return len(s)

    def flush(self):
        pass


_current_items = None  # set while a cell is running; used by display()


def display(*objs):
    """Show one or more values in order, like Jupyter's display()."""
    for obj in objs:
        rendered = render_value(obj)
        if rendered is not None and _current_items is not None:
            rendered['kind'] = 'display'
            _current_items.append(rendered)
        elif rendered is not None:
            print(rendered['text'])
    return None


def _is_hidden_value(val):
    """Values that are side-effect handles, not results (plots, matplotlib artists)."""
    module = getattr(type(val), '__module__', '') or ''
    if module.startswith('matplotlib') or module.startswith('sympy.plotting'):
        return True
    if isinstance(val, (list, tuple)) and val and all(_is_hidden_value(v) for v in val):
        return True
    return False


def _latexable(val, depth=0):
    """True if sympy's latex() renders this value meaningfully."""
    import sympy
    if depth > 4:
        return False
    if isinstance(val, (sympy.Basic, sympy.MatrixBase, int, float, complex)):
        return True
    if isinstance(val, (list, tuple, set, frozenset)):
        return len(val) <= 500 and all(_latexable(v, depth + 1) for v in val)
    if isinstance(val, dict):
        return len(val) <= 500 and all(
            _latexable(k, depth + 1) and _latexable(v, depth + 1) for k, v in val.items()
        )
    return False


def render_value(val):
    """Convert a Python value into {'text', 'latex', 'tsv'}; None when nothing to show."""
    if val is None or _is_hidden_value(val):
        return None
    try:
        text = repr(val) if isinstance(val, str) else str(val)
    except Exception:
        text = object.__repr__(val)
    latex_res = None
    if _latexable(val):
        try:
            from sympy import latex
            latex_res = latex(val)
        except Exception:
            latex_res = None
    return {'text': text, 'latex': latex_res, 'tsv': get_tsv(val)}


def get_tsv(val):
    if val is None:
        return None
    try:
        if hasattr(val, 'rows') and hasattr(val, 'cols'):
            return "\n".join(
                "\t".join(str(val[r, c]) for c in range(val.cols)) for r in range(val.rows)
            )
        if isinstance(val, (list, tuple)) and len(val) > 0 and isinstance(val[0], (list, tuple)):
            return "\n".join("\t".join(str(x) for x in row) for row in val)
        if isinstance(val, (list, tuple)):
            return "\n".join(str(x) for x in val)
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Context
# ---------------------------------------------------------------------------

class _OutHistory(dict):
    """Out[n] with a useful message: results are not restored after a page reload."""

    def __missing__(self, key):
        raise KeyError(
            f"Out[{key}] is not available in this session. "
            "Run the cell again to recreate its result."
        )


def setup_context(ctx):
    exec("from sympy import " + CORE_SYMPY_IMPORTS, {}, ctx)
    ctx['display'] = display

    # Snapshot system objects BEFORE the default symbols so user redefinitions are visible
    ctx['_system_objects'] = {k: id(v) for k, v in ctx.items()}

    ctx['x'], ctx['y'], ctx['z'], ctx['t'] = ctx['symbols']('x y z t')
    ctx['Out'] = _OutHistory()
    ctx['_'] = None


def load_extended_context(ctx):
    """Add the full SymPy namespace and plotting. Never overwrites user definitions."""
    import warnings
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    # sympy's plot() calls plt.show(); on the headless Agg backend that only warns
    warnings.filterwarnings('ignore', message='FigureCanvasAgg is non-interactive')

    system = ctx.setdefault('_system_objects', {})

    def inject(scope):
        for k, v in scope.items():
            if k in ctx:
                if k not in system or id(ctx[k]) != system[k]:
                    continue  # defined or changed by the user
            ctx[k] = v
            system[k] = id(v)

    for code in ("from sympy import *", "from sympy.vector import *"):
        scope = {}
        try:
            exec(code, {}, scope)
        except ImportError:
            continue
        inject(scope)

    try:
        from sympy.plotting import plot, plot3d, plot_parametric, plot_implicit, plot3d_parametric_surface
        inject({
            'plot': plot, 'plot3d': plot3d, 'plot_parametric': plot_parametric,
            'plot_implicit': plot_implicit, 'plot3d_parametric_surface': plot3d_parametric_surface,
        })
    except ImportError:
        pass

    inject({'plt': plt, 'matplotlib': matplotlib})


# ---------------------------------------------------------------------------
# Static analysis helpers
# ---------------------------------------------------------------------------

class CodeAnalyzer(ast.NodeVisitor):
    """Finds names read at module level that are never defined (for the quick-fix button)."""

    def __init__(self, ctx_keys):
        self.ctx_keys = set(ctx_keys) if ctx_keys else set()
        self.scope_stack = ['global']
        self.defined_in_scope = {'global': set()}
        self.candidates = set()
        self.excluded = set()
        self.reserved = set(keyword.kwlist)
        self.reserved.update(dir(builtins))
        self.reserved.update({'I', 'E', 'N', 'S', 'O', 'pi', 'oo', 'zoo', 'nan', 'true', 'false'})

    def enter_scope(self, scope_name):
        self.scope_stack.append(scope_name)
        self.defined_in_scope.setdefault(scope_name, set())

    def exit_scope(self):
        self.scope_stack.pop()

    def visit_FunctionDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        for decorator in node.decorator_list:
            self._exclude_complex_node(decorator)
        self.enter_scope('function')
        args = node.args
        for arg in args.posonlyargs + args.args + args.kwonlyargs:
            self.defined_in_scope['function'].add(arg.arg)
        for extra in (args.vararg, args.kwarg):
            if extra:
                self.defined_in_scope['function'].add(extra.arg)
        self.generic_visit(node)
        self.exit_scope()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        self.defined_in_scope['global'].add(node.name)
        for decorator in node.decorator_list:
            self._exclude_complex_node(decorator)
        for base in node.bases:
            self._exclude_complex_node(base)
        self.enter_scope('class')
        self.generic_visit(node)
        self.exit_scope()

    def visit_Import(self, node):
        for alias in node.names:
            self.defined_in_scope['global'].add((alias.asname or alias.name).split('.')[0])

    def visit_ImportFrom(self, node):
        for alias in node.names:
            self.defined_in_scope['global'].add(alias.asname or alias.name)

    def visit_AnnAssign(self, node):
        self._exclude_complex_node(node.annotation)
        self.generic_visit(node)

    def visit_ExceptHandler(self, node):
        if node.type:
            self._exclude_complex_node(node.type)
        if node.name:
            self.defined_in_scope.setdefault(self.scope_stack[-1], set()).add(node.name)
        self.generic_visit(node)

    def visit_Lambda(self, node):
        self.enter_scope('lambda')
        for arg in node.args.args:
            self.defined_in_scope['lambda'].add(arg.arg)
        self.generic_visit(node)
        self.exit_scope()

    def _comp(self, node, name):
        self.enter_scope(name)
        self.generic_visit(node)
        self.exit_scope()

    def visit_ListComp(self, node):
        self._comp(node, 'listcomp')

    def visit_SetComp(self, node):
        self._comp(node, 'setcomp')

    def visit_DictComp(self, node):
        self._comp(node, 'dictcomp')

    def visit_GeneratorExp(self, node):
        self._comp(node, 'genexp')

    def visit_Name(self, node):
        current_scope = self.scope_stack[-1]
        if isinstance(node.ctx, (ast.Store, ast.Del)):
            self.defined_in_scope.setdefault(current_scope, set()).add(node.id)
        elif isinstance(node.ctx, ast.Load) and current_scope == 'global':
            self.candidates.add(node.id)

    def visit_Call(self, node):
        self._exclude_complex_node(node.func)
        self.generic_visit(node)

    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name):
            self.excluded.add(node.value.id)
        self.generic_visit(node)

    def _exclude_complex_node(self, node):
        if isinstance(node, ast.Name):
            self.excluded.add(node.id)
        elif isinstance(node, ast.Attribute):
            self._exclude_complex_node(node.value)

    def analyze(self):
        valid_vars = set()
        for var in self.candidates:
            if var in self.defined_in_scope['global']:
                continue
            if var in self.excluded or var in self.reserved or var in self.ctx_keys:
                continue
            valid_vars.add(var)
        return sorted(valid_vars)


def has_unresolved_names(code, ctx):
    """True if the cell reads names that are not defined yet in ctx or builtins.

    Used to wait for background extensions BEFORE running, instead of re-running
    the cell after a NameError (which would repeat side effects)."""
    try:
        if '^' in code or any(f in code for f in EQUATION_FUNCS):
            code = preprocess_equation_syntax(code)
        tree = ast.parse(code)
    except Exception:
        return False
    assigned = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Name) and isinstance(n.ctx, (ast.Store, ast.Del)):
            assigned.add(n.id)
        elif isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
            assigned.add(n.name)
        elif isinstance(n, ast.arguments):
            for a in n.posonlyargs + n.args + n.kwonlyargs:
                assigned.add(a.arg)
            for extra in (n.vararg, n.kwarg):
                if extra:
                    assigned.add(extra.arg)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for al in n.names:
                assigned.add((al.asname or al.name).split('.')[0])
        elif isinstance(n, ast.ExceptHandler) and n.name:
            assigned.add(n.name)
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            if node.id not in ctx and node.id not in assigned and not hasattr(builtins, node.id):
                return True
    return False


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

_NOISE_MARKERS = ('File "/lib/', '/site-packages/', 'File "<exec>"', 'File "/tokenize.py"')


def format_error(e, code=None, ctx_keys=None, filename=None):
    exc_type, exc_value, exc_traceback = sys.exc_info()
    error_name = exc_type.__name__
    message = str(exc_value)

    line_no = None
    if isinstance(e, SyntaxError) and (e.filename in (filename, None) or filename is None):
        line_no = e.lineno
    else:
        for frame in reversed(traceback.extract_tb(exc_traceback)):
            if filename is None and frame.filename in ('<string>', '<exec>'):
                line_no = frame.lineno
                break
            if frame.filename == filename:
                line_no = frame.lineno
                break

    # Drop the runner's own frames: start at the first frame that belongs to a cell
    tb = exc_traceback
    while tb is not None and not str(tb.tb_frame.f_code.co_filename).startswith('<cell'):
        tb = tb.tb_next
    tb_lines = traceback.format_exception(exc_type, exc_value, tb if tb is not None else None)
    filtered = [ln for ln in tb_lines if not any(m in ln for m in _NOISE_MARKERS)]
    formatted_tb = "".join(filtered)

    missing_vars = []
    if error_name == 'NameError' and code is not None:
        try:
            analyzer = CodeAnalyzer(ctx_keys)
            analyzer.visit(ast.parse(code))
            missing_vars = analyzer.analyze()
        except Exception:
            pass

    return {
        "errorName": error_name,
        "message": message,
        "lineNo": line_no,
        "traceback": formatted_tb,
        "missingVariables": missing_vars,
    }


def execute_cell(code, ctx, execution_count=None):
    global _current_items
    if 'plt' in ctx:
        try:
            ctx['plt'].close('all')
        except Exception:
            pass

    filename = f'<cell-{execution_count}>' if execution_count is not None else '<cell>'
    items = []
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout = _Sink(items, 'stdout')
    sys.stderr = _Sink(items, 'stderr')
    _current_items = items
    error_data = None
    result_val = None

    original_code = code
    # Let tracebacks show the user's own source lines
    linecache.cache[filename] = (len(original_code), None, original_code.splitlines(True), filename)

    try:
        if '^' in code or any(f in code for f in EQUATION_FUNCS):
            try:
                code = preprocess_equation_syntax(code)
            except Exception:
                code = original_code

        tree = ast.parse(code, filename)

        if tree.body:
            last_node = tree.body[-1]
            if isinstance(last_node, ast.Expr):
                if len(tree.body) > 1:
                    exec_mod = ast.Module(body=tree.body[:-1], type_ignores=[])
                    exec(compile(exec_mod, filename, 'exec'), ctx)
                eval_expr = ast.Expression(body=last_node.value)
                result_val = eval(compile(eval_expr, filename, 'eval'), ctx)
            else:
                exec(compile(tree, filename, 'exec'), ctx)

            if result_val is not None:
                ctx['_'] = result_val
                if execution_count is not None:
                    if 'Out' not in ctx:
                        ctx['Out'] = _OutHistory()
                    ctx['Out'][execution_count] = result_val
                    ctx[f'_{execution_count}'] = result_val
    except BaseException as e:
        error_data = format_error(e, code=code, ctx_keys=list(ctx.keys()), filename=filename)
        result_val = None
    finally:
        sys.stdout, sys.stderr = old_out, old_err
        _current_items = None

    result = render_value(result_val)

    images = []
    if 'plt' in ctx:
        plt_local = ctx['plt']
        try:
            for fignum in plt_local.get_fignums():
                plt_local.figure(fignum)
                buf = io.BytesIO()
                plt_local.savefig(buf, format='png', bbox_inches='tight')
                images.append(base64.b64encode(buf.getvalue()).decode('utf-8'))
        except Exception:
            pass
        finally:
            try:
                plt_local.close('all')
            except Exception:
                pass

    return {
        "items": items,
        "result": result,
        "images": images,
        "error": error_data,
    }


def transpile_code(code):
    """Equation / caret syntax -> plain Python with Eq(...), for notebook export."""
    return preprocess_equation_syntax(code, 'eq')


# ---------------------------------------------------------------------------
# Documentation
# ---------------------------------------------------------------------------

def convert_rst_to_html(rst_text):
    if not rst_text:
        return ""
    try:
        import re
        import docutils.core
        processed_rst = re.sub(r'\$([^\n$]+)\$', r':math:`\1`', rst_text)
        settings = {
            'output_encoding': 'unicode',
            'initial_header_level': 3,
            'doctitle_xform': False,
            'report_level': 5,
            'halt_level': 5,
            'math_output': 'MathML',
            'file_insertion_enabled': False,
            'raw_enabled': False,
        }
        parts = docutils.core.publish_parts(
            source=processed_rst, writer_name='html5', settings_overrides=settings
        )
        return parts['html_body']
    except ImportError:
        return "<pre>" + _html.escape(rst_text) + "</pre>"
    except Exception:
        return "<pre>" + _html.escape(rst_text) + "</pre>"


def _doc_entry(name, obj, with_html):
    try:
        sig = str(inspect.signature(obj)) if callable(obj) else ""
    except Exception:
        sig = ""
    doc = inspect.getdoc(obj)
    module = inspect.getmodule(obj)
    return {
        "name": name,
        "signature": sig,
        "docstring": doc or "No documentation found.",
        "htmlContent": convert_rst_to_html(doc) if (with_html and doc) else None,
        "module": module.__name__ if module else None,
    }


def _get_help(name, ctx):
    if name not in ctx:
        return None
    return _doc_entry(name, ctx[name], True)


_COMMON_WORDS = set("the a an and or of to in is it that this for with as by on at from".split())
_search_state = {"analyzed": False, "stop_words": set(_COMMON_WORDS)}


def _analyze_frequencies():
    if _search_state["analyzed"]:
        return
    try:
        import collections
        import random
        import string
        import sympy
        candidates = []
        for name in dir(sympy):
            if not name.startswith('_'):
                try:
                    candidates.append(getattr(sympy, name))
                except Exception:
                    pass
        with_doc = [c for c in candidates if isinstance(getattr(c, '__doc__', None), str)]
        rng = random.Random(0)
        sample = rng.sample(with_doc, 100) if len(with_doc) > 100 else with_doc
        counts = collections.Counter()
        for obj in sample:
            for w in set(obj.__doc__.lower().split()):
                w_clean = w.strip(string.punctuation)
                if len(w_clean) > 2:
                    counts[w_clean] += 1
        threshold = len(sample) * 0.2
        _search_state["stop_words"].update({w for w, c in counts.items() if c > threshold})
        _search_state["analyzed"] = True
    except Exception:
        pass


def _search_docs(query, ctx):
    _analyze_frequencies()
    query = (query or '').strip()
    if not query:
        return {"symbols": [], "mentions": []}
    query_lower = query.lower()
    skip_mentions = query_lower in _search_state["stop_words"] or len(query) < 3
    targets = {n: o for n, o in ctx.items() if not n.startswith('_')}

    matches = [n for n in targets if query_lower in n.lower()]

    def sort_key(n):
        low = n.lower()
        return (low != query_lower, not low.startswith(query_lower), len(n), n)

    matches.sort(key=sort_key)
    symbols = []
    for n in matches[:20]:
        try:
            symbols.append(_doc_entry(n, targets[n], False))
        except Exception:
            pass

    mentions = []
    if not skip_mentions:
        for n in sorted(targets):
            if len(mentions) >= 30:
                break
            if query_lower in n.lower():
                continue
            try:
                doc = inspect.getdoc(targets[n])
                if not doc:
                    continue
                idx = doc.lower().find(query_lower)
                if idx == -1:
                    continue
                start = max(0, idx - 40)
                end = min(len(doc), idx + 40 + len(query))
                entry = _doc_entry(n, targets[n], False)
                entry["snippet"] = "..." + doc[start:end].replace('\n', ' ') + "..."
                mentions.append(entry)
            except Exception:
                pass
    return {"symbols": symbols, "mentions": mentions}


# ---------------------------------------------------------------------------
# Completions and variables
# ---------------------------------------------------------------------------

def _get_completions(prefix, ctx):
    if not prefix:
        return []
    names = sorted(
        n for n in (set(dir(builtins)) | set(ctx.keys()))
        if not n.startswith('_') and n.startswith(prefix)
    )[:200]
    completions = []
    for name in names:
        try:
            obj = ctx[name] if name in ctx else getattr(builtins, name, None)
            if obj is None:
                continue
            obj_type = type(obj).__name__
            kind = 'Variable'
            if inspect.ismodule(obj):
                kind = 'Module'
            elif callable(obj):
                kind = 'Class' if inspect.isclass(obj) else 'Function'
            detail = ''
            if kind == 'Function' and len(completions) < 40:
                try:
                    detail = str(inspect.signature(obj))
                except Exception:
                    pass
            elif kind == 'Variable':
                detail = obj_type
            completions.append({'label': name, 'kind': kind, 'detail': detail})
        except Exception:
            pass
    return completions


_ASSUMPTION_KEYS = ['positive', 'negative', 'nonnegative', 'nonpositive', 'real', 'integer',
                    'complex', 'nonzero', 'even', 'odd', 'prime']
_HIDDEN_NAMES = {'In', 'Out', 'exit', 'quit', 'get_ipython', 'open', 'help', 'license',
                 'copyright', 'credits', 'display'}


def _range_summary(name, derived):
    if derived.get('integer') and derived.get('positive'):
        return f"{name} ∈ ℤ, {name} > 0"
    if derived.get('integer') and derived.get('negative'):
        return f"{name} ∈ ℤ, {name} < 0"
    if derived.get('positive'):
        return f"{name} > 0"
    if derived.get('nonnegative'):
        return f"{name} ≥ 0"
    if derived.get('negative'):
        return f"{name} < 0"
    if derived.get('nonpositive'):
        return f"{name} ≤ 0"
    if derived.get('integer'):
        return f"{name} ∈ ℤ"
    if derived.get('real'):
        return f"{name} ∈ ℝ"
    if derived.get('nonzero'):
        return f"{name} ≠ 0"
    return None


def _get_variables(ctx):
    variables = []
    system_objects = ctx.get('_system_objects', {})

    for name, val in list(ctx.items()):
        if name.startswith('_') or name in _HIDDEN_NAMES:
            continue
        # Hidden only while the object is still the original system object
        if name in system_objects and id(val) == system_objects[name]:
            continue
        if hasattr(builtins, name) and not getattr(val, 'is_Symbol', False):
            continue
        if inspect.ismodule(val) or inspect.isclass(val) or inspect.isfunction(val):
            continue

        try:
            s_val = str(val)
            if len(s_val) > 200:
                s_val = s_val[:200] + '...'
        except Exception:
            s_val = "<unprintable>"

        assumptions = None
        range_summary = None
        if getattr(val, 'is_Symbol', False):
            # Only what the user asked for; derived facts (extended_real, ...) are noise
            explicit = getattr(val, '_assumptions_orig', None)
            if explicit is None:
                explicit = getattr(val, 'assumptions0', {})
            assumptions = {k: explicit[k] for k in _ASSUMPTION_KEYS if explicit.get(k) in (True, False)}
            derived = getattr(val, 'assumptions0', {})
            range_summary = _range_summary(name, derived)

        variables.append({
            "name": name,
            "type": type(val).__name__,
            "value": s_val,
            "assumptions": assumptions,
            "rangeSummary": range_summary,
        })
    return variables


def _define_variable(ctx, name, assumptions):
    names = [n.strip() for n in str(name).replace(',', ' ').split() if n.strip()]
    if not names:
        raise ValueError("Variable name cannot be empty")
    for n in names:
        if not n.isidentifier():
            raise ValueError(f"Invalid variable name: '{n}'")
        if keyword.iskeyword(n):
            raise ValueError(f"'{n}' is a reserved Python keyword")

    kwargs = {}
    if assumptions:
        try:
            items = dict(assumptions).items()
        except Exception:
            items = []
        for k, v in items:
            if v is True or v is False:
                kwargs[str(k)] = v

    symbols_fn = ctx.get('symbols')
    if not symbols_fn:
        from sympy import symbols
        symbols_fn = symbols

    syms = symbols_fn(' '.join(names), **kwargs)
    if len(names) == 1:
        ctx[names[0]] = syms
    else:
        for n, s in zip(names, syms):
            ctx[n] = s
    return True
