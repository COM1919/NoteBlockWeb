# -*- coding: utf-8 -*-
"""修复 i18n.js 中误插的 ja-JP 块：从 pt-BR 块内移除，恢复 pt-BR 结尾与 id-ID 头"""
import io

P = r'd:\软件开发项目\NoteBlockWeb\src\static\js\i18n.js'
lines = io.open(P, encoding='utf-8').read().split('\n')

# 1-indexed: L626~L670 是误插的 ja 新块（含 'コピー' 开头行与 'カスタム楽器' 结尾行）
# 验证边界
def show(idx):
    print(idx, ':', lines[idx - 1][:80])

print('--- before ---')
show(625); show(626); show(670); show(671); show(672); show(673)

assert lines[625].strip().startswith("[/^(.+) \\(副本\\)$/, '$1 (コピー)']"), lines[625]
assert lines[669].strip().startswith("[/^(.+) \\(导入\\)$/, '$1（インポート）'], [/^(.+) \\(自定义音色\\)$/, '$1（カスタム楽器）']"), lines[669]

replacement = [
    "                [/^(.+) \\(副本\\)$/, '$1 (cópia)'],",
    "                [/^(.+) · (\\d+) 音轨 · (\\d+) 音符$/, '$1 · $2 faixa(s) · $3 nota(s)']",
    "            ],",
    "            'id-ID': [",
]
# lines[625:670] → 删除 620末位... 实际 0-based: L626-1=625 起，到 L670-1=669，即 lines[625:670]
lines = lines[:625] + replacement + lines[670:]

io.open(P, 'w', encoding='utf-8').write('\n'.join(lines))
print('--- after ---')
print(lines[625][:80]); print(lines[626][:80]); print(lines[627][:80]); print(lines[628][:80])
print(lines[629][:80])
print('done')