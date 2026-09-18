# -*- coding: utf-8 -*-
"""批量打印 _scan_i18n_check_result.txt 中 MISSING 条目的源码上下文"""
import io, re, os

ROOT = r'd:\软件开发项目\NoteBlockWeb\src\static\js'
RESULT = r'd:\软件开发项目\NoteBlockWeb\test\_scan_i18n_check_result.txt'

# 文件缓存
cache = {}
def get_lines(fname):
    if fname not in cache:
        p = os.path.join(ROOT, fname)
        cache[fname] = io.open(p, encoding='utf-8').read().split('\n')
    return cache[fname]

for line in io.open(RESULT, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line.startswith('*** MISSING'):
        continue
    # 格式: *** MISSING Lxxx: -> 文本 :: ==== 文件
    m = re.match(r'\*\*\* MISSING L(\d+): -> (.*?) :: =+ ([^ =].*?) =+$', line)
    if not m:
        continue
    ln, txt, fname = int(m.group(1)), m.group(2), m.group(3)
    lines = get_lines(fname)
    if ln - 1 >= 0 and ln - 1 < len(lines):
        ctx = lines[ln - 2] if ln >= 2 else ''
        cur = lines[ln - 1]
        nxt = lines[ln] if ln < len(lines) else ''
        ctx = ctx.strip()
        cur = cur.strip()
        nxt = nxt.strip()
        line_ctx = ('[%s L%d] %s  |||  %s  |||  %s' % (fname, ln, ctx[:110], cur[:110], nxt[:110]))
        print(line_ctx)