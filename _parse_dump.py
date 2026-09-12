# -*- coding: utf-8 -*-
import re, io
html = io.open(r'd:\软件开发项目\NoteBlockWeb\_render_test_dump.html', encoding='utf-8').read()
m = re.search(r'<div id="result">(.*?)</div>', html, re.S)
if m:
    txt = m.group(1)
    txt = re.sub(r'<br[^>]*>', '\n', txt)
    txt = re.sub(r'<[^>]+>', '', txt)
    print(txt.strip())
else:
    print('NO RESULT DIV FOUND')
    # 兜底: 打印所有 div 文本
    for mm in re.finditer(r'<div[^>]*>(.*?)</div>', html, re.S):
        t = re.sub(r'<[^>]+>', '', mm.group(1))
        if t.strip():
            print('DIV:', t.strip()[:500])