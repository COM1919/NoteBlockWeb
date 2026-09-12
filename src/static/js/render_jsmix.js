// ====================================================================
// JS 预混音引擎 (render_jsmix.js)
// 用于离线渲染的高性能路径:
//   全部音符先在 JS 层变速/增益/声像混合为一个 AudioBuffer,
//   再交给效果链(单音源)渲染, 避免 OfflineAudioContext 对数千个
//   活跃 AudioBufferSourceNode 的逐量子开销 (实测 2400 音符时近乎实时速度)。
// 语义与原生路径(renderSong 全图)一致:
//   - dur = buffer.duration / max(0.5, rate)
//   - 5ms 指数起音包络 (0.0001 -> gain)
//   - StereoPanner equal-power 声像
//   - rate 无上限钳制 (key=87 时约 11.3)
// ====================================================================
(function() {
    'use strict';

    // Catmull-Rom (4-tap) 插值, 质量优于线性, 用于变速重采样
    function hermite(x0, x1, x2, x3, t) {
        var c0 = x1;
        var c1 = (x2 - x0) * 0.5;
        var c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
        var c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
        return c0 + t * (c1 + t * (c2 + t * c3));
    }

    /**
     * 混合全部音符到立体声缓冲
     * @param {object} book - 缓冲池: { [key]: {l:Float32Array, r:Float32Array, sr:number} }
     * @param {Array} events - [{ buf:key引用, t0:秒, rate, gain, pan(-1..1) }]
     * @param {number} outLen - 输出采样数(每通道)
     * @param {number} sampleRate - 输出采样率
     * @param {Function} [cancelled] - 可选取消检测, 返回 true 时抛错中止
     */
    function mix(book, events, outLen, sampleRate, cancelled) {
        var left = new Float32Array(outLen);
        var right = new Float32Array(outLen);
        var atk = Math.floor(0.005 * sampleRate); // 5ms 起音

        for (var e = 0; e < events.length; e++) {
            var ev = events[e];
            var buf = book[ev.buf];
            if (!buf) continue;
            var bL = buf.l;
            var bR = buf.r || bL;
            var bufLen = bL.length;
            if (bufLen < 1) continue;

            var rate = ev.rate;
            // 实际播放时长: 样本时长 / 变速比例 (与原生路径一致, 下限 0.5 同 max(0.5, rate))
            var durSec = (bufLen / buf.sr) / Math.max(0.5, rate);
            var nOut = Math.floor(durSec * sampleRate);
            var startDst = Math.floor(ev.t0 * sampleRate);
            if (startDst < 0) startDst = 0;
            var endDst = startDst + nOut;
            if (endDst > outLen) endDst = outLen;
            if (startDst >= endDst) continue;

            var step = rate * (buf.sr / sampleRate); // 每输出采样的源样本步进
            var panVal = ev.pan;
            var wL = Math.cos((panVal + 1) * Math.PI / 4);
            var wR = Math.sin((panVal + 1) * Math.PI / 4);
            var gain = ev.gain;

            var i, j, idx, w, v;
            var direct = (step >= 0.9995 && step <= 1.0005);

            // 取消检测节流
            var checkInterval = 262144;

            if (direct) {
                for (j = startDst; j < endDst; j++) {
                    i = j - startDst;
                    w = (i < atk) ? 0.0001 * Math.pow(gain / 0.0001, i / atk) : gain;
                    left[j] += bL[i] * w * wL;
                    if (bR !== bL) right[j] += bR[i] * w * wR;
                    else right[j] += bL[i] * w * wR;
                }
            } else {
                for (j = startDst; j < endDst; j++) {
                    i = j - startDst;
                    idx = i * step;
                    var i0 = idx | 0;
                    w = (i < atk) ? 0.0001 * Math.pow(gain / 0.0001, i / atk) : gain;
                    var frac = idx - i0;
                    if (i0 >= bufLen) break;
                    if (i0 < 1) {
                        // 边界: 退化插值
                        v = bL[i0] * (1 - frac) + bL[i0 + 1 < bufLen ? i0 + 1 : i0] * frac;
                    } else if (i0 + 2 >= bufLen) {
                        v = bL[i0] * (1 - frac) + bL[i0 + 1 < bufLen ? i0 + 1 : i0] * frac;
                    } else {
                        v = hermite(bL[i0 - 1], bL[i0], bL[i0 + 1], bL[i0 + 2], frac);
                    }
                    left[j] += v * w * wL;
                    if (bR !== bL) {
                        if (i0 < 1 || i0 + 2 >= bufLen) {
                            v = bR[i0] * (1 - frac) + bR[i0 + 1 < bufLen ? i0 + 1 : i0] * frac;
                        } else {
                            v = hermite(bR[i0 - 1], bR[i0], bR[i0 + 1], bR[i0 + 2], frac);
                        }
                    }
                    right[j] += v * w * wR;
                }
            }

            if (cancelled && ((e & 15) === 15) && cancelled()) {
                throw new Error('渲染已取消');
            }
        }
        return { l: left, r: right };
    }

    window.RenderJsMix = { mix: mix };
})();