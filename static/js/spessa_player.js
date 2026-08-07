/**
 * SpessaPlayer — SpessaSynth (spessasynth_lib) 合成器适配器
 * 提供与旧 SF3Player / WebAudioTinySynth 一致的接口:
 *   noteOn / noteOff / setProgram / send(bytes[,time]) / allSoundOff /
 *   noteOffAll / reset / getAudioContext / getPresetList / isReady / _ready
 * 引擎: WorkletSynthesizer (AudioWorklet 线程, 音质与性能优于旧 SF3Player)
 */
(function() {
    'use strict';

    var MODULE_URL = '/static/vendor/spessasynth_lib.js';
    var PROCESSOR_URL = '/static/vendor/spessasynth_processor.min.js';
    var _libPromise = null;

    function getLib() {
        if (!_libPromise) {
            _libPromise = import(MODULE_URL).catch(function(err) {
                _libPromise = null; // 允许下次重试
                throw err;
            });
        }
        return _libPromise;
    }

    function detectOgg(arrayBuffer) {
        // SF3 内含 Ogg Vorbis 压缩样本; 在文件头部区域扫描 'OggS'
        var scanLen = Math.min(arrayBuffer.byteLength, 262144);
        var u8 = new Uint8Array(arrayBuffer, 0, scanLen);
        for (var i = 0; i < scanLen - 4; i++) {
            if (u8[i] === 0x4F && u8[i + 1] === 0x67 && u8[i + 2] === 0x67 && u8[i + 3] === 0x53) {
                return true;
            }
        }
        return false;
    }

    function SpessaPlayer(audioContext) {
        this.ctx = audioContext || null;
        this.synth = null;
        this.lib = null;
        this.isSF3 = false;
        this._ready = false;
        this._connected = false;
        this.presets = [];
    }

    SpessaPlayer.isSupported = function() {
        return (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') &&
            !!(window.AudioContext && window.AudioContext.prototype) || !!(window.webkitAudioContext && window.webkitAudioContext.prototype);
    };

    SpessaPlayer.prototype.load = function(arrayBuffer, onProgress) {
        var self = this;
        self.isSF3 = detectOgg(arrayBuffer);
        if (onProgress) onProgress(0.05);
        return getLib().then(function(lib) {
            self.lib = lib;
            var ctx = self.ctx;
            if (!ctx) throw new Error('AudioContext 不可用');
            if (ctx.state === 'suspended') {
                try { ctx.resume(); } catch (e) {}
            }
            // 1. 注册 AudioWorklet 处理器
            return ctx.audioWorklet.addModule(PROCESSOR_URL);
        }).then(function() {
            if (onProgress) onProgress(0.2);
            var ctx = self.ctx;
            // 2. 创建合成器
            var synth = new self.lib.WorkletSynthesizer(ctx);
            self.synth = synth;
            // 3. SF3 需要等待 Vorbis 解码器就绪 (仅需一次)
            var prep = Promise.resolve();
            if (self.lib.BasicSoundBank && self.lib.BasicSoundBank.isSF3DecoderReady) {
                prep = Promise.resolve(self.lib.BasicSoundBank.isSF3DecoderReady).catch(function() {});
            }
            return prep;
        }).then(function() {
            if (onProgress) onProgress(0.4);
            // 4. 装载音色库 (addSoundBank 会转移 ArrayBuffer)
            return self.synth.soundBankManager.addSoundBank(arrayBuffer, 'main', 0);
        }).then(function() {
            if (onProgress) onProgress(0.7);
            // 5. 等待合成器完全就绪
            return Promise.resolve(self.synth.isReady);
        }).then(function() {
            // 6. 连接到输出
            try { self.synth.connect(self.ctx.destination); self._connected = true; } catch (e) {}
            try { self.synth.setLogLevel(false, false, false); } catch (e) {}
            self.presets = self.synth.presetList || [];
            self._ready = true;
            if (onProgress) onProgress(1);
        });
    };

    // ============ 与旧 SF3Player / TinySynth 对齐的接口 ============
    SpessaPlayer.prototype.noteOn = function(channel, note, velocity) {
        if (!this._ready) return;
        try { this.synth.noteOn(channel & 0x0F, note & 0x7F, Math.max(1, Math.min(127, velocity || 100))); } catch (e) {}
    };

    SpessaPlayer.prototype.noteOff = function(channel, note) {
        if (!this._ready) return;
        try { this.synth.noteOff(channel & 0x0F, note & 0x7F); } catch (e) {}
    };

    SpessaPlayer.prototype.setProgram = function(channel, program) {
        if (!this._ready) return;
        try { this.synth.programChange(channel & 0x0F, program & 0x7F); } catch (e) {}
    };

    // send(msg[, time]): msg 为 MIDI 字节数组; time 为 AudioContext 调度时间
    SpessaPlayer.prototype.send = function(msg, time) {
        if (!this._ready || !msg || msg.length < 1) return;
        try {
            this.synth.sendMessage(msg, 0, (time !== undefined && time !== null) ? { time: time } : undefined);
        } catch (e) {}
    };

    SpessaPlayer.prototype.allSoundOff = function(channel) {
        if (!this._ready) return;
        var ch = channel & 0x0F;
        try { this.synth.controllerChange(ch, 120, 0); } catch (e) {}
        try { this.synth.controllerChange(ch, 123, 0); } catch (e) {}
    };

    SpessaPlayer.prototype.noteOffAll = function() {
        if (!this._ready) return;
        try { this.synth.stopAll(true); } catch (e) {}
    };

    SpessaPlayer.prototype.reset = function() {
        if (!this._ready) return;
        try { this.synth.reset(); } catch (e) {}
    };

    // 兼容 TinySynth 的无操作方法
    SpessaPlayer.prototype.setQuality = function() {};
    SpessaPlayer.prototype.setReverb = function() {};

    SpessaPlayer.prototype.setAudioContext = function(ctx) {
        if (ctx && !this._ready) this.ctx = ctx;
    };

    SpessaPlayer.prototype.getAudioContext = function() { return this.ctx; };

    SpessaPlayer.prototype.getPresetList = function() {
        return this.presets || [];
    };

    SpessaPlayer.prototype.isReady = function() { return this._ready; };

    window.SpessaPlayer = SpessaPlayer;
})();
