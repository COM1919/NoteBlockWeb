/**
 * FLS 音轨设置面板（右侧抽屉）
 * 处理：打开/关闭设置抽屉、绑定字段、添加新音轨
 */
window.FLSTrackPanel = (function() {
    'use strict';

    function TrackPanel(model, options) {
        this.model = model;
        this.currentTrackId = null;

        this.drawerEl = document.getElementById('fls-settings-drawer');
        this.closeBtn = document.getElementById('fls-settings-close');
        this.titleEl = document.getElementById('fls-settings-title');

        this.nameInput = document.getElementById('fls-set-name');
        this.instrumentSelect = document.getElementById('fls-set-instrument');
        this.volSlider = document.getElementById('fls-set-vol');
        this.volValue = document.getElementById('fls-vol-value');
        this.panSlider = document.getElementById('fls-set-pan');
        this.panValue = document.getElementById('fls-pan-value');
        this.reverbSlider = document.getElementById('fls-set-reverb');
        this.reverbValue = document.getElementById('fls-reverb-value');
        this.fadeInSlider = document.getElementById('fls-set-fadein');
        this.fadeInValue = document.getElementById('fls-fadein-value');
        this.fadeOutSlider = document.getElementById('fls-set-fadeout');
        this.fadeOutValue = document.getElementById('fls-fadeout-value');

        this.soloBtn = document.getElementById('fls-set-solo');
        this.muteBtn = document.getElementById('fls-set-mute');
        this.deleteBtn = document.getElementById('fls-delete-track');

        this.addTrackBtn = document.getElementById('fls-add-track');

        this.onModelChanged = options && options.onModelChanged;

        this._populateInstrumentSelect();
        this._bindEvents();
        this._isOpen = false;
    }

    TrackPanel.prototype._populateInstrumentSelect = function() {
        if (!this.instrumentSelect) return;
        var html = '';
        for (var i = 0; i < FLS.INSTRUMENT_NAMES.length; i++) {
            html += '<option value="' + i + '">' + (FLS.INSTRUMENT_NAMES[i] || ('乐器' + i)) + '</option>';
        }
        this.instrumentSelect.innerHTML = html;
    };

    TrackPanel.prototype._bindEvents = function() {
        var self = this;

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', function() {
                self.close();
            });
        }

        // 名称
        if (this.nameInput) {
            this.nameInput.addEventListener('change', function() {
                var t = self._getTrack();
                if (t && this.value.trim()) { t.name = this.value.trim(); self._notify(); }
            });
        }

        // 乐器
        if (this.instrumentSelect) {
            this.instrumentSelect.addEventListener('change', function() {
                var t = self._getTrack();
                if (t) { t.instrument = parseInt(this.value); self._notify(); }
            });
        }

        // 音量
        if (this.volSlider) {
            this.volSlider.addEventListener('input', function() {
                var t = self._getTrack();
                var v = parseInt(this.value);
                if (t) { t.volume = v; self.volValue.textContent = v; self._notify(); }
            });
        }

        // 声像
        if (this.panSlider) {
            this.panSlider.addEventListener('input', function() {
                var t = self._getTrack();
                var v = parseInt(this.value);
                if (t) { t.pan = v; self.panValue.textContent = v; self._notify(); }
            });
        }

        // 混响
        if (this.reverbSlider) {
            this.reverbSlider.addEventListener('input', function() {
                var t = self._getTrack();
                var v = parseInt(this.value);
                if (t) { t.reverb = v; self.reverbValue.textContent = v; }
            });
        }

        // 淡入
        if (this.fadeInSlider) {
            this.fadeInSlider.addEventListener('input', function() {
                var t = self._getTrack();
                var v = parseInt(this.value);
                if (t) { t.fadeIn = v; self.fadeInValue.textContent = v; }
            });
        }

        // 淡出
        if (this.fadeOutSlider) {
            this.fadeOutSlider.addEventListener('input', function() {
                var t = self._getTrack();
                var v = parseInt(this.value);
                if (t) { t.fadeOut = v; self.fadeOutValue.textContent = v; }
            });
        }

        // 独奏 / 静音
        if (this.soloBtn) {
            this.soloBtn.addEventListener('click', function() {
                var t = self._getTrack();
                if (!t) return;
                t.solo = !t.solo;
                if (t.solo) t.muted = false;
                self.muteBtn.classList.toggle('on', t.muted);
                self.soloBtn.classList.toggle('on', t.solo);
                self._notify();
            });
        }
        if (this.muteBtn) {
            this.muteBtn.addEventListener('click', function() {
                var t = self._getTrack();
                if (!t) return;
                t.muted = !t.muted;
                if (t.muted) t.solo = false;
                self.muteBtn.classList.toggle('on', t.muted);
                self.soloBtn.classList.toggle('on', t.solo);
                self._notify();
            });
        }

        // 删除
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener('click', function() {
                var t = self._getTrack();
                if (!t) return;
                showAppConfirm('删除音轨 "' + t.name + '" 及其所有 Clip?', {title: '删除音轨', icon: 'fa-solid fa-trash'}).then(function(ok) {
                    if (ok) {
                        self.model.removeTrack(t.id);
                        self.close();
                        self._notify();
                    }
                });
            });
        }

        // 添加音轨
        if (this.addTrackBtn) {
            this.addTrackBtn.addEventListener('click', function() {
                showAppPrompt('新音轨名称:', '', {title: '添加音轨', icon: 'fa-solid fa-plus'}).then(function(name) {
                    if (name === null) return;
                    var t = self.model.addTrack(0, name || ('音轨 ' + (self.model.tracks.length + 1)));
                    // 自动给新音轨创建一个 Clip
                    self.model.addClip(t.id, 0, 32, 'Clip ' + (self.model.clips.length));
                    self._notify();
                });
            });
        }
    };

    TrackPanel.prototype._getTrack = function() {
        if (!this.currentTrackId) return null;
        return this.model.getTrack(this.currentTrackId);
    };

    TrackPanel.prototype.open = function(trackId) {
        this.currentTrackId = trackId;
        var t = this._getTrack();
        if (!t) return;

        // 填充数据
        if (this.titleEl) this.titleEl.textContent = t.name;
        if (this.nameInput) this.nameInput.value = t.name;
        if (this.instrumentSelect) this.instrumentSelect.value = t.instrument;
        if (this.volSlider) { this.volSlider.value = t.volume; if (this.volValue) this.volValue.textContent = t.volume; }
        if (this.panSlider) { this.panSlider.value = t.pan; if (this.panValue) this.panValue.textContent = t.pan; }
        if (this.reverbSlider) { this.reverbSlider.value = t.reverb || 0; if (this.reverbValue) this.reverbValue.textContent = t.reverb || 0; }
        if (this.fadeInSlider) { this.fadeInSlider.value = t.fadeIn || 0; if (this.fadeInValue) this.fadeInValue.textContent = t.fadeIn || 0; }
        if (this.fadeOutSlider) { this.fadeOutSlider.value = t.fadeOut || 0; if (this.fadeOutValue) this.fadeOutValue.textContent = t.fadeOut || 0; }
        if (this.soloBtn) this.soloBtn.classList.toggle('on', !!t.solo);
        if (this.muteBtn) this.muteBtn.classList.toggle('on', !!t.muted);

        if (this.drawerEl) this.drawerEl.classList.add('open');
        this._isOpen = true;
    };

    TrackPanel.prototype.close = function() {
        if (this.drawerEl) this.drawerEl.classList.remove('open');
        this.currentTrackId = null;
        this._isOpen = false;
    };

    TrackPanel.prototype.toggle = function(trackId) {
        if (this._isOpen && this.currentTrackId === trackId) {
            this.close();
        } else {
            this.open(trackId);
        }
    };

    TrackPanel.prototype._notify = function() {
        if (this.onModelChanged) this.onModelChanged();
    };

    return TrackPanel;
})();
