// 歌曲压缩 (compressSongCore) 算法回归测试
// 用法: node _verify_compress.js [NBS目录]   (传 - 跳过文件测试)
// 默认目录: C:\Users\MSI\Desktop\Big制作\Nbs
'use strict';
global.window = globalThis;
var fs = require('fs');
var path = require('path');
(0, eval)(fs.readFileSync(path.join(__dirname, '..', 'src/static/js/nbs_client.js'), 'utf8'));

var compress = window.compressSongCore;
var estimate = window.compressSongEstimate;
var QS = [0.01, 0.1, 0.2, 0.4, 0.6, 0.8, 0.99];
var PCT = [1, 10, 20, 40, 60, 80, 99];
var MODELS = ['heuristic', 'perceptual'];
var pass = 0, fail = 0;

function check(name, cond, detail, quiet) {
    if (cond) { pass++; if (!quiet) console.log('  [PASS] ' + name); }
    else { fail++; console.log('  [FAIL] ' + name + (detail ? '  ' + detail : '')); }
}
function mkNote(tick, layer, instrument, key, velocity) {
    return { id: 'n' + tick + '_' + layer + '_' + key, tick: tick, layer: layer, instrument: instrument, key: key, velocity: velocity, pan: 50, pitch: 0 };
}
// 与 main.js doCompressSong 一致: 传入副本, 保证不改写调用方对象
function cloneNotes(notes) {
    return notes.map(function (n) {
        return { id: n.id, tick: n.tick, layer: n.layer, instrument: n.instrument, key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch };
    });
}
function countDupes(notes) {
    var seen = {}, d = 0;
    for (var i = 0; i < notes.length; i++) {
        var k = notes[i].tick + ':' + notes[i].instrument + ':' + notes[i].key;
        if (seen[k]) d++; else seen[k] = true;
    }
    return d;
}
console.log('== 单元: 合成数据 ==');
(function () {
    var base = [
        mkNote(0, 0, 0, 60, 100), mkNote(0, 1, 0, 60, 100),   // 完全重复 (必删)
        mkNote(4, 0, 0, 55, 100), mkNote(4, 1, 0, 55, 100),   // 完全重复 (必删)
        mkNote(8, 0, 1, 36, 100),                              // 低音
        mkNote(12, 0, 0, 48, 80), mkNote(12, 1, 0, 60, 80),    // 根音 + 高音
        mkNote(16, 0, 0, 45, 40),                              // 弱拍短音
        mkNote(20, 0, 2, 36, 100)                              // 打击乐(大鼓)
    ];
    var ctx = { ticksPerBeat: 16, reorder: true };
    var total = base.length;
    var dupes = countDupes(base);
    var remain = total - dupes;

    MODELS.forEach(function (model) {
        var prevRemoved = -1;
        QS.forEach(function (q, qi) {
            var work = cloneNotes(base);
            var res = compress(work, q, model, ctx);
            var keptN = res.kept.length, remN = res.removed.length;
            // 期望删除量: 99% 档 = 仅去重; 其余 = 去重 + round(remain*(1-q))
            var expRemoved = (q >= 0.99) ? dupes : dupes + Math.round(remain * (1 - q));
            if (q < 0.99 && expRemoved > total - 1) expRemoved = total - 1;
            check(model + ' Q=' + PCT[qi] + '% 删除量符合公式', remN === expRemoved,
                '实际=' + remN + ' 期望=' + expRemoved);
            check(model + ' Q=' + PCT[qi] + '% 守恒且保留>0',
                keptN + remN === total && keptN > 0, 'kept=' + keptN + ' rem=' + remN);
            if (prevRemoved >= 0) {
                check(model + ' Q=' + PCT[qi] + '% 删除量单调不增',
                    remN <= prevRemoved, '本次=' + remN + ' 上档=' + prevRemoved);
            }
            prevRemoved = remN;
            // 预估与实际一致
            var est = estimate(base, q);
            check(model + ' Q=' + PCT[qi] + '% 预估=实际', est.deleted === remN,
                '预估=' + est.deleted + ' 实际=' + remN);
            // 原始数组未被改写 (撤销安全)
            check(model + ' Q=' + PCT[qi] + '% 不改写调用方对象',
                base.every(function (n, i) { return n.layer === base[i].layer; }));
        });
    });

    // 两模型删除数量必须一致 (仅"删哪些"不同)
    QS.forEach(function (q, qi) {
        var a = compress(cloneNotes(base), q, 'heuristic', ctx).removed.length;
        var b = compress(cloneNotes(base), q, 'perceptual', ctx).removed.length;
        check('Q=' + PCT[qi] + '% 两模型删除数量一致', a === b, 'heuristic=' + a + ' perceptual=' + b);
    });
})();

console.log('== 单元: 轨道选择 (减轻处理 / 不处理) ==');
(function () {
    var notes = [];
    for (var i = 0; i < 10; i++) notes.push(mkNote(i * 4, 0, 0, 60 + i, 100));    // 正常层
    for (var j = 0; j < 10; j++) notes.push(mkNote(100 + j * 4, 1, 0, 50 + j, 100)); // 减轻层
    for (var k = 0; k < 6; k++) notes.push(mkNote(200 + k * 4, 2, 0, 40 + k, 100));  // 不处理层
    notes.push(mkNote(200, 2, 0, 40, 100));   // 不处理层内部的重复音符 (不应被去重)
    var q = 0.4;
    var ctx = { ticksPerBeat: 16, reorder: false, lightenLayers: [1], excludeLayers: [2] };
    var work = notes.map(function (n) { return Object.assign({}, n); });
    var res = compress(work, q, 'heuristic', ctx);
    // 正常层删 round(10*0.6)=6; 减轻层删 round(10*0.6*0.5)=3; 不处理层 7 个全留
    check('选轨: 删除数符合分组配额', res.removed.length === 9,
        '实际=' + res.removed.length + ' 期望=9');
    var keptExcluded = res.kept.filter(function (n) { return n.layer === 2; }).length;
    check('选轨: 不处理层原样保留(含重复)', keptExcluded === 7, '实际=' + keptExcluded);
    var keptLight = res.kept.filter(function (n) { return n.layer === 1; }).length;
    check('选轨: 减轻层删除强度减半(保留7)', keptLight === 7, '实际=' + keptLight);
    var est = estimate(notes, q, { lightenLayers: [1], excludeLayers: [2] });
    check('选轨: 预估=实际', est.deleted === res.removed.length,
        '预估=' + est.deleted + ' 实际=' + res.removed.length);
    // 不处理层完全不参与去重: 其内部重复音符必须双双存活
    var dupAlive = res.kept.filter(function (n) { return n.layer === 2 && n.tick === 200 && n.key === 40; }).length;
    check('选轨: 不处理层不参与去重', dupAlive === 2, '实际=' + dupAlive);
})();

// ============ 文件测试 ============
var dir = process.argv[2];
if (dir === '-' || !dir) dir = 'C:\\Users\\MSI\\Desktop\\Big制作\\Nbs';
var files = [];
try { files = fs.readdirSync(dir).filter(function (f) { return /\.nbs$/i.test(f); }); }
catch (e) { console.log('目录不存在: ' + dir); process.exit(1); }
if (!files.length) { console.log('无 nbs 文件: ' + dir); process.exit(1); }

console.log('\n== 文件测试: ' + files.length + ' 个 NBS (保留数随质量档位) ==');
var fileProblems = 0;
var sums = {};
MODELS.forEach(function (m) { QS.forEach(function (q) { sums[m + '@' + q] = { f: 0, bad: 0, nonmono: 0, mismatch: 0 }; }); });
var worstHeur = 0, worstPerc = 0, worstFile = '';

files.forEach(function (fname) {
    var buf = fs.readFileSync(path.join(dir, fname));
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var song = window.NBSClient._parseNBS(ab);
    var notes = song.notes;
    if (!notes || notes.length < 2) return;
    var tpb = Math.max(1, song.tempo || 30);
    var total = notes.length, dupes = countDupes(notes), remain = total - dupes;

    MODELS.forEach(function (model) {
        var prev = -1, line = '';
        QS.forEach(function (q) {
            var work = cloneNotes(notes);
            var t0 = Date.now();
            var res = compress(work, q, model, { ticksPerBeat: tpb, reorder: true });
            var ms = Date.now() - t0;
            if (model === 'heuristic' && ms > worstHeur) { worstHeur = ms; worstFile = fname; }
            if (model === 'perceptual' && ms > worstPerc) { worstPerc = ms; }
            var keptN = res.kept.length, remN = res.removed.length;
            var st = sums[model + '@' + q]; st.f++;
            var expRemoved = (q >= 0.99) ? dupes : dupes + Math.round(remain * (1 - q));
            if (q < 0.99 && expRemoved > total - 1) expRemoved = total - 1;
            if (keptN < 1 || keptN + remN !== total) { st.bad++; fileProblems++; }
            if (remN !== expRemoved) { st.mismatch++; fileProblems++; }
            if (prev >= 0 && remN > prev) { st.nonmono++; fileProblems++; }  // 质量升高时删除量不应增加
            prev = remN;
            line += ' [' + PCT[QS.indexOf(q)] + '%]' + keptN;
        });
        console.log('  ' + fname + ' orig=' + total + '  ' + model + line);
    });
});

console.log('\n== 汇总 ==');
MODELS.forEach(function (m) {
    QS.forEach(function (q) {
        var st = sums[m + '@' + q];
        var bad = st.bad + st.mismatch + st.nonmono;
        console.log('  ' + m + ' Q=' + q + ': 文件=' + st.f + ' 异常=' + bad + (bad ? '  <--' : ''));
    });
});
console.log('\n最慢: heuristic=' + worstHeur + 'ms (' + worstFile + '), perceptual=' + worstPerc + 'ms');

console.log('\n== 模型差异检查 (heuristic vs perceptual 删除集合是否真的不同) ==');
var diffPairs = 0, samePairs = 0, totalPairs = 0, worstSame = [];
files.forEach(function (fname) {
    var buf = fs.readFileSync(path.join(dir, fname));
    var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    var song = window.NBSClient._parseNBS(ab);
    var notes = song.notes;
    if (!notes || notes.length < 2) return;
    var tpb = Math.max(1, song.tempo || 30);
    QS.forEach(function (q) {
        if (q >= 0.99) return;                     // 99% 两模型都只去重, 必然相同
        var ra = compress(cloneNotes(notes), q, 'heuristic', { ticksPerBeat: tpb, reorder: false });
        var rb = compress(cloneNotes(notes), q, 'perceptual', { ticksPerBeat: tpb, reorder: false });
        var setA = {}, setB = {};
        ra.removed.forEach(function (n) { setA[n.id] = 1; });
        rb.removed.forEach(function (n) { setB[n.id] = 1; });
        var d = 0;
        ra.removed.forEach(function (n) { if (!setB[n.id]) d++; });
        rb.removed.forEach(function (n) { if (!setA[n.id]) d++; });
        totalPairs++;
        if (d > 0) diffPairs++; else { samePairs++; worstSame.push(fname + '@' + q); }
    });
});
console.log('  (文件,档位) 组合=' + totalPairs + ' 删除集合不同=' + diffPairs + ' 完全相同=' + samePairs);
if (worstSame.length) console.log('  完全相同样例: ' + worstSame.slice(0, 6).join(', '));
// 两种模型必须真的不同 (否则"选哪个模型"没有意义)
check('两模型删除集合在所有(文件,档位)组合下均不同', samePairs === 0 && totalPairs > 0,
    '不同=' + diffPairs + ' 相同=' + samePairs);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败 (单元) | 文件级问题=' + fileProblems);
process.exit(fail > 0 || fileProblems > 0 ? 1 : 0);
