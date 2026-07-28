/**
 * FLS Playlist 视图
 * 渲染：左侧音轨行 + 右侧时间行 + Clip 块
 * 支持：点击 Clip 进入钢琴卷帘，长按/右键 Clip 弹菜单，点击空白行创建新 Clip
 */
window.FLSPlaylist = (function() {
    'use strict';

    var STEP_WIDTH = 40;   // 每 step 的像素宽度
    var ROW_HEIGHT = 64;   // 每行像素高度

    function Playlist(model, options) {
        this.model = model;
        this.trackListEl = document.getElementById('fls-track-rows');
        this.timelineEl = document.getElementById('fls-timeline');
        this.timelineBodyEl = document.getElementById('fls-timeline-body');
        this.rulerEl = document.getElementById('fls-timeline-ruler');
        this.addTrackBtn = document.getElementById('fls-add-track');
        this.playheadEl = document.getElementById('fls-playhead');
        this.clipMenuEl = document.getElementById('fls-clip-menu');

        this.clipStartX = 0;   // 时间线最左侧像素（用于对齐播放头）
        this.longPressTimer = null;
        this.activeClipId = null;

        this.onClipClick = options && options.onClipClick;
        this.onTrackIconClick = options && options.onTrackIconClick;
        this.onTrackChanged = options && options.onTrackChanged;
        this.onModelChanged = options && options.onModelChanged;

        this._bindGlobalEvents();
        this.render();
    }

    Playlist.prototype._bindGlobalEvents = function() {
        var self = this;

        // 点击其他地方关闭 Clip 菜单
        document.addEventListener('click', function(e) {
            if (!self.clipMenuEl) return;
            if (!self.clipMenuEl.contains(e.target)) {
                self.clipMenuEl.style.display = 'none';
            }
        });

        // 点击空白时间线区域（非 Clip）创建新 Clip
        // 动态点击由事件委托处理
    };

    Playlist.prototype._clearLongPress = function() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    };

    Playlist.prototype._showClipMenu = function(clip, x, y) {
        var self = this;
        if (!this.clipMenuEl) return;
        this.activeClipId = clip.id;
        this.clipMenuEl.style.display = 'block';
        if (window.WebNBSPositionFlyout) {
            window.WebNBSPositionFlyout(this.clipMenuEl, { left: x, right: x, top: y, bottom: y });
        }

        // 解绑旧事件再绑定
        var newMenu = this.clipMenuEl.cloneNode(true);
        this.clipMenuEl.parentNode.replaceChild(newMenu, this.clipMenuEl);
        this.clipMenuEl = newMenu;

        this.clipMenuEl.querySelectorAll('.fls-clip-menu-item').forEach(function(item) {
            item.addEventListener('click', function(ev) {
                var action = this.getAttribute('data-action');
                self._handleClipMenuAction(clip, action);
                self.clipMenuEl.style.display = 'none';
                ev.stopPropagation();
            });
        });
    };

    Playlist.prototype._handleClipMenuAction = function(clip, action) {
        if (!clip) return;
        var self = this;
        switch (action) {
            case 'edit':
                if (this.onClipClick) this.onClipClick(clip);
                break;
            case 'rename':
                showAppPrompt('Clip 名称:', clip.name, {title: '重命名 Clip', icon: 'fa-solid fa-pen'}).then(function(newName) {
                    if (newName && newName.trim()) {
                        clip.name = newName.trim();
                        self.render();
                        if (self.onModelChanged) self.onModelChanged();
                    }
                });
                break;
            case 'move-left':
                clip.startStep = Math.max(0, clip.startStep - 4);
                this.render();
                if (this.onModelChanged) this.onModelChanged();
                break;
            case 'move-right':
                clip.startStep += 4;
                this.render();
                if (this.onModelChanged) this.onModelChanged();
                break;
            case 'shorter':
                if (clip.length > 8) { clip.length -= 4; this.render(); if (this.onModelChanged) this.onModelChanged(); }
                break;
            case 'longer':
                clip.length += 4;
                this.render();
                if (this.onModelChanged) this.onModelChanged();
                break;
            case 'duplicate':
                var newClip = this.model.addClip(clip.trackId, clip.startStep + clip.length, clip.length, clip.name + ' (副本)');
                for (var i = 0; i < clip.notes.length; i++) {
                    newClip.notes.push({ step: clip.notes[i].step, key: clip.notes[i].key, velocity: clip.notes[i].velocity });
                }
                this.render();
                if (this.onModelChanged) this.onModelChanged();
                break;
            case 'delete':
                showAppConfirm('删除 Clip "' + clip.name + '"?', {title: '删除 Clip', icon: 'fa-solid fa-trash'}).then(function(ok) {
                    if (ok) {
                        self.model.removeClip(clip.id);
                        self.render();
                        if (self.onModelChanged) self.onModelChanged();
                    }
                });
                break;
        }
    };

    Playlist.prototype.render = function() {
        this._renderTrackRows();
        this._renderTimeline();
        this._renderRuler();
    };

    // -------- 左侧音轨列（图标+名称） --------
    Playlist.prototype._renderTrackRows = function() {
        if (!this.trackListEl) return;
        var tracks = this.model.getTracksOrdered();
        var self = this;

        var html = '';
        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            var mutedClass = t.muted ? 'muted' : '';
            var soloClass = t.solo ? 'solo' : '';
            html +=
                '<div class="fls-track-row" data-track-id="' + t.id + '" style="height:' + ROW_HEIGHT + 'px">' +
                    '<div class="fls-track-icon" data-track-id="' + t.id + '" style="background:' + t.color + '">' +
                        '<div class="fls-track-icon-inner">♪</div>' +
                    '</div>' +
                    '<div class="fls-track-text">' +
                        '<div class="fls-track-name">' + this._esc(t.name) + '</div>' +
                        '<div class="fls-track-sub">' + this._esc(FLS.INSTRUMENT_NAMES[t.instrument] || '乐器') + '</div>' +
                    '</div>' +
                    '<div class="fls-track-ms">' +
                        (t.muted ? '<span class="fls-ms-flag muted">M</span>' : '') +
                        (t.solo ? '<span class="fls-ms-flag solo">S</span>' : '') +
                    '</div>' +
                '</div>';
        }
        this.trackListEl.innerHTML = html;

        // 图标点击 -> 切换设置面板
        var self2 = this;
        this.trackListEl.querySelectorAll('.fls-track-icon').forEach(function(el) {
            el.addEventListener('click', function() {
                var tid = this.getAttribute('data-track-id');
                if (self2.onTrackIconClick) self2.onTrackIconClick(tid);
            });
        });
    };

    // -------- 顶部时间刻度（使用 CSS 网格，避免巨量 DOM） --------
    Playlist.prototype._renderRuler = function() {
        if (!this.rulerEl) return;
        var totalSteps = Math.max(128, this.model.getSongLength());
        // 避免渲染过多刻度：每 16 step 一个主标记
        var MAX_MARKS = 512;
        var step = 16;
        while (totalSteps / step > MAX_MARKS) step *= 2;
        var innerHTML = '';
        for (var s = 0; s <= totalSteps; s += step) {
            innerHTML +=
                '<div class="fls-ruler-mark big" style="left:' + (s * STEP_WIDTH) + 'px">' + s + '</div>';
        }
        this.rulerEl.innerHTML = innerHTML;
    };

    // -------- 右侧时间行 + Clip 块（用 CSS 背景画格子，避免巨量 DOM） --------
    Playlist.prototype._renderTimeline = function() {
        if (!this.timelineBodyEl) return;
        var tracks = this.model.getTracksOrdered();
        var self = this;

        var totalSteps = Math.max(128, this.model.getSongLength());
        var html = '';

        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            // 使用 CSS repeating-linear-gradient 代替大量 step-line DOM，避免 10k+ 音符时卡死
            html += '<div class="fls-track-row-line" data-track-id="' + t.id + '" style="height:' + ROW_HEIGHT + 'px; background-image: repeating-linear-gradient(90deg, transparent 0, transparent ' + (STEP_WIDTH * 4 - 1) + 'px, rgba(255,255,255,0.035) ' + (STEP_WIDTH * 4 - 1) + 'px, rgba(255,255,255,0.035) ' + (STEP_WIDTH * 4) + 'px);">';

            // 画 clips
            var clips = this.model.getClipsByTrack(t.id);
            for (var c = 0; c < clips.length; c++) {
                var clip = clips[c];
                var left = clip.startStep * STEP_WIDTH;
                var width = clip.length * STEP_WIDTH;
                html +=
                    '<div class="fls-clip" data-clip-id="' + clip.id + '" ' +
                        'style="left:' + left + 'px; width:' + width + 'px; background:' + t.color + '22;' +
                               ' border-left:3px solid ' + t.color + '; border-right:3px solid ' + t.color + ';">' +
                        '<div class="fls-clip-name" style="color:' + this._brighten(t.color) + '">' +
                            this._esc(clip.name) +
                        '</div>' +
                        this._renderClipNotes(clip, width) +
                    '</div>';
            }

            // 空白区域用于点击创建 clip
            html += '<div class="fls-empty-track" data-track-id="' + t.id + '"></div>';
            html += '</div>';
        }

        this.timelineBodyEl.innerHTML = html;

        // 绑定 clip 事件
        var self2 = this;
        this.timelineBodyEl.querySelectorAll('.fls-clip').forEach(function(el) {
            var clipId = el.getAttribute('data-clip-id');
            var clip = self2.model.getClip(clipId);

            // 点击进入编辑
            el.addEventListener('click', function(e) {
                e.stopPropagation();
                if (self2.onClipClick && clip) self2.onClipClick(clip);
            });

            // 右键弹菜单
            el.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                if (clip) self2._showClipMenu(clip, e.clientX, e.clientY);
            });

            // 长按弹菜单（移动端）
            el.addEventListener('touchstart', function(e) {
                var touch = e.touches[0];
                self2.longPressTimer = setTimeout(function() {
                    if (clip) self2._showClipMenu(clip, touch.clientX, touch.clientY);
                }, 600);
            }, { passive: true });
            el.addEventListener('touchend', function() { self2._clearLongPress(); });
            el.addEventListener('touchmove', function() { self2._clearLongPress(); });
        });

        // 点击空白轨道区域 -> 创建新 Clip
        this.timelineBodyEl.querySelectorAll('.fls-empty-track').forEach(function(el) {
            el.addEventListener('click', function(e) {
                var tid = this.getAttribute('data-track-id');
                var track = self2.model.getTrack(tid);
                if (!track) return;
                var rect = this.getBoundingClientRect();
                var stepClicked = Math.floor((e.clientX - rect.left) / STEP_WIDTH);
                var newClip = self2.model.addClip(tid, Math.max(0, stepClicked), 32, 'Clip ' + (self2.model.clips.length + 1));
                self2.render();
                if (self2.onModelChanged) self2.onModelChanged();
                // 自动进入编辑
                if (self2.onClipClick) self2.onClipClick(newClip);
            });
        });
    };

    // Clip 内的音符可视化（按相对 step 画小柱）。
    // 音符过多时（> 200）改为仅显示密度条，避免 DOM 爆炸。
    Playlist.prototype._renderClipNotes = function(clip, width) {
        if (!clip || !clip.notes || clip.notes.length === 0) return '';
        // 音符过多: 用"概览"模式 (CSS 渐变表示密度, 不创建 DOM)
        if (clip.notes.length > 200) {
            return '<div class="fls-clip-notes" style="font-size:10px; color:rgba(255,255,255,0.55); padding:2px 6px;">' +
                   clip.notes.length + ' notes' + '</div>';
        }
        var html = '<div class="fls-clip-notes">';
        var stepSize = width / clip.length;
        for (var n = 0; n < clip.notes.length; n++) {
            var note = clip.notes[n];
            if (!note || typeof note.step !== 'number') continue;
            var left = note.step * stepSize;
            var h = 6 + ((note.key % 24) / 24) * 20;
            html += '<div class="fls-clip-note" style="left:' + left + 'px; width:' + Math.max(2, stepSize - 1) + 'px; height:' + h + 'px;"></div>';
        }
        html += '</div>';
        return html;
    };

    Playlist.prototype._brighten = function(hex) {
        // 把颜色变浅色（用于 clip 文字）
        if (!hex || hex[0] !== '#') return '#ffffff';
        var r = parseInt(hex.substr(1, 2), 16);
        var g = parseInt(hex.substr(3, 2), 16);
        var b = parseInt(hex.substr(5, 2), 16);
        r = Math.min(255, r + 60);
        g = Math.min(255, g + 60);
        b = Math.min(255, b + 60);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    };

    Playlist.prototype._esc = function(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    Playlist.prototype.updatePlayhead = function(currentTick) {
        if (!this.playheadEl) return;
        // playhead 元素在 timeline-body 内，position:absolute, left 由 tick 决定
        // 但 playhead 元素本身是放在 timeline 容器内 (fls-timeline)，所以 left 要基于 STEP_WIDTH
        // timeline body 内容向左滚动时, playhead 也需要跟随
        var bodyLeft = this.timelineBodyEl ? this.timelineBodyEl.scrollLeft : 0;
        this.playheadEl.style.left = (currentTick * STEP_WIDTH - bodyLeft) + 'px';
        // 让 playhead 始终可见（主样式已移除 display:none）
        this.playheadEl.classList.add('visible');
    };

    Playlist.prototype.STEP_WIDTH = STEP_WIDTH;

    return Playlist;
})();
