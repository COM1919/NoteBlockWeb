/**
 * SoundFont 音色库加载器
 * 负责: 按需下载 SF3/SF2 文件 → IndexedDB 缓存 → 合成器初始化
 * 引擎: 优先 SpessaSynth (spessa_player.js), 失败时回退 SF3Player (sf3_player.js)
 * 策略: 页面加载只读取本地缓存, 不自动下载。
 *       下载由用户设置决定: 'ask' 播放时弹窗询问 | 'auto' 静默后台下载 | 'off' 不使用
 */
(function() {
    'use strict';

    var DB_NAME = 'webnbs_soundfont';
    var STORE = 'files';
    var DB_VER = 1;
    var KEY_DATA = 'sf3_data';
    var KEY_META = 'sf3_meta';

    var SoundfontLoader = {
        status: 'idle',      // idle | downloading | loading | ready | failed
        player: null,
        config: null,
        engine: null,        // 'spessa' | 'sf3player'
        _toastId: null,

        // ---- 初始化入口: 只加载缓存, 不自动下载 ----
        init: function(config) {
            if (!config || !config.url) return;
            this.config = config;
            var self = this;
            this._getCached().then(function(cached) {
                if (cached) {
                    self._loadPlayer(cached.data, cached.meta);
                } else {
                    self.status = 'idle';
                    if (self.onStatusChange) self.onStatusChange('idle', {});
                }
            }).catch(function() {
                self.status = 'idle';
                if (self.onStatusChange) self.onStatusChange('idle', {});
            });
        },

        // ---- 公共: 立即下载 (播放时询问/设置按钮调用) ----
        download: function() {
            if (!this.config) return;
            var st = this.status;
            if (st === 'downloading' || st === 'loading') return;
            this._download();
        },

        // ---- 公共: 清除缓存并重置状态 ----
        clearCache: function() {
            var self = this;
            this.player = null;
            this.status = 'idle';
            this.engine = null;
            this._clearCache().then(function() {
                if (self.onStatusChange) self.onStatusChange('idle', {});
            });
        },

        // ---- 公共: 是否已有本地缓存 (不解析) ----
        hasCache: function() {
            return this._getCached().then(function(cached) { return !!cached; });
        },

        // ---- IndexedDB 操作 ----
        _openDB: function() {
            return new Promise(function(resolve, reject) {
                var req = indexedDB.open(DB_NAME, DB_VER);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE))
                        db.createObjectStore(STORE);
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        },

        _getCached: function() {
            var self = this;
            return this._openDB().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction([STORE], 'readonly');
                    var store = tx.objectStore(STORE);
                    var dataReq = store.get(KEY_DATA);
                    var metaReq = store.get(KEY_META);
                    var data = null, meta = null;
                    dataReq.onsuccess = function(e) { data = e.target.result; };
                    dataReq.onerror = function(e) { reject(e.target.error); };
                    metaReq.onsuccess = function(e) { meta = e.target.result; };
                    metaReq.onerror = function(e) { reject(e.target.error); };
                    tx.oncomplete = function() {
                        if (data) resolve({ data: data, meta: meta || {} });
                        else resolve(null);
                    };
                    tx.onerror = function(e) { reject(e.target.error); };
                });
            }).catch(function() { return null; });
        },

        _putCache: function(data, meta) {
            return this._openDB().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction([STORE], 'readwrite');
                    var store = tx.objectStore(STORE);
                    store.put(data, KEY_DATA);
                    store.put(meta, KEY_META);
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function(e) { reject(e.target.error); };
                });
            }).catch(function() {});
        },

        // ---- 下载 ----
        _download: function() {
            var self = this;
            this.status = 'downloading';
            var url = this.config.url;
            var name = this.config.name || 'MIDI 音色库';

            // 通知 UI: 开始下载
            if (this.onStatusChange) this.onStatusChange('downloading', { name: name });

            fetch(url).then(function(resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                var total = parseInt(resp.headers.get('Content-Length') || '0', 10);
                var loaded = 0;
                var reader = resp.body.getReader();
                var chunks = [];

                function pump() {
                    reader.read().then(function(result) {
                        if (result.done) {
                            var blob = new Blob(chunks);
                            blob.arrayBuffer().then(function(buf) {
                                // 缓存到 IndexedDB
                                self._putCache(buf, {
                                    url: url,
                                    name: name,
                                    size: buf.byteLength,
                                    time: Date.now()
                                }).then(function() {
                                    self._loadPlayer(buf, { name: name });
                                });
                            });
                            return;
                        }
                        chunks.push(result.value);
                        loaded += result.value.length;
                        if (self.onProgress) {
                            self.onProgress(loaded, total, name);
                        }
                        pump();
                    }).catch(function(err) {
                        self.status = 'failed';
                        if (self.onStatusChange) self.onStatusChange('failed', { error: err.message });
                    });
                }
                pump();
            }).catch(function(err) {
                self.status = 'failed';
                if (self.onStatusChange) self.onStatusChange('failed', { error: err.message });
            });
        },

        // ---- 加载到合成器 (优先 SpessaSynth, 回退 SF3Player) ----
        _loadPlayer: function(buf, meta) {
            var self = this;
            this.status = 'loading';
            var name = (meta && meta.name) || this.config.name || 'MIDI 音色库';
            if (this.onStatusChange) this.onStatusChange('loading', { name: name });

            // 获取 AudioContext (优先复用 AudioEngine 的)
            var ctx = null;
            if (window.AudioEngine && AudioEngine.getContext) {
                try { ctx = AudioEngine.getContext(); } catch(e) {}
            }
            if (!ctx) {
                try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
                catch(e) {
                    self.status = 'failed';
                    if (self.onStatusChange) self.onStatusChange('failed', { error: 'AudioContext 不可用' });
                    return;
                }
            }

            // SpessaSynth 引擎 (异步 init, 解析可能较慢)
            if (window.SpessaPlayer && SpessaPlayer.isSupported()) {
                var p = new SpessaPlayer(ctx);
                p.load(buf, function(prog) {
                    if (self.onParseProgress) self.onParseProgress(prog, name);
                }).then(function() {
                    self.player = p;
                    self.status = 'ready';
                    self.engine = 'spessa';
                    if (self.onStatusChange) self.onStatusChange('ready', {
                        name: name,
                        presets: (p.getPresetList && p.getPresetList().length) || 0,
                        isSF3: p.isSF3,
                        engine: 'SpessaSynth'
                    });
                }).catch(function(err) {
                    // SpessaSynth 初始化失败 → 回退旧引擎
                    self._loadPlayerLegacy(buf, meta);
                });
                return;
            }
            this._loadPlayerLegacy(buf, meta);
        },

        // ---- 回退引擎: 原 SF3Player ----
        _loadPlayerLegacy: function(buf, meta) {
            var self = this;
            this.status = 'loading';
            var name = (meta && meta.name) || this.config.name || 'MIDI 音色库';
            if (this.onStatusChange) this.onStatusChange('loading', { name: name });

            var ctx = null;
            if (window.AudioEngine && AudioEngine.getContext) {
                try { ctx = AudioEngine.getContext(); } catch(e) {}
            }
            if (!ctx) {
                try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
                catch(e) {
                    self.status = 'failed';
                    if (self.onStatusChange) self.onStatusChange('failed', { error: 'AudioContext 不可用' });
                    return;
                }
            }

            var player = new SF3Player(ctx);
            player.load(buf, function(prog) {
                if (self.onParseProgress) self.onParseProgress(prog, name);
            }).then(function() {
                self.player = player;
                self.status = 'ready';
                self.engine = 'sf3player';
                if (self.onStatusChange) self.onStatusChange('ready', {
                    name: name,
                    presets: player.getPresetList().length,
                    isSF3: player.isSF3,
                    engine: '内置解析器'
                });
            }).catch(function(err) {
                self.status = 'failed';
                if (self.onStatusChange) self.onStatusChange('failed', { error: err.message });
                // 解析失败, 清除缓存以免下次重复加载坏文件
                self._clearCache();
            });
        },

        _clearCache: function() {
            return this._openDB().then(function(db) {
                return new Promise(function(resolve) {
                    var tx = db.transaction([STORE], 'readwrite');
                    tx.objectStore(STORE).delete(KEY_DATA);
                    tx.objectStore(STORE).delete(KEY_META);
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { resolve(); };
                });
            }).catch(function() {});
        },

        // ---- 公共 API ----
        isReady: function() {
            return this.status === 'ready' && this.player &&
                (this.player._ready || (this.player.isReady && this.player.isReady()));
        },

        getPlayer: function() {
            return this.isReady() ? this.player : null;
        },

        getStatus: function() { return this.status; },

        getEngine: function() { return this.engine; }
    };

    window.SoundfontLoader = SoundfontLoader;
})();
