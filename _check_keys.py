# -*- coding: utf-8 -*-
import re
src = open(r'd:\软件开发项目\NoteBlockWeb\src\static\js\i18n.js', encoding='utf-8').read()
pairs = re.findall(r"'((?:[^'\\]|\\.)*)'\s*:\s*'(?:[^'\\]|\\.)*'", src)
pairs += re.findall(r'"((?:[^"\\]|\\.)*)"\s*:\s*"(?:[^"\\]|\\.)*"', src)
keys = set(p for p in pairs if re.search(r'[\u4e00-\u9fff]', p))
print('total zh keys:', len(keys))
for k in ['格式','码率','风格','间隔 (空位数量)：','选择缩放倍数：','不限','不变','重命名','试听','更换颜色','导出为音频','消除重复音符','查找音符','导入音色','音色备份','音频修正','半音','音分','转换','重新检测','完成','自动调整','图标颜色','基准音高','预览显示','试听(低7)','试听(高7)']:
    print(('OK   ' if k in keys else 'MISS ') + k)