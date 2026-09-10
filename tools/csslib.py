"""Mini parseur CSS (minifié Divi) : découpe en règles avec contexte @media, et utilitaires
pour sélectionner / renommer les classes indexées (.et_pb_text_3 -> .esej-bloc-text3)."""
import re

IDX_RE = re.compile(r'\bet_pb_(section|row|column|column_inner|row_inner|text|image|button|blurb|promo|cta|divider|code|gallery|icon|contact_form|specialty_fullwidth)_(\d+)\b')


def parse_rules(css):
    """Retourne une liste de (media, selecteur, declarations) en aplatissant les @media.
    Ignore @font-face/@keyframes/@import (renvoyés tels quels via 'raw')."""
    out = []
    i, n = 0, len(css)

    def match_block_end(start):
        depth = 0
        j = start
        while j < n:
            c = css[j]
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
                if depth == 0:
                    return j
            j += 1
        return n

    while i < n:
        m = re.match(r'\s*(/\*.*?\*/)', css[i:], re.S)
        if m:
            i += m.end(); continue
        m = re.match(r'\s*(@media[^{]*)\{', css[i:])
        if m:
            end = match_block_end(i + m.end() - 1)
            inner = css[i + m.end():end]
            for r in parse_rules(inner):
                out.append((m.group(1).strip(), r[1], r[2]) if r[0] == '' else (m.group(1).strip() + ' AND ' + r[0], r[1], r[2]))
            i = end + 1
            continue
        m = re.match(r'\s*(@(?:font-face|keyframes|-webkit-keyframes|supports|charset|import)[^{;]*)(\{|;)', css[i:])
        if m:
            if m.group(2) == ';':
                out.append(('raw', m.group(0).strip(), ''))
                i += m.end(); continue
            end = match_block_end(i + m.end() - 1)
            out.append(('raw', css[i:end + 1].strip(), ''))
            i = end + 1
            continue
        m = re.match(r'\s*([^{}]+?)\s*\{([^{}]*)\}', css[i:])
        if not m:
            i += 1
            continue
        out.append(('', m.group(1).strip(), m.group(2).strip()))
        i += m.end()
    return out


def rule_to_css(r):
    media, sel, decl = r
    if media == 'raw':
        return sel
    body = f"{sel}{{{decl}}}"
    if media:
        # imbrication de médias aplatie : on rouvre chaque @media
        parts = media.split(' AND ')
        for p in reversed(parts):
            body = f"{p}{{{body}}}"
    return body


def indexed_classes(html):
    return set('et_pb_%s_%s' % m for m in IDX_RE.findall(html))


def split_selectors(sel):
    # découpe sur les virgules hors parenthèses
    parts, depth, cur = [], 0, ''
    for ch in sel:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur.strip()); cur = ''
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def rules_for_classes(rules, classes):
    """Garde les règles (ou parties de listes de sélecteurs) qui ciblent une des classes indexées données."""
    kept = []
    cls_re = re.compile(r'\.(' + '|'.join(re.escape(c) for c in classes) + r')(?![\w-])')
    for media, sel, decl in rules:
        if media == 'raw':
            continue
        parts = [p for p in split_selectors(sel) if cls_re.search(p)]
        if parts:
            kept.append((media, ','.join(parts), decl))
    return kept


def is_indexed_rule(r):
    media, sel, decl = r
    if media == 'raw':
        return False
    return bool(IDX_RE.search(sel))


def rename(text, mapping):
    """Renomme les classes indexées dans du HTML ou du CSS selon mapping {ancien: nouveau}."""
    if not mapping:
        return text
    pat = re.compile(r'\b(' + '|'.join(re.escape(k) for k in sorted(mapping, key=len, reverse=True)) + r')(?![\w-])')
    return pat.sub(lambda m: mapping[m.group(1)], text)


def strip_declaration(decl, prop):
    """Retire une propriété (ex: background-image) d'un bloc de déclarations."""
    parts = [d for d in decl.split(';') if d.strip() and not d.strip().lower().startswith(prop.lower() + ':')]
    return ';'.join(p.strip() for p in parts)
