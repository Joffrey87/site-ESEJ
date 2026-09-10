"""Extraction (à usage unique) : transforme les pages Divi aspirées en
- templates/shell.html            (enveloppe : head, header/menu, footer, scripts)
- templates/blocks/*.html         (bibliothèque de blocs, classes renommées, placeholders {{...}})
- assets/theme.css                (CSS générique Divi consolidé)
- assets/blocks.css               (CSS des blocs, indépendant de la position)
- content/*.json                  (contenu initial extrait des pages, fidèle à l'existant)
Exécuter depuis site-esej-repo/."""
import os, re, json, glob, copy
from bs4 import BeautifulSoup, NavigableString
from markdownify import markdownify as md
import sys
sys.path.insert(0, os.path.dirname(__file__))
from csslib import parse_rules, rule_to_css, indexed_classes, rules_for_classes, is_indexed_rule, rename, strip_declaration, split_selectors

PAGES = ['index', 'notre-ecole', 'notre-projet', 'nous-aider', 'faq', 'contact', 'don', 'mentions-legales']
OUT_T = 'templates'; OUT_B = 'templates/blocks'
os.makedirs(OUT_B, exist_ok=True); os.makedirs('assets', exist_ok=True); os.makedirs('content/pages', exist_ok=True)

_cache = {}
def load(page):
    if page in _cache: return _cache[page]
    raw = open(page + '.html', encoding='utf-8').read()
    soup = BeautifulSoup(raw, 'lxml')
    css = ''
    for st in soup.head.find_all('style'):
        if st.get('id') in ('esej-visibility',): continue
        css += st.get_text() + '\n'
    for lk in soup.head.find_all('link'):
        href = lk.get('href', '')
        if ('et-cache' in href or 'helloasso' in href) and href.split('?')[0].endswith('.css'):
            path = href.split('?')[0]
            if os.path.exists(path): css += open(path, encoding='utf-8').read() + '\n'
    rules = parse_rules(css)
    _cache[page] = (soup, rules, raw)
    return _cache[page]

def html_of(el):
    s = ''.join(str(c) for c in el.children) if el else ''
    return re.sub(r'\n\s*\n+', '\n', s).strip()

def to_md(html):
    html = re.sub(r'<p>\s*(&nbsp;|\xa0| )?\s*</p>', '<p>&amp;nbsp;</p>', html)  # paragraphes vides conservés (ligne blanche)
    html = re.sub(r'<span>([^<]{1})</span>', r'\1', html)        # lettrines <span>É</span>
    text = md(html, heading_style='ATX', bullets='-', strip=['span'])
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text

def two_tone(h):
    """Retourne (partie sombre, partie dorée) d'un titre à deux couleurs, et remplace par placeholders."""
    accents = []
    for sp in h.find_all('span', recursive=False):
        st = (sp.get('style') or '').replace(' ', '').lower()
        if 'e5ae47' in st or 'ffffff' in st:
            accents.append(sp.get_text(' ', strip=True)); sp.extract()
    dark = re.sub(r'\s+', ' ', h.get_text(' ', strip=True)).strip()
    return dark, ' '.join(accents).strip()

def set_heading(h, dark_ph, accent_ph, dark_color, accent_color='#e5ae47'):
    h.clear()
    from bs4 import Tag
    sp1 = Tag(name='span'); sp1['style'] = 'color: %s;' % dark_color; sp1.string = '{{%s}} ' % dark_ph
    sp2 = Tag(name='span'); sp2['style'] = 'color: %s;' % accent_color; sp2.string = '{{%s}}' % accent_ph
    h.append(sp1); h.append(sp2)

def rich_after_heading(inner):
    """Dans un et_pb_text_inner : sépare le titre (h1-h4 premier) du reste ; remplace le reste par {{{ph}}}."""
    h = inner.find(['h1', 'h2', 'h3', 'h4'])
    rest = []
    for c in list(inner.children):
        if c is h: continue
        if h is not None and c in list(h.next_siblings): rest.append(c)
        elif h is None: rest.append(c)
    html = ''.join(str(c) for c in rest)
    for c in rest: c.extract()
    return h, html

def set_image(img, ph):
    for a in ('srcset', 'sizes', 'width', 'height', 'fetchpriority', 'decoding', 'class'):
        if a in img.attrs: del img[a]
    img['src'] = '{{%s}}' % ph; img['alt'] = '{{%s_alt}}' % ph; img['title'] = ''
    par = img.find_parent('a')
    if par is not None and 'et_pb_lightbox_image' in (par.get('class') or []):
        par['href'] = '{{%s}}' % ph

def block_css(page, section_html, prefix, strip_bg=False):
    soup, rules, _ = load(page)
    classes = indexed_classes(section_html)
    mapping = {c: 'esej-%s-%s' % (prefix, c.replace('et_pb_', '').replace('_', '')) for c in classes}
    kept = rules_for_classes(rules, classes)
    out = []
    for media, sel, decl in kept:
        if strip_bg and 'background-image' in decl and re.search(r'\.et_pb_section_\d+', sel):
            decl = strip_declaration(decl, 'background-image')
            if not decl: continue
        out.append(rename(rule_to_css((media, sel, decl)), mapping))
    return rename(section_html, mapping), '\n'.join(out), mapping

def fix_urls(css):
    # les CSS sont servis depuis assets/ : les chemins relatifs doivent remonter d'un niveau
    return re.sub(r"url\((['\"]?)(?!https?:|data:|/|\.\./)", lambda m: 'url(' + m.group(1) + '../', css)

BLOCKS_CSS = []
def save_block(name, html, css):
    open(os.path.join(OUT_B, name + '.html'), 'w', encoding='utf-8').write(html + '\n')
    BLOCKS_CSS.append('/* bloc %s */\n%s' % (name, css))

def section(page, idx):
    soup, _, _ = load(page)
    return copy.copy(soup.select_one('.et_pb_section_%d' % idx))

# ---------------------------------------------------------------- blocs standard
def extract_titre_page():
    sec = section('notre-ecole', 0)
    h = sec.find('h1'); set_heading(h, 'titre', 'titre_accent', '#021d51')
    html, css, _ = block_css('notre-ecole', str(sec), 'titre')
    save_block('titre_page', html, css)

def extract_intro():
    sec = section('notre-ecole', 1)
    inner = sec.select_one('.et_pb_text_inner')
    h, rest = rich_after_heading(inner)
    set_heading(h, 'titre', 'titre_accent', '#010133')
    inner.append(NavigableString('{{{texte}}}'))
    sec['style'] = 'background-image: url({{image_fond}});'
    html, css, _ = block_css('notre-ecole', str(sec), 'intro', strip_bg=True)
    css = css.replace('font-size:42px;line-height:1.3em', 'font-size:42px;line-height:1.1em')
    save_block('intro', html, css)

def extract_texte_image(page, idx, name, dark, accent='#e5ae47'):
    sec = section(page, idx)
    inner = sec.select_one('.et_pb_text_inner')
    h, rest = rich_after_heading(inner)
    set_heading(h, 'titre', 'titre_accent', dark, accent)
    inner.append(NavigableString('{{{texte}}}'))
    set_image(sec.find('img'), 'image')
    html, css, _ = block_css(page, str(sec), name)
    save_block(name, html, css)

def extract_texte():
    sec = section('notre-ecole', 4)
    inner = sec.select_one('.et_pb_text_inner')
    h, rest = rich_after_heading(inner); set_heading(h, 'titre', 'titre_accent', '#010133')
    inner.append(NavigableString('{{{texte}}}'))
    html, css, _ = block_css('notre-ecole', str(sec), 'texte')
    save_block('texte', html, css)

def extract_deux_colonnes():
    sec = section('notre-ecole', 5)
    inners = sec.select('.et_pb_text_inner')
    for i, inner in enumerate(inners[:2], 1):
        h, rest = rich_after_heading(inner); set_heading(h, 'titre%d' % i, 'titre_accent%d' % i, '#010133')
        inner.append(NavigableString('{{{texte%d}}}' % i))
    html, css, _ = block_css('notre-ecole', str(sec), 'deuxcol')
    save_block('deux_colonnes', html, css)

def extract_texte_long():
    sec = section('mentions-legales', 1)
    inner = sec.select_one('.et_pb_text_inner'); inner.clear(); inner.append(NavigableString('{{{texte}}}'))
    html, css, _ = block_css('mentions-legales', str(sec), 'long')
    save_block('texte_long', html, css)

def extract_cta():
    sec = section('notre-ecole', 8)
    inners = sec.select('.et_pb_text_inner')
    inners[0].clear(); inners[0].append(BeautifulSoup('<h2>{{titre}}</h2>', 'html.parser'))
    inners[1].clear(); inners[1].append(BeautifulSoup('<p>{{texte}}</p>', 'html.parser'))
    a = sec.select_one('a.et_pb_button'); a['href'] = '{{lien}}'; a.string = '{{bouton}}'
    html, css, _ = block_css('notre-ecole', str(sec), 'cta')
    save_block('cta', html, css)

def extract_liste_promos():
    """Section conteneur + 2 gabarits de ligne (image à droite / à gauche) issus de nous-aider."""
    sec = section('nous-aider', 2)
    rows = sec.select('.et_pb_row')
    rowR, rowL = copy.copy(rows[0]), copy.copy(rows[1])
    for row in (rowR, rowL):
        inners = row.select('.et_pb_text_inner')
        inners[0].clear(); inners[0].append(BeautifulSoup('<p>{{numero}}</p>', 'html.parser'))
        promo = row.select_one('.et_pb_promo_description')
        promo.clear(); promo.append(BeautifulSoup('<h2 class="et_pb_module_header">{{titre}}</h2><div>{{{texte}}}</div>', 'html.parser'))
        set_image(row.find('img'), 'image')
    for r in rows: r.extract()
    sec.append(NavigableString('{{{lignes}}}'))
    full_html = str(sec) + str(rowR) + str(rowL)
    html_all, css, mapping = block_css('nous-aider', full_html, 'promos')
    css = re.sub(r'\.esej-promos-row\d\.et_pb_row\{margin-top:50px!important\}\n?', '', css)  # marge gérée par build.js
    sec_html = rename(str(sec), mapping); rR = rename(str(rowR), mapping); rL = rename(str(rowL), mapping)
    rR = rR.replace('class="et_pb_row esej-promos-row2"', 'class="et_pb_row esej-promos-row2" style="margin-top:{{marge}}"')
    rL = rL.replace('class="et_pb_row esej-promos-row3"', 'class="et_pb_row esej-promos-row3" style="margin-top:{{marge}}"')
    save_block('liste_promos', sec_html, css)
    open(os.path.join(OUT_B, 'liste_promos__ligne_droite.html'), 'w', encoding='utf-8').write(rR + '\n')
    open(os.path.join(OUT_B, 'liste_promos__ligne_gauche.html'), 'w', encoding='utf-8').write(rL + '\n')

# ---------------------------------------------------------------- pages à gabarit fixe
def inner_content(page):
    soup, _, _ = load(page)
    return copy.copy(soup.select_one('.et_builder_inner_content'))

def extract_accueil():
    ic = inner_content('index')
    s0 = ic.select_one('.et_pb_section_0')
    h1 = s0.find('h1'); h1.clear()
    h1.append(BeautifulSoup('<span style="color: #ffffff;">{{hero_titre}}</span><br /><span style="color: #e5ae47;">{{hero_titre_accent}}</span>', 'html.parser'))
    hero_txt = s0.select('.et_pb_text_inner')[1]; hero_txt.clear(); hero_txt.append(NavigableString('{{{hero_texte}}}'))
    a = s0.select_one('a.et_pb_button'); a['href'] = '{{hero_lien}}'; a.string = '{{hero_bouton}}'
    for at in ('data-cms', 'data-cms-href', 'data-cms-para'):
        for el in ic.find_all(attrs={at: True}): del el[at]
    pbg = s0.select_one('.et_parallax_bg'); pbg['style'] = 'background-image: url({{hero_image}});'
    s1 = ic.select_one('.et_pb_section_1')
    t = s1.select('.et_pb_text_inner'); t[0].clear(); t[0].append(BeautifulSoup('<h2><span style="color: #e5ae47;">{{zoom_titre}}</span></h2>', 'html.parser'))
    t[1].clear(); t[1].append(NavigableString('{{{zoom_texte}}}'))
    for i, b in enumerate(s1.select('.et_pb_blurb'), 1):
        b.select_one('h4 span').string = '{{atout%d_titre}}' % i
        d = b.select_one('.et_pb_blurb_description'); d.clear(); d.append(NavigableString('{{{atout%d_texte}}}' % i))
    s2 = ic.select_one('.et_pb_section_2'); t = s2.select('.et_pb_text_inner')
    t[0].clear(); t[0].append(BeautifulSoup('<h2>{{photos_titre}}</h2>', 'html.parser')); t[1].clear(); t[1].append(NavigableString('{{{photos_texte}}}'))
    s3 = ic.select_one('.et_pb_section_3')
    for i, img in enumerate(s3.find_all('img'), 1): set_image(img, 'photo%d' % i)
    s4 = ic.select_one('.et_pb_section_4'); t = s4.select_one('.et_pb_text_inner'); t.clear(); t.append(NavigableString('{{{mission_texte}}}'))
    s6 = ic.select_one('.et_pb_section_6'); t = s6.select('.et_pb_text_inner')
    t[0].clear(); t[0].append(BeautifulSoup('<h2>{{cta_titre}}</h2>', 'html.parser')); t[1].clear(); t[1].append(BeautifulSoup('<p>{{cta_texte}}</p>', 'html.parser'))
    a = s6.select_one('a.et_pb_button'); a['href'] = '{{cta_lien}}'; a.string = '{{cta_bouton}}'
    html, css, _ = block_css('index', html_of(ic), 'accueil')
    save_block('page_accueil', html, css)

def extract_contact():
    ic = inner_content('contact')
    h1 = ic.find('h1'); set_heading(h1, 'titre', 'titre_accent', '#021d51')
    s1 = ic.select_one('.et_pb_section_1'); inner = s1.select_one('.et_pb_text_inner'); inner.clear()
    inner.append(BeautifulSoup('<h4>{{adresse_nom}}</h4>\n<p>{{adresse_rue}}<br />{{adresse_ville}}</p>\n<p>{{telephone}}</p>\n<p>{{email}}</p>', 'html.parser'))
    m = ic.select_one('.et_pb_section_2'); m.clear()  # carte Google (jamais rendue sans clé API) -> carte OpenStreetMap
    m.append(BeautifulSoup('<div class="et_pb_module et_pb_map_container esej-carte"><iframe title="Plan d\'accès" src="{{carte_url}}" loading="lazy" '
                           'style="width:100%;height:440px;border:0;display:block;filter:saturate(30%)"></iframe></div>', 'html.parser'))
    s4 = ic.select_one('.et_pb_section_4'); t = s4.select('.et_pb_text_inner')
    t[0].clear(); t[0].append(BeautifulSoup('<h2>{{contact_titre}}</h2>', 'html.parser')); t[1].clear(); t[1].append(NavigableString('{{{contact_texte}}}'))
    for inp in ic.select('input[name=access_key]'): inp['value'] = '{{web3forms_key}}'
    for inp in ic.select('input[name=subject]'): inp['value'] = '{{formulaire_sujet}}'
    html, css, _ = block_css('contact', html_of(ic), 'contact')
    save_block('page_contact', html, css)

def extract_don():
    ic = inner_content('don')
    fr = ic.find('iframe'); fr['src'] = '{{helloasso_url}}'
    s1 = ic.select_one('.et_pb_section_1'); t = s1.select('.et_pb_text_inner')
    t[0].clear(); t[0].append(BeautifulSoup('<h2>{{contact_titre}}</h2>', 'html.parser')); t[1].clear(); t[1].append(NavigableString('{{{contact_texte}}}'))
    for inp in ic.select('input[name=access_key]'): inp['value'] = '{{web3forms_key}}'
    for inp in ic.select('input[name=subject]'): inp['value'] = '{{formulaire_sujet}}'
    html, css, _ = block_css('don', html_of(ic), 'don')
    save_block('page_don', html, css)

# ---------------------------------------------------------------- enveloppe
def extract_shell():
    soup, _, raw = load('index')
    doc = copy.copy(soup)
    head = doc.head
    for el in list(head.children):
        if getattr(el, 'name', None) is None: el.extract(); continue
        keep = False
        if el.name == 'meta' and el.get('charset'): keep = True
        if el.name == 'meta' and el.get('name') in ('viewport', 'robots'): keep = True
        if el.name == 'meta' and el.get('http-equiv') == 'X-UA-Compatible': keep = True
        if el.name == 'link' and el.get('rel') and ('icon' in el.get('rel') or 'apple-touch-icon' in el.get('rel')): keep = True
        if el.name == 'link' and 'fonts.googleapis.com/css' in (el.get('href') or ''): keep = True
        if el.name == 'link' and el.get('rel') == ['dns-prefetch']: keep = True
        if el.name == 'script' and 'jqueryParams' in (el.get_text() or ''): keep = True  # shim jQuery différé (Divi)
        if el.name == 'script' and el.get('src'): keep = True  # jQuery, jquery-migrate, helloasso
        if el.name == 'script' and 'documentElement.className' in (el.get_text() or ''): keep = True
        if not keep: el.extract()
    frag = BeautifulSoup(
        '<title>{{page_titre}} - {{site_nom}}</title>\n<meta name="description" content="{{page_description}}">\n'
        '<link rel="canonical" href="{{page_url}}">\n<meta property="og:locale" content="fr_FR"><meta property="og:type" content="website">'
        '<meta property="og:title" content="{{page_titre}} - {{site_nom}}"><meta property="og:site_name" content="{{site_nom}}">\n'
        '<link rel="stylesheet" href="assets/theme.css">\n<link rel="stylesheet" href="assets/blocks.css">\n', 'html.parser')
    head.append(frag)
    body = doc.body
    body['class'] = [c for c in body.get('class', []) if not c.startswith('page-id-') and c not in ('home', 'current_page_item')]
    # menus
    top = doc.select_one('#top-menu'); top.clear(); top.append(NavigableString('{{{menu_principal}}}'))
    bottom = doc.select_one('#menu-menu-secondaire'); bottom.clear(); bottom.append(NavigableString('{{{menu_pied}}}'))
    # logo & réseaux
    logo = doc.select_one('#logo'); logo['src'] = '{{site_logo}}'; logo['alt'] = '{{site_nom}}'
    fb = doc.select_one('.et-social-facebook a'); fb['href'] = '{{facebook}}'
    ig = doc.select_one('.et-social-instagram a'); ig['href'] = '{{instagram}}'
    # contenu
    ic = doc.select_one('.et_builder_inner_content'); ic.clear(); ic.append(NavigableString('{{{contenu}}}'))
    art = doc.select_one('article'); art['id'] = 'post-{{page_slug}}'; art['class'] = ['page', 'type-page', 'status-publish', 'hentry']
    # pied de page + cadenas discret
    fi = doc.select_one('#footer-info'); fi.clear()
    fi.append(BeautifulSoup('{{pied_de_page}} <a class="esej-admin-lock" href="admin/" title="Administration" aria-label="Administration">'
                            '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V6zm7 13H7v-9h10v9z"/></svg></a>', 'html.parser'))
    # crayon au survol du coin haut-droit
    body.append(BeautifulSoup('<div class="esej-admin-corner"><a href="admin/" title="Modifier le site" aria-label="Modifier le site">'
                                 '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></a></div>', 'html.parser'))
    # scripts : retirer animation data + cms.js
    for sc in body.find_all('script'):
        txt = sc.get_text() or ''
        if 'et_animation_data' in txt or 'divi-style-inline-inline-css' in txt or (sc.get('src') or '').endswith('assets/cms.js'): sc.extract()
    html = str(doc)
    html = re.sub(r'<!-- Mirrored from.*?-->\s*', '', html, flags=re.S)
    html = re.sub(r'<!-- Added by HTTrack -->.*?<!-- /Added by HTTrack -->\s*', '', html, flags=re.S)
    html = re.sub(r'\n\s*\n+', '\n', html)
    open(os.path.join(OUT_T, 'shell.html'), 'w', encoding='utf-8').write(html)

# ---------------------------------------------------------------- CSS générique
def build_theme_css():
    seen, out = set(), []
    for p in PAGES:
        _, rules, _ = load(p)
        for r in rules:
            if is_indexed_rule(r): continue
            s = rule_to_css(r)
            if s in seen: continue
            seen.add(s); out.append(s)
    extra = '''
/* --- ESEJ : ajustements --- */
.et-waypoint,.et-animated,.et_animated,.et-pb-before-scroll-animation,.et_pb_section,.et_pb_row,.et_pb_column,.et_pb_module{opacity:1 !important;}
#footer-info .esej-admin-lock{display:inline-block;margin-left:6px;color:inherit;opacity:.45;vertical-align:middle;line-height:0}
#footer-info .esej-admin-lock:hover{opacity:1}
.esej-admin-corner{position:fixed;top:0;right:0;width:64px;height:64px;z-index:2147483000}
.esej-admin-corner a{position:absolute;top:10px;right:10px;width:28px;height:28px;border-radius:50%;background:#fff;color:#021d51;display:flex;align-items:center;justify-content:center;opacity:0;transform:translateY(-6px);transition:opacity .2s,transform .2s;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.esej-admin-corner:hover a,.esej-admin-corner a:focus{opacity:1;transform:translateY(0)}
'''
    open('assets/theme.css', 'w', encoding='utf-8').write(fix_urls('\n'.join(out)) + '\n' + extra)
    return len(out)

# ---------------------------------------------------------------- contenu initial
def text_after_heading_md(page, sec_idx, which=0):
    soup, _, _ = load(page)
    sec = soup.select_one('.et_pb_section_%d' % sec_idx)
    inner = sec.select('.et_pb_text_inner')[which]
    h = inner.find(['h1', 'h2', 'h3', 'h4'])
    dark, accent = two_tone(copy.copy(h)) if h else ('', '')
    rest = ''.join(str(c) for c in inner.children if c is not h)
    return dark, accent, to_md(rest)

def img_src(page, sec_idx, n=0):
    soup, _, _ = load(page)
    imgs = soup.select_one('.et_pb_section_%d' % sec_idx).find_all('img')
    return imgs[n]['src'] if imgs else ''

def section_bg(page, sec_idx):
    _, rules, _ = load(page)
    for media, sel, decl in rules:
        if media == 'raw': continue
        if re.search(r'\.et_pb_section_%d\b' % sec_idx, sel) and 'background-image' in decl:
            m = re.search(r'background-image:\s*url\(([^)]+)\)', decl)
            if m and 'fond-trame' not in m.group(1): return m.group(1).strip('\'"')
    return ''

def page_title(page):
    soup, _, _ = load(page)
    h = copy.copy(soup.select_one('.et_pb_section_0 h1'))
    return two_tone(h)

def promos(page, sec_idx):
    soup, _, _ = load(page)
    items = []
    for row in soup.select_one('.et_pb_section_%d' % sec_idx).select('.et_pb_row'):
        num = row.select_one('.et_pb_text_inner').get_text(strip=True)
        d = row.select_one('.et_pb_promo_description'); h = d.find('h2')
        body = ''.join(str(c) for c in d.children if c is not h)
        img = row.find('img')
        items.append({'numero': num, 'titre': h.get_text(strip=True), 'texte': to_md(body), 'image': img['src'] if img else '', 'image_alt': ''})
    return items

def std_page(slug, page, titre_menu, ordre, blocs, description='', pied=False, ordre_pied=0):
    dark, accent = page_title(page)
    data = {'slug': slug, 'titre_menu': titre_menu, 'ordre': ordre, 'afficher_menu': True, 'pied_de_page': pied, 'ordre_pied': ordre_pied,
            'gabarit': 'standard', 'titre': dark, 'titre_accent': accent, 'description': description, 'afficher_appel_don': True, 'blocs': blocs}
    json.dump(data, open('content/pages/%s.json' % slug, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

def extract_content():
    soup, _, _ = load('index')
    # --- réglages du site
    fi = soup.select_one('#footer-info').get_text(' ', strip=True)
    site = {'nom': 'Ecole du Saint-Enfant-Jésus', 'logo': soup.select_one('#logo')['src'],
            'facebook': soup.select_one('.et-social-facebook a')['href'], 'instagram': soup.select_one('.et-social-instagram a')['href'],
            'pied_de_page': re.sub(r'\s+', ' ', fi),
            'adresse_nom': 'Ecole du Saint-Enfant-Jésus', 'adresse_rue': '6 rue Colonel Charbonneaux', 'adresse_ville': '51000 REIMS',
            'telephone': '06 69 64 62 69', 'email': 'ecole@saint-enfant-jesus.fr',
            'helloasso_url': load('don')[0].find('iframe')['src'],
            'web3forms_key': (load('contact')[0].select_one('input[name=access_key]') or {}).get('value', 'VOTRE_CLE_WEB3FORMS'),
            'formulaire_sujet': "Nouveau message depuis le site de l'école",
            'carte_lat': 49.2707227, 'carte_lng': 4.007147, 'carte_zoom': 17,
            'appel_don_titre': 'Aidez-nous', 'appel_don_texte': 'Pour les enfants, pour le bien, le beau, le vrai', 'appel_don_bouton': 'Nous aider', 'appel_don_lien': 'don.html'}
    json.dump(site, open('content/site.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    # --- accueil
    ic = soup.select_one('.et_builder_inner_content')
    s0 = ic.select_one('.et_pb_section_0'); h1 = s0.find('h1'); spans = h1.find_all('span')
    hero_dark = spans[0].get_text(' ', strip=True) if spans else h1.get_text(strip=True)
    hero_gold = [sp for sp in spans if 'e5ae47' in (sp.get('style') or '') and sp.get_text(strip=True)]
    hero_gold = hero_gold[-1].get_text(strip=True) if hero_gold else ''
    hero_txt = to_md(''.join(str(c) for c in s0.select('.et_pb_text_inner')[1].children))
    btn = s0.select_one('a.et_pb_button')
    s1 = ic.select_one('.et_pb_section_1'); t1 = s1.select('.et_pb_text_inner')
    acc = {'titre_menu': 'Accueil', 'titre': 'Accueil', 'description': "Site de l'école du Saint-Enfant-Jésus (Reims), école catholique de la PS au CM2.",
           'hero_titre': hero_dark, 'hero_titre_accent': hero_gold, 'hero_texte': hero_txt, 'hero_bouton': btn.get_text(strip=True), 'hero_lien': btn['href'],
           'hero_image': re.search(r'url\(([^)]+)\)', s0.select_one('.et_parallax_bg')['style']).group(1).strip('\'"'),
           'zoom_titre': t1[0].get_text(' ', strip=True), 'zoom_texte': to_md(''.join(str(c) for c in t1[1].children))}
    for i, b in enumerate(s1.select('.et_pb_blurb'), 1):
        acc['atout%d_titre' % i] = b.select_one('h4').get_text(strip=True)
        acc['atout%d_texte' % i] = to_md(''.join(str(c) for c in b.select_one('.et_pb_blurb_description').children))
    s2 = ic.select_one('.et_pb_section_2'); t2 = s2.select('.et_pb_text_inner')
    acc['photos_titre'] = t2[0].get_text(strip=True); acc['photos_texte'] = to_md(''.join(str(c) for c in t2[1].children))
    for i, img in enumerate(ic.select_one('.et_pb_section_3').find_all('img'), 1):
        acc['photo%d' % i] = img['src']; acc['photo%d_alt' % i] = ''
    acc['mission_texte'] = to_md(''.join(str(c) for c in ic.select_one('.et_pb_section_4 .et_pb_text_inner').children))
    json.dump(acc, open('content/accueil.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    # --- pages standard
    def ti(page, idx, gauche, fond):
        d, a, t = text_after_heading_md(page, idx)
        return {'type': 'texte_image', 'titre': d, 'titre_accent': a, 'texte': t, 'image': img_src(page, idx), 'image_alt': '', 'image_a_gauche': gauche, 'fond': fond}
    def intro(page):
        d, a, t = text_after_heading_md(page, 1); return {'type': 'intro', 'titre': d, 'titre_accent': a, 'texte': t, 'image_fond': section_bg(page, 1)}
    d4, a4, t4 = text_after_heading_md('notre-ecole', 4)
    c1 = text_after_heading_md('notre-ecole', 5, 0); c2 = text_after_heading_md('notre-ecole', 5, 1)
    std_page('notre-ecole', 'notre-ecole', 'Notre école', 2, [
        intro('notre-ecole'), ti('notre-ecole', 2, False, 'dore'), ti('notre-ecole', 3, True, 'clair'),
        {'type': 'texte', 'titre': d4, 'titre_accent': a4, 'texte': t4},
        {'type': 'deux_colonnes', 'titre1': c1[0], 'titre_accent1': c1[1], 'texte1': c1[2], 'titre2': c2[0], 'titre_accent2': c2[1], 'texte2': c2[2]},
        ti('notre-ecole', 6, True, 'clair')], "Une école catholique libre fondée en 2022 par des parents, de la PS au CM2, à Reims.")
    std_page('notre-projet', 'notre-projet', 'Notre projet', 3, [
        intro('notre-projet'), ti('notre-projet', 2, False, 'clair'), ti('notre-projet', 3, True, 'dore'), ti('notre-projet', 4, True, 'clair')],
        "Notre pédagogie : l'éducation intégrale, en maternelle et au primaire.")
    std_page('nous-aider', 'nous-aider', 'Nous aider', 4, [intro('nous-aider'), {'type': 'liste_promos', 'elements': promos('nous-aider', 2)}],
             "Les moyens de nous aider : prières, dons, bénévolat.")
    std_page('faq', 'faq', 'FAQ', 5, [intro('faq'), {'type': 'liste_promos', 'elements': promos('faq', 2)}], "Foire aux questions : cantine, périscolaire, horaires, uniforme…")
    ml = load('mentions-legales')[0]
    std_page('mentions-legales', 'mentions-legales', 'Mentions légales', 8,
             [{'type': 'texte_long', 'texte': to_md(''.join(str(c) for c in ml.select_one('.et_pb_section_1 .et_pb_text_inner').children))}],
             'Mentions légales du site.', pied=True, ordre_pied=4)
    data = json.load(open('content/pages/mentions-legales.json', encoding='utf-8')); data['afficher_menu'] = False; data['afficher_appel_don'] = False
    json.dump(data, open('content/pages/mentions-legales.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    # --- contact & don (gabarits fixes)
    cs = load('contact')[0]; d, a = page_title('contact'); t = cs.select('.et_pb_section_4 .et_pb_text_inner')
    json.dump({'slug': 'contact', 'titre_menu': 'Contact', 'ordre': 6, 'afficher_menu': True, 'pied_de_page': True, 'ordre_pied': 2, 'gabarit': 'contact',
               'titre': d, 'titre_accent': a, 'description': "Contactez l'école du Saint-Enfant-Jésus à Reims.",
               'contact_titre': t[0].get_text(strip=True), 'contact_texte': to_md(''.join(str(c) for c in t[1].children))},
              open('content/pages/contact.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    ds = load('don')[0]; t = ds.select('.et_pb_section_1 .et_pb_text_inner')
    json.dump({'slug': 'don', 'titre_menu': 'Don', 'ordre': 7, 'afficher_menu': True, 'pied_de_page': True, 'ordre_pied': 3, 'gabarit': 'don',
               'titre': 'Don', 'titre_accent': '', 'description': "Faire un don à l'école du Saint-Enfant-Jésus.",
               'contact_titre': t[0].get_text(strip=True), 'contact_texte': to_md(''.join(str(c) for c in t[1].children))},
              open('content/pages/don.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

if __name__ == '__main__':
    extract_titre_page(); extract_intro()
    extract_texte_image('notre-projet', 2, 'texte_image', '#010133', '#e5ae47')
    extract_texte_image('notre-ecole', 2, 'texte_image_fonce', '#010133', '#ffffff')
    extract_texte_image('notre-ecole', 3, 'image_texte', '#010133', '#e5ae47')
    extract_texte_image('notre-projet', 3, 'image_texte_fonce', '#010133', '#ffffff')
    extract_texte(); extract_deux_colonnes(); extract_texte_long(); extract_cta(); extract_liste_promos()
    extract_accueil(); extract_contact(); extract_don()
    open('assets/blocks.css', 'w', encoding='utf-8').write(fix_urls('\n\n'.join(BLOCKS_CSS)) + '\n')
    n = build_theme_css()
    extract_shell()
    extract_content()
    print('theme.css règles:', n, '| blocs:', sorted(os.listdir(OUT_B)))
    print('content:', sorted(glob.glob('content/**/*.json', recursive=True)))
