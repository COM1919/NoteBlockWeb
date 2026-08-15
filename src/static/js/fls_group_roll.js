/**
 * FLS 模式 - 组内钢琴卷帘组件
 * tick × key (时间 × 音高) 的 2D 编辑区域
 * 与普通 PianoRoll 不同：Y轴=音高(key)，只显示当前音轨组的音符
 */
window.FLSGroupPianoRoll = (function() {
    'use strict';

    var CONFIG = {
        noteMinWidth: 8,
        tickWidth: 4,
        keyHeight: 10,
        sidePanelWidth: 50,
        headerHeight: 0,
        gridLineColor: 'rgba(255, 255, 255, 0.05)'
    };

    function GroupPianoRoll(canvasId, flsModel) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.model = flsModel;

        // 当前编辑的乐器
        this.instrument = 0;

        // 视图状态
        this.zoom = 1;
        this.scrollX = 0;
        this.scrollY = 0;

        // 交互状态
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionEnd = null;
        this.hasMoved = false;

        // 触摸状态
        this.touchMode = 'none';
        this.touchStartTime = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastTouchX = 0;
        this.lastTouchY = 0;
        this.lastPinchDist = 0;
        this.touchMoved = false;

        this.displayWidth = 0;
        this.displayHeight = 0;

        // 回调
        this.onNotePlaced = null;   // function(note) - 放置音符后
        this.onNoteDeleted = null;  // function(note) - 删除音符后

        this._init();
    }

    GroupPianoRoll.prototype._init = function() {
        this._setupCanvas();
        this._bindEvents();
    };

    GroupPianoRoll.prototype._setupCanvas = function() {
        var container = this.canvas.parentElement;
        if (!container) return;
        var rect = container.getBoundingClientRect();
        this.displayWidth = rect.width || 600;
        this.displayHeight = rect.height || 400;

        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.displayWidth * dpr;
        this.canvas.height = this.displayHeight * dpr;
        this.canvas.style.width = this.displayWidth + 'px';
        this.canvas.style.height = this.displayHeight + 'px';
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(dpr, dpr);
    };

    GroupPianoRoll.prototype._bindEvents = function() {
        var self = this;

        this.canvas.addEventListener('mousedown', function(e) { self._onMouseDown(e); });
        this.canvas.addEventListener('mousemove', function(e) { self._onMouseMove(e); });
        this.canvas.addEventListener('mouseup', function(e) { self._onMouseUp(e); });
        this.canvas.addEventListener('wheel', function(e) { self._onWheel(e); }, {passive: false});
        this.canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });

        this.canvas.addEventListener('touchstart', function(e) { self._onTouchStart(e); }, {passive: false});
        this.canvas.addEventListener('touchmove', function(e) { self._onTouchMove(e); }, {passive: false});
        this.canvas.addEventListener('touchend', function(e) { self._onTouchEnd(e); });
        this.canvas.addEventListener('touchcancel', function(e) { self._onTouchEnd(e); });

        var self2 = this;
        window.addEventListener('resize', function() {
            self2._setupCanvas();
            self2.render();
        });
    };

    // --- 坐标转换 ---
    GroupPianoRoll.prototype._screenToTick = function(screenX) {
        return Math.floor((screenX - CONFIG.sidePanelWidth + this.scrollX) / (CONFIG.tickWidth * this.zoom));
    };

    GroupPianoRoll.prototype._screenToKey = function(screenY) {
        return 87 - Math.floor((screenY - CONFIG.headerHeight + this.scrollY) / (CONFIG.keyHeight * this.zoom));
    };

    GroupPianoRoll.prototype._tickToScreen = function(tick) {
        return tick * CONFIG.tickWidth * this.zoom - this.scrollX + CONFIG.sidePanelWidth;
    };

    GroupPianoRoll.prototype._keyToScreen = function(key) {
        return (87 - key) * CONFIG.keyHeight * this.zoom - this.scrollY + CONFIG.headerHeight;
    };

    GroupPianoRoll.prototype._getNoteAt = function(x, y) {
        var tick = this._screenToTick(x);
        var key = this._screenToKey(y);
        return this.model ? this.model.getNoteAt(this.instrument, tick, key) : null;
    };

    // --- 鼠标事件 ---
    GroupPianoRoll.prototype._onMouseDown = function(e) {
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        if (e.button === 2) {
            // 右键删除
            var note = this._getNoteAt(x, y);
            if (note && this.onNoteDeleted) {
                this.onNoteDeleted(note);
            }
            return;
        }

        if (e.button === 0) {
            this.isSelecting = true;
            this.selectionStart = {x: x, y: y};
            this.selectionEnd = {x: x, y: y};
            this.hasMoved = false;
        }
    };

    GroupPianoRoll.prototype._onMouseMove = function(e) {
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        if (this.isSelecting) {
            var dx = Math.abs(x - this.selectionStart.x);
            var dy = Math.abs(y - this.selectionStart.y);
            this.selectionEnd = {x: x, y: y};
            if (dx > 3 || dy > 3) {
                this.hasMoved = true;
            }
            this.render();
        }
    };

    GroupPianoRoll.prototype._onMouseUp = function(e) {
        if (!this.isSelecting) return;
        this.isSelecting = false;

        if (!this.hasMoved) {
            var rect = this.canvas.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var tick = this._screenToTick(x);
            var key = this._screenToKey(y);
            if (tick >= 0 && key >= 0 && key < 88) {
                var existing = this._getNoteAt(x, y);
                if (!existing && this.model) {
                    var group = this.model.groups[this.instrument];
                    var vol = group ? group.volume : 100;
                    var pan = group ? group.pan : 50;
                    var note = this.model.placeNote(this.instrument, tick, key, vol, pan);
                    if (this.onNotePlaced) this.onNotePlaced(note);
                }
            }
        }
        this.selectionStart = null;
        this.selectionEnd = null;
        this.render();
    };

    GroupPianoRoll.prototype._onWheel = function(e) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            var delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.setZoom(this.zoom * delta);
        } else if (e.shiftKey) {
            this.scrollX += e.deltaY;
            this.scrollX = Math.max(0, this.scrollX);
        } else {
            this.scrollX += e.deltaX;
            this.scrollY += e.deltaY;
            this.scrollX = Math.max(0, this.scrollX);
            this.scrollY = Math.max(0, this.scrollY);
        }
        this.render();
    };

    // --- 触摸事件 ---
    GroupPianoRoll.prototype._onTouchStart = function(e) {
        var rect = this.canvas.getBoundingClientRect();

        if (e.touches.length === 2) {
            e.preventDefault();
            this.touchMode = 'zoom';
            var t1 = e.touches[0], t2 = e.touches[1];
            this.lastTouchX = (t1.clientX + t2.clientX) / 2 - rect.left;
            this.lastTouchY = (t1.clientY + t2.clientY) / 2 - rect.top;
            var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
            this.lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            return;
        }

        if (e.touches.length === 1) {
            e.preventDefault();
            var touch = e.touches[0];
            var x = touch.clientX - rect.left, y = touch.clientY - rect.top;
            this.touchStartTime = Date.now();
            this.touchStartX = x;
            this.touchStartY = y;
            this.lastTouchX = x;
            this.lastTouchY = y;
            this.touchMoved = false;

            var note = this._getNoteAt(x, y);
            if (note) {
                this.touchMode = 'delete_note';
            } else {
                this.touchMode = 'pan';
            }
        }
    };

    GroupPianoRoll.prototype._onTouchMove = function(e) {
        var rect = this.canvas.getBoundingClientRect();

        if (e.touches.length === 2 && this.touchMode === 'zoom') {
            e.preventDefault();
            var t1 = e.touches[0], t2 = e.touches[1];
            var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (this.lastPinchDist > 0 && Math.abs(dist - this.lastPinchDist) > 5) {
                this.setZoom(this.zoom * (dist / this.lastPinchDist));
                this.lastPinchDist = dist;
            }
            var cx = (t1.clientX + t2.clientX) / 2 - rect.left;
            var cy = (t1.clientY + t2.clientY) / 2 - rect.top;
            this.scrollX += this.lastTouchX - cx;
            this.scrollY += this.lastTouchY - cy;
            this.scrollX = Math.max(0, this.scrollX);
            this.scrollY = Math.max(0, this.scrollY);
            this.lastTouchX = cx;
            this.lastTouchY = cy;
            this.render();
            return;
        }

        if (e.touches.length === 1) {
            e.preventDefault();
            var touch = e.touches[0];
            var x = touch.clientX - rect.left, y = touch.clientY - rect.top;
            var dx2 = Math.abs(x - this.touchStartX), dy2 = Math.abs(y - this.touchStartY);
            if (dx2 > 5 || dy2 > 5) this.touchMoved = true;

            if (this.touchMode === 'pan' && this.touchMoved) {
                this.scrollX += this.lastTouchX - x;
                this.scrollY += this.lastTouchY - y;
                this.scrollX = Math.max(0, this.scrollX);
                this.scrollY = Math.max(0, this.scrollY);
                this.lastTouchX = x;
                this.lastTouchY = y;
                this.render();
            }
        }
    };

    GroupPianoRoll.prototype._onTouchEnd = function(e) {
        if (this.touchMode === 'zoom') {
            this.touchMode = 'none';
            this.lastPinchDist = 0;
            return;
        }

        if (this.touchMode === 'pan') {
            this.touchMode = 'none';
            var elapsed = Date.now() - this.touchStartTime;
            if (!this.touchMoved && elapsed < 500) {
                var tick = this._screenToTick(this.touchStartX);
                var key = this._screenToKey(this.touchStartY);
                if (tick >= 0 && key >= 0 && key < 88 && this.model) {
                    var existing = this.model.getNoteAt(this.instrument, tick, key);
                    if (!existing) {
                        var group = this.model.groups[this.instrument];
                        var vol = group ? group.volume : 100;
                        var pan = group ? group.pan : 50;
                        var note = this.model.placeNote(this.instrument, tick, key, vol, pan);
                        if (this.onNotePlaced) this.onNotePlaced(note);
                    }
                }
            }
            this.render();
            return;
        }

        if (this.touchMode === 'delete_note') {
            this.touchMode = 'none';
            if (!this.touchMoved) {
                var rect2 = this.canvas.getBoundingClientRect();
                var note2 = this._getNoteAt(this.touchStartX, this.touchStartY);
                if (note2 && this.onNoteDeleted) {
                    this.onNoteDeleted(note2);
                }
            }
        }
    };

    // --- 公开方法 ---
    GroupPianoRoll.prototype.setInstrument = function(instrument) {
        this.instrument = instrument;
        this.render();
    };

    GroupPianoRoll.prototype.setZoom = function(zoom) {
        this.zoom = Math.max(0.1, Math.min(4, zoom));
        this.render();
    };

    GroupPianoRoll.prototype.getZoom = function() {
        return this.zoom;
    };

    GroupPianoRoll.prototype.setNotes = function(notes) {
        // notes 由 model 管理, 这里只重绘
        this.render();
    };

    GroupPianoRoll.prototype.render = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        if (!w || !h) return;

        // 背景
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        this._drawGrid();
        this._drawPianoKeys();
        this._drawNotes();
        this._drawSelectionBox();
    };

    GroupPianoRoll.prototype._drawGrid = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;

        // 垂直线（时间刻）
        var tickStart = Math.floor(this.scrollX / (CONFIG.tickWidth * this.zoom));
        var tickEnd = Math.ceil((this.scrollX + w - CONFIG.sidePanelWidth) / (CONFIG.tickWidth * this.zoom));
        for (var tick = tickStart; tick <= tickEnd; tick++) {
            var x = this._tickToScreen(tick);
            if (x >= CONFIG.sidePanelWidth && x <= w) {
                ctx.strokeStyle = tick % 4 === 0 ? 'rgba(255,255,255,0.08)' : CONFIG.gridLineColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
        }

        // 水平线（音高，每8度一根粗线）
        for (var key = 0; key < 88; key++) {
            var y = this._keyToScreen(key);
            if (y >= 0 && y <= h) {
                ctx.strokeStyle = (key + 9) % 12 === 0 ? 'rgba(255,255,255,0.12)' : CONFIG.gridLineColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(CONFIG.sidePanelWidth, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }
        }
    };

    GroupPianoRoll.prototype._drawNotes = function() {
        var ctx = this.ctx;
        var w = this.displayWidth;
        var h = this.displayHeight;
        if (!this.model) return;

        var notes = this.model.getGroupNotes(this.instrument);
        var color = '#4ecdc4';
        if (this.model.groups[this.instrument]) {
            color = this.model.groups[this.instrument].color;
        }

        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            var nx = this._tickToScreen(n.tick);
            var ny = this._keyToScreen(n.key);
            var nw = Math.max(CONFIG.noteMinWidth, CONFIG.tickWidth * this.zoom);
            var nh = CONFIG.keyHeight * this.zoom;

            if (nx + nw < CONFIG.sidePanelWidth || nx > w || ny + nh < 0 || ny > h) continue;

            // 阴影
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(nx + 1, ny + 1, nw, nh);

            // 主体
            ctx.fillStyle = color;
            ctx.fillRect(nx, ny, nw, nh);

            // 高光
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fillRect(nx, ny, nw, nh * 0.3);

            // 音量指示（底部色条）
            var velAlpha = n.velocity / 100;
            ctx.fillStyle = 'rgba(255,255,255,' + (velAlpha * 0.5).toFixed(2) + ')';
            ctx.fillRect(nx, ny + nh - 2, nw, 2);
        }
    };

    GroupPianoRoll.prototype._drawPianoKeys = function() {
        var ctx = this.ctx;
        var h = this.displayHeight;

        ctx.fillStyle = '#16213e';
        ctx.fillRect(0, 0, CONFIG.sidePanelWidth, h);

        var blackKeys = [1, 3, 6, 8, 10];

        for (var key = 0; key < 88; key++) {
            var y = this._keyToScreen(key);
            var kh = CONFIG.keyHeight * this.zoom;
            if (y + kh < 0 || y > h) continue;

            // FLS stores the same NBS keys as the main editor: key 0 is MIDI A0.
            var noteInOctave = (key + 9) % 12;
            var isBlack = blackKeys.indexOf(noteInOctave) !== -1;

            ctx.fillStyle = isBlack ? '#2a2a4a' : '#eaeaea';
            ctx.fillRect(0, y, CONFIG.sidePanelWidth - 3, kh);
        }

        ctx.strokeStyle = '#2a2a4a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(CONFIG.sidePanelWidth - 2, 0);
        ctx.lineTo(CONFIG.sidePanelWidth - 2, h);
        ctx.stroke();
    };

    GroupPianoRoll.prototype._drawSelectionBox = function() {
        if (!this.isSelecting || !this.selectionStart || !this.selectionEnd) return;
        var ctx = this.ctx;
        var sx = Math.min(this.selectionStart.x, this.selectionEnd.x);
        var sy = Math.min(this.selectionStart.y, this.selectionEnd.y);
        var sw = Math.abs(this.selectionEnd.x - this.selectionStart.x);
        var sh = Math.abs(this.selectionEnd.y - this.selectionStart.y);
        if (sw < 3 && sh < 3) return;

        ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, sy, sw, sh);
    };

    return GroupPianoRoll;
})();
