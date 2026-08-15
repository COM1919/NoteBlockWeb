/**
 * SF3/SF2 SoundFont 播放器
 * 解析 RIFF 结构, 提取预设/乐器/样本, 通过 Web Audio API 播放
 * SF3 (Vorbis 压缩样本) 和 SF2 (PCM 样本) 均支持
 */
(function() {
    'use strict';

    // SF2/SF3 生成器类型 (仅列出播放所需子集)
    var GEN = {
        SUSTAIN_VOL_ENV: 37,
        RELEASE_VOL_ENV: 38,
        PAN: 17,
        INSTRUMENT: 41,
        KEY_RANGE: 43,
        VEL_RANGE: 44,
        COARSE_TUNE: 51,
        FINE_TUNE: 52,
        SAMPLE_ID: 53,
        SCALE_TUNING: 54,
        EXCLUSIVE_CLASS: 55,
        OVERRIDING_ROOT_KEY: 56,
        INITIAL_ATTENUATION: 48
    };

    // ---- 二进制读取辅助 ----
    function fourCC(view, off) {
        var s = '';
        for (var i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(off + i));
        return s;
    }
    function readStr(view, off, max) {
        var s = '';
        for (var i = 0; i < max; i++) {
            var c = view.getUint8(off + i);
            if (c === 0) break;
            s += String.fromCharCode(c);
        }
        return s;
    }
    function int16(u16) { return u16 >= 32768 ? u16 - 65536 : u16; }

    // ---- 构造 ----
    function SF3Player(audioContext) {
        this.ctx = audioContext;
        this.presets = [];
        this.presetBags = [];
        this.presetGens = [];
        this.instruments = [];
        this.instBags = [];
        this.instGens = [];
        this.samples = [];
        this.sampleData = null;
        this.isSF3 = false;
        this.audioBuffers = [];
        this.channelPrograms = new Array(16).fill(0);
        this.channelBanks = new Array(16).fill(0);
        this.channelBanks[9] = 128; // 鼓组通道
        this.activeNotes = new Map(); // "ch:note" -> [{source, gain}]
        this._outputGain = null;
        this._ready = false;
    }

    // ---- 输出节点 ----
    SF3Player.prototype._getOutput = function() {
        if (!this._outputGain) {
            this._outputGain = this.ctx.createGain();
            this._outputGain.gain.value = 0.75;
            this._outputGain.connect(this.ctx.destination);
        }
        return this._outputGain;
    };

    // ============================================================
    //  RIFF 解析
    // ============================================================
    SF3Player.prototype.load = function(arrayBuffer, onProgress) {
        var self = this;
        return new Promise(function(resolve, reject) {
            try {
                var view = new DataView(arrayBuffer);
                if (fourCC(view, 0) !== 'RIFF')
                    throw new Error('不是 RIFF 文件');
                var form = fourCC(view, 8);
                if (form !== 'sfbk' && form !== 'sfbnk')
                    throw new Error('不是 SoundFont 文件 (form=' + form + ')');

                // 遍历顶层 LIST 块
                var offset = 12;
                var infoChunk = null, sdtaChunk = null, pdtaChunk = null;
                while (offset + 8 <= view.byteLength) {
                    var id = fourCC(view, offset);
                    var sz = view.getUint32(offset + 4, true);
                    if (id === 'LIST') {
                        var lt = fourCC(view, offset + 8);
                        var data = { buf: arrayBuffer, start: offset + 12, end: offset + 8 + sz };
                        if (lt === 'INFO') infoChunk = data;
                        else if (lt === 'sdta') sdtaChunk = data;
                        else if (lt === 'pdta') pdtaChunk = data;
                    }
                    offset += 8 + sz;
                    if (sz % 2 !== 0) offset++;
                }

                if (!sdtaChunk) throw new Error('缺少 sdta 块');
                if (!pdtaChunk) throw new Error('缺少 pdta 块');

                // 解析 sdta → smpl 子块
                self._parseSdta(arrayBuffer, sdtaChunk.start, sdtaChunk.end);

                // 解析 pdta 子块
                self._parsePdta(arrayBuffer, pdtaChunk.start, pdtaChunk.end);

                // 检测 SF3 vs SF2
                if (self.sampleData && self.sampleData.byteLength >= 4) {
                    var sv = new DataView(self.sampleData);
                    // OggS = 0x4F 0x67 0x67 0x53
                    if (sv.getUint8(0) === 0x4F && sv.getUint8(1) === 0x67 &&
                        sv.getUint8(2) === 0x67 && sv.getUint8(3) === 0x53) {
                        self.isSF3 = true;
                    }
                }

                // 解码样本
                self._decodeSamples(onProgress).then(function() {
                    self._ready = true;
                    resolve();
                }).catch(function(err) {
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    };

    // ---- sdta → smpl ----
    SF3Player.prototype._parseSdta = function(buf, start, end) {
        var view = new DataView(buf);
        var off = start;
        while (off + 8 <= end) {
            var id = fourCC(view, off);
            var sz = view.getUint32(off + 4, true);
            if (id === 'smpl') {
                this.sampleData = buf.slice(off + 8, off + 8 + sz);
            }
            off += 8 + sz;
            if (sz % 2 !== 0) off++;
        }
    };

    // ---- pdta 子块 ----
    SF3Player.prototype._parsePdta = function(buf, start, end) {
        var view = new DataView(buf);
        var off = start;
        while (off + 8 <= end) {
            var id = fourCC(view, off);
            var sz = view.getUint32(off + 4, true);
            var dataStart = off + 8;
            var dataEnd = off + 8 + sz;
            switch (id) {
                case 'phdr': this._parsePhdr(buf, dataStart, dataEnd); break;
                case 'pbag': this._parseBags(buf, dataStart, dataEnd, this.presetBags); break;
                case 'pgen': this._parseGens(buf, dataStart, dataEnd, this.presetGens); break;
                case 'inst': this._parseInst(buf, dataStart, dataEnd); break;
                case 'ibag': this._parseBags(buf, dataStart, dataEnd, this.instBags); break;
                case 'igen': this._parseGens(buf, dataStart, dataEnd, this.instGens); break;
                case 'shdr': this._parseShdr(buf, dataStart, dataEnd); break;
            }
            off += 8 + sz;
            if (sz % 2 !== 0) off++;
        }
    };

    // phdr: 38 bytes/rec
    SF3Player.prototype._parsePhdr = function(buf, start, end) {
        var v = new DataView(buf);
        for (var off = start; off + 38 <= end; off += 38) {
            this.presets.push({
                name: readStr(v, off, 20),
                preset: v.getUint16(off + 20, true),
                bank: v.getUint16(off + 22, true),
                bagIndex: v.getUint16(off + 24, true)
            });
        }
    };

    // pbag/ibag: 4 bytes/rec
    SF3Player.prototype._parseBags = function(buf, start, end, arr) {
        var v = new DataView(buf);
        for (var off = start; off + 4 <= end; off += 4) {
            arr.push({
                genIndex: v.getUint16(off, true),
                modIndex: v.getUint16(off + 2, true)
            });
        }
    };

    // pgen/igen: 4 bytes/rec
    SF3Player.prototype._parseGens = function(buf, start, end, arr) {
        var v = new DataView(buf);
        for (var off = start; off + 4 <= end; off += 4) {
            arr.push({
                oper: v.getUint16(off, true),
                amount: v.getUint16(off + 2, true)
            });
        }
    };

    // inst: 22 bytes/rec
    SF3Player.prototype._parseInst = function(buf, start, end) {
        var v = new DataView(buf);
        for (var off = start; off + 22 <= end; off += 22) {
            this.instruments.push({
                name: readStr(v, off, 20),
                bagIndex: v.getUint16(off + 20, true)
            });
        }
    };

    // shdr: 46 bytes/rec
    SF3Player.prototype._parseShdr = function(buf, start, end) {
        var v = new DataView(buf);
        for (var off = start; off + 46 <= end; off += 46) {
            this.samples.push({
                name: readStr(v, off, 20),
                start: v.getUint32(off + 20, true),
                end: v.getUint32(off + 24, true),
                startLoop: v.getUint32(off + 28, true),
                endLoop: v.getUint32(off + 32, true),
                sampleRate: v.getUint32(off + 36, true),
                originalPitch: v.getUint8(off + 40),
                pitchCorrection: v.getInt8(off + 41),
                sampleLink: v.getUint16(off + 42, true),
                sampleType: v.getUint16(off + 44, true)
            });
        }
    };

    // ============================================================
    //  样本解码
    // ============================================================
    SF3Player.prototype._decodeSamples = function(onProgress) {
        var self = this;
        var total = this.samples.length;
        // 最后一条 shdr 是终止符, 跳过
        if (total > 0) total--;
        var decoded = 0;

        return new Promise(function(resolve) {
            function decodeNext(i) {
                if (i >= total) { resolve(); return; }
                var s = self.samples[i];
                if (!s || s.start >= s.end || !self.sampleData) {
                    self.audioBuffers[i] = null;
                    decoded++;
                    if (onProgress) onProgress(decoded / total);
                    decodeNext(i + 1);
                    return;
                }

                if (self.isSF3) {
                    // SF3: Vorbis 数据, 用 decodeAudioData 解码
                    var chunk = self.sampleData.slice(s.start, s.end);
                    // decodeAudioData 会消耗 ArrayBuffer, 传副本
                    var copy = chunk.slice(0);
                    self.ctx.decodeAudioData(copy, function(buf) {
                        self.audioBuffers[i] = buf;
                        decoded++;
                        if (onProgress) onProgress(decoded / total);
                        decodeNext(i + 1);
                    }, function() {
                        self.audioBuffers[i] = null;
                        decoded++;
                        if (onProgress) onProgress(decoded / total);
                        decodeNext(i + 1);
                    });
                } else {
                    // SF2: 16-bit PCM
                    try {
                        self.audioBuffers[i] = self._pcmToBuffer(s);
                    } catch (e) {
                        self.audioBuffers[i] = null;
                    }
                    decoded++;
                    if (onProgress) onProgress(decoded / total);
                    decodeNext(i + 1);
                }
            }
            decodeNext(0);
        });
    };

    // SF2 PCM → AudioBuffer
    SF3Player.prototype._pcmToBuffer = function(s) {
        var v = new DataView(this.sampleData);
        var startByte = s.start * 2;
        var endByte = s.end * 2;
        var n = Math.floor((endByte - startByte) / 2);
        if (n <= 0) return null;
        var sr = s.sampleRate || 44100;
        var buf = this.ctx.createBuffer(1, n, sr);
        var ch = buf.getChannelData(0);
        for (var i = 0; i < n; i++) {
            ch[i] = v.getInt16(startByte + i * 2, true) / 32768;
        }
        return buf;
    };

    // ============================================================
    //  预设/样本查找
    // ============================================================
    SF3Player.prototype._findPreset = function(bank, program) {
        for (var i = 0; i < this.presets.length - 1; i++) {
            if (this.presets[i].bank === bank && this.presets[i].preset === program) return i;
        }
        // 回退到 bank 0
        if (bank !== 0) {
            for (var j = 0; j < this.presets.length - 1; j++) {
                if (this.presets[j].bank === 0 && this.presets[j].preset === program) return j;
            }
        }
        return -1;
    };

    // 从预设索引查找匹配 note+velocity 的样本
    SF3Player.prototype._findSampleInfo = function(presetIdx, note, velocity) {
        var preset = this.presets[presetIdx];
        if (!preset) return null;
        var nextBag = (presetIdx + 1 < this.presets.length)
            ? this.presets[presetIdx + 1].bagIndex : this.presetBags.length;

        // 遍历预设区域 → 找到匹配的 instrument
        for (var bi = preset.bagIndex; bi < nextBag; bi++) {
            var bag = this.presetBags[bi];
            var nextGen = (bi + 1 < this.presetBags.length)
                ? this.presetBags[bi + 1].genIndex : this.presetGens.length;
            var instIdx = -1, pKeyLo = 0, pKeyHi = 127, pVelLo = 0, pVelHi = 127;
            for (var gi = bag.genIndex; gi < nextGen; gi++) {
                var g = this.presetGens[gi];
                if (g.oper === GEN.INSTRUMENT) instIdx = g.amount;
                else if (g.oper === GEN.KEY_RANGE) { pKeyLo = g.amount & 0xFF; pKeyHi = (g.amount >> 8) & 0xFF; }
                else if (g.oper === GEN.VEL_RANGE) { pVelLo = g.amount & 0xFF; pVelHi = (g.amount >> 8) & 0xFF; }
            }
            if (instIdx < 0) continue;
            if (note < pKeyLo || note > pKeyHi) continue;
            if (velocity < pVelLo || velocity > pVelHi) continue;

            // 遍历乐器区域 → 找到匹配的 sample
            var inst = this.instruments[instIdx];
            if (!inst) continue;
            var nextIBag = (instIdx + 1 < this.instruments.length)
                ? this.instruments[instIdx + 1].bagIndex : this.instBags.length;

            for (var ii = inst.bagIndex; ii < nextIBag; ii++) {
                var ibag = this.instBags[ii];
                var nextIGen = (ii + 1 < this.instBags.length)
                    ? this.instBags[ii + 1].genIndex : this.instGens.length;
                var sId = -1, iKeyLo = 0, iKeyHi = 127, iVelLo = 0, iVelHi = 127;
                var rootKey = -1, fineTune = 0, coarseTune = 0, pan = 0, atten = 0;
                for (var ig = ibag.genIndex; ig < nextIGen; ig++) {
                    var gen = this.instGens[ig];
                    switch (gen.oper) {
                        case GEN.SAMPLE_ID: sId = gen.amount; break;
                        case GEN.KEY_RANGE: iKeyLo = gen.amount & 0xFF; iKeyHi = (gen.amount >> 8) & 0xFF; break;
                        case GEN.VEL_RANGE: iVelLo = gen.amount & 0xFF; iVelHi = (gen.amount >> 8) & 0xFF; break;
                        case GEN.OVERRIDING_ROOT_KEY: rootKey = gen.amount & 0xFF; break;
                        case GEN.FINE_TUNE: fineTune = int16(gen.amount); break;
                        case GEN.COARSE_TUNE: coarseTune = int16(gen.amount); break;
                        case GEN.PAN: pan = int16(gen.amount); break;
                        case GEN.INITIAL_ATTENUATION: atten = gen.amount; break;
                    }
                }
                if (sId < 0) continue;
                if (note < iKeyLo || note > iKeyHi) continue;
                if (velocity < iVelLo || velocity > iVelHi) continue;

                var sample = this.samples[sId];
                if (!sample) continue;
                if (rootKey < 0) rootKey = sample.originalPitch;

                return {
                    sampleId: sId,
                    rootKey: rootKey + coarseTune,
                    fineTune: fineTune + sample.pitchCorrection,
                    pan: pan,
                    attenuation: atten,
                    loopStart: sample.startLoop,
                    loopEnd: sample.endLoop,
                    sampleStart: sample.start,
                    sampleRate: sample.sampleRate
                };
            }
        }
        return null;
    };

    // ============================================================
    //  播放
    // ============================================================
    SF3Player.prototype.noteOn = function(channel, note, velocity) {
        if (!this._ready) return;
        channel &= 0x0F; note &= 0x7F; velocity &= 0x7F;
        if (velocity === 0) { this.noteOff(channel, note); return; }

        var bank = this.channelBanks[channel];
        var program = this.channelPrograms[channel];
        // 鼓组通道 (ch=9) 强制 bank=128
        if (channel === 9) bank = 128;

        var presetIdx = this._findPreset(bank, program);
        if (presetIdx < 0) return;
        var si = this._findSampleInfo(presetIdx, note, velocity);
        if (!si) return;

        var buf = this.audioBuffers[si.sampleId];
        if (!buf) return;

        var src = this.ctx.createBufferSource();
        src.buffer = buf;

        // 音高: playbackRate = 2^((note - rootKey + fineTune/100) / 12)
        var semitones = note - si.rootKey + si.fineTune / 100;
        src.playbackRate.value = Math.pow(2, semitones / 12);

        // 循环 (SF2: 有明确循环点时启用)
        if (!this.isSF3 && si.loopEnd > si.loopStart && si.loopEnd > 0) {
            try {
                src.loop = true;
                src.loopStart = (si.loopStart - si.sampleStart) / si.sampleRate;
                src.loopEnd = (si.loopEnd - si.sampleStart) / si.sampleRate;
            } catch (e) {}
        }

        // 增益: velocity + attenuation
        var gain = this.ctx.createGain();
        var velGain = (velocity / 127) * 0.8;
        var attenGain = Math.pow(10, -si.attenuation / 200); // 0.1dB units → linear
        gain.gain.value = velGain * attenGain;

        // 声像
        if (si.pan !== 0) {
            var panVal = si.pan / 500; // -1..1
            try {
                var panner = this.ctx.createStereoPanner();
                panner.pan.value = Math.max(-1, Math.min(1, panVal));
                src.connect(gain).connect(panner).connect(this._getOutput());
            } catch (e) {
                src.connect(gain).connect(this._getOutput());
            }
        } else {
            src.connect(gain).connect(this._getOutput());
        }

        src.start(0);

        // 记录活动音符 (同一 ch:note 可能有多个 zone 同时触发)
        var key = channel + ':' + note;
        var list = this.activeNotes.get(key);
        if (!list) { list = []; this.activeNotes.set(key, list); }
        list.push({ source: src, gain: gain });

        // 自动清理
        var self = this;
        src.onended = function() {
            var arr = self.activeNotes.get(key);
            if (arr) {
                var idx = arr.indexOf(src);
                if (idx >= 0) arr.splice(idx, 1);
                if (arr.length === 0) self.activeNotes.delete(key);
            }
        };
    };

    SF3Player.prototype.noteOff = function(channel, note) {
        channel &= 0x0F; note &= 0x7F;
        var key = channel + ':' + note;
        var list = this.activeNotes.get(key);
        if (!list) return;
        var now = this.ctx.currentTime;
        var rel = 0.08; // 80ms 释放
        list.forEach(function(n) {
            try {
                n.gain.gain.cancelScheduledValues(now);
                n.gain.gain.setValueAtTime(n.gain.gain.value, now);
                n.gain.gain.linearRampToValueAtTime(0, now + rel);
                n.source.stop(now + rel + 0.02);
            } catch (e) {}
        });
        this.activeNotes.delete(key);
    };

    SF3Player.prototype.noteOffAll = function() {
        var now = this.ctx.currentTime;
        var rel = 0.05;
        this.activeNotes.forEach(function(list) {
            list.forEach(function(n) {
                try {
                    n.gain.gain.cancelScheduledValues(now);
                    n.gain.gain.setValueAtTime(n.gain.gain.value, now);
                    n.gain.gain.linearRampToValueAtTime(0, now + rel);
                    n.source.stop(now + rel + 0.02);
                } catch (e) {}
            });
        });
        this.activeNotes.clear();
    };

    SF3Player.prototype.allSoundOff = function(channel) {
        channel &= 0x0F;
        var toRemove = [];
        this.activeNotes.forEach(function(_, key) {
            if (key.indexOf(channel + ':') === 0) toRemove.push(key);
        }, this);
        var now = this.ctx.currentTime;
        toRemove.forEach(function(key) {
            var list = this.activeNotes.get(key);
            if (list) {
                list.forEach(function(n) {
                    try { n.source.stop(now); } catch (e) {}
                });
            }
            this.activeNotes.delete(key);
        }, this);
    };

    // ============================================================
    //  MIDI 消息兼容 (与 webaudio-tinysynth 接口对齐)
    // ============================================================
    SF3Player.prototype.setProgram = function(channel, program) {
        this.channelPrograms[channel & 0x0F] = program & 0x7F;
    };

    SF3Player.prototype.send = function(msg) {
        if (!msg || msg.length < 2) return;
        var st = msg[0], d1 = msg[1], d2 = msg.length > 2 ? msg[2] : 0;
        var ch = st & 0x0F, type = st & 0xF0;
        switch (type) {
            case 0x80: this.noteOff(ch, d1); break;
            case 0x90: if (d2 > 0) this.noteOn(ch, d1, d2); else this.noteOff(ch, d1); break;
            case 0xB0:
                if (d1 === 0) this.channelBanks[ch] = (this.channelBanks[ch] & 0x7F) | (d2 << 7);
                else if (d1 === 32) this.channelBanks[ch] = (this.channelBanks[ch] & 0x3F80) | d2;
                else if (d1 === 120 || d1 === 123) this.allSoundOff(ch);
                break;
            case 0xC0: this.setProgram(ch, d1); break;
        }
    };

    // 兼容 TinySynth 的无操作方法
    SF3Player.prototype.setQuality = function() {};
    SF3Player.prototype.setReverb = function() {};
    SF3Player.prototype.getAudioContext = function() { return this.ctx; };

    SF3Player.prototype.getPresetList = function() {
        var list = [];
        for (var i = 0; i < this.presets.length - 1; i++) {
            list.push({
                name: this.presets[i].name,
                bank: this.presets[i].bank,
                program: this.presets[i].preset
            });
        }
        return list;
    };

    SF3Player.prototype.isReady = function() { return this._ready; };

    window.SF3Player = SF3Player;
})();
