/**
 * WebNBS 音频引擎 - 基于 Minecraft Java 版音符盒播放逻辑
 * 参考 Note Block Studio 源码 (dat_instrument, dat_pitch, audio_sound_add)
 */

// NBS 乐器 -> Minecraft 音符盒声音 -> OGG 文件名
// 参考 NoteBlockStudio dat_instrument.gml
var NBS_INSTRUMENT_TO_SOUND = {
    0:  'harp',              // Harp/Piano -> minecraft:block.note_block.harp
    1:  'dbass',             // Double Bass -> minecraft:block.note_block.bass
    2:  'bdrum',             // Bass Drum -> minecraft:block.note_block.basedrum
    3:  'sdrum',             // Snare Drum -> minecraft:block.note_block.snare
    4:  'click',             // Click/Hi-hat -> minecraft:block.note_block.hat
    5:  'guitar',            // Guitar -> minecraft:block.note_block.guitar
    6:  'flute',             // Flute -> minecraft:block.note_block.flute
    7:  'bell',              // Bell/Glockenspiel -> minecraft:block.note_block.bell
    8:  'icechime',          // Chime/Ice -> minecraft:block.note_block.chime
    9:  'xylobone',          // Xylophone -> minecraft:block.note_block.xylophone
    10: 'iron_xylophone',    // Iron Xylophone -> minecraft:block.note_block.iron_xylophone
    11: 'cow_bell',          // Cow Bell -> minecraft:block.note_block.cow_bell
    12: 'didgeridoo',        // Didgeridoo -> minecraft:block.note_block.didgeridoo
    13: 'bit',               // Bit/Square -> minecraft:block.note_block.bit
    14: 'banjo',             // Banjo -> minecraft:block.note_block.banjo
    15: 'pling',             // Pling/Electric Piano -> minecraft:block.note_block.pling
    16: 'copper',            // Copper Horn -> minecraft:block.note_block.copper
    17: 'copper_exposed',    // Exposed Copper Horn -> minecraft:block.note_block.copper_exposed
    18: 'copper_weathered',  // Weathered Copper Horn -> minecraft:block.note_block.copper_weathered
    19: 'copper_oxidized'    // Oxidized Copper Horn -> minecraft:block.note_block.copper_oxidized
};

// 音效缓冲区缓存
var audioBuffers = {};
var audioContext = null;
var masterGain = null;
var masterCompressor = null;
var dryGain = null;          // 干声 (无混响)
var wetGain = null;          // 湿声 (含混响)
var convolverNode = null;    // Convolver 混响节点
var isAudioReady = false;

// 活动音源节点列表 (用于 stopAll 立即停止所有声音)
var _activeSources = [];

// 是否启用音效增强 (混响 + 暖声)。关闭后回到最原始的直连。
// 用户可在设置弹窗里切换。
var audioEnhanceEnabled = true;

// 增强模式专用节点
var _enhanceCompressor = null;
var _enhanceWetGain = null;
var _enhanceDryGain = null;
var _enhanceReverb = null;

// 乐器音量归一化：根据音符盒实际音量调整
// 参考：Note Block Studio 根据音色做的整体响度补偿
var INSTRUMENT_GAIN = {
    'harp':             0.70,
    'dbass':            0.85,
    'bdrum':            0.80,
    'sdrum':            0.80,
    'click':            0.70,
    'guitar':           0.75,
    'flute':            0.70,
    'bell':             0.65,
    'icechime':         0.65,
    'xylobone':         0.70,
    'iron_xylophone':   0.70,
    'cow_bell':         0.70,
    'didgeridoo':       0.85,
    'bit':              0.70,
    'banjo':            0.70,
    'pling':            0.70,
    'copper':           0.75,
    'copper_exposed':   0.75,
    'copper_weathered': 0.75,
    'copper_oxidized':  0.75
};

/**
 * 初始化音频系统
 */
function initAudioEngine() {
    if (audioContext) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext 已创建, 采样率:', audioContext.sampleRate);

        // 主音量 + 动态压缩器：防止多个音符叠加导致削波炸音
        masterCompressor = audioContext.createDynamicsCompressor();
        masterCompressor.threshold.value = -20;    // 超过 -20dB 开始压缩
        masterCompressor.knee.value = 20;          // 平滑膝部
        masterCompressor.ratio.value = 6;          // 6:1 压缩比
        masterCompressor.attack.value = 0.005;     // 5ms 快速启动
        masterCompressor.release.value = 0.18;     // 180ms 释放

        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.9;

        // 干湿分离节点: 干声 = 原始音色, 湿声 = 通过混响
        dryGain = audioContext.createGain();
        wetGain = audioContext.createGain();
        dryGain.gain.value = 1.0;
        wetGain.gain.value = 0.18;     // 混响比例较小, 避免"浴室感"

        // 简易混响 (算法生成 IR, 不依赖外部资源)
        convolverNode = audioContext.createConvolver();
        convolverNode.buffer = createReverbIR(2.4, 2.5);

        // 路由: masterGain -> [dryGain -> compressor, wetGain -> convolver -> compressor] -> destination
        masterGain.connect(dryGain);
        dryGain.connect(masterCompressor);

        masterGain.connect(convolverNode);
        convolverNode.connect(wetGain);
        wetGain.connect(masterCompressor);

        masterCompressor.connect(audioContext.destination);

    } catch (e) {
        console.error('无法创建 AudioContext:', e);
        return;
    }

    // 预加载所有声音
    preloadAllSounds();
}

/**
 * 算法生成简易混响 IR (脉冲响应)
 * 模仿中等大小房间/礼堂的衰减
 * @param {number} durationSec - 衰减时间(秒)
 * @param {number} decay - 衰减曲线 (越大越暗)
 */
function createReverbIR(durationSec, decay) {
    var sr = audioContext.sampleRate;
    var len = Math.floor(sr * durationSec);
    var ir = audioContext.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
        var data = ir.getChannelData(ch);
        for (var i = 0; i < len; i++) {
            // 随机噪声 + 指数衰减
            var t = i / len;
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        }
    }
    return ir;
}

/**
 * 切换音效优化开关
 * 研究NoteBlockStudio源码发现：NBS 完全不使用混响或效果处理，纯干声播放。
 * 音质好的原因是：高质量OGG样本 + 精确音高公式 + 每音符独立emitter自然重叠。
 *
 * @param {boolean} enabled - true=NBS风格(纯干声, 匹配NoteBlockStudio), false=原始效果链(混响+压缩)
 */
function setAudioEnhance(enabled) {
    audioEnhanceEnabled = !!enabled;
    if (audioEnhanceEnabled) {
        // NBS 风格：纯干声，无混响无压缩，直连输出
        // 这是 NoteBlockStudio 的实际行为
        if (masterGain) {
            try { masterGain.disconnect(); } catch(e) {}
            // 断开所有效果节点
            if (dryGain) { try { dryGain.disconnect(); } catch(e) {} }
            if (wetGain) { try { wetGain.disconnect(); } catch(e) {} }
            if (convolverNode) { try { convolverNode.disconnect(); } catch(e) {} }
            if (masterCompressor) { try { masterCompressor.disconnect(); } catch(e) {} }
            if (_enhanceCompressor) { try { _enhanceCompressor.disconnect(); } catch(e) {} }
            if (_enhanceWetGain) { try { _enhanceWetGain.disconnect(); } catch(e) {} }
            if (_enhanceDryGain) { try { _enhanceDryGain.disconnect(); } catch(e) {} }
            if (_enhanceReverb) { try { _enhanceReverb.disconnect(); } catch(e) {} }
            // masterGain 直连 destination，完全匹配 NBS 的纯干声输出
            masterGain.connect(audioContext.destination);
        }
    } else {
        // 原始模式：混响 + 压缩器效果链
        if (masterGain) {
            try { masterGain.disconnect(); } catch(e) {}
            masterGain.connect(dryGain);
            dryGain.connect(masterCompressor);
            masterGain.connect(convolverNode);
            convolverNode.connect(wetGain);
            wetGain.connect(masterCompressor);
            masterCompressor.connect(audioContext.destination);
        }
    }
}

function isAudioEnhanceEnabled() {
    return audioEnhanceEnabled;
}

/**
 * 根据 NBS key 计算 Minecraft 音符盒音高 (playsound pitch)
 * 参考: NoteBlockStudio play_sound.gml
 *
 * NBS 实时播放公式 (play_sound.gml):
 *   keyshift = key + (ins.key + pit/100 - 78)   // ins.key 默认 45, pit 默认 0
 *   pitch = 0.5 * 2^(keyshift / 12)
 * 即: keyshift = key - 33 (当 ins.key=45, pit=0 时)
 *
 * 注意: NBS 实时播放不做八度折叠，超出范围的音符按实际音高播放
 * (dat_pitch.gml 中的折叠仅用于 /playsound 命令导出)
 */
function getMinecraftPitch(key) {
    // 匹配 NBS play_sound.gml: keyshift = key + 45 + 0 - 78 = key - 33
    var keyshift = key - 33;
    return 0.5 * Math.pow(2, keyshift / 12);
}

/**
 * 根据 NBS key 计算 Web Audio API 用的播放速率
 * MC 音符盒 sounds.json 中的 pitch 直接对应 playbackRate
 */
function getPlaybackRate(key) {
    return getMinecraftPitch(key);
}

/**
 * 预加载所有音色文件
 */
function preloadAllSounds() {
    if (!audioContext) return;

    var soundNames = Object.values(NBS_INSTRUMENT_TO_SOUND);
    var uniqueNames = [];
    for (var i = 0; i < soundNames.length; i++) {
        if (uniqueNames.indexOf(soundNames[i]) === -1) {
            uniqueNames.push(soundNames[i]);
        }
    }

    var loaded = 0;
    var total = uniqueNames.length;

    uniqueNames.forEach(function(name) {
        var url = '/static/sounds/' + name + '.ogg';
        fetch(url)
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.arrayBuffer();
            })
            .then(function(arrayBuffer) {
                return audioContext.decodeAudioData(arrayBuffer);
            })
            .then(function(buffer) {
                audioBuffers[name] = buffer;
                loaded++;
                console.log('已加载音色 [' + loaded + '/' + total + ']: ' + name);
                if (loaded >= total) {
                    isAudioReady = true;
                    console.log('全部音色加载完成, 音频引擎就绪');
                }
            })
            .catch(function(err) {
                console.warn('加载音色失败 [' + name + ']:', err.message);
                loaded++;
            });
    });
}

/**
 * 在用户交互后恢复 AudioContext (浏览器自动播放策略要求)
 */
function resumeAudioContext() {
    if (!audioContext) return;
    if (audioContext.state === 'suspended' || audioContext.state === 'interrupted') {
        audioContext.resume().catch(function(err) {
            console.warn('AudioContext resume 失败:', err);
        });
    }
}

/**
 * 播放单个音符 (Minecraft 红石音乐风格)
 *
 * @param {number} instrument - NBS 乐器索引 (0-15)
 * @param {number} key - NBS 音高 (0-87)
 * @param {number} velocity - 力度/音量 (0-100)
 * @param {number} pan - 声像 (0-100, 50=居中)
 */
function playMinecraftNote(instrument, key, velocity, pan) {
    if (velocity === undefined) velocity = 100;
    if (pan === undefined) pan = 50;

    // 懒加载 AudioContext
    if (!audioContext) {
        initAudioEngine();
    }
    if (!audioContext) return;

    // 浏览器自动播放策略：必须在用户交互后恢复 AudioContext
    resumeAudioContext();

    var soundName = NBS_INSTRUMENT_TO_SOUND[instrument] || 'harp';
    var buffer = audioBuffers[soundName];

    // 如果没有预加载到音频，尝试即时加载
    if (!buffer) {
        loadAndPlaySound(soundName, key, velocity, pan);
        return;
    }

    playBuffer(buffer, key, velocity, pan, soundName);
}

/**
 * 播放已加载的音频缓冲区
 * - NBS 模式 (audioEnhanceEnabled=true): 纯干声, 无包络, 直接播放原始样本
 *   这完全匹配 NoteBlockStudio 的行为: 每个音符就是一个 OGG 样本按音高播放
 * - 原始模式 (audioEnhanceEnabled=false): 使用 ADSR 包络 + 混响 + 压缩
 */
function playBuffer(buffer, key, velocity, pan, soundName) {
    if (!audioContext || !masterGain) return;

    // 速率 = Minecraft playsound pitch (基于 key)
    var rate = getPlaybackRate(key);

    // 乐器归一化音量（防止某乐器特别响）
    var instrGain = (soundName && INSTRUMENT_GAIN[soundName] !== undefined)
        ? INSTRUMENT_GAIN[soundName]
        : 0.70;

    // Velocity is a true percentage so track volume applies linearly.
    var v = Math.max(0, Math.min(100, velocity === undefined ? 100 : velocity));
    // A muted track must produce no audible source, rather than falling back to 100%.
    if (v <= 0) return;
    var velocityGain = v / 100;

    // 最终音量：综合乐器 & velocity
    var gain = instrGain * velocityGain;

    // 声像: pan 0-100 -> stereoPan -1 to 1
    var panValue = (typeof pan === 'number') ? pan : 50;
    var stereoValue = (panValue - 50) / 50;

    var now = audioContext.currentTime;

    var source = audioContext.createBufferSource();
    source.buffer = buffer;
    if ('playbackRate' in source) source.playbackRate.value = rate;

    if (audioEnhanceEnabled) {
        // NBS 模式: 无包络, 直接恒定增益播放原始样本
        // 完全匹配 NoteBlockStudio: 样本从头到尾自然播放, 无幅度修改
        var nbsGain = audioContext.createGain();
        nbsGain.gain.value = gain;
        source.connect(nbsGain);

        if (audioContext.createStereoPanner) {
            var nbsPanner = audioContext.createStereoPanner();
            nbsPanner.pan.value = stereoValue;
            nbsGain.connect(nbsPanner);
            nbsPanner.connect(masterGain);
        } else {
            nbsGain.connect(masterGain);
        }

        // 播放完整样本 (NBS 行为: 让样本自然结束)
        var fullDuration = buffer.duration / Math.max(0.5, rate);
        source.start(now);
        source.stop(now + fullDuration + 0.05);

        _activeSources.push(source);
        source.onended = function() {
            var idx = _activeSources.indexOf(source);
            if (idx >= 0) _activeSources.splice(idx, 1);
        };
    } else {
        // 原始模式: 使用 ADSR 包络
        var env = audioContext.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(gain, now + 0.008);
        env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.4), now + 0.12);
        env.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.3, buffer.duration / Math.max(0.5, rate)));

        source.connect(env);

        if (audioContext.createStereoPanner) {
            var panner = audioContext.createStereoPanner();
            panner.pan.value = stereoValue;
            env.connect(panner);
            panner.connect(masterGain);
        } else {
            env.connect(masterGain);
        }

        source.start(now);
        source.stop(now + Math.max(0.4, buffer.duration / Math.max(0.5, rate)) + 0.05);

        _activeSources.push(source);
        source.onended = function() {
            var idx = _activeSources.indexOf(source);
            if (idx >= 0) _activeSources.splice(idx, 1);
        };
    }
}

/**
 * 即时加载并播放声音（备用方案）
 */
function loadAndPlaySound(soundName, key, velocity, pan) {
    if (!audioContext) return;

    var url = '/static/sounds/' + soundName + '.ogg';

    fetch(url)
        .then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.arrayBuffer();
        })
        .then(function(arrayBuffer) {
            return audioContext.decodeAudioData(arrayBuffer);
        })
        .then(function(buffer) {
            audioBuffers[soundName] = buffer;
            playBuffer(buffer, key, velocity, pan, soundName);
        })
        .catch(function(err) {
            console.warn('即时加载失败 [' + soundName + ']:', err.message);
            // 最终回退：生成合成音
            playSynthesizedNote(key, velocity);
        });
}

/**
 * 合成音回退 (基于 OscillatorNode)
 */
function playSynthesizedNote(key, velocity) {
    if (!audioContext || !masterGain) return;

    var v = velocity === undefined ? 100 : velocity;
    if (v <= 0) return;
    var gain = Math.max(0, Math.min(0.3, v / 300));
    var rate = getPlaybackRate(key);
    var freq = 46.25 * rate;

    var osc = audioContext.createOscillator();
    var gainNode = audioContext.createGain();
    var now = audioContext.currentTime;

    osc.type = 'square';
    osc.frequency.value = Math.max(20, Math.min(8000, freq));

    // 使用与采样音相同的包络：避免硬切换炸音
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(gain, now + 0.008);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.3), now + 0.15);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gainNode);
    gainNode.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.55);

    // 跟踪活动音源, 用于 stopAll 立即停止
    _activeSources.push(osc);
    osc.onended = function() {
        var idx = _activeSources.indexOf(osc);
        if (idx >= 0) _activeSources.splice(idx, 1);
    };
}

/**
 * 批量播放音符
 */
function playNotes(notes) {
    if (!audioContext) initAudioEngine();
    if (!audioContext || !notes) return;

    for (var i = 0; i < notes.length; i++) {
        var n = notes[i];
        playMinecraftNote(n.instrument, n.key, n.velocity, n.pan);
    }
}

/**
 * 获取播放速率（供 UI 显示）
 */
function getNotePlaybackRate(key) {
    return getPlaybackRate(key);
}

/**
 * 获取音频是否就绪
 */
function audioReady() {
    return isAudioReady;
}

/**
 * 立即停止所有正在发声的音符并切断音频图
 * 用于暂停/停止时立即静音, 消除回声/混响尾音
 */
function stopAllAudio() {
    if (!audioContext) return;
    // 1. 停止并断开所有活动音源节点
    for (var i = 0; i < _activeSources.length; i++) {
        try { _activeSources[i].stop(); } catch(e) {}
        try { _activeSources[i].disconnect(); } catch(e) {}
    }
    _activeSources = [];
    // 2. 断开 masterGain 并重建干净的音频图
    //    这确保所有正在处理的混响/回声被立即切断
    if (masterGain) {
        try { masterGain.disconnect(); } catch(e) {}
    }
    // 重建连接 (根据当前增强模式)
    if (audioEnhanceEnabled) {
        if (masterGain) {
            masterGain.connect(audioContext.destination);
        }
    } else {
        if (masterGain && dryGain && masterCompressor && convolverNode && wetGain) {
            masterGain.connect(dryGain);
            dryGain.connect(masterCompressor);
            masterGain.connect(convolverNode);
            convolverNode.connect(wetGain);
            wetGain.connect(masterCompressor);
            masterCompressor.connect(audioContext.destination);
        }
    }
}

// 导出到全局
window.AudioEngine = {
    init: initAudioEngine,
    playNote: playMinecraftNote,
    playNotes: playNotes,
    getPitch: getMinecraftPitch,
    getRate: getNotePlaybackRate,
    isReady: audioReady,
    setEnhance: setAudioEnhance,
    isEnhanceEnabled: isAudioEnhanceEnabled,
    stopAll: stopAllAudio,
    getContext: function() { return audioContext; }
};
