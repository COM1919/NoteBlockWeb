// ====================================================================
// 自定义音色系统 - 数据模型 / 持久化 / 播放注册 (custom_instruments.js)
// ====================================================================
// 职责:
//   1. 维护自定义音色元数据列表 (localStorage: webnbs_custom_list)
//   2. 音频大文件二进制持久化 (IndexedDB: webnbs_custom_instruments.audio)
//   3. instrument 编号分配 (默认 0-19 占用, 自定义从 20 起, 删除后不复用)
//   4. 播放注册: 把音频 decode 为 AudioBuffer 后交给 AudioEngine
// 依赖: audio_engine.js 必须已加载 (window.AudioEngine)
// ====================================================================
(function() {
    'use strict';

    var DB_NAME = 'webnbs_custom_instruments';
    var DB_STORE_AUDIO = 'audio';          // key = 'instrument_' + id, value = Blob
    var LS_LIST_KEY = 'webnbs_custom_list'; // JSON: CustomInstrument[] 元数据(不含大文件)

    var _db = null;
    var _items = [];          // 元数据列表 (已按 instrument 排序)
    var _reservedNames = [];  // 保留名(默认乐器名), 名称校验排除

    // ---------- 内部工具 ----------
    function clampInt(v, min, max, fb) {
        if (typeof v !== 'number' || isNaN(v)) v = fb;
        return Math.max(min, Math.min(max, Math.round(v)));
    }

    function genId() {
        return 'ci_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function nextInstrument() {
        var max = 19;
        for (var i = 0; i < _items.length; i++) {
            if (_items[i].instrument > max) max = _items[i].instrument;
        }
        return max + 1;
    }

    // ---------- IndexedDB ----------
    function openDB() {
        return new Promise(function(resolve, reject) {
            if (_db) { resolve(_db); return; }
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function(ev) {
                var db = ev.target.result;
                if (!db.objectStoreNames.contains(DB_STORE_AUDIO)) {
                    db.createObjectStore(DB_STORE_AUDIO);
                }
            };
            req.onsuccess = function() { _db = req.result; resolve(_db); };
            req.onerror = function() { reject(req.error); };
        });
    }

    function idbPut(key, value) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(DB_STORE_AUDIO, 'readwrite');
                tx.objectStore(DB_STORE_AUDIO).put(value, key);
                tx.oncomplete = resolve;
                tx.onerror = function() { reject(tx.error); };
            });
        });
    }

    function idbGet(key) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(DB_STORE_AUDIO, 'readonly');
                var req = tx.objectStore(DB_STORE_AUDIO).get(key);
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { reject(req.error); };
            });
        });
    }

    function idbDel(key) {
        return openDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(DB_STORE_AUDIO, 'readwrite');
                tx.objectStore(DB_STORE_AUDIO).delete(key);
                tx.oncomplete = resolve;
                tx.onerror = function() { reject(tx.error); };
            });
        });
    }

    // ---------- localStorage 元数据 ----------
    function persistList() {
        try {
            localStorage.setItem(LS_LIST_KEY, JSON.stringify(_items));
        } catch (e) { /* 忽略 */ }
    }

    function loadList() {
        try {
            var raw = localStorage.getItem(LS_LIST_KEY);
            if (!raw) return;
            var arr = JSON.parse(raw);
            if (Array.isArray(arr)) _items = arr;
        } catch (e) { /* 忽略损坏数据 */ }
    }

    // ---------- 音频工具 ----------
    function ensureCtx() {
        var ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        if (ctx) return ctx;
        var AC = window.AudioContext || window.webkitAudioContext;
        return AC ? new AC() : null;
    }

    // decode Blob -> AudioBuffer (多次调用内部缓存)
    var _decodeCache = {};
    function decodeBlob(id, blob) {
        if (_decodeCache[id]) return Promise.resolve(_decodeCache[id]);
        var ctx = ensureCtx();
        if (!ctx) return Promise.reject(new Error('无法创建 AudioContext'));
        return blob.arrayBuffer().then(function(ab) {
            return ctx.decodeAudioData(ab);
        }).then(function(buf) {
            _decodeCache[id] = buf;
            return buf;
        });
    }

    // SHA-256 (Web Crypto); 不可用时返回空串
    function computeHash(blob) {
        if (!window.crypto || !crypto.subtle || !crypto.subtle.digest) {
            return Promise.resolve('');
        }
        return blob.arrayBuffer().then(function(ab) {
            return crypto.subtle.digest('SHA-256', ab);
        }).then(function(digest) {
            var bytes = new Uint8Array(digest);
            var hex = '';
            for (var i = 0; i < bytes.length; i++) {
                hex += bytes[i].toString(16).padStart(2, '0');
            }
            return hex;
        }).catch(function() { return ''; });
    }

    // 读取 Blob 的声道/采样率/时长 (独立解码, 不占用 ensureRegistered 的缓存)
    function probeAudio(blob) {
        var ctx = ensureCtx();
        if (!ctx) return Promise.resolve(null);
        return blob.arrayBuffer().then(function(ab) {
            return ctx.decodeAudioData(ab);
        }).then(function(buf) {
            return { channels: buf.numberOfChannels, sampleRate: buf.sampleRate, duration: buf.duration };
        }).catch(function() { return null; });
    }

    // ---------- 对外 API ----------
    var CustomInstruments = {

        init: function(cb) {
            loadList();
            if (cb) cb(_items.slice());
        },

        list: function() {
            return _items.slice().sort(function(a, b) { return a.instrument - b.instrument; });
        },

        getById: function(id) {
            for (var i = 0; i < _items.length; i++) if (_items[i].id === id) return _items[i];
            return null;
        },

        getByInstrument: function(index) {
            for (var i = 0; i < _items.length; i++) if (_items[i].instrument === index) return _items[i];
            return null;
        },

        getByName: function(name) {
            var n = (name || '').trim();
            for (var i = 0; i < _items.length; i++) if (_items[i].name === n) return _items[i];
            return null;
        },

        // 计算 Blob 的 SHA-256 (作品包/备份去重与冲突检测用)
        hashBlob: function(blob) {
            return computeHash(blob);
        },

        // 供 main.js 注入保留名(默认乐器名列表)
        setReservedNames: function(names) {
            _reservedNames = Array.isArray(names) ? names : [];
        },

        isNameAvailable: function(name) {
            var n = (name || '').trim();
            if (!n) return false;
            if (_reservedNames.indexOf(n) >= 0) return false;
            for (var i = 0; i < _items.length; i++) {
                if (_items[i].name === n) return false;
            }
            return true;
        },

        sanitizeName: function(name) {
            var n = (name || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 40);
            return n;
        },

        // 新增自定义音色: 音频先落库成功再入列表, 避免 IndexedDB 失败产生"幽灵项"
        // opts: { name, color, pitch(baseKey 0-87), gain(0-100) }
        add: function(blob, opts) {
            opts = opts || {};
            var id = genId();
            var storageKey = 'instrument_' + id;
            var instNo = nextInstrument();
            var name = CustomInstruments.sanitizeName(opts.name);
            if (!name) name = '自定义音色 ' + (instNo - 19);
            var item = {
                id: id,
                instrument: instNo,
                name: name,
                color: /^#[0-9a-fA-F]{6}$/.test(opts.color || '') ? opts.color : '#4aa3ff',
                pitch: clampInt(opts.pitch, 0, 87, 33),
                gain: clampInt(opts.gain, 1, 200, 100),
                file: storageKey,
                originalName: opts.originalName || '',
                importedAt: Date.now(),
                channels: 1,
                sampleRate: 0,
                duration: 0,
                hash: ''
            };
            return idbPut(storageKey, blob).then(function() {
                // 音频已落库, 再补充探测信息 + hash (失败不阻断入库)
                return Promise.all([computeHash(blob), probeAudio(blob)]).then(function(res) {
                    item.hash = res[0];
                    if (res[1]) {
                        item.channels = res[1].channels;
                        item.sampleRate = res[1].sampleRate;
                        item.duration = Math.round(res[1].duration * 100) / 100;
                    }
                    _items.push(item);
                    persistList();
                    return item;
                }).catch(function() {
                    _items.push(item);
                    persistList();
                    return item;
                });
            });
        },

        // 更新元数据 (name/color/pitch/gain...)
        update: function(id, patch) {
            var item = this.getById(id);
            if (!item) return item;
            for (var k in patch) {
                if (patch.hasOwnProperty(k) && k !== 'id' && k !== 'instrument') {
                    item[k] = patch[k];
                }
            }
            persistList();
            // 仅当播放相关参数 (pitch/gain) 变化时重新注册解码
            if ((patch && (patch.pitch !== undefined || patch.gain !== undefined))) {
                this.ensureRegistered(id);
            }
            return item;
        },

        remove: function(id) {
            var item = this.getById(id);
            if (!item) return Promise.resolve();
            var idx = _items.indexOf(item);
            if (idx >= 0) _items.splice(idx, 1);
            persistList();
            if (window.AudioEngine && AudioEngine.unregisterCustomInstrument) {
                AudioEngine.unregisterCustomInstrument(item.instrument);
            }
            delete _decodeCache[id];
            return idbDel(item.file).catch(function() {});
        },

        // 取原始 Blob (导出 zip 用)
        getBlob: function(id) {
            var item = this.getById(id);
            if (!item) return Promise.resolve(null);
            return idbGet(item.file);
        },

        // 确保已 decode 并注册到 AudioEngine
        ensureRegistered: function(id) {
            var item = this.getById(id);
            if (!item) return Promise.resolve(false);
            if (window.AudioEngine && AudioEngine.registerCustomInstrument) {
                AudioEngine.registerCustomInstrument(item.instrument, {
                    buffer: null,
                    baseKey: item.pitch,
                    gain: item.gain
                });
            }
            var blobP = this.getBlob(id);
            return blobP.then(function(blob) {
                if (!blob) return false;
                return decodeBlob(id, blob);
            }).then(function(buf) {
                if (window.AudioEngine && AudioEngine.registerCustomInstrument) {
                    AudioEngine.registerCustomInstrument(item.instrument, {
                        buffer: buf,
                        baseKey: item.pitch,
                        gain: item.gain
                    });
                }
                return true;
            }).catch(function() { return false; });
        },

        // 逐个懒加载注册 (仅注册有音色 item 时的缓冲)
        registerAll: function(cb, onEach) {
            var self = this;
            var list = self.list();
            var seq = Promise.resolve();
            list.forEach(function(item) {
                seq = seq.then(function() {
                    return self.ensureRegistered(item.id).then(function(ok) {
                        if (onEach) onEach(item, ok);
                    });
                });
            });
            return seq.then(function() { if (cb) cb(); });
        },

        clearAll: function() {
            var self = this;
            var list = self.list();
            return Promise.all(list.map(function(item) { return self.remove(item.id); })).then(function() {
                if (window.AudioEngine && AudioEngine.clearCustomInstruments) AudioEngine.clearCustomInstruments();
            });
        }
    };

    window.CustomInstruments = CustomInstruments;
})();
