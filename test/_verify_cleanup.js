// 清理后一致性校验：index.html 引用的资源是否齐全、task-progress 弹窗 id 是否与 main.js 匹配
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'src', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let failed = 0;

// 1) 所有本地 src/href 引用必须存在
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const isLocal = (r) => !/^(https?:|data:|#|mailto:|tel:|javascript:)/.test(r);
const missing = refs
    .filter(isLocal)
    .map((r) => r.replace(/^\//, '').split('?')[0])
    .filter((r) => !fs.existsSync(path.join(root, 'src', r)));
console.log('[1] 本地资源引用数:', refs.filter(isLocal).length);
if (missing.length) {
    console.log('    缺失文件:', missing);
    failed++;
} else {
    console.log('    缺失文件: (无) OK');
}

// 2) task-progress 弹窗结构
const ids = [...html.matchAll(/id="(task-progress[^"]*)"/g)].map((m) => m[1]);
console.log('[2] index.html 中 task-progress* id:', ids.join(', ') || '(无)');
const main = fs.readFileSync(path.join(root, 'src', 'static', 'js', 'main.js'), 'utf8');
const used = [...new Set([...main.matchAll(/task-progress-([a-z]+)/g)].map((m) => m[1]))];
console.log('    main.js 使用:', used.join(', '));
const missingIds = used.filter((u) => !ids.includes('task-progress-' + u));
if (missingIds.length) {
    console.log('    main.js 引用但 html 缺失:', missingIds);
    failed++;
} else {
    console.log('    id 全部匹配 OK');
}

// 3) 源码中不得残留 fls / upload 标识符
const scanDirs = [path.join(root, 'src')];
const hits = [];
function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) {
            if (name === 'vendor' || name === 'sounds' || name === 'sprites') continue;
            walk(p);
        } else if (/\.(js|css|html)$/.test(name)) {
            const txt = fs.readFileSync(p, 'utf8');
            txt.split(/\r?\n/).forEach((line, i) => {
                if (/fls|upload/i.test(line)) hits.push(path.relative(root, p) + ':' + (i + 1) + ': ' + line.trim());
            });
        }
    }
}
scanDirs.forEach(walk);
console.log('[3] src 中 fls/upload 残留:');
if (hits.length) {
    hits.forEach((h) => console.log('    ' + h));
    failed++;
} else {
    console.log('    (无) OK');
}

// 4) FLS JS 文件应已删除
const flsFiles = fs.readdirSync(path.join(root, 'src', 'static', 'js')).filter((f) => /^fls/i.test(f));
console.log('[4] 残留 FLS JS 文件:', flsFiles.length ? flsFiles.join(', ') : '(无) OK');
if (flsFiles.length) failed++;

// 5) 路径可移植性: HTML 不得再有以 "/" 开头的 /static 引用
const absRefs = [...html.matchAll(/(?:src|href)="\/(?:static[^"]*)"/g)].map((m) => m[1]);
console.log('[5] index.html 中残留的绝对 /static 引用:', absRefs.length ? absRefs.join(', ') : '(无) OK');
if (absRefs.length) failed++;

// 6) 业务 JS 内不得再硬编码 '/static/..., 应使用 window.STATIC_BASE
const jsDir = path.join(root, 'src', 'static', 'js');
const hardcoded = [];
for (const name of fs.readdirSync(jsDir)) {
    if (!name.endsWith('.js')) continue;
    const txt = fs.readFileSync(path.join(jsDir, name), 'utf8');
    txt.split(/\r?\n/).forEach((line, i) => {
        if (/['"]\/static\//.test(line)) hardcoded.push(name + ':' + (i + 1) + ': ' + line.trim());
    });
}
console.log('[6] JS 内硬编码 /static/ 路径:');
if (hardcoded.length) { hardcoded.forEach((h) => console.log('    ' + h)); failed++; }
else console.log('    (无) OK');

// 7) 基址表达式在两种协议下的解析结果
const fileBase = new URL('static', 'file:///D:/proj/src/index.html').href.replace(/\/$/, '');
const httpBase = '/static';
console.log('[7] file:// 基址 ->', fileBase + '/sounds/harp.ogg');
console.log('    http  基址 ->', httpBase + '/sounds/harp.ogg');
if (fileBase !== 'file:///D:/proj/src/static') { console.log('    file:// 基址解析异常'); failed++; }

console.log(failed ? '\n结果: FAIL (' + failed + ' 项)' : '\n结果: PASS');
process.exit(failed ? 1 : 0);
