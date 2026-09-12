// 运行时验证 i18n 翻译：加载 i18n.js，切换语言，对真实句子样例调用 translate()
const fs = require('fs');
const path = 'src/static/js/i18n.js';
global.NodeFilter = { SHOW_TEXT: 4 };
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.CustomEvent = class { constructor(type) { this.type = type; } };
global.window = {};
global.navigator = { languages: ['en-US'] };
global.document = {
  documentElement: {},
  title: '',
  createTreeWalker: () => ({ nextNode: () => false }),
  body: {},
  querySelectorAll: () => [],
  querySelector: () => null,
  dispatchEvent: () => {},
};
eval(fs.readFileSync(path, 'utf8'));
const I18n = global.window.WebNBSI18n;

// 真实运行时句子样例（依据 main.js / nbs_client.js 等源码中的拼接逻辑构造）
const samples = {
  'en-US': [
    '音符: 128', '位置: 256', '已选择: mysong.nbs', '乐器 12', '乐器 #20 · 1.25s · 立体声 · 基准 C4',
    '乐器 #19 · 单声道 · 基准 F#3', '自定义音色 1', '自定义音色 #25', '导入音色 3', '23 轨道', '45 音符',
    '通道 2 · 12 音符', '鼓音符 36 · Kick Drum 1', '音轨 4(通道2)', 'C4 (超出范围)',
    'MIDI 文件格式损坏或数据不完整 (轨道 3)', '删除 Clip "intro"?', '来源文件: piano.mp3 (1.25 MB)',
    '来源文件: voice.mp3 (0.30 MB) · 已按修正结果转换', '检测音高: C4 · 440.0 Hz (+0 cents)',
    '当前修正倍率 ×1.0595。可点「试听」对比修正效果；满意后点下一步。',
    '播放修正后采样 · 倍率 ×1.0595 · 输出基准 C4', '已导入自定义音色「Piano」，可在乐器选择中选用',
    '确定删除自定义音色「Piano」吗？\n引用该音色的 NBS 文件中对应乐器将静音。',
    '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。',
    '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。\n\n提示: 有 3 个音符同一时间音调相同但音色不同 (instrument 不同)',
    '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。\n提示: 有 2 个音符同一时间音色相同但音调不同 (key 不同)\n提示: 有 5 个音符音色音调相同但时间不同 (tick 不同)',
    '将删除 6 个重复音符（同一时间、音色与音调完全相同的音符只保留一个，忽略音量差异），是否继续？',
    '已删除 6 个重复音符',
    '作品包已导出，包含 2 个自定义音色音频。\n把 zip 分享给他人，导入后即可完整还原音色与歌曲。',
    '作品包导出失败: 网络错误', 'NBS 打包失败: 未知错误', '已导出 3 个音色的备份。浏览器数据丢失后可随时导入恢复。',
    '备份导出失败: 磁盘已满', '已存在同名音色「Piano」，但音频内容不同。\n\n请选择处理方式：',
    '音色备份导入完成（3 项）。', '压缩包缺少 custom/20.ogg', '无法识别的压缩包类型: unknown', '导入失败: 文件损坏',
    'Piano (导入)', 'Piano (自定义音色)', '未能检测到稳定音高（可能非单音或过短）。可手动用下方滑块设定，或换一段更清晰的单音采样。',
    '变速渲染失败，请重试', '请输入一个新的名称：', '已处理 12 个音符，超出 Minecraft 标准音域的音符已按八度折叠。',
    '音轨 3', '长度 16 步 · 8 个音符', '已选择 2 个轨道', '范围: C4 ~ C6 (2 个八度)',
  ],
  'ja-JP': [
    '已删除 6 个重复音符', '将删除 6 个重复音符（同一时间、音色与音调完全相同的音符只保留一个，忽略音量差异），是否继续？',
    '已导入自定义音色「Piano」，可在乐器选择中选用', '确定删除自定义音色「Piano」吗？\n引用该音色的 NBS 文件中对应乐器将静音。',
    '乐器 #20 · 1.25s · 立体声 · 基准 C4', '未发现重复音符。\n判定标准: 同一时间(tick) + 相同音色 + 相同音调，忽略音量差异。',
  ],
  'pt-BR': [
    '已删除 6 个重复音符', '乐器 #20 · 1.25s · 立体声 · 基准 C4', '导入失败: 文件损坏',
  ],
  'id-ID': [
    '已删除 6 个重复音符', '乐器 #20 · 1.25s · 立体声 · 基准 C4', '压缩包缺少 custom/20.ogg',
  ],
};

let fail = 0;
let warn = 0;
for (const locale of Object.keys(samples)) {
  I18n.apply(locale); // 或内部 setLocale? 直接 apply
  for (const s of samples[locale]) {
    const out = I18n.translate ? I18n.translate(s) : '(translate不可用)';
    const cjk = /[\u4e00-\u9fff]/.test(out);         // 汉字
    const kana = /[\u3040-\u30ff]/.test(out);        // 日文假名
    // ja-JP: 有假名即视为已本地化; 仅汉字(含日文汉字)无假名是可疑残留
    const leaked = locale === 'ja-JP' ? (cjk && !kana) : (cjk || /[\u3040-\u30ff]/.test(out));
    const status = leaked ? (locale === 'ja-JP' ? 'WARN(无假名,需人工确认)' : 'FAIL(残留中文)') : 'ok';
    if (leaked) {
      if (locale === 'ja-JP') warn++; else fail++;
      console.log(`[${locale}] ${status} | IN: ${s.slice(0, 45)} | OUT: ${out.slice(0, 60)}`);
    } else console.log(`[${locale}] OK | ${out.slice(0, 58)}`);
  }
}
console.log('\n=== 残留失败:', fail, '| ja-JP 可疑:', warn, '===');
process.exit(fail ? 1 : 0);