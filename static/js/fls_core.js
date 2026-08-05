/**
 * FLS 模式核心数据模型
 * 基于 FL Studio Mobile 风格: Track + Clip + Notes(相对时间)
 */
window.FLS = (function() {
    'use strict';

    var TRACK_COLORS = [
        '#ffd93d', '#ff6b6b', '#4ecdc4', '#95e1d3',
        '#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5',
        '#bae1ff', '#baffc9', '#ffffba', '#ffdfba',
        '#ffb3ba', '#e0bbff', '#c9f0ff', '#caffbf'
    ];

    var INSTRUMENT_NAMES = [
        '竖琴', '低音提琴', '大鼓', '小鼓',
        '击掌声', '吉他', '长笛', '钟琴',
        '风铃', '木琴', '铁木琴', '牛铃',
        '迪吉里杜管', '芯片音', '班卓琴', '电钢琴',
        '铜号角', '斑驳的铜号角', '锈蚀的铜号角', '氧化的铜号角'
    ];

    function uid(prefix) {
        return (prefix || 'id') + '_' + Math.random().toString(36).substr(2, 9);
    }

    function createTrack(name, instrument, order) {
        return {
            id: uid('track'),
            name: name || ('音轨 ' + (order + 1)),
            instrument: instrument != null ? instrument : 0,
            color: TRACK_COLORS[(order != null ? order : 0) % TRACK_COLORS.length],
            volume: 100, pan: 50, muted: false, solo: false,
            reverb: 0, fadeIn: 0, fadeOut: 0,
            order: order != null ? order : 0
        };
    }

    function createClip(trackId, startStep, length, name) {
        return {
            id: uid('clip'), trackId: trackId, startStep: startStep,
            length: length, name: name || 'Clip', notes: []
        };
    }

    function createClipNote(step, key, velocity) {
        return {
            step: step,
            key: key != null ? key : 45,
            velocity: velocity != null ? velocity : 100
        };
    }

    // ---------- Model ----------
    function Model() {
        this.tracks = [];
        this.clips = [];
        this.activeClipId = null;
        this.activeTrackId = null;
        this.settingsPanelOpen = false;
        this.view = 'playlist';
        this.tempo = 20;
        this.currentTick = 0;
        this.isPlaying = false;
    }

    Model.prototype.addTrack = function(instrument, name) {
        var order = this.tracks.length;
        var t = createTrack(name, instrument, order);
        this.tracks.push(t);
        return t;
    };

    Model.prototype.removeTrack = function(trackId) {
        this.tracks = this.tracks.filter(function(t) { return t.id !== trackId; });
        this.clips = this.clips.filter(function(c) { return c.trackId !== trackId; });
    };

    Model.prototype.getTrack = function(trackId) {
        for (var i = 0; i < this.tracks.length; i++) {
            if (this.tracks[i].id === trackId) return this.tracks[i];
        }
        return null;
    };

    Model.prototype.getTracksOrdered = function() {
        return this.tracks.slice().sort(function(a, b) { return a.order - b.order; });
    };

    Model.prototype.addClip = function(trackId, startStep, length, name) {
        var c = createClip(trackId, startStep, length, name || ('Clip ' + (this.clips.length + 1)));
        this.clips.push(c);
        return c;
    };

    Model.prototype.removeClip = function(clipId) {
        this.clips = this.clips.filter(function(c) { return c.id !== clipId; });
        if (this.activeClipId === clipId) this.activeClipId = null;
    };

    Model.prototype.getClip = function(clipId) {
        for (var i = 0; i < this.clips.length; i++) {
            if (this.clips[i].id === clipId) return this.clips[i];
        }
        return null;
    };

    Model.prototype.getClipsByTrack = function(trackId) {
        var result = [];
        for (var i = 0; i < this.clips.length; i++) {
            if (this.clips[i].trackId === trackId) result.push(this.clips[i]);
        }
        result.sort(function(a, b) { return a.startStep - b.startStep; });
        return result;
    };

    Model.prototype.toggleNoteInClip = function(clipId, step, key, velocity) {
        var clip = this.getClip(clipId);
        if (!clip || step < 0 || step >= clip.length) return null;
        for (var i = 0; i < clip.notes.length; i++) {
            if (clip.notes[i].step === step && clip.notes[i].key === key) {
                clip.notes.splice(i, 1);
                return false;
            }
        }
        clip.notes.push(createClipNote(step, key, velocity));
        return true;
    };

    Model.prototype.hasNote = function(clipId, step, key) {
        var clip = this.getClip(clipId);
        if (!clip) return false;
        for (var i = 0; i < clip.notes.length; i++) {
            if (clip.notes[i].step === step && clip.notes[i].key === key) return true;
        }
        return false;
    };

    Model.prototype.clearClipNotes = function(clipId) {
        var clip = this.getClip(clipId);
        if (clip) clip.notes = [];
    };

    Model.prototype.getSongLength = function() {
        var max = 64;
        for (var i = 0; i < this.clips.length; i++) {
            var end = this.clips[i].startStep + this.clips[i].length;
            if (end > max) max = end;
        }
        return max + 16;
    };

    // ---------- 转 flat notes ----------
    // includeAll: 为 true 时不跳过 muted/solo，用于导出
    Model.prototype.toFlatNotes = function(includeAll) {
        var notes = [];
        var layerMap = {};
        for (var l = 0; l < this.tracks.length; l++) {
            layerMap[this.tracks[l].id] = l;
        }

        var hasSolo = false;
        for (var m = 0; m < this.tracks.length; m++) {
            if (this.tracks[m].solo) { hasSolo = true; break; }
        }

        for (var c = 0; c < this.clips.length; c++) {
            var clip = this.clips[c];
            var track = this.getTrack(clip.trackId);
            if (!track) continue;
            if (!includeAll && track.muted) continue;
            if (!includeAll && hasSolo && !track.solo) continue;

            var layer = layerMap[clip.trackId];
            var velScale = track.volume / 100;

            for (var n = 0; n < clip.notes.length; n++) {
                var note = clip.notes[n];
                if (!note || typeof note.step !== 'number') continue;
                var tick = clip.startStep + note.step;
                notes.push({
                    tick: tick,
                    layer: layer,
                    instrument: track.instrument,
                    key: note.key,
                    velocity: Math.max(0, Math.min(100, Math.round(note.velocity * velScale))),
                    pan: track.pan,
                    pitch: 0
                });
            }
        }
        return notes;
    };

    // ---------- 从 flat notes / NBS 载入 ----------
    Model.prototype.loadFromFlatNotes = function(flatNotes, songTempo) {
        this.tracks = [];
        this.clips = [];

        // 空数据: 创建演示轨道
        if (!flatNotes || flatNotes.length === 0) {
            var emptyTrack = this.addTrack(0, '音轨 1');
            this.addClip(emptyTrack.id, 0, 32, 'Clip 1');
            if (songTempo) this.tempo = songTempo;
            this.view = 'playlist';
            this.activeClipId = null;
            this.activeTrackId = this.tracks[0].id;
            return;
        }

        // 按 (instrument, layer) 分组
        var buckets = {};
        var validCount = 0;
        for (var i = 0; i < flatNotes.length; i++) {
            var n = flatNotes[i];
            if (!n || typeof n.tick !== 'number' || isNaN(n.tick)) continue;
            var inst = n.instrument != null ? n.instrument : 0;
            var layer = n.layer != null ? n.layer : 0;
            var key = inst + '_' + layer;
            if (!buckets[key]) {
                buckets[key] = {
                    instrument: inst,
                    layer: layer,
                    notes: [],
                    minTick: n.tick,
                    maxTick: n.tick
                };
            }
            buckets[key].notes.push(n);
            if (n.tick < buckets[key].minTick) buckets[key].minTick = n.tick;
            if (n.tick > buckets[key].maxTick) buckets[key].maxTick = n.tick;
            validCount++;
        }

        // 全部都是无效音符
        if (validCount === 0) {
            var emptyTrack2 = this.addTrack(0, '音轨 1');
            this.addClip(emptyTrack2.id, 0, 32, 'Clip 1');
            if (songTempo) this.tempo = songTempo;
            this.view = 'playlist';
            this.activeClipId = null;
            this.activeTrackId = this.tracks[0].id;
            return;
        }

        var keys = Object.keys(buckets).sort();
        for (var k = 0; k < keys.length; k++) {
            var b = buckets[keys[k]];
            var track = this.addTrack(b.instrument, (INSTRUMENT_NAMES[b.instrument] || '音轨') + ' ' + (k + 1));
            var clipLength = Math.max(16, b.maxTick - b.minTick + 4);
            var clip = this.addClip(track.id, b.minTick, clipLength, track.name);
            for (var m = 0; m < b.notes.length; m++) {
                var relStep = b.notes[m].tick - b.minTick;
                clip.notes.push(createClipNote(relStep, b.notes[m].key, b.notes[m].velocity));
            }
        }

        if (songTempo) this.tempo = songTempo;
        this.view = 'playlist';
        this.activeClipId = null;
        this.activeTrackId = this.tracks.length > 0 ? this.tracks[0].id : null;
    };

    return {
        Model: Model,
        createTrack: createTrack,
        createClip: createClip,
        createClipNote: createClipNote,
        INSTRUMENT_NAMES: INSTRUMENT_NAMES,
        TRACK_COLORS: TRACK_COLORS
    };
})();
