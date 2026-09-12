# -*- coding: utf-8 -*-
"""v3: 精确扫描 —— 区分 innerHTML 文本节点 / 纯文本串 / 属性值。"""
import re, os, sys, json

ROOT = r'd:\软件开发项目\NoteBlockWeb\src\static\js'
HTML = r'd:\软件开发项目\NoteBlockWeb\src\index.html'
I18N = os.path.join(ROOT, 'i18n.js')

CJK = re.compile(r'[\u4e00-\u9fff]')
CJK_WORD = re.compile(r'[\u4e00-\u9fff]{2,}')

src = open(I18N, encoding='utf-8').read()

def extract_zh_keys(text):
    keys = set()
    for m in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:\s*'(?:[^'\\]|\\.)*'", text):
        k = m.group(1).replace("\\'", "'")
        if CJK.search(k): keys.add(k)
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"\s*:\s*"(?:[^"\\]|\\.)*"', text):
        k = m.group(1).replace('\\"', '"')
        if CJK.search(k): keys.add(k)
    return keys

def extract_matches(pattern, obj):
    out = []
    for m in pattern.finditer(obj):
        out.append((m.start(), m.end()))
    return out

# --- 精确提取 en-US 词典 (所有命名空间的 en-US) ---
# i18n.js 中 en-US 词典 = 初始 UI_TEXT['en-US'] + 所有 Object.assign(UI_TEXT['en-US'], ...) +
# addLocale(..., en 词条在第三参)。脚本只提取 en-US 的。
en_keys = set()

# 1) var UI_TEXT = { 'en-US': { ... } }
m = re.search(r'\bvar UI_TEXT\s*=\s*\{', src)
if m:
    # 从 m.end() 找第一个 { (en-US 对象)
    i = m.end()
    depth = 0
    start = None
    while i < len(src) and depth < 2:
        if src[i] == '{':
            depth += 1
            if depth == 1: start = i + 1
        elif src[i] == '}':
            depth -= 1
        i += 1
    if start is not None:
        en_keys |= extract_zh_keys(src[start:i-1])

# 2) Object.assign(UI_TEXT['en-US'], {...}) —— 顺序扫描全部
for m in re.finditer(r"Object\.assign\(UI_TEXT\[[^]]+\],", src):
    # 找对应 { ... } 块
    j = src.find('{', m.end())
    depth = 0
    k = j
    while k < len(src):
        if src[k] == '{': depth += 1
        elif src[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    seg = src[j+1:k]
    if "['en-US']" in m.group(0) or "['en-US']" in m.group(0):
        en_keys |= extract_zh_keys(seg)
    # 也收集 (保险: 字典值可能含中文字符串) 但只 en-US

print('en keys:', len(en_keys), file=sys.stderr)

# --- translatePattern en-US 正则 ---
pattern_regexes = []
pm = re.search(r"function translatePattern\(text\) \{(.*?)var list = patterns\[current\]", src, re.S)
if pm:
    body = pm.group(1)
    m2 = re.search(r"'en-US'\s*:\s*\[(.*?)\n\s*\]\s*,", body, re.S)
    if m2:
        for r in re.finditer(r"/((?:[^/\\\n]|\\.)+)/", m2.group(1)):
            pat = r.group(1).replace('\\/', '/')
            if '\n' in pat: continue
            try: pattern_regexes.append(re.compile(pat))
            except re.error: print('BAD REGEX', pat, file=sys.stderr)
print('en patterns:', len(pattern_regexes), file=sys.stderr)

def pattern_covers(s):
    for p in pattern_regexes:
        if p.fullmatch(s) or p.match(s):
            return True
    return False

def covered(s):
    if not s: return True
    if not CJK_WORD.search(s): return True
    return s in en_keys or pattern_covers(s)

def html_text_segments(html):
    """从 HTML 片段中提取可见文本节点段(去标签/脚本/内联样式前缀)。"""
    # 去掉 style="..." 等属性
    h = re.sub(r'\s(style|class|id|data-[a-z\-]+|title|placeholder|type|value|name|for|aria-[a-z\-]*)\s*=\s*("[^"]*"|\'[^\']*\')', ' ', html)
    h = h.replace('&times;', '×').replace('&nbsp;', ' ').replace('&gt;', '>').replace('&lt;', '<').replace('&amp;', '&').replace('&#39;', "'").replace('&quot;', '"')
    # 文本节点: 拆出 >...<
    nodes = re.findall(r'>([^<>]+)<', h)
    out = []
    for nd in nodes:
        nd = nd.strip()
        if CJK_WORD.search(nd):
            out.append(nd)
    return out

# --- 逐文件扫描 ---
def scan_js(path):
    code = open(path, encoding='utf-8').read()
    results = []
    i, n = 0, len(code)
    line = 1
    while i < n:
        c = code[i]
        if c == '\n': line += 1; i += 1; continue
        if c == '/' and i + 1 < n and code[i+1] == '/':
            j = code.find('\n', i); i = n if j == -1 else j; continue
        if c == '/' and i + 1 < n and code[i+1] == '*':
            j = code.find('*/', i + 2)
            if j == -1: break
            line += code[i:j+2].count('\n'); i = j + 2; continue
        if c in ('"', "'", '`'):
            quote = c
            j = i + 1
            buf = [c]
            while j < n:
                ch = code[j]
                if ch == '\\':
                    buf.append(code[j:j+2]); j += 2; continue
                if ch == quote:
                    buf.append(ch); j += 1; break
                if ch == '\n': break
                buf.append(ch); j += 1
            text = ''.join(buf)
            line_start = line
            if CJK.search(text):
                ctx_start = i - 60 if i - 60 >= 0 else 0
                ctx = code[ctx_start:i].split('\n')[-1]
                results.append((line_start, text, ctx))
            line += text.count('\n')
            i = j; continue
        i += 1
    return results, code

files = [f for f in os.listdir(ROOT) if f.endswith('.js') and f != 'i18n.js']
miss_all = {}
for fn in sorted(files):
    results, code = scan_js(os.path.join(ROOT, fn))
    fmiss = []
    for line, lit, ctx in results:
        inner = lit
        if len(inner) >= 2 and inner[0] in ('"', "'", '`') and inner[-1] == inner[0]:
            inner = inner[1:-1]
        if not CJK_WORD.search(inner):
            continue
        # 判断这是否是 HTML 片段
        if '<' in inner and '>' in inner:
            segs = html_text_segments(inner)
            for s in segs:
                if not covered(s):
                    fmiss.append((line, '[HTML] ' + json.dumps(s, ensure_ascii=False)))
        elif inner.startswith('\\'):
            continue
        else:
            if not covered(inner):
                fmiss.append((line, json.dumps(inner, ensure_ascii=False)))
    if fmiss:
        miss_all[fn] = fmiss

for fn in sorted(miss_all):
    print('=' * 30, fn, '=' * 10)
    seen = set()
    for line, s in miss_all[fn]:
        if s in seen: continue
        seen.add(s)
        print('L%d: %s' % (line, s))

# --- HTML 属性/文本 ---
def scan_html(path):
    html = open(path, encoding='utf-8').read()
    issues = []
    for m in re.finditer(r'\b(title|data-tip|placeholder|aria-label)\s*=\s*"([^"]*)"', html):
        val = m.group(2)
        if CJK_WORD.search(val):
            issues.append(('attr:' + m.group(1), val))
    body = re.search(r'<body[^>]*>(.*)', html, re.S)
    if body:
        frag2 = re.sub(r'<(script|style)[\s\S]*?</\1>', ' ', body.group(1))
        frag2 = re.sub(r'<!--[\s\S]*?-->', ' ', frag2)
        segs = [s.strip() for s in re.split(r'<[^>]+>', frag2)]
        for seg in segs:
            if CJK_WORD.search(seg):
                issues.append(('text', seg))
    return issues

print('=' * 30, 'HTML', '=' * 10)
seen = set()
for kind, val in scan_html(HTML):
    if val in seen: continue
    seen.add(val)
    if kind == 'text':
        # 文本节点可能需要按展开标签拆分, 对于 index.html 中内嵌 span 的整段, 直接校验整段
        if not covered(val):
            print('%s: %s' % (kind, json.dumps(val, ensure_ascii=False)))
    else:
        if not covered(val):
            print('%s: %s' % (kind, json.dumps(val, ensure_ascii=False)))