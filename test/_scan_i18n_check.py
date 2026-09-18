# -*- coding: utf-8 -*-
"""i18n 覆盖校验 v4: 精确判定每个待查条目属于哪一类。
类别:
  KEY      条目是 UI_TEXT 词典 key
  PTN      条目被 translatePattern 某正则完整匹配
  PTN-SUB  条目是某个 translatePattern 完整句子的拼接片段(源码中拆开拼变量)
  LOG      条目所在源码行为 console.* 调用(开发者日志, 不面向用户, 不需翻译)
  LANG     条目是语言切换菜单里以原语书写的语言名(不翻译)
  MISSING  未覆盖, 需要人工补充
"""
import re, io, os

SRC = r'd:\软件开发项目\NoteBlockWeb\src\static\js\i18n.js'
REPORT = r'd:\软件开发项目\NoteBlockWeb\test\_scan_i18n_report3.txt'
ROOT = r'd:\软件开发项目\NoteBlockWeb\src\static\js'

js = io.open(SRC, encoding='utf-8').read()

# ---------- 1) UI_TEXT 中文 key ----------
dict_keys = set()
for m in re.finditer(r"(\r?\n|,|\{)(\s*)'([^'\\]*)'(\s*):", js):
    key = m.group(3)
    if re.search(r'[\u4e00-\u9fff]', key):
        dict_keys.add(key)

# ---------- 2) translatePattern 正则(中文源模式 + 英文目标) ----------
pm = re.search(r'function translatePattern\(text\)\s*\{(.*?)\n    \}\n\n    function translate\(text\)', js, re.S)
body = pm.group(1) if pm else ''
pat_srcs = []            # 中文源模式(正则原文, 去掉首尾 ^$)
pat_comps = []           # 已编译正则
for rm in re.finditer(r'\[\s*/\^([^/]+)\$/', body):
    pat_srcs.append(rm.group(1))
    try:
        pat_comps.append(re.compile('^' + rm.group(1) + '$'))
    except Exception:
        pass

def strip_punc(s):
    """去首尾空白和一批常见尾标点, 得到可供子串匹配的核心片段."""
    return s.strip().strip('：:，。！？?()（）·\'"\\n').strip()

# ---------- 3) 逐条判定 ----------
def classify(txt, srcfile, lineno):
    s = txt.strip()
    if s in dict_keys:
        return 'KEY'
    for p in pat_comps:
        try:
            if p.match(s):
                return 'PTN'
        except Exception:
            pass
    core = strip_punc(s)
    if core:
        # 片段是否是某个完整句(词条或正则源)的组成部分
        for k in dict_keys:
            if core and core in k:
                return 'PTN-SUB'
        for ps in pat_srcs:
            if core and core in ps:
                return 'PTN-SUB'
    # 语言名(旗标+原语名称), 不翻译
    if '🇨🇳' in s or '🇯🇵' in s or '🇺🇸' in s:
        return 'LANG'
    # console 日志: 打开源文件定位该行
    if srcfile and lineno:
        fname = srcfile if srcfile.endswith('.js') else srcfile + '.js'
        p = os.path.join(ROOT, fname)
        try:
            lines = io.open(p, encoding='utf-8').read().split('\n')
            if lineno - 1 < len(lines) and re.search(r'console\.(log|info|warn|error|debug)', lines[lineno - 1]):
                return 'LOG'
        except Exception:
            pass
    return 'MISSING'

entries = []   # (file, line, text)
cur_file = ''
for line in io.open(REPORT, encoding='utf-8'):
    line = line.rstrip('\n')
    if line.startswith('==='):
        cur_file = line.strip('= ').strip()
        continue
    m = re.match(r'^(?:L(\d+):\s*|(attr|text):\s*)', line)
    if not m:
        continue
    lineno = int(m.group(1)) if m.group(1) else None
    vals = re.findall(r'"([^"]*)"', line)
    txt = vals[0] if vals else ''
    if not txt:
        continue
    entries.append((cur_file, lineno, txt))

stats = {}
out = []
for srcfile, lineno, txt in entries:
    cat = classify(txt, srcfile, lineno)
    stats[cat] = stats.get(cat, 0) + 1
    out.append('%-12s %s:%s -> %s' % (cat, srcfile, lineno or '-', txt))

io.open(r'd:\软件开发项目\NoteBlockWeb\test\_scan_i18n_check_result.txt', 'w', encoding='utf-8').write('\n'.join(out))
print(' | '.join('%s=%d' % (k, v) for k, v in sorted(stats.items())), '| total=%d' % len(entries))