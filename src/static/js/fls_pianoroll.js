/**
 * FLS Clip 钢琴卷帘编辑器
 * 点击格子：放置/删除音符
 * Y轴=音高（0-87，从上到下 key 递减）
 * X轴=step（相对 clip 起点）
 * 每个格子一个音符，支持和弦（同一 step 可多音）
 */
window.FLSPianoRoll = (function() {
    'use strict';

    var CELL_W = 40;
    var CELL_H = 18;
    var KEY_COUNT = 88;

    function PianoRoll(model, options) {
        this.model = model;
        this.clip = null;
        this.containerEl = document.getElementById('fls-piano-roll');
        this.canvasEl = document.getElementById('fls-pr-canvas');
        this.titleEl = document.getElementById('fls-pr-title');
        this.infoEl = document.getElementById('fls-pr-info');
        this.backBtn = document.getElementById('fls-pr-back');
        this.playheadEl = document.getElementById('fls-pr-playhead');

        this.ctx = this.canvasEl ? this.canvasEl.getContext('2d') : null;
        this.noteVelocity = 100;

        this.onBack = options && options.onBack;
        this.onModelChanged = options && options.onModelChanged;
        this.onTickPlay = options && options.onTickPlay;  // function(step) 播放单个音符

        this._bindEvents();
    }

    PianoRoll.prototype.openClip = function(clip) {
        this.clip = clip;
        if (this.containerEl) this.containerEl.style.display = '';
        this._resize();
        this._updateHeader();
        this.render();
    };

    PianoRoll.prototype.close = function() {
        this.clip = null;
        if (this.containerEl) this.containerEl.style.display = 'none';
    };

    PianoRoll.prototype._updateHeader = function() {
        if (!this.clip || !this.titleEl) return;
        var track = this.model.getTrack(this.clip.trackId);
        this.titleEl.textContent = (track ? track.name : '?') + ' — ' + this.clip.name;
        var noteCount = this.clip.notes.length;
        this.infoEl.textContent = '长度 ' + this.clip.length + ' 步 · ' + noteCount + ' 个音符';
    };

    PianoRoll.prototype._resize = function() {
        if (!this.canvasEl || !this.containerEl) return;
        var rect = this.containerEl.getBoundingClientRect();
        var headerH = 48;
        var width = Math.max(rect.width, this.clip.length * CELL_W + 120);
        var height = Math.max(rect.height - headerH, KEY_COUNT * CELL_H + 40);
        var dpr = window.devicePixelRatio || 1;
        this.canvasEl.width = width * dpr;
        this.canvasEl.height = height * dpr;
        this.canvasEl.style.width = width + 'px';
        this.canvasEl.style.height = height + 'px';
        this.canvasWidth = width;
        this.canvasHeight = height;
        if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    PianoRoll.prototype._bindEvents = function() {
        var self = this;

        if (this.backBtn) {
            this.backBtn.addEventListener('click', function() {
                if (self.onBack) self.onBack();
            });
        }

        if (!this.canvasEl) return;

        // 鼠标
        this.canvasEl.addEventListener('click', function(e) {
            if (!self.clip) return;
            var rect = self.canvasEl.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            self._handleCellTap(x, y);
        });

        // 右键删除音符
        this.canvasEl.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            if (!self.clip) return;
            var rect = self.canvasEl.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var cell = self._pixelToCell(x, y);
            if (!cell) return;
            self.model.toggleNoteInClip(self.clip.id, cell.step, cell.key, self.noteVelocity);
            self.render();
            self._updateHeader();
            if (self.onModelChanged) self.onModelChanged();
        });

        // 触摸
        var longTapTimer = null;
        var lastTapTime = 0;
        var lastTapX = 0;
        var lastTapY = 0;

        this.canvasEl.addEventListener('touchstart', function(e) {
            if (!self.clip || e.touches.length !== 1) return;
            var touch = e.touches[0];
            lastTapX = touch.clientX;
            lastTapY = touch.clientY;
            lastTapTime = Date.now();
            longTapTimer = setTimeout(function() {
                // 长按 -> 切换（删除/放置）
                var rect = self.canvasEl.getBoundingClientRect();
                self._handleCellTap(touch.clientX - rect.left, touch.clientY - rect.top);
                longTapTimer = null;
            }, 400);
        }, { passive: true });

        this.canvasEl.addEventListener('touchmove', function(e) {
            if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; }
            if (!self.clip || e.touches.length !== 1) return;
            var touch = e.touches[0];
            var rect = self.canvasEl.getBoundingClientRect();
            var dx = Math.abs(touch.clientX - lastTapX);
            var dy = Math.abs(touch.clientY - lastTapY);
            if (dx > 10 || dy > 10) {
                self._handleCellTap(touch.clientX - rect.left, touch.clientY - rect.top, true);
            }
        }, { passive: true });

        this.canvasEl.addEventListener('touchend', function(e) {
            if (longTapTimer) { clearTimeout(longTapTimer); longTapTimer = null; }
            if (!self.clip) return;
            // 短按快速点击：放置/删除
            var elapsed = Date.now() - lastTapTime;
            if (elapsed < 400) {
                var rect = self.canvasEl.getBoundingClientRect();
                self._handleCellTap(lastTapX - rect.left, lastTapY - rect.top);
            }
        });

        window.addEventListener('resize', function() {
            if (self.containerEl && self.containerEl.style.display !== 'none') {
                self._resize();
                self.render();
            }
        });
    };

    PianoRoll.prototype._handleCellTap = function(x, y, silent) {
        if (!this.clip) return;
        var cell = this._pixelToCell(x, y);
        if (!cell) return;
        var wasAdded = this.model.toggleNoteInClip(this.clip.id, cell.step, cell.key, this.noteVelocity);
        this.render();
        this._updateHeader();
        if (this.onModelChanged) this.onModelChanged();
        // 播放预览
        if (!silent && this.onTickPlay && wasAdded) {
            var track = this.model.getTrack(this.clip.trackId);
            this.onTickPlay(track.instrument, cell.key, this.noteVelocity);
        }
    };

    PianoRoll.prototype._pixelToCell = function(x, y) {
        var labelW = 80;
        if (x < labelW || x > this.canvasWidth || y < 0 || y > this.canvasHeight) return null;
        var step = Math.floor((x - labelW) / CELL_W);
        if (step < 0 || step >= this.clip.length) return null;
        var key = KEY_COUNT - 1 - Math.floor(y / CELL_H);
        if (key < 0 || key >= KEY_COUNT) return null;
        return { step: step, key: key };
    };

    PianoRoll.prototype.render = function() {
        if (!this.clip || !this.ctx) return;
        var ctx = this.ctx;
        var w = this.canvasWidth;
        var h = this.canvasHeight;
        var labelW = 80;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        // 绘制键盘标签 (左侧)
        ctx.fillStyle = '#252540';
        ctx.fillRect(0, 0, labelW, h);

        var noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        var blackKeys = {1:true, 3:true, 6:true, 8:true, 10:true};

        for (var k = 0; k < KEY_COUNT; k++) {
            var y = (KEY_COUNT - 1 - k) * CELL_H;
            // Convert NBS key 0 (MIDI A0) before drawing pitch classes/labels.
            var midiNote = k + 21;
            var noteInOctave = midiNote % 12;
            var isBlack = !!blackKeys[noteInOctave];

            // 标签背景
            ctx.fillStyle = isBlack ? '#3a3a5c' : '#eaeaea';
            ctx.fillRect(0, y, labelW - 2, CELL_H);

            // 音高标签
            var octave = Math.floor(midiNote / 12) - 1;
            ctx.fillStyle = isBlack ? '#ddd' : '#333';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(noteNames[noteInOctave] + octave, labelW - 6, y + CELL_H / 2);

            // 格子线（钢琴卷帘区）
            var isCOrE = (noteInOctave === 0 || noteInOctave === 4 || noteInOctave === 5 || noteInOctave === 9);
            ctx.fillStyle = isCOrE ? '#222240' : '#1a1a2e';
            ctx.fillRect(labelW, y, w - labelW, CELL_H);

            // 分隔线
            ctx.strokeStyle = '#2d2d4c';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(labelW, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // step 竖线
        for (var s = 0; s <= this.clip.length; s++) {
            var x = labelW + s * CELL_W;
            ctx.strokeStyle = (s % 4 === 0) ? '#44446a' : '#2d2d4c';
            ctx.lineWidth = (s % 4 === 0) ? 1 : 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();

            // step 数字（每 4 步一个）
            if (s % 4 === 0) {
                ctx.fillStyle = '#66668a';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(s, x + 4, 2);
            }
        }

        // 绘制音符
        var track = this.model.getTrack(this.clip.trackId);
        var color = track ? track.color : '#4ecdc4';

        for (var i = 0; i < this.clip.notes.length; i++) {
            var note = this.clip.notes[i];
            if (note.step < 0 || note.step >= this.clip.length) continue;
            var nx = labelW + note.step * CELL_W;
            var ny = (KEY_COUNT - 1 - note.key) * CELL_H;
            var nw = CELL_W - 2;
            var nh = CELL_H - 2;

            ctx.fillStyle = color;
            ctx.fillRect(nx + 1, ny + 1, nw, nh);

            // 高亮边框
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(nx + 1.5, ny + 1.5, nw - 1, nh - 1);
        }
    };

    PianoRoll.prototype.updatePlayhead = function(stepInClip) {
        if (!this.playheadEl || !this.canvasEl) return;
        if (stepInClip < 0) {
            this.playheadEl.style.display = 'none';
            return;
        }
        this.playheadEl.style.display = '';
        var labelW = 80;
        this.playheadEl.style.left = (labelW + stepInClip * CELL_W) + 'px';
    };

    return PianoRoll;
})();
