// ====================================================================
// 音频修正工具 (audio_fix_utils.js)
// 音高检测 / 变速重采样 / WAV 编码 / 波形绘制 —— 供"音频修正窗口"与后续导出使用
// 无第三方依赖, 纯本地算法
// ====================================================================
(function() {
    'use strict';

    // ---- 音高换算 ----
    // 项目 key: 0-87, key+21 = MIDI 音符号 (33 -> F#3)
    function nbsKeyToHz(key) {
        var midi = key + 21;
        return 440 * Math.pow(2, (midi - 69) / 12);
    }
    function hzToNbsKey(hz) {
        if (!(hz > 0)) return null;
        var midi = 69 + 12 * Math.log(hz / 440) / Math.LN2;
        return midi - 21; // float
    }
    function keyLabel(k) {
        var names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
        var m = Math.round(k) + 21;
        if (m < 0) m = 0;
        var name = names[m % 12];
        var oct = Math.floor(m / 12) - 1;
        return name + oct;
    }

    // ---- 音高检测 (时域自相关), 取采样主体段 ----
    // buffer: AudioBuffer; 返回 { key: float(nbs key), hz, cents, conf } 或 null
    function detectPitch(buffer) {
        if (!buffer || buffer.length < 1024) return null;
        var ch0 = buffer.getChannelData(0);
        var sr = buffer.sampleRate;
        var start = Math.floor(sr * 0.03);          // 跳过淡入起始
        var total = ch0.length - start;
        var winLen = Math.floor(sr * 0.6);          // 分析窗 0.6s
        if (winLen > total) winLen = Math.max(256, total);
        var end = start + winLen;

        // 子窗步长 0.2s, 最多分析 3 窗, 取能量最大且一致的
        var step = Math.floor(sr * 0.2);
        var candidates = [];
        var cursor = start;
        var guard = 0;
        while (cursor + 1024 <= end && guard < 8) {
            var segLen = Math.min(winLen, end - cursor);
            if (segLen < 1024) break;
            var c = detectPitchWindow(ch0, cursor, segLen, sr);
            if (c) candidates.push(c);
            cursor += step;
            guard++;
        }
        if (candidates.length === 0) return null;
        // 取中位数频率作为稳健主值 (避免瞬时噪音)
        candidates.sort(function(a, b) { return a.hz - b.hz; });
        var med = candidates[Math.floor(candidates.length / 2)];
        if (!med) return null;
        // 一致性: 与中位数偏差 > 3 半音的候选丢弃后再平均
        var kept = [];
        for (var i = 0; i < candidates.length; i++) {
            var dev = Math.abs(12 * Math.log(candidates[i].hz / med.hz) / Math.LN2);
            if (dev <= 3) kept.push(candidates[i].hz);
        }
        if (kept.length === 0) kept = [med.hz];
        var avgHz = kept.reduce(function(a, b) { return a + b; }, 0) / kept.length;
        var key = hzToNbsKey(avgHz);
        return {
            key: key,
            hz: avgHz,
            cents: (key - Math.round(key)) * 100,
            conf: kept.length / candidates.length
        };
    }

    // 单个窗口自相关 (归一化 + 峰值拾取)
    function detectPitchWindow(data, offset, len, sr) {
        // 先求该段能量与去均值
        var buf = new Float32Array(len);
        var sum = 0;
        for (var i = 0; i < len; i++) {
            var v = data[offset + i] || 0;
            buf[i] = v;
            sum += v;
        }
        var mean = sum / len;
        for (var j = 0; j < len; j++) buf[j] -= mean;

        var energy = 0;
        for (var k = 0; k < len; k++) energy += buf[k] * buf[k];
        if (energy < 1e-5) return null;

        var minLag = Math.floor(sr / 2000); // 最高 ~2000Hz
        var maxLag = Math.floor(sr / 40);   // 最低 ~40Hz
        if (maxLag > len) maxLag = len - 1;

        var bestLag = -1, bestVal = -Infinity;
        var prev = -Infinity;
        for (var lag = minLag; lag <= maxLag; lag++) {
            var corr = 0;
            var lim = len - lag;
            for (var i2 = 0; i2 < lim; i2++) {
                corr += buf[i2] * buf[i2 + lag];
            }
            // 归一化 (避免高 lag 能量偏小)
            var norm = corr / (energy || 1);
            // 峰值检测: 只收局部极大
            if (norm > prev) {
                prev = norm;
                continue;
            }
            if (prev > bestVal && prev > 0.35) {
                bestVal = prev;
                bestLag = lag - 1;
            }
            prev = norm;
        }
        if (bestLag <= 0) return null;
        // 抛物线插值提高精度
        var c0 = 0, c1 = 0, c2 = 0;
        if (bestLag - 1 >= 0 && bestLag + 1 <= maxLag + 1) {
            var l0 = bestLag - 1, l1 = bestLag, l2 = bestLag + 1;
            var v0 = 0, v1 = 0, v2 = 0;
            for (var a = 0; a < len - l0; a++) v0 += buf[a] * buf[a + l0];
            for (var b = 0; b < len - l1; b++) v1 += buf[b] * buf[b + l1];
            for (var c = 0; c < len - l2; c++) v2 += buf[c] * buf[c + l2];
            var d = (v0 - 2 * v1 + v2);
            var offsetFrac = d !== 0 ? 0.5 * (v0 - v2) / d : 0;
            var lagF = bestLag + offsetFrac;
            return { hz: sr / lagF };
        }
        return { hz: sr / bestLag };
    }

    // ---- 变速重采样: 返回新的 AudioBuffer (时长 = len/factor) ----
    // factor>1 加速(音调升高), factor<1 减速(音调降低)
    function renderShift(buffer, factor) {
        if (!(factor > 0) || Math.abs(factor - 1) < 1e-6) return Promise.resolve(buffer);
        var AC = window.AudioContext || window.webkitAudioContext;
        var ctx = new AC();
        var channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
        var outLen = Math.max(1, Math.ceil(buffer.length / factor));
        var off = new OfflineAudioContext(channels, outLen, buffer.sampleRate);
        var src = off.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = factor;
        src.connect(off.destination);
        src.start(0);
        return off.startRendering().then(function(rendered) {
            try { ctx.close(); } catch (e) {}
            return rendered;
        }).catch(function(e) {
            try { ctx.close(); } catch (e2) {}
            throw e;
        });
    }

    // ---- AudioBuffer -> 16bit PCM WAV Blob ----
    function encodeWav16(buffer) {
        var numCh = Math.max(1, Math.min(2, buffer.numberOfChannels));
        var sr = buffer.sampleRate;
        var sampleCount = buffer.length;
        var bytesPerSample = 2;
        var blockAlign = numCh * bytesPerSample;
        var dataSize = sampleCount * blockAlign;
        var ab = new ArrayBuffer(44 + dataSize);
        var dv = new DataView(ab);
        function writeStr(offset, s) {
            for (var i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
        }
        writeStr(0, 'RIFF');
        dv.setUint32(4, 36 + dataSize, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        dv.setUint32(16, 16, true);
        dv.setUint16(20, 1, true);          // PCM
        dv.setUint16(22, numCh, true);
        dv.setUint32(24, sr, true);
        dv.setUint32(28, sr * blockAlign, true);
        dv.setUint16(32, blockAlign, true);
        dv.setUint16(34, 16, true);
        writeStr(36, 'data');
        dv.setUint32(40, dataSize, true);

        var offsetBytes = 44;
        var chans = [];
        for (var ch = 0; ch < numCh; ch++) chans.push(buffer.getChannelData(ch));
        var max = 0;
        for (var i2 = 0; i2 < sampleCount; i2++) {
            for (var c = 0; c < numCh; c++) {
                var v = Math.abs(chans[c][i2]);
                if (v > max) max = v;
            }
        }
        var norm = 1;
        if (max > 0.999) norm = 0.999 / max; // 防削波
        for (var i3 = 0; i3 < sampleCount; i3++) {
            for (var c2 = 0; c2 < numCh; c2++) {
                var val = Math.max(-1, Math.min(1, chans[c2][i3] * norm));
                dv.setInt16(offsetBytes, val < 0 ? val * 32768 : val * 32767, true);
                offsetBytes += 2;
            }
        }
        return new Blob([ab], { type: 'audio/wav' });
    }

    // ---- Canvas 波形绘制 (静态概览) ----
    function drawWaveform(canvas, buffer, color) {
        if (!canvas || !buffer) return;
        var ctx = canvas.getContext('2d');
        var dpr = window.devicePixelRatio || 1;
        var w = canvas.clientWidth || canvas.width;
        var h = canvas.clientHeight || canvas.height;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        var data = buffer.getChannelData(0);
        var n = data.length;
        if (!n) return;
        var cols = Math.max(1, Math.floor(w));
        var slice = n / cols;
        ctx.strokeStyle = color || '#4aa3ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var x = 0; x < cols; x++) {
            var start = Math.floor(x * slice);
            var end = Math.min(n, Math.floor((x + 1) * slice));
            if (end <= start) end = start + 1;
            var min = 1, max = -1;
            for (var i = start; i < end; i++) {
                var v = data[i];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            var yTop = (0.5 - Math.max(Math.abs(min), Math.abs(max)) * 0.5) * h;
            var yBot = (0.5 + Math.max(Math.abs(min), Math.abs(max)) * 0.5) * h;
            if (x === 0) ctx.moveTo(x, yTop);
            ctx.lineTo(x, yTop);
            ctx.lineTo(x, yBot);
        }
        ctx.stroke();
    }

    // ---- 实时监视: 播放时绘制波动 + 返回分析节点 ----
    // 在播放链中插入 analyser, 用 RAF 把时域数据画到 canvas
    function startMonitor(canvas, source, ctx, color) {
        var analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        var buf = new Uint8Array(analyser.fftSize);
        var rafId = null;
        var lastHz = 0;
        function frame() {
            rafId = requestAnimationFrame(frame);
            if (!canvas) return;
            var cv = canvas;
            var dpr = window.devicePixelRatio || 1;
            var w = cv.clientWidth || cv.width;
            var h = cv.clientHeight || cv.height;
            if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
            if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr);
            var g = cv.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            analyser.getByteTimeDomainData(buf);
            g.clearRect(0, 0, w, h);
            g.fillStyle = 'rgba(0,0,0,0.4)';
            g.fillRect(0, 0, w, h);
            // 中线
            g.strokeStyle = 'rgba(255,255,255,0.15)';
            g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
            g.strokeStyle = color || '#4aa3ff';
            g.lineWidth = 1.2;
            g.beginPath();
            var step = analyser.fftSize / w;
            for (var x = 0; x < w; x++) {
                var idx = Math.min(analyser.fftSize - 1, Math.floor(x * step));
                var val = (buf[idx] - 128) / 128;
                var y = h / 2 + val * (h * 0.46);
                if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.stroke();
        }
        frame();
        return { stop: function() { if (rafId) cancelAnimationFrame(rafId); } };
    }

    window.WebNBSFixUtils = {
        nbsKeyToHz: nbsKeyToHz,
        hzToNbsKey: hzToNbsKey,
        keyLabel: keyLabel,
        detectPitch: detectPitch,
        renderShift: renderShift,
        encodeWav16: encodeWav16,
        drawWaveform: drawWaveform,
        startMonitor: startMonitor
    };
})();
