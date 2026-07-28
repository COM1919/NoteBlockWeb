/**
 * NBSClient - 客户端 NBS/MIDI 解析与转换
 *
 * 替代服务端 API:
 *   /api/song/load   -> NBSClient.loadNBS(file)
 *   /api/song/save   -> NBSClient.saveNBS(songData)
 *   /api/midi/info   -> NBSClient.getMidiInfo(file)
 *   /api/midi/import -> NBSClient.importMidi(file, settings)
 *
 * 这是一个普通脚本 (非 ES module), 创建全局 NBSClient 对象。
 * 所有二进制读取: NBS 使用小端序, MIDI 使用大端序。
 */

// ====================================================================
// 常量
// ====================================================================

var NBS_VERSION = 5;

// 导出版本号设置 (可通过设置面板修改, 但含新乐器时强制 V6)
// V5: 仅支持 0-15 号 vanilla 乐器
// V6: 支持 0-19 号 vanilla 乐器 (含铜号角系列)
window.NBS_EXPORT_VERSION = 5;

// GM Program -> [name, nbs_instrument, octave_offset]
// 完全复刻 nbs/midi_handler.py 中的 GM_PROGRAM_TABLE (128 项)
var GM_PROGRAM_TABLE = [
    // Piano (0-7)
    ["Acoustic Grand Piano", 0, 0],
    ["Bright Acoustic Piano", 15, 0],
    ["Electric Grand Piano", 15, 0],
    ["Honky-tonk Piano", 15, 0],
    ["Electric Piano 1", 0, 0],
    ["Electric Piano 2", 0, 0],
    ["Harpsichord", 5, 1],
    ["Clavinet", 14, 0],
    // Chromatic Percussion (8-15)
    ["Celesta", 7, -2],
    ["Glockenspiel", 7, -2],
    ["Music Box", 7, -2],
    ["Vibraphone", 10, 0],
    ["Marimba", 10, 0],
    ["Xylophone", 9, -2],
    ["Tubular Bells", 7, -2],
    ["Dulcimer", 5, 1],
    // Organ (16-23)
    ["Drawbar Organ", 6, -1],
    ["Percussive Organ", 10, 0],
    ["Rock Organ", 6, -1],
    ["Church Organ", 6, -1],
    ["Reed Organ", 6, -1],
    ["Accordion", 6, -1],
    ["Harmonica", 6, -1],
    ["Bandoneon", 6, -1],
    // Guitar (24-31)
    ["Acoustic Guitar (nylon)", 5, 1],
    ["Acoustic Guitar (steel)", 5, 1],
    ["Electric Guitar (jazz)", 0, 0],
    ["Electric Guitar (clean)", 5, 1],
    ["Electric Guitar (muted)", 1, 2],
    ["Overdriven Guitar", 12, 2],
    ["Distortion Guitar", 12, 2],
    ["Guitar Harmonics", 5, 3],
    // Bass (32-39)
    ["Acoustic Bass", 1, 2],
    ["Electric Bass (finger)", 1, 2],
    ["Electric Bass (pick)", 1, 2],
    ["Fretless Bass", 1, 2],
    ["Slap Bass 1", 5, 1],
    ["Slap Bass 2", 5, 1],
    ["Synth Bass 1", 1, 2],
    ["Synth Bass 2", 15, 0],
    // Strings (40-47)
    ["Violin", 6, -1],
    ["Viola", 6, -1],
    ["Cello", 6, -1],
    ["Contrabass", 6, -1],
    ["Tremolo Strings", 6, -1],
    ["Pizzicato Strings", 1, 2],
    ["Orchestral Harp", 0, 0],
    ["Timpani", 3, 0],
    // Ensemble (48-55)
    ["String Ensemble 1", 6, -1],
    ["String Ensemble 2", 6, -1],
    ["Synth Strings 1", 6, -1],
    ["Synth Strings 2", 6, -1],
    ["Choir Aahs", 6, -1],
    ["Voice Oohs", 6, -1],
    ["Synth Voice", 6, -1],
    ["Orchestra Hit", 3, -1],
    // Brass (56-63)
    ["Trumpet", 6, -1],
    ["Trombone", 6, -1],
    ["Tuba", 6, -1],
    ["Muted Trumpet", 12, 2],
    ["French Horn", 6, -1],
    ["Brass Section", 12, 2],
    ["Synth Brass 1", 12, 2],
    ["Synth Brass 2", 6, -1],
    // Reed (64-71)
    ["Soprano Sax", 6, -1],
    ["Alto Sax", 6, -1],
    ["Tenor Sax", 6, -1],
    ["Baritone Sax", 6, -1],
    ["Oboe", 6, -1],
    ["English Horn", 6, -1],
    ["Bassoon", 6, -1],
    ["Clarinet", 6, -1],
    // Pipe (72-79)
    ["Piccolo", 6, -1],
    ["Flute", 6, -1],
    ["Recorder", 6, -1],
    ["Pan Flute", 6, -1],
    ["Blown Bottle", 6, -1],
    ["Shakuhachi", 6, -1],
    ["Whistle", 6, -1],
    ["Ocarina", 6, -1],
    // Synth Lead (80-87)
    ["Lead 1 (square)", 13, 0],
    ["Lead 2 (sawtooth)", 6, -1],
    ["Lead 3 (calliope)", 6, -1],
    ["Lead 4 (chiff)", 6, -1],
    ["Lead 5 (charang)", 5, 1],
    ["Lead 6 (voice)", 6, -1],
    ["Lead 7 (fifths)", 6, -1],
    ["Lead 8 (bass + lead)", 1, 2],
    // Synth Pad (88-95)
    ["Pad 1 (new age)", 7, -2],
    ["Pad 2 (warm)", 6, -1],
    ["Pad 3 (polysynth)", 6, -1],
    ["Pad 4 (choir)", 6, -1],
    ["Pad 5 (bowed)", 6, -1],
    ["Pad 6 (metallic)", 6, -1],
    ["Pad 7 (halo)", 6, -1],
    ["Pad 8 (sweep)", 8, -2],
    // Synth Effects (96-103)
    ["FX 1 (rain)", 8, -2],
    ["FX 2 (soundtrack)", 6, -1],
    ["FX 3 (crystal)", 8, -2],
    ["FX 4 (atmosphere)", 5, 1],
    ["FX 5 (brightness)", 15, 0],
    ["FX 6 (goblins)", 6, -1],
    ["FX 7 (echoes)", 6, -1],
    ["FX 8 (sci-fi)", 5, 1],
    // Ethnic (104-111)
    ["Sitar", 14, 0],
    ["Banjo", 14, 0],
    ["Shamisen", 14, 0],
    ["Koto", 5, 1],
    ["Kalimba", 10, 0],
    ["Bag pipe", 6, -1],
    ["Fiddle", 6, -1],
    ["Shanai", 6, -1],
    // Percussive (112-119)
    ["Tinkle Bell", 8, -2],
    ["Agogo", 11, -1],
    ["Steel Drums", 10, 0],
    ["Woodblock", 9, -2],
    ["Taiko Drum", 2, 0],
    ["Melodic Tom", 3, 0],
    ["Synth Drum", 3, 0],
    ["Reverse Cymbal", 8, -2],
    // Sound Effects (120-127)
    ["Guitar Fret Noise", 4, 1],
    ["Breath Noise", 6, -1],
    ["Seashore", 8, -2],
    ["Bird Tweet", 6, 1],
    ["Telephone Ring", 7, 2],
    ["Helicopter", 2, 0],
    ["Applause", 3, 0],
    ["Gunshot", 3, 0]
];

// 鼓组音符映射 (Channel 9) - 完全复刻 midi_handler.py DRUM_NOTE_TABLE
// midi_drum[midi_note] = [name, nbs_instrument, nbs_key - 33]
var DRUM_NOTE_TABLE = {
    24: ["Cutting Noise(SFX)", 13, 39],
    25: ["Snare Roll", 3, 8],
    26: ["Finger Snap", 4, 25],
    27: ["High Q", 3, 18],
    28: ["Slap", 3, 27],
    29: ["Scratch Push", 4, 16],
    30: ["Scratch Pull", 4, 13],
    31: ["Sticks", 4, 9],
    32: ["Square Click", 4, 6],
    33: ["Metronome Click", 4, 2],
    34: ["Metronome Bell", 8, 17],
    35: ["Bass Drum 2", 2, 10],
    36: ["Bass Drum 1", 2, 6],
    37: ["Side Stick", 4, 6],
    38: ["Snare Drum 1", 3, 8],
    39: ["Hand Clap", 4, 6],
    40: ["Snare Drum 2", 3, 4],
    41: ["Low Tom 2", 2, 6],
    42: ["Closed Hi-hat", 3, 22],
    43: ["Low Tom 1", 2, 13],
    44: ["Pedal Hi-hat", 3, 22],
    45: ["Mid Tom 2", 2, 15],
    46: ["Open Hi-hat", 3, 18],
    47: ["Mid Tom 1", 2, 20],
    48: ["High Tom 2", 2, 23],
    49: ["Crash Cymbal 1", 3, 17],
    50: ["High Tom 1", 2, 23],
    51: ["Ride Cymbal 1", 3, 24],
    52: ["Chinese Cymbal", 3, 8],
    53: ["Ride Bell", 3, 13],
    54: ["Tambourine", 4, 18],
    55: ["Splash Cymbal", 3, 18],
    56: ["Cowbell", 11, 5],
    57: ["Crash Cymbal 2", 3, 13],
    58: ["Vibraslap", 4, 2],
    59: ["Ride Cymbal 2", 3, 13],
    60: ["High Bongo", 4, 9],
    61: ["Low Bongo", 4, 2],
    62: ["Mute High Conga", 4, 8],
    63: ["Open High Conga", 2, 22],
    64: ["Low Conga", 2, 15],
    65: ["High Timbale", 3, 13],
    66: ["Low Timbale", 3, 8],
    67: ["High Agogo", 9, 12],
    68: ["Low Agogo", 9, 5],
    69: ["Cabasa", 4, 20],
    70: ["Maracas", 4, 23],
    71: ["Short Whistle", 6, 34],
    72: ["Long Whistle", 6, 33],
    73: ["Short Guiro", 4, 17],
    74: ["Long Guiro", 4, 11],
    75: ["Claves", 4, 18],
    76: ["High Wood Block", 4, 10],
    77: ["Low Wood Block", 4, 5],
    78: ["Mute Cuica", 12, 25],
    79: ["Open Cuica", 12, 26],
    80: ["Mute Triangle", 4, 16],
    81: ["Open Triangle", 8, 19],
    82: ["Shaker", 3, 22],
    83: ["Jingle Bell", 8, 6],
    84: ["Bell Tree", 8, 15],
    85: ["Castanets", 4, 21],
    86: ["Mute Surdo", 2, 14],
    87: ["Open Surdo", 2, 7]
};

var INSTRUMENT_NAMES = [
    "Harp/Piano", "Double Bass", "Bass Drum", "Snare Drum", "Click/Sticks",
    "Guitar", "Flute", "Bell/Glock", "Chime/Box", "Xylophone",
    "Iron Xylophone", "Cow Bell", "Didgeridoo", "Bit/Pluck", "Banjo", "Pling/Elec",
    "Copper Horn", "Exposed Copper Horn", "Weathered Copper Horn", "Oxidized Copper Horn"
];

// 每个旋律乐器相对于竖琴(基准 0)的半音偏移量 (基于 MC 官方音域数据)
// 实际 MIDI 音高 = NBS_key + 21 + INSTRUMENT_OFFSET[id]
var _INSTRUMENT_OFFSET = {
    0: 0,    // 竖琴 Harp (F#3~F#5)
    1: -24,  // 贝斯 Bass (F#1~F#3)
    5: -12,  // 吉他 Guitar (F#2~F#4)
    6: 12,   // 长笛 Flute (F#4~F#6)
    7: 24,   // 钟 Bell (F#5~F#7)
    8: 24,   // 管钟 Chime (F#5~F#7)
    9: 24,   // 木琴 Xylophone (F#5~F#7)
    10: 0,   // 颤音琴 Iron Xylophone (F#3~F#5)
    11: 12,  // 牛铃 Cow Bell (F#4~F#6)
    12: -24, // 迪吉里杜管 Didgeridoo (F#1~F#3)
    13: 0,   // 方波 Bit (F#3~F#5)
    14: 0,   // 班卓琴 Banjo (F#3~F#5)
    15: 0,   // 电钢琴 Pling (F#3~F#5)
    16: 0, 17: 0, 18: 0, 19: 0  // 铜号角 (假设与竖琴相同)
};

// 全局音域 (actualMIDI 层面, 即 nbsKey + 21 + instrumentOffset)
var GLOBAL_MIDI_MIN = 42;
var GLOBAL_MIDI_MAX = 114;

// NBS 格式硬性限制: nbsKey ∈ [0, 87], 对应 processedMidi ∈ [21, 108]
// processedMidi > 108 时, nbsKey > 87 会被 clamp, 导致音高丢失
// 因此 processedMidi 的有效上限为 108 (而非 114)
// 114 的上限通过音色替代 (Flute/Chime) 实现: processedMidi 102 + Chime offset 24 = actualMidi 126
var NBS_KEY_MAX = 87;
var NBS_KEY_MIN = 0;
var PROCESSED_MIDI_MAX = NBS_KEY_MAX + 21;  // 108
var PROCESSED_MIDI_MIN = NBS_KEY_MIN + 21;  // 21, 但实际下限由 GLOBAL_MIDI_MIN (42) 控制

// Minecraft 标准音域 (与 piano_roll.js 中 MINECRAFT_PITCH_MIN/MAX 一致)
// NBS key 33~57, 对应 F#3 ~ F#5 (竖琴的两个八度)
// 超出此范围的音符在 NBS 中仍可播放 (0~87), 但音色会偏离 Minecraft 原版效果 (piano_roll 中显示红色)
// 智能替代/偏移/归一/兜底的目标都是让 processedMidi 落入 [MC_MIDI_MIN, MC_MIDI_MAX]
var MC_KEY_MIN = 33;
var MC_KEY_MAX = 57;
var MC_MIDI_MIN = MC_KEY_MIN + 21;  // 54
var MC_MIDI_MAX = MC_KEY_MAX + 21;  // 78
var MC_MIDI_SPAN = MC_KEY_MAX - MC_KEY_MIN;  // 24

// ====================================================================
// 辅助函数
// ====================================================================

function _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function _has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

function _decodeLatin1(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
        s += String.fromCharCode(bytes[i]);
    }
    return s;
}

// ====================================================================
// NBS 二进制读取器 (小端序)
// ====================================================================

function _NBSReader(arrayBuffer) {
    this.view = new DataView(arrayBuffer);
    this.pos = 0;
    this.length = arrayBuffer.byteLength;
}

_NBSReader.prototype.readByte = function () {
    if (this.pos >= this.length) throw new Error('NBS: 意外的文件结束');
    return this.view.getUint8(this.pos++);
};

_NBSReader.prototype.readUShort = function () {
    if (this.pos + 2 > this.length) throw new Error('NBS: 意外的文件结束');
    var v = this.view.getUint16(this.pos, true); // little-endian
    this.pos += 2;
    return v;
};

_NBSReader.prototype.readSShort = function () {
    if (this.pos + 2 > this.length) throw new Error('NBS: 意外的文件结束');
    var v = this.view.getInt16(this.pos, true); // little-endian signed
    this.pos += 2;
    return v;
};

_NBSReader.prototype.readUInt = function () {
    if (this.pos + 4 > this.length) throw new Error('NBS: 意外的文件结束');
    var v = this.view.getUint32(this.pos, true); // little-endian
    this.pos += 4;
    return v;
};

_NBSReader.prototype.readString = function () {
    var len = this.readUInt();
    if (this.pos + len > this.length) throw new Error('NBS: 字符串超出文件范围');
    var bytes = new Uint8Array(this.view.buffer, this.pos, len);
    this.pos += len;
    // 优先 UTF-8 解码, 失败回退 cp1252 (复刻 Python _read_string_utf8)
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
        return new TextDecoder('windows-1252').decode(bytes);
    }
};

// ====================================================================
// NBS 二进制写入器 (小端序)
// ====================================================================

function _NBSWriter() {
    this.bytes = [];
}

_NBSWriter.prototype.wByte = function (v) {
    this.bytes.push(v & 0xFF);
};

_NBSWriter.prototype.wShort = function (v) {
    // little-endian unsigned short
    v = v & 0xFFFF;
    this.bytes.push(v & 0xFF);
    this.bytes.push((v >> 8) & 0xFF);
};

_NBSWriter.prototype.wSShort = function (v) {
    // little-endian signed short
    if (v < 0) v += 0x10000;
    v = v & 0xFFFF;
    this.bytes.push(v & 0xFF);
    this.bytes.push((v >> 8) & 0xFF);
};

_NBSWriter.prototype.wInt = function (v) {
    // little-endian unsigned int
    v = v >>> 0;
    this.bytes.push(v & 0xFF);
    this.bytes.push((v >> 8) & 0xFF);
    this.bytes.push((v >> 16) & 0xFF);
    this.bytes.push((v >> 24) & 0xFF);
};

_NBSWriter.prototype.wString = function (s) {
    var encoded = new TextEncoder().encode(s || '');
    this.wInt(encoded.length);
    for (var i = 0; i < encoded.length; i++) {
        this.bytes.push(encoded[i]);
    }
};

_NBSWriter.prototype.toArrayBuffer = function () {
    var arr = new Uint8Array(this.bytes.length);
    for (var i = 0; i < this.bytes.length; i++) {
        arr[i] = this.bytes[i];
    }
    return arr.buffer;
};

// ====================================================================
// MIDI 二进制读取器 (大端序)
// ====================================================================

function _MidiReader(arrayBuffer) {
    this.view = new DataView(arrayBuffer);
    this.pos = 0;
    this.length = arrayBuffer.byteLength;
}

_MidiReader.prototype.eof = function () {
    return this.pos >= this.length;
};

_MidiReader.prototype.readByte = function () {
    if (this.pos >= this.length) throw new Error('MIDI: 意外的文件结束');
    return this.view.getUint8(this.pos++);
};

_MidiReader.prototype.readUint16 = function () {
    if (this.pos + 2 > this.length) throw new Error('MIDI: 意外的文件结束');
    var v = this.view.getUint16(this.pos); // big-endian
    this.pos += 2;
    return v;
};

_MidiReader.prototype.readUint32 = function () {
    if (this.pos + 4 > this.length) throw new Error('MIDI: 意外的文件结束');
    var v = this.view.getUint32(this.pos); // big-endian
    this.pos += 4;
    return v;
};

_MidiReader.prototype.readVarLen = function () {
    var result = 0;
    while (true) {
        var byte = this.readByte();
        result = (result << 7) | (byte & 0x7F);
        if (!(byte & 0x80)) break;
    }
    return result;
};

_MidiReader.prototype.readN = function (n) {
    var arr = [];
    for (var i = 0; i < n; i++) {
        arr.push(this.readByte());
    }
    return arr;
};

// ====================================================================
// NBS 解析 (自包含, 复刻 pynbs Parser 行为)
// ====================================================================

function _parseNBS(arrayBuffer) {
    var reader = new _NBSReader(arrayBuffer);

    // ---- 版本检测 ----
    var songLengthShort = reader.readUShort(); // 第一个 short
    var version;
    if (songLengthShort === 0) {
        // OpenNBS 新格式
        version = reader.readByte();
    } else {
        // 旧格式 (version 0)
        version = 0;
    }

    // ---- 默认乐器数 ----
    var vanillaInstruments;
    if (version > 0) {
        vanillaInstruments = reader.readByte();
    } else {
        vanillaInstruments = 10;
    }

    // ---- song_length (version >= 3 有独立字段) ----
    var songLength;
    if (version >= 3) {
        songLength = reader.readUShort();
    } else {
        songLength = songLengthShort;
    }

    // ---- song_layers ----
    var layerCount = reader.readUShort();

    // ---- 字符串字段 ----
    var name = reader.readString();
    var author = reader.readString();
    var originalAuthor = reader.readString();
    var description = reader.readString();

    // ---- tempo (short / 100.0) ----
    var tempo = reader.readUShort() / 100.0;

    // ---- auto_save, auto_save_duration ----
    var autoSave = reader.readByte();
    var autoSaveDuration = reader.readByte();

    // ---- time_signature ----
    var timeSignature = reader.readByte();

    // ---- 统计字段 ----
    reader.readUInt(); // minutes_spent
    reader.readUInt(); // left_clicks
    reader.readUInt(); // right_clicks
    reader.readUInt(); // blocks_added
    reader.readUInt(); // blocks_removed

    // ---- song_origin ----
    reader.readString();

    // ---- Loop (version >= 4) ----
    var loopOn = 0, maxLoopCount = 0, loopStart = 0;
    if (version >= 4) {
        loopOn = reader.readByte();       // loop
        maxLoopCount = reader.readByte();  // max_loop_count
        loopStart = reader.readUShort();   // loop_start
    }

    // ---- Notes (jump 格式) ----
    var notes = [];
    var tick = -1;
    while (true) {
        var tickJump = reader.readUShort();
        if (tickJump === 0) break;
        tick += tickJump;
        var layer = -1;
        while (true) {
            var layerJump = reader.readUShort();
            if (layerJump === 0) break;
            layer += layerJump;
            var instrument = reader.readByte();
            var key = reader.readByte();
            var velocity = 100;
            var panning = 100; // NBS raw 默认中心 (0-200, 100=中心)
            var pitch = 0;
            if (version >= 4) {
                velocity = reader.readByte();
                panning = reader.readByte(); // 保留 raw 0-200 (100=中心)
                pitch = reader.readSShort();
            }
            // 复刻 Note.__post_init__ 钳制
            key = _clamp(key, 0, 87);
            velocity = _clamp(velocity, 0, 100);
            // pan: NBS raw 0-200 (100=中心) -> 前端 0-100 (50=中心)
            // 与 audio_engine 的 (panValue-50)/50 约定一致, 写入侧 pan*2 可正确还原
            var pan = _clamp(Math.round(panning / 2), 0, 100);

            notes.push({
                id: 'note_' + tick + '_' + layer,
                tick: tick,
                layer: layer,
                instrument: instrument,
                key: key,
                velocity: velocity,
                pan: pan,
                pitch: pitch
            });
        }
    }

    // ---- Layers ----
    var layers = [];
    for (var i = 0; i < layerCount; i++) {
        var layerName = reader.readString();
        var lock = 0;
        if (version >= 4) {
            lock = reader.readByte() ? 1 : 0;
        }
        var volume = reader.readByte();
        var stereo = 100; // NBS raw 默认中心 (0-200, 100=中心)
        if (version >= 2) {
            // 保留 raw 0-200 (100=中心), 与前端默认值 100 一致, 写入侧直接写出可还原
            stereo = reader.readByte();
        }
        layers.push({
            name: layerName,
            volume: volume,
            stereo: stereo,
            lock: lock
        });
    }

    // ---- 构建 song.length (复刻 Song.length 属性) ----
    var maxTick = 0;
    for (var i = 0; i < notes.length; i++) {
        if (notes[i].tick > maxTick) maxTick = notes[i].tick;
    }
    var songLen = notes.length > 0 ? maxTick + 1 : 0;

    // ---- 返回 (匹配 Song.to_dict() 格式) ----
    return {
        name: name,
        song_name: name,
        author: author,
        original_author: originalAuthor,
        description: description,
        tempo: tempo,
        auto_save: autoSave === 1,
        auto_save_minutes: autoSaveDuration,
        time_signature: timeSignature,
        length: songLen,
        layers: layers,
        note_count: notes.length,
        notes: notes,
        layer_channel_map: {},
        loop: loopOn,
        max_loop_count: maxLoopCount,
        loop_start: loopStart
    };
}

// ====================================================================
// NBS 写入 (复刻 nbs_handler.py write_nbs)
// ====================================================================

function _writeNBS(songData) {
    var writer = new _NBSWriter();

    // 计算 song.length = max(tick) + 1, 确保 tick 为整数
    var songLength = 0;
    var hasNewInstruments = false;
    if (songData.notes && songData.notes.length > 0) {
        for (var i = 0; i < songData.notes.length; i++) {
            var nt = Math.floor(songData.notes[i].tick);
            if (nt > songLength) songLength = nt;
            if (songData.notes[i].instrument >= 16) hasNewInstruments = true;
        }
        songLength += 1;
    }

    // 含新乐器 (>=16) 强制 V6; 否则使用设置中的版本 (默认 V5)
    var version = hasNewInstruments ? 6 : (window.NBS_EXPORT_VERSION || 5);
    var vanillaCount = version >= 6 ? 20 : 16;

    var layers = songData.layers || [];
    var notes = songData.notes || [];

    // ---- Header ----
    writer.wShort(0);                        // song_length = 0 (新格式标记)
    writer.wByte(version);                    // NBS version
    writer.wByte(vanillaCount);              // vanilla 乐器数 (V6=20, V5=16)
    writer.wShort(songLength);                // song_length
    writer.wShort(layers.length);             // song_layers
    writer.wString(songData.name || songData.song_name || '');
    writer.wString(songData.author || '');
    writer.wString(songData.original_author || '');
    writer.wString(songData.description || '');
    writer.wShort(Math.floor((songData.tempo || 20) * 100)); // tempo * 100
    writer.wByte(songData.auto_save ? 1 : 0);  // auto_save
    writer.wByte(songData.auto_save_minutes || 0); // auto_save_duration
    writer.wByte(songData.time_signature || 4); // time_signature
    writer.wInt(0);                           // minutes_spent
    writer.wInt(0);                           // left_clicks
    writer.wInt(0);                           // right_clicks
    writer.wInt(0);                           // blocks_added
    writer.wInt(0);                           // blocks_removed
    writer.wString('');                      // song_origin
    // version >= 4
    writer.wByte(songData.loop ? 1 : 0);     // loop
    writer.wByte(songData.max_loop_count || 0); // max_loop_count
    writer.wShort(songData.loop_start || 0); // loop_start

    // ---- Notes (按 tick 分组, 按 layer 排序, jump 格式) ----
    if (notes.length > 0) {
        // 预处理: 确保 tick 和 layer 为整数, 过滤无效音符
        var cleanNotes = [];
        for (var ci = 0; ci < notes.length; ci++) {
            var cn = notes[ci];
            if (!cn || typeof cn.tick !== 'number' || typeof cn.layer !== 'number') continue;
            cleanNotes.push({
                tick: Math.floor(cn.tick),
                layer: Math.floor(cn.layer),
                instrument: cn.instrument || 0,
                key: cn.key || 33,
                velocity: cn.velocity !== undefined ? cn.velocity : 100,
                pan: cn.pan !== undefined ? cn.pan : 50,
                pitch: cn.pitch || 0
            });
        }

        // 按 (tick, layer) 排序
        cleanNotes.sort(function (a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.layer - b.layer;
        });

        // 按 tick 分组 (使用整数 tick 作为 key)
        var grouped = {};
        var tickOrder = [];
        for (var i = 0; i < cleanNotes.length; i++) {
            var n = cleanNotes[i];
            var tk = n.tick;  // 已是整数
            if (!grouped[tk]) {
                grouped[tk] = [];
                tickOrder.push(tk);
            }
            grouped[tk].push(n);
        }

        var currentTick = -1;
        for (var ti = 0; ti < tickOrder.length; ti++) {
            var tick = tickOrder[ti];
            var chord = grouped[tick];
            writer.wShort(tick - currentTick);
            currentTick = tick;
            var currentLayer = -1;
            for (var ni = 0; ni < chord.length; ni++) {
                var n = chord[ni];
                writer.wShort(n.layer - currentLayer);
                currentLayer = n.layer;
                writer.wByte(n.instrument);
                writer.wByte(n.key);
                // version >= 4
                writer.wByte(_clamp(n.velocity, 0, 100));
                writer.wByte(_clamp(n.pan * 2, 0, 200));
                writer.wSShort(n.pitch || 0);
            }
            writer.wShort(0); // end of chord
        }
    }
    writer.wShort(0); // end of notes

    // ---- Layers ----
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        writer.wString(layer.name || '');
        // version >= 4
        writer.wByte(layer.lock ? 1 : 0);
        writer.wByte(_clamp(layer.volume, 0, 100));
        // version >= 2
        writer.wByte(_clamp(layer.stereo, 0, 200));
    }

    // ---- Custom Instruments (无) ----
    writer.wByte(0);

    return new Uint8Array(writer.toArrayBuffer());
}

// ====================================================================
// @tonejs/midi 辅助: 用 @tonejs/midi 解析 MIDI，返回统一格式
// ====================================================================

function _parseMidiWithToneJS(arrayBuffer) {
    if (typeof window.__ToneMidi === 'undefined') {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[WebNBS] @tonejs/midi 未加载, 使用回退 MIDI 解析器 (精度可能降低)');
        }
        return null;
    }
    var midi = new window.__ToneMidi(arrayBuffer);
    var ppq = midi.header.ppq || 480;

    // 收集所有轨道信息
    var events = [];
    var channelFirstProgram = {};
    var tempoChangesList = [];
    var trackNames = [];
    var numTracks = midi.tracks.length;

    // tempo changes
    if (midi.header.tempos && midi.header.tempos.length > 0) {
        for (var i = 0; i < midi.header.tempos.length; i++) {
            var t = midi.header.tempos[i];
            tempoChangesList.push({
                tick: t.ticks,
                tempo_us: Math.round(60000000 / t.bpm)
            });
        }
    } else {
        tempoChangesList.push({ tick: 0, tempo_us: 500000 });
    }

    // tracks -> events
    for (var ti = 0; ti < midi.tracks.length; ti++) {
        var trk = midi.tracks[ti];
        trackNames.push(trk.name || ('Track ' + ti));

        // instrument/program (仅记录到 channelFirstProgram, 不混入 events 数组)
        var ch = trk.channel !== undefined ? trk.channel : 0;
        if (trk.instrument && trk.instrument.number !== undefined) {
            if (!channelFirstProgram.hasOwnProperty(ch)) {
                channelFirstProgram[ch] = trk.instrument.number;
            }
        }

        // notes (仅音符事件, 保持与备份版本一致, 避免污染统计/转换逻辑)
        if (trk.notes && trk.notes.length > 0) {
            for (var ni = 0; ni < trk.notes.length; ni++) {
                var n = trk.notes[ni];
                events.push({
                    tick: n.ticks,
                    channel: ch,
                    note: n.midi,
                    velocity: Math.round((n.velocity || 0.5) * 127),
                    duration_ticks: n.durationTicks || 0,
                    track: ti
                });
            }
        }
    }

    // 按 tick 排序
    events.sort(function (a, b) { return a.tick - b.tick; });

    return {
        events: events,
        channelFirstProgram: channelFirstProgram,
        tempoChangesList: tempoChangesList,
        ticksPerBeat: ppq,
        numTracks: numTracks,
        formatType: 1,
        trackNames: trackNames,
        durationTicks: midi.durationTicks || 0
    };
}

// ====================================================================
// MIDI 信息解析 (优先使用 @tonejs/midi, 回退到自包含解析器)
// ====================================================================

function _parseMidiInfo(arrayBuffer) {
    // 优先尝试 @tonejs/midi
    var toneResult = null;
    try {
        toneResult = _parseMidiWithToneJS(arrayBuffer);
    } catch (e) {
        toneResult = null;
    }

    if (toneResult) {
        return _buildMidiInfoFromToneJS(toneResult);
    }

    // 回退到自包含解析器
    return _parseMidiInfoFallback(arrayBuffer);
}

function _buildMidiInfoFromToneJS(toneData) {
    var events = toneData.events;
    var channelFirstProgram = toneData.channelFirstProgram;
    var tempoChangesList = toneData.tempoChangesList;
    var ticksPerBeat = toneData.ticksPerBeat;
    var trackNames = toneData.trackNames;

    var channelNotes = {};
    var channelNoteCount = {};
    var channelMinNote = {};
    var channelMaxNote = {};
    var percussionNotes = {};
    var trackInfoList = [];
    var totalNotes = 0;
    var minTick = Infinity;
    var maxTick = 0;

    // 按轨道分组统计
    var trackEventCount = {};
    var trackNoteCount = {};
    var trackChannelsSet = {};

    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        // 防御: 跳过非音符事件 (programChange 等不应出现在 events 中)
        if (ev.type && ev.type !== 'note') continue;
        // 防御: 跳过无效音符
        if (ev.note === undefined || ev.note === null) continue;

        var ch = ev.channel;
        var note = ev.note;

        totalNotes++;
        channelNotes[ch] = true;
        channelNoteCount[ch] = (channelNoteCount[ch] || 0) + 1;
        if (!channelMinNote.hasOwnProperty(ch) || note < channelMinNote[ch]) channelMinNote[ch] = note;
        if (!channelMaxNote.hasOwnProperty(ch) || note > channelMaxNote[ch]) channelMaxNote[ch] = note;
        if (ev.tick < minTick) minTick = ev.tick;
        if (ev.tick > maxTick) maxTick = ev.tick;
        if (ch === 9) percussionNotes[note] = true;

        trackEventCount[ev.track] = (trackEventCount[ev.track] || 0) + 1;
        trackNoteCount[ev.track] = (trackNoteCount[ev.track] || 0) + 1;
        if (!trackChannelsSet[ev.track]) trackChannelsSet[ev.track] = {};
        trackChannelsSet[ev.track][ch] = true;
    }

    // 构建轨道信息
    for (var t = 0; t < trackNames.length; t++) {
        if (trackEventCount[t] && trackEventCount[t] > 0) {
            var sortedChannels = [];
            for (var ch2 in trackChannelsSet[t]) {
                if (trackChannelsSet[t].hasOwnProperty(ch2)) {
                    sortedChannels.push(parseInt(ch2, 10));
                }
            }
            sortedChannels.sort(function (a, b) { return a - b; });

            trackInfoList.push({
                index: t,
                name: trackNames[t],
                note_count: trackNoteCount[t] || 0,
                event_count: trackEventCount[t] || 0,
                channels: sortedChannels
            });
        }
    }

    // 构建通道信息
    var channels = [];
    var maxChannel = 0;
    for (var ch3 in channelNotes) { if (channelNotes.hasOwnProperty(ch3)) { var cn = parseInt(ch3, 10); if (cn > maxChannel) maxChannel = cn; } }
    for (var ch4 in channelFirstProgram) { if (channelFirstProgram.hasOwnProperty(ch4)) { var cn2 = parseInt(ch4, 10); if (cn2 > maxChannel) maxChannel = cn2; } }

    for (var c = 0; c <= maxChannel; c++) {
        if (channelNotes.hasOwnProperty(c) || channelFirstProgram.hasOwnProperty(c)) {
            var prog = channelFirstProgram.hasOwnProperty(c) ? channelFirstProgram[c] : 0;
            var progName, defaultIns, defaultOctave;
            if (prog < GM_PROGRAM_TABLE.length) {
                progName = GM_PROGRAM_TABLE[prog][0];
                defaultIns = GM_PROGRAM_TABLE[prog][1];
                defaultOctave = GM_PROGRAM_TABLE[prog][2];
            } else {
                progName = 'Unknown'; defaultIns = 0; defaultOctave = 0;
            }
            channels.push({
                channel: c, program: prog, program_name: progName,
                default_instrument: defaultIns, default_octave: defaultOctave,
                is_percussion: c === 9,
                note_count: channelNoteCount[c] || 0,
                min_note: channelMinNote.hasOwnProperty(c) ? channelMinNote[c] : null,
                max_note: channelMaxNote.hasOwnProperty(c) ? channelMaxNote[c] : null
            });
        }
    }

    // 打击乐信息
    var percussion = [];
    var sortedPercNotes = [];
    for (var pn in percussionNotes) { if (percussionNotes.hasOwnProperty(pn)) sortedPercNotes.push(parseInt(pn, 10)); }
    sortedPercNotes.sort(function (a, b) { return a - b; });

    for (var pi = 0; pi < sortedPercNotes.length; pi++) {
        var pnote = sortedPercNotes[pi];
        var pName, pDefaultIns, pDefaultPitch;
        if (DRUM_NOTE_TABLE[pnote]) {
            pName = DRUM_NOTE_TABLE[pnote][0];
            pDefaultIns = DRUM_NOTE_TABLE[pnote][1];
            pDefaultPitch = DRUM_NOTE_TABLE[pnote][2] + 33;
        } else {
            pName = 'Note ' + pnote; pDefaultIns = 0;
            pDefaultPitch = _clamp(pnote - 21, 0, 87);
        }
        percussion.push({ note: pnote, name: pName, default_instrument: pDefaultIns, default_pitch: pDefaultPitch });
    }

    // 时长
    var tempoUs = (tempoChangesList.length > 0) ? tempoChangesList[0].tempo_us : 500000;
    var durationSeconds = 0;
    if (maxTick > 0 && tempoUs > 0) {
        var realMinTick = minTick !== Infinity ? minTick : 0;
        durationSeconds = (maxTick - realMinTick) / ticksPerBeat * (tempoUs / 1000000.0);
    }
    var hours = Math.floor(durationSeconds / 3600);
    var minutes = Math.floor((durationSeconds % 3600) / 60);
    var seconds = Math.floor(durationSeconds % 60);
    var durationStr = hours > 0
        ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0')
        : minutes + ':' + String(seconds).padStart(2, '0');

    return {
        ticks_per_beat: ticksPerBeat,
        track_count: trackInfoList.length,
        total_notes: totalNotes,
        total_events: totalNotes, // @tonejs/midi 不暴露非音符事件数, 用音符数近似
        duration: durationStr,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        type: 'Type 1',
        tracks: trackInfoList,
        channels: channels,
        percussion: percussion,
        tempo_us: tempoUs,
        min_tick: minTick !== Infinity ? minTick : 0,
        max_tick: maxTick,
        _rawEvents: events,  // 供 updateChannelOctaveForMode 使用 (仅音符事件)
        _channelFirstProgram: channelFirstProgram
    };
}

// 原自包含解析器 (作为 @tonejs/midi 不可用时的回退)
function _parseMidiInfoFallback(arrayBuffer) {
    var reader = new _MidiReader(arrayBuffer);

    // ---- MThd 头 ----
    var header = reader.readN(4);
    var headerStr = _decodeLatin1(header);
    if (headerStr !== 'MThd') {
        throw new Error('无效的 MIDI 文件：缺少 MThd 头');
    }

    reader.readUint32(); // header_len (通常 6)
    var formatType = reader.readUint16();
    var numTracks = reader.readUint16();
    var ticksPerBeat = reader.readUint16();

    if (ticksPerBeat === 0) ticksPerBeat = 480;

    // ---- 逐轨道解析 ----
    var channelPrograms = {};       // channel -> program
    var channelFirstProgram = {};   // channel -> first program
    var channelNotes = {};          // channel -> true (有音符)
    var channelNoteCount = {};      // channel -> note count
    var channelMinNote = {};        // channel -> min note
    var channelMaxNote = {};        // channel -> max note
    var percussionNotes = {};       // channel 9 上的 MIDI note -> true
    var trackInfoList = [];
    var tempoUs = 500000;
    var minTick = Infinity;
    var maxTick = 0;
    var events = [];                // 音符事件列表 (供 _rawEvents 使用, calculateOptimalOffset 依赖)
    var totalNotes = 0;
    var totalEvents = 0;

    for (var trackNum = 0; trackNum < numTracks; trackNum++) {
        var trackHeader = reader.readN(4);
        var trackHeaderStr = _decodeLatin1(trackHeader);
        if (trackHeaderStr !== 'MTrk') {
            continue;
        }

        var trackLen = reader.readUint32();
        var trackEnd = reader.pos + trackLen;
        var currentTick = 0;
        var lastEventType = null;
        var trackEventCount = 0;
        var trackNoteCount = 0;
        var trackName = 'Track ' + trackNum;
        var trackChannelsSet = {};

        try {
            while (reader.pos < trackEnd) {
                var delta = reader.readVarLen();
                currentTick += delta;

                var statusByte = reader.readByte();

                if (statusByte === 0xFF) {
                    // Meta event
                    var metaType = reader.readByte();
                    var metaLen = reader.readVarLen();
                    var metaData = reader.readN(metaLen);

                    if (metaType === 0x51 && metaData.length >= 3) {
                        tempoUs = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                    } else if (metaType === 0x03) {
                        trackName = _decodeLatin1(metaData).replace(/\x00+$/, '');
                    }
                } else if (statusByte === 0xF0 || statusByte === 0xF7) {
                    // SysEx
                    var sysexLen = reader.readVarLen();
                    reader.readN(sysexLen);
                } else if (statusByte < 0x80) {
                    // Running status
                    if (lastEventType !== null) {
                        reader.pos--; // 回退 1 字节
                        statusByte = lastEventType;
                    } else {
                        continue;
                    }
                } else {
                    lastEventType = statusByte;
                }

                var eventType = (statusByte & 0xF0) >> 4;
                var channel = statusByte & 0x0F;

                if (eventType === 0x9) {
                    // Note On
                    var note = reader.readByte();
                    var velocity = reader.readByte();
                    trackEventCount++;
                    if (velocity > 0) {
                        trackNoteCount++;
                        totalNotes++;
                        channelNotes[channel] = true;
                        trackChannelsSet[channel] = true;
                        channelNoteCount[channel] = (channelNoteCount[channel] || 0) + 1;
                        if (!channelMinNote.hasOwnProperty(channel) || note < channelMinNote[channel]) {
                            channelMinNote[channel] = note;
                        }
                        if (!channelMaxNote.hasOwnProperty(channel) || note > channelMaxNote[channel]) {
                            channelMaxNote[channel] = note;
                        }
                        if (currentTick < minTick) minTick = currentTick;
                        if (currentTick > maxTick) maxTick = currentTick;
                        if (channel === 9) {
                            percussionNotes[note] = true;
                        }
                        // 关键: 在 Note On 时直接收集 event (与 tonejs 路径一致)
                        // 不依赖 Note Off 配对, 避免某些 MIDI 文件缺少 Note Off 时 events 不完整
                        // calculateOptimalOffset 只用 note 值, 不需要 duration_ticks 准确
                        events.push({
                            tick: currentTick,
                            channel: channel,
                            note: note,
                            velocity: velocity,
                            duration_ticks: 0,
                            track: trackNum
                        });
                    }
                    // velocity=0 视为 Note Off, 但音符已在 Note On 时收集, 此处无需处理
                } else if (eventType === 0x8) {
                    // Note Off - 音符已在 Note On 时收集, 此处只跳过数据
                    reader.readN(2);
                    trackEventCount++;
                } else if (eventType === 0xC) {
                    // Program Change
                    var program = reader.readByte();
                    trackEventCount++;
                    if (!channelFirstProgram.hasOwnProperty(channel)) {
                        channelFirstProgram[channel] = program;
                    }
                    channelPrograms[channel] = program;
                } else if (eventType === 0xA) {
                    reader.readN(2);
                    trackEventCount++;
                } else if (eventType === 0xB) {
                    reader.readN(2);
                    trackEventCount++;
                } else if (eventType === 0xD) {
                    reader.readN(1);
                    trackEventCount++;
                } else if (eventType === 0xE) {
                    reader.readN(2);
                    trackEventCount++;
                }
            }
        } catch (e) {
            throw new Error('MIDI 文件格式损坏或数据不完整 (轨道 ' + trackNum + ')');
        }

        totalEvents += trackEventCount;

        if (trackEventCount > 0) {
            var sortedChannels = [];
            for (var ch in trackChannelsSet) {
                if (trackChannelsSet.hasOwnProperty(ch)) {
                    sortedChannels.push(parseInt(ch, 10));
                }
            }
            sortedChannels.sort(function (a, b) { return a - b; });

            trackInfoList.push({
                index: trackNum,
                name: trackName,
                note_count: trackNoteCount,
                event_count: trackEventCount,
                channels: sortedChannels
            });
        }
    }

    // 按 tick 排序 events (与 _parseMidiWithToneJS 保持一致)
    events.sort(function (a, b) { return a.tick - b.tick; });

    // ---- 构建通道信息 ----
    var channels = [];
    var maxChannel = 0;
    for (var ch in channelNotes) {
        if (channelNotes.hasOwnProperty(ch)) {
            var chNum = parseInt(ch, 10);
            if (chNum > maxChannel) maxChannel = chNum;
        }
    }
    for (var ch2 in channelFirstProgram) {
        if (channelFirstProgram.hasOwnProperty(ch2)) {
            var chNum2 = parseInt(ch2, 10);
            if (chNum2 > maxChannel) maxChannel = chNum2;
        }
    }

    for (var c = 0; c <= maxChannel; c++) {
        if (channelNotes.hasOwnProperty(c) || channelFirstProgram.hasOwnProperty(c)) {
            var prog = channelFirstProgram.hasOwnProperty(c) ? channelFirstProgram[c] : 0;
            var progName, defaultIns, defaultOctave;
            if (prog < GM_PROGRAM_TABLE.length) {
                progName = GM_PROGRAM_TABLE[prog][0];
                defaultIns = GM_PROGRAM_TABLE[prog][1];
                defaultOctave = GM_PROGRAM_TABLE[prog][2];
            } else {
                progName = 'Unknown';
                defaultIns = 0;
                defaultOctave = 0;
            }

            channels.push({
                channel: c,
                program: prog,
                program_name: progName,
                default_instrument: defaultIns,
                default_octave: defaultOctave,
                is_percussion: c === 9,
                note_count: channelNoteCount[c] || 0,
                min_note: channelMinNote.hasOwnProperty(c) ? channelMinNote[c] : null,
                max_note: channelMaxNote.hasOwnProperty(c) ? channelMaxNote[c] : null
            });
        }
    }

    // ---- 构建打击乐信息 ----
    var percussion = [];
    var sortedPercNotes = [];
    for (var pn in percussionNotes) {
        if (percussionNotes.hasOwnProperty(pn)) {
            sortedPercNotes.push(parseInt(pn, 10));
        }
    }
    sortedPercNotes.sort(function (a, b) { return a - b; });

    for (var pi = 0; pi < sortedPercNotes.length; pi++) {
        var note = sortedPercNotes[pi];
        var pName, pDefaultIns, pDefaultPitch;
        if (DRUM_NOTE_TABLE[note]) {
            var drumInfo = DRUM_NOTE_TABLE[note];
            pName = drumInfo[0];
            pDefaultIns = drumInfo[1];
            // DRUM_NOTE_TABLE 第 3 项是 NBS_key - 33, 需 +33 还原
            pDefaultPitch = drumInfo[2] + 33;
        } else {
            pName = 'Note ' + note;
            pDefaultIns = 0;
            pDefaultPitch = _clamp(note - 21, 0, 87);
        }
        percussion.push({
            note: note,
            name: pName,
            default_instrument: pDefaultIns,
            default_pitch: pDefaultPitch
        });
    }

    // ---- 时长计算 ----
    var durationSeconds = 0;
    if (maxTick > 0 && tempoUs > 0) {
        var realMinTick = minTick !== Infinity ? minTick : 0;
        durationSeconds = (maxTick - realMinTick) / ticksPerBeat * (tempoUs / 1000000.0);
    }
    var hours = Math.floor(durationSeconds / 3600);
    var minutes = Math.floor((durationSeconds % 3600) / 60);
    var seconds = Math.floor(durationSeconds % 60);
    var durationStr;
    if (hours > 0) {
        durationStr = hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    } else {
        durationStr = minutes + ':' + String(seconds).padStart(2, '0');
    }

    return {
        ticks_per_beat: ticksPerBeat,
        track_count: trackInfoList.length,
        total_notes: totalNotes,
        total_events: totalEvents,
        duration: durationStr,
        duration_seconds: Math.round(durationSeconds * 10) / 10,
        type: formatType === 0 ? 'Type 0' : (formatType === 1 ? 'Type 1' : 'Type 2'),
        tracks: trackInfoList,
        channels: channels,
        percussion: percussion,
        tempo_us: tempoUs,
        min_tick: minTick !== Infinity ? minTick : 0,
        max_tick: maxTick,
        _rawEvents: events,  // 供 updateChannelOctaveForMode 使用 (仅音符事件)
        _channelFirstProgram: channelFirstProgram
    };
}

// ====================================================================
// MIDI 导入转换 (复刻 midi_handler.py import_midi)
// ====================================================================

function _convertMidiToNBS(arrayBuffer, settings) {
    settings = settings || {};

    // ---- 参数提取 (复刻 api_client.js 的映射) ----
    var channelInstruments = settings.channel_instruments || {};
    var channelOctaves = settings.channel_octaves || {};
    var channelKeys = settings.channel_keys || {};
    var percussionInstruments = settings.percussion_instruments || {};
    var percussionPitches = settings.percussion_pitches || {};
    var removeSilent = settings.remove_silent !== false;
    var nameLayers = settings.name_layers !== false;
    var nameAfterPatches = settings.name_after_patches !== false;
    var tempoChanges = settings.tempo_changes === true;
    var keepOctave = settings.keep_octave !== false;
    var readVelocity = settings.read_velocity !== false;
    var precision = settings.precision !== undefined ? settings.precision : 1;
    var keepNoteLength = settings.keep_note_length || 'none';
    var snapEnabled = settings.snap_enabled === true;
    var snapBeat = settings.snap_beat !== undefined ? settings.snap_beat : 4;
    // 音域处理模式: 0=不应用, 1=单独音符归一法, 2=整体八度偏移法, 3=整体半音偏移法
    var octaveMode = settings.octave_mode !== undefined ? parseInt(settings.octave_mode) : 1;
    // 智能音色替代开关 (仅模式 2/3 下有效, 默认开启)
    // 模式 0: 完全不处理 (不替代/不偏移/不归一)
    // 模式 1: 单独归一, 无需替代
    var smartSubstituteEnabled = settings.smart_substitute_enabled !== false; // 默认 true
    if (octaveMode !== 2 && octaveMode !== 3) {
        smartSubstituteEnabled = false; // 模式 0/1 强制关闭
    }
    // 音色替代配置
    // substitute_tracks 语义:
    //   null/undefined = 全部应用 (substituteTracksSet 保持 null, trackInScope 恒为 true)
    //   [] (空数组)    = 不应用任何 track (substituteTracksSet = {}, trackInScope 恒为 false)
    //   [0, 2, ...]    = 只对指定 track 应用
    var substituteConfig = settings.substitute_config || {};
    var substituteTracks = settings.substitute_tracks;
    var substituteTracksSet = null;
    if (substituteTracks !== null && substituteTracks !== undefined) {
        substituteTracksSet = {};
        for (var st = 0; st < substituteTracks.length; st++) {
            substituteTracksSet[parseInt(substituteTracks[st], 10)] = true;
        }
    }
    // 强制折叠: 全局开关, 勾选后替代失败的音符会被强制折叠到音域内
    var forceFoldEnabled = settings.force_fold_enabled || false;
    // allowPitchOffset 已移除：新模式下偏移由模式本身决定

    // timbre_fitting / percussion_fitting 提取 (复刻 api_client.js)
    var fitting = settings.timbre_fitting || {};
    var timbreFitting = fitting.channels || fitting || {};
    var percussionFitting = fitting.drums || {};

    var sustainTracks = settings.sustain_tracks || [];
    var excludedTracks = settings.excluded_tracks || [];

    // 转 Set
    var excludedTracksSet = {};
    for (var i = 0; i < excludedTracks.length; i++) {
        excludedTracksSet[parseInt(excludedTracks[i], 10)] = true;
    }
    var sustainTracksSet = {};
    for (var i = 0; i < sustainTracks.length; i++) {
        sustainTracksSet[parseInt(sustainTracks[i], 10)] = true;
    }

    // ---- 优先使用 @tonejs/midi 解析 ----
    var toneData = null;
    try {
        toneData = _parseMidiWithToneJS(arrayBuffer);
    } catch (e) {
        toneData = null;
    }

    var events = [];
    var tempoMicroseconds = 500000;
    var initialTempoUs = 500000;
    var tempoChangesList = [];
    var channelFirstProgram = {};
    var ticksPerBeat = 480;
    var numTracks = 0;

    // ---- 为未配置的通道填充默认值 ----
    for (var ch = 0; ch < 16; ch++) {
        if (!_has(channelInstruments, ch)) channelInstruments[ch] = null;
        if (!_has(channelOctaves, ch)) channelOctaves[ch] = 0;
        if (!_has(channelKeys, ch)) channelKeys[ch] = 0;
    }

    if (toneData) {
        // 使用 @tonejs/midi 的解析结果
        events = toneData.events;
        channelFirstProgram = toneData.channelFirstProgram;
        tempoChangesList = toneData.tempoChangesList;
        ticksPerBeat = toneData.ticksPerBeat;
        numTracks = toneData.numTracks;

        // 过滤排除的轨道
        events = events.filter(function(ev) { return !excludedTracksSet[ev.track]; });

        // tempo
        if (tempoChangesList.length > 0) {
            initialTempoUs = tempoChangesList[0].tempo_us;
            tempoMicroseconds = initialTempoUs;
        }
    } else {
        // 回退到自包含解析器
        var reader = new _MidiReader(arrayBuffer);
        var header = reader.readN(4);
        var headerStr = _decodeLatin1(header);
        if (headerStr !== 'MThd') {
            throw new Error('无效的 MIDI 文件：缺少 MThd 头');
        }

        reader.readUint32(); // header_len
        var formatType = reader.readUint16();
        numTracks = reader.readUint16();
        ticksPerBeat = reader.readUint16();
        if (ticksPerBeat === 0) ticksPerBeat = 480;

        var activeNotes = {};       // "channel,note" -> {tick, velocity}

    for (var trackNum = 0; trackNum < numTracks; trackNum++) {
        var trackHeader = reader.readN(4);
        var trackHdrStr = _decodeLatin1(trackHeader);
        if (trackHdrStr !== 'MTrk') continue;

        var trackLen = reader.readUint32();
        var trackEnd = reader.pos + trackLen;

        // 跳过排除的轨道
        if (excludedTracksSet[trackNum]) {
            reader.pos = trackEnd;
            continue;
        }

        var currentTick = 0;
        var lastEventType = null;

        try {
            while (reader.pos < trackEnd) {
                var delta = reader.readVarLen();
                currentTick += delta;

                var statusByte = reader.readByte();

                if (statusByte === 0xFF) {
                    // Meta event
                    var metaType = reader.readByte();
                    var metaLen = reader.readVarLen();
                    var metaData = reader.readN(metaLen);

                    if (metaType === 0x51 && metaData.length >= 3) {
                        tempoMicroseconds = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                        if (tempoChangesList.length === 0) {
                            initialTempoUs = tempoMicroseconds;
                        }
                        tempoChangesList.push({
                            tick: currentTick,
                            tempo_us: tempoMicroseconds
                        });
                    }
                } else if (statusByte === 0xF0 || statusByte === 0xF7) {
                    // SysEx
                    var sysexLen = reader.readVarLen();
                    reader.readN(sysexLen);
                } else if (statusByte < 0x80) {
                    // Running status
                    if (lastEventType !== null) {
                        reader.pos--;
                        statusByte = lastEventType;
                    } else {
                        continue;
                    }
                } else {
                    lastEventType = statusByte;
                }

                var eventType = (statusByte & 0xF0) >> 4;
                var channel = statusByte & 0x0F;

                if (eventType === 0x9) {
                    // Note On
                    var note = reader.readByte();
                    var velocity = reader.readByte();
                    if (velocity > 0) {
                        var key = channel + ',' + note;
                        activeNotes[key] = {
                            tick: currentTick,
                            velocity: velocity,
                            track: trackNum
                        };
                    } else {
                        // velocity=0 = Note Off
                        var key2 = channel + ',' + note;
                        if (activeNotes[key2]) {
                            var startInfo = activeNotes[key2];
                            delete activeNotes[key2];
                            events.push({
                                tick: startInfo.tick,
                                channel: channel,
                                note: note,
                                velocity: startInfo.velocity,
                                duration_ticks: currentTick - startInfo.tick,
                                track: trackNum
                            });
                        }
                    }
                } else if (eventType === 0x8) {
                    // Note Off
                    var noteOff = reader.readByte();
                    reader.readByte(); // release velocity (ignored)
                    var key3 = channel + ',' + noteOff;
                    if (activeNotes[key3]) {
                        var startInfo2 = activeNotes[key3];
                        delete activeNotes[key3];
                        events.push({
                            tick: startInfo2.tick,
                            channel: channel,
                            note: noteOff,
                            velocity: startInfo2.velocity,
                            duration_ticks: currentTick - startInfo2.tick,
                            track: trackNum
                        });
                    }
                } else if (eventType === 0xC) {
                    // Program Change
                    var program = reader.readByte();
                    if (!channelFirstProgram.hasOwnProperty(channel)) {
                        channelFirstProgram[channel] = program;
                    }
                } else if (eventType === 0xA) {
                    reader.readN(2);
                } else if (eventType === 0xB) {
                    reader.readN(2);
                } else if (eventType === 0xD) {
                    reader.readN(1);
                } else if (eventType === 0xE) {
                    reader.readN(2);
                }
            }
        } catch (e) {
            throw new Error('MIDI 文件格式损坏或数据不完整 (轨道 ' + trackNum + ')');
        }
    }

    // ---- 处理未关闭的 Note On ----
    for (var ak in activeNotes) {
        if (activeNotes.hasOwnProperty(ak)) {
            var parts = ak.split(',');
            var startInfo3 = activeNotes[ak];
            events.push({
                tick: startInfo3.tick,
                channel: parseInt(parts[0], 10),
                note: parseInt(parts[1], 10),
                velocity: startInfo3.velocity,
                duration_ticks: 1,
                track: startInfo3.track
            });
        }
    }
    } // end of else (fallback parser)

    // ---- 空 song ----
    var songTempo = 20;
    if (events.length === 0) {
        return {
            name: 'Imported MIDI',
            song_name: 'Imported MIDI',
            author: '',
            original_author: '',
            description: '',
            tempo: songTempo,
            auto_save: false,
            auto_save_minutes: 0,
            time_signature: 4,
            length: 0,
            layers: [],
            note_count: 0,
            notes: [],
            layer_channel_map: {}
        };
    }

    // ---- 计算 tick 范围 ----
    var minTick = events[0].tick;
    var maxTick = events[0].tick;
    for (var i = 0; i < events.length; i++) {
        if (events[i].tick < minTick) minTick = events[i].tick;
        if (events[i].tick > maxTick) maxTick = events[i].tick;
    }

    // ---- delta_per_tick ----
    var precisionMap = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
    var precVal = precisionMap[precision] !== undefined ? precisionMap[precision] : 1;
    var deltaPerTick = (ticksPerBeat & 0x7FFF) / 4.0 / (precVal + 1);

    // ---- 移除开头静音 ----
    var silentOffset = removeSilent ? minTick : 0;

    // ---- 最大 NBS tick ----
    var maxNbsTick = Math.floor((maxTick - silentOffset) / deltaPerTick);

    // ---- 吸附网格 ----
    var nbsTicksPerGrid = 1;
    if (snapEnabled && snapBeat > 0) {
        var midiTicksPerGrid = ticksPerBeat * 4.0 / snapBeat;
        nbsTicksPerGrid = Math.max(1, Math.round(midiTicksPerGrid / deltaPerTick));
    }

    // ---- 计算 TPS ----
    if (maxNbsTick > 0 && initialTempoUs > 0 && maxTick > 0) {
        var midiSonglengthSeconds = (maxTick - silentOffset) / ticksPerBeat * (initialTempoUs / 1000000.0);
        var enda = parseFloat(maxNbsTick);
        if (midiSonglengthSeconds > 0) {
            var tempoRaw = 10.0 / (midiSonglengthSeconds / (enda / 10.0));
            songTempo = Math.max(5.0, Math.min(80.0, tempoRaw));
            songTempo = Math.round(songTempo);
        }
    }

    // ---- 计算每个 channel 需要的层数 ----
    var channelUsedTicks = {}; // "ch,nbsTick" -> count
    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        var ch = e.channel;

        // 检查是否忽略该通道
        if (ch === 9) {
            var pInst = _has(percussionInstruments, e.note) ? percussionInstruments[e.note] : -1;
            if (pInst === -1) continue;
        } else {
            var inst = _has(channelInstruments, ch) ? channelInstruments[ch] : null;
            if (inst === -1) continue;
            if (inst === null) {
                if (timbreFitting && _has(timbreFitting, ch)) {
                    if (timbreFitting[ch][0] < 0) continue;
                }
                // 无拟合也继续, 后续用 GM 默认映射
            }
        }

        var nbsTickRaw = (e.tick - silentOffset) / deltaPerTick;
        var nbsTick;
        if (nbsTicksPerGrid > 1) {
            nbsTick = Math.floor(Math.round(nbsTickRaw / nbsTicksPerGrid) * nbsTicksPerGrid);
        } else {
            nbsTick = Math.floor(nbsTickRaw);
        }
        var ctKey = ch + ',' + nbsTick;
        channelUsedTicks[ctKey] = (channelUsedTicks[ctKey] || 0) + 1;
    }

    var channelLayersNeeded = {};
    for (var ctKey2 in channelUsedTicks) {
        if (channelUsedTicks.hasOwnProperty(ctKey2)) {
            var ctParts = ctKey2.split(',');
            var ctCh = parseInt(ctParts[0], 10);
            var ctCount = channelUsedTicks[ctKey2];
            if (!channelLayersNeeded.hasOwnProperty(ctCh)) {
                channelLayersNeeded[ctCh] = 0;
            }
            if (ctCount > channelLayersNeeded[ctCh]) {
                channelLayersNeeded[ctCh] = ctCount;
            }
        }
    }

    // ---- 构建 channel -> 起始 layer 映射 ----
    var channelLayerOffset = {};
    var currentLayer = 0;
    if (tempoChanges) {
        currentLayer = 1; // 为速度变化器预留 layer 0
    }
    var maxChannel = 0;
    for (var i = 0; i < events.length; i++) {
        if (events[i].channel > maxChannel) maxChannel = events[i].channel;
    }
    for (var ch2 = 0; ch2 <= maxChannel; ch2++) {
        channelLayerOffset[ch2] = currentLayer;
        currentLayer += (channelLayersNeeded[ch2] || 1);
    }

    // ---- 转换音符 ----
    var songNotes = [];
    var layerCounters = {}; // "ch,nbsTick" -> used count

    for (var i = 0; i < events.length; i++) {
        var e = events[i];
        // 防御: 跳过非音符事件 (programChange 等不应出现在 events 中)
        if (e.type && e.type !== 'note') continue;
        // 防御: 跳过无效音符
        if (e.note === undefined || e.note === null) continue;

        var nbsTickRaw = (e.tick - silentOffset) / deltaPerTick;
        var nbsTick;
        if (nbsTicksPerGrid > 1) {
            nbsTick = Math.floor(Math.round(nbsTickRaw / nbsTicksPerGrid) * nbsTicksPerGrid);
        } else {
            nbsTick = Math.floor(nbsTickRaw);
        }
        var ch = e.channel;
        var midiNote = e.note;
        var trackIdx = e.track || 0;

        var instrument, nbsKey;

        if (ch === 9) {
            // 鼓组
            var drumFitting = _has(percussionFitting, midiNote) ? percussionFitting[midiNote] : null;
            if (drumFitting && drumFitting[0] >= 0) {
                instrument = drumFitting[0];
            } else {
                var drumInst = _has(percussionInstruments, midiNote) ? percussionInstruments[midiNote] : -1;
                if (drumInst === -1) continue;
                instrument = drumInst;
            }
            // 音高
            if (_has(percussionPitches, midiNote)) {
                nbsKey = percussionPitches[midiNote];
            } else {
                var drumInfo = DRUM_NOTE_TABLE[midiNote];
                if (drumInfo) {
                    nbsKey = drumInfo[2] + 33;
                } else {
                    nbsKey = _clamp(midiNote - 21, 0, 87);
                }
            }
        } else {
            // ---- 旋律通道 ----
            var inst = channelInstruments[ch];
            if (inst === -1) continue;  // 用户设置为"不导入"

            // 自动模式: 优先用拟合, 否则用 GM 表
            if (inst === null || inst === undefined) {
                if (timbreFitting && _has(timbreFitting, ch)) {
                    var fitSlots = timbreFitting[ch];
                    inst = (fitSlots && fitSlots[0] >= 0) ? fitSlots[0] : 0;
                } else {
                    var prog = channelFirstProgram ? (channelFirstProgram[ch] || 0) : 0;
                    inst = GM_PROGRAM_TABLE[prog] ? GM_PROGRAM_TABLE[prog][1] : 0;
                }
            }

            var octaveOffset = channelOctaves[ch] || 0;
            var keyOffset = channelKeys[ch] || 0;

            // ==== 新流水线 (补充补丁): 先替代, 后偏移, 有条件跳过 ====
            // 模式 0: 完全不处理 (不替代/不偏移/不归一), 直接原样输出
            // 模式 1: 单独音符归一法 (逐音符 ±12 取模, 不替代)
            // 模式 2/3: 阶段1(替代优先) → 阶段2(检查残留) → 阶段3(条件偏移) → 阶段4(兜底)
            //   - 偏移量由 main.js calculateOptimalOffsetWithSubstitute 预计算:
            //     替代后全部合规 → offset=0 (跳过偏移)
            //     替代后仍有残留 → 基于替代后 MIDI 计算最优偏移
            var processedMidi;

            if (octaveMode === 0) {
                // 模式 0: 完全不处理 (新规范: 替代/偏移/归一均跳过)
                processedMidi = midiNote;
            } else if (octaveMode === 1) {
                // 模式 1: 单独音符归一法 (保持原逻辑, 不替代)
                // 目标: 让 processedMidi 落入 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
                processedMidi = midiNote + 12 * octaveOffset + keyOffset;
                while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
                while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
            } else {
                // 模式 2/3: 先替代, 后偏移
                // 阶段1: 在原始 midiNote 上尝试替代 (不加偏移)
                // 替代触发条件: processedMidi 超出 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
                processedMidi = midiNote;

                if (smartSubstituteEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                    // 检查 track 是否在替代作用域
                    var trackInScope = true;
                    if (substituteTracksSet) trackInScope = !!substituteTracksSet[trackIdx];

                    if (trackInScope && substituteConfig) {
                        // 链条式替代: 从当前音色开始, 按 high/low 跳到下一个音色
                        var chainInst = inst;
                        var chainMidi = processedMidi;
                        var maxChainSteps = 4;

                        for (var chainStep = 0; chainStep < maxChainSteps; chainStep++) {
                            var substCfg = substituteConfig[chainInst];
                            if (!substCfg) break;

                            var targetInst = -1;
                            if (chainMidi > MC_MIDI_MAX && substCfg.high >= 0) {
                                targetInst = substCfg.high;
                            } else if (chainMidi < MC_MIDI_MIN && substCfg.low >= 0) {
                                targetInst = substCfg.low;
                            } else {
                                break;
                            }

                            var chainOrigOffset = _INSTRUMENT_OFFSET[chainInst] || 0;
                            var chainTargetOffset = _INSTRUMENT_OFFSET[targetInst] || 0;
                            var newMidi = chainMidi - (chainTargetOffset - chainOrigOffset);

                            // 替代成功条件: processedMidi 落入 Minecraft 标准音域 [54, 78] (nbsKey [33, 57])
                            if (newMidi >= MC_MIDI_MIN && newMidi <= MC_MIDI_MAX) {
                                inst = targetInst;
                                processedMidi = newMidi;
                                break;
                            }

                            // 继续链条
                            chainInst = targetInst;
                            chainMidi = newMidi;
                        }
                    }
                }

                // 阶段3: 应用偏移量 (main.js 已根据替代情况计算最优偏移)
                // 注意: 偏移量基于替代后的 MIDI 计算, 所以这里加到 processedMidi 上
                processedMidi += 12 * octaveOffset + keyOffset;

                // 阶段4: 强制兜底 (仅在勾选时)
                // 折叠到 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
                if (forceFoldEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                    while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
                    while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
                }
            }

            // 转换为 NBS key
            nbsKey = processedMidi - 21;
            // clamp 到 [0, 87] (防御性, 正常流程不应触发)
            if (nbsKey < 0) nbsKey = 0;
            if (nbsKey > 87) nbsKey = 87;
            instrument = inst;
        }

        // 计算 layer
        var baseLayer = channelLayerOffset[ch] || 0;
        var lKey = ch + ',' + nbsTick;
        var used = layerCounters[lKey] || 0;
        var layer = baseLayer + used;
        layerCounters[lKey] = used + 1;

        // velocity
        var velocity;
        if (readVelocity) {
            velocity = Math.min(100, Math.floor(e.velocity / 127.0 * 100));
        } else {
            velocity = 100;
        }

        // note length
        var durationTicks = e.duration_ticks || 1;
        var noteLength = Math.max(1, Math.floor(durationTicks / deltaPerTick));
        var pitchVal = _clamp(noteLength, 0, 255);

        // 判断是否保持音符长度
        var shouldSustain = false;
        if (keepNoteLength === 'all') {
            shouldSustain = true;
        } else if (keepNoteLength === 'sustain') {
            shouldSustain = !!sustainTracksSet[trackIdx];
        }

        songNotes.push({
            id: 'note_' + nbsTick + '_' + layer,
            tick: nbsTick,
            layer: layer,
            instrument: instrument,
            key: nbsKey,
            velocity: velocity,
            pan: 50,
            pitch: pitchVal
        });

        // ---- 音色拟合: slot2/slot3 ----
        if (timbreFitting && _has(timbreFitting, ch)) {
            var fittingSlots = timbreFitting[ch];
            for (var slotIdx = 1; slotIdx < fittingSlots.length; slotIdx++) {
                var slotInst = fittingSlots[slotIdx];
                if (slotInst >= 0) {
                    // slot 独立计算 MIDI 表示值 (遵循新流水线)
                    var slotMidi;

                    if (octaveMode === 0) {
                        // 模式 0: 完全不处理
                        slotMidi = midiNote;
                    } else if (octaveMode === 1) {
                        // 模式 1: 单独归一 (不替代), 折叠到 Minecraft 标准音域
                        slotMidi = midiNote + 12 * octaveOffset + keyOffset;
                        while (slotMidi < MC_MIDI_MIN) slotMidi += 12;
                        while (slotMidi > MC_MIDI_MAX) slotMidi -= 12;
                    } else {
                        // 模式 2/3: 先替代, 后偏移
                        slotMidi = midiNote;

                        // 阶段1: 在原始 midiNote 上尝试替代 (目标: Minecraft 标准音域)
                        if (smartSubstituteEnabled && (slotMidi < MC_MIDI_MIN || slotMidi > MC_MIDI_MAX)) {
                            var slotTrackInScope = true;
                            if (substituteTracksSet) slotTrackInScope = !!substituteTracksSet[trackIdx];

                            if (slotTrackInScope && substituteConfig) {
                                var sChainInst = slotInst;
                                var sChainMidi = slotMidi;

                                for (var sChainStep = 0; sChainStep < 4; sChainStep++) {
                                    var sSubstCfg = substituteConfig[sChainInst];
                                    if (!sSubstCfg) break;

                                    var sTarget = -1;
                                    if (sChainMidi > MC_MIDI_MAX && sSubstCfg.high >= 0) {
                                        sTarget = sSubstCfg.high;
                                    } else if (sChainMidi < MC_MIDI_MIN && sSubstCfg.low >= 0) {
                                        sTarget = sSubstCfg.low;
                                    } else {
                                        break;
                                    }

                                    var sOrigOff = _INSTRUMENT_OFFSET[sChainInst] || 0;
                                    var sTgtOff = _INSTRUMENT_OFFSET[sTarget] || 0;
                                    var sNewMidi = sChainMidi - (sTgtOff - sOrigOff);

                                    if (sNewMidi >= MC_MIDI_MIN && sNewMidi <= MC_MIDI_MAX) {
                                        slotInst = sTarget;
                                        slotMidi = sNewMidi;
                                        break;
                                    }

                                    sChainInst = sTarget;
                                    sChainMidi = sNewMidi;
                                }
                            }
                        }

                        // 阶段3: 应用偏移量
                        slotMidi += 12 * octaveOffset + keyOffset;

                        // 阶段4: 强制兜底 (折叠到 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX])
                        if (forceFoldEnabled && (slotMidi < MC_MIDI_MIN || slotMidi > MC_MIDI_MAX)) {
                            while (slotMidi < MC_MIDI_MIN) slotMidi += 12;
                            while (slotMidi > MC_MIDI_MAX) slotMidi -= 12;
                        }
                    }

                    // 转换为 NBS key
                    var slotNbsKey = slotMidi - 21;
                    if (slotNbsKey < 0) slotNbsKey = 0;
                    if (slotNbsKey > 87) slotNbsKey = 87;

                    var used2 = layerCounters[lKey] || 0;
                    var fitLayer = baseLayer + used2;
                    layerCounters[lKey] = used2 + 1;
                    songNotes.push({
                        id: 'note_' + nbsTick + '_' + fitLayer,
                        tick: nbsTick,
                        layer: fitLayer,
                        instrument: slotInst,
                        key: slotNbsKey,
                        velocity: velocity,
                        pan: 50,
                        pitch: pitchVal
                    });
                    // 保持音符长度也应用于 slot2/slot3
                    if (shouldSustain) {
                        var effLen2 = Math.max(2, noteLength);
                        for (var st2 = 1; st2 < effLen2; st2++) {
                            var targetTick2 = nbsTick + st2;
                            if (targetTick2 > maxNbsTick + 100) break;
                            var sKey2 = ch + ',' + targetTick2;
                            var usedS2 = layerCounters[sKey2] || 0;
                            var sLayer2 = baseLayer + usedS2;
                            layerCounters[sKey2] = usedS2 + 1;
                            songNotes.push({
                                id: 'note_' + targetTick2 + '_' + sLayer2,
                                tick: targetTick2,
                                layer: sLayer2,
                                instrument: slotInst,
                                key: slotNbsKey,
                                velocity: velocity,
                                pan: 50,
                                pitch: pitchVal
                            });
                        }
                    }
                }
            }
        }

        // ---- 打击乐拟合: slot2/slot3 ----
        if (ch === 9 && percussionFitting && _has(percussionFitting, midiNote)) {
            var pFittingSlots = percussionFitting[midiNote];
            for (var pSlotIdx = 1; pSlotIdx < pFittingSlots.length; pSlotIdx++) {
                var pSlotInst = pFittingSlots[pSlotIdx];
                if (pSlotInst >= 0) {
                    var pUsed2 = layerCounters[lKey] || 0;
                    var pFitLayer = baseLayer + pUsed2;
                    layerCounters[lKey] = pUsed2 + 1;
                    songNotes.push({
                        id: 'note_' + nbsTick + '_' + pFitLayer,
                        tick: nbsTick,
                        layer: pFitLayer,
                        instrument: pSlotInst,
                        key: nbsKey,
                        velocity: velocity,
                        pan: 50,
                        pitch: pitchVal
                    });
                }
            }
        }

        // ---- 保持音符长度: 后续 tick 重复放置 ----
        if (shouldSustain) {
            var effectiveLength = Math.max(2, noteLength);
            for (var sustainTick = 1; sustainTick < effectiveLength; sustainTick++) {
                var targetTick = nbsTick + sustainTick;
                if (targetTick > maxNbsTick + 100) break;
                var sustainKey = ch + ',' + targetTick;
                var sustainUsed = layerCounters[sustainKey] || 0;
                var sustainLayer = baseLayer + sustainUsed;
                layerCounters[sustainKey] = sustainUsed + 1;
                songNotes.push({
                    id: 'note_' + targetTick + '_' + sustainLayer,
                    tick: targetTick,
                    layer: sustainLayer,
                    instrument: instrument,
                    key: nbsKey,
                    velocity: velocity,
                    pan: 50,
                    pitch: 0 // 延续音符
                });
            }
        }
    }

    // ---- 添加速度变化器 ----
    if (tempoChanges && tempoChangesList.length > 0) {
        for (var ti = 0; ti < tempoChangesList.length; ti++) {
            var tc = tempoChangesList[ti];
            var pos = Math.floor((tc.tick - silentOffset) / deltaPerTick);
            if (pos < 0) pos = 0;
            var nbsTempoRaw = 60000000.0 / tc.tempo_us; // BPM
            var nbsTps = nbsTempoRaw / 15.0 * (precVal + 1);

            // 查找是否已有该位置的音符
            var existing = null;
            for (var ni = 0; ni < songNotes.length; ni++) {
                if (songNotes[ni].tick === pos && songNotes[ni].layer === 0) {
                    existing = songNotes[ni];
                    break;
                }
            }
            if (existing) {
                existing.key = 39;
                existing.velocity = Math.floor(nbsTps);
            } else {
                songNotes.push({
                    id: 'note_' + pos + '_0',
                    tick: pos,
                    layer: 0,
                    instrument: 0,
                    key: 39,
                    velocity: Math.floor(nbsTps),
                    pan: 50,
                    pitch: 0
                });
            }
        }
    }

    // ---- 构建 layers 列表 ----
    var maxLayer = 0;
    for (var i = 0; i < songNotes.length; i++) {
        if (songNotes[i].layer > maxLayer) maxLayer = songNotes[i].layer;
    }
    var songLayers = [];
    for (var l = 0; l <= maxLayer; l++) {
        songLayers.push({
            name: 'Layer ' + (l + 1),
            volume: 100,
            stereo: 100,
            lock: 0
        });
    }

    // ---- 构建 layer -> channel 映射 ----
    var layerChannelMap = {};
    for (var mapCh in channelLayerOffset) {
        if (channelLayerOffset.hasOwnProperty(mapCh)) {
            var mapChNum = parseInt(mapCh, 10);
            var offset = channelLayerOffset[mapCh];
            var count = channelLayersNeeded[mapChNum] || 1;
            for (var ml = offset; ml < offset + count; ml++) {
                layerChannelMap[ml] = mapChNum;
            }
        }
    }

    // ---- 图层命名 ----
    if (nameLayers) {
        var yy = 0;
        if (tempoChanges) {
            if (yy < songLayers.length) {
                songLayers[yy].name = 'TempoChgr';
            }
            yy++;
        }
        for (var nc = 0; nc <= maxChannel; nc++) {
            var ncCount = channelLayersNeeded[nc] || 0;
            for (var nb = 0; nb < ncCount; nb++) {
                if (yy < songLayers.length) {
                    songLayers[yy].stereo = 100;
                    if (nameAfterPatches) {
                        if (nc === 9) {
                            songLayers[yy].name = 'Percussion';
                        } else {
                            var prog = channelFirstProgram[nc] || 0;
                            if (prog < GM_PROGRAM_TABLE.length) {
                                songLayers[yy].name = GM_PROGRAM_TABLE[prog][0];
                            } else {
                                songLayers[yy].name = 'Channel ' + (nc + 1);
                            }
                        }
                    } else {
                        songLayers[yy].name = 'Channel ' + (nc + 1);
                    }
                    songLayers[yy].volume = 100;
                }
                yy++;
            }
        }
    }

    // ---- 音色拟合: 重命名对应图层 ----
    if (timbreFitting) {
        var layerInstruments = {};
        for (var i = 0; i < songNotes.length; i++) {
            layerInstruments[songNotes[i].layer] = songNotes[i].instrument;
        }
        for (var tfCh in timbreFitting) {
            if (timbreFitting.hasOwnProperty(tfCh)) {
                var tfChNum = parseInt(tfCh, 10);
                var slots = timbreFitting[tfCh];
                for (var slotIdx = 0; slotIdx < slots.length; slotIdx++) {
                    var slotInst = slots[slotIdx];
                    if (slotInst >= 0) {
                        for (var layerIdx in layerInstruments) {
                            if (layerInstruments.hasOwnProperty(layerIdx)) {
                                var layerIdxNum = parseInt(layerIdx, 10);
                                var baseOffset = channelLayerOffset[tfChNum] || 0;
                                if (layerInstruments[layerIdx] === slotInst &&
                                    layerIdxNum >= baseOffset &&
                                    layerIdxNum < songLayers.length) {
                                    var instName = slotInst < INSTRUMENT_NAMES.length
                                        ? INSTRUMENT_NAMES[slotInst]
                                        : 'Inst ' + slotInst;
                                    if (slotIdx === 0) {
                                        songLayers[layerIdxNum].name = instName + '(通道' + tfChNum + ')';
                                    } else {
                                        songLayers[layerIdxNum].name = instName + '(通道' + tfChNum + '-' + (slotIdx + 1) + ')';
                                    }
                                    delete layerInstruments[layerIdx];
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // ---- 最终: TPS 始终为整数 ----
    songTempo = Math.round(songTempo);

    // ---- 计算 song.length ----
    var songMaxTick = 0;
    for (var i = 0; i < songNotes.length; i++) {
        if (songNotes[i].tick > songMaxTick) songMaxTick = songNotes[i].tick;
    }
    var songLen = songNotes.length > 0 ? songMaxTick + 1 : 0;

    return {
        name: 'Imported MIDI',
        song_name: 'Imported MIDI',
        author: '',
        original_author: '',
        description: '',
        tempo: songTempo,
        auto_save: false,
        auto_save_minutes: 0,
        time_signature: 4,
        length: songLen,
        layers: songLayers,
        note_count: songNotes.length,
        notes: songNotes,
        layer_channel_map: layerChannelMap
    };
}

// ====================================================================
// 全局 NBSClient API
// ====================================================================

var NBSClient = {

    // ---- NBS 读取 (替代 /api/song/load) ----
    // 尝试 @nbsjs/core, 失败则使用自包含解析器 (主要实现)
    loadNBS: function (file) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
                var arrayBuffer = ev.target.result;
                try {
                    // 主要实现: 自包含 NBS 解析器
                    // (@nbsjs/core 的 API 可能与文档不一致, 因此直接使用自包含解析器)
                    var song = self._parseNBS(arrayBuffer);
                    resolve({ success: true, song: song });
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = function () {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // ---- NBS 写入 (替代 /api/song/save) ----
    saveNBS: function (songData) {
        var self = this;
        return new Promise(function (resolve, reject) {
            try {
                var uint8 = self._writeNBS(songData);
                var blob = new Blob([uint8], { type: 'application/octet-stream' });
                resolve(blob);
            } catch (e) {
                reject(e);
            }
        });
    },

    // ---- MIDI 信息 (替代 /api/midi/info) ----
    getMidiInfo: function (file) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var info = self._parseMidi(ev.target.result);
                    resolve({ success: true, info: info });
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = function () {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // ---- MIDI 导入 (替代 /api/midi/import) ----
    importMidi: function (file, settings) {
        var self = this;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var song = self._convertMidiToNBS(ev.target.result, settings);
                    resolve({
                        success: true,
                        song: song,
                        suggested_tempo: song.tempo
                    });
                } catch (e) {
                    reject(e);
                }
            };
            reader.onerror = function () {
                reject(new Error('读取文件失败'));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    // ---- 内部方法 (公开供高级使用) ----
    _parseNBS: _parseNBS,
    _writeNBS: _writeNBS,
    _parseMidi: _parseMidiInfo,
    _parseMidiInfo: _parseMidiInfo,
    _parseMidiWithToneJS: _parseMidiWithToneJS,
    _convertMidiToNBS: _convertMidiToNBS,

    // 常量 (供前端引用)
    GM_PROGRAM_TABLE: GM_PROGRAM_TABLE,
    DRUM_NOTE_TABLE: DRUM_NOTE_TABLE,
    INSTRUMENT_NAMES: INSTRUMENT_NAMES
};
