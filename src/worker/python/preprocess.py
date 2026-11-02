"""LogosEngine syntax sugar: `^` exponentiation and `solve(x + 1 = 0)` equations.

The rewrite is position based: only the exact source ranges of the rewritten
tokens are replaced, every other character (spacing, f-strings, line
continuations, comments) is kept byte for byte so output and line numbers
stay faithful to what the user typed.
"""
import io
import tokenize

TARGET_FUNCS = frozenset({'solve', 'dsolve', 'nsolve', 'solveset', 'nonlinsolve', 'linsolve'})

# Keyword arguments that must never be turned into equations. The list is
# extended at runtime with every defaulted parameter in the target signatures.
STATIC_RESERVED_ARGS = frozenset({
    # solve flags
    'check', 'simplify', 'rational', 'manual', 'implicit', 'hint', 'force', 'dict', 'set',
    'verify', 'exclude', 'quick', 'cubics', 'quartics', 'quintics', 'domain', 'symbols',
    'flags', 'minimal', 'warn', 'numerical', 'particular', 'positive',
    # dsolve
    'ics', 'func', 'xi', 'eta',
    # nsolve
    'prec', 'tol', 'solver', 'maxsteps', 'bisect', 'modules',
})

# Common variable names that are valid keywords only for dsolve.
DSOLVE_ONLY_ARGS = frozenset({'n', 'x0'})

_SKIP_TYPES = (tokenize.NL, tokenize.COMMENT, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT)

_reserved_cache = {}


def reserved_args(func_name):
    """Keyword names that are kept as keyword arguments for `func_name`."""
    cached = _reserved_cache.get(func_name)
    if cached is not None:
        return cached
    names = set(STATIC_RESERVED_ARGS)
    if func_name == 'dsolve':
        names |= DSOLVE_ONLY_ARGS
    try:
        import inspect
        import sympy
        fn = getattr(sympy, func_name)
        for p in inspect.signature(fn).parameters.values():
            if p.kind in (p.VAR_POSITIONAL, p.VAR_KEYWORD):
                continue
            if p.default is not p.empty and p.name not in {'f', 'x', 'y', 'z', 't'}:
                if p.name in DSOLVE_ONLY_ARGS and func_name != 'dsolve':
                    continue
                names.add(p.name)
    except Exception:
        pass
    result = frozenset(names)
    _reserved_cache[func_name] = result
    return result


def _line_offsets(code):
    offsets = []
    total = 0
    for line in io.StringIO(code):
        offsets.append(total)
        total += len(line)
    offsets.append(total)
    return offsets


def preprocess_equation_syntax(code, mode='runtime'):
    """Rewrite `^` to `**` and `solve(lhs = rhs)` to an equation.

    mode='runtime': `lhs = rhs` -> `lhs -(rhs)` (works everywhere, keeps columns close)
    mode='eq':      `lhs = rhs` -> `Eq(lhs, rhs)` (readable, used for exported notebooks)
    """
    try:
        tokens = list(tokenize.generate_tokens(io.StringIO(code).readline))
    except (tokenize.TokenError, SyntaxError):
        return code

    offsets = _line_offsets(code)

    def pos(rc):
        row, col = rc
        if row - 1 >= len(offsets):
            return len(code)
        return offsets[row - 1] + col

    sig = [t for t in tokens if t.type not in _SKIP_TYPES]
    index_in_sig = {id(t): i for i, t in enumerate(sig)}

    edits = []  # (start, end, replacement)

    # Bracket stack. Entry: dict(kind, func (target call name or None), is_call, arg_start)
    stack = []

    def prev_sig(i, n=1):
        j = i - n
        return sig[j] if j >= 0 else None

    for si, tok in enumerate(sig):
        # Record the start of the current argument for 'eq' mode
        if stack and stack[-1]['arg_start'] is None and not (
            tok.exact_type in (tokenize.RPAR, tokenize.RSQB, tokenize.RBRACE)
        ):
            stack[-1]['arg_start'] = pos(tok.start)

        et = tok.exact_type
        if et in (tokenize.LPAR, tokenize.LSQB, tokenize.LBRACE):
            func = None
            is_call = False
            if et == tokenize.LPAR:
                p1 = prev_sig(si)
                if p1 is not None and p1.type == tokenize.NAME and p1.string not in _KEYWORDS_NOT_CALLS:
                    is_call = True
                    if p1.string in TARGET_FUNCS:
                        p2 = prev_sig(si, 2)
                        p3 = prev_sig(si, 3)
                        if p2 is not None and p2.exact_type == tokenize.DOT:
                            # obj.solve(...) is a method call; sympy.solve(...) is the real thing
                            if p3 is not None and p3.type == tokenize.NAME and p3.string == 'sympy':
                                func = p1.string
                        elif p2 is not None and p2.type == tokenize.NAME and p2.string == 'def':
                            func = None
                        else:
                            func = p1.string
                elif p1 is not None and p1.exact_type in (tokenize.RPAR, tokenize.RSQB):
                    is_call = True
            elif et == tokenize.LSQB:
                p1 = prev_sig(si)
                is_call = p1 is not None and (
                    p1.type == tokenize.NAME and p1.string not in _KEYWORDS_NOT_CALLS
                    or p1.exact_type in (tokenize.RPAR, tokenize.RSQB)
                )
            stack.append({'kind': et, 'func': func, 'is_call': is_call, 'arg_start': None})
        elif et in (tokenize.RPAR, tokenize.RSQB, tokenize.RBRACE):
            if stack:
                stack.pop()
        elif et == tokenize.COMMA:
            if stack:
                stack[-1]['arg_start'] = None
        elif et == tokenize.CIRCUMFLEX:
            edits.append((pos(tok.start), pos(tok.end), '**'))
        elif et == tokenize.CIRCUMFLEXEQUAL:
            edits.append((pos(tok.start), pos(tok.end), '**='))
        elif et == tokenize.EQUAL:
            owner = _owning_target_call(stack)
            if owner is None:
                continue
            top = stack[-1]
            # keyword argument: `NAME =` directly inside the call, preceded by `(` or `,`
            if top is owner:
                p1 = prev_sig(si)
                p2 = prev_sig(si, 2)
                if (
                    p1 is not None and p1.type == tokenize.NAME
                    and p2 is not None and p2.exact_type in (tokenize.LPAR, tokenize.COMMA)
                    and p1.string in reserved_args(owner['func'])
                ):
                    continue
            end_pos = _find_rhs_end(sig, si, pos)
            if end_pos is None:
                continue
            arg_start = top['arg_start'] if top['arg_start'] is not None else pos(tok.start)
            if mode == 'eq':
                edits.append((arg_start, arg_start, 'Eq('))
                # Swallow the blanks around '=' when they are plain spaces: `a = b` -> `Eq(a, b)`
                left = pos(tok.start)
                right = pos(tok.end)
                while left > 0 and code[left - 1] in ' \t':
                    left -= 1
                while right < len(code) and code[right] in ' \t':
                    right += 1
                edits.append((left, right, ', '))
                edits.append((end_pos, end_pos, ')'))
            else:
                edits.append((pos(tok.start), pos(tok.end), '-('))
                edits.append((end_pos, end_pos, ')'))

    if not edits:
        return code

    # Apply from the end so earlier offsets stay valid. Stable order for equal starts.
    indexed = sorted(enumerate(edits), key=lambda e: (e[1][0], e[0]), reverse=True)
    out = code
    for _, (start, end, repl) in indexed:
        out = out[:start] + repl + out[end:]
    return out


_KEYWORDS_NOT_CALLS = frozenset({
    'if', 'elif', 'while', 'for', 'in', 'not', 'and', 'or', 'is', 'return', 'yield', 'await',
    'lambda', 'else', 'assert', 'del', 'with', 'as', 'import', 'from', 'raise',
})


def _owning_target_call(stack):
    """The target call (solve, dsolve, ...) an `=` belongs to, if any.

    Walks outwards through list/tuple/grouping brackets; stops at any other call.
    """
    for entry in reversed(stack):
        if entry['func'] is not None:
            return entry
        if entry['is_call'] or entry['kind'] == tokenize.LBRACE:
            return None
    return None


def _find_rhs_end(sig, eq_index, pos):
    """Offset just after the last significant token of the right-hand side."""
    depth = 0
    last_end = None
    for j in range(eq_index + 1, len(sig)):
        t = sig[j]
        et = t.exact_type
        if et in (tokenize.LPAR, tokenize.LSQB, tokenize.LBRACE):
            depth += 1
        elif et in (tokenize.RPAR, tokenize.RSQB, tokenize.RBRACE):
            depth -= 1
            if depth < 0:
                return pos(last_end) if last_end is not None else None
        elif et == tokenize.COMMA and depth == 0:
            return pos(last_end) if last_end is not None else None
        elif t.type == tokenize.ENDMARKER:
            break
        last_end = t.end
    return None
