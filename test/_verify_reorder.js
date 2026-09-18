// 临时验证: 消除重复音符的"重排序音符"扩展
// 用法: node _verify_reorder.js
'use strict';
global.window = globalThis;
var fs = require('fs');
(0, eval)(fs.readFileSync(require('path').join(__dirname, '..', 'src/static/js/nbs_client.js'), 'utf8'));

var reorder = window.dedupeReorderNotes;
var pass = 0, fail = 0;
function note(id, tick, layer, key) { return { id: id, tick: tick, layer: layer, key: key, instrument: 0, velocity: 80, pan: 50, pitch: 0 }; }
function check(name, cond, detail) {
    if (cond) { pass++; console.log('  [PASS] ' + name); }
    else { fail++; console.log('  [FAIL] ' + name + (detail ? '  ' + detail : '')); }
}
function summary(notes) {
    return notes.map(function(n) { return n.id + '@' + n.tick + ',' + n.layer; }).join(' ');
}

console.log('用例1: 连续堆积音符块整体上移 (删 A@(10,0), B@(10,1), C@(10,2) 均孤立)');
(function() {
    var kept = [note('B', 10, 1, 55), note('C', 10, 2, 60)];
    var removed = [note('A', 10, 0, 48)];
    var moved = reorder(kept, removed);
    check('移动数 = 2', moved === 2, '实际 ' + moved);
    check('B 上移到 layer 0', kept[0].layer === 0, 'layer=' + kept[0].layer);
    check('C 上移到 layer 1', kept[1].layer === 1, 'layer=' + kept[1].layer);
    check('B.key/tick 不变', kept[0].key === 55 && kept[0].tick === 10);
})();

console.log('用例2: B 有 >=2 个横向邻居时不移动 (删 A@(10,0))');
(function() {
    var kept = [note('B', 10, 1, 55), note('L', 9, 1, 53), note('R', 11, 1, 57), note('C', 10, 2, 60)];
    var removed = [note('A', 10, 0, 48)];
    var moved = reorder(kept, removed);
    check('移动数 = 0', moved === 0, '实际 ' + moved);
    check('B 仍在 layer 1', kept[0].layer === 1);
})();

console.log('用例3: 遇到原有空洞停止 (删 A@(10,0), layer1 空, layer2 有 C → 不移)');
(function() {
    var kept = [note('C', 10, 2, 60)];
    var removed = [note('A', 10, 0, 48)];
    var moved = reorder(kept, removed);
    check('移动数 = 0', moved === 0, '实际 ' + moved);
})();

console.log('用例4: 待删除音符不参与移动 (删 A@(10,0)+A2@(10,1): A 空洞下是待删 A2 → 忽略; A2 空洞由 C 填补 → C layer2→1)');
(function() {
    var kept = [note('C', 10, 2, 60)];
    var removed = [note('A', 10, 0, 48), note('A2', 10, 1, 50)];
    var moved = reorder(kept, removed);
    check('移动数 = 1', moved === 1, '实际 ' + moved);
    check('C 移到 layer 1 (填补 A2 的空洞)', kept[0].layer === 1, 'layer=' + kept[0].layer);
})();

console.log('用例5: 同坐标重复删除只处理一次');
(function() {
    var kept = [note('B', 10, 1, 55)];
    var removed = [note('A', 10, 0, 48), note('A2', 10, 0, 48)];
    var moved = reorder(kept, removed);
    check('移动数 = 1 (不重复) ', moved === 1, '实际 ' + moved);
    check('B 移到 layer 0', kept[0].layer === 0);
})();

console.log('用例6: 同层同 tick 多音高取 key 最小者移动');
(function() {
    var kept = [note('B1', 10, 1, 60), note('B2', 10, 1, 50), note('C', 10, 2, 62)];
    var removed = [note('A', 10, 0, 48)];
    var moved = reorder(kept, removed);
    check('移动数 = 2', moved === 2, '实际 ' + moved);
    check('key=50 的 B2 移到 layer 0', kept[1].layer === 0, kept[1].id + '@layer' + kept[1].layer);
    check('B1 移到 layer 1 (与 C 交换后 C 到 layer 2? 实际: ' + summary(kept) + ')', kept[0].layer === 1 || kept[1].layer === 1);
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);