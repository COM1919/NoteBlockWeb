// 临时验证脚本: 用精简 MIDI 验证 _convertMidiToNBS 输出的 pitch 字段
// 修复前 pitch = 音符长度(ticks) 0~255; 修复后应为 0
// 用法: node _verify_pitch_fix.js
'use strict';

// ---- 浏览器全局 shim ----
global.window = globalThis;
if (!global.window.localStorage) global.window.localStorage = { getItem: function(){ return null; }, setItem: function(){} };

var fs = require('fs');
// 间接 eval 在全局作用域执行, 使脚本顶层的 var NBSClient 成为全局变量 (与浏览器行为一致)
(0, eval)(fs.readFileSync(require('path').join(__dirname, '..', 'src/static/js/nbs_client.js'), 'utf8'));

// ---- 构造最小 MIDI (format 0, 1 track, PPQ=480) ----
// 事件: tempo 120BPM (500000us) + C4 (MIDI 60) note-on/note-off
// 时长为 6000 ticks (12.5 拍 ≈ 6.25s @120bpm) → 旧逻辑 noteLength = floor(6000/60) = 100 → pitch=100
function buildMidi() {
    var bytes = [];
    function push(d) { for (var i = 0; i < d.length; i++) bytes.push(d[i] & 0xFF); }
    function u16(v) { push([(v >> 8) & 0xFF, v & 0xFF]); }
    function u32(v) { push([(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]); }
    function varLen(v) {
        var out = [];
        v &= 0x0FFFFFFF;
        out.unshift(v & 0x7F);
        while ((v >>= 7) > 0) out.unshift(0x80 | (v & 0x7F));
        return out;
    }
    function meta(type, data) {
        var d = [0xFF, type & 0xFF]; Array.prototype.push.apply(d, varLen(data.length));
        Array.prototype.push.apply(d, data);
        return d;
    }
    // MThd
    push([0x4D, 0x54, 0x68, 0x64]); u32(6); u16(0); u16(1); u16(480);
    // MTrk
    var track = [];
    var tempo = meta(0x51, [0x07, 0xA1, 0x20]); // 500000us = 120bpm
    Array.prototype.push.apply(track, [0x00]); Array.prototype.push.apply(track, tempo);
    // note C4 on at tick 0
    Array.prototype.push.apply(track, [0x00, 0x90, 60, 100]);
    // note off after 6000 ticks
    var dOff = varLen(6000); Array.prototype.push.apply(track, dOff);
    Array.prototype.push.apply(track, [0x80, 60, 0]);
    // End of track
    Array.prototype.push.apply(track, [0x00]); Array.prototype.push.apply(track, meta(0x2F, []));
    push([0x4D, 0x54, 0x72, 0x6B]); u32(track.length); push(track);
    return new Uint8Array(bytes).buffer;
}

var buffer = buildMidi();
// 关闭掉可能导致跳动解析偏差的设置: 使用默认设置
var settings = {};
var song = null;
try {
    song = NBSClient._convertMidiToNBS(buffer, settings);
    console.log('=== 转换结果 ===');
    console.log('tempo:', song.tempo);
    var notes = song.notes || [];
    console.log('音符数量:', notes.length);
    for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        console.log('note[' + i + '] key=' + n.key + ' pitch=' + n.pitch + ' tick=' + n.tick + ' vel=' + n.velocity);
    }
    var bad = notes.filter(function(n) { return n.pitch !== 0; });
    if (bad.length > 0) {
        console.log('\n[FAIL] 存在 pitch != 0 的音符: ' + bad.length + ' 个 (预期全部为 0)');
        process.exit(1);
    } else {
        console.log('\n[PASS] 所有音符 pitch 均为 0 (修复生效)');
        // 补充: 演示修复前会产生的问题
        var noteLength = Math.max(1, Math.floor(6000 / 60));
        var oldPitch = Math.min(255, Math.max(0, noteLength));
        console.log('旧逻辑演示: 该音符长度=' + noteLength + ' ticks → 旧 pitch=' + oldPitch
            + ' → 播放速率 ×' + Math.pow(2, oldPitch / 1200).toFixed(4)
            + ' (≈+' + (oldPitch) + ' 音分, ' + (oldPitch / 100).toFixed(1) + ' 半音)');
        process.exit(0);
    }
} catch (err) {
    console.error('转换失败:', err && err.stack || err);
    process.exit(2);
}