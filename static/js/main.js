/**
 * WebNBS 主控制器
 * 管理普通模式、进度条、快捷键、轨道、上下文菜单、钢琴键盘、撤销重做
 */
(function() {
    'use strict';

    // ============ 全局状态 ============
    var state = {
        notes: [],
        tempo: 20,
        currentTick: 0,
        maxTick: 0,
        isPlaying: false,
        noteIndex: null,

        pianoRoll: null,
        currentInstrument: 0,
        // NBS key 39 is MIDI C4 (NBS key 0 is MIDI A0).
        selectedPianoKey: 39,
        importedFileName: '',  // 导入/加载时的原始文件名（不含扩展名），用于导出时命名

        // 剪贴板 & 撤销
        clipboard: [],
        undoStack: [],
        redoStack: [],
        maxUndo: 50,

        // 轨道
        tracks: [],
        soloActive: false,

        // 上下文菜单
        contextMenuTarget: null,

        // 歌曲
        song: null,

        // FLS 模式
        flsEnabled: false,
        flsModel: null,
        flsPlaylist: null,
        flsTrackPanel: null,
        flsPianoRoll: null,

        // 平滑翻页开关: false=超出后翻页, true=播放头始终居中
        smoothScroll: false,

        // 当前文件的持久 ID (用于自动保存覆盖, 而非产生重复)
        currentFileId: null,

        // 键盘钢琴
        keyboardPianoEnabled: false,
        numpadOctaveShift: 0,
        numpadSemitoneShift: 0,
        letterOctaveShift: 0,
        letterSemitoneShift: 0,
        _activePianoKeys: {},

        // 演奏模式
        performanceMode: false,
        performanceRecording: false,
        performanceNotes: [],
        performanceActiveKeys: {},
        performanceTrackLayers: [],
        performanceSettings: null
    };

    // 安全的 DOM 访问
    var $ = function(id) { return document.getElementById(id); };
    var $setText = function(id, text) { var el = $(id); if (el) el.textContent = text; };
    var $setValue = function(id, val) { var el = $(id); if (el) el.value = val; };
    var i18nText = function(text) {
        return window.WebNBSI18n && WebNBSI18n.translate ? WebNBSI18n.translate(text) : text;
    };
    var i18nKey = function(key, fallback) {
        return window.WebNBSI18n && WebNBSI18n.t ? WebNBSI18n.t(key) : fallback;
    };

    // Keep every flyout inside the visual viewport.  Menus are created in a
    // number of modules, so exposing this helper also keeps their behaviour
    // consistent on small touch screens and in landscape.
    window.WebNBSPositionFlyout = function(element, anchor, options) {
        if (!element) return;
        options = options || {};
        var margin = options.margin === undefined ? 8 : options.margin;
        var gap = options.gap === undefined ? 6 : options.gap;
        var viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
        var viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
        var maxFlyoutHeight = options.maxHeight === undefined
            ? Math.max(1, viewportHeight - margin * 2)
            : Math.max(1, Math.min(options.maxHeight, viewportHeight - margin * 2));
        var point = anchor || {};
        var leftEdge = Number(point.left);
        var topEdge = Number(point.top);
        if (isNaN(leftEdge)) leftEdge = margin;
        if (isNaN(topEdge)) topEdge = margin;
        var rightEdge = Number(point.right);
        var bottomEdge = Number(point.bottom);
        if (isNaN(rightEdge)) rightEdge = leftEdge;
        if (isNaN(bottomEdge)) bottomEdge = topEdge;
        var placement = options.placement || 'pointer';

        element.style.position = 'fixed';
        element.style.right = 'auto';
        element.style.bottom = 'auto';
        element.style.maxWidth = Math.max(1, viewportWidth - margin * 2) + 'px';
        element.style.maxHeight = maxFlyoutHeight + 'px';
        element.style.overflowX = 'auto';
        element.style.overflowY = 'auto';
        element.style.overscrollBehavior = 'contain';

        // A flyout needs to be measurable before a safe placement can be
        // calculated.  Callers normally make it visible first; the fallback
        // also keeps dynamically-created menus safe.
        var temporarilyVisible = false;
        if (getComputedStyle(element).display === 'none') {
            element.style.visibility = 'hidden';
            element.style.display = 'block';
            temporarilyVisible = true;
        }
        element.style.left = '-10000px';
        element.style.top = '-10000px';
        var rect = element.getBoundingClientRect();
        var width = rect.width;
        var height = rect.height;

        var left = leftEdge;
        var top = topEdge;
        if (placement === 'bottom-start') {
            left = leftEdge;
            top = bottomEdge + gap;
        } else if (placement === 'bottom-end') {
            left = rightEdge - width;
            top = bottomEdge + gap;
        } else if (placement === 'top-start') {
            left = leftEdge;
            top = topEdge - height - gap;
        } else if (placement === 'top-end') {
            left = rightEdge - width;
            top = topEdge - height - gap;
        } else if (placement === 'right-start') {
            left = rightEdge + gap;
            top = topEdge;
        } else if (placement === 'left-start') {
            left = leftEdge - width - gap;
            top = topEdge;
        }

        // Prefer the opposite side whenever it has enough space.  Otherwise
        // clamp the flyout and retain a scrollable interior instead of hiding
        // actions beyond the edge of the display.
        if ((placement === 'right-start' || placement === 'pointer') && left + width > viewportWidth - margin) {
            var leftAlternative = leftEdge - width - gap;
            if (leftAlternative >= margin) left = leftAlternative;
        } else if (placement === 'left-start' && left < margin) {
            var rightAlternative = rightEdge + gap;
            if (rightAlternative + width <= viewportWidth - margin) left = rightAlternative;
        }
        if ((placement === 'bottom-start' || placement === 'bottom-end' || placement === 'pointer') && top + height > viewportHeight - margin) {
            var topAlternative = topEdge - height - gap;
            if (topAlternative >= margin) top = topAlternative;
        } else if ((placement === 'top-start' || placement === 'top-end') && top < margin) {
            var bottomAlternative = bottomEdge + gap;
            if (bottomAlternative + height <= viewportHeight - margin) top = bottomAlternative;
        }

        left = Math.max(margin, Math.min(left, viewportWidth - width - margin));
        top = Math.max(margin, Math.min(top, viewportHeight - height - margin));
        element.style.left = Math.round(left) + 'px';
        element.style.top = Math.round(top) + 'px';
        if (temporarilyVisible) element.style.visibility = '';
    };

    // NBS stores A0 as key 0. Use this single conversion for every piano
    // surface so the visible label, selected key and audio pitch stay aligned.
    var NBS_MIDI_OFFSET = 21;
    var PIANO_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    function nbsKeyToMidiNote(key) {
        return Math.max(0, Math.min(87, Math.round(Number(key) || 0))) + NBS_MIDI_OFFSET;
    }
    function getNbsKeyPitchLabel(key) {
        return PIANO_NOTE_NAMES[nbsKeyToMidiNote(key) % 12];
    }
    function getNbsKeyOctave(key) {
        return Math.floor(nbsKeyToMidiNote(key) / 12) - 1;
    }

    function getInstrumentNames() {
        var names = ['竖琴','低音提琴','大鼓','小鼓','击打声','吉他','长笛','钟琴','风铃','木琴','铁木琴','牛铃','迪吉里杜管','芯片音','班卓琴','电钢琴','铜号角','斑驳的铜号角','锈蚀的铜号角','氧化的铜号角'];
        for (var i = 0; i < names.length; i++) names[i] = i18nText(names[i]);
        return names;
    }

    var KEYBOARD_PIANO_MAP = {
        'Backquote': 0, 'Digit1': 1, 'Digit2': 2, 'Digit3': 3, 'Digit4': 4, 'Digit5': 5,
        'Digit6': 6, 'Digit7': 7, 'Digit8': 8, 'Digit9': 9, 'Digit0': 10, 'Minus': 11,
        'Equal': 12, 'Backspace': 13,
        'Tab': 14, 'KeyQ': 15, 'KeyW': 16, 'KeyE': 17, 'KeyR': 18, 'KeyT': 19,
        'KeyY': 20, 'KeyU': 21, 'KeyI': 22, 'KeyO': 23, 'KeyP': 24,
        'BracketLeft': 25, 'BracketRight': 26, 'Backslash': 27,
        'CapsLock': 28, 'KeyA': 29, 'KeyS': 30, 'KeyD': 31, 'KeyF': 32, 'KeyG': 33,
        'KeyH': 34, 'KeyJ': 35, 'KeyK': 36, 'KeyL': 37, 'Semicolon': 38,
        'Quote': 39, 'Enter': 40,
        'KeyZ': 41, 'KeyX': 42, 'KeyC': 43, 'KeyV': 44, 'KeyB': 45, 'KeyN': 46,
        'KeyM': 47, 'Comma': 48, 'Period': 49, 'Slash': 50,
        'Insert': 51, 'Home': 52, 'PageUp': 53, 'Delete': 54, 'End': 55, 'PageDown': 56,
        'ArrowLeft': 57, 'ArrowUp': 58, 'ArrowRight': 59, 'ArrowDown': 60,
        'F1': 61, 'F2': 62, 'F3': 63, 'F4': 64, 'F5': 65, 'F6': 66,
        'F7': 67, 'F8': 68, 'F9': 69, 'F10': 70, 'F11': 71, 'F12': 72,
        // 小键盘作为右手简谱区: 只触发白键, 与字母/主键区数字区分开。
        'Numpad1': 60, 'Numpad2': 62, 'Numpad3': 64, 'Numpad4': 65, 'Numpad5': 67,
        'Numpad6': 69, 'Numpad7': 71, 'Numpad8': 72, 'Numpad9': 74, 'Numpad0': 76,
        'NumpadDecimal': 77, 'NumpadDivide': 79, 'NumpadMultiply': 81,
        'NumpadSubtract': 83, 'NumpadAdd': 84, 'NumpadEnter': 86
    };

    var KEYBOARD_CODE_LABELS = {
        Backquote: '`', Minus: '-', Equal: '=', Backspace: 'Bk',
        Tab: 'Tab', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
        CapsLock: 'Caps', Semicolon: ';', Quote: "'", Enter: 'Ent',
        Comma: ',', Period: '.', Slash: '/',
        Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End',
        PageUp: 'PgUp', PageDown: 'PgDn', ArrowLeft: '←', ArrowUp: '↑',
        ArrowRight: '→', ArrowDown: '↓',
        Numpad0: 'Num0', Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3',
        Numpad4: 'Num4', Numpad5: 'Num5', Numpad6: 'Num6', Numpad7: 'Num7',
        Numpad8: 'Num8', Numpad9: 'Num9', NumpadDecimal: 'Num.',
        NumpadDivide: 'Num/', NumpadMultiply: 'Num*', NumpadSubtract: 'Num-',
        NumpadAdd: 'Num+', NumpadEnter: 'Num↵'
    };

    KEYBOARD_PIANO_MAP = {
        'KeyZ': 36, 'KeyS': 37, 'KeyX': 38, 'KeyD': 39, 'KeyC': 40, 'KeyV': 41,
        'KeyG': 42, 'KeyB': 43, 'KeyH': 44, 'KeyN': 45, 'KeyJ': 46, 'KeyM': 47,
        'KeyQ': 48, 'Digit2': 49, 'KeyW': 50, 'Digit3': 51, 'KeyE': 52, 'KeyR': 53,
        'Digit5': 54, 'KeyT': 55, 'Digit6': 56, 'KeyY': 57, 'Digit7': 58, 'KeyU': 59,
        'KeyI': 60, 'Digit9': 61, 'KeyO': 62, 'Digit0': 63, 'KeyP': 64,
        'BracketLeft': 65, 'Equal': 66, 'BracketRight': 67,
        // Numpad is an extra right-hand white-key layout; it does not change the original mapping.
        'Numpad1': 60, 'Numpad2': 62, 'Numpad3': 64, 'Numpad4': 65, 'Numpad5': 67,
        'Numpad6': 69, 'Numpad7': 71, 'Numpad8': 72, 'Numpad9': 74, 'Numpad0': 76,
        'NumpadDecimal': 77, 'NumpadDivide': 79, 'NumpadMultiply': 81,
        'NumpadSubtract': 83, 'NumpadAdd': 84, 'NumpadEnter': 86
    };

    KEYBOARD_CODE_LABELS.NumpadEnter = 'NumEnter';

    function clampNbsKey(key) {
        return Math.max(0, Math.min(87, key));
    }

    function isNumpadCode(code) {
        return code && code.indexOf('Numpad') === 0;
    }

    function getShiftedKeyboardPianoKey(code) {
        var key = KEYBOARD_PIANO_MAP[code];
        if (key === undefined) return undefined;
        if (isNumpadCode(code)) {
            key += state.numpadOctaveShift * 12 + state.numpadSemitoneShift;
        } else {
            key += state.letterOctaveShift * 12 + state.letterSemitoneShift;
        }
        return clampNbsKey(key);
    }

    function loadNumpadRangeSettings() {
        try {
            var saved = JSON.parse(localStorage.getItem('webnbs:numpad-range') || '{}');
            state.numpadOctaveShift = parseInt(saved.octaveShift, 10) || 0;
            state.numpadSemitoneShift = parseInt(saved.semitoneShift, 10) || 0;
        } catch (e) {
            state.numpadOctaveShift = 0;
            state.numpadSemitoneShift = 0;
        }
        try {
            var savedLetter = JSON.parse(localStorage.getItem('webnbs:letter-range') || '{}');
            state.letterOctaveShift = parseInt(savedLetter.octaveShift, 10) || 0;
            state.letterSemitoneShift = parseInt(savedLetter.semitoneShift, 10) || 0;
        } catch (e) {
            state.letterOctaveShift = 0;
            state.letterSemitoneShift = 0;
        }
    }

    function saveNumpadRangeSettings() {
        try {
            localStorage.setItem('webnbs:numpad-range', JSON.stringify({
                octaveShift: state.numpadOctaveShift,
                semitoneShift: state.numpadSemitoneShift
            }));
        } catch (e) {}
        try {
            localStorage.setItem('webnbs:letter-range', JSON.stringify({
                octaveShift: state.letterOctaveShift,
                semitoneShift: state.letterSemitoneShift
            }));
        } catch (e) {}
    }

    function getKeyboardLabelForNbsKey(nbsKey) {
        var codes = Object.keys(KEYBOARD_PIANO_MAP);
        var labels = [];
        for (var i = 0; i < codes.length; i++) {
            if (getShiftedKeyboardPianoKey(codes[i]) === nbsKey) {
                var code = codes[i];
                labels.push(KEYBOARD_CODE_LABELS[code] || code.replace('Key', '').replace('Digit', ''));
                if (labels.length >= 2) break;
            }
        }
        return labels.join('/');
    }

    function getPianoKeyFromKeyboardEvent(e) {
        return getShiftedKeyboardPianoKey(e.code);
    }

    function isEditableTarget(target) {
        return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    }

    function isAllowedPianoEditShortcut(e) {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
        var k = (e.key || '').toLowerCase();
        return k === 'a' || k === 'c' || k === 'v' || k === 'z';
    }

    // 统一格式化错误对象，避免 alert 出现 [object Object]
    function formatError(err, fallback) {
        fallback = fallback || '操作失败';
        if (!err) return fallback;
        if (typeof err === 'string') return err;
        if (err instanceof Error) return err.message || fallback;
        if (err.message && typeof err.message === 'string') return err.message;
        if (err.detail && typeof err.detail === 'string') return err.detail;
        if (err.error && typeof err.error === 'string') return err.error;
        try {
            var json = JSON.stringify(err);
            if (json && json !== '{}') return json;
        } catch (e) {}
        return fallback;
    }

    // ============ 自定义弹窗系统（替代 alert/confirm/prompt） ============
    // 全局唯一活动弹窗栈，支持嵌套
    var _appDialogStack = [];

    function _appDialogOverlay() {
        var ov = document.createElement('div');
        ov.className = 'app-dialog-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.15s ease;';
        return ov;
    }

    function _appDialogBox(title, message, icon, options) {
        options = options || {};
        var box = document.createElement('div');
        box.className = 'app-dialog-box popup-content';
        box.style.cssText = 'max-width:' + (options.maxWidth || 400) + 'px;width:100%;background:var(--bg-secondary, #2a2a2a);border:1px solid var(--ctrl-stroke-default, #444);border-radius:var(--radius-md, 10px);box-shadow:0 8px 32px rgba(0,0,0,0.6);animation:scaleIn 0.18s ease;overflow:hidden;';
        var iconHtml = icon ? '<i class="' + icon + '"></i>' : '';
        var titleHtml = title ? '<h4 style="margin:0;font-size:14px;color:var(--text-primary,#fff);font-weight:600;flex:1;">' + title + '</h4>' : '';
        box.innerHTML =
            '<div class="settings-header" style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--ctrl-stroke-default,#444);">'
            + iconHtml + titleHtml
            + '<button class="settings-close-btn" id="app-dialog-x" style="background:none;border:none;color:var(--text-secondary,#aaa);font-size:18px;cursor:pointer;padding:0 4px;line-height:1;">&times;</button>'
            + '</div>'
            + '<div class="settings-body" style="padding:16px;font-size:13px;color:var(--text-primary,#fff);line-height:1.6;white-space:pre-line;">' + message + '</div>'
            + '<div class="popup-actions" style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--ctrl-stroke-default,#444);justify-content:flex-end;"></div>';
        return box;
    }

    function _appDialogBtn(text, primary) {
        var b = document.createElement('button');
        b.className = 'popup-btn ' + (primary ? 'popup-btn-primary' : 'popup-btn-cancel');
        b.textContent = text;
        b.style.cssText = 'min-width:72px;padding:6px 14px;font-size:13px;border-radius:var(--radius-sm,6px);cursor:pointer;border:1px solid var(--ctrl-stroke-default,#444);background:' + (primary ? 'var(--accent,#4c9aff)' : 'var(--ctrl-fill-default,#3a3a3a)') + ';color:' + (primary ? '#fff' : 'var(--text-primary,#fff)') + ';';
        return b;
    }

    function _closeAppDialog(overlay, resolve, value) {
        var idx = _appDialogStack.indexOf(overlay);
        if (idx >= 0) _appDialogStack.splice(idx, 1);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (resolve) resolve(value);
    }

    // showAppAlert(message, options) -> Promise<void>
    // options: { title, icon, okText }
    function showAppAlert(message, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '提示'), i18nText(message), options.icon || 'fa-solid fa-circle-info', options);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var close = function() { _closeAppDialog(overlay, resolve); };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '确定'), true);
            okBtn.addEventListener('click', close);
            box.querySelector('.popup-actions').appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { okBtn.focus(); }, 50);
        });
    }

    // showAppConfirm(message, options) -> Promise<boolean>
    // options: { title, icon, okText, cancelText }
    function showAppConfirm(message, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '确认'), i18nText(message), options.icon || 'fa-solid fa-circle-question', options);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var result = false;
            var close = function() { _closeAppDialog(overlay, resolve, result); };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            var cancelBtn = _appDialogBtn(i18nText(options.cancelText || '取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '确定'), true);
            okBtn.addEventListener('click', function() { result = true; close(); });
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { okBtn.focus(); }, 50);
        });
    }

    // showAppPrompt(message, defaultValue, options) -> Promise<string|null>
    // options: { title, icon, okText, cancelText, placeholder }
    function showAppPrompt(message, defaultValue, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '输入'), i18nText(message), options.icon || 'fa-solid fa-keyboard', options);
            // 在 body 中追加输入框
            var body = box.querySelector('.settings-body');
            var input = document.createElement('input');
            input.type = 'text';
            input.value = defaultValue || '';
            input.placeholder = i18nText(options.placeholder || '');
            input.style.cssText = 'width:100%;margin-top:8px;padding:8px 10px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';
            body.appendChild(input);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var result = null;
            var close = function() { _closeAppDialog(overlay, resolve, result); };
            var submit = function() { result = input.value; close(); };
            box.querySelector('#app-dialog-x').addEventListener('click', close);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { close(); }
            });
            var cancelBtn = _appDialogBtn(i18nText(options.cancelText || '取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '确定'), true);
            okBtn.addEventListener('click', submit);
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { input.focus(); input.select(); }, 50);
        });
    }

    // showExportDialog(defaultName, defaultAuthor, defaultDesc, options) -> Promise<{name, author, description}|null>
    // 导出弹窗: 文件名(必填) + 折叠的作者/介绍输入
    function showExportDialog(defaultName, defaultAuthor, defaultDesc, options) {
        options = options || {};
        return new Promise(function(resolve) {
            var overlay = _appDialogOverlay();
            var box = _appDialogBox(i18nText(options.title || '导出 NBS'), '', options.icon || 'fa-solid fa-file-export', { maxWidth: 420 });
            var body = box.querySelector('.settings-body');
            // 清空默认 message 内容
            body.textContent = '';

            // 文件名输入
            var nameLabel = document.createElement('label');
            nameLabel.textContent = i18nText('文件名:');
            nameLabel.style.cssText = 'display:block;font-size:13px;color:var(--text-primary,#fff);margin-bottom:6px;font-weight:500;';
            body.appendChild(nameLabel);

            var nameInputWrap = document.createElement('div');
            nameInputWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
            var nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = defaultName || '';
            nameInput.placeholder = i18nText('请输入文件名');
            nameInput.style.cssText = 'flex:1;padding:8px 10px;font-size:13px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;';
            var extSpan = document.createElement('span');
            extSpan.textContent = '.nbs';
            extSpan.style.cssText = 'font-size:12px;color:var(--text-tertiary,#888);flex-shrink:0;';
            nameInputWrap.appendChild(nameInput);
            nameInputWrap.appendChild(extSpan);
            body.appendChild(nameInputWrap);

            // 折叠栏: 作者和介绍
            var collapseWrap = document.createElement('div');
            collapseWrap.style.cssText = 'margin-top:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);overflow:hidden;';
            var collapseHeader = document.createElement('div');
            collapseHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;background:var(--ctrl-fill-default,#1c1c1c);user-select:none;font-size:12px;color:var(--text-secondary,#aaa);';
            collapseHeader.innerHTML = '<span><i class="fa-solid fa-chevron-right" style="margin-right:6px;transition:transform 0.15s;font-size:10px;"></i>' + i18nText('作者和介绍 (可选)') + '</span>';
            var collapseBody = document.createElement('div');
            collapseBody.style.cssText = 'padding:10px 12px;display:none;border-top:1px solid var(--ctrl-stroke-default,#444);';
            collapseWrap.appendChild(collapseHeader);
            collapseWrap.appendChild(collapseBody);
            body.appendChild(collapseWrap);

            var collapsed = true;
            var chevron = collapseHeader.querySelector('i');
            collapseHeader.addEventListener('click', function(e) {
                e.stopPropagation();
                collapsed = !collapsed;
                collapseBody.style.display = collapsed ? 'none' : 'block';
                chevron.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(90deg)';
            });

            // 作者输入
            var authorLabel = document.createElement('label');
            authorLabel.textContent = i18nText('作者:');
            authorLabel.style.cssText = 'display:block;font-size:12px;color:var(--text-primary,#fff);margin-bottom:4px;';
            collapseBody.appendChild(authorLabel);
            var authorInput = document.createElement('input');
            authorInput.type = 'text';
            authorInput.value = defaultAuthor || '';
            authorInput.placeholder = i18nText('作者名 (可选)');
            authorInput.style.cssText = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;margin-bottom:10px;';
            collapseBody.appendChild(authorInput);

            // 介绍输入
            var descLabel = document.createElement('label');
            descLabel.textContent = i18nText('介绍:');
            descLabel.style.cssText = 'display:block;font-size:12px;color:var(--text-primary,#fff);margin-bottom:4px;';
            collapseBody.appendChild(descLabel);
            var descInput = document.createElement('textarea');
            descInput.value = defaultDesc || '';
            descInput.placeholder = i18nText('歌曲介绍 (可选)');
            descInput.rows = 3;
            descInput.style.cssText = 'width:100%;padding:6px 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default,#444);border-radius:var(--radius-sm,6px);background:var(--ctrl-fill-default,#1c1c1c);color:var(--text-primary,#fff);box-sizing:border-box;resize:vertical;font-family:inherit;';
            collapseBody.appendChild(descInput);

            overlay.appendChild(box);
            document.body.appendChild(overlay);
            _appDialogStack.push(overlay);

            var result = null;
            var close = function() { _closeAppDialog(overlay, resolve, result); };
            var submit = function() {
                var name = (nameInput.value || '').trim();
                if (!name) {
                    nameInput.style.borderColor = 'var(--accent-orange,#ff8c42)';
                    nameInput.focus();
                    return;
                }
                // 移除末尾的 .nbs 后缀 (保存时会自动添加)
                if (name.toLowerCase().endsWith('.nbs')) {
                    name = name.slice(0, -4);
                }
                result = {
                    name: name,
                    author: (authorInput.value || '').trim(),
                    description: (descInput.value || '').trim()
                };
                close();
            };

            box.querySelector('#app-dialog-x').addEventListener('click', close);
            nameInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
                if (e.key === 'Escape') { close(); }
            });
            var cancelBtn = _appDialogBtn(i18nText(options.cancelText || '取消'), false);
            cancelBtn.addEventListener('click', close);
            var okBtn = _appDialogBtn(i18nText(options.okText || '导出'), true);
            okBtn.addEventListener('click', submit);
            var actions = box.querySelector('.popup-actions');
            actions.appendChild(cancelBtn);
            actions.appendChild(okBtn);
            overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
            setTimeout(function() { nameInput.focus(); nameInput.select(); }, 50);
        });
    }

    // 暴露到全局，供 fls_playlist.js / fls_track_panel.js 等外部模块使用
    window.showAppAlert = showAppAlert;
    window.showAppConfirm = showAppConfirm;
    window.showAppPrompt = showAppPrompt;
    window.showExportDialog = showExportDialog;

    // ============ 工具函数 ============
    function deepCloneNotes(notes) {
        return notes.map(function(n) {
            return {
                id: n.id, tick: n.tick, layer: n.layer, instrument: n.instrument,
                key: n.key, velocity: n.velocity, pan: n.pan, pitch: n.pitch
            };
        });
    }

    function takeSnapshot() {
        return {
            notes: deepCloneNotes(state.notes),
            tracks: JSON.parse(JSON.stringify(state.tracks || [])),
            layers: JSON.parse(JSON.stringify((state.song && state.song.layers) ? state.song.layers : [])),
            tempo: state.tempo,
            maxTick: state.maxTick
        };
    }

    function restoreSnapshot(snapshot) {
        state.notes = deepCloneNotes(snapshot.notes || []);
        state.tracks = JSON.parse(JSON.stringify(snapshot.tracks || []));
        if (!state.song) state.song = {};
        state.song.layers = JSON.parse(JSON.stringify(snapshot.layers || []));
        state.tempo = snapshot.tempo;
        state.maxTick = snapshot.maxTick;
        rebuildFromNotes();
        updateTrackPanelUI();
    }

    function pushUndo() {
        // 保存完整状态快照 (音符 + 轨道 + 层 + tempo)
        state.undoStack.push(takeSnapshot());
        if (state.undoStack.length > state.maxUndo) {
            state.undoStack.shift();
        }
        state.redoStack = [];
        updateUndoRedoButtons();
    }

    function performUndo() {
        if (state.undoStack.length === 0) return;
        // 保存当前状态到 redo
        state.redoStack.push(takeSnapshot());
        // 恢复 undo 状态
        var prev = state.undoStack.pop();
        restoreSnapshot(prev);
        markDirty();
        updateUndoRedoButtons();
    }

    function performRedo() {
        if (state.redoStack.length === 0) return;
        // 保存到 undo
        state.undoStack.push(takeSnapshot());
        // 恢复 redo 状态
        var next = state.redoStack.pop();
        restoreSnapshot(next);
        markDirty();
        updateUndoRedoButtons();
    }

    function updateUndoRedoButtons() {
        var undoBtn = $('btn-undo');
        var redoBtn = $('btn-redo');
        if (undoBtn) {
            if (state.undoStack.length === 0) {
                undoBtn.classList.add('disabled');
                undoBtn.disabled = true;
            } else {
                undoBtn.classList.remove('disabled');
                undoBtn.disabled = false;
            }
        }
        if (redoBtn) {
            if (state.redoStack.length === 0) {
                redoBtn.classList.add('disabled');
                redoBtn.disabled = true;
            } else {
                redoBtn.classList.remove('disabled');
                redoBtn.disabled = false;
            }
        }
    }

    function rebuildFromNotes() {
        if (state.pianoRoll) {
            state.pianoRoll.setNotes(state.notes);
        }
        buildNoteIndex(state.notes);
        updateNoteCount();
        updateProgressUI();
    }

    // ============ 音符索引 ============
    function buildNoteIndex(notes) {
        var idx = new Map();
        var max = 0;
        if (notes) {
            for (var i = 0; i < notes.length; i++) {
                var n = notes[i];
                if (!n || typeof n.tick !== 'number') continue;
                var tick = Math.floor(n.tick);
                if (tick > max) max = tick;
                if (!idx.has(tick)) idx.set(tick, []);
                idx.get(tick).push(n);
            }
        }
        state.noteIndex = idx;
        state.maxTick = max;
    }

    // 增量更新音符索引（避免全量 buildNoteIndex 重建，提升录制性能）
    function addNoteToIndex(note) {
        if (!note || typeof note.tick !== 'number') return;
        if (!state.noteIndex) state.noteIndex = new Map();
        var tick = Math.floor(note.tick);
        if (!state.noteIndex.has(tick)) state.noteIndex.set(tick, []);
        state.noteIndex.get(tick).push(note);
        if (tick > state.maxTick) state.maxTick = tick;
    }

    function removeNoteFromIndex(note) {
        if (!note || typeof note.tick !== 'number') return;
        if (!state.noteIndex) return;
        var tick = Math.floor(note.tick);
        var arr = state.noteIndex.get(tick);
        if (!arr) return;
        for (var i = arr.length - 1; i >= 0; i--) {
            if (arr[i].id === note.id) { arr.splice(i, 1); break; }
        }
        if (arr.length === 0) state.noteIndex.delete(tick);
    }

    // 节流 DOM 更新：录制时高频按键合并为一次 RAF 更新
    var _perfUIUpdatePending = false;
    function schedulePerformanceUIUpdate() {
        if (_perfUIUpdatePending) return;
        _perfUIUpdatePending = true;
        requestAnimationFrame(function() {
            _perfUIUpdatePending = false;
            // 直接更新音符计数文本（避免 updateNoteCount 内部再次调用 updateTrackPanelUI 导致双重刷新）
            $setText('note-count', '音符: ' + state.notes.length);
            updateTrackPanelUI();
            updateProgressUI();
            markDirty();
        });
    }

    function createDefaultLayers(count) {
        count = count || 8;
        var layers = [];
        for (var i = 0; i < count; i++) {
            layers.push({ name: 'Layer ' + (i + 1), volume: 100, stereo: 100, lock: 0 });
        }
        return layers;
    }

    function resetToNewFile(markAsDirty) {
        state.notes = [];
        state.tempo = 20;
        state.currentTick = 0;
        state.maxTick = 0;
        state.isPlaying = false;
        state.currentInstrument = 0;
        state.selectedPianoKey = 39;
        state.importedFileName = '';
        state.currentFileId = null;
        state.song = {
            name: 'Untitled',
            song_name: 'Untitled',
            author: '',
            original_author: '',
            description: '',
            tempo: 20,
            notes: state.notes,
            layers: createDefaultLayers(8)
        };
        state.tracks = [];
        state.undoStack = [];
        state.redoStack = [];
        buildNoteIndex(state.notes);
        updateUndoRedoButtons();
        if (state.pianoRoll) {
            state.pianoRoll.clearSelection();
            state.pianoRoll.trackInfo = {};
            state.pianoRoll.trackCount = state.song.layers.length;
            state.pianoRoll.setNotes(state.notes);
            state.pianoRoll.setInstrument(state.currentInstrument);
            state.pianoRoll.scrollX = 0;
            state.pianoRoll.scrollY = 0;
            state.pianoRoll.playheadTick = 0;
            state.pianoRoll.currentTick = 0;
            state.pianoRoll.setSelectedKey(39);
            if (state.pianoRoll.clearPlayHighlights) state.pianoRoll.clearPlayHighlights();
            state.pianoRoll.render();
        }
        $setValue('tempo-slider', state.tempo);
        $setValue('tempo-value', state.tempo);
        $setValue('fls-tempo-input', Math.round(state.tempo));
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
        $setValue('settings-tempo-input', state.tempo);
        $setText('settings-tempo-value', state.tempo.toFixed(1));
        updateSongInfo();
        updateTrackPanelUI();
        updateInstrumentSelectorUI();
        updateNoteCount();
        updateProgressUI();
        handleStop();
        updatePianoKeyboardHighlight();
        if (markAsDirty) markDirty();
        else _dirty = false;
    }

    function createNewFile() {
        var proceed = function() {
            clearAutoSaveLocal();
            resetToNewFile(true);
        };
        if (_dirty || (state.notes && state.notes.length > 0)) {
            showAppConfirm('当前编辑内容会被清空，是否新建空文件？', {
                title: '新建文件',
                icon: 'fa-solid fa-file-circle-plus'
            }).then(function(ok) {
                if (ok) proceed();
            });
        } else {
            proceed();
        }
    }

    function getNotesAtTick(tick) {
        if (!state.noteIndex) return [];
        return state.noteIndex.get(tick) || [];
    }

    // ============ 初始化 ============
    function init() {
        loadNumpadRangeSettings();
        if (window.WebNBSI18n) window.WebNBSI18n.init();
        document.addEventListener('webnbs:languagechange', function() {
            updateInstrumentSelectorUI();
            updatePianoKeyboardHighlight();
            if ($('file-menu')) showFileMenu();
            if (state.pianoRoll && state.pianoRoll.render) state.pianoRoll.render();
        });
        // 创建 DOM 元素
        createContextMenuDOM();
        createInstrumentSelectorDOM();
        createPianoKeyboardDOM();
        createTrackPanelDOM();
        createLandscapeDrawerDOM();
        initPrivacyPopup();

        // 初始化钢琴卷帘
        initPianoRoll();
        // 初始化底部浮动操作按钮
        createMobileFabBar();
        // 初始化功能菜单
        createFunctionsMenu();
        // 初始化外部 MIDI 数据粘贴
        initClipboardPaste();
        initExternalClipboardPaste();
        // 初始化 MIDI 轨道播放器
        initMidiTrackPlayer();

        // 文件操作 (btn-open 已移入文件菜单)
        $('btn-file').addEventListener('click', function(e) {
            e.stopPropagation();
            var menu = document.getElementById('file-menu');
            if (menu) {
                hideFileMenu();
            } else {
                showFileMenu();
            }
        });
        $('file-input').addEventListener('change', handleFileOpen);

        // 撤销重做
        $('btn-undo').addEventListener('click', performUndo);
        $('btn-redo').addEventListener('click', performRedo);

        // 播放控制 (现在在状态栏)
        var playBtn = $('btn-play');
        if (playBtn) playBtn.addEventListener('click', handlePlayToggle);
        var performanceRecordBtn = $('btn-performance-record');
        if (performanceRecordBtn) {
            performanceRecordBtn.addEventListener('click', function(e) {
                e.preventDefault();
                togglePerformanceRecording();
            });
        }
        var stopBtn = $('btn-stop');
        if (stopBtn) stopBtn.addEventListener('click', handleStop);

        var tempoSlider = $('tempo-slider');
        if (tempoSlider) {
            tempoSlider.addEventListener('mousedown', function(e) {
                pushUndo(); // 开始拖拽时记录快照, 避免每次 input 事件都创建 undo
            });
            tempoSlider.addEventListener('input', function(e) {
                state.tempo = parseFloat(e.target.value);
                $('tempo-value').value = state.tempo;
                $setValue('fls-tempo-input', Math.round(state.tempo));
                markDirty();
                if (state.isPlaying) restartPlayback();
            });
        }

        // 工具栏"调节速度"按钮已删除, 仅保留输入框

        // 键盘钢琴开关
        var btnKeyboardPiano = $('btn-keyboard-piano');
        if (btnKeyboardPiano) {
            btnKeyboardPiano.setAttribute('title', '钢琴键盘');
            btnKeyboardPiano.addEventListener('click', function() {
                state.keyboardPianoEnabled = !state.keyboardPianoEnabled;
                this.classList.toggle('active', state.keyboardPianoEnabled);
                if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                    state.pianoRoll.setShowKeyLabels(state.keyboardPianoEnabled);
                }
                if (state.keyboardPianoEnabled) {
                    openPianoKeyboard();
                }
                updatePianoKeyboardHighlight();
            });
        }

        // tempo-value 数字输入框
        var tempoValueInput = $('tempo-value');
        if (tempoValueInput) {
            tempoValueInput.addEventListener('focus', function(e) {
                pushUndo(); // 聚焦时记录快照, 避免每次 keystroke 都创建 undo
            });
            tempoValueInput.addEventListener('input', function(e) {
                var val = parseFloat(e.target.value);
                if (isNaN(val)) return;
                val = Math.max(0, Math.min(512, val));
                val = Math.round(val * 100) / 100;
                state.tempo = val;
                $setValue('fls-tempo-input', Math.round(val));
                markDirty();
                if (state.isPlaying) restartPlayback();
            });
            tempoValueInput.addEventListener('blur', function(e) {
                var val = parseFloat(e.target.value);
                if (isNaN(val)) val = state.tempo;
                val = Math.max(0, Math.min(512, val));
                val = Math.round(val * 100) / 100;
                e.target.value = val;
            });
            tempoValueInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });
        }

        // 设置弹窗关闭按钮
        var settingsCloseBtn = $('settings-close-btn');
        if (settingsCloseBtn) {
            settingsCloseBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeSettingsDialog();
            });
        }

        // 速度弹窗关闭按钮
        var tempoCloseBtn = $('tempo-close-btn');
        if (tempoCloseBtn) {
            tempoCloseBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeTempoDialog();
            });
        }

        // 设置按钮 (工具栏)
        var btnSettings = $('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', function(e) {
                e.stopPropagation();
                var popup = $('settings-popup');
                if (!popup) return;
                if (popup.classList.contains('active')) {
                    closeSettingsDialog();
                } else {
                    openSettingsDialog();
                }
            });
        }

        // 设置弹窗中的"关于"按钮 (移动端)
        var settingsAboutBtn = $('settings-about-btn');
        if (settingsAboutBtn) {
            settingsAboutBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                closeSettingsDialog();
                var aboutPopup = $('about-popup');
                if (aboutPopup) {
                    aboutPopup.style.display = 'flex';
                    aboutPopup.classList.add('active');
                }
            });
        }

        // 平滑翻页开关 (在设置弹窗里)
        var smoothScrollChk = $('settings-smooth-scroll');
        if (smoothScrollChk) {
            smoothScrollChk.addEventListener('change', function(e) {
                e.stopPropagation();
                state.smoothScroll = this.checked;
                if (state.pianoRoll) {
                    state.pianoRoll.smoothScrollEnabled = state.smoothScroll;
                }
                markDirty();
            });
        }

        // 音效优化开关
        var audioEnhanceChk = $('settings-audio-enhance');
        if (audioEnhanceChk) {
            audioEnhanceChk.addEventListener('change', function(e) {
                e.stopPropagation();
                if (window.AudioEngine && AudioEngine.setEnhance) {
                    AudioEngine.setEnhance(this.checked);
                }
            });
        }

        // 音符播放高亮动画开关
        var highlightChk = $('settings-highlight-animation');
        if (highlightChk) {
            // 从 localStorage 恢复设置
            try {
                var saved = localStorage.getItem('highlight_animation');
                if (saved !== null) highlightChk.checked = (saved === '1');
            } catch(e) {}
            state.highlightAnimationEnabled = highlightChk.checked;
            highlightChk.addEventListener('change', function() {
                state.highlightAnimationEnabled = this.checked;
                try { localStorage.setItem('highlight_animation', this.checked ? '1' : '0'); } catch(e) {}
            });
        }

        // 录制时音符动画开关 (默认关闭, 提升录制性能)
        var recAnimChk = $('settings-recording-animation');
        if (recAnimChk) {
            try {
                var savedRecAnim = localStorage.getItem('recording_animation');
                // 默认关闭: 如果没有保存过设置, 则 checked = false
                recAnimChk.checked = (savedRecAnim === '1');
            } catch(e) { recAnimChk.checked = false; }
            state.recordingAnimationEnabled = recAnimChk.checked;
            recAnimChk.addEventListener('change', function() {
                state.recordingAnimationEnabled = this.checked;
                try { localStorage.setItem('recording_animation', this.checked ? '1' : '0'); } catch(e) {}
            });
        }

        // NBS 导出版本选择
        var nbsVersionSel = $('settings-nbs-version');
        if (nbsVersionSel) {
            try {
                var savedVer = localStorage.getItem('nbs_export_version');
                if (savedVer !== null) {
                    nbsVersionSel.value = savedVer;
                    window.NBS_EXPORT_VERSION = parseInt(savedVer) || 5;
                }
            } catch(e) {}
            nbsVersionSel.addEventListener('change', function() {
                var v = parseInt(this.value) || 5;
                window.NBS_EXPORT_VERSION = v;
                try { localStorage.setItem('nbs_export_version', String(v)); } catch(e) {}
            });
        }

        // 音量透明度开关
        var volOpacityChk = $('settings-volume-opacity');
        if (volOpacityChk) {
            try {
                var savedVolOp = localStorage.getItem('volume_opacity');
                if (savedVolOp !== null) volOpacityChk.checked = (savedVolOp === '1');
            } catch(e) {}
            if (state.pianoRoll) state.pianoRoll.setVolumeOpacityEnabled(volOpacityChk.checked);
            volOpacityChk.addEventListener('change', function() {
                if (state.pianoRoll) state.pianoRoll.setVolumeOpacityEnabled(this.checked);
                try { localStorage.setItem('volume_opacity', this.checked ? '1' : '0'); } catch(e) {}
            });
        }

        // ============ 个性化: 网页背景图片层 (重构版) ============
        var bgLayer = $('page-bg');
        var panelOpacitySlider = $('settings-panel-opacity');

        // ---- 背景图持久化: IndexedDB (支持大图, 替代 localStorage) ----
        var BG_DB = 'webnbs_bg';
        function _bgOpenDb() {
            return new Promise(function(resolve, reject) {
                var req = indexedDB.open(BG_DB, 1);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
                };
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        }
        function _bgGetImage() {
            return _bgOpenDb().then(function(db) {
                return new Promise(function(resolve) {
                    var tx = db.transaction(['kv'], 'readonly');
                    var req = tx.objectStore('kv').get('image');
                    req.onsuccess = function() { resolve(req.result || null); };
                    req.onerror = function() { resolve(null); };
                });
            }).catch(function() { return null; });
        }
        function _bgPutImage(dataUrl) {
            return _bgOpenDb().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction(['kv'], 'readwrite');
                    tx.objectStore('kv').put(dataUrl, 'image');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function(e) { reject(e.target.error); };
                });
            });
        }
        function _bgClearImage() {
            return _bgOpenDb().then(function(db) {
                return new Promise(function(resolve) {
                    var tx = db.transaction(['kv'], 'readwrite');
                    tx.objectStore('kv').delete('image');
                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { resolve(); };
                });
            }).catch(function() {});
        }

        // 同步面板透明度 (仅当背景图激活时生效, 否则面板完全不透明)
        function syncPanelAlpha() {
            var bgActive = document.body.classList.contains('bg-active');
            var v = panelOpacitySlider ? (parseInt(panelOpacitySlider.value) || 0) : 0;
            // 面板底色 alpha: 无背景=1.0 完全不透明; 有背景时 0%=1.0, 100%=0.3
            var alpha = bgActive ? (1.0 - (v / 100) * 0.7) : 1.0;
            document.documentElement.style.setProperty('--surface-bg-alpha', alpha.toFixed(3));
            if (state.pianoRoll) state.pianoRoll.setPanelAlpha(alpha);
            var pv = $('settings-panel-opacity-value');
            if (pv) pv.textContent = v + '%';
        }

        // 应用背景图片到全网页层 (覆盖整个网页)
        function applyPageBgImage(dataUrl) {
            if (!bgLayer) return;
            if (!dataUrl) {
                bgLayer.style.backgroundImage = '';
                document.body.classList.remove('bg-active');
            } else {
                bgLayer.style.backgroundImage = 'url(' + dataUrl + ')';
                document.body.classList.add('bg-active');
            }
            syncPanelAlpha();
        }

        // 背景模式 (平铺/拉伸/缩放), 通过 body class 控制, 避免内联样式互相覆盖
        function applyPageBgMode(mode) {
            document.body.classList.remove('bg-mode-tile', 'bg-mode-stretch', 'bg-mode-fit');
            if (mode === 'stretch' || mode === 'fit' || mode === 'tile') {
                document.body.classList.add('bg-mode-' + mode);
            }
        }

        // 背景图片不透明度: 0%=不透明(可见), 100%=完全透明(隐藏), 通过 CSS 变量控制
        function applyBgOpacity(v) {
            var opacity = Math.max(0, Math.min(100, parseInt(v) || 0));
            document.documentElement.style.setProperty('--bg-image-opacity', ((100 - opacity) / 100).toFixed(3));
            var valEl = $('settings-bg-opacity-value');
            if (valEl) valEl.textContent = opacity + '%';
            return opacity;
        }

        // 显示已选择背景图片的文件名 (标记"确实选择了图片", 刷新后依然显示)
        function updateBgFilename(name) {
            var el = $('settings-bg-filename');
            if (el) el.textContent = name ? ('已选择: ' + name) : '';
        }

        // 背景图片选择
        var bgImageInput = $('settings-bg-image');
        if (bgImageInput) {
            bgImageInput.addEventListener('change', function(e) {
                var file = e.target.files && e.target.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function(ev) {
                    var dataUrl = ev.target.result;
                    applyPageBgImage(dataUrl);
                    _bgPutImage(dataUrl).catch(function() {}); // 大图也能可靠持久化
                    var modeSel = $('settings-bg-mode');
                    if (modeSel) applyPageBgMode(modeSel.value);
                    // 记住文件名, 刷新后仍显示 (标记已选择图片)
                    updateBgFilename(file.name);
                    try { localStorage.setItem('bg_filename', file.name); } catch(err) {}
                };
                reader.readAsDataURL(file);
            });
        }

        // 清除背景图片
        var bgClearBtn = $('settings-bg-clear');
        if (bgClearBtn) {
            bgClearBtn.addEventListener('click', function() {
                applyPageBgImage(null);
                _bgClearImage();
                if (bgImageInput) bgImageInput.value = '';
                updateBgFilename('');
                try { localStorage.removeItem('bg_filename'); } catch(err) {}
            });
        }

        // 背景图片透明度滑块 (0-100, 0=不透明, 100=完全透明)
        var bgOpacitySlider = $('settings-bg-opacity');
        if (bgOpacitySlider) {
            try {
                var savedBgOp = localStorage.getItem('bg_opacity');
                if (savedBgOp !== null) {
                    var bop = parseInt(savedBgOp);
                    if (!isNaN(bop)) bgOpacitySlider.value = bop;
                }
            } catch(e) {}
            applyBgOpacity(bgOpacitySlider.value);
            bgOpacitySlider.addEventListener('input', function() {
                applyBgOpacity(this.value);
            });
            bgOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('bg_opacity', this.value); } catch(e) {}
            });
        }

        // 背景图片模式选择
        var bgModeSelect = $('settings-bg-mode');
        if (bgModeSelect) {
            try {
                var savedBgMode = localStorage.getItem('bg_mode');
                if (savedBgMode && (savedBgMode === 'tile' || savedBgMode === 'stretch' || savedBgMode === 'fit')) {
                    bgModeSelect.value = savedBgMode;
                }
            } catch(e) {}
            applyPageBgMode(bgModeSelect.value);
            bgModeSelect.addEventListener('change', function() {
                applyPageBgMode(this.value);
                try { localStorage.setItem('bg_mode', this.value); } catch(e) {}
            });
        }

        // 表面材质选择 (普通半透明/毛玻璃/亚克力)
        var bgMaterialSelect = $('settings-bg-material');
        if (bgMaterialSelect) {
            function applyMaterial(mat) {
                document.body.classList.remove('material-plain', 'material-frosted', 'material-acrylic');
                if (mat === 'plain' || mat === 'frosted' || mat === 'acrylic') {
                    document.body.classList.add('material-' + mat);
                }
            }
            try {
                var savedMat = localStorage.getItem('bg_material');
                if (savedMat && (savedMat === 'plain' || savedMat === 'frosted' || savedMat === 'acrylic')) {
                    bgMaterialSelect.value = savedMat;
                }
            } catch(e) {}
            applyMaterial(bgMaterialSelect.value);
            bgMaterialSelect.addEventListener('change', function() {
                applyMaterial(this.value);
                try { localStorage.setItem('bg_material', this.value); } catch(e) {}
            });
        }

        // 网格材质选择 (独立于工具栏材质, 控制音符网格区域)
        var gridMaterialSelect = $('settings-grid-material');
        if (gridMaterialSelect) {
            function applyGridMaterial(mat) {
                document.body.classList.remove('grid-material-plain', 'grid-material-frosted', 'grid-material-acrylic');
                if (mat === 'plain' || mat === 'frosted' || mat === 'acrylic') {
                    document.body.classList.add('grid-material-' + mat);
                }
            }
            try {
                var savedGridMat = localStorage.getItem('grid_material');
                if (savedGridMat && (savedGridMat === 'plain' || savedGridMat === 'frosted' || savedGridMat === 'acrylic')) {
                    gridMaterialSelect.value = savedGridMat;
                }
            } catch(e) {}
            applyGridMaterial(gridMaterialSelect.value);
            gridMaterialSelect.addEventListener('change', function() {
                applyGridMaterial(this.value);
                try { localStorage.setItem('grid_material', this.value); } catch(e) {}
            });
        }

        // 面板透明度滑块 (0-100, 100=面板几乎透明露出背景, 0=不透明)
        if (panelOpacitySlider) {
            try {
                var savedPanelOp = localStorage.getItem('panel_opacity');
                if (savedPanelOp !== null) {
                    var pop = parseInt(savedPanelOp);
                    if (!isNaN(pop)) panelOpacitySlider.value = pop;
                }
            } catch(e) {}
            syncPanelAlpha();
            panelOpacitySlider.addEventListener('input', function() {
                syncPanelAlpha();
            });
            panelOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('panel_opacity', this.value); } catch(e) {}
            });
        }

        // 网格透明度滑块
        var gridOpacitySlider = $('settings-grid-opacity');
        var gridOpacityValue = $('settings-grid-opacity-value');
        if (gridOpacitySlider) {
            try {
                var savedGridOp = localStorage.getItem('grid_opacity');
                if (savedGridOp !== null) {
                    gridOpacitySlider.value = parseFloat(savedGridOp) || 0;
                }
            } catch(e) {}
            var gop = Math.max(0, Math.min(1, parseFloat(gridOpacitySlider.value) || 0));
            if (state.pianoRoll) state.pianoRoll.setGridOpacity(gop);
            if (gridOpacityValue) gridOpacityValue.textContent = Math.round(gop * 100) + '%';
            gridOpacitySlider.addEventListener('input', function() {
                var op = Math.max(0, Math.min(1, parseFloat(this.value) || 0));
                if (state.pianoRoll) state.pianoRoll.setGridOpacity(op);
                if (gridOpacityValue) gridOpacityValue.textContent = Math.round(op * 100) + '%';
            });
            gridOpacitySlider.addEventListener('change', function() {
                try { localStorage.setItem('grid_opacity', this.value); } catch(e) {}
            });
        }

        // MIDI 音色库: 下载/加载策略 (播放时询问/自动后台下载/不使用)
        var sfModeSelect = $('settings-midi-sf-mode');
        if (sfModeSelect) {
            try {
                var savedSfMode = localStorage.getItem('midi_sf_mode');
                if (savedSfMode && (savedSfMode === 'ask' || savedSfMode === 'auto' || savedSfMode === 'off')) {
                    sfModeSelect.value = savedSfMode;
                }
            } catch(e) {}
            sfModeSelect.addEventListener('change', function() {
                try { localStorage.setItem('midi_sf_mode', this.value); } catch(e) {}
            });
        }
        var sfDownloadBtn = $('settings-midi-sf-download');
        if (sfDownloadBtn) {
            sfDownloadBtn.addEventListener('click', function() {
                if (!_sfConfig) {
                    showAppAlert('未配置 MIDI 音色库下载地址 (服务端 config.yaml)', { icon: 'fa-solid fa-circle-info' });
                    return;
                }
                startSfDownload();
            });
        }
        var sfClearBtn = $('settings-midi-sf-clear');
        if (sfClearBtn) {
            sfClearBtn.addEventListener('click', function() {
                showAppConfirm('确定清除已下载的 MIDI 音色库缓存吗？清除后需重新下载。', {
                    title: '清除音色库缓存', icon: 'fa-solid fa-trash-can'
                }).then(function(ok) {
                    if (!ok) return;
                    if (window.SoundfontLoader) SoundfontLoader.clearCache();
                    updateSfStatusText('idle');
                });
            });
        }
        // 初始化状态文字
        if (window.SoundfontLoader) {
            updateSfStatusText(SoundfontLoader.getStatus());
        } else {
            updateSfStatusText('idle');
        }

        // ---- 恢复背景图: 迁移旧 localStorage 数据到 IndexedDB, 否则从 IndexedDB 读取 ----
        (function restoreBgImage() {
            var oldBg = null;
            try { oldBg = localStorage.getItem('bg_image_data'); } catch(e) {}
            if (oldBg) {
                // 旧版本将图片存 localStorage (仅小图可存), 迁移到 IndexedDB 后删除
                _bgPutImage(oldBg).then(function() {
                    try {
                        localStorage.removeItem('bg_image_data');
                        localStorage.setItem('bg_migrated_v2', '1');
                    } catch(e) {}
                    applyPageBgImage(oldBg);
                    var fname = null;
                    try { fname = localStorage.getItem('bg_filename'); } catch(e) {}
                    updateBgFilename(fname || '');
                }).catch(function() {
                    // 迁移失败: 本次仍用 localStorage 数据, 下次访问再试
                    applyPageBgImage(oldBg);
                    var fname2 = null;
                    try { fname2 = localStorage.getItem('bg_filename'); } catch(e) {}
                    updateBgFilename(fname2 || '');
                });
                return;
            }
            _bgGetImage().then(function(dataUrl) {
                if (dataUrl) {
                    applyPageBgImage(dataUrl);
                    var fname3 = null;
                    try { fname3 = localStorage.getItem('bg_filename'); } catch(e) {}
                    updateBgFilename(fname3 || '');
                }
            });
        })();

        // 设置弹窗标签页切换
        var settingsTabs = document.querySelectorAll('.settings-tab');
        for (var st = 0; st < settingsTabs.length; st++) {
            (function(tab) {
                tab.addEventListener('click', function() {
                    var target = tab.getAttribute('data-settings-tab');
                    document.querySelectorAll('.settings-tab').forEach(function(t) { t.classList.toggle('active', t === tab); });
                    document.querySelectorAll('.settings-tab-panel').forEach(function(p) {
                        p.classList.toggle('active', p.id === 'settings-tab-' + target);
                    });
                });
            })(settingsTabs[st]);
        }

        // 收音机式 (指针居中) 速度滑块
        var settingsTempoSlider = $('settings-tempo-slider');
        if (settingsTempoSlider) {
            // 旧版 range 隐藏 (但保留 DOM, 兼容旧引用)
            settingsTempoSlider.style.display = 'none';
        }
        initRadioTempoSlider();

        // 速度直接输入 (最多 3 位小数, 范围 1-512)
        var settingsTempoInput = $('settings-tempo-input');
        if (settingsTempoInput) {
            settingsTempoInput.addEventListener('input', function(e) {
                var rawStr = e.target.value;
                // 限制输入最多 3 位小数: 只允许数字 + 一个小数点 + 至多 3 位小数
                if (!/^\d*\.?\d{0,3}$/.test(rawStr)) {
                    // 回退到上次的合法值
                    e.target.value = (Math.round(state.tempo * 1000) / 1000).toString();
                    return;
                }
                var raw = parseFloat(rawStr);
                if (isNaN(raw)) return;
                // 限制范围 1 - 512
                var v = Math.max(1, Math.min(512, raw));
                state.tempo = v;
                $setText('settings-tempo-value', v.toFixed(3).replace(/\.?0+$/, ''));
                updateRadioTempoSlider();
                $('tempo-value').value = v.toFixed(1);
                $setValue('fls-tempo-input', Math.round(v));
                markDirty();
                if (state.isPlaying) restartPlayback();
            });
        }

        // 自动翻页模式切换 (工具栏旧按钮, 若存在)
        var autoScrollBtn = $('btn-auto-scroll');
        if (autoScrollBtn) {
            autoScrollBtn.addEventListener('click', function() {
                state.smoothScroll = !state.smoothScroll;
                if (state.pianoRoll) {
                    state.pianoRoll.smoothScrollEnabled = state.smoothScroll;
                }
                updateAutoScrollBtnIcon();
                markDirty();
            });
        }

        // MIDI 弹窗事件
        var midiImportBtn = $('midi-import-btn');
        if (midiImportBtn) midiImportBtn.addEventListener('click', doImportMidi);
        var midiCancelBtn = $('midi-cancel-btn');
        if (midiCancelBtn) midiCancelBtn.addEventListener('click', closeMidiPopup);
        var midiCloseBtn = $('midi-close-btn');
        if (midiCloseBtn) midiCloseBtn.addEventListener('click', closeMidiPopup);
        var keepNoteLengthSelect = $('midi-keep-note-length');
        if (keepNoteLengthSelect) keepNoteLengthSelect.addEventListener('change', updateSustainTracksUI);
        var sustainTracksBtn = $('midi-sustain-tracks-btn');
        if (sustainTracksBtn) sustainTracksBtn.addEventListener('click', showSustainTracksDialog);

        // 音域处理模式切换
        var octaveModeSel = $('midi-octave-mode');
        if (octaveModeSel) {
            octaveModeSel.addEventListener('change', function() {
                var mode = parseInt(this.value) || 0;
                updateOctaveModeHint(mode);
                // 模式切换时重新计算通道映射表的默认八度
                updateChannelOctaveForMode(mode);
            });
            // 触发一次以初始化提示状态
            var initMode = parseInt(octaveModeSel.value) || 0;
            updateOctaveModeHint(initMode);
            // 初始化强制折叠 checkbox 可见性
            updateChannelOctaveForMode(initMode);
        }

        // 智能音色替代开关: 改变时重新计算偏移和提示 (仅在模式 2/3 下生效)
        var smartSubstituteCheck = $('midi-smart-substitute');
        if (smartSubstituteCheck) {
            smartSubstituteCheck.addEventListener('change', function() {
                if (this.disabled) return;
                var mode = parseInt(octaveModeSel ? octaveModeSel.value : 0) || 0;
                if (mode === 2 || mode === 3) {
                    updateChannelOctaveForMode(mode);
                }
                updateOctaveModeHint(mode);
            });
        }

        // 强制归位开关: 改变时仅刷新提示 (不影响偏移计算)
        var forceFoldCheck = $('midi-force-fold');
        if (forceFoldCheck) {
            forceFoldCheck.addEventListener('change', function() {
                if (this.disabled) return;
                var mode = parseInt(octaveModeSel ? octaveModeSel.value : 0) || 0;
                updateOctaveModeHint(mode);
            });
        }

        // 音色替代设置按钮
        var substituteBtn = $('midi-substitute-settings-btn');
        if (substituteBtn) substituteBtn.addEventListener('click', openSubstituteSettings);
        var substituteCloseBtn = $('midi-substitute-close-btn');
        if (substituteCloseBtn) substituteCloseBtn.addEventListener('click', closeSubstituteSettings);
        var substituteCancelBtn = $('midi-substitute-cancel-btn');
        if (substituteCancelBtn) substituteCancelBtn.addEventListener('click', closeSubstituteSettings);
        var substituteSaveBtn = $('midi-substitute-save-btn');
        if (substituteSaveBtn) substituteSaveBtn.addEventListener('click', function() {
            var config = readSubstituteConfigFromUI();
            saveSubstituteConfig(config);
            closeSubstituteSettings();
            showMidiNotice('音色替代配置已保存', 'success');
            // 替代配置变化后刷新通道映射偏移和音域提示
            var _mode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
            if (_mode === 2 || _mode === 3) {
                updateChannelOctaveForMode(_mode);
            }
            updateOctaveModeHint(_mode);
        });
        var substituteResetBtn = $('midi-substitute-reset-btn');
        if (substituteResetBtn) substituteResetBtn.addEventListener('click', function() {
            _substituteConfig = JSON.parse(JSON.stringify(DEFAULT_SUBSTITUTE));
            renderSubstituteRows(_substituteConfig);
            showMidiNotice('已恢复默认替代配置', 'info');
        });
        // 点击遮罩关闭
        var substitutePopup = $('midi-substitute-popup');
        if (substitutePopup) substitutePopup.addEventListener('click', function(e) {
            if (e.target === this) closeSubstituteSettings();
        });

        // Tab 切换事件
        var subTabBtns = document.querySelectorAll('#midi-substitute-popup .midi-sub-tab');
        for (var sti = 0; sti < subTabBtns.length; sti++) {
            subTabBtns[sti].addEventListener('click', function(e) {
                e.stopPropagation();
                var tabName = this.getAttribute('data-subtab');
                if (tabName) switchSubstituteTab(tabName);
            });
        }

        // MIDI 标签页切换
        var midiTabs = document.querySelectorAll('.midi-tab');
        for (var ti = 0; ti < midiTabs.length; ti++) {
            midiTabs[ti].addEventListener('click', function() {
                switchMidiTab(this.getAttribute('data-tab'));
            });
        }

        // MIDI 子标签页切换
        var midiSubTabs = document.querySelectorAll('.midi-sub-tab');
        for (var si = 0; si < midiSubTabs.length; si++) {
            midiSubTabs[si].addEventListener('click', function() {
                switchMidiSubTab(this.getAttribute('data-subtab'));
            });
        }

        // 加载记住的 MIDI 设置
        loadMidiSettings();

        // 八度警告
        var octaveCloseBtn = $('octave-close-btn');
        var octaveCloseX = $('octave-close-x');
        function closeOctavePopup() {
            var p = $('octave-popup');
            if (p) { p.style.display = ''; p.classList.remove('active'); }
        }
        if (octaveCloseBtn) octaveCloseBtn.addEventListener('click', closeOctavePopup);
        if (octaveCloseX) octaveCloseX.addEventListener('click', closeOctavePopup);

        // 关于我们弹窗
        var aboutBtn = $('btn-about');
        var aboutPopup = $('about-popup');
        var aboutClose = $('about-close-btn');
        var aboutCloseX = $('about-close-x');
        if (aboutBtn && aboutPopup) {
            aboutBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isVisible = aboutPopup.style.display === 'flex';
                if (isVisible) {
                    aboutPopup.style.display = '';
                    aboutPopup.classList.remove('active');
                } else {
                    aboutPopup.style.display = 'flex';
                    aboutPopup.classList.add('active');
                }
            });
        }
        function closeAboutPopup(e) {
            if (e) e.stopPropagation();
            if (aboutPopup) {
                aboutPopup.style.display = '';
                aboutPopup.classList.remove('active');
            }
        }
        if (aboutClose) aboutClose.addEventListener('click', closeAboutPopup);
        if (aboutCloseX) aboutCloseX.addEventListener('click', closeAboutPopup);

        // ============ 工具栏响应式折叠：自动把溢出项收进"更多"菜单 ============
        function refreshToolbarLayout() {
            var toolbar = $('toolbar');
            var moreBtn = $('btn-toolbar-more');
            var moreMenu = $('toolbar-more-menu');
            if (!toolbar || !moreBtn || !moreMenu) return;

            // 只折叠带有 data-group="overflow" 的项; 不带这个属性的始终保留 (例如速度按钮)
            // 排除 btn-settings 和 btn-functions, 它们在移动端始终可见
            var allCollapsibles = toolbar.querySelectorAll('.toolbar-collapsible[data-group="overflow"]');
            var collapsibles = [];
            for (var ai = 0; ai < allCollapsibles.length; ai++) {
                var cid = allCollapsibles[ai].id;
                if (cid !== 'btn-settings' && cid !== 'btn-functions') {
                    collapsibles.push(allCollapsibles[ai]);
                }
            }
            var rightSection = toolbar.querySelector('.toolbar-right');
            if (!rightSection) return;

            // 先恢复所有 collapsible 可见
            for (var ci = 0; ci < collapsibles.length; ci++) {
                collapsibles[ci].style.display = '';
            }
            moreBtn.style.display = 'none';
            moreMenu.style.display = 'none';

            // 移动端: 工具栏更紧凑
            if (window.innerWidth <= 768) {
                toolbar.classList.add('toolbar-compact');
            } else {
                toolbar.classList.remove('toolbar-compact');
            }

            // 测量实际剩余宽度
            var toolbarW = toolbar.clientWidth;
            var leftSection = toolbar.querySelector('.toolbar-section');
            var usedW = (leftSection ? leftSection.offsetWidth : 0);
            // 估算右侧"必须"宽度: undo/redo + 速度按钮 + margin
            var minRightFixed = 200;
            var availableForOverflow = toolbarW - usedW - minRightFixed - 60;

            // 如果 collapsibles 总宽度超过可用空间，则逐个收起
            var collapsibleWidths = [];
            var totalCollapsibleW = 0;
            for (var cj = 0; cj < collapsibles.length; cj++) {
                var w = collapsibles[cj].offsetWidth || 60;
                collapsibleWidths.push(w);
                totalCollapsibleW += w;
            }

            if (availableForOverflow < totalCollapsibleW && collapsibles.length > 0) {
                moreBtn.style.display = '';
                var collectedItems = [];
                var overflowW = totalCollapsibleW - availableForOverflow;
                // 倒序检测, 优先收起靠后的按钮
                for (var ck = collapsibles.length - 1; ck >= 0; ck--) {
                    if (overflowW > 0 || collectedItems.length > 0) {
                        collectedItems.push(collapsibles[ck]);
                        overflowW -= collapsibleWidths[ck];
                    }
                }
                // 小屏幕 (<=560px) 且有 collected, 全部收起
                if (toolbarW <= 560) {
                    collectedItems = Array.prototype.slice.call(collapsibles);
                }
                if (collectedItems.length > 0) {
                    renderMoreMenu(collectedItems);
                    for (var cm = 0; cm < collectedItems.length; cm++) {
                        collectedItems[cm].style.display = 'none';
                    }
                }
            }
        }

        function renderMoreMenu(items) {
            var moreBtn = $('btn-toolbar-more');
            var moreMenu = $('toolbar-more-menu');
            if (!moreBtn || !moreMenu) return;

            moreMenu.innerHTML = '';
            for (var ii = 0; ii < items.length; ii++) {
                var el = items[ii];
                var menuItem = document.createElement('div');
                menuItem.className = 'toolbar-more-item';
                if (el.classList && el.classList.contains('toolbar-tempo')) {
                    menuItem.innerHTML = el.innerHTML;
                    var slider = menuItem.querySelector('input[type="range"]');
                    if (slider) {
                        slider.value = el.querySelector('input[type="range"]').value;
                        slider.addEventListener('input', function(e) {
                            var mainSlider = $('tempo-slider');
                            if (mainSlider) {
                                mainSlider.value = e.target.value;
                                var evt = new Event('input', { bubbles: true });
                                mainSlider.dispatchEvent(evt);
                            }
                        });
                    }
                    var valLabel = menuItem.querySelector('#tempo-value');
                    if (valLabel) valLabel.id = 'tempo-value-menu';
                } else {
                    var iconHtml = el.querySelector('.icon') ? el.querySelector('.icon').outerHTML : '';
                    menuItem.innerHTML = iconHtml + '<span>' + (el.title || el.textContent || '') + '</span>';
                    menuItem.addEventListener('click', function(srcEl) {
                        return function() {
                            srcEl.click();
                            moreMenu.style.display = 'none';
                        };
                    }(el));
                }
                moreMenu.appendChild(menuItem);
            }
        }

        // 更多按钮切换显示
        (function setupMoreBtn() {
            var moreBtn = $('btn-toolbar-more');
            var moreMenu = $('toolbar-more-menu');
            if (!moreBtn || !moreMenu) return;
            moreBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var isVisible = moreMenu.style.display === 'block';
                moreMenu.style.display = isVisible ? 'none' : 'block';
                // 定位到按钮下方
                if (!isVisible) {
                    var rect = moreBtn.getBoundingClientRect();
                    window.WebNBSPositionFlyout(moreMenu, rect, { placement: 'bottom-end' });
                }
            });
            document.addEventListener('click', function(e) {
                if (!moreMenu.contains(e.target) && e.target !== moreBtn) {
                    moreMenu.style.display = 'none';
                }
            });
        })();

        // 初始刷新 & 窗口变化时再次刷新 (仅移动端)
        if (window.innerWidth < 768) {
            var _toolbarRefreshTimer = null;
            function scheduleToolbarRefresh() {
                if (_toolbarRefreshTimer) return;
                _toolbarRefreshTimer = setTimeout(function() {
                    _toolbarRefreshTimer = null;
                    refreshToolbarLayout();
                }, 80);
            }
            scheduleToolbarRefresh();
            window.addEventListener('resize', scheduleToolbarRefresh);
            window.addEventListener('orientationchange', scheduleToolbarRefresh);
        }

        // FLS 底部栏
        var flsPlayBtn = $('fls-btn-play');
        if (flsPlayBtn) flsPlayBtn.addEventListener('click', handlePlayToggle);
        var flsStopBtn = $('fls-btn-stop');
        if (flsStopBtn) flsStopBtn.addEventListener('click', handleStop);
        var flsRevBtn = $('fls-btn-rev');
        if (flsRevBtn) flsRevBtn.addEventListener('click', function() { seekToTick(0); if (state.pianoRoll) state.pianoRoll._scrollToPlayhead(); });
        var flsTempoInput = $('fls-tempo-input');
        if (flsTempoInput) flsTempoInput.addEventListener('change', function(e) {
            var v = parseInt(e.target.value) || 20;
            v = Math.max(1, Math.min(400, v));
            state.tempo = v;
            $setValue('tempo-slider', v);
            $('tempo-value').value = v;
            markDirty();
            if (state.isPlaying) restartPlayback();
            updateProgressUI();
        });

        updateProgressUI();

        // 启动持续进度条 RAF 循环 (无论是否播放, 都保持进度条丝滑)
        startFlsProgressRAF();
        // 初始化进度条拖动 (PC + 移动端)
        initFlsProgressBarDrag();

        // 键盘快捷键
        initKeyboardShortcuts();

        // 全局点击/触摸关闭上下文菜单 + 其他弹窗
        // 使用 capture 阶段拦截, 关闭菜单时阻止事件继续传播到 canvas (避免误放置音符)
        var suppressNextCanvasClick = false;
        var closeAllPopups = function(e) {
            // 音色子菜单项被触摸/点击时, 不关闭任何弹窗 (优先判断, 避免 capture 阶段误删子菜单)
            var instSubMenu = $('instrument-submenu');
            if (instSubMenu && instSubMenu.contains(e.target)) {
                return;
            }
            // 音色槽子菜单同理
            var timbreSlotMenu = $('timbre-slot-menu');
            if (timbreSlotMenu && timbreSlotMenu.contains(e.target)) {
                return;
            }
            // 右键菜单
            var menu = $('context-menu');
            if (menu && menu.style.display === 'block' && !menu.contains(e.target)) {
                hideContextMenu();
                suppressNextCanvasClick = true;
            }
            // 乐器选择弹窗
            var instPopup = $('instrument-popup');
            if (instPopup && instPopup.classList.contains('visible')
                && !instPopup.contains(e.target) && e.target.id !== 'btn-instrument-selector'
                && !(e.target.parentElement && e.target.parentElement.id === 'btn-instrument-selector')) {
                instPopup.classList.remove('visible');
                suppressNextCanvasClick = true;
            }
            // 乐器浮动窗口 (桌面端): 不再因点击外部而关闭
            // 仅通过再次点击乐器选择器按钮来切换 (toggleInstrumentPopup)
            // 乐器子菜单
            var subMenu = $('instrument-submenu');
            if (subMenu && !subMenu.contains(e.target) && (!menu || !menu.contains(e.target))) {
                subMenu.remove();
                suppressNextCanvasClick = true;
            }
            // 关于我们弹窗
            var aboutPopup = $('about-popup');
            if (aboutPopup && aboutPopup.classList.contains('active')
                && !aboutPopup.contains(e.target) && e.target.id !== 'btn-about') {
                // 检查点击是否在其他弹窗内部 (避免误关闭)
                if (!(e.target.closest && (e.target.closest('#midi-substitute-popup') || e.target.closest('.cdd-list.cdd-visible') || e.target.closest('.app-dialog-overlay')))) {
                    aboutPopup.classList.remove('active');
                    aboutPopup.style.display = '';
                }
            }
            // 延音轨道弹窗：点击其内部时不关闭 MIDI 导入弹窗
            if (e.target.closest && e.target.closest('#sustain-tracks-popup')) {
                return;
            }
            // 音色替代设置弹窗：点击其内部时不关闭 MIDI 导入弹窗
            if (e.target.closest && e.target.closest('#midi-substitute-popup')) {
                return;
            }
            // 自定义下拉框列表：点击下拉框内部时不关闭弹窗 (cdd-list 挂载在 body 上)
            if (e.target.closest && e.target.closest('.cdd-list.cdd-visible')) {
                return;
            }
            // 音色槽菜单挂载在 body 上，点击菜单内部时不关闭弹窗
            if (e.target.closest && e.target.closest('#substitute-slot-menu')) {
                return;
            }
            if (e.target.closest && e.target.closest('#timbre-slot-menu')) {
                return;
            }
            // AppDialog 弹窗：点击 AppDialog 内部时不关闭 MIDI 弹窗
            if (e.target.closest && e.target.closest('.app-dialog-overlay')) {
                return;
            }
            // MIDI 导入弹窗
            var midiPopup = $('midi-popup');
            var midiOverrideWarning = $('midi-override-warning-popup');
            if (midiPopup && midiPopup.classList.contains('active')
                && !midiPopup.contains(e.target) && e.target.id !== 'midi-close-btn'
                && !(midiOverrideWarning && midiOverrideWarning.contains(e.target))) {
                closeMidiPopup();
            }
            // 设置弹窗
            var settingsPopup = $('settings-popup');
            if (settingsPopup && (settingsPopup.classList.contains('active') || settingsPopup.style.display === 'flex')
                && !settingsPopup.contains(e.target)
                && e.target.id !== 'btn-settings' && !(e.target.closest && e.target.closest('#btn-settings'))) {
                // 检查点击是否在其他弹窗内部 (避免误关闭)
                if (!(e.target.closest && (e.target.closest('#midi-substitute-popup') || e.target.closest('.cdd-list.cdd-visible') || e.target.closest('.app-dialog-overlay')))) {
                    settingsPopup.classList.remove('active');
                    settingsPopup.style.display = 'none';
                }
            }
            // 速度弹窗 (btn-open-tempo 已删除, 保留关闭逻辑兼容)
            var tempoPopup = $('tempo-popup');
            if (tempoPopup && (tempoPopup.classList.contains('active') || tempoPopup.style.display === 'flex')
                && !tempoPopup.contains(e.target)) {
                tempoPopup.classList.remove('active');
                tempoPopup.style.display = 'none';
            }
            // 文件菜单 (点击历史子菜单内不关闭文件菜单, 由子菜单项自行处理)
            var fileMenu = document.getElementById('file-menu');
            var historySub = document.getElementById('history-submenu');
            if (fileMenu && !fileMenu.contains(e.target)
                && (!historySub || !historySub.contains(e.target))
                && e.target.id !== 'btn-file') {
                hideFileMenu();
            }
            // 历史对话框
            var historyDialog = document.getElementById('history-dialog');
            if (historyDialog && !historyDialog.contains(e.target)) {
                historyDialog.remove();
            }
        };
        document.addEventListener('click', closeAllPopups, true);   // capture 阶段
        document.addEventListener('touchstart', closeAllPopups, true, { passive: true });

        // 让 piano_roll 知道"刚关闭菜单" - 抑制下一次 canvas mousedown 触发放置
        if (state.pianoRoll) {
            state.pianoRoll._suppressNextClick = false;
        }
        document.addEventListener('mousedown', function(e) {
            if (suppressNextCanvasClick) {
                suppressNextCanvasClick = false;
                if (state.pianoRoll) {
                    state.pianoRoll._suppressNextClick = true;
                    setTimeout(function() { if (state.pianoRoll) state.pianoRoll._suppressNextClick = false; }, 250);
                }
            }
        }, true);

        // AudioContext 初始化
        var audioInit = false;
        function onFirstInteract() {
            if (audioInit) return;
            audioInit = true;
            if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
            document.removeEventListener('click', onFirstInteract);
            document.removeEventListener('touchstart', onFirstInteract);
            document.removeEventListener('keydown', onFirstInteract);
        }
        document.addEventListener('click', onFirstInteract);
        document.addEventListener('touchstart', onFirstInteract);
        document.addEventListener('keydown', onFirstInteract);

        // 加载乐器
        loadInstruments();

        // 初始化轨道
        initTracks();

        updateProgressUI();
        updateInstrumentSelectorUI();

        // 轨道面板折叠按钮
        var trackPanelToggle = $('track-panel-toggle');
        if (trackPanelToggle) {
            var _panelToggleLastTime = 0;
            var _panelToggleHandler = function(e) {
                e.stopPropagation();
                e.preventDefault();
                if (!state.pianoRoll) return;
                // 防止移动端 touchend + click 双重触发 (350ms 内只响应一次)
                var now = Date.now();
                if (now - _panelToggleLastTime < 350) return;
                _panelToggleLastTime = now;

                // 判断当前是否已折叠 (注意: 0 是有效值, 不能用 ||)
                var currentWidth = state.pianoRoll._currentPanelWidth;
                if (currentWidth === undefined || currentWidth === null) {
                    currentWidth = state.pianoRoll._cfg.sidePanelWidth;
                }
                if (currentWidth === undefined || currentWidth === null) currentWidth = 134;
                var collapsed = currentWidth > 10;
                // 调用 setPanelCollapsed (若存在), 否则回退到直接修改 _cfg.sidePanelWidth
                if (typeof state.pianoRoll.setPanelCollapsed === 'function') {
                    state.pianoRoll.setPanelCollapsed(collapsed);
                } else {
                    if (collapsed) {
                        state.pianoRoll._cfg.sidePanelWidth = 0;
                    } else {
                        state.pianoRoll._cfg.sidePanelWidth = 200;
                    }
                    state.pianoRoll.render();
                }
                // 更新图标
                setTimeout(syncTrackPanelToggleButton, 0);
            };
            trackPanelToggle.addEventListener('click', _panelToggleHandler);
            // 移动端 touchend 也处理, 但通过时间戳防抖避免与 click 重复
            trackPanelToggle.addEventListener('touchend', function(e) {
                e.stopPropagation();
                e.preventDefault();
                _panelToggleHandler.call(this, e);
            });
            syncTrackPanelToggleButton();
        }

        // 尝试恢复本地保存的数据
        if (!autoLoadLocal()) {
            resetToNewFile(false);
        }
        syncTrackPanelToggleButton();

        // 清理孤儿历史文件, 释放 localStorage 空间
        cleanupOrphanedFiles();

        // 启动自动保存定时器 (每 30 秒)
        startAutoSaveInterval();

        // 初始化按钮 Tooltip 系统
        if (window.attachTooltips) window.attachTooltips();
    }

    // ============ 钢琴卷帘初始化 ============
    function initPianoRoll() {
        if (!window.PianoRoll) return;
        try {
            state.pianoRoll = new PianoRoll('piano-roll');
            if (!state.pianoRoll) return;
            // Keep the roll's drawing pitch aligned with the default C4 before
            // any note is placed or a saved project is loaded.
            state.pianoRoll.setSelectedKey(state.selectedPianoKey);

            // 设置回调
            state.pianoRoll.onPerformanceLayersChanged = function(layers) {
                state.performanceTrackLayers = layers.slice();
                var trackInfoEl = $('perf-track-name');
                if (trackInfoEl) {
                    if (layers.length === 0) {
                        trackInfoEl.textContent = '请在画布中点击选择要录制的音轨';
                    } else {
                        var names = [];
                        for (var i = 0; i < layers.length; i++) {
                            var track = findTrackByLayer(layers[i]);
                            names.push(track ? track.name : ('Layer ' + (layers[i] + 1)));
                        }
                        trackInfoEl.textContent = '录制到: ' + names.join(', ');
                    }
                }
            };

            state.pianoRoll.onNoteAdded = function(noteData) {
                pushUndo();
                // 钢琴键盘选中的音调覆盖 key, 但 layer 保持 Y 轴位置
                var pianoKey = null;
                if (state.pianoRoll) pianoKey = state.pianoRoll.getSelectedKey();
                if (pianoKey !== null && pianoKey !== undefined && pianoKey >= 0) {
                    noteData.key = pianoKey;
                }
                var note = state.pianoRoll.addNote(noteData);
                state.notes = state.pianoRoll.getNotes();
                buildNoteIndex(state.notes);
                updateNoteCount();
                updateProgressUI();
                markDirty();
                // 播放放置动画
                if (state.pianoRoll && state.pianoRoll._addPlaceAnimation) {
                    state.pianoRoll._addPlaceAnimation(note);
                }
            };

            // 音符预览回调 (用于动画播放音色)
            state.pianoRoll.onNotePreview = function(instrument, key) {
                if (window.AudioEngine && AudioEngine.playNote) {
                    AudioEngine.playNote(instrument, key, 80);
                }
            };

            state.pianoRoll.onNotesChanged = function(selectedNotes) {
                state.notes = state.pianoRoll.getNotes();
                buildNoteIndex(state.notes);
                updateNoteCount();
                updateProgressUI();
                updateTrackPanelUI();
                markDirty();
            };

            state.pianoRoll.onNoteDragStart = function() {
                pushUndo();
            };

            state.pianoRoll.onContextMenu = function(x, y, noteIds, isLongPress) {
                showContextMenu(x, y, noteIds, isLongPress);
            };

            state.pianoRoll.onSelectionChanged = function(selectedNotes) {
                updateTrackPanelUI();
            };

            // 轨道 M/S/删除 按钮变化回调 (与 canvas 交互)
            state.pianoRoll.onTrackChanged = function(layer, updatedInfo) {
                pushUndo();
                // 同步 state.tracks 与 pianoRoll.trackInfo
                var track = findTrackByLayer(layer);
                if (track) {
                    track.muted = updatedInfo.muted;
                    track.solo = updatedInfo.solo;
                    track.name = updatedInfo.name;
                } else {
                    state.tracks.push({
                        layer: layer,
                        name: updatedInfo.name,
                        muted: updatedInfo.muted,
                        solo: updatedInfo.solo,
                        volume: (updatedInfo.volume !== undefined) ? updatedInfo.volume : 100,
                        noteCount: 0,
                        instrument: 0
                    });
                }
                // 同步到 state.song.layers 的 lock 字段
                setLayerLock(layer, mutedSoloToLock(!!updatedInfo.muted, !!updatedInfo.solo));
                // 判断是否有 solo 激活
                state.soloActive = false;
                for (var ti = 0; ti < state.tracks.length; ti++) {
                    if (state.tracks[ti].solo) { state.soloActive = true; break; }
                }
                updateTrackPanelUI();
                markDirty();
            };

            // 轨道重命名回调
            state.pianoRoll.onTrackRename = function(layer, newName) {
                pushUndo();
                updateTrackName(layer, newName);
            };

            state.pianoRoll.onSetTrackVolume = function(layer, volume) {
                setTrackVolume(layer, volume);
            };

            state.pianoRoll.onVolumeChangeStart = function(layer) {
                pushUndo();
            };

            // 添加轨道回调
            state.pianoRoll.onAddTrack = function() {
                pushUndo();
                if (!state.song) state.song = {};
                if (!state.song.layers) state.song.layers = [];
                state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
                state.pianoRoll.trackCount = state.song.layers.length;
                updateTrackPanelUI();
                markDirty();
            };

            // 移动轨道回调 (direction: -1=上移, 1=下移)
            state.pianoRoll.onMoveTrack = function(layer, direction) {
                if (direction < 0) {
                    moveTrackUp(layer);
                } else {
                    moveTrackDown(layer);
                }
            };

            // 拖拽排序回调 (fromLayer → toLayer)
            state.pianoRoll.onReorderTrack = function(fromLayer, toLayer) {
                reorderTrack(fromLayer, toLayer);
            };

            // 删除轨道回调
            state.pianoRoll.onDeleteTrack = function(layer) {
                deleteTrack(layer);
            };

            // 选中该层所有音符回调
            state.pianoRoll.onSelectAllInLayer = function(layer) {
                if (!state.pianoRoll) return;
                var notes = state.pianoRoll.getNotes();
                var ids = [];
                for (var i = 0; i < notes.length; i++) {
                    if (notes[i].layer === layer) ids.push(notes[i].id);
                }
                var selected = state.pianoRoll.getSelectedNotes ? state.pianoRoll.getSelectedNotes() : [];
                var merged = {};
                for (var si = 0; si < selected.length; si++) {
                    if (selected[si] && selected[si].id) merged[selected[si].id] = true;
                }
                for (var ii = 0; ii < ids.length; ii++) merged[ids[ii]] = true;
                state.pianoRoll.selectNotes(Object.keys(merged));
            };

            // 时间轴点击跳转回调
            state.pianoRoll.onTimelineSeek = function(tick) {
                seekToTick(tick);
            };

            // 同步初始状态
            state.pianoRoll.trackCount = (state.song && state.song.layers) ? state.song.layers.length : 1;
            state.pianoRoll.smoothScrollEnabled = state.smoothScroll;

            state.pianoRoll.setNotes([]);

            initToolSwitcher();
        } catch(e) {
            console.warn('PianoRoll init error:', e);
        }
    }

    // ============ 工具切换 ============
    function initToolSwitcher() {
        var toolBtns = document.querySelectorAll('.tool-btn');
        for (var i = 0; i < toolBtns.length; i++) {
            toolBtns[i].addEventListener('click', function() {
                var tool = this.getAttribute('data-tool');
                if (tool && state.pianoRoll) switchTool(tool);
            });
        }
    }

    function switchTool(tool) {
        if (!state.pianoRoll) return;
        state.pianoRoll.setTool(tool);
        var allBtns = document.querySelectorAll('.tool-btn');
        for (var j = 0; j < allBtns.length; j++) {
            allBtns[j].classList.remove('active');
            if (allBtns[j].getAttribute('data-tool') === tool) {
                allBtns[j].classList.add('active');
            }
        }
        if (tool === 'performance') {
            state.performanceMode = true;
            // 强制开启键盘钢琴
            state.keyboardPianoEnabled = true;
            var kpBtn = $('btn-keyboard-piano');
            if (kpBtn) kpBtn.classList.add('active');
            if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                state.pianoRoll.setShowKeyLabels(true);
            }
            openPianoKeyboard();
            // 节拍器按钮已删除 (功能废弃)
            updatePlayButtonForRecording();
        } else {
            state.performanceMode = false;
            stopPerformanceRecording();
            // 恢复键盘钢琴状态 (关闭, 因为是强制开启的)
            state.keyboardPianoEnabled = false;
            var kpBtn2 = $('btn-keyboard-piano');
            if (kpBtn2) kpBtn2.classList.remove('active');
            if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                state.pianoRoll.setShowKeyLabels(false);
            }
            // 节拍器按钮已删除
            updatePlayButtonForRecording();
            // 清除音轨选择
            if (state.pianoRoll) {
                state.pianoRoll.performanceSelectedLayers = [];
                state.pianoRoll._highlightLayer = -1;
                state.pianoRoll.render();
            }
        }
    }

    // ============ 键盘钢琴处理 ============
    function handlePianoKeyDown(nbsKey, code) {
        if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
            state.pianoRoll.highlightPianoKey(nbsKey, true);
        }
        if (window.AudioEngine && AudioEngine.playNote) {
            AudioEngine.playNote(state.currentInstrument, nbsKey, 100, 50);
        }
        // 同时选中该键作为当前音高, 点击画布时会在此音高放置音符
        if (state.pianoRoll) {
            state.pianoRoll.selectedKey = nbsKey;
            state.pianoRoll._highlightKey = nbsKey;
            state.pianoRoll._fullRedrawNeeded = true;
            if (state.pianoRoll.setSelectedKey) state.pianoRoll.setSelectedKey(nbsKey);
            if (state.pianoRoll.render) state.pianoRoll.render();
        }
        state.selectedPianoKey = nbsKey;
        updatePianoKeyboardHighlight();
        if (state.performanceRecording) {
            recordPerformanceKeyDown(nbsKey);
        }
    }

    function handlePianoKeyUp(nbsKey, code) {
        if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
            state.pianoRoll.highlightPianoKey(nbsKey, false);
        }
        updatePianoKeyboardHighlight();
        if (state.performanceRecording) {
            recordPerformanceKeyUp(nbsKey);
        }
    }

    // ============ 演奏模式录制 ============
    function showPerformanceSetupDialog(callback) {
        var popup = $('performance-setup-popup');
        if (!popup) return;

        var tempoInput = $('perf-tempo');
        if (tempoInput) tempoInput.value = state.tempo;

        // 显示当前选择的音轨
        var trackInfoEl = $('perf-track-name');
        if (trackInfoEl) {
            var layers = state.pianoRoll ? state.pianoRoll.getPerformanceLayers() : [];
            state.performanceTrackLayers = layers;
            if (layers.length === 0) {
                trackInfoEl.textContent = '请在画布中点击选择要录制的音轨';
                trackInfoEl.style.color = '#ff6b6b';
            } else {
                var names = [];
                for (var i = 0; i < layers.length; i++) {
                    var track = findTrackByLayer(layers[i]);
                    names.push(track ? track.name : ('Layer ' + (layers[i] + 1)));
                }
                trackInfoEl.textContent = '录制到: ' + names.join(', ');
                trackInfoEl.style.color = 'var(--text-secondary)';
            }
        }

        // 更新吸附提示
        var snapInfoEl = $('perf-snap-info');
        function updateSnapInfo() {
            var snapEnabled = $('perf-snap-enabled').checked;
            var snapBeat = parseInt($('perf-snap-beat').value) || 4;
            if (snapInfoEl) {
                if (snapEnabled) {
                    var beatName = {2:'1/2音符', 4:'1/4音符', 8:'1/8音符', 16:'1/16音符', 32:'1/32音符'}[snapBeat] || '1/4音符';
                    var ticksPerBeat = 4;
                    var gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
                    snapInfoEl.textContent = '吸附到: ' + beatName + ' (每' + gridStep + 'tick)';
                    snapInfoEl.style.display = 'block';
                } else {
                    snapInfoEl.textContent = '未开启吸附，默认到各子';
                    snapInfoEl.style.display = 'block';
                }
            }
        }

        var snapCheckbox = $('perf-snap-enabled');
        var snapSelect = $('perf-snap-beat');
        if (snapCheckbox) snapCheckbox.addEventListener('change', updateSnapInfo);
        if (snapSelect) snapSelect.addEventListener('change', updateSnapInfo);
        updateSnapInfo();

        var midiCheckbox = $('perf-midi-device');
        function onMidiCheckboxChange() {
            if (this.checked && !_midiAccess) {
                initMidiDeviceAccess();
            } else if (!this.checked) {
                stopMidiDeviceListening();
            }
            var midiStatusEl = $('perf-midi-device-status');
            if (midiStatusEl && !this.checked) {
                midiStatusEl.style.opacity = '0.5';
            } else if (midiStatusEl) {
                midiStatusEl.style.opacity = '1';
            }
        }
        if (midiCheckbox) midiCheckbox.addEventListener('change', onMidiCheckboxChange);

        popup.style.display = 'flex';
        popup.classList.add('active');

        var startBtn = $('perf-start-btn');
        var cancelBtn = $('perf-cancel-btn');
        var closeBtn = $('performance-setup-close-btn');

        function cleanup() {
            popup.style.display = '';
            popup.classList.remove('active');
            if (startBtn) startBtn.removeEventListener('click', onStart);
            if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
            if (closeBtn) closeBtn.removeEventListener('click', onCancel);
            if (snapCheckbox) snapCheckbox.removeEventListener('change', updateSnapInfo);
            if (snapSelect) snapSelect.removeEventListener('change', updateSnapInfo);
            if (midiCheckbox) midiCheckbox.removeEventListener('change', onMidiCheckboxChange);
        }

        function onCancel() {
            cleanup();
        }

        function onStart() {
            var layers = state.pianoRoll ? state.pianoRoll.getPerformanceLayers() : [];
            if (layers.length === 0) {
                // 未选择音轨, 显示错误并阻止播放
                var trackInfoEl = $('perf-track-name');
                if (trackInfoEl) {
                    trackInfoEl.textContent = '请先在画布中点击选择要录制的音轨！';
                    trackInfoEl.style.color = '#ff6b6b';
                    trackInfoEl.style.fontWeight = 'bold';
                    // 闪烁效果
                    trackInfoEl.style.animation = 'none';
                    setTimeout(function() { trackInfoEl.style.animation = ''; }, 10);
                }
                return; // 不调用 callback, 不关闭弹窗
            }
            state.performanceTrackLayers = layers;

            var tempo = parseFloat($('perf-tempo').value) || state.tempo;
            var beat = parseInt($('perf-beat').value) || 4;
            var metronomeEnabled = $('perf-metronome-enabled') ? $('perf-metronome-enabled').checked : true;
            var snapEnabled = $('perf-snap-enabled').checked;
            var snapBeat = parseInt($('perf-snap-beat').value) || 4;
            var midiDeviceEnabled = $('perf-midi-device').checked;
            var sustainRecordEnabled = $('perf-sustain-record') && $('perf-sustain-record').checked;

            var settings = {
                tempo: tempo,
                beat: beat,
                metronomeEnabled: metronomeEnabled,
                snapEnabled: snapEnabled,
                snapBeat: snapBeat,
                midiDeviceEnabled: midiDeviceEnabled,
                sustainRecordEnabled: sustainRecordEnabled
            };

            cleanup();
            if (callback) callback(settings);
        }

        if (startBtn) startBtn.addEventListener('click', onStart);
        if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
        if (closeBtn) closeBtn.addEventListener('click', onCancel);
    }

    var _midiAccess = null;
    var _midiInputHandler = null;
    var _midiPerformanceActiveNotes = {};
    var _midiPerformanceHeldNotes = {};
    var _midiPerformanceSustain = {};

    function midiNoteToNbsKey(note) {
        if (note === undefined || note === null || isNaN(note)) return null;
        return Math.max(0, Math.min(87, Math.round(note) - 21));
    }

    function midiVelocityToNbsVelocity(velocity) {
        velocity = Math.max(1, Math.min(127, velocity || 1));
        return Math.max(1, Math.min(100, Math.round(velocity / 127 * 100)));
    }

    function getMidiMessageKey(input, channel, note) {
        var inputId = (input && (input.id || input.name || input.manufacturer)) || 'midi';
        return inputId + ':' + channel + ':' + note;
    }

    function releaseMidiPerformanceNote(messageKey) {
        var entry = _midiPerformanceActiveNotes[messageKey];
        if (!entry) return;
        recordPerformanceKeyUp(entry.nbsKey);
        if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
            state.pianoRoll.highlightPianoKey(entry.nbsKey, false);
        }
        delete _midiPerformanceActiveNotes[messageKey];
        delete _midiPerformanceHeldNotes[messageKey];
        updatePianoKeyboardHighlight();
    }

    function releaseSustainedMidiNotes(input, channel) {
        var inputId = (input && (input.id || input.name || input.manufacturer)) || 'midi';
        var prefix = inputId + ':' + channel + ':';
        var keys = Object.keys(_midiPerformanceHeldNotes);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(prefix) === 0) {
                releaseMidiPerformanceNote(keys[i]);
            }
        }
    }

    function stopAllMidiPerformanceNotes() {
        var keys = Object.keys(_midiPerformanceActiveNotes);
        for (var i = 0; i < keys.length; i++) {
            releaseMidiPerformanceNote(keys[i]);
        }
        _midiPerformanceActiveNotes = {};
        _midiPerformanceHeldNotes = {};
        _midiPerformanceSustain = {};
    }

    function initMidiDeviceAccess() {
        if (!navigator.requestMIDIAccess) {
            var statusEl = $('perf-midi-device-status');
            if (statusEl) statusEl.textContent = '浏览器不支持 MIDI 设备';
            return;
        }
        navigator.requestMIDIAccess({ sysex: false }).then(function(access) {
            _midiAccess = access;
            updateMidiDeviceList();
            access.onstatechange = function() {
                updateMidiDeviceList();
                if (state.performanceRecording && state.performanceSettings && state.performanceSettings.midiDeviceEnabled) {
                    startMidiDeviceListening();
                }
            };
        }).catch(function(err) {
            var statusEl = $('perf-midi-device-status');
            if (statusEl) statusEl.textContent = 'MIDI 设备访问被拒绝';
        });
    }

    function updateMidiDeviceList() {
        if (!_midiAccess) return;
        var inputs = _midiAccess.inputs;
        var count = inputs.size;
        var statusEl = $('perf-midi-device-status');
        if (statusEl) {
            if (count === 0) {
                statusEl.textContent = '未检测到 MIDI 设备';
            } else {
                var names = [];
                inputs.forEach(function(input) { names.push(input.name); });
                statusEl.textContent = '已连接: ' + names.join(', ');
                statusEl.style.color = 'var(--accent)';
            }
        }
    }

    function updateMidiDeviceList() {
        if (!_midiAccess) return;
        var activeInputs = [];
        _midiAccess.inputs.forEach(function(input) {
            if (input.state !== 'disconnected') activeInputs.push(input);
        });
        var statusEl = $('perf-midi-device-status');
        if (!statusEl) return;
        if (activeInputs.length === 0) {
            statusEl.textContent = '未检测到 MIDI 设备';
            statusEl.style.color = 'var(--text-tertiary)';
            return;
        }
        var names = [];
        for (var i = 0; i < activeInputs.length; i++) {
            names.push(activeInputs[i].name || activeInputs[i].manufacturer || ('MIDI 输入 ' + (i + 1)));
        }
        statusEl.textContent = '已连接 ' + names.join(', ');
        statusEl.style.color = 'var(--accent)';
    }

    function startMidiDeviceListening() {
        if (!_midiAccess) {
            initMidiDeviceAccess();
            // Wait for access then try again
            setTimeout(function() {
                if (_midiAccess) startMidiDeviceListening();
            }, 500);
            return;
        }
        stopMidiDeviceListening(false);
        _midiInputHandler = function(message) {
            handleMidiPerformanceMessage(message.currentTarget || message.target || this, message);
        };
        _midiAccess.inputs.forEach(function(input) {
            if (input.state === 'connected' || input.connection === 'open' || input.connection === 'pending') {
                if (input.open) {
                    try { input.open(); } catch(e) {}
                }
                input.onmidimessage = _midiInputHandler;
            }
        });
        updateMidiDeviceList();
    }

    function handleMidiPerformanceMessage(input, message) {
        if (!state.performanceRecording || !message || !message.data || message.data.length < 1) return;
        var data = message.data;
        var status = data[0];
        if (status >= 0xF8) return; // realtime clock/active sensing
        var command = status & 0xF0;
        var channel = status & 0x0F;
        var note = data[1];
        var velocity = data[2] || 0;
        var channelKey = ((input && (input.id || input.name)) || 'midi') + ':' + channel;

        if (command === 0x90 && velocity > 0) {
            var nbsKey = midiNoteToNbsKey(note);
            if (nbsKey === null) return;
            var messageKey = getMidiMessageKey(input, channel, note);
            if (_midiPerformanceActiveNotes[messageKey]) return;
            _midiPerformanceActiveNotes[messageKey] = { nbsKey: nbsKey, note: note, channel: channel };
            recordPerformanceKeyDown(nbsKey, midiVelocityToNbsVelocity(velocity));
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(state.currentInstrument, nbsKey, midiVelocityToNbsVelocity(velocity), 50);
            }
            state.selectedPianoKey = nbsKey;
            if (state.pianoRoll && state.pianoRoll.setSelectedKey) {
                state.pianoRoll.setSelectedKey(nbsKey);
            }
            if (state.pianoRoll && state.pianoRoll.highlightPianoKey) {
                state.pianoRoll.highlightPianoKey(nbsKey, true);
            }
            updatePianoKeyboardHighlight();
        } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
            var offKey = getMidiMessageKey(input, channel, note);
            if (_midiPerformanceSustain[channelKey]) {
                _midiPerformanceHeldNotes[offKey] = true;
            } else {
                releaseMidiPerformanceNote(offKey);
            }
        } else if (command === 0xB0) {
            var controller = note;
            var value = velocity;
            if (controller === 64) {
                var sustainOn = value >= 64;
                _midiPerformanceSustain[channelKey] = sustainOn;
                if (!sustainOn) releaseSustainedMidiNotes(input, channel);
            } else if (controller === 120 || controller === 121 || controller === 123) {
                stopAllMidiPerformanceNotes();
            }
        }
    }

    function stopMidiDeviceListening(clearActive) {
        if (clearActive !== false) stopAllMidiPerformanceNotes();
        if (_midiAccess) {
            _midiAccess.inputs.forEach(function(input) {
                input.onmidimessage = null;
            });
        }
        _midiInputHandler = null;
    }

    function playMetronomeClick(volume) {
        if (!window.AudioEngine || !AudioEngine.getContext) return;
        var ctx = AudioEngine.getContext();
        if (!ctx) return;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 1000;
        gain.gain.setValueAtTime(volume || 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        var masterGain = AudioEngine.isEnhanceEnabled ? null : null;
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    function startMetronomeCountdown(countdownBeats, beatPerMeasure, onComplete, metronomeEnabled) {
        var countdownEl = $('performance-countdown');
        var countdownText = $('performance-countdown-text');
        if (countdownEl) {
            countdownEl.style.display = 'flex';
        }

        var beatIndex = 0;
        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        var beatMs = tickMs * 4; // NBS: 4 ticks per beat

        function tick() {
            if (beatIndex >= countdownBeats) {
                if (countdownEl) countdownEl.style.display = 'none';
                if (onComplete) onComplete();
                return;
            }

            var remaining = countdownBeats - beatIndex;
            var beatInMeasure = beatIndex % beatPerMeasure;
            var isDownBeat = beatInMeasure === 0;

            if (countdownText) {
                countdownText.textContent = String(remaining);
                countdownText.style.color = isDownBeat ? 'var(--accent)' : '#ffffff';
            }

            if (metronomeEnabled !== false) {
                if (isDownBeat) {
                    playMetronomeClick(0.5);
                } else {
                    playMetronomeClick(0.25);
                }
            }

            beatIndex++;
            setTimeout(tick, beatMs);
        }

        tick();
    }

    function startContinuousMetronome(beatPerMeasure, metronomeEnabled) {
        stopContinuousMetronome();
        if (metronomeEnabled === false) return; // 节拍器关闭时不启动
        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        var beatMs = tickMs * 4; // NBS: 4 ticks per beat
        var beatIdx = 0;
        state._metronomeInterval = setInterval(function() {
            if (!state.performanceRecording) {
                stopContinuousMetronome();
                return;
            }
            if (beatIdx % beatPerMeasure === 0) {
                playMetronomeClick(0.4);
            } else {
                playMetronomeClick(0.2);
            }
            beatIdx++;
        }, beatMs);
    }

    function stopContinuousMetronome() {
        if (state._metronomeInterval) {
            clearInterval(state._metronomeInterval);
            state._metronomeInterval = null;
        }
    }

    function startPerformanceRecordingSetup() {
        showPerformanceSetupDialog(function(settings) {
            state.performanceSettings = settings;
            state.performanceNotes = [];
            state.performanceActiveKeys = {};
            if (settings.tempo !== state.tempo) {
                state.tempo = settings.tempo;
                var tempoInput = $('tempo-value');
                if (tempoInput) tempoInput.value = state.tempo;
            }

            var countdown = settings.beat * 2; // 2 小节

            startMetronomeCountdown(countdown, settings.beat, function() {
                // onComplete 回调
                state.performanceRecording = true;
                state.keyboardPianoEnabled = true;
                var kpBtn = $('btn-keyboard-piano');
                if (kpBtn) kpBtn.classList.add('active');
                pushUndo();
                state._perfRecordStartTick = state.currentTick;
                updatePlayButtonForRecording();
                startPerformanceTickCounter();
                // 演奏中持续节拍器 (受设置控制)
                startContinuousMetronome(settings.beat, settings.metronomeEnabled);
                if (settings.midiDeviceEnabled) {
                    startMidiDeviceListening();
                }
            }, settings.metronomeEnabled);
        });
    }

    function startPerformanceTickCounter() {
        stopPerformanceTickCounter();
        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        state._perfTickInterval = setInterval(function() {
            if (!state.performanceRecording) {
                stopPerformanceTickCounter();
                return;
            }
            state.currentTick++;
            var timeEl = $('progress-time');
            if (timeEl) {
                timeEl.textContent = Math.floor(state.currentTick) + ' / ' + Math.floor(Math.max(state.maxTick + 100, state.currentTick + 100)) + ' tick';
            }
            if (state.pianoRoll) {
                state.pianoRoll.playheadTick = state.currentTick;
                state.pianoRoll.currentTick = state.currentTick;
                state.pianoRoll.isPlaying = true;
                state.pianoRoll._lastTickTime = performance.now();
                state.pianoRoll._tickDuration = tickMs;
                state.pianoRoll.render();
            }
        }, tickMs);
    }

    function stopPerformanceTickCounter() {
        if (state._perfTickInterval) {
            clearInterval(state._perfTickInterval);
            state._perfTickInterval = null;
        }
        if (state.pianoRoll) {
            state.pianoRoll.isPlaying = false;
        }
    }

    function recordPerformanceKeyDown(nbsKey, velocity) {
        if (!state.performanceRecording) return;
        if (state.performanceActiveKeys[nbsKey]) return;
        velocity = Math.max(1, Math.min(100, Math.round(velocity || 100)));

        var nowTick = state.currentTick;
        if (state.performanceSettings && state.performanceSettings.snapEnabled) {
            var snapBeat = state.performanceSettings.snapBeat;
            var ticksPerBeat = 4;
            var gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
            nowTick = Math.round(nowTick / gridStep) * gridStep;
        }

        var layers = state.performanceTrackLayers && state.performanceTrackLayers.length
            ? state.performanceTrackLayers.slice()
            : (state.pianoRoll ? state.pianoRoll.getPerformanceLayers() : []);
        if (!layers.length) return;

        var activeCount = Object.keys(state.performanceActiveKeys).length;
        var layer = layers[Math.min(activeCount, layers.length - 1)];

        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length <= layer) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }

        var note = {
            tick: nowTick,
            layer: layer,
            instrument: state.currentInstrument,
            key: nbsKey,
            velocity: velocity,
            pan: 50,
            pitch: 0
        };

        // 性能优化：使用 noteIndex 快速查找同位置旧音符（O(1) 替代 O(n) 线性扫描）
        // addNote 内部已会删除同位置旧音符，这里只需同步更新 noteIndex
        var tickKey = Math.floor(nowTick);
        var tickNotes = state.noteIndex ? state.noteIndex.get(tickKey) : null;
        if (tickNotes) {
            for (var ti = tickNotes.length - 1; ti >= 0; ti--) {
                if (tickNotes[ti].tick === nowTick && tickNotes[ti].layer === layer) {
                    removeNoteFromIndex(tickNotes[ti]);
                }
            }
        }

        var createdNote = note;
        if (state.pianoRoll) {
            createdNote = state.pianoRoll.addNote(note);
            // skipPreview=true: handlePianoKeyDown 已播放过音色，避免双重播放
            // 录制时默认关闭放置动画以提升性能 (可在设置中开启)
            if (state.pianoRoll._addPlaceAnimation && state.recordingAnimationEnabled) {
                state.pianoRoll._addPlaceAnimation(createdNote, true);
            }
            state.notes = state.pianoRoll.getNotes();
        } else {
            createdNote.id = 'perf_' + Date.now() + '_' + Math.random().toString(16).slice(2);
            state.notes.push(createdNote);
        }

        // 增量更新索引（替代全量 buildNoteIndex 重建）
        addNoteToIndex(createdNote);
        // 节流 DOM 更新（合并多次按键的 UI 刷新为一次 RAF）
        schedulePerformanceUIUpdate();

        state.performanceActiveKeys[nbsKey] = {
            note: { key: nbsKey, instrument: state.currentInstrument, velocity: velocity, pan: 50, pitch: 0 },
            startTick: nowTick,
            layer: layer,
            noteId: createdNote.id
        };
    }

    function recordPerformanceKeyUp(nbsKey) {
        if (!state.performanceRecording) return;

        var entry = state.performanceActiveKeys[nbsKey];
        if (!entry) return;

        delete state.performanceActiveKeys[nbsKey];

        var nowTick = state.currentTick;
        var gridStep = 1;
        if (state.performanceSettings && state.performanceSettings.snapEnabled) {
            var snapBeat = state.performanceSettings.snapBeat;
            // NBS standard: 4 ticks per beat (quarter note)
            // snapBeat: 2=1/2 note, 4=1/4 note, 8=1/8 note, 16=1/16 note, 32=1/32 note
            var ticksPerBeat = 4; // NBS standard
            gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
            nowTick = Math.round(nowTick / gridStep) * gridStep;
        }

        if (state.performanceSettings && state.performanceSettings.sustainRecordEnabled && nowTick > entry.startTick) {
            var base = entry.note || {};
            var added = false;
            for (var tick = entry.startTick + gridStep; tick <= nowTick; tick += gridStep) {
                // 性能优化：用 noteIndex 快速查找旧音符 + 增量更新索引
                // addNote 内部已会删除同位置旧音符，无需手动 removeNotesByIds
                var sTickKey = Math.floor(tick);
                var sTickNotes = state.noteIndex ? state.noteIndex.get(sTickKey) : null;
                if (sTickNotes) {
                    for (var si = sTickNotes.length - 1; si >= 0; si--) {
                        if (sTickNotes[si].tick === tick && sTickNotes[si].layer === entry.layer) {
                            removeNoteFromIndex(sTickNotes[si]);
                        }
                    }
                }
                var note = {
                    tick: tick,
                    layer: entry.layer,
                    instrument: base.instrument,
                    key: base.key,
                    velocity: base.velocity,
                    pan: base.pan,
                    pitch: base.pitch
                };
                if (state.pianoRoll) {
                    var sCreated = state.pianoRoll.addNote(note);
                    addNoteToIndex(sCreated);
                    state.notes = state.pianoRoll.getNotes();
                } else {
                    note.id = 'perf_sustain_' + Date.now() + '_' + Math.random().toString(16).slice(2);
                    state.notes.push(note);
                    addNoteToIndex(note);
                }
                added = true;
            }
            if (added) {
                schedulePerformanceUIUpdate();
            }
        }

        if (state.pianoRoll) {
            state.pianoRoll.setSelectedKey(nbsKey);
        }
    }

    function commitPerformanceNotes() {
        if (state.performanceNotes.length === 0) return;

        pushUndo();

        for (var i = 0; i < state.performanceNotes.length; i++) {
            var pn = state.performanceNotes[i];

            if (!state.song) state.song = {};
            if (!state.song.layers) state.song.layers = [];
            while (state.song.layers.length <= pn.layer) {
                state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
            }

            var existingIds = [];
            for (var j = state.notes.length - 1; j >= 0; j--) {
                if (state.notes[j].tick === pn.tick && state.notes[j].layer === pn.layer) {
                    existingIds.push(state.notes[j].id);
                }
            }
            if (existingIds.length > 0 && state.pianoRoll) {
                state.pianoRoll.removeNotesByIds(existingIds);
            }

            var note = {
                id: 'perf_' + i + '_' + Date.now(),
                tick: pn.tick,
                layer: pn.layer,
                instrument: pn.instrument,
                key: pn.key,
                velocity: pn.velocity,
                pan: pn.pan,
                pitch: pn.pitch
            };
            state.notes.push(note);
            if (state.pianoRoll) {
                state.pianoRoll.addNote(note);
            }
        }

        buildNoteIndex(state.notes);
        updateTrackPanelUI();
        updateNoteCount();
        markDirty();

        state.performanceNotes = [];
    }

    function stopPerformanceRecording() {
        if (state.performanceRecording) {
            commitPerformanceNotes();
        }
        var activeKeys = Object.keys(state._activePianoKeys || {});
        for (var i = 0; i < activeKeys.length; i++) {
            var pianoKey = state._activePianoKeys[activeKeys[i]];
            if (pianoKey === true) pianoKey = KEYBOARD_PIANO_MAP[activeKeys[i]];
            if (pianoKey !== undefined && state.pianoRoll && state.pianoRoll.highlightPianoKey) {
                state.pianoRoll.highlightPianoKey(pianoKey, false);
            }
        }
        state.performanceRecording = false;
        state.performanceActiveKeys = {};
        state._activePianoKeys = {};
        state._perfRecordStartTick = null;
        stopPerformanceTickCounter();
        stopContinuousMetronome();
        stopMidiDeviceListening();

        var countdownEl = $('performance-countdown');
        if (countdownEl) countdownEl.style.display = 'none';

        updatePianoKeyboardHighlight();
        updatePlayButtonForRecording();
    }

    function updatePlayButtonForRecording() {
        var playBtn = $('btn-play');
        if (!playBtn) return;
        var icon = playBtn.querySelector('i');
        playBtn.classList.remove('perf-recording');
        if (state.performanceRecording) {
            playBtn.classList.add('perf-recording');
            if (icon) {
                icon.className = 'fa-solid fa-stop';
            }
            playBtn.setAttribute('title', '停止录制');
        } else if (state.performanceMode) {
            if (icon) {
                icon.className = 'fa-solid fa-circle';
            }
            playBtn.setAttribute('title', '开始演奏录制');
        } else {
            if (icon) {
                icon.className = 'fa-solid fa-play';
            }
            playBtn.setAttribute('title', '播放/暂停 (Space)');
        }
    }

    function updatePlayButtonForRecording() {
        var recordBtn = $('btn-performance-record');
        if (recordBtn) {
            var recordIcon = recordBtn.querySelector('i');
            recordBtn.style.display = state.performanceMode ? 'inline-flex' : 'none';
            recordBtn.classList.toggle('perf-recording', !!state.performanceRecording);
            if (recordIcon) {
                recordIcon.className = state.performanceRecording ? 'fa-solid fa-stop' : 'fa-solid fa-circle';
            }
            recordBtn.setAttribute('title', state.performanceRecording ? '停止录制' : '开始录制 (Space)');
        }

        var playBtn = $('btn-play');
        if (!playBtn) return;
        var icon = playBtn.querySelector('i');
        playBtn.classList.remove('perf-recording');
        if (icon) {
            icon.className = state.isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        }
        playBtn.setAttribute('title', state.performanceMode ? '播放/暂停试听' : '播放/暂停 (Space)');
    }

    // ============ 键盘快捷键 ============
    function initKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            var editableTarget = isEditableTarget(e.target);
            var pianoKey = getPianoKeyFromKeyboardEvent(e);
            var allowedEditShortcut = isAllowedPianoEditShortcut(e);

            if (state.performanceRecording) {
                if (pianoKey !== undefined && !editableTarget) {
                    e.preventDefault();
                    if (!state._activePianoKeys[e.code]) {
                        state._activePianoKeys[e.code] = pianoKey;
                        handlePianoKeyDown(pianoKey, e.code);
                    }
                    return;
                }
                // 演奏录制模式下允许 Delete 键删除选中的音符
                if (e.key === 'Delete' && !editableTarget) {
                    // 不 preventDefault, 让下面的 Delete 处理逻辑执行
                } else if (!editableTarget) {
                    e.preventDefault();
                    return;
                }
            }

            if (state.performanceMode && e.code === 'Space' && !editableTarget) {
                e.preventDefault();
                togglePerformanceRecording();
                return;
            }

            if (state.keyboardPianoEnabled && !editableTarget) {
                if (!allowedEditShortcut && pianoKey !== undefined) {
                    e.preventDefault();
                    if (!state._activePianoKeys[e.code]) {
                        state._activePianoKeys[e.code] = pianoKey;
                        handlePianoKeyDown(pianoKey, e.code);
                    }
                    return;
                }
                if (!allowedEditShortcut) {
                    e.preventDefault();
                    return;
                }
            }

            // 键盘钢琴按键处理（不拦截输入框）
            if (state.keyboardPianoEnabled) {
                // Don't intercept when Ctrl/Cmd is pressed (allow copy/paste/select-all)
                if (e.ctrlKey || e.metaKey) {
                    // Fall through to normal shortcut handling
                } else {
                    var pianoKey = KEYBOARD_PIANO_MAP[e.code];
                    if (pianoKey !== undefined && !state._activePianoKeys[e.code]) {
                        var isInput = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
                        if (!isInput) {
                            e.preventDefault();
                            state._activePianoKeys[e.code] = true;
                            handlePianoKeyDown(pianoKey, e.code);
                            return;
                        }
                    }
                }
            }

            // 忽略输入框中的快捷键
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                // 但允许 Escape
                if (e.key !== 'Escape') return;
            }

            var handled = true;

            // K 键不再作为快捷键，保留给钢琴键盘映射使用。
            if (false && e.code === 'KeyK' && !e.ctrlKey && !e.metaKey) {
                state.keyboardPianoEnabled = !state.keyboardPianoEnabled;
                var kpBtn = $('btn-keyboard-piano');
                if (kpBtn) kpBtn.classList.toggle('active', state.keyboardPianoEnabled);
                if (state.pianoRoll && state.pianoRoll.setShowKeyLabels) {
                    state.pianoRoll.setShowKeyLabels(state.keyboardPianoEnabled);
                }
                updatePianoKeyboardHighlight();
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                handlePlayToggle();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                handleStop();
                if (state.pianoRoll) state.pianoRoll._clearSelection();
                hideContextMenu();
                var aboutEl = $('about-popup');
                if (aboutEl) { aboutEl.style.display = ''; aboutEl.classList.remove('active'); }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (state.pianoRoll) {
                    var sel = state.pianoRoll.getSelectedNotes();
                    if (sel.length > 0) {
                        pushUndo();
                        state.pianoRoll.deleteSelected();
                        state.notes = state.pianoRoll.getNotes();
                        buildNoteIndex(state.notes);
                        updateNoteCount();
                        markDirty();
                    }
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                e.preventDefault();
                if (state.pianoRoll) {
                    state.pianoRoll.copySelected();
                    state.clipboard = state.pianoRoll.clipboard;
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                e.preventDefault();
                handlePaste();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                if (state.pianoRoll) state.pianoRoll.selectAll();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                performUndo();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                performRedo();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                handleDuplicate();
            } else if (window.innerWidth < 768 && e.key === 'm' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                toggleMuteSelectedTrack();
            } else if (window.innerWidth < 768 && e.key === 's' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                toggleSoloSelectedTrack();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                handleArrowKey(e.key);
            } else if (window.innerWidth >= 768 && (e.key === 'd' || e.key === 'D' || e.key === '1')) {
                switchTool('default');
            } else if (window.innerWidth >= 768 && (e.key === 's' || e.key === 'S' || e.key === '2')) {
                switchTool('select');
            } else if (window.innerWidth >= 768 && (e.key === 'e' || e.key === 'E' || e.key === '3')) {
                switchTool('eraser');
            } else if (window.innerWidth >= 768 && (e.key === 'b' || e.key === 'B' || e.key === '4')) {
                switchTool('brush');
            } else if (window.innerWidth >= 768 && (e.key === 'p' || e.key === 'P' || e.key === '5')) {
                switchTool('performance');
            } else {
                handled = false;
            }

            if (handled) {
                updateProgressUI();
                updateTrackPanelUI();
            }
        });

        document.addEventListener('keyup', function(e) {
            if (state.keyboardPianoEnabled && state._activePianoKeys[e.code]) {
                var pianoKey = state._activePianoKeys[e.code];
                state._activePianoKeys[e.code] = false;
                if (pianoKey === true) pianoKey = getPianoKeyFromKeyboardEvent(e);
                if (pianoKey !== undefined) {
                    handlePianoKeyUp(pianoKey, e.code);
                }
            }
        });
    }

    function handlePaste(targetTick, targetLayer) {
        if (!state.pianoRoll || !state.pianoRoll.hasClipboard()) return;
        pushUndo();
        var clipboard = state.pianoRoll.clipboard;
        if (!clipboard || clipboard.length === 0) return;
        var minTick = Math.min.apply(null, clipboard.map(function(n) { return n.tick; }));
        var minLayer = Math.min.apply(null, clipboard.map(function(n) { return n.layer; }));
        var offsetTick, offsetLayer;
        if (typeof targetTick === 'number') {
            offsetTick = targetTick - minTick;
        } else {
            // 优先使用鼠标所在格子作为粘贴起点
            if (state.pianoRoll._lastMouseX != null && state.pianoRoll._lastMouseY != null) {
                var mouseTick = state.pianoRoll._screenToTick(state.pianoRoll._lastMouseX);
                var mouseLayer = state.pianoRoll._screenToLayer(state.pianoRoll._lastMouseY);
                offsetTick = mouseTick - minTick;
                offsetLayer = mouseLayer - minLayer;
            } else {
                offsetTick = state.currentTick - minTick;
                var selNotes = state.pianoRoll.getSelectedNotes();
                if (selNotes.length > 0) {
                    offsetTick = selNotes[0].tick + 1 - minTick;
                }
                offsetLayer = 0;
            }
        }
        if (typeof targetLayer === 'number') {
            offsetLayer = targetLayer - minLayer;
        }
        state.pianoRoll.paste(offsetTick, offsetLayer);
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        markDirty();
    }

    function handlePasteOrSystemClipboard(targetTick, targetLayer) {
        if (state.pianoRoll && state.pianoRoll.hasClipboard()) {
            handlePaste(targetTick, targetLayer);
            return;
        }
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(text) {
                if (text && text.trim()) {
                    handleTextClipboardPaste(text);
                } else {
                    showSmallTip('Clipboard has no readable MIDI notes.');
                }
            }).catch(function() {
                showSmallTip('Use Ctrl+V to paste external MIDI data, or copy notes inside WebNBS first.');
            });
            return;
        }
        showSmallTip('Use Ctrl+V to paste external MIDI data, or copy notes inside WebNBS first.');
    }

    // 监听系统剪贴板，支持粘贴外部 MIDI 数据（桌面端 DAW 复制）
    function initClipboardPaste() {
        document.addEventListener('paste', function(e) {
            // 输入框中不拦截
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
                return;
            }
            var cd = e.clipboardData;
            if (!cd || !cd.items) return;
            var midiItem = null;
            var textItem = null;
            var audioItem = null;
            for (var i = 0; i < cd.items.length; i++) {
                var t = cd.items[i].type;
                if (t === 'audio/midi' || t === 'audio/x-midi' || t === 'application/x-midi' || t === 'application/midi' || t === 'application/octet-stream') {
                    midiItem = cd.items[i];
                } else if (t === 'text/plain') {
                    textItem = cd.items[i];
                } else if (t && t.indexOf('audio/') === 0) {
                    audioItem = cd.items[i];
                }
            }
            if (midiItem) {
                e.preventDefault();
                var blob = midiItem.getAsFile();
                if (blob) handleMidiClipboardPaste(blob);
            } else if (textItem) {
                // 暂不处理纯文本 MIDI 数据
            }
        });
    }

    function initExternalClipboardPaste() {
        document.addEventListener('paste', function(e) {
            if (e.defaultPrevented) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            var cd = e.clipboardData;
            if (!cd || !cd.items) return;
            var textItem = null;
            var audioItem = null;
            for (var i = 0; i < cd.items.length; i++) {
                var type = cd.items[i].type || '';
                if (type === 'text/plain') textItem = cd.items[i];
                else if (type.indexOf('audio/') === 0) audioItem = cd.items[i];
            }
            if (textItem) {
                e.preventDefault();
                textItem.getAsString(function(text) {
                    handleTextClipboardPaste(text);
                });
            } else if (audioItem) {
                e.preventDefault();
                showSmallTip('Audio clips do not contain convertible MIDI notes. Copy MIDI notes or MIDI clips instead.');
            }
        });
    }

    function showSmallTip(message) {
        var tip = document.createElement('div');
        tip.textContent = message;
        tip.style.cssText = 'position:fixed;left:50%;bottom:72px;z-index:100000;transform:translateX(-50%);'
            + 'max-width:min(92vw,420px);padding:8px 12px;border-radius:10px;background:rgba(20,20,32,0.94);'
            + 'border:1px solid rgba(255,255,255,0.12);box-shadow:0 10px 28px rgba(0,0,0,0.35);'
            + 'color:#fff;font-size:12px;line-height:1.35;text-align:center;pointer-events:none;opacity:0;'
            + 'transition:opacity 140ms ease, transform 140ms ease;';
        document.body.appendChild(tip);
        requestAnimationFrame(function() {
            tip.style.opacity = '1';
            tip.style.transform = 'translateX(-50%) translateY(-4px)';
        });
        setTimeout(function() {
            tip.style.opacity = '0';
            tip.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(function() { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 180);
        }, 2200);
    }

    function handleTextClipboardPaste(text) {
        if (!text || !text.trim()) return;
        var midiBlob = tryDecodeMidiText(text);
        if (midiBlob) {
            handleMidiClipboardPaste(midiBlob);
            return;
        }
        var notes = parseTextNotes(text);
        if (notes && notes.length > 0) {
            mergeMidiNotes(notes);
            return;
        }
        if (/fl studio|fruity|midi|score|piano roll|pattern|clip/i.test(text)) {
            showSmallTip('FL Studio private clipboard data is not exposed to browsers. Copy MIDI notes or export/drop a MIDI file.');
        }
    }

    function tryDecodeMidiText(text) {
        var s = text.trim();
        if (s.indexOf('data:audio/midi;base64,') === 0 || s.indexOf('data:audio/x-midi;base64,') === 0) {
            s = s.substring(s.indexOf(',') + 1);
        }
        if (s.indexOf('TVRoZ') !== 0 && s.indexOf('MThd') !== 0) return null;
        try {
            var bin = atob(s.replace(/\s+/g, ''));
            if (bin.substring(0, 4) !== 'MThd') return null;
            var bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return new Blob([bytes], { type: 'audio/midi' });
        } catch(e) {
            return null;
        }
    }

    function noteNameToMidi(name) {
        var m = String(name || '').trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
        if (!m) return null;
        var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
        if (m[2] === '#') base += 1;
        if (m[2] === 'b') base -= 1;
        return (parseInt(m[3], 10) + 1) * 12 + base;
    }

    function parseTextNotes(text) {
        var lines = text.split(/\r?\n/);
        var notes = [];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || /^[#;]/.test(line)) continue;
            var parts = line.split(/[\t,; ]+/).filter(Boolean);
            if (parts.length < 3) continue;
            var midi = noteNameToMidi(parts[0]);
            if (midi === null) midi = parseInt(parts[0], 10);
            if (isNaN(midi) || midi < 0 || midi > 127) continue;
            var tick = parseFloat(parts[1]);
            var layer = parts[3] !== undefined ? parseInt(parts[3], 10) : 0;
            var velocity = parts[4] !== undefined ? parseInt(parts[4], 10) : 100;
            if (!isFinite(tick)) continue;
            notes.push({
                tick: Math.max(0, Math.round(tick)),
                layer: Math.max(0, layer || 0),
                instrument: 0,
                key: Math.max(0, Math.min(87, Math.round(midi) - 21)),
                velocity: Math.max(1, Math.min(100, Math.round(velocity / 127 * 100) || 80)),
                pan: 50,
                pitch: 0
            });
        }
        return notes;
    }

    function handleMidiClipboardPaste(blob) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var arrayBuffer = e.target.result;
            var file = new File([arrayBuffer], 'clipboard.mid', { type: 'audio/midi' });
            var settings = {
                channel_instruments: {}, channel_octaves: {}, channel_keys: {},
                percussion_instruments: {}, percussion_pitches: {},
                remove_silent: true, name_layers: false, name_after_patches: false,
                same_tempo: true, tempo_changes: false,
                read_velocity: true, precision: 1,
                keep_note_length: 'none', timbre_fitting: {}, percussion_fitting: {}
            };
            API.importMidi(file, settings, function() {}).then(function(data) {
                if (data.song && data.song.notes && data.song.notes.length > 0) {
                    mergeMidiNotes(data.song.notes);
                } else {
                    showAppAlert('MIDI 中没有可导入的音符', {
                        title: '提示',
                        icon: 'fa-solid fa-circle-info'
                    });
                }
            }).catch(function(err) {
                // 粘贴时 MIDI 弹窗未打开, showMidiNotice 不可见
                showAppAlert('MIDI 粘贴失败: ' + formatError(err, '无法解析'), {
                    title: '粘贴失败',
                    icon: 'fa-solid fa-triangle-exclamation'
                });
            });
        };
        reader.readAsArrayBuffer(blob);
    }

    function mergeMidiNotes(notes) {
        if (!state.pianoRoll || !notes || notes.length === 0) return;
        pushUndo();
        var minTick = Math.min.apply(null, notes.map(function(n) { return n.tick; }));
        var offsetTick = state.currentTick - minTick;
        for (var i = 0; i < notes.length; i++) {
            var src = notes[i];
            state.pianoRoll.notes.push({
                id: state.pianoRoll._nextId(),
                tick: src.tick + offsetTick,
                layer: src.layer,
                instrument: src.instrument,
                key: Math.max(0, Math.min(87, src.key)),
                velocity: src.velocity,
                pan: src.pan,
                pitch: src.pitch
            });
        }
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        markDirty();
        state.pianoRoll.render();
    }

    function handleDuplicate() {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        pushUndo();
        state.pianoRoll.duplicateSelected();
        state.notes = state.pianoRoll.getNotes();
        buildNoteIndex(state.notes);
        updateNoteCount();
        markDirty();
    }

    function handleArrowKey(key) {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        pushUndo();

        var tickDelta = 0, layerDelta = 0;
        if (key === 'ArrowLeft') tickDelta = -1;
        if (key === 'ArrowRight') tickDelta = 1;
        if (key === 'ArrowUp') layerDelta = 1;
        if (key === 'ArrowDown') layerDelta = -1;

        for (var i = 0; i < state.notes.length; i++) {
            var n = state.notes[i];
            if (state.pianoRoll.selectedNotes[n.id]) {
                n.tick = Math.max(0, n.tick + tickDelta);
                n.layer = Math.max(0, Math.min(87, n.layer + layerDelta));
                // 注意: 不修改 n.key, 保持音符原音调
            }
        }
        // 移除被覆盖的音符
        state.pianoRoll._removeOverlappedNotes();
        state.pianoRoll.render();
        state.notes = state.pianoRoll.getNotes();
        updateProgressUI();
        markDirty();
    }

    function toggleMuteSelectedTrack() {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        var layer = sel[0].layer;
        var track = findTrackByLayer(layer);
        if (!track) return;
        pushUndo();
        track.muted = !track.muted;
        setLayerLock(layer, mutedSoloToLock(track.muted, track.solo));
        syncPianoRollTrackInfo();
        updateTrackPanelUI();
        markDirty();
    }

    function toggleSoloSelectedTrack() {
        if (!state.pianoRoll) return;
        var sel = state.pianoRoll.getSelectedNotes();
        if (sel.length === 0) return;
        var layer = sel[0].layer;
        var track = findTrackByLayer(layer);
        if (!track) return;
        pushUndo();
        track.solo = !track.solo;
        state.soloActive = track.solo;
        // 如果关闭 solo，清除所有 solo
        if (!state.soloActive) {
            for (var j = 0; j < state.tracks.length; j++) {
                state.tracks[j].solo = false;
                setLayerLock(state.tracks[j].layer, mutedSoloToLock(state.tracks[j].muted, false));
            }
        } else {
            setLayerLock(layer, mutedSoloToLock(track.muted, track.solo));
        }
        syncPianoRollTrackInfo();
        updateTrackPanelUI();
        markDirty();
    }

    function isTrackAudible(track) {
        if (state.soloActive) {
            return !!track.solo;
        }
        return !track.muted;
    }

    // ============ 进度条 ============
    function getSongLengthTicks() {
        if (state.flsEnabled && state.flsModel) {
            return state.flsModel.getSongLength();
        }
        return Math.max(state.maxTick + 4, 64);
    }

    function formatTime(ticks) {
        var sec = Math.max(0, ticks) / Math.max(1, state.tempo);
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateAutoScrollBtnIcon() {
        // 工具栏上的旧按钮已移入设置弹窗，这里主要同步设置弹窗 UI
        var btn = $('btn-auto-scroll');
        if (btn) {
            var ic = btn.querySelector('i');
            if (state.smoothScroll) {
                if (ic) ic.className = 'fa-solid fa-arrows-to-dot icon';
                btn.title = '平滑翻页: 开启';
            } else {
                if (ic) ic.className = 'fa-solid fa-forward-step icon';
                btn.title = '平滑翻页: 关闭';
            }
        }
        // 同步设置弹窗开关
        var smoothChk = $('settings-smooth-scroll');
        if (smoothChk) smoothChk.checked = !!state.smoothScroll;
    }

    // 打开设置弹窗 (不含速度控制)
    function openSettingsDialog(focus) {
        var popup = $('settings-popup');
        if (popup) {
            popup.style.display = 'flex';
            popup.classList.add('active');
        }
        // 同步当前状态
        updateAutoScrollBtnIcon();
        // 同步平滑翻页开关
        var smoothChk = $('settings-smooth-scroll');
        if (smoothChk) smoothChk.checked = !!state.smoothScroll;
        // 同步音效开关
        var audioChk = $('settings-audio-enhance');
        if (audioChk && window.AudioEngine && typeof AudioEngine.isEnhanceEnabled === 'function') {
            try { audioChk.checked = AudioEngine.isEnhanceEnabled(); } catch(e) {}
        }
    }

    function closeSettingsDialog() {
        var popup = $('settings-popup');
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
    }

    // 打开速度弹窗
    function openTempoDialog() {
        var popup = $('tempo-popup');
        if (popup) {
            popup.style.display = 'flex';
            popup.classList.add('active');
        }
        // 同步当前速度值
        var tempoVal = parseFloat(state.tempo) || 20;
        $setValue('settings-tempo-slider', Math.max(5, Math.min(655, tempoVal)));
        $setValue('settings-tempo-input', tempoVal);
        $setText('settings-tempo-value', tempoVal.toFixed(1));
    }

    function closeTempoDialog() {
        var popup = $('tempo-popup');
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
    }

    function updateProgressUI() {
        var totalTicks = getSongLengthTicks();
        // 同步 pianoRoll 的总 tick 数, 保证进度条/时间轴比例正确
        if (state.pianoRoll) {
            state.pianoRoll.totalTicks = totalTicks;
        }
        var timeEl = $('progress-time');
        if (timeEl) {
            timeEl.textContent = Math.floor(state.currentTick) + ' / ' + Math.floor(totalTicks) + ' tick';
        }
        updateFlsProgressBar();
    }

    // 进度条 UI 平滑更新: 不依赖 CSS transition, 直接 RAF 插值
    var _flsProgressLastTick = 0;
    var _flsProgressDragging = false; // 是否正在拖动进度条
    function updateFlsProgressBar() {
        var totalTicks = getSongLengthTicks();
        if (totalTicks <= 0) return;
        var fill = $('fls-progress-fill');
        var handle = $('fls-progress-handle');
        if (fill) fill.style.transition = 'none';
        if (handle) handle.style.transition = 'none';
    }

    // RAF 循环: 持续把 progress bar 拉向 currentTick, 实现丝滑连续移动
    function startFlsProgressRAF() {
        if (state._flsProgressRAF) return;
        var fill = $('fls-progress-fill');
        var handle = $('fls-progress-handle');
        var timeEl = $('fls-progress-time');
        var lastDrawTick = 0;
        function tick() {
            state._flsProgressRAF = requestAnimationFrame(tick);
            var totalTicks = getSongLengthTicks();
            if (totalTicks <= 0) {
                if (fill) fill.style.width = '0%';
                if (handle) handle.style.left = '0%';
                return;
            }
            var ct = state.currentTick;
            // 拖动期间不插值, 直接用 currentTick (seekToTick 已更新)
            if (_flsProgressDragging) {
                _flsProgressLastTick = ct;
            } else {
                // 插值: 指针以 0.45 因子向 currentTick 靠近, 实现丝滑追赶
                _flsProgressLastTick += (ct - _flsProgressLastTick) * 0.45;
            }
            var ratio = Math.max(0, Math.min(1, _flsProgressLastTick / totalTicks));
            var pct = (ratio * 100).toFixed(2) + '%';
            if (fill) fill.style.width = pct;
            if (handle) handle.style.left = pct;
            // 拖动时放大手柄, 增加触控反馈
            if (handle) {
                if (_flsProgressDragging) {
                    handle.style.transform = 'scale(1.4)';
                    handle.style.transition = 'transform 0.1s ease-out';
                } else {
                    handle.style.transform = 'scale(1)';
                    handle.style.transition = 'transform 0.15s ease-out';
                }
            }
            if (timeEl) {
                // 换算 ticks -> 拍 -> 秒 (按 tempo 估算)
                var tempo = Math.max(1, state.tempo || 20);
                var seconds = _flsProgressLastTick / tempo;
                var m = Math.floor(seconds / 60);
                var s = Math.floor(seconds % 60);
                var totalSec = totalTicks / tempo;
                var tm = Math.floor(totalSec / 60);
                var ts = Math.floor(totalSec % 60);
                timeEl.textContent = m + ':' + (s < 10 ? '0' + s : s) + ' / ' + tm + ':' + (ts < 10 ? '0' + ts : ts);
            }
        }
        // 初始化 lastTick
        _flsProgressLastTick = state.currentTick;
        state._flsProgressRAF = requestAnimationFrame(tick);
    }

    // 初始化进度条拖动 (支持 PC 鼠标 + 移动端触摸)
    function initFlsProgressBarDrag() {
        var bar = $('fls-progress-bar');
        if (!bar) return;

        function seekFromEvent(clientX) {
            var rect = bar.getBoundingClientRect();
            var ratio = (clientX - rect.left) / rect.width;
            ratio = Math.max(0, Math.min(1, ratio));
            var totalTicks = getSongLengthTicks();
            if (totalTicks <= 0) return;
            var targetTick = Math.round(ratio * totalTicks);
            seekToTick(targetTick);
        }

        // PC 端鼠标拖动
        bar.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return; // 仅左键
            e.preventDefault();
            _flsProgressDragging = true;
            seekFromEvent(e.clientX);
            var onMove = function(ev) {
                if (!_flsProgressDragging) return;
                seekFromEvent(ev.clientX);
            };
            var onUp = function() {
                _flsProgressDragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // 移动端触摸拖动
        bar.addEventListener('touchstart', function(e) {
            if (e.touches.length !== 1) return;
            e.preventDefault();
            _flsProgressDragging = true;
            seekFromEvent(e.touches[0].clientX);
        }, { passive: false });
        bar.addEventListener('touchmove', function(e) {
            if (!_flsProgressDragging || e.touches.length !== 1) return;
            e.preventDefault();
            seekFromEvent(e.touches[0].clientX);
        }, { passive: false });
        bar.addEventListener('touchend', function() {
            _flsProgressDragging = false;
        });
        bar.addEventListener('touchcancel', function() {
            _flsProgressDragging = false;
        });
    }

    function stopFlsProgressRAF() {
        if (state._flsProgressRAF) {
            cancelAnimationFrame(state._flsProgressRAF);
            state._flsProgressRAF = null;
        }
    }

    function updatePlayheadPosition() {
        if (!state.pianoRoll) return;
        var pr = state.pianoRoll;
        if (pr.playheadTick === null) return;
        pr.playheadTick = state.currentTick;
    }

    function seekToTick(tick) {
        var totalTicks = getSongLengthTicks();
        if (tick < 0) tick = 0;
        if (tick > totalTicks) tick = totalTicks;
        state.currentTick = tick;
        // 记录用户主动 seek 的位置 (用于暂停后重新播放时跳回此位置)
        state._lastSeekTick = tick;
        updateProgressUI();
        if (state.pianoRoll) {
            state.pianoRoll.playheadTick = tick;
            state.pianoRoll.currentTick = tick;
            // 同步平滑插值, 避免播放循环 RAF 用旧值覆盖导致播放头乱跳
            state.pianoRoll._smoothedPlayheadTick = tick;
            state.pianoRoll._smoothedProgressTick = tick;
            state.pianoRoll._lastTickTime = 0;
            state.pianoRoll.render();
        }
    }

    // ============ 播放控制 ============
    function setPlayButtonIcon(playing) {
        var pb = $('btn-play');
        if (pb) {
            var ic = pb.querySelector('i');
            if (ic) ic.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            if (playing) pb.classList.add('playing');
            else pb.classList.remove('playing');
        }
        var flsPlay = $('fls-btn-play');
        if (flsPlay) {
            var ic2 = flsPlay.querySelector('i');
            if (ic2) ic2.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            if (playing) flsPlay.classList.add('playing');
            else flsPlay.classList.remove('playing');
        }
    }

    function handlePlayToggle() {
        if (state.isPlaying) {
            // 暂停: 保持 currentTick 和 playhead 位置, 不重置
            state.isPlaying = false;
            stopPlaybackLoop();
            if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll();
            setPlayButtonIcon(false);
            // 把钢琴卷帘播放头锁定在当前 tick
            if (state.pianoRoll) {
                state.pianoRoll.isPlaying = false;
                state.pianoRoll.playheadTick = state.currentTick;
                state.pianoRoll._smoothedPlayheadTick = state.currentTick;
            }
            updateProgressUI();
        } else {
            // 开始播放: 播放时自动保存
            saveOnPlay();
            if (window.AudioEngine && AudioEngine.init) AudioEngine.init();
            // 暂停后重新播放: 跳转到上次 seek 的位置 (用户点击时间栏的位置)
            if (typeof state._lastSeekTick === 'number' && state._lastSeekTick >= 0) {
                state.currentTick = state._lastSeekTick;
            }
            // B 方案: 开始播放时立即把面板跳到 progress bar 当前 tick
            if (state.pianoRoll) {
                state.pianoRoll.isPlaying = true;
                var cfg = state.pianoRoll._cfg;
                var pw = state.pianoRoll._currentPanelWidth;
                var dw = state.pianoRoll.displayWidth;
                var cellW = cfg.cellW * state.pianoRoll.zoom;
                if (state.pianoRoll.smoothScrollEnabled) {
                    // 平滑翻页: tick 对齐播放头固定位置 (允许负 scrollX)
                    var playheadX = pw + (dw - pw) / 3;
                    state.pianoRoll.scrollX = state.currentTick * cellW + pw - playheadX;
                } else {
                    // 普通模式: 把 currentTick 对应位置滚到屏幕中间
                    var centerX = pw + (dw - pw) / 2;
                    state.pianoRoll.scrollX = state.currentTick * cellW + pw - centerX;
                    if (state.pianoRoll.scrollX < 0) state.pianoRoll.scrollX = 0;
                }
                state.pianoRoll.playheadTick = state.currentTick;
                state.pianoRoll._smoothedPlayheadTick = state.currentTick;
                state.pianoRoll._lastTickTime = performance.now();
            }
            state.isPlaying = true;
            setPlayButtonIcon(true);
            startPlaybackLoop();
            updateProgressUI();
        }
    }

    function togglePerformanceRecording() {
        if (!state.performanceMode) return;
        if (state.performanceRecording) {
            stopPerformanceRecording();
        } else {
            startPerformanceRecordingSetup();
        }
    }

    function handleStop() {
        state.isPlaying = false;
        stopPlaybackLoop();
        if (window.AudioEngine && AudioEngine.stopAll) AudioEngine.stopAll();
        setPlayButtonIcon(false);
        state.currentTick = 0;
        // 清除上次 seek 位置 (停止后从头开始, 暂停重播才跳回 seek 位置)
        state._lastSeekTick = null;
        updateProgressUI();
        if (state.performanceRecording) {
            commitPerformanceNotes();
            state.performanceRecording = false;
            state.performanceActiveKeys = {};
            stopPerformanceTickCounter();
            var cdEl = $('performance-countdown');
            if (cdEl) cdEl.style.display = 'none';
            updatePlayButtonForRecording();
        }
        stopContinuousMetronome();
        // 隐藏播放头
        var flsPh = $('fls-playhead');
        if (flsPh) flsPh.classList.remove('visible');
        if (state.flsEnabled && state.flsPlaylist) {
            state.flsPlaylist.updatePlayhead(0);
        }
        // 隐藏钢琴卷帘播放头 (null = 隐藏)
        if (state.pianoRoll) {
            state.pianoRoll.playheadTick = null;
            state.pianoRoll.currentTick = 0;
            state.pianoRoll.isPlaying = false;
            state.pianoRoll.scrollToTick(0);
            state.pianoRoll.render();
        }
    }

    function startPlaybackLoop() {
        stopPlaybackLoop();
        if (!state.noteIndex || state.noteIndex.size === 0) {
            if (state.flsEnabled && state.flsModel) {
                syncNotesFromFLS();
            } else {
                buildNoteIndex(state.notes);
            }
        }
        if (state.pianoRoll) state.pianoRoll._smoothedPlayheadTick = state.currentTick;

        var tickMs = Math.max(10, Math.floor(1000 / Math.max(1, state.tempo)));
        if (state.pianoRoll) {
            state.pianoRoll._tickDuration = tickMs;
            state.pianoRoll._lastTickTime = performance.now();
        }

        var _accumulator = 0;
        var _lastFrameTime = performance.now();
        var _tickCounter = 0;

        function playbackFrame(now) {
            if (!state.isPlaying) return;

            var elapsed = now - _lastFrameTime;
            _lastFrameTime = now;
            if (elapsed > 200) elapsed = tickMs;
            _accumulator += elapsed;

            while (_accumulator >= tickMs) {
                _accumulator -= tickMs;
                _tickCounter++;

                var tick = state.currentTick;

                var notesAtTick = getNotesAtTick(tick);
                for (var i = 0; i < notesAtTick.length; i++) {
                    var n = notesAtTick[i];
                    var audible = true;
                    var track = findTrackByLayer(n.layer);
                    if (track) {
                        audible = isTrackAudible(track);
                    }
                    if (audible && state.layerChannelMap) {
                        var midiCh = state.layerChannelMap[n.layer];
                        if (midiCh !== undefined && !isChannelAudible(midiCh)) {
                            audible = false;
                        }
                    }
                    if (audible && window.AudioEngine && AudioEngine.playNote) {
                        var trackVolume = track && track.volume !== undefined ? Number(track.volume) : 100;
                        trackVolume = isFinite(trackVolume) ? Math.max(0, Math.min(100, trackVolume)) : 100;
                        var noteVelocity = n.velocity === undefined ? 100 : n.velocity;
                        AudioEngine.playNote(n.instrument, n.key, noteVelocity * trackVolume / 100, n.pan || 50);
                    }
                }

                if (state.pianoRoll && state.highlightAnimationEnabled) {
                    state.pianoRoll.highlightPlayingNotes(notesAtTick);
                }

                if (state.flsEnabled && state.flsPlaylist) {
                    state.flsPlaylist.updatePlayhead(tick);
                }

                if (state.pianoRoll) {
                    state.pianoRoll.playheadTick = tick;
                }

                var timeEl = $('progress-time');
                if (timeEl) {
                    timeEl.textContent = Math.floor(tick) + ' / ' + Math.floor(getSongLengthTicks()) + ' tick';
                }

                state.currentTick = tick + 1;
                if (state.currentTick > state.maxTick + 4) state.currentTick = 0;

                $setText('current-pos', '位置: ' + state.currentTick);
            }

            // 更新 _lastTickTime 用于播放头平滑插值
            if (state.pianoRoll) {
                state.pianoRoll._lastTickTime = now - _accumulator;
            }

            if (_tickCounter % 2 === 0) {
                if (state.pianoRoll) {
                    state.pianoRoll.render();
                }
            }

            state._playbackRAF = requestAnimationFrame(playbackFrame);
        }
        state._playbackRAF = requestAnimationFrame(playbackFrame);
    }

    function stopPlaybackLoop() {
        if (state._playbackRAF) {
            cancelAnimationFrame(state._playbackRAF);
            state._playbackRAF = null;
        }
        if (state.pianoRoll) {
            state.pianoRoll.clearPlayHighlights();
        }
    }

    function restartPlayback() {
        if (state.isPlaying) startPlaybackLoop();
    }

    // ============ 轨道管理 ============
    function findTrackByLayer(layer) {
        for (var i = 0; i < state.tracks.length; i++) {
            if (state.tracks[i].layer === layer) return state.tracks[i];
        }
        return null;
    }

    // 将 lock 值转换为 muted/solo 状态
    // 0=unlocked, 1=locked(muted), 2=solo
    function lockToMutedSolo(lock) {
        lock = parseInt(lock) || 0;
        return { muted: lock === 1, solo: lock === 2 };
    }

    // 将 muted/solo 状态转换为 lock 值
    function mutedSoloToLock(muted, solo) {
        if (solo) return 2;
        if (muted) return 1;
        return 0;
    }

    // 从 state.song.layers 读取指定 layer 的 lock 值
    function getLayerLock(layer) {
        if (!state.song || !state.song.layers || !state.song.layers[layer]) return 0;
        return parseInt(state.song.layers[layer].lock) || 0;
    }

    // 更新 state.song.layers 中指定 layer 的 lock 值
    function setLayerLock(layer, lock) {
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        if (!state.song.layers[layer]) {
            state.song.layers[layer] = { name: 'Layer ' + (layer + 1), volume: 100, stereo: 100, lock: 0 };
        }
        state.song.layers[layer].lock = parseInt(lock) || 0;
    }

    // 同步 pianoRoll.trackInfo 与 state.tracks
    function syncPianoRollTrackInfo() {
        if (!state.pianoRoll) return;
        for (var i = 0; i < state.tracks.length; i++) {
            var t = state.tracks[i];
            state.pianoRoll.setTrackInfo(t.layer, {
                name: t.name,
                muted: !!t.muted,
                solo: !!t.solo,
                volume: (t.volume !== undefined) ? t.volume : 100
            });
        }
    }

    function initTracks() {
        // 分析现有音符，建立轨道
        rebuildTracks();
        updateTrackPanelUI();
    }

    function rebuildTracks() {
        var layerSet = {};
        for (var i = 0; i < state.notes.length; i++) {
            var l = state.notes[i].layer;
            if (!layerSet[l]) {
                layerSet[l] = { count: 0, instrument: state.notes[i].instrument };
            }
            layerSet[l].count++;
        }

        if (state.song && state.song.layers) {
            for (var si = 0; si < state.song.layers.length; si++) {
                if (!layerSet[si]) {
                    layerSet[si] = { count: 0, instrument: 0 };
                }
            }
        }

        var layers = Object.keys(layerSet).map(Number).sort(function(a, b) { return a - b; });
        var newTracks = [];
        for (var j = 0; j < layers.length; j++) {
            var l = layers[j];
            // 优先从 state.song.layers 的 lock 字段初始化静音/独奏状态,
            // 不继承上一个文件的轨道状态
            var existing = findTrackByLayer(l);
            // 没有现有轨道时, 优先使用 state.song.layers 中保存的名称
            var savedLayer = (state.song && state.song.layers && state.song.layers[l]) ? state.song.layers[l] : null;
            var fallbackName = (savedLayer && savedLayer.name) ? savedLayer.name : ('Track ' + (j + 1));
            newTracks.push({
                name: existing ? existing.name : fallbackName,
                layer: l,
                muted: existing ? !!existing.muted : lockToMutedSolo(getLayerLock(l)).muted,
                solo: existing ? !!existing.solo : lockToMutedSolo(getLayerLock(l)).solo,
                volume: (existing && existing.volume !== undefined)
                    ? existing.volume
                    : ((savedLayer && savedLayer.volume !== undefined) ? savedLayer.volume : 100),
                instrument: layerSet[l].instrument,
                noteCount: layerSet[l].count
            });
        }

        // 如果没有轨道，创建默认轨道
        if (newTracks.length === 0) {
            var ms0 = lockToMutedSolo(getLayerLock(0));
            var saved0 = (state.song && state.song.layers && state.song.layers[0]) ? state.song.layers[0] : null;
            newTracks.push({
                name: (saved0 && saved0.name) ? saved0.name : 'Track 1',
                layer: 0,
                muted: ms0.muted,
                solo: ms0.solo,
                volume: (saved0 && saved0.volume !== undefined) ? saved0.volume : 100,
                instrument: 0,
                noteCount: 0
            });
        }

        state.tracks = newTracks;
    }

    function updateTrackPanelUI() {
        rebuildTracks();
        syncPianoRollTrackInfo();
        if (state.pianoRoll) {
            state.pianoRoll.trackCount = (state.song && state.song.layers) ? state.song.layers.length : 1;
            state.pianoRoll.render();
        }
    }

    function updateTrackName(layerIndex, newName) {
        // 没有歌曲数据时自动初始化, 保证空工程下也能修改音轨名
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length <= layerIndex) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }
        pushUndo();
        state.song.layers[layerIndex].name = newName;
        // 同步更新内存中的轨道信息，否则 rebuildTracks 会用旧名称覆盖
        var track = findTrackByLayer(layerIndex);
        if (!track) {
            track = { layer: layerIndex, name: newName, muted: false, solo: false, volume: 100, instrument: 0, noteCount: 0 };
            state.tracks.push(track);
        } else {
            track.name = newName;
        }
        updateTrackPanelUI();
        markDirty();
    }

    function moveTrackUp(layerIndex) {
        if (!state.song || !state.song.layers || layerIndex <= 0) return;
        pushUndo();
        var layers = state.song.layers;
        var temp = layers[layerIndex];
        layers[layerIndex] = layers[layerIndex - 1];
        layers[layerIndex - 1] = temp;
        // 交换音符的 layer 值
        for (var i = 0; i < state.notes.length; i++) {
            if (state.notes[i].layer === layerIndex) state.notes[i].layer = layerIndex - 1;
            else if (state.notes[i].layer === layerIndex - 1) state.notes[i].layer = layerIndex;
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    function moveTrackDown(layerIndex) {
        if (!state.song || !state.song.layers || layerIndex >= state.song.layers.length - 1) return;
        pushUndo();
        var layers = state.song.layers;
        var temp = layers[layerIndex];
        layers[layerIndex] = layers[layerIndex + 1];
        layers[layerIndex + 1] = temp;
        for (var i = 0; i < state.notes.length; i++) {
            if (state.notes[i].layer === layerIndex) state.notes[i].layer = layerIndex + 1;
            else if (state.notes[i].layer === layerIndex + 1) state.notes[i].layer = layerIndex;
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    // 拖拽排序: 将 fromLayer 移动到 toLayer 的位置
    function reorderTrack(fromLayer, toLayer) {
        if (!state.song || !state.song.layers) return;
        if (fromLayer === toLayer) return;
        if (fromLayer < 0 || fromLayer >= state.song.layers.length) return;
        if (toLayer < 0 || toLayer >= state.song.layers.length) return;
        pushUndo();
        // 移动 layer 数组
        var movedLayer = state.song.layers.splice(fromLayer, 1)[0];
        state.song.layers.splice(toLayer, 0, movedLayer);
        // 重新编号所有音符的 layer
        // 先收集所有音符的原始 layer, 然后按新顺序映射
        var layerMap = {};
        // fromLayer 被移除后, fromLayer+1..toLayer 的元素前移一位, 然后 movedLayer 插入到 toLayer
        // 构建映射: 原始 layer → 新 layer
        if (fromLayer < toLayer) {
            // 向下移: fromLayer 的元素移到 toLayer
            // fromLayer → toLayer
            // fromLayer+1..toLayer → 前移一位 (各减1)
            layerMap[fromLayer] = toLayer;
            for (var l = fromLayer + 1; l <= toLayer; l++) {
                layerMap[l] = l - 1;
            }
        } else {
            // 向上移: fromLayer 的元素移到 toLayer
            // toLayer..fromLayer-1 → 后移一位 (各加1)
            // fromLayer → toLayer
            layerMap[fromLayer] = toLayer;
            for (var l2 = toLayer; l2 < fromLayer; l2++) {
                layerMap[l2] = l2 + 1;
            }
        }
        for (var i = 0; i < state.notes.length; i++) {
            var oldLayer = state.notes[i].layer;
            if (layerMap[oldLayer] !== undefined) {
                state.notes[i].layer = layerMap[oldLayer];
            }
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    function deleteTrack(layerIndex) {
        if (!state.song || !state.song.layers) return;
        if (state.song.layers.length <= 1) {
            showAppAlert('至少保留一条音轨。', {title: '删除音轨'});
            return;
        }
        pushUndo();
        state.song.layers.splice(layerIndex, 1);
        // 移除该层的音符
        state.notes = state.notes.filter(function(n) { return n.layer !== layerIndex; });
        // 重新编号
        for (var i = 0; i < state.notes.length; i++) {
            if (state.notes[i].layer > layerIndex) state.notes[i].layer--;
        }
        buildNoteIndex(state.notes);
        if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
        updateTrackPanelUI();
        markDirty();
    }

    function setTrackVolume(layerIndex, volume) {
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length <= layerIndex) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }

        state.song.layers[layerIndex].volume = volume;

        var track = findTrackByLayer(layerIndex);
        if (!track) {
            track = {
                layer: layerIndex,
                name: (state.song.layers[layerIndex] && state.song.layers[layerIndex].name) || ('Track ' + (layerIndex + 1)),
                muted: false,
                solo: false,
                volume: volume,
                instrument: 0,
                noteCount: 0
            };
            state.tracks.push(track);
        } else {
            track.volume = volume;
        }

        if (state.pianoRoll) {
            var currentInfo = state.pianoRoll.getTrackInfo ? state.pianoRoll.getTrackInfo(layerIndex) : null;
            state.pianoRoll.setTrackInfo(layerIndex, {
                name: currentInfo && currentInfo.name ? currentInfo.name : track.name,
                muted: currentInfo ? !!currentInfo.muted : !!track.muted,
                solo: currentInfo ? !!currentInfo.solo : !!track.solo,
                volume: volume
            });
        }

        updateTrackPanelUI();
        markDirty();
    }

    function bindTrackPanelEvents() {
        // 绑定在 piano_roll.js 内部完成 (hitTestTrackPanel)
        return;
    }

    function escapeHTML(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============ 上下文菜单 ============
    function createContextMenuDOM() {
        var menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';
        menu.style.cssText = 'position:fixed;z-index:9999;display:none;'
            + 'background:rgba(26,26,46,0.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 0;min-width:180px;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';
        document.body.appendChild(menu);
    }

    function showContextMenu(x, y, noteIds, isLongPress) {
        var menu = $('context-menu');
        if (!menu) return;
        hideContextMenu();

        state.contextMenuTarget = noteIds;
        var hasSelection = noteIds.length > 0;

        var t = i18nText;
        var html = '';
        // 始终显示：全选
        html += '<div class="ctx-item" data-action="select-all"><span class="ctx-icon"><i class="fa-solid fa-object-group"></i></span> ' + t('全选') + '</div>';
        if (hasSelection) {
            html += '<div class="ctx-item" data-action="deselect"><span class="ctx-icon"><i class="fa-solid fa-xmark"></i></span> ' + t('取消选择') + '</div>';
            html += '<div class="ctx-separator"></div>';
            html += '<div class="ctx-item" data-action="cut"><span class="ctx-icon"><i class="fa-solid fa-scissors"></i></span> ' + t('剪切') + '</div>';
            html += '<div class="ctx-item" data-action="copy"><span class="ctx-icon"><i class="fa-solid fa-copy"></i></span> ' + t('复制') + '</div>';
            html += '<div class="ctx-item" data-action="delete"><span class="ctx-icon"><i class="fa-solid fa-trash"></i></span> ' + t('删除') + '</div>';
            html += '<div class="ctx-item" data-action="change-instrument" id="ctx-change-instrument"><span class="ctx-icon"><i class="fa-solid fa-music"></i></span> ' + t('更改乐器') + ' <span class="ctx-arrow"><i class="fa-solid fa-caret-right"></i></span></div>';
            html += '<div class="ctx-item" data-action="change-volume"><span class="ctx-icon"><i class="fa-solid fa-volume-high"></i></span> ' + t('更改音量') + '</div>';
        }
        html += '<div class="ctx-separator"></div>';
        html += '<div class="ctx-item" data-action="paste"><span class="ctx-icon"><i class="fa-solid fa-paste"></i></span> ' + t('粘贴') + '</div>';

        menu.innerHTML = html;
        menu.style.display = 'block';
        window.WebNBSPositionFlyout(menu, { left: x, right: x, top: y, bottom: y });

        // 绑定菜单项事件
        var items = menu.querySelectorAll('.ctx-item');
        for (var i = 0; i < items.length; i++) {
            items[i].addEventListener('click', function(e) {
                var action = this.dataset.action;
                if (action === 'change-instrument') {
                    handleContextAction(action, x, y);
                    e.stopPropagation();
                    return;
                }
                handleContextAction(action, x, y);
                hideContextMenu();
                e.stopPropagation();
            });
        }
    }

    function hideContextMenu() {
        var menu = $('context-menu');
        if (menu) menu.style.display = 'none';
        // 也隐藏子菜单
        var subMenu = $('instrument-submenu');
        if (subMenu) subMenu.remove();
        state.contextMenuTarget = null;
    }

    function handleContextAction(action, x, y) {
        var noteIds = state.contextMenuTarget;
        var hasNotes = noteIds && noteIds.length > 0;

        switch (action) {
            case 'select-all':
                if (state.pianoRoll) state.pianoRoll.selectAll();
                return;
            case 'deselect':
                if (state.pianoRoll) state.pianoRoll.clearSelection();
                return;
            case 'paste':
                var pasteTick, pasteLayer;
                if (state.pianoRoll && typeof x === 'number' && typeof y === 'number') {
                    pasteTick = state.pianoRoll._screenToTick(x);
                    pasteLayer = state.pianoRoll._screenToLayer(y);
                }
                handlePasteOrSystemClipboard(pasteTick, pasteLayer);
                return;
        }

        if (!hasNotes) return;

        switch (action) {
            case 'delete':
                pushUndo();
                if (state.pianoRoll) {
                    state.pianoRoll.selectNotes(noteIds);
                    state.pianoRoll.deleteSelected();
                    state.notes = state.pianoRoll.getNotes();
                }
                buildNoteIndex(state.notes);
                updateNoteCount();
                markDirty();
                break;
            case 'copy':
                if (state.pianoRoll) {
                    state.pianoRoll.selectNotes(noteIds);
                    state.pianoRoll.copySelected();
                    state.clipboard = state.pianoRoll.clipboard;
                }
                break;
            case 'cut':
                if (state.pianoRoll) {
                    state.pianoRoll.selectNotes(noteIds);
                    state.pianoRoll.copySelected();
                    state.clipboard = state.pianoRoll.clipboard;
                    pushUndo();
                    state.pianoRoll.deleteSelected();
                    state.notes = state.pianoRoll.getNotes();
                    buildNoteIndex(state.notes);
                    updateNoteCount();
                    markDirty();
                }
                break;
            case 'change-instrument':
                showInstrumentSubMenu(x, y, noteIds);
                break;
            case 'change-volume':
                showVolumeDialog(noteIds);
                break;
        }
    }

    function showInstrumentSubMenu(x, y, noteIds) {
        var existing = $('instrument-submenu');
        if (existing) existing.remove();

        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        var sub = document.createElement('div');
        sub.id = 'instrument-submenu';
        sub.style.cssText = 'position:fixed;z-index:10000;'
            + 'background:rgba(22,33,62,0.95);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:6px 0;min-width:180px;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:12px;max-height:300px;overflow-y:auto;';

        for (var i = 0; i < names.length; i++) {
            var color = colors[i] || '#d4a96a';
            var item = document.createElement('div');
            item.className = 'ctx-item';
            item.style.cssText = 'padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;';
            item.innerHTML = '<span style="display:inline-block;width:24px;height:24px;flex-shrink:0;position:relative;border-radius:5px;overflow:hidden;background:' + color + ';">'
                + '<img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" style="position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;border-radius:5px;" /></span> ' + names[i];
            item.dataset.instrument = i;

            item.addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.08)'; });
            item.addEventListener('mouseleave', function() { this.style.background = ''; });
            // 移动端: touchstart 阻止冒泡, 防止 capture 阶段误关菜单; 用 click 触发选择
            item.addEventListener('touchstart', function(e) {
                e.stopPropagation();
            }, { passive: true });
            item.addEventListener('click', function(e) {
                var inst = parseInt(this.dataset.instrument);
                // 点击音色时播放预览音效（使用钢琴键盘选中的音调）
                var selectedKey = getSelectedPianoKey();
                if (selectedKey !== null && window.AudioEngine && AudioEngine.playNote) {
                    AudioEngine.playNote(inst, selectedKey, 80);
                }
                changeInstrumentForNotes(noteIds, inst);
                if ($('instrument-submenu')) $('instrument-submenu').remove();
                hideContextMenu();
                e.stopPropagation();
            });
            sub.appendChild(item);
        }

        document.body.appendChild(sub);
        window.WebNBSPositionFlyout(sub, { left: x, right: x, top: y, bottom: y }, { placement: 'right-start' });

        // 点击其他地方关闭子菜单
        var closeSub = function(e) {
            if (!sub.contains(e.target)) {
                sub.remove();
                document.removeEventListener('click', closeSub);
            }
        };
        setTimeout(function() {
            document.addEventListener('click', closeSub);
        }, 10);
    }

    // 获取钢琴键盘当前选中的音调
    function getSelectedPianoKey() {
        var keyboard = $('piano-keyboard');
        if (!keyboard) return null;
        var selected = keyboard.querySelector('.piano-key.selected');
        if (selected) return parseInt(selected.dataset.key);
        return null;
    }

    function changeInstrumentForNotes(noteIds, instrument) {
        pushUndo();
        // note id 为字符串（如 "note_1"），直接作为 key，不要 parseInt
        var idSet = {};
        for (var k = 0; k < noteIds.length; k++) {
            idSet[noteIds[k]] = true;
        }
        // 同时更新 state.notes 与 pianoRoll.notes，避免两侧引用不一致导致 UI 不刷新
        function applyTo(list) {
            if (!list) return;
            for (var i = 0; i < list.length; i++) {
                if (idSet[list[i].id]) {
                    list[i].instrument = instrument;
                }
            }
        }
        applyTo(state.notes);
        if (state.pianoRoll) applyTo(state.pianoRoll.notes);
        if (state.pianoRoll) {
            state.pianoRoll.render();
        }
        updateNoteCount();
        updateTrackPanelUI();
        markDirty();
    }

    function showVolumeDialog(noteIds) {
        showAppPrompt('输入音量 (0-100):', '100', {title: '修改音量', icon: 'fa-solid fa-volume-high'}).then(function(vol) {
            if (vol === null) return;
            var v = parseInt(vol);
            if (isNaN(v)) return;
            v = Math.max(0, Math.min(100, v));
            pushUndo();
            for (var i = 0; i < state.notes.length; i++) {
                if (noteIds.indexOf(state.notes[i].id) !== -1) {
                    state.notes[i].velocity = v;
                }
            }
            if (state.pianoRoll) {
                state.pianoRoll.render();
            }
            markDirty();
        });
    }

    // ============ 乐器选择器 ============
    function createInstrumentSelectorDOM() {
        var btn = $('btn-instrument-selector');
        if (!btn) return;

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleInstrumentPopup();
        });

        // 创建弹窗（如已存在则复用）
        var popup = $('instrument-popup');
        if (popup) return;
        popup = document.createElement('div');
        popup.id = 'instrument-popup';
        popup.className = 'instrument-popup';
        popup.style.cssText = 'position:fixed;z-index:9998;'
            + 'background:rgba(22,33,62,0.96);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);'
            + 'border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:8px 0;min-width:200px;'
            + 'box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;max-height:400px;overflow-y:auto;';
        document.body.appendChild(popup);
    }

    function toggleInstrumentPopup() {
        // 桌面端使用浮动窗口
        if (window.innerWidth >= 769) {
            showInstrumentFloatingWindow();
            return;
        }
        var popup = $('instrument-popup');
        if (!popup) return;
        if (popup.classList.contains('visible')) {
            popup.classList.remove('visible');
            return;
        }
        popup.classList.add('visible');
        renderInstrumentPopup();
        var btn = $('btn-instrument-selector');
        if (btn) {
            var btnRect = btn.getBoundingClientRect();
            window.WebNBSPositionFlyout(popup, btnRect, { placement: 'top-end' });
        }
    }

    function showInstrumentFloatingWindow() {
        var existing = $('inst-float-win');
        if (existing) { existing.remove(); return; }

        var win = document.createElement('div');
        win.id = 'inst-float-win';
        win.style.cssText = 'position:fixed;bottom:40px;right:16px;z-index:9998;background:rgba(32,32,32,0.95);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid var(--ctrl-stroke-default);border-radius:10px;padding:8px;display:grid;grid-template-columns:repeat(8,40px);gap:4px;box-shadow:0 8px 32px rgba(0,0,0,0.5);cursor:default;';

        var instNames = getInstrumentNames();

        // 更新所有按钮的高亮状态
        function updateButtonHighlight() {
            var btns = win.querySelectorAll('button');
            for (var b = 0; b < btns.length; b++) {
                var bIdx = parseInt(btns[b].getAttribute('data-idx'));
                if (bIdx === state.currentInstrument) {
                    btns[b].style.background = 'var(--ctrl-fill-pressed)';
                    btns[b].style.borderColor = 'var(--accent)';
                } else {
                    btns[b].style.background = 'var(--ctrl-fill-default)';
                    btns[b].style.borderColor = 'var(--ctrl-stroke-default)';
                }
            }
        }

        for (var i = 0; i < instNames.length; i++) {
            (function(idx) {
                var btn = document.createElement('button');
                btn.setAttribute('data-idx', idx);
                btn.style.cssText = 'width:36px;height:36px;padding:2px;background:' + (state.currentInstrument === idx ? 'var(--ctrl-fill-pressed)' : 'var(--ctrl-fill-default)') + ';border:1px solid ' + (state.currentInstrument === idx ? 'var(--accent)' : 'var(--ctrl-stroke-default)') + ';border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background 0.12s,border-color 0.12s;';
                btn.innerHTML = '<img src="static/sprites/spr_instrumenticons/inst_' + idx + '.png" style="width:28px;height:28px;image-rendering:pixelated;" onerror="this.style.display=\'none\'">';
                btn.title = instNames[idx];
                btn.addEventListener('mouseenter', function() {
                    btn.style.background = 'var(--ctrl-fill-hover)';
                    btn.style.borderColor = 'var(--accent)';
                });
                btn.addEventListener('mouseleave', function() {
                    if (state.currentInstrument !== idx) {
                        btn.style.background = 'var(--ctrl-fill-default)';
                        btn.style.borderColor = 'var(--ctrl-stroke-default)';
                    }
                });
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    state.currentInstrument = idx;
                    if (state.pianoRoll) state.pianoRoll.setInstrument(idx);
                    updateInstrumentSelectorUI();
                    // 不再关闭窗口, 仅更新高亮
                    updateButtonHighlight();
                    markDirty();
                });
                win.appendChild(btn);
            })(i);
        }

        document.body.appendChild(win);

        // 拖拽功能: 在窗口空白处 (非按钮/图片) 按下鼠标可拖动窗口
        var isDragging = false;
        var dragOffsetX = 0, dragOffsetY = 0;

        win.addEventListener('mousedown', function(e) {
            // 仅在点击窗口本身 (非乐器按钮/图片) 时开始拖拽
            if (e.target === win || (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'IMG')) {
                isDragging = true;
                var rect = win.getBoundingClientRect();
                dragOffsetX = e.clientX - rect.left;
                dragOffsetY = e.clientY - rect.top;
                win.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        document.addEventListener('mousemove', function(e) {
            if (isDragging) {
                win.style.left = (e.clientX - dragOffsetX) + 'px';
                win.style.top = (e.clientY - dragOffsetY) + 'px';
                win.style.right = 'auto';
                win.style.bottom = 'auto';
            }
        });

        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                win.style.cursor = 'default';
            }
        });
    }

    function renderInstrumentPopup() {
        var popup = $('instrument-popup');
        if (!popup) return;
        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        var html = '';
        for (var i = 0; i < names.length; i++) {
            var sel = (i === state.currentInstrument) ? ' ctx-selected' : '';
            var color = colors[i] || '#d4a96a';
            html += '<div class="ctx-item inst-popup-item' + sel + '" data-instrument="' + i + '" style="padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;">';
            // 方块图标 (24x24, 纯色圆角正方形, 无边框无发光)
            html += '<span style="display:inline-block;width:24px;height:24px;flex-shrink:0;position:relative;border:none;border-radius:3px;background:' + color + ';overflow:hidden;">';
            html += '<img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" onerror="this.style.display=\'none\'" style="position:absolute;top:2px;left:2px;width:20px;height:20px;image-rendering:pixelated;image-rendering:crisp-edges;" />';
            html += '</span>';
            html += '<span>' + names[i] + '</span>';
            html += '</div>';
        }
        popup.innerHTML = html;

        var items = popup.querySelectorAll('.inst-popup-item');
        for (var j = 0; j < items.length; j++) {
            items[j].addEventListener('mouseenter', function() { this.style.background = 'rgba(255,255,255,0.08)'; });
            items[j].addEventListener('mouseleave', function() { this.style.background = ''; });
            items[j].addEventListener('click', function(e) {
                var inst = parseInt(this.dataset.instrument);
                state.currentInstrument = inst;
                if (state.pianoRoll) state.pianoRoll.setInstrument(inst);
                updateInstrumentSelectorUI();
                popup.classList.remove('visible');
                markDirty();
                e.stopPropagation();
            });
        }
    }

    function updateInstrumentSelectorUI() {
        var names = getInstrumentNames();
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];
        var instIdx = state.currentInstrument % 20;
        var dot = $('inst-color-dot');
        var name = $('inst-name-text');
        if (dot) {
            var color = colors[instIdx] || '#d4a96a';
            dot.textContent = '';
            dot.classList.remove('instrument-icon-fallback');
            var icon = document.createElement('img');
            icon.src = '/static/sprites/spr_instrumenticons/inst_' + instIdx + '.png';
            icon.alt = '';
            icon.setAttribute('aria-hidden', 'true');
            icon.onerror = function() {
                this.remove();
                dot.classList.add('instrument-icon-fallback');
            };
            dot.appendChild(icon);
            dot.style.background = color;
        }
        if (name) name.textContent = names[instIdx] || i18nText('竖琴');
    }

    // ============ 轨道面板 ============
    function createTrackPanelDOM() {
        // 轨道信息完全通过 canvas 内绘制呈现 (见 piano_roll.js _drawTrackPanel)
        // 此处仅添加一些辅助样式
        if ($('track-panel-style-added')) return;
        var style = document.createElement('style');
        style.id = 'track-panel-style-added';
        style.textContent = ''
            + '.context-menu .ctx-item { padding: 8px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.1s; }'
            + '.context-menu .ctx-item:hover { background: rgba(255,255,255,0.08); }'
            + '.context-menu .ctx-disabled { color: #555; cursor: default; }'
            + '.context-menu .ctx-separator { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }'
            + '.context-menu .ctx-icon { font-size: 14px; width: 18px; text-align: center; }'
            + '.context-menu .ctx-arrow { margin-left: auto; font-size: 10px; opacity: 0.5; }'
            + '.ctx-selected { background: rgba(78,205,196,0.15); }'
            + '.instrument-popup { position: fixed; z-index: 9998; display: none; background: rgba(22,33,62,0.96); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 8px 0; min-width: 200px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); color: #eaeaea; font-size: 13px; max-height: 400px; overflow-y: auto; }'
            + '.instrument-popup.active { display: block; }'
            + '.instrument-popup .ctx-item { padding: 8px 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; }'
            + '.instrument-popup .ctx-item:hover { background: rgba(255,255,255,0.08); }'
            + '@keyframes pianoSlideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }'
            + '@keyframes pianoSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }'
            + '#piano-keyboard { animation: pianoSlideUp 0.28s ease-out; }'
            + '#piano-keyboard.collapsing { animation: pianoSlideDown 0.28s ease-in; }'
            + '#piano-keyboard .piano-key { transition: background 0.1s, transform 0.1s; }'
            + '#piano-keyboard .piano-key.white:active, #piano-keyboard .piano-key.white.selected { background: #4ecdc4 !important; }'
            + '#piano-keyboard .piano-key.black:active, #piano-keyboard .piano-key.black.selected { background: #4ecdc4 !important; }';
        document.head.appendChild(style);
    }

    function syncTrackPanelToggleButton() {
        var trackPanelToggle = $('track-panel-toggle');
        if (!trackPanelToggle || !state.pianoRoll) return;
        var widthRef = (state.pianoRoll._panelTargetWidth !== undefined && state.pianoRoll._panelTargetWidth !== null)
            ? state.pianoRoll._panelTargetWidth
            : state.pianoRoll._currentPanelWidth;
        var collapsed = widthRef <= 10;
        trackPanelToggle.classList.toggle('collapsed', collapsed);
        var icon = trackPanelToggle.querySelector('i');
        if (icon) icon.className = collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
        var label = collapsed ? '展开音轨信息栏' : '折叠音轨信息栏';
        trackPanelToggle.title = label;
        trackPanelToggle.setAttribute('aria-label', label);
        trackPanelToggle.style.display = 'flex';
        trackPanelToggle.style.visibility = 'visible';
        trackPanelToggle.style.opacity = '1';
        trackPanelToggle.style.pointerEvents = 'auto';
    }

    // ============ Toast 通知系统 ============
    function _ensureToastContainer() {
        var c = $('toast-container');
        if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
        return c;
    }
    function showToast(message, options) {
        options = options || {};
        var container = _ensureToastContainer();
        var toast = document.createElement('div');
        toast.className = 'toast ' + (options.type || 'info');
        var icon = document.createElement('i');
        icon.className = options.icon || 'fa-solid fa-circle-info';
        icon.style.marginRight = '8px';
        var content = document.createElement('span');
        content.className = 'toast-message';
        content.textContent = message;
        toast.appendChild(icon); toast.appendChild(content);
        var fill = null;
        if (options.progress !== undefined) {
            var bar = document.createElement('div');
            bar.className = 'toast-progress';
            fill = document.createElement('div');
            fill.className = 'toast-progress-fill';
            fill.style.width = '0%';
            bar.appendChild(fill); toast.appendChild(bar);
        }
        container.appendChild(toast);
        requestAnimationFrame(function() { toast.classList.add('toast-show'); });
        toast._content = content; toast._fill = fill;
        if (options.duration > 0) setTimeout(function() { dismissToast(toast); }, options.duration);
        return toast;
    }
    function updateToast(toast, message, progress) {
        if (!toast) return;
        if (message !== undefined && toast._content) toast._content.textContent = message;
        if (progress !== undefined && toast._fill) toast._fill.style.width = Math.round(progress) + '%';
    }
    function dismissToast(toast, delay) {
        if (!toast) return;
        if (delay > 0) { setTimeout(function() { dismissToast(toast, 0); }, delay); return; }
        toast.classList.remove('toast-show');
        setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }

    // ============ SoundFont 音色库初始化 ============
    // 策略: 页面加载只读取本地缓存; 下载由设置决定
    //   'ask'  (默认) 真正播放 MIDI 音符时弹窗询问
    //   'auto'         真正播放 MIDI 音符时静默后台下载
    //   'off'          不使用 (内置合成器)
    var _sfConfig = null;
    var _sfOnDemandTriggered = false;

    function updateSfStatusText(status, info) {
        var el = $('settings-midi-sf-status');
        if (!el) return;
        var text = status;
        switch (status) {
            case 'idle': text = '未下载 (播放 MIDI 音符时按设置提示)'; break;
            case 'downloading': text = '正在下载' + (info && info.name ? ' ' + info.name : '') + '...'; break;
            case 'loading': text = '正在解析音色库...'; break;
            case 'ready':
                text = (info && info.name ? info.name : 'MIDI 音色库') + ' 已就绪 (' + ((info && info.presets) || 0) + ' 个预设' +
                    (info && info.engine ? ', ' + info.engine : '') + ')';
                break;
            case 'failed': text = '下载/解析失败, 将使用内置合成器'; break;
        }
        el.textContent = text;
    }

    function getMidiSfMode() {
        try {
            var v = localStorage.getItem('midi_sf_mode');
            if (v === 'auto' || v === 'off') return v;
        } catch (e) {}
        return 'ask';
    }

    function startSfDownload() {
        if (!window.SoundfontLoader) return;
        SoundfontLoader.download();
    }

    // 真正需要播放 MIDI 音符时调用: 按设置触发下载/询问 (每会话仅一次)
    function ensureSoundfontOnDemand() {
        if (_sfOnDemandTriggered) return;
        if (!window.SoundfontLoader || !_sfConfig || !_sfConfig.url) return;
        var mode = getMidiSfMode();
        if (mode === 'off') return;
        var st = SoundfontLoader.getStatus();
        if (st === 'ready' || st === 'downloading' || st === 'loading') return;
        _sfOnDemandTriggered = true;
        if (mode === 'auto') {
            startSfDownload();
        } else {
            // ask: 弹窗询问
            showAppConfirm('播放 MIDI 音符需要音色库 (SF3/SF2) 才能获得真实音色。是否现在下载？下载后可离线使用，解析期间仍可用内置合成器播放。', {
                title: '下载 MIDI 音色库',
                icon: 'fa-solid fa-cloud-arrow-down',
                okText: '下载', cancelText: '暂不'
            }).then(function(ok) {
                if (ok) startSfDownload();
            });
        }
    }

    function initSoundfontLoader(sfCfg) {
        if (!sfCfg || !sfCfg.url) return;
        if (!window.SoundfontLoader) return;
        _sfConfig = sfCfg;
        var toast = null;
        SoundfontLoader.onStatusChange = function(status, info) {
            updateSfStatusText(status, info);
            switch (status) {
                case 'downloading':
                    toast = showToast('正在下载 ' + (info.name || 'MIDI 音色库') + '...', {
                        icon: 'fa-solid fa-cloud-arrow-down', progress: 0
                    });
                    break;
                case 'loading':
                    if (toast) {
                        var ic = toast.querySelector('i');
                        if (ic) { ic.className = 'fa-solid fa-cog fa-spin'; ic.style.marginRight = '8px'; }
                        updateToast(toast, '正在解析音色库...', 0);
                    }
                    break;
                case 'ready':
                    if (toast) {
                        var ic2 = toast.querySelector('i');
                        if (ic2) { ic2.className = 'fa-solid fa-circle-check'; ic2.style.marginRight = '8px'; }
                        var fmt = info.isSF3 ? 'SF3' : 'SF2';
                        var eng = info.engine ? ' (' + info.engine + ')' : '';
                        updateToast(toast, fmt + ' 音色库已就绪' + eng + ' (' + (info.presets || 0) + ' 个预设)', 100);
                        dismissToast(toast, 3000);
                    }
                    break;
                case 'idle':
                    break;
                case 'failed':
                    if (toast) {
                        var ic3 = toast.querySelector('i');
                        if (ic3) { ic3.className = 'fa-solid fa-circle-exclamation'; ic3.style.marginRight = '8px'; }
                        updateToast(toast, '音色库下载失败, 将使用内置合成器', 0);
                        dismissToast(toast, 5000);
                    } else {
                        toast = showToast('音色库下载失败, 将使用内置合成器', {
                            icon: 'fa-solid fa-circle-exclamation', type: 'error', duration: 5000
                        });
                    }
                    break;
            }
        };
        SoundfontLoader.onProgress = function(loaded, total, name) {
            if (!toast) return;
            if (total > 0) {
                updateToast(toast, '正在下载 ' + name + ' (' + (loaded/1048576).toFixed(1) + '/' + (total/1048576).toFixed(1) + ' MB)', (loaded/total)*100);
            } else {
                updateToast(toast, '正在下载 ' + name + ' (' + (loaded/1048576).toFixed(1) + ' MB)', 0);
            }
        };
        SoundfontLoader.onParseProgress = function(prog) {
            if (toast) updateToast(toast, '正在解析音色库...', Math.max(10, prog * 100));
            updateSfStatusText('loading');
        };
        SoundfontLoader.init(sfCfg);
    }

    // ============ 隐私政策弹窗 ============
    function initPrivacyPopup() {
        var AGREED_KEY = 'webnbs_privacy_agreed';
        var alreadyAgreed = false;
        try {
            alreadyAgreed = localStorage.getItem(AGREED_KEY) === '1';
        } catch (e) {}

        var mask = $('privacy-popup-mask');
        var msgEl = $('privacy-popup-message');
        var btn = $('privacy-popup-agree');
        if (!mask || !btn) return;

        // 拉取服务器配置
        fetch('/api/config').then(function(r) { return r.json(); }).then(function(cfg) {
            if (cfg && cfg.release) {
                showReleaseNotes(cfg.release);
                // 同步"关于"弹窗版本号 (与 config.yaml 的 release.version 保持一致)
                var aboutVer = $('about-version');
                if (aboutVer && cfg.release.version) aboutVer.textContent = cfg.release.version;
            }
            // 公开模式且首次访问才显示隐私弹窗
            if (!alreadyAgreed && cfg && cfg.privacy && cfg.privacy.enabled && cfg.is_public) {
                if (msgEl) {
                    msgEl.textContent = (window.WebNBSI18n && WebNBSI18n.t)
                        ? WebNBSI18n.t('privacy_message')
                        : (cfg.privacy.message || '');
                }
                mask.style.display = 'flex';
            }
            // 初始化 SoundFont 音色库 (后台异步下载)
            if (cfg && cfg.soundfont) initSoundfontLoader(cfg.soundfont);
        }).catch(function() {
            // 拉取失败, 不显示弹窗
        });

        btn.addEventListener('click', function() {
            mask.style.display = 'none';
            try { localStorage.setItem(AGREED_KEY, '1'); } catch (e) {}
        });
    }

    function showReleaseNotes(release) {
        var version = String(release.version || '').trim();
        if (!version) return;
        var storageKey = 'webnbs_release_seen';
        try {
            if (localStorage.getItem(storageKey) === version) return;
            localStorage.setItem(storageKey, version);
        } catch (e) {}
        var overlay = _appDialogOverlay();
        var title = (window.WebNBSI18n && WebNBSI18n.t ? WebNBSI18n.t('update_notes') : '更新日志') + ' · ' + version;
        var box = _appDialogBox(title, '', 'fa-solid fa-sparkles', { maxWidth: 560 });
        var body = box.querySelector('.settings-body');
        body.textContent = '';
        var notes = document.createElement('textarea');
        notes.readOnly = true;
        notes.value = String(release.notes || '');
        notes.setAttribute('aria-label', title);
        notes.style.cssText = 'width:100%;min-height:130px;resize:vertical;box-sizing:border-box;padding:8px;border:0;border-radius:6px;background:var(--ctrl-fill-default);color:var(--text-primary);font:12px/1.55 var(--font-family);';
        body.appendChild(notes);
        var close = function() { _closeAppDialog(overlay); };
        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var closeBtn = _appDialogBtn(window.WebNBSI18n && WebNBSI18n.t ? WebNBSI18n.t('close') : '关闭', true);
        closeBtn.addEventListener('click', close);
        box.querySelector('.popup-actions').appendChild(closeBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    }

    // ============ 横屏模式抽屉 ============
    function createLandscapeDrawerDOM() {
        var btn = $('landscape-menu-btn');
        var drawer = $('landscape-drawer');
        var closeBtn = $('landscape-drawer-close');
        var mask = $('landscape-drawer-mask');
        var body = $('landscape-drawer-body');
        if (!btn || !drawer || !body) return;

        // 把主工具栏的所有按钮克隆到抽屉
        var toolbar = $('toolbar');
        if (toolbar) {
            var sections = toolbar.querySelectorAll('.toolbar-section');
            sections.forEach(function(section) {
                var clone = section.cloneNode(true);
                // 给按钮添加文字标签 (如果只有图标)
                clone.querySelectorAll('.toolbar-btn').forEach(function(b) {
                    var icon = b.querySelector('i');
                    if (icon && !b.querySelector('.label')) {
                        var labelText = b.title || b.id || '';
                        if (labelText && b.id !== 'btn-toolbar-more') {
                            var label = document.createElement('span');
                            label.className = 'label';
                            label.textContent = labelText;
                            b.appendChild(label);
                        }
                    }
                    // 绑定事件 - 通过 id 触发原按钮
                    var origId = b.id;
                    if (origId) {
                        b.addEventListener('click', function(e) {
                            // 关闭抽屉, 触发原按钮点击
                            closeLandscapeDrawer();
                            var orig = $(origId);
                            if (orig) orig.click();
                        });
                    }
                });
                body.appendChild(clone);
            });
        }

        // 打开抽屉
        btn.addEventListener('click', function() {
            drawer.classList.add('visible');
            mask.classList.add('visible');
            drawer.setAttribute('aria-hidden', 'false');
        });

        // 关闭抽屉
        function closeLandscapeDrawer() {
            drawer.classList.remove('visible');
            mask.classList.remove('visible');
            drawer.setAttribute('aria-hidden', 'true');
        }
        if (closeBtn) closeBtn.addEventListener('click', closeLandscapeDrawer);
        if (mask) mask.addEventListener('click', closeLandscapeDrawer);

        // ESC 关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && drawer.classList.contains('visible')) {
                closeLandscapeDrawer();
            }
        });
    }

    // ============ 移动端底部浮动操作按钮 (FAB) ============
    function createMobileFabBar() {
        var pr = state.pianoRoll;
        if (!pr) return;

        // 取消选择（仅移动端）
        var btnDeselect = $('mobile-fab-deselect');
        if (btnDeselect) {
            btnDeselect.addEventListener('click', function() {
                if (state.pianoRoll) state.pianoRoll.clearSelection();
            });
        }

        // 全选
        var btnSelectAll = $('fab-select-all');
        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', function() {
                if (state.pianoRoll) state.pianoRoll.selectAll();
            });
        }

        // 复制
        var btnCopy = $('fab-copy');
        if (btnCopy) {
            btnCopy.addEventListener('click', function() {
                if (!state.pianoRoll) return;
                state.pianoRoll.copySelected();
                state.clipboard = state.pianoRoll.clipboard;
            });
        }

        // 剪切
        var btnCut = $('fab-cut');
        if (btnCut) {
            btnCut.addEventListener('click', function() {
                if (!state.pianoRoll) return;
                state.pianoRoll.copySelected();
                state.clipboard = state.pianoRoll.clipboard;
                state.pianoRoll.deleteSelected();
                state.notes = state.pianoRoll.getNotes();
            });
        }

        // 删除
        var btnDelete = $('fab-delete');
        if (btnDelete) {
            btnDelete.addEventListener('click', function() {
                if (!state.pianoRoll) return;
                state.pianoRoll.deleteSelected();
                state.notes = state.pianoRoll.getNotes();
            });
        }

        // ========== 竖屏模式: 单个悬浮按钮 + 右键菜单 ==========
        var fabSingle = $('mobile-fab-single');
        var fabMenu = $('fab-context-menu');
        if (fabSingle && fabMenu) {
            function setFabMenuVisible(visible) {
                fabMenu.classList.toggle('visible', !!visible);
                fabMenu.style.display = visible ? 'block' : 'none';
                if (visible) {
                    var fabRect = fabSingle.getBoundingClientRect();
                    window.WebNBSPositionFlyout(fabMenu, fabRect, { placement: 'top-end', gap: 10 });
                }
            }
            fabSingle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                setFabMenuVisible(!fabMenu.classList.contains('visible'));
            });

            // 点击菜单项
            var fabItems = fabMenu.querySelectorAll('.fab-context-menu-item');
            for (var fi = 0; fi < fabItems.length; fi++) {
                (function(item) {
                    item.addEventListener('click', function() {
                        var action = item.getAttribute('data-action');
                        setFabMenuVisible(false);
                        if (!state.pianoRoll) return;
                        if (action === 'select-all') {
                            state.pianoRoll.selectAll();
                        } else if (action === 'copy') {
                            state.pianoRoll.copySelected();
                            state.clipboard = state.pianoRoll.clipboard;
                        } else if (action === 'cut') {
                            state.pianoRoll.copySelected();
                            state.clipboard = state.pianoRoll.clipboard;
                            state.pianoRoll.deleteSelected();
                            state.notes = state.pianoRoll.getNotes();
                        } else if (action === 'delete') {
                            state.pianoRoll.deleteSelected();
                            state.notes = state.pianoRoll.getNotes();
                        } else if (action === 'paste') {
                            if (!state.pianoRoll) return;
                            // 以画布中心为粘贴目标 (需使用画布相对坐标, 不能用 window 坐标)
                            var prRect = state.pianoRoll.canvas.getBoundingClientRect();
                            var tick = state.pianoRoll._screenToTick(prRect.width / 2);
                            var layer = state.pianoRoll._screenToLayer(prRect.height / 2);
                            handlePasteOrSystemClipboard(tick, layer);
                        } else if (action === 'change-instrument' || action === 'change-volume') {
                            // 复用桌面右键菜单的处理函数 (需要先设置 state.contextMenuTarget)
                            var selectedIds = state.pianoRoll.getSelectedNoteIds ? state.pianoRoll.getSelectedNoteIds() : [];
                            if (selectedIds.length === 0) {
                                showMidiNotice('请先选择音符', 'info');
                                return;
                            }
                            state.contextMenuTarget = selectedIds;
                            // FAB 菜单项位置作为子菜单弹出参考点
                            var fabRect = item.getBoundingClientRect();
                            handleContextAction(action, fabRect.left, fabRect.top);
                        }
                    });
                })(fabItems[fi]);
            }

            // 点击外部关闭菜单
            document.addEventListener('click', function(e) {
                if (fabMenu.classList.contains('visible') && !fabMenu.contains(e.target) && e.target !== fabSingle) {
                    setFabMenuVisible(false);
                }
            });
        }
    }

    // ============ 收音机式 (指针居中) 速度滑块 ============
    var RADIO_TEMPO_MIN = 1;
    var RADIO_TEMPO_MAX = 512;
    var RADIO_TEMPO_STEP = 0.2;
    var RADIO_TEMPO_PX_PER_STEP = 2;  // 每 0.2 一格 2px
    var radioTempoDragState = null;

    function initRadioTempoSlider() {
        var wrap = $('settings-tempo-radio');
        var track = $('settings-tempo-track');
        if (!wrap || !track) return;

        // 生成刻度
        track.innerHTML = '';
        var totalSteps = Math.round((RADIO_TEMPO_MAX - RADIO_TEMPO_MIN) / RADIO_TEMPO_STEP);  // 2555
        var trackWidth = totalSteps * RADIO_TEMPO_PX_PER_STEP;
        track.style.width = trackWidth + 'px';

        // 每 1 个整数单位 = 5 格 (0.2 * 5) = 长刻度, 每 5 个整数 = 数字标注
        for (var i = 0; i <= totalSteps; i++) {
            var val = RADIO_TEMPO_MIN + i * RADIO_TEMPO_STEP;
            var x = i * RADIO_TEMPO_PX_PER_STEP;
            var tick = document.createElement('div');
            // 每 5 步 (即 1 个整数) 为长刻度
            if (i % 5 === 0) {
                tick.className = 'settings-tempo-tick settings-tempo-tick-major';
            } else {
                tick.className = 'settings-tempo-tick';
                tick.style.height = '12px';
                tick.style.top = '8px';
            }
            tick.style.left = x + 'px';
            // 数字标注: 每 25 步 (= 5 个整数) 一个数字
            if (i % 25 === 0) {
                var label = document.createElement('div');
                label.className = 'settings-tempo-tick-num';
                label.textContent = val.toFixed(1);
                label.style.left = x + 'px';
                track.appendChild(label);
            }
            track.appendChild(tick);
        }

        // 拖动逻辑: 鼠标按下时记录起始位置
        // 关键: 拖动期间直接用 deltaX 计算 (不要重新获取 startValue), 避免抖动
        wrap.addEventListener('mousedown', function(e) {
            e.preventDefault();
            radioTempoDragState = {
                startX: e.clientX,
                startValue: state.tempo,
                dragging: true
            };
            document.body.style.cursor = 'ew-resize';
            // 防止文本选择
            window.getSelection().removeAllRanges();
        });
        // 触摸支持
        wrap.addEventListener('touchstart', function(e) {
            var t = e.touches[0];
            radioTempoDragState = {
                startX: t.clientX,
                startValue: state.tempo,
                dragging: true
            };
        }, { passive: true });

        // 滚轮支持
        wrap.addEventListener('wheel', function(e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? -1 : 1;
            setRadioTempo(state.tempo + delta * RADIO_TEMPO_STEP);
        }, { passive: false });

        // 初始化位置
        updateRadioTempoSlider();
    }

    function updateRadioTempoSlider() {
        var track = $('settings-tempo-track');
        if (!track) return;
        var steps = (state.tempo - RADIO_TEMPO_MIN) / RADIO_TEMPO_STEP;
        var offset = steps * RADIO_TEMPO_PX_PER_STEP;
        // 容器宽度 = 父容器宽度; 让当前值居中需要把 track 偏移 -(offset - containerWidth/2)
        var container = track.parentElement;
        var containerWidth = container ? container.clientWidth : 600;
        // 使用 transform 替代 left 避免回流, 配合 will-change 提升性能
        track.style.transform = 'translate3d(' + (-(offset - containerWidth / 2)) + 'px, 0, 0)';

        // 警告提示: 速度超过 128
        var warning = $('settings-tempo-warning');
        if (warning) {
            warning.style.display = (state.tempo > 128) ? 'flex' : 'none';
        }
    }

    function setRadioTempo(val) {
        // 限制 1-512, 步进 0.2
        val = Math.max(RADIO_TEMPO_MIN, Math.min(RADIO_TEMPO_MAX, val));
        val = Math.round(val / RADIO_TEMPO_STEP) * RADIO_TEMPO_STEP;
        // 修复浮点精度
        val = Math.round(val * 10) / 10;
        state.tempo = val;
        $setText('settings-tempo-value', val.toFixed(3).replace(/\.?0+$/, ''));
        $('tempo-value').value = val.toFixed(1);
        $setValue('fls-tempo-input', Math.round(val));
        $setValue('settings-tempo-input', val);
        updateRadioTempoSlider();
        markDirty();
        if (state.isPlaying) restartPlayback();
    }

    // 全局鼠标事件 (拖动期间)
    // 关键: 拖动过程中, 每帧都基于 (startValue + 当前增量) 计算,
    // 而不是每帧累加, 防止亚像素抖动和方向反转
    document.addEventListener('mousemove', function(e) {
        if (!radioTempoDragState || !radioTempoDragState.dragging) return;
        var deltaX = e.clientX - radioTempoDragState.startX;
        // 1px = 0.2 步 (例如往左滑 deltaX 为负, 速度减小)
        var stepsDelta = deltaX / RADIO_TEMPO_PX_PER_STEP;
        var newVal = radioTempoDragState.startValue + stepsDelta * RADIO_TEMPO_STEP;
        // 仅当与上次值差异 > 0.05 时才更新, 减少抖动
        if (Math.abs(newVal - state.tempo) >= RADIO_TEMPO_STEP * 0.5) {
            setRadioTempo(newVal);
        }
    });
    document.addEventListener('mouseup', function() {
        if (radioTempoDragState) {
            radioTempoDragState = null;
            document.body.style.cursor = '';
        }
    });
    document.addEventListener('touchmove', function(e) {
        if (!radioTempoDragState || !radioTempoDragState.dragging) return;
        var t = e.touches[0];
        var deltaX = t.clientX - radioTempoDragState.startX;
        var stepsDelta = deltaX / RADIO_TEMPO_PX_PER_STEP;
        var newVal = radioTempoDragState.startValue + stepsDelta * RADIO_TEMPO_STEP;
        if (Math.abs(newVal - state.tempo) >= RADIO_TEMPO_STEP * 0.5) {
            setRadioTempo(newVal);
        }
    }, { passive: true });
    document.addEventListener('touchend', function() {
        if (radioTempoDragState) radioTempoDragState = null;
    });

    // 窗口 resize 时重定位 (因为容器宽度变化)
    window.addEventListener('resize', function() {
        updateRadioTempoSlider();
    });

    // ============ 功能菜单 (缩放精度 / 清除空轨) ============
    function createFunctionsMenu() {
        var btn = $('btn-functions');
        var menu = $('functions-menu');
        if (!btn || !menu) return;
        var duplicateExport = menu.querySelector('.functions-menu-item[data-action="export"]');
        if (duplicateExport) duplicateExport.remove();

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var isVisible = menu.style.display === 'block';
            // 关闭其他弹出菜单
            document.querySelectorAll('.toolbar-more-menu, .functions-menu').forEach(function(m) {
                if (m !== menu) m.style.display = 'none';
            });
            menu.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) {
                var rect = btn.getBoundingClientRect();
                window.WebNBSPositionFlyout(menu, rect, { placement: 'bottom-end' });
            }
        });

        // 点击菜单项
        var items = menu.querySelectorAll('.functions-menu-item');
        for (var i = 0; i < items.length; i++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var action = item.getAttribute('data-action');
                    menu.style.display = 'none';
                    if (action === 'scale-precision') {
                        showScalePrecisionDialog();
                    } else if (action === 'remove-empty-tracks') {
                        removeEmptyTracks();
                    } else if (action === 'sustain-fill') {
                        showSustainFillDialog();
                    } else if (action === 'clear-sustain') {
                        showClearSustainDialog();
                    } else if (action === 'arpeggio-tracks') {
                        showArpeggioTracksDialog();
                    } else if (action === 'transpose-octave') {
                        applyTransposeToOctaveRange();
                    } else if (action === 'range-process') {
                        showRangeProcessDialog();
                    } else if (action === 'snap-notes') {
                        showSnapDialog();
                    } else if (action === 'pitch-shift') {
                        showPitchShiftDialog();
                    }
                });
            })(items[i]);
        }

        // 点击外部关闭
        document.addEventListener('click', function(e) {
            if (menu.style.display === 'block' && !menu.contains(e.target) && e.target !== btn) {
                menu.style.display = 'none';
            }
        });
    }

    function showPitchShiftDialog() {
        var selectedNotes = state.pianoRoll ? state.pianoRoll.getSelectedNotes() : [];
        if (selectedNotes.length === 0) {
            showSustainFillAlert('请先选择要偏移的音符', '音调偏移');
            return;
        }

        var existing = $('pitch-shift-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="pitch-shift-popup">'
            + '<div class="popup-content" style="max-width:380px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-music"></i>'
            + '<h4>音调偏移</h4>'
            + '<button class="settings-close-btn" id="pitch-shift-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="font-size:12px;color:var(--text-secondary);margin:0 0 10px;">已选择 ' + selectedNotes.length + ' 个音符</p>'
            + '<div class="settings-row" style="flex-direction:column;gap:8px;">'
            + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<label style="font-size:12px;min-width:60px;">偏移方式:</label>'
            + '<select id="pitch-shift-mode" style="padding:4px 8px;font-size:12px;border:1px solid var(--ctrl-stroke-default);border-radius:4px;background:var(--ctrl-fill-default);color:var(--text-primary);">'
            + '<option value="semitones">按音调</option>'
            + '<option value="octaves">按八度</option>'
            + '</select>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:8px;">'
            + '<label style="font-size:12px;min-width:60px;">偏移量:</label>'
            + '<input type="number" id="pitch-shift-value" value="1" style="width:60px;padding:4px 6px;font-size:12px;border:1px solid var(--ctrl-stroke-default);border-radius:4px;background:var(--ctrl-fill-default);color:var(--text-primary);text-align:center;">'
            + '<span style="font-size:11px;color:var(--text-tertiary);">正=向上, 负=向下</span>'
            + '</div>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="pitch-shift-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="pitch-shift-ok-btn">应用</button>'
            + '</div>'
            + '</div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var p = $('pitch-shift-popup'); if (p) p.remove();
        }
        wrapper.querySelector('#pitch-shift-close-x').addEventListener('click', close);
        wrapper.querySelector('#pitch-shift-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#pitch-shift-ok-btn').addEventListener('click', function() {
            var mode = wrapper.querySelector('#pitch-shift-mode').value;
            var value = parseInt(wrapper.querySelector('#pitch-shift-value').value) || 0;
            var delta = mode === 'octaves' ? value * 12 : value;

            pushUndo();
            for (var i = 0; i < selectedNotes.length; i++) {
                var note = selectedNotes[i];
                var newKey = Math.max(0, Math.min(87, note.key + delta));
                note.key = newKey;
                // Update in state.notes
                for (var j = 0; j < state.notes.length; j++) {
                    if (state.notes[j].id === note.id) {
                        state.notes[j].key = newKey;
                        break;
                    }
                }
            }
            if (state.pianoRoll) {
                state.pianoRoll._fullRedrawNeeded = true;
                state.pianoRoll.render();
            }
            buildNoteIndex(state.notes);
            markDirty();
            close();
        });
        wrapper.addEventListener('click', function(e) { if (e.target === wrapper) close(); });
    }

    function showScalePrecisionDialog() {
        var existing = $('scale-precision-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="scale-precision-popup">'
            + '<div class="popup-content" style="max-width:380px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>'
            + '<h4>缩放精度</h4>'
            + '<button class="settings-close-btn" id="scale-precision-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary);">将所有音符的时间位置 (tick) 按比例缩放：</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:4px;border:none;">'
            + '<label class="settings-label" style="font-size:12px;">选择缩放倍数：</label>'
            + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
            + '<button class="scale-btn" data-factor="0.125">1/8x</button>'
            + '<button class="scale-btn" data-factor="0.25">1/4x</button>'
            + '<button class="scale-btn" data-factor="0.5">1/2x</button>'
            + '<button class="scale-btn selected" data-factor="2">x2</button>'
            + '<button class="scale-btn" data-factor="3">x3</button>'
            + '<button class="scale-btn" data-factor="4">x4</button>'
            + '<button class="scale-btn" data-factor="6">x6</button>'
            + '<button class="scale-btn" data-factor="8">x8</button>'
            + '</div></div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="scale-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="scale-ok-btn">应用</button>'
            + '</div></div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        var selectedFactor = 2;

        var style = document.createElement('style');
        style.textContent = ''
            + '.scale-btn { flex:1;min-width:48px;padding:8px 6px;'
            + 'background:var(--ctrl-fill-default);border:1px solid var(--ctrl-stroke-default);'
            + 'border-radius:6px;color:var(--text-primary);cursor:pointer;text-align:center;'
            + 'font-size:13px;transition:all 0.15s; }'
            + '.scale-btn:hover { border-color:var(--accent); }'
            + '.scale-btn.selected { background:var(--accent);border-color:var(--accent);color:#fff; }';
        wrapper.appendChild(style);

        var btns = wrapper.querySelectorAll('.scale-btn');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function() {
                for (var j = 0; j < btns.length; j++) {
                    btns[j].classList.remove('selected');
                }
                this.classList.add('selected');
                selectedFactor = parseFloat(this.getAttribute('data-factor'));
            });
        }

        var closeX = wrapper.querySelector('#scale-precision-close-x');
        if (closeX) closeX.addEventListener('click', function() { wrapper.remove(); });
        var cancelBtn = wrapper.querySelector('#scale-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { wrapper.remove(); });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper || e.target === wrapper.firstElementChild) wrapper.remove();
        });

        var okBtn = wrapper.querySelector('#scale-ok-btn');
        if (okBtn) {
            okBtn.addEventListener('click', function() {
                wrapper.remove();
                applyScalePrecision(selectedFactor);
            });
        }
    }

    function applyScalePrecision(factor) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (notes.length === 0) {
            showAppAlert('当前没有音符，无法缩放', {title: '缩放精度'});
            return;
        }
        pushUndo();
        for (var i = 0; i < notes.length; i++) {
            notes[i].tick = Math.round(notes[i].tick * factor);
        }
        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();
    }

    function showSnapDialog() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (!notes || notes.length === 0) {
            showAppAlert('当前没有音符', {title: '音符吸附'});
            return;
        }

        var existing = $('snap-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="snap-popup">'
            + '<div class="popup-content" style="max-width:360px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-magnet"></i>'
            + '<h4>音符吸附</h4>'
            + '<button class="settings-close-btn" id="snap-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary);">将音符吸附到最近的网格线上。</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;border:none;">'
            + '<label class="settings-label" style="font-size:12px;">选择范围：</label>'
            + '<div style="display:flex;gap:4px;flex-wrap:wrap;">'
            + '<button class="snap-scope-btn selected" data-scope="all">全部音符</button>'
            + '<button class="snap-scope-btn" data-scope="current-track">当前轨道</button>'
            + '<button class="snap-scope-btn" data-scope="selected">选中音符</button>'
            + '</div>'
            + '</div>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;gap:8px;border:none;margin-top:4px;">'
            + '<label class="settings-label" style="font-size:12px;">选择拍子：</label>'
            + '<select id="snap-beat-select" style="padding:6px 8px;font-size:13px;border:1px solid var(--ctrl-stroke-default);border-radius:6px;background:var(--ctrl-fill-default);color:var(--text-primary);">'
            + '<option value="2">1/2</option>'
            + '<option value="4" selected>1/4</option>'
            + '<option value="8">1/8</option>'
            + '<option value="16">1/16</option>'
            + '<option value="32">1/32</option>'
            + '</select>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="snap-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="snap-ok-btn">应用</button>'
            + '</div></div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        var selectedScope = 'all';

        var style = document.createElement('style');
        style.textContent = ''
            + '.snap-scope-btn { flex:1;min-width:70px;padding:8px 6px;'
            + 'background:var(--ctrl-fill-default);border:1px solid var(--ctrl-stroke-default);'
            + 'border-radius:6px;color:var(--text-primary);cursor:pointer;text-align:center;'
            + 'font-size:12px;transition:all 0.15s; }'
            + '.snap-scope-btn:hover { border-color:var(--accent); }'
            + '.snap-scope-btn.selected { background:var(--accent);border-color:var(--accent);color:#fff; }';
        wrapper.appendChild(style);

        var scopeBtns = wrapper.querySelectorAll('.snap-scope-btn');
        for (var i = 0; i < scopeBtns.length; i++) {
            scopeBtns[i].addEventListener('click', function() {
                for (var j = 0; j < scopeBtns.length; j++) {
                    scopeBtns[j].classList.remove('selected');
                }
                this.classList.add('selected');
                selectedScope = this.getAttribute('data-scope');
            });
        }

        var closeX = wrapper.querySelector('#snap-close-x');
        if (closeX) closeX.addEventListener('click', function() { wrapper.remove(); });
        var cancelBtn = wrapper.querySelector('#snap-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { wrapper.remove(); });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper || e.target === wrapper.firstElementChild) wrapper.remove();
        });

        var okBtn = wrapper.querySelector('#snap-ok-btn');
        if (okBtn) {
            okBtn.addEventListener('click', function() {
                var beat = parseInt(wrapper.querySelector('#snap-beat-select').value);
                wrapper.remove();
                applySnap(selectedScope, beat);
            });
        }
    }

    function applySnap(scope, beat) {
        if (!state.pianoRoll) return;
        var allNotes = state.pianoRoll.getNotes();
        if (!allNotes || allNotes.length === 0) return;

        var notesToSnap = [];
        if (scope === 'selected') {
            var selected = state.pianoRoll.getSelectedNotes();
            if (!selected || selected.length === 0) {
                showAppAlert('没有选中任何音符', {title: '音符吸附'});
                return;
            }
            for (var s = 0; s < selected.length; s++) {
                notesToSnap.push(Object.assign({}, selected[s]));
            }
        } else if (scope === 'current-track') {
            var sel = state.pianoRoll.getSelectedNotes();
            var targetLayer = null;
            if (sel && sel.length > 0) {
                targetLayer = sel[0].layer;
            } else {
                targetLayer = 0;
            }
            for (var t = 0; t < allNotes.length; t++) {
                if (allNotes[t].layer === targetLayer) {
                    notesToSnap.push(Object.assign({}, allNotes[t]));
                }
            }
        } else {
            for (var a = 0; a < allNotes.length; a++) {
                notesToSnap.push(Object.assign({}, allNotes[a]));
            }
        }

        if (notesToSnap.length === 0) {
            showAppAlert('没有需要吸附的音符', {title: '音符吸附'});
            return;
        }

        pushUndo();

        // beat: 2=1/2 note, 4=1/4 note, 8=1/8 note, 16=1/16 note, 32=1/32 note
        // NBS standard: 4 ticks per beat (quarter note)
        // gridStep 必须是整数 tick, 不能依赖 zoom
        var ticksPerBeat = 4; // NBS standard
        var gridStep = Math.max(1, Math.round(ticksPerBeat * 4 / beat));
        // For beat=2: gridStep = 8 (half note = 8 ticks)
        // For beat=4: gridStep = 4 (quarter note = 4 ticks)
        // For beat=8: gridStep = 2 (eighth note = 2 ticks)
        // For beat=16: gridStep = 1 (sixteenth note = 1 tick)
        // For beat=32: gridStep = 1 (minimum 1 tick)

        var snapMap = {};
        for (var n = 0; n < notesToSnap.length; n++) {
            var nt = notesToSnap[n];
            var oldTick = nt.tick;
            var snappedTick = Math.round(oldTick / gridStep) * gridStep;
            if (snappedTick < 0) snappedTick = 0;
            snapMap[nt.id] = snappedTick;
        }

        for (var u = 0; u < allNotes.length; u++) {
            if (snapMap.hasOwnProperty(allNotes[u].id)) {
                allNotes[u].tick = snapMap[allNotes[u].id];
            }
        }

        state.pianoRoll.setNotes(allNotes);
        state.notes = allNotes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();
    }

    // 清除空轨: 删除所有没有任何音符的 layer
    function removeEmptyTracks() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var layers = state.song && state.song.layers ? state.song.layers : [];
        if (layers.length === 0) return;

        // 统计每个 layer 的音符数
        var layerNoteCount = {};
        for (var i = 0; i < notes.length; i++) {
            var lyr = notes[i].layer;
            layerNoteCount[lyr] = (layerNoteCount[lyr] || 0) + 1;
        }

        // Keep at least one layer: an empty song still needs an editable track.
        var nonEmptyLayers = [];
        for (var l = 0; l < layers.length; l++) {
            if (layerNoteCount[l]) nonEmptyLayers.push(l);
        }
        if (nonEmptyLayers.length === 0) nonEmptyLayers.push(0);

        var removedCount = layers.length - nonEmptyLayers.length;
        if (removedCount === 0) {
            showAppAlert('没有空轨可清除', {title: '清除空轨'});
            return;
        }

        showAppConfirm('将删除 ' + removedCount + ' 个空轨 (从 ' + layers.length + ' 减到 ' + nonEmptyLayers.length + ')，是否继续？', {title: '清除空轨', icon: 'fa-solid fa-broom'}).then(function(ok) {
            if (!ok) return;

            // 重新映射所有音符的 layer 索引 (压缩到新序号)
            var layerMap = {};
            for (var nl = 0; nl < nonEmptyLayers.length; nl++) {
                layerMap[nonEmptyLayers[nl]] = nl;
            }
            for (var n = 0; n < notes.length; n++) {
                notes[n].layer = layerMap[notes[n].layer];
            }

            // 重排 layers 数组
            var newLayers = [];
            for (var k = 0; k < nonEmptyLayers.length; k++) {
                newLayers.push(layers[nonEmptyLayers[k]]);
            }
            if (state.song) state.song.layers = newLayers;

            // 同步到 piano roll
            state.pianoRoll.setNotes(notes);
            state.pianoRoll.trackCount = newLayers.length;
            state.notes = notes;
            state.pianoRoll.render();

            // 更新轨道面板
            if (typeof renderTrackPanel === 'function') renderTrackPanel();
            if (typeof state.pushHistory === 'function') state.pushHistory();
        });
    }

    // ============ 延音填充 ============
    // 用户先框选多个音符, 然后点击"延音填充"
    // 弹窗让用户选择"间隔"参数 (在原音符之间插入多少个空位)
    // 同一行内从选中区间的开始 tick 开始, 按顺序用 "上一个音符的音调和音色" 填充
    // 结尾的最后一个音符会延长 4 个 tick 位置
    function showSustainFillDialog() {
        if (!state.pianoRoll) return;
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length < 2) {
            // 没有选够多音符, 提示
            showSustainFillAlert('请先在钢琴卷帘上选择至少 2 个音符再使用延音填充。\n\n使用方法:\n1. 框选一段范围的音符\n2. 点击"延音填充"\n3. 选择间隔参数');
            return;
        }
        if (selected.length === 1) {
            showSustainFillAlert('请选择多个音符 (至少 2 个)。\n\n当前只选中了 1 个音符。');
            return;
        }

        // 移除已有弹窗
        var existing = $('sustain-fill-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="sustain-fill-popup">'
            + '<div class="popup-content" style="max-width:420px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-wave-square"></i>'
            + '<h4>延音填充</h4>'
            + '<button class="settings-close-btn" id="sustain-fill-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 8px;font-size:13px;color:var(--text-secondary);line-height:1.5;">'
            + '<b>功能说明：</b>按行处理选中的多个音符，在每行中从选择区间的开始点往后填充。'
            + '填充的音符使用<b>上一个</b>原音符的音调和音色；最后一个音符会延长 4 个 tick 位置。'
            + '</p>'
            + '<p style="margin:8px 0;font-size:12px;color:var(--text-tertiary, #888);line-height:1.5;">'
            + '例子 (1XXX2X3XXXXX1XX6):<br>'
            + '• 间隔 0：<b>1111223333331116XXXX</b> (无空位)<br>'
            + '• 间隔 1：<b>111X2X33333X11X666</b> (1 个空位)<br>'
            + '• 间隔 2：<b>11XX2X3333XX1XX66</b> (2 个空位)'
            + '</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;margin-top:14px;">'
            + '<label class="settings-label">间隔 (空位数量)：</label>'
            + '<input type="number" id="sustain-fill-interval" min="0" max="16" value="0" class="timbre-select" style="padding:8px 12px;margin-top:6px;">'
            + '<span style="font-size:11px;color:var(--text-tertiary, #888);margin-top:4px;">0 = 紧贴无空位；推荐 1-3</span>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="sustain-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="sustain-ok-btn">应用</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var popup = $('sustain-fill-popup');
            if (popup) popup.remove();
        }

        wrapper.querySelector('#sustain-fill-close-x').addEventListener('click', close);
        wrapper.querySelector('#sustain-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#sustain-ok-btn').addEventListener('click', function() {
            var interval = parseInt(wrapper.querySelector('#sustain-fill-interval').value);
            if (isNaN(interval) || interval < 0) interval = 0;
            if (interval > 16) interval = 16;
            applySustainFill(interval);
            close();
        });

        // 点击遮罩关闭
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) {
                close();
            }
        });
    }

    function showSustainFillAlert(message, title) {
        showAppAlert(message, {title: title || '延音填充', icon: 'fa-solid fa-circle-info', okText: '知道了'});
    }

    // 实际执行延音填充
    // 按行处理选中音符：在相邻原音符之间的空隙内，用前一个音符的音调/音色/音量填充，
    // 最后一个音符向后延长 4 个 tick。
    function applySustainFill(interval) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length < 2) {
            showSustainFillAlert('未选中有效音符');
            return;
        }

        pushUndo();

        // 按 layer 分组, 每组内按 tick 排序
        var byLayer = {};
        for (var i = 0; i < selected.length; i++) {
            var n = selected[i];
            if (!byLayer[n.layer]) byLayer[n.layer] = [];
            byLayer[n.layer].push(n);
        }
        for (var L in byLayer) {
            byLayer[L].sort(function(a, b) { return a.tick - b.tick; });
        }

        // 建立已有音符位置映射, 避免覆盖
        var noteMap = {};
        function mapKey(t, l) { return t + ':' + l; }
        for (var i = 0; i < notes.length; i++) {
            noteMap[mapKey(notes[i].tick, notes[i].layer)] = true;
        }

        var addedCount = 0;
        var step = 1 + Math.max(0, interval);

        for (var layerId in byLayer) {
            var list = byLayer[layerId];
            var layerNum = parseInt(layerId);

            // 在相邻原音符之间填充
            for (var idx = 0; idx < list.length - 1; idx++) {
                var a = list[idx];
                var b = list[idx + 1];
                var t = a.tick + step;
                while (t < b.tick) {
                    var k = mapKey(t, layerNum);
                    if (!noteMap[k]) {
                        notes.push({
                            tick: t,
                            layer: layerNum,
                            instrument: a.instrument,
                            key: a.key,
                            velocity: a.velocity,
                            pan: a.pan,
                            pitch: a.pitch
                        });
                        noteMap[k] = true;
                        addedCount++;
                    }
                    t += step;
                }
            }

            // 最后一个音符向后延长 4 个 tick
            var last = list[list.length - 1];
            var t = last.tick + step;
            var endTick = last.tick + 4;
            while (t <= endTick) {
                var k = mapKey(t, layerNum);
                if (!noteMap[k]) {
                    notes.push({
                        tick: t,
                        layer: layerNum,
                        instrument: last.instrument,
                        key: last.key,
                        velocity: last.velocity,
                        pan: last.pan,
                        pitch: last.pitch
                    });
                    noteMap[k] = true;
                    addedCount++;
                }
                t += step;
            }
        }

        // 应用回 piano roll
        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();

        if (addedCount === 0) {
            showSustainFillAlert('没有添加任何音符 (可能选中区间已满)');
        } else {
            console.log('[Sustain Fill] 间隔=' + interval + ', 填充了 ' + addedCount + ' 个音符');
        }
    }

    // ============ 清除延音 ============
    function showClearSustainDialog() {
        if (!state.pianoRoll) return;
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) {
            showSustainFillAlert('请先在钢琴卷帘上选择至少 1 个音符再使用清除延音。', '清除延音');
            return;
        }

        var existing = $('clear-sustain-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="clear-sustain-popup">'
            + '<div class="popup-content" style="max-width:420px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-eraser"></i>'
            + '<h4>清除延音</h4>'
            + '<button class="settings-close-btn" id="clear-sustain-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 8px;font-size:13px;color:var(--text-secondary);line-height:1.5;">'
            + '<b>功能说明：</b>按音轨处理选中的音符，把同一音轨里连续重复的音符截短，并在每组音符之间保留固定的空 tick 数。'
            + '</p>'
            + '<p style="margin:8px 0;font-size:12px;color:var(--text-tertiary, #888);line-height:1.5;">'
            + '例子 (留空长度 = 2)：<br>'
            + '11111O2222OOO333444666 &rarr; 1111OO2222OOO3OO4OO6OO<br>'
            + '11OOO2223333 &rarr; 11OOO2OO33OO'
            + '</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;margin-top:14px;">'
            + '<label class="settings-label">留空长度 (空 tick 数)：</label>'
            + '<input type="number" id="clear-sustain-gap" min="0" max="16" value="2" class="timbre-select" style="padding:8px 12px;margin-top:6px;">'
            + '<span style="font-size:11px;color:var(--text-tertiary, #888);margin-top:4px;">0 = 只删除同 tick 的完全重复音符；推荐 1-3</span>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="clear-sustain-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="clear-sustain-ok-btn">应用</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var popup = $('clear-sustain-popup');
            if (popup) popup.remove();
        }

        wrapper.querySelector('#clear-sustain-close-x').addEventListener('click', close);
        wrapper.querySelector('#clear-sustain-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#clear-sustain-ok-btn').addEventListener('click', function() {
            var gap = parseInt(wrapper.querySelector('#clear-sustain-gap').value);
            if (isNaN(gap) || gap < 0) gap = 0;
            if (gap > 16) gap = 16;
            applyClearSustain(gap);
            close();
        });

        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) {
                close();
            }
        });
    }

    // 实际执行清除延音
    // 按音轨分组，把同一音轨内连续重复的音符截短，保证相邻两组之间至少留出 gap 个空 tick
    function applyClearSustain(gap) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) return;

        pushUndo();

        // 只处理选中的音符；按音轨分组后按 tick 排序
        var selectedIds = {};
        var byLayer = {};
        for (var i = 0; i < selected.length; i++) {
            var n = selected[i];
            selectedIds[n.id] = true;
            if (!byLayer[n.layer]) byLayer[n.layer] = [];
            byLayer[n.layer].push(n);
        }
        for (var L in byLayer) {
            byLayer[L].sort(function(a, b) { return a.tick - b.tick; });
        }

        var removeIds = {};

        for (var layerId in byLayer) {
            var list = byLayer[layerId];
            // 把连续且 key+instrument 相同的音符归为一组
            var runs = [];
            var runStart = 0;
            while (runStart < list.length) {
                var runEnd = runStart + 1;
                while (runEnd < list.length &&
                       list[runEnd].tick === list[runEnd - 1].tick + 1 &&
                       list[runEnd].key === list[runStart].key &&
                       list[runEnd].instrument === list[runStart].instrument) {
                    runEnd++;
                }
                runs.push({ start: runStart, end: runEnd, startTick: list[runStart].tick });
                runStart = runEnd;
            }

            for (var r = 0; r < runs.length; r++) {
                var run = runs[r];
                var runLen = run.end - run.start;
                var keepCount;
                if (r < runs.length - 1) {
                    var nextStartTick = runs[r + 1].startTick;
                    // 要保证下一组开始前有 gap 个空 tick
                    keepCount = Math.min(runLen, Math.max(1, nextStartTick - gap - run.startTick));
                } else {
                    // 最后一组：尾部也留出 gap 个空 tick
                    keepCount = runLen <= gap ? runLen : Math.max(1, runLen - gap);
                }
                for (var idx = run.start + keepCount; idx < run.end; idx++) {
                    removeIds[list[idx].id] = true;
                }
            }
        }

        var newNotes = [];
        for (var j = 0; j < notes.length; j++) {
            if (!removeIds[notes[j].id]) newNotes.push(notes[j]);
        }

        state.pianoRoll.setNotes(newNotes);
        state.notes = newNotes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();

        var removedCount = Object.keys(removeIds).length;
        console.log('[Clear Sustain] 留空=' + gap + ', 删除了 ' + removedCount + ' 个音符');
    }

    // ============ 上下起伏（跨音轨规律分布） ============
    function showArpeggioTracksDialog() {
        if (!state.pianoRoll) return;
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) {
            showSustainFillAlert('请先在钢琴卷帘上选择至少 1 个音符再使用上下起伏。', '上下起伏');
            return;
        }

        var existing = $('arpeggio-tracks-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="arpeggio-tracks-popup">'
            + '<div class="popup-content" style="max-width:420px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-arrow-up-right-dots"></i>'
            + '<h4>上下起伏</h4>'
            + '<button class="settings-close-btn" id="arpeggio-tracks-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0 0 8px;font-size:13px;color:var(--text-secondary);line-height:1.5;">'
            + '<b>功能说明：</b>将选中的音符按时间顺序依次分配到不同音轨，形成跨音轨的起伏规律。'
            + '</p>'
            + '<p style="margin:8px 0;font-size:12px;color:var(--text-tertiary, #888);line-height:1.5;">'
            + '规律使用“|”分隔，数字代表相对于选择区域的第几条音轨。<br>'
            + '例如 <b>1|2|1|3</b>：第1个音符放到第1轨，第2个放到第2轨，第3个回到第1轨，第4个放到第3轨，然后循环。'
            + '</p>'
            + '<div class="settings-row" style="flex-direction:column;align-items:stretch;margin-top:14px;">'
            + '<label class="settings-label">规律：</label>'
            + '<input type="text" id="arpeggio-tracks-pattern" value="1|2|1|3" class="timbre-select" style="padding:8px 12px;margin-top:6px;">'
            + '<span style="font-size:11px;color:var(--text-tertiary, #888);margin-top:4px;">用“|”分隔正整数，如 1|2|1|3</span>'
            + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="arpeggio-tracks-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="arpeggio-tracks-ok-btn">应用</button>'
            + '</div>'
            + '</div>'
            + '</div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var popup = $('arpeggio-tracks-popup');
            if (popup) popup.remove();
        }

        wrapper.querySelector('#arpeggio-tracks-close-x').addEventListener('click', close);
        wrapper.querySelector('#arpeggio-tracks-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#arpeggio-tracks-ok-btn').addEventListener('click', function() {
            var pattern = wrapper.querySelector('#arpeggio-tracks-pattern').value;
            applyArpeggioTracks(pattern);
            close();
        });

        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) {
                close();
            }
        });
    }

    // 实际执行上下起伏
    function applyArpeggioTracks(patternStr) {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        var selected = state.pianoRoll.getSelectedNotes();
        if (!selected || selected.length === 0) return;

        // 解析规律
        var parts = patternStr.split('|');
        var pattern = [];
        for (var p = 0; p < parts.length; p++) {
            var val = parseInt(parts[p].trim());
            if (!isNaN(val) && val > 0) pattern.push(val);
        }
        if (pattern.length === 0) {
            showSustainFillAlert('规律格式错误，请使用“|”分隔正整数，例如 1|2|1|3。', '上下起伏');
            return;
        }

        pushUndo();

        // 按时间顺序排列选中音符（同 tick 时按 layer 排序）
        selected.sort(function(a, b) {
            if (a.tick !== b.tick) return a.tick - b.tick;
            return a.layer - b.layer;
        });

        // 基准音轨：选择区域里最上面的音轨
        var baseLayer = selected[0].layer;
        for (var s = 1; s < selected.length; s++) {
            if (selected[s].layer < baseLayer) baseLayer = selected[s].layer;
        }

        // 计算目标最大音轨，必要时扩展工程层数
        var maxOffset = 0;
        for (var o = 0; o < pattern.length; o++) {
            if (pattern[o] - 1 > maxOffset) maxOffset = pattern[o] - 1;
        }
        var maxTargetLayer = baseLayer + maxOffset;
        ensureLayerCount(maxTargetLayer + 1);

        var selectedIds = {};
        for (var k = 0; k < selected.length; k++) selectedIds[selected[k].id] = true;

        // 记录未选中音符占用的位置
        var occupied = {};
        for (var i = 0; i < notes.length; i++) {
            if (!selectedIds[notes[i].id]) {
                occupied[notes[i].tick + '_' + notes[i].layer] = true;
            }
        }

        var newNotes = [];
        // 未选中音符保持不动
        for (var j = 0; j < notes.length; j++) {
            if (!selectedIds[notes[j].id]) newNotes.push(notes[j]);
        }

        var movedIds = [];
        for (var idx = 0; idx < selected.length; idx++) {
            var note = selected[idx];
            var offset = pattern[idx % pattern.length] - 1;
            var targetLayer = baseLayer + offset;
            var posKey = note.tick + '_' + targetLayer;

            if (!occupied[posKey]) {
                note.layer = targetLayer;
                occupied[posKey] = true;
            }
            // 若目标位置已被未选中音符占用，则保留在原音轨
            newNotes.push(note);
            movedIds.push(note.id);
        }

        state.pianoRoll.setNotes(newNotes);
        state.notes = newNotes;
        // 保持选中状态
        state.pianoRoll.selectNotes(movedIds);
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        updateTrackPanelUI();
        state.pianoRoll.render();

        console.log('[Arpeggio Tracks] 规律=' + pattern.join('|') + ', 处理了 ' + selected.length + ' 个音符');
    }

    // 确保工程的 layer 数量至少为 count
    function ensureLayerCount(count) {
        if (!state.song) state.song = {};
        if (!state.song.layers) state.song.layers = [];
        while (state.song.layers.length < count) {
            state.song.layers.push({ name: 'Layer ' + (state.song.layers.length + 1), volume: 100, stereo: 100, lock: 0 });
        }
        if (state.pianoRoll) state.pianoRoll.trackCount = state.song.layers.length;
    }

    // 转8度内：将所有超出 Minecraft 标准音域 (33~57) 的音符按八度折叠回该范围
    // 逻辑与 MIDI 导入时的 keep_octave 一致：小于 33 反复加 12，大于 57 反复减 12，最后钳制到 0~87
    function applyTransposeToOctaveRange() {
        if (!state.pianoRoll) return;
        var notes = state.pianoRoll.getNotes();
        if (!notes || notes.length === 0) return;

        pushUndo();

        var MIN = 33;
        var MAX = 57;
        var NBS_MIN = 0;
        var NBS_MAX = 87;
        var changed = 0;

        for (var i = 0; i < notes.length; i++) {
            var note = notes[i];
            if (typeof note.key !== 'number') continue;
            var newKey = note.key;
            if (newKey < MIN) {
                while (newKey < MIN) newKey += 12;
                changed++;
            } else if (newKey > MAX) {
                while (newKey > MAX) newKey -= 12;
                changed++;
            }
            // 保险钳制，确保仍在 NBS 可播放范围
            if (newKey < NBS_MIN) newKey = NBS_MIN;
            if (newKey > NBS_MAX) newKey = NBS_MAX;
            note.key = newKey;
        }

        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        state.pianoRoll.render();

        showSustainFillAlert('已处理 ' + changed + ' 个音符，超出 Minecraft 标准音域的音符已按八度折叠。', '转8度内');
        console.log('[Transpose Octave] 处理了 ' + changed + ' 个音符');
    }

    // Applies the same three-stage idea as MIDI import to existing NBS tracks.
    function showRangeProcessDialog() {
        if (!state.song || !state.song.layers || !state.notes || state.notes.length === 0) {
            showAppAlert('当前没有可处理的音符。', {title: '音域处理'});
            return;
        }
        var overlay = _appDialogOverlay();
        var t = i18nText;
        var box = _appDialogBox(t('音域处理'), '', 'fa-solid fa-sliders', {maxWidth: 640});
        var body = box.querySelector('.settings-body');
        body.textContent = '';
        body.style.whiteSpace = 'normal';
        body.innerHTML = '<p style="margin:0 0 8px;color:var(--text-secondary);font-size:12px;">' + t('目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。') + '</p>'
            + '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' + t('偏移转换') + ' <select id="range-mode" class="settings-control"><option value="0">' + t('不启用') + '</option><option value="1">' + t('单独音符归一法') + '</option><option value="2">' + t('整体八度偏移法') + '</option><option value="3">' + t('整体音调偏移法') + '</option></select></label>'
            + '<label id="range-key-bias-row" style="display:none;align-items:center;gap:8px;margin-bottom:8px;">' + t('同分偏移') + ' <select id="range-key-bias" class="settings-control"><option value="major">' + t('优先大调') + '</option><option value="minor">' + t('优先小调') + '</option></select></label>'
            + '<label style="display:block;margin-bottom:6px;"><input type="checkbox" id="range-substitute" checked> ' + t('启用音色替代') + '</label>'
            + '<label style="display:block;margin-bottom:10px;"><input type="checkbox" id="range-force-fold"> ' + t('强制转音域内') + '</label>'
            + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;"><strong style="font-size:12px;">' + t('应用音轨') + '</strong><label style="font-size:11px;"><input type="checkbox" id="range-all-tracks" checked> ' + t('全部') + '</label></div>'
            + '<div id="range-track-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:4px;max-height:170px;overflow:auto;padding:6px;border-radius:6px;background:var(--ctrl-fill-tertiary);"></div>';
        var trackList = body.querySelector('#range-track-list');
        for (var i = 0; i < state.song.layers.length; i++) {
            var layer = state.song.layers[i] || {};
            var label = document.createElement('label');
            label.style.cssText = 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            label.innerHTML = '<input type="checkbox" class="range-track" value="' + i + '" checked> ' + escapeHTML(layer.name || ('Track ' + (i + 1)));
            trackList.appendChild(label);
        }
        var mode = body.querySelector('#range-mode');
        var biasRow = body.querySelector('#range-key-bias-row');
        mode.addEventListener('change', function() { biasRow.style.display = mode.value === '3' ? 'flex' : 'none'; });
        body.querySelector('#range-all-tracks').addEventListener('change', function(e) {
            var inputs = trackList.querySelectorAll('.range-track');
            for (var j = 0; j < inputs.length; j++) inputs[j].checked = e.target.checked;
        });
        function close() { _closeAppDialog(overlay); }
        box.querySelector('#app-dialog-x').addEventListener('click', close);
        var cancel = _appDialogBtn(t('取消'), false);
        cancel.addEventListener('click', close);
        var apply = _appDialogBtn(t('应用'), true);
        apply.addEventListener('click', function() {
            var selected = {};
            var trackInputs = trackList.querySelectorAll('.range-track');
            for (var k = 0; k < trackInputs.length; k++) if (trackInputs[k].checked) selected[parseInt(trackInputs[k].value, 10)] = true;
            applyRangeProcessing(parseInt(mode.value, 10), selected, body.querySelector('#range-substitute').checked, body.querySelector('#range-force-fold').checked);
            close();
        });
        box.querySelector('.popup-actions').appendChild(cancel);
        box.querySelector('.popup-actions').appendChild(apply);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        _appDialogStack.push(overlay);
    }

    function foldToMinecraftRange(key) {
        while (key < 33) key += 12;
        while (key > 57) key -= 12;
        return Math.max(33, Math.min(57, key));
    }

    function getBestRangeOffset(notes, unit) {
        var best = 0, bestOutside = Infinity, bestDistance = Infinity;
        for (var offset = -60; offset <= 60; offset += unit) {
            var outside = 0;
            for (var i = 0; i < notes.length; i++) {
                var key = notes[i].key + offset;
                if (key < 33 || key > 57) outside++;
            }
            if (outside < bestOutside || (outside === bestOutside && Math.abs(offset) < bestDistance)) {
                best = offset;
                bestOutside = outside;
                bestDistance = Math.abs(offset);
            }
        }
        return best;
    }

    function applyRangeProcessing(mode, selectedLayers, enableSubstitute, forceFold) {
        var notes = state.pianoRoll.getNotes();
        var groups = {};
        for (var i = 0; i < notes.length; i++) {
            if (selectedLayers[notes[i].layer]) (groups[notes[i].layer] || (groups[notes[i].layer] = [])).push(notes[i]);
        }
        if (Object.keys(groups).length === 0) return;
        pushUndo();
        var changed = 0;
        Object.keys(groups).forEach(function(layer) {
            var group = groups[layer];
            var offset = mode === 2 ? getBestRangeOffset(group, 12) : (mode === 3 ? getBestRangeOffset(group, 1) : 0);
            for (var j = 0; j < group.length; j++) {
                var note = group[j];
                var originalKey = note.key;
                if (mode === 1) note.key = foldToMinecraftRange(note.key);
                else if (mode === 2 || mode === 3) note.key += offset;
                if (enableSubstitute) applyInstrumentRangeSubstitute(note);
                if (forceFold && (note.key < 33 || note.key > 57)) note.key = foldToMinecraftRange(note.key);
                if (note.key !== originalKey) changed++;
            }
        });
        state.pianoRoll.setNotes(notes);
        state.notes = notes;
        buildNoteIndex(state.notes);
        updateProgressUI();
        updateNoteCount();
        markDirty();
        showAppAlert('已完成音域处理，调整了 ' + changed + ' 个音符。', {title: '音域处理'});
    }

    function applyInstrumentRangeSubstitute(note) {
        if (note.key >= 33 && note.key <= 57 || note.instrument === 2 || note.instrument === 3 || note.instrument === 4) return;
        // Instrument base pitch offsets relative to harp, matching Minecraft note-block families.
        var base = {0:0,1:-24,5:-12,6:12,7:24,8:24,9:24,10:0,11:12,12:-24,13:0,14:0,15:0};
        var sourceBase = base[note.instrument] === undefined ? 0 : base[note.instrument];
        var best = null;
        Object.keys(base).forEach(function(id) {
            var instrument = parseInt(id, 10);
            var key = note.key + sourceBase - base[id];
            if (key < 33 || key > 57) return;
            var score = Math.abs(base[id] - sourceBase);
            if (!best || score < best.score) best = {instrument: instrument, key: key, score: score};
        });
        if (best) {
            note.instrument = best.instrument;
            note.key = best.key;
        }
    }

    // ============ 钢琴键盘 (状态栏可折叠) ============
    // 在钢琴键盘区域左右拖拽平移 (替代底部滚动条)
    function setupPianoKeyboardDrag(keyboard) {
        if (!keyboard || keyboard._dragSetup) return;
        keyboard._dragSetup = true;
        var isDown = false, startX = 0, startScroll = 0, moved = false;
        var threshold = 5;
        function getClientX(e) {
            if (e.clientX !== undefined) return e.clientX;
            if (e.touches && e.touches[0]) return e.touches[0].clientX;
            return 0;
        }
        function onStart(e) {
            isDown = true;
            moved = false;
            startX = getClientX(e);
            startScroll = keyboard.scrollLeft;
            keyboard._pianoDragging = false;
        }
        function onMove(e) {
            if (!isDown) return;
            var clientX = getClientX(e);
            var dx = startX - clientX;
            if (Math.abs(dx) > threshold) {
                keyboard._pianoDragging = true;
                moved = true;
            }
            if (moved) {
                keyboard.scrollLeft = startScroll + dx;
                e.preventDefault();
                e.stopPropagation();
            }
        }
        function onEnd(e) {
            isDown = false;
            // 延迟清除拖动标记, 避免 touchend 误触发 key 点击
            setTimeout(function() { keyboard._pianoDragging = false; }, 50);
        }
        keyboard.addEventListener('mousedown', onStart, true);
        keyboard.addEventListener('mousemove', onMove, true);
        keyboard.addEventListener('mouseup', onEnd, true);
        keyboard.addEventListener('mouseleave', onEnd, true);
        keyboard.addEventListener('touchstart', onStart, { passive: false, capture: true });
        keyboard.addEventListener('touchmove', onMove, { passive: false, capture: true });
        keyboard.addEventListener('touchend', onEnd, { capture: true });
        keyboard.addEventListener('touchcancel', onEnd, { capture: true });
    }

    function createPianoKeyboardDOM() {
        var container = $('piano-roll-container');
        if (!container) return;

        // 折叠栏 (作为状态栏内)
        var statusBar = $('status-bar');
        if (statusBar && !$('btn-toggle-keyboard')) {
            var btn = document.createElement('button');
            btn.id = 'btn-toggle-keyboard';
            btn.className = 'status-control-btn';
            btn.title = '展开/折叠钢琴键盘';
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="16" height="16" fill="currentColor"><rect x="4" y="12" width="56" height="40" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><rect x="12" y="12" width="8" height="24" fill="currentColor" opacity="0.9"/><rect x="28" y="12" width="8" height="24" fill="currentColor" opacity="0.9"/><rect x="44" y="12" width="8" height="24" fill="currentColor" opacity="0.9"/><rect x="18" y="12" width="6" height="14" fill="currentColor"/><rect x="34" y="12" width="6" height="14" fill="currentColor"/></svg>';
            btn.addEventListener('click', togglePianoKeyboard);
            var statusControls = statusBar.querySelector('.status-controls');
            if (statusControls) {
                var timeEl = $('progress-time');
                if (timeEl && timeEl.parentNode) {
                    timeEl.parentNode.insertBefore(btn, timeEl.nextSibling);
                } else {
                    statusControls.appendChild(btn);
                }
                if (!$('btn-numpad-range')) {
                    var rangeBtn = document.createElement('button');
                    rangeBtn.id = 'btn-numpad-range';
                    rangeBtn.className = 'status-control-btn';
                    rangeBtn.title = '设置小键盘弹奏音域';
                    rangeBtn.innerHTML = '<i class="fa-solid fa-sliders"></i>';
                    rangeBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showNumpadRangeSettings(rangeBtn);
                    });
                    statusControls.insertBefore(rangeBtn, btn.nextSibling);
                }
            }
        }

        // 键盘面板
        var keyboard = document.createElement('div');
        keyboard.id = 'piano-keyboard';
        keyboard.className = 'piano-keyboard-new';
        keyboard.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:148px;'
            + 'background:#0e0e22;border-top:1px solid #2a2a4a;display:none;z-index:35;'
            + 'overflow-x:auto;overflow-y:hidden;white-space:nowrap;padding:4px 2px;'
            + 'scrollbar-width:thin;scrollbar-color:#444 #0e0e22;';
        container.appendChild(keyboard);
        setupPianoKeyboardDrag(keyboard);

        // 键盘参数
        var WHITE_W = 30;
        var WHITE_H = 140;
        var BLACK_W = 18;
        var BLACK_H = 90;
        var isMobile = window.innerWidth <= 768;
        if (isMobile) {
            WHITE_W = 24;
            WHITE_H = 100;
            BLACK_W = 14;
            BLACK_H = 64;
            keyboard.style.height = '108px';
        }

        var whiteKeyIndices = {0:0, 2:1, 4:2, 5:3, 7:4, 9:5, 11:6};
        var blackBoundaries = {1:1, 3:2, 6:4, 8:5, 10:6};

        // Build positions from the actual NBS range (A0 through C8). Using full
        // octave positions would leave a blank C-to-G segment before the first key.
        var totalWhiteKeys = 0;
        var whitePositions = {};
        for (var k = 0; k <= 87; k++) {
            if (whiteKeyIndices[(k + 9) % 12] !== undefined) totalWhiteKeys++;
            if (whiteKeyIndices[(k + 9) % 12] !== undefined) {
                whitePositions[k] = totalWhiteKeys - 1;
            }
        }
        var containerWidth = totalWhiteKeys * WHITE_W + 4;
        var innerEl = document.createElement('div');
        // Auto margins center the full keyboard on wide displays; when it is
        // wider than the viewport they resolve to zero and horizontal scrolling
        // continues to use the actual keyboard centre.
        innerEl.style.cssText = 'position:relative;width:' + containerWidth + 'px;height:' + WHITE_H + 'px;margin:0 auto;';
        keyboard.appendChild(innerEl);
        keyboard._innerEl = innerEl;

        var MIN_MC_KEY = 33;
        var MAX_MC_KEY = 57;

        // 先创建白键
        for (var key = 0; key <= 87; key++) {
            // NBS key 0 maps to MIDI A0, so use MIDI pitch classes for display.
            var noteInOctave = (key + 9) % 12;
            var whiteIdx = whiteKeyIndices[noteInOctave];
            if (whiteIdx === undefined) continue;
            var midiNote = nbsKeyToMidiNote(key);
            var octave = getNbsKeyOctave(key);
            var pos = whitePositions[key];
            var isOutOfRange = (key < MIN_MC_KEY || key > MAX_MC_KEY);
            var keyEl = document.createElement('div');
            keyEl.className = 'piano-key white' + (isOutOfRange ? ' out-of-range' : '');
            keyEl.dataset.key = key;
            keyEl.style.cssText = 'position:absolute;left:' + (pos * WHITE_W) + 'px;top:0;'
                + 'width:' + WHITE_W + 'px;height:' + WHITE_H + 'px;'
                + 'display:flex;align-items:flex-end;justify-content:center;padding:0 1px 6px;'
                + 'white-space:pre-line;line-height:1.05;text-align:center;overflow:hidden;'
                + 'font-size:' + (isMobile ? '8px' : '10px') + ';cursor:pointer;z-index:1;'
                + 'box-sizing:border-box;border-radius:0 0 4px 4px;'
                + (isOutOfRange
                    ? 'background:#f0d0d0;color:#a33;border:1px solid #d0a0a0;'
                    : 'background:linear-gradient(to bottom,#fcfcfc,#e6e6e6);color:#333;border:1px solid #bbb;');
            var label = getNbsKeyPitchLabel(key);
            keyEl.dataset.pitchLabel = label;
            keyEl.dataset.keyLabel = getKeyboardLabelForNbsKey(key);
            keyEl.textContent = label;
            keyEl.title = label + octave + (isOutOfRange ? ' (超出范围)' : '');
            attachPianoKeyEvent(keyboard, keyEl, key);
            innerEl.appendChild(keyEl);
        }

        // 再创建黑键 (在最上层)
        for (var key2 = 0; key2 <= 87; key2++) {
            var note8va = (key2 + 9) % 12;
            var boundary = blackBoundaries[note8va];
            if (boundary === undefined) continue;
            var midiNote2 = nbsKeyToMidiNote(key2);
            var octave2 = getNbsKeyOctave(key2);
            var previousWhite = key2 - 1;
            while (previousWhite >= 0 && whitePositions[previousWhite] === undefined) previousWhite--;
            if (previousWhite < 0) continue;
            var leftPos = (whitePositions[previousWhite] + 1) * WHITE_W - BLACK_W / 2;
            var isOutOfRange2 = (key2 < MIN_MC_KEY || key2 > MAX_MC_KEY);
            var keyEl2 = document.createElement('div');
            keyEl2.className = 'piano-key black' + (isOutOfRange2 ? ' out-of-range' : '');
            keyEl2.dataset.key = key2;
            keyEl2.style.cssText = 'position:absolute;left:' + leftPos + 'px;top:0;'
                + 'width:' + BLACK_W + 'px;height:' + BLACK_H + 'px;'
                + 'display:flex;align-items:flex-end;justify-content:center;padding:0 1px 3px;'
                + 'white-space:pre-line;line-height:1.05;text-align:center;overflow:hidden;'
                + 'font-size:' + (isMobile ? '7px' : '8px') + ';cursor:pointer;z-index:2;'
                + 'box-sizing:border-box;border-radius:0 0 3px 3px;'
                + (isOutOfRange2
                    ? 'background:#4a1a1a;color:#e88;border:1px solid #6a2a2a;'
                    : 'background:linear-gradient(to bottom,#3a3a3a,#1a1a1a);color:#ccc;border:1px solid #111;');
            var label2 = getNbsKeyPitchLabel(key2);
            keyEl2.dataset.pitchLabel = label2;
            keyEl2.dataset.keyLabel = getKeyboardLabelForNbsKey(key2);
            keyEl2.textContent = label2;
            keyEl2.title = label2 + octave2 + (isOutOfRange2 ? ' (超出范围)' : '');
            attachPianoKeyEvent(keyboard, keyEl2, key2);
            innerEl.appendChild(keyEl2);
        }
    }

    function attachPianoKeyEvent(keyboard, el, key) {
        var activate = function(e) {
            if (keyboard._pianoDragging) { e.preventDefault(); e.stopPropagation(); return; }
            if (e) { e.preventDefault(); e.stopPropagation(); }
            state.selectedPianoKey = key;
            if (state.pianoRoll) {
                state.pianoRoll.setSelectedKey(key);
            }
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(state.currentInstrument, key, 80);
            }
            updatePianoKeyboardHighlight();
        };
        el.addEventListener('mousedown', activate);
        el.addEventListener('touchstart', activate, { passive: false });
    }

    function refreshPianoKeyboardKeyLabels() {
        var keyboard = $('piano-keyboard');
        if (!keyboard) return;
        var keys = keyboard.querySelectorAll('.piano-key');
        for (var i = 0; i < keys.length; i++) {
            var key = parseInt(keys[i].dataset.key, 10);
            keys[i].dataset.keyLabel = getKeyboardLabelForNbsKey(key);
        }
        updatePianoKeyboardHighlight();
    }

    function showNumpadRangeSettings(anchor) {
        var old = $('numpad-range-popover');
        if (old) old.remove();
        var t = i18nText;

        var pop = document.createElement('div');
        pop.id = 'numpad-range-popover';
        pop.style.cssText = 'position:fixed;z-index:10000;min-width:240px;background:rgba(18,18,42,0.98);'
            + 'border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:12px;'
            + 'box-shadow:0 12px 36px rgba(0,0,0,0.45);color:#eee;font-size:12px;';
        pop.innerHTML =
            '<div style="font-weight:700;margin-bottom:10px;font-size:13px;">' + t('弹奏音域设置') + '</div>' +
            '<div style="font-weight:600;margin-bottom:6px;color:#4ecdc4;">' + t('字母键盘') + '</div>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('八度偏移') + '</span><input id="letter-octave-shift" type="number" min="-4" max="4" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('半音偏移') + '</span><input id="letter-semitone-shift" type="number" min="-12" max="12" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<div style="height:1px;background:rgba(255,255,255,0.1);margin:10px 0;"></div>' +
            '<div style="font-weight:600;margin-bottom:6px;color:#4ecdc4;">' + t('小键盘') + '</div>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('八度偏移') + '</span><input id="numpad-octave-shift" type="number" min="-4" max="4" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<label style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0;">' +
            '<span>' + t('半音偏移') + '</span><input id="numpad-semitone-shift" type="number" min="-12" max="12" step="1" style="width:64px;padding:3px 5px;background:#1c1c3a;color:#fff;border:1px solid #3a3a66;border-radius:5px;text-align:center;"></label>' +
            '<div style="display:flex;gap:6px;justify-content:flex-end;margin-top:10px;">' +
            '<button id="numpad-range-reset" class="popup-btn popup-btn-cancel" style="padding:4px 9px;font-size:12px;">' + t('重置') + '</button>' +
            '<button id="numpad-range-close" class="popup-btn popup-btn-primary" style="padding:4px 9px;font-size:12px;">' + t('确定') + '</button></div>';
        document.body.appendChild(pop);

        var rect = anchor ? anchor.getBoundingClientRect() : { left: 12, top: window.innerHeight - 40, bottom: window.innerHeight - 8 };
        window.WebNBSPositionFlyout(pop, rect, { placement: 'top-start' });

        var letterOctaveInput = $('letter-octave-shift');
        var letterSemitoneInput = $('letter-semitone-shift');
        var octaveInput = $('numpad-octave-shift');
        var semitoneInput = $('numpad-semitone-shift');
        if (letterOctaveInput) letterOctaveInput.value = state.letterOctaveShift;
        if (letterSemitoneInput) letterSemitoneInput.value = state.letterSemitoneShift;
        if (octaveInput) octaveInput.value = state.numpadOctaveShift;
        if (semitoneInput) semitoneInput.value = state.numpadSemitoneShift;

        function applySettings() {
            state.letterOctaveShift = Math.max(-4, Math.min(4, parseInt(letterOctaveInput.value, 10) || 0));
            state.letterSemitoneShift = Math.max(-12, Math.min(12, parseInt(letterSemitoneInput.value, 10) || 0));
            state.numpadOctaveShift = Math.max(-4, Math.min(4, parseInt(octaveInput.value, 10) || 0));
            state.numpadSemitoneShift = Math.max(-12, Math.min(12, parseInt(semitoneInput.value, 10) || 0));
            saveNumpadRangeSettings();
            refreshPianoKeyboardKeyLabels();
        }
        if (letterOctaveInput) letterOctaveInput.addEventListener('input', applySettings);
        if (letterSemitoneInput) letterSemitoneInput.addEventListener('input', applySettings);
        if (octaveInput) octaveInput.addEventListener('input', applySettings);
        if (semitoneInput) semitoneInput.addEventListener('input', applySettings);
        var resetBtn = $('numpad-range-reset');
        if (resetBtn) resetBtn.addEventListener('click', function() {
            letterOctaveInput.value = '0';
            letterSemitoneInput.value = '0';
            octaveInput.value = '0';
            semitoneInput.value = '0';
            applySettings();
        });
        var closeBtn = $('numpad-range-close');
        if (closeBtn) closeBtn.addEventListener('click', function() { pop.remove(); });
        setTimeout(function() {
            document.addEventListener('mousedown', function closeOutside(e) {
                if (!pop.contains(e.target) && e.target !== anchor) {
                    pop.remove();
                    document.removeEventListener('mousedown', closeOutside);
                }
            });
        }, 0);
    }

    function togglePianoKeyboard() {
        var keyboard = $('piano-keyboard');
        var btn = $('btn-toggle-keyboard');
        if (!keyboard) return;
        var container = $('piano-roll-container') || keyboard.parentNode;

        var isOpen = keyboard.style.display === 'block';
        if (isOpen) {
            keyboard.classList.add('collapsing');
            if (btn) btn.classList.remove('active');
            setTimeout(function() {
                keyboard.style.display = 'none';
                keyboard.classList.remove('collapsing');
                if (container) container.classList.remove('keyboard-open');
                if (state.pianoRoll) {
                    if (state.pianoRoll._setupCanvas) state.pianoRoll._setupCanvas();
                    if (state.pianoRoll.render) state.pianoRoll.render();
                }
            }, 260);
            // 额外延迟重绘, 确保容器尺寸稳定后画布正确显示
            setTimeout(function() {
                if (state.pianoRoll) {
                    if (state.pianoRoll._setupCanvas) state.pianoRoll._setupCanvas();
                    if (state.pianoRoll.render) state.pianoRoll.render();
                }
            }, 320);
        } else {
            keyboard.style.display = 'block';
            keyboard.classList.remove('collapsing');
            if (container) container.classList.add('keyboard-open');
            if (btn) btn.classList.add('active');
            updatePianoKeyboardHighlight();
            // 默认滚动到完整 88 键键盘的水平中心
            // 先设置 display 后需要等待下一帧, 以确保元素已有尺寸
            centerPianoKeyboard(keyboard);
            requestAnimationFrame(function() { centerPianoKeyboard(keyboard); });
            setTimeout(function() { centerPianoKeyboard(keyboard); }, 0);
            // 显示后重设画布尺寸并重绘, 避免画布消失
            setTimeout(function() {
                if (state.pianoRoll) {
                    if (state.pianoRoll._setupCanvas) state.pianoRoll._setupCanvas();
                    if (state.pianoRoll.render) state.pianoRoll.render();
                }
            }, 50);
            setTimeout(function() { centerPianoKeyboard(keyboard); }, 50);
        }
    }

    function centerPianoKeyboard(keyboard) {
        if (!keyboard || keyboard.style.display === 'none') return;
        var inner = keyboard._innerEl;
        var keyboardWidth = inner ? inner.offsetWidth : keyboard.scrollWidth;
        keyboard.scrollLeft = Math.max(0, (keyboardWidth - keyboard.clientWidth) / 2);
    }

    function schedulePianoKeyboardCenter() {
        var keyboard = $('piano-keyboard');
        if (!keyboard || keyboard.style.display !== 'block') return;
        requestAnimationFrame(function() { centerPianoKeyboard(keyboard); });
        setTimeout(function() { centerPianoKeyboard(keyboard); }, 80);
    }

    window.addEventListener('resize', schedulePianoKeyboardCenter);
    window.addEventListener('orientationchange', schedulePianoKeyboardCenter);

    function openPianoKeyboard() {
        var keyboard = $('piano-keyboard');
        if (!keyboard) return;
        if (keyboard.style.display !== 'block') {
            togglePianoKeyboard();
        } else {
            updatePianoKeyboardHighlight();
        }
    }

    function updatePianoKeyboardHighlight() {
        var keyboard = $('piano-keyboard');
        if (!keyboard || keyboard.style.display === 'none') return;
        var keys = keyboard.querySelectorAll('.piano-key');
        var activeMap = {};
        var activeCodes = Object.keys(state._activePianoKeys || {});
        for (var ai = 0; ai < activeCodes.length; ai++) {
            if (state._activePianoKeys[activeCodes[ai]]) {
                var mappedKey = state._activePianoKeys[activeCodes[ai]];
                if (mappedKey === true) mappedKey = getShiftedKeyboardPianoKey(activeCodes[ai]);
                if (mappedKey !== undefined) activeMap[mappedKey] = true;
            }
        }
        for (var i = 0; i < keys.length; i++) {
            var k = parseInt(keys[i].dataset.key);
            var pitchLabel = keys[i].dataset.pitchLabel || keys[i].textContent || '';
            var keyLabel = keys[i].dataset.keyLabel || '';
            var isSelected = k === state.selectedPianoKey;
            var isActive = !!activeMap[k];
            if (state.keyboardPianoEnabled && keyLabel) {
                keys[i].textContent = pitchLabel + '\n' + keyLabel;
            } else {
                keys[i].textContent = pitchLabel;
            }
            if (isSelected || isActive) {
                keys[i].classList.add('selected');
            } else {
                keys[i].classList.remove('selected');
            }
        }
    }

    // ============ 文件操作 ============
    // 上传进度弹窗管理
    var _uploadProgressTimer = null;
    var _uploadProgressShown = false;
    var _uploadLastPercent = 0;        // 上次显示的进度(0-100)
    var _uploadLastSpeed = 0;          // 上次显示的速度(bytes/s)
    var _uploadLastEta = 0;            // 上次显示的预计剩余时间(秒)
    var _uploadLastLoaded = 0;         // 上次累计的 loaded
    var _uploadLastTotal = 0;          // 上次累计的 total
    var _uploadLastPhase = '';         // 上次显示的阶段

    function showUploadProgress(filename, title) {
        _uploadProgressShown = false;
        _uploadLastPercent = 0;
        _uploadLastSpeed = 0;
        _uploadLastEta = 0;
        _uploadLastLoaded = 0;
        _uploadLastTotal = 0;
        _uploadLastPhase = '';
        _uploadShowTime = Date.now();

        // 清除之前的定时器
        if (_uploadProgressTimer) { clearTimeout(_uploadProgressTimer); _uploadProgressTimer = null; }
        if (_hideUploadTimer) { clearTimeout(_hideUploadTimer); _hideUploadTimer = null; }

        // 1.2 秒后才显示弹窗
        _uploadProgressTimer = setTimeout(function() {
            _uploadProgressShown = true;
            var popup = $('upload-progress-popup');
            if (popup) { popup.classList.add('active'); popup.style.display = 'flex'; }
            var titleEl = $('upload-progress-title');
            if (titleEl) titleEl.textContent = title || '处理中';
            var nameEl = $('upload-progress-filename');
            if (nameEl) nameEl.textContent = filename || '';
            var bar = $('upload-progress-bar');
            if (bar) bar.style.width = '0%';
            var pct = $('upload-progress-percent');
            if (pct) pct.textContent = '0%';
            var spd = $('upload-progress-speed');
            if (spd) spd.textContent = formatBytes(0) + '/s';
            var eta = $('upload-progress-eta');
            if (eta) eta.textContent = '计算中…';
            var phaseEl = $('upload-progress-phase');
            if (phaseEl) phaseEl.textContent = '';
            // 如果已有进度，立即更新
            if (_uploadLastPercent > 0) {
                applyUploadProgress(_uploadLastLoaded, _uploadLastTotal, _uploadLastSpeed, _uploadLastPercent, _uploadLastEta, _uploadLastPhase);
            }
        }, 1200);
    }

    var _uploadShowTime = 0;  // 弹窗开始显示的时间

    function hideUploadProgress() {
        if (_uploadProgressTimer) { clearTimeout(_uploadProgressTimer); _uploadProgressTimer = null; }
        if (_hideUploadTimer) { clearTimeout(_hideUploadTimer); _hideUploadTimer = null; }
        var popup = $('upload-progress-popup');
        if (popup) { popup.classList.remove('active'); popup.style.display = ''; }
        _uploadProgressShown = false;
        _uploadLastPercent = 0;
    }
    var _hideUploadTimer = null;

    // 把最新进度写入缓存（弹窗未到 1.2s 也会被记录）
    function updateUploadProgress(loaded, total, speed, percent, eta, phase) {
        _uploadLastLoaded = loaded;
        _uploadLastTotal = total;
        _uploadLastSpeed = speed;
        _uploadLastPercent = percent;
        _uploadLastEta = eta;
        _uploadLastPhase = phase || _uploadLastPhase;

        if (!_uploadProgressShown) {
            // 1.2s 之前收到的进度，先缓存
            return;
        }
        applyUploadProgress(loaded, total, speed, percent, eta, phase);
    }

    var _phaseNames = {
        'upload': '正在上传...',
        'parse': '正在解析...',
        'process': '正在处理...',
        'complete': '处理完成',
        'error': '处理失败'
    };

    // 实际应用进度到 DOM
    function applyUploadProgress(loaded, total, speed, percent, eta, phase) {
        var bar = $('upload-progress-bar');
        if (bar) bar.style.width = percent + '%';
        var pct = $('upload-progress-percent');
        if (pct) pct.textContent = percent + '%';
        var spd = $('upload-progress-speed');
        if (spd) {
            if (phase === 'upload' || (loaded > 0 && total > 0)) {
                spd.textContent = formatBytes(speed) + '/s';
            } else {
                spd.textContent = '';
            }
        }
        var etaEl = $('upload-progress-eta');
        if (etaEl) {
            if (eta >= 0 && isFinite(eta)) {
                etaEl.textContent = '预计 ' + formatTime(eta);
            } else {
                etaEl.textContent = '';
            }
        }
        var phaseEl = $('upload-progress-phase');
        if (phaseEl) {
            phaseEl.textContent = _phaseNames[phase] || (phase ? phase : '');
        }
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return Math.round(bytes) + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatTime(seconds) {
        if (seconds < 1) return '< 1秒';
        if (seconds < 60) return Math.round(seconds) + '秒';
        var m = Math.floor(seconds / 60);
        var s = Math.round(seconds % 60);
        return m + '分' + s + '秒';
    }

    function handleFileOpen(e) {
        var file = e.target.files[0];
        if (!file) return;

        // 检查文件扩展名，MIDI 文件显示导入弹窗
        var fileName = file.name.toLowerCase();
        if (fileName.endsWith('.mid') || fileName.endsWith('.midi')) {
            state._midiFile = file;
            showMidiPopup();
            $setText('midi-file-name', file.name);
            $setText('midi-type', '...');
            $setText('midi-duration', '...');
            $setText('midi-tracks', '...');
            $setText('midi-notes', '...');
            showUploadProgress(file.name);
            API.getMidiInfo(file, function(loaded, total, speed, percent, eta) {
                updateUploadProgress(loaded, total, speed, percent, eta);
            }).then(function(data) {
                hideUploadProgress();
                if (data.success && data.info) {
                    state._midiInfo = data.info;
                    populateMidiDialog(data.info);
                } else {
                    showAppAlert('无法读取 MIDI 信息: 返回数据异常', {title: 'MIDI 信息', icon: 'fa-solid fa-file-audio'});
                }
            }).catch(function(err) {
                hideUploadProgress();
                var msg = formatError(err, '无法读取 MIDI 信息');
                $setText('midi-type', '错误: ' + msg);
                showAppAlert('读取 MIDI 信息失败: ' + msg, {title: 'MIDI 信息', icon: 'fa-solid fa-file-audio'});
            });
            e.target.value = '';
            return;
        }

        // NBS 文件直接加载
        // 新文件, 重置文件 ID
        state.currentFileId = null;
        showUploadProgress(file.name);
        API.loadSong(file, function(loaded, total, speed, percent, eta) {
            updateUploadProgress(loaded, total, speed, percent, eta);
        }).then(function(data) {
            hideUploadProgress();
            if (!data || !data.song) throw new Error('解析返回空数据');

            state.song = data.song;
            state.notes = data.song.notes || [];
            // 保存导入文件名（去掉扩展名）
            state.importedFileName = file.name.replace(/\.[^.]+$/, '');
            // NBS 文件没有 MIDI 映射，清除残留的 MIDI 音轨状态
            state.layerChannelMap = {};
            _midiTrackStates = {};
            state._channelTracks = {};

            var loadedTempo = parseFloat(data.song.tempo);
            if (!isFinite(loadedTempo) || loadedTempo <= 0) loadedTempo = 10;
            if (loadedTempo > 655) loadedTempo = 655;
            state.tempo = loadedTempo;

            $setValue('tempo-slider', state.tempo);
            $('tempo-value').value = state.tempo;
            $setValue('fls-tempo-input', Math.round(state.tempo));
            $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
            $setValue('settings-tempo-input', state.tempo);
            $setText('settings-tempo-value', (state.tempo).toFixed(1));

            buildNoteIndex(state.notes);
            state.undoStack = [];
            state.redoStack = [];
            updateUndoRedoButtons();

            if (state.flsEnabled && state.flsModel) {
                state.flsModel = new FLS.Model();
                state.flsModel.loadFromFlatNotes(state.notes, state.tempo);
                state.flsPlaylist = null;
                state.flsTrackPanel = null;
                state.flsPianoRoll = null;
                enterFLSModeFromLoaded();
            } else if (state.pianoRoll) {
                state.pianoRoll._setupCanvas();
                state.pianoRoll.setNotes(state.notes);
            }

            updateSongInfo();
            checkOctaveRange(state.notes);
            // 切换文件时重置轨道状态, 再根据 NBS 文件中的 lock 字段初始化
            state.tracks = [];
            updateTrackPanelUI();
            handleStop();
            markDirty();
            e.target.value = '';
        }).catch(function(err) {
            hideUploadProgress();
            showAppAlert('加载失败: ' + formatError(err, '无法加载文件'), {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
        });
    }

    function handleSave() {
        // 导出锁: 防止与 exportNBS 冲突
        if (_isExporting) return;
        if (state.flsEnabled && state.flsModel) syncNotesFromFLS(true);

        var song = state.song || {
            name: 'Untitled', song_name: 'Untitled',
            author: '', original_author: '', description: '',
            tempo: state.tempo, length: state.maxTick + 4,
            notes: state.notes, layers: []
        };
        song.notes = state.notes;
        song.tempo = state.tempo;
        song.length = state.maxTick + 4;

        if (!song.layers || song.layers.length === 0) {
            var maxLayer = 0;
            for (var i = 0; i < state.notes.length; i++) {
                if (state.notes[i].layer > maxLayer) maxLayer = state.notes[i].layer;
            }
            song.layers = [];
            for (var l = 0; l <= maxLayer; l++) {
                song.layers.push({ name: 'Layer ' + (l + 1), volume: 100, stereo: 100, lock: 0 });
            }
        }

        // 保存时根据当前轨道状态写入 lock 字段
        // pynbs 1.0.0-beta.0 仅支持 bool 类型的 lock, 因此只持久化静音(1), 不持久化独奏
        for (var li = 0; li < song.layers.length; li++) {
            if (song.layers[li].lock === undefined) song.layers[li].lock = 0;
            var t = findTrackByLayer(li);
            if (t) {
                song.layers[li].lock = t.muted ? 1 : 0;
            }
        }

        var saveName = (state.importedFileName || song.name || song.song_name || 'Untitled') + '.nbs';
        showUploadProgress(saveName, '保存 NBS');
        API.saveSong(song, function(loaded, total, speed, percent, eta, phase) {
            updateUploadProgress(loaded, total, speed, percent, eta, phase);
        }).then(function(result) {
            hideUploadProgress();
            var filename = result.filename || saveName;
            // 使用 <a download> 触发下载，保留文件名
            var a = document.createElement('a');
            a.href = result.downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function() {
                if (a.parentNode) a.parentNode.removeChild(a);
                URL.revokeObjectURL(result.downloadUrl);
            }, 5000);
            clearAutoSaveLocal();
        }).catch(function(err) {
            hideUploadProgress();
            showAppAlert('保存失败: ' + formatError(err, '无法保存文件'), {title: '保存失败', icon: 'fa-solid fa-triangle-exclamation'});
        });
    }

    // ============ MIDI 导入 ============
    // NBS 乐器名称 (与后端 INSTRUMENT_NAMES 对应)
    var INSTRUMENT_NAMES = [
        "Harp/Piano", "Double Bass", "Bass Drum", "Snare Drum", "Click/Sticks",
        "Guitar", "Flute", "Bell/Glock", "Chime/Box", "Xylophone",
        "Iron Xylophone", "Cow Bell", "Didgeridoo", "Bit/Pluck", "Banjo", "Pling/Elec",
        "Copper Horn", "Exposed Copper Horn", "Weathered Copper Horn", "Oxidized Copper Horn"
    ];

    // NBS 音高名称 (0-87)
    var NOTE_NAMES = [];
    (function() {
        var noteLetters = ['F#','G','G#','A','A#','B','C','C#','D','D#','E','F'];
        for (var i = 0; i < 88; i++) {
            var letter = noteLetters[i % 12];
            var octave = Math.floor((i - 3) / 12);
            NOTE_NAMES.push(letter + octave);
        }
    })();

    // MIDI 音高名称 (用于试听下拉)
    var MIDI_NOTE_NAMES = {
        60: 'C4', 61: 'C#4', 62: 'D4', 63: 'D#4', 64: 'E4', 65: 'F4', 66: 'F#4', 67: 'G4',
        68: 'G#4', 69: 'A4', 70: 'A#4', 71: 'B4', 72: 'C5', 73: 'C#5', 74: 'D5', 75: 'D#5',
        76: 'E5', 77: 'F5', 78: 'F#5', 79: 'G5', 80: 'G#5', 81: 'A5', 82: 'A#5', 83: 'B5',
        84: 'C6'
    };

    // ============ 音色替代: 音域偏移量表 + 默认替代配置 ============
    // 每个旋律乐器相对于竖琴(基准 0)的半音偏移量 (基于 MC 官方数据)
    // NBS key 33~57 对应该乐器自身音域的 25 档 (F# 起始)
    // 实际 MIDI 音高 = NBS_key + 21 + INSTRUMENT_OFFSET[id]
    var INSTRUMENT_OFFSET = {
        0: 0,    // 竖琴 Harp (F#3~F#5, MIDI 54~78)
        1: -24,  // 贝斯 Bass (F#1~F#3, MIDI 30~54)
        5: -12,  // 吉他 Guitar (F#2~F#4, MIDI 42~66)
        6: 12,   // 长笛 Flute (F#4~F#6, MIDI 66~90)
        7: 24,   // 钟 Bell (F#5~F#7, MIDI 78~102)
        8: 24,   // 管钟 Chime (F#5~F#7)
        9: 24,   // 木琴 Xylophone (F#5~F#7)
        10: 0,   // 颤音琴 Iron Xylophone (F#3~F#5)
        11: 12,  // 牛铃 Cow Bell (F#4~F#6)
        12: -24, // 迪吉里杜管 Didgeridoo (F#1~F#3)
        13: 0,   // 方波 Bit (F#3~F#5)
        14: 0,   // 班卓琴 Banjo (F#3~F#5)
        15: 0,   // 电钢琴 Pling (F#3~F#5)
        16: 0, 17: 0, 18: 0, 19: 0  // 铜号角 (假设与竖琴相同)
    };

    // 全局音域 (actualMIDI 层面): F#1~F#7, 跨度 72 半音
    var GLOBAL_MIDI_MIN = 42;
    var GLOBAL_MIDI_MAX = 114;
    var GLOBAL_MIDI_SPAN = 72;

    // NBS 格式硬性限制: nbsKey ∈ [0, 87], 对应 processedMidi ∈ [21, 108]
    // processedMidi > 108 时 nbsKey > 87 会被 clamp, 导致音高丢失
    // 因此 calculateOptimalOffset 使用 PROCESSED_MIDI_MAX (108) 作为有效上限
    var NBS_KEY_MAX = 87;
    var PROCESSED_MIDI_MAX = NBS_KEY_MAX + 21;  // 108

    // Minecraft 标准音域 (与 piano_roll.js MINECRAFT_PITCH_MIN/MAX 一致)
    // NBS key 33~57, 对应 processedMidi 54~78 (F#3~F#5, 竖琴的两个八度)
    // 超出此范围的音符在 piano_roll 中显示红色 (音色偏离 Minecraft 原版效果)
    // 智能替代/偏移/归一/兜底的目标都是让 processedMidi 落入 [MC_MIDI_MIN, MC_MIDI_MAX]
    var MC_KEY_MIN = 33;
    var MC_KEY_MAX = 57;
    var MC_MIDI_MIN = MC_KEY_MIN + 21;  // 54
    var MC_MIDI_MAX = MC_KEY_MAX + 21;  // 78
    var MC_MIDI_SPAN = MC_KEY_MAX - MC_KEY_MIN;  // 24

    // 旋律乐器 ID 列表 (排除打击乐 2/3/4)
    var MELODY_INSTRUMENT_IDS = [0, 1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

    // 默认音色替代配置 (链条式, 基于最终版规范文档 §4)
    // 高频链: Harp(0,offset=0) → Flute(6,+12) → Chime(8,+24) → [end]
    // 低频链: Harp(0,offset=0) → Guitar(5,-12) → Bass(1,-24) → [end]
    // high: 超出高音时跳转的下一个音色; low: 超出低音时跳转的下一个音色; -1 = 链尾
    // 同基调偏移的音色共享同一链位置 (例如 Bit/Banjo/Pling 与 Harp 同为 offset=0)
    var DEFAULT_SUBSTITUTE = {
        0:  { high: 6,  low: 5  },  // 竖琴 Harp (offset=0)   → 高:长笛, 低:吉他
        1:  { high: 5,  low: -1 },  // 贝斯 Bass (offset=-24) → 高:吉他, 低:链尾
        5:  { high: 0,  low: 1  },  // 吉他 Guitar (offset=-12) → 高:竖琴, 低:贝斯
        6:  { high: 8,  low: 0  },  // 长笛 Flute (offset=+12) → 高:管钟, 低:竖琴
        7:  { high: -1, low: 6  },  // 钟 Bell (offset=+24)   → 高:链尾, 低:长笛
        8:  { high: -1, low: 6  },  // 管钟 Chime (offset=+24) → 高:链尾, 低:长笛
        9:  { high: -1, low: 6  },  // 木琴 Xylophone (offset=+24) → 高:链尾, 低:长笛
        10: { high: 6,  low: 5  },  // 颤音琴 Iron_Xylophone (offset=0) → 高:长笛, 低:吉他
        11: { high: 8,  low: 0  },  // 牛铃 Cow_Bell (offset=+12) → 高:管钟, 低:竖琴
        12: { high: 0,  low: -1 },  // 迪吉里杜管 Didgeridoo (offset=-24) → 高:竖琴(→长笛), 低:链尾
        13: { high: 6,  low: 5  },  // 方波 Bit (offset=0)    → 高:长笛, 低:吉他
        14: { high: 6,  low: 5  },  // 班卓琴 Banjo (offset=0) → 高:长笛, 低:吉他
        15: { high: 6,  low: 5  }   // 电钢琴 Pling (offset=0) → 高:长笛, 低:吉他
    };

    // 音色替代配置 (运行时, 从 localStorage 加载或使用默认)
    var _substituteConfig = null;
    var _substituteSelectedTracks = null; // null = 全部, 或 { trackIndex: true }

    function loadSubstituteConfig() {
        if (_substituteConfig) return _substituteConfig;
        try {
            var saved = localStorage.getItem('webnbs_substitute_config');
            if (saved) {
                _substituteConfig = JSON.parse(saved);
            }
        } catch(e) {}
        if (!_substituteConfig) {
            _substituteConfig = JSON.parse(JSON.stringify(DEFAULT_SUBSTITUTE));
        }
        return _substituteConfig;
    }

    function saveSubstituteConfig(config) {
        _substituteConfig = config;
        try {
            localStorage.setItem('webnbs_substitute_config', JSON.stringify(config));
        } catch(e) {}
    }

    // 获取乐器音域文本 (用于 UI 显示)
    function getInstrumentRangeText(instId) {
        var offset = INSTRUMENT_OFFSET[instId] || 0;
        // NBS key 33~57 对应该乐器音域, 实际 MIDI = key + 21 + offset
        var minMidi = 33 + 21 + offset;
        var maxMidi = 57 + 21 + offset;
        return midiNoteToName(minMidi) + '~' + midiNoteToName(maxMidi);
    }

    // ============ 音色替代设置弹窗 ============
    function openSubstituteSettings() {
        var popup = $('midi-substitute-popup');
        if (!popup) return;
        popup.style.display = 'flex';
        popup.classList.add('active');

        var config = loadSubstituteConfig();
        var info = state._midiInfo;

        // 默认显示第一个 tab
        var tabTrack = $('midi-substitute-tab-track');
        var tabInstrument = $('midi-substitute-tab-instrument');
        var tabBtns = popup.querySelectorAll('.midi-sub-tab');
        if (tabTrack) tabTrack.style.display = '';
        if (tabInstrument) tabInstrument.style.display = 'none';
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].classList.toggle('active', tabBtns[ti].getAttribute('data-subtab') === 'sub-track');
        }

        // 渲染音轨列表
        renderSubstituteTracks(info);

        // 渲染音色替代配置表
        renderSubstituteRows(config);

        // 隐藏警告
        var warnEl = $('midi-substitute-warning');
        if (warnEl) warnEl.style.display = 'none';
    }

    function closeSubstituteSettings() {
        // 关闭弹窗时停止所有 MIDI 预览播放
        stopSustainTrackPreview();
        stopMidiTrackPlayback();
        var popup = $('midi-substitute-popup');
        if (popup) {
            popup.classList.remove('active');
            popup.style.display = 'none';
        }
    }

    // Tab 切换
    function switchSubstituteTab(tabName) {
        var tabTrack = $('midi-substitute-tab-track');
        var tabInstrument = $('midi-substitute-tab-instrument');
        if (tabTrack) tabTrack.style.display = (tabName === 'sub-track') ? '' : 'none';
        if (tabInstrument) tabInstrument.style.display = (tabName === 'sub-instrument') ? '' : 'none';
        var tabBtns = document.querySelectorAll('#midi-substitute-popup .midi-sub-tab');
        for (var ti = 0; ti < tabBtns.length; ti++) {
            tabBtns[ti].classList.toggle('active', tabBtns[ti].getAttribute('data-subtab') === tabName);
        }
    }

    function renderSubstituteTracks(info) {
        var container = $('midi-substitute-tracks');
        if (!container) return;
        container.innerHTML = '';

        if (!info || !info.tracks || info.tracks.length === 0) {
            container.innerHTML = '<div style="padding:12px;color:var(--text-tertiary);font-size:11px;text-align:center;">暂无 MIDI 音轨数据</div>';
            return;
        }

        // 初始化选中状态: 默认全选
        if (!_substituteSelectedTracks) {
            _substituteSelectedTracks = {};
            for (var i = 0; i < info.tracks.length; i++) {
                _substituteSelectedTracks[info.tracks[i].index] = true;
            }
        }

        // 渲染每个 track (风格与 sustain-tracks-popup 一致)
        for (var i = 0; i < info.tracks.length; i++) {
            (function(track) {
                var checked = _substituteSelectedTracks[track.index] ? 'checked' : '';
                var trackName = escapeHtml(track.name || ('Track ' + (track.index + 1)));
                var row = document.createElement('div');
                row.className = 'sustain-track-item';
                row.setAttribute('data-track', track.index);
                row.innerHTML = '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:180px;overflow:hidden;flex-shrink:0;">'
                    + '<input type="checkbox" class="substitute-track-checkbox" value="' + track.index + '" ' + checked + '>'
                    + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#' + track.index + ' ' + trackName + '</span>'
                    + '</label>'
                    + '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0;width:56px;text-align:right;">音符 ' + (track.note_count || 0) + '</span>'
                    + '<button class="sustain-track-preview-btn" data-track="' + track.index + '" title="试听此轨道" style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);background:var(--ctrl-fill-default);color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.15s;">'
                    + '<i class="fa-solid fa-play"></i></button>'
                    + '<div class="sustain-track-mini-roll" data-track="' + track.index + '" style="flex:1;min-width:120px;height:36px;background:var(--neutral-2);border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:pointer;">'
                    + '<canvas style="display:block;width:100%;height:100%;"></canvas>'
                    + '</div>';
                container.appendChild(row);
            })(info.tracks[i]);
        }

        // 绑定复选框变化
        var checkboxes = container.querySelectorAll('.substitute-track-checkbox');
        for (var ci = 0; ci < checkboxes.length; ci++) {
            (function(chk) {
                chk.addEventListener('change', function() {
                    _substituteSelectedTracks[parseInt(chk.value)] = chk.checked;
                });
            })(checkboxes[ci]);
        }

        // 绑定试听按钮
        var previewBtns = container.querySelectorAll('.sustain-track-preview-btn');
        for (var k = 0; k < previewBtns.length; k++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var trackIdx = parseInt(btn.getAttribute('data-track'));
                    toggleSustainTrackPreview(trackIdx, btn);
                });
            })(previewBtns[k]);
        }

        // 解析 MIDI 文件，为每行初始化迷你音符图
        if (state._midiFile) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var allEvents = parseMidiFileForPlayback(e.target.result, state._midiInfo);
                var miniRolls = container.querySelectorAll('.sustain-track-mini-roll');
                var fullDuration = (state._midiInfo && state._midiInfo.duration_seconds) || 0;
                if (!fullDuration) {
                    for (var d = 0; d < allEvents.length; d++) {
                        if (allEvents[d].time > fullDuration) fullDuration = allEvents[d].time;
                    }
                }
                for (var mi = 0; mi < miniRolls.length; mi++) {
                    (function(container2) {
                        var trackIdx = parseInt(container2.getAttribute('data-track'));
                        var notes = extractTrackNotes(allEvents, trackIdx);
                        var canvas = container2.querySelector('canvas');
                        var mr = new MiniMidiRoll(canvas, notes, { fullDuration: fullDuration });
                        container2._miniRoll = mr;
                        container2.addEventListener('click', function(ev) {
                            var rect = container2.getBoundingClientRect();
                            var clickX = ev.clientX - rect.left;
                            var seekT = mr.pixelToTime(clickX);
                            var trackIdx2 = parseInt(container2.getAttribute('data-track'));
                            var previewBtn = container2.parentNode.querySelector('.sustain-track-preview-btn[data-track="' + trackIdx2 + '"]');
                            stopSustainTrackPreview();
                            if (previewBtn) {
                                previewBtn.classList.add('playing');
                                var pIcon = previewBtn.querySelector('i');
                                if (pIcon) pIcon.className = 'fa-solid fa-stop';
                            }
                            previewSustainTrack(trackIdx2, previewBtn, seekT);
                        });
                    })(miniRolls[mi]);
                }
            };
            reader.readAsArrayBuffer(state._midiFile);
        }
    }

    function renderSubstituteRows(config) {
        var tbody = $('midi-substitute-rows');
        if (!tbody) return;
        tbody.innerHTML = '';

        for (var i = 0; i < MELODY_INSTRUMENT_IDS.length; i++) {
            (function(instId) {
                var cfg = config[instId] || { high: -1, low: -1 };
                var tr = document.createElement('tr');
                tr.setAttribute('data-inst', instId);

                // 音色名称
                var nameTd = document.createElement('td');
                nameTd.textContent = INSTRUMENT_NAMES[instId] || ('Inst ' + instId);
                nameTd.style.cssText = 'padding:5px 8px;white-space:nowrap;';
                tr.appendChild(nameTd);

                // 音域
                var rangeTd = document.createElement('td');
                rangeTd.textContent = getInstrumentRangeText(instId);
                rangeTd.style.cssText = 'padding:5px 8px;font-size:10px;color:var(--text-tertiary);';
                tr.appendChild(rangeTd);

                // 高音替代槽 (timbre-slot-btn 风格)
                var highTd = document.createElement('td');
                highTd.style.padding = '5px 8px';
                highTd.innerHTML = '<input type="hidden" class="substitute-slot" data-inst="' + instId + '" data-type="high" value="' + cfg.high + '">'
                    + '<div class="timbre-slot-btn substitute-slot-btn" data-inst="' + instId + '" data-type="high" title="点击选择高音替代音色">'
                    + getInstrumentIconHtml(cfg.high) + '<span class="timbre-slot-text">' + (cfg.high >= 0 ? INSTRUMENT_NAMES[cfg.high] : '无') + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i></div>';
                tr.appendChild(highTd);

                // 低音替代槽 (timbre-slot-btn 风格)
                var lowTd = document.createElement('td');
                lowTd.style.padding = '5px 8px';
                lowTd.innerHTML = '<input type="hidden" class="substitute-slot" data-inst="' + instId + '" data-type="low" value="' + cfg.low + '">'
                    + '<div class="timbre-slot-btn substitute-slot-btn" data-inst="' + instId + '" data-type="low" title="点击选择低音替代音色">'
                    + getInstrumentIconHtml(cfg.low) + '<span class="timbre-slot-text">' + (cfg.low >= 0 ? INSTRUMENT_NAMES[cfg.low] : '无') + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i></div>';
                tr.appendChild(lowTd);

                tbody.appendChild(tr);
            })(MELODY_INSTRUMENT_IDS[i]);
        }

        // 绑定替代槽点击
        var slotBtns = tbody.querySelectorAll('.substitute-slot-btn');
        for (var si = 0; si < slotBtns.length; si++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var instId = parseInt(btn.getAttribute('data-inst'));
                    var type = btn.getAttribute('data-type');
                    showSubstituteSlotMenu(btn, instId, type);
                });
                btn.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var instId = parseInt(btn.getAttribute('data-inst'));
                    var type = btn.getAttribute('data-type');
                    showSubstituteSlotMenu(btn, instId, type);
                });
            })(slotBtns[si]);
        }
    }

    // 显示音色替代槽选择菜单 (风格与 timbre-slot-menu 一致)
    function showSubstituteSlotMenu(anchorEl, instId, type) {
        var existing = $('substitute-slot-menu');
        if (existing) existing.remove();

        var slotInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="' + type + '"]');
        var currentValue = slotInput ? parseInt(slotInput.value) : -1;

        var menu = document.createElement('div');
        menu.id = 'substitute-slot-menu';
        menu.className = 'timbre-slot-menu';

        // 旋律乐器颜色 (与 timbre-slot-menu 一致)
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        // "无" 选项
        var noneItem = document.createElement('div');
        noneItem.className = 'timbre-menu-item' + (currentValue < 0 ? ' selected' : '');
        noneItem.innerHTML = '<span class="timbre-menu-icon timbre-menu-icon-none">-</span><span style="color:#888;font-style:italic;">无</span>';
        noneItem.addEventListener('click', function(e) {
            selectSubstituteSlot(instId, type, -1, '无');
            menu.remove();
            e.stopPropagation();
        });
        menu.appendChild(noneItem);

        // 旋律乐器选项 (排除自身)
        for (var i = 0; i < MELODY_INSTRUMENT_IDS.length; i++) {
            var optId = MELODY_INSTRUMENT_IDS[i];
            if (optId === instId) continue;
            (function(optId2) {
                var item = document.createElement('div');
                var isSelected = (currentValue === optId2);
                item.className = 'timbre-menu-item' + (isSelected ? ' selected' : '');
                item.innerHTML = '<span class="timbre-menu-icon" style="background:' + colors[optId2] + ';">'
                    + '<img src="static/sprites/spr_instrumenticons/inst_' + optId2 + '.png" alt="" />'
                    + (isSelected ? '<span class="timbre-menu-check"><i class="fa-solid fa-check"></i></span>' : '')
                    + '</span><span>' + INSTRUMENT_NAMES[optId2] + '</span>';
                item.addEventListener('click', function(e) {
                    selectSubstituteSlot(instId, type, optId2, INSTRUMENT_NAMES[optId2]);
                    menu.remove();
                    e.stopPropagation();
                });
                menu.appendChild(item);
            })(optId);
        }

        document.body.appendChild(menu);

        // 智能计算尺寸与位置 (与 showTimbreSlotMenu 一致)
        var rect = anchorEl.getBoundingClientRect();
        var winHeight = window.innerHeight;
        var winWidth = window.innerWidth;
        var margin = 8;
        var naturalHeight = menu.scrollHeight;
        var menuWidth = Math.max(menu.offsetWidth, 150);
        var spaceBelow = winHeight - rect.bottom - margin;
        var spaceAbove = rect.top - margin;
        var preferredHeight = Math.min(naturalHeight, 260);
        var compact = false;
        if (Math.max(spaceBelow, spaceAbove) < 220 || naturalHeight > Math.max(spaceBelow, spaceAbove)) {
            compact = true;
            menu.classList.add('compact');
            preferredHeight = Math.min(menu.scrollHeight, Math.max(spaceBelow, spaceAbove) - margin, 220);
        }
        preferredHeight = Math.max(preferredHeight, 80);
        var menuY = rect.bottom + 4;
        if (menuY + preferredHeight > winHeight - margin && spaceAbove > spaceBelow) {
            menuY = rect.top - preferredHeight - 4;
        }
        var menuX = rect.left;
        if (menuX + menuWidth > winWidth - margin) menuX = winWidth - menuWidth - margin;
        if (menuX < margin) menuX = margin;
        if (menuY < margin) menuY = margin;
        if (menuY + preferredHeight > winHeight - margin) preferredHeight = winHeight - margin - menuY;
        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        menu.style.maxHeight = preferredHeight + 'px';
        menu.style.width = menuWidth + 'px';
        menu.style.transform = 'none';
        window.WebNBSPositionFlyout(menu, rect, {
            placement: menuY < rect.top ? 'top-start' : 'bottom-start',
            maxHeight: preferredHeight
        });

        // 播放当前选中的音色预览
        if (window.AudioEngine && AudioEngine.playNote && currentValue >= 0) {
            AudioEngine.playNote(currentValue, 60, 70);
        }

        // 点击其他地方关闭菜单
        var closeMenu = function(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(function() {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    function selectSubstituteSlot(instId, type, value, displayName) {
        var slotInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="' + type + '"]');
        var slotBtn = document.querySelector('.substitute-slot-btn[data-inst="' + instId + '"][data-type="' + type + '"]');
        if (slotInput) slotInput.value = value;
        if (slotBtn) {
            slotBtn.innerHTML = getInstrumentIconHtml(value) + '<span class="timbre-slot-text">' + displayName + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i>';
        }
        // 选择成功后立即试听该 NBS 音色
        if (value >= 0) {
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(value, 60, 80);
            }
        }
    }

    // 从 UI 读取音色替代配置
    function readSubstituteConfigFromUI() {
        var config = {};
        for (var i = 0; i < MELODY_INSTRUMENT_IDS.length; i++) {
            var instId = MELODY_INSTRUMENT_IDS[i];
            var highInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="high"]');
            var lowInput = document.querySelector('.substitute-slot[data-inst="' + instId + '"][data-type="low"]');
            var high = highInput ? parseInt(highInput.value) : -1;
            var low = lowInput ? parseInt(lowInput.value) : -1;
            if (isNaN(high)) high = -1;
            if (isNaN(low)) low = -1;
            config[instId] = { high: high, low: low };
        }
        return config;
    }

    // ============ 音色替代核心算法 ============
    // 跨乐器等音高换算: 将原音色的 NBS key 换算为目标音色的 NBS key, 保证实际音高不变
    // 公式: newKey = origKey + (origOffset - targetOffset)
    // 因为 实际MIDI = key + 21 + offset, 要保持 MIDI 不变:
    //   origKey + 21 + origOffset = newKey + 21 + targetOffset
    //   newKey = origKey + origOffset - targetOffset
    function convertKeyAcrossInstruments(origKey, origInstId, targetInstId) {
        var origOffset = INSTRUMENT_OFFSET[origInstId] || 0;
        var targetOffset = INSTRUMENT_OFFSET[targetInstId] || 0;
        return origKey + origOffset - targetOffset;
    }

    // 应用音色替代到单个音符 (链条式, 与 nbs_client.js 保持一致)
    // 入参为 MIDI 表示值 (而非 NBS key), 目标音域为 Minecraft 标准音域 [54, 78]
    // 返回 { midi, instrument, substituted: 'high'|'low'|null, outOfRange: bool }
    function applySubstituteToNote(midiNote, instId, config) {
        var result = { midi: midiNote, instrument: instId, substituted: null, outOfRange: false };
        // 在 Minecraft 标准音域内 [54, 78] 不需要替代 (nbsKey 33~57)
        if (midiNote >= MC_MIDI_MIN && midiNote <= MC_MIDI_MAX) {
            return result;
        }

        if (!config) {
            result.outOfRange = (midiNote < MC_MIDI_MIN || midiNote > MC_MIDI_MAX);
            return result;
        }

        // 链条式替代: 从当前音色开始, 按 high/low 跳到下一个音色
        var chainInst = instId;
        var chainMidi = midiNote;
        var maxChainSteps = 4;

        for (var chainStep = 0; chainStep < maxChainSteps; chainStep++) {
            var substCfg = config[chainInst];
            if (!substCfg) break;

            var targetInst = -1;
            var direction = null;
            if (chainMidi > MC_MIDI_MAX && substCfg.high >= 0) {
                targetInst = substCfg.high;
                direction = 'high';
            } else if (chainMidi < MC_MIDI_MIN && substCfg.low >= 0) {
                targetInst = substCfg.low;
                direction = 'low';
            } else {
                break;
            }

            var chainOrigOffset = INSTRUMENT_OFFSET[chainInst] || 0;
            var chainTargetOffset = INSTRUMENT_OFFSET[targetInst] || 0;
            // 新MIDI = 原MIDI - (新基调 - 原基调), 保持绝对声学频率不变
            var newMidi = chainMidi - (chainTargetOffset - chainOrigOffset);

            if (newMidi >= MC_MIDI_MIN && newMidi <= MC_MIDI_MAX) {
                // 替代成功
                return { midi: newMidi, instrument: targetInst, substituted: direction, outOfRange: false };
            }

            // 继续链条
            chainInst = targetInst;
            chainMidi = newMidi;
        }

        // 链条用尽仍未在 Minecraft 标准音域内
        result.outOfRange = (chainMidi < MC_MIDI_MIN || chainMidi > MC_MIDI_MAX);
        return result;
    }

    // 判断某个 MIDI track 是否在用户选中的应用范围内
    function isTrackSelectedForSubstitute(trackIndex) {
        if (!_substituteSelectedTracks) return true; // null = 全部应用
        return !!_substituteSelectedTracks[trackIndex];
    }

    // ============ 音域处理模式: 计算最优偏移量 ============
    // 模式 2: 整体八度偏移法 (步长 12, 仅取 12 倍数)
    // 模式 3: 整体音调偏移法 (步长 1, 任意半音)
    // 目标音域: Minecraft 标准音域 processedMidi [54, 78] (nbsKey 33~57, F#3~F#5)
    // 返回 { offset: 最优偏移量(半音), outOfRangeCount: 超出音符数 }
    function calculateOptimalOffset(notes, channel, mode) {
        if (!notes || notes.length === 0) return { offset: 0, outOfRangeCount: 0 };

        // 收集该 channel 的所有音符的 MIDI 值 (偏移前)
        var midis = [];
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].channel === channel) {
                midis.push(notes[i].note); // 原始 MIDI 音高
            }
        }
        if (midis.length === 0) return { offset: 0, outOfRangeCount: 0 };

        var minN = Math.min.apply(null, midis);
        var maxN = Math.max.apply(null, midis);
        var span = maxN - minN;

        // 所有音符已在 Minecraft 标准音域内, 直接返回 0 偏移
        // 目标音域: [54, 78] (processedMidi), 对应 nbsKey [33, 57]
        if (minN >= MC_MIDI_MIN && maxN <= MC_MIDI_MAX) {
            return { offset: 0, outOfRangeCount: 0 };
        }

        var step = (mode === 2) ? 12 : 1;

        // ---- 分支 1: span <= 24 (Minecraft 音域跨度) ----
        // 理论可平移区间 [54 - minN, 78 - maxN], 在此区间内选取绝对值最小的 N
        if (span <= MC_MIDI_SPAN) {
            var rangeMin = MC_MIDI_MIN - minN; // 使最低音刚好进入音域下限
            var rangeMax = MC_MIDI_MAX - maxN; // 使最高音刚好进入音域上限
            // 若 N=0 在区间内, 直接返回 (保留原调)
            if (rangeMin <= 0 && rangeMax >= 0) {
                return { offset: 0, outOfRangeCount: 0 };
            }
            // 选取区间内绝对值最小的 N (对齐到 step)
            var bestN = null;
            if (rangeMin > 0) {
                // 区间整体 > 0, 取最小值 (向上对齐到 step)
                bestN = Math.ceil(rangeMin / step) * step;
                if (bestN > rangeMax) bestN = null; // 对齐后超出区间
            } else if (rangeMax < 0) {
                // 区间整体 < 0, 取最大值 (向下对齐到 step)
                bestN = Math.floor(rangeMax / step) * step;
                if (bestN < rangeMin) bestN = null;
            }
            if (bestN !== null) {
                // 验证并计算超出音符数
                var oor = 0;
                for (var k = 0; k < midis.length; k++) {
                    var s = midis[k] + bestN;
                    if (s < MC_MIDI_MIN || s > MC_MIDI_MAX) oor++;
                }
                return { offset: bestN, outOfRangeCount: oor };
            }
            // 对齐后无解 (例如八度模式下区间内无 12 倍数), 落入搜索分支
        }

        // ---- 分支 2: span > 24 或分支 1 无解 ----
        // 暴力搜索: 八度模式 N ∈ [-72, 72] 步长 12; 音调模式 N ∈ [-36, 36] 步长 1
        var searchMin, searchMax;
        if (mode === 2) {
            searchMin = -72; searchMax = 72; step = 12; // -6~+6 八度
        } else {
            searchMin = -36; searchMax = 36; step = 1;  // -36~+36 半音
        }

        var bestOffset = 0;
        var bestOutOfRange = Infinity;
        var bestInRange = -1;

        for (var off = searchMin; off <= searchMax; off += step) {
            var outOfRange = 0;
            var inRange = 0;
            for (var k2 = 0; k2 < midis.length; k2++) {
                var shifted = midis[k2] + off;
                if (shifted < MC_MIDI_MIN || shifted > MC_MIDI_MAX) {
                    outOfRange++;
                } else {
                    inRange++;
                }
            }
            // 优先选超出最少的, 其次选在音域内最多的, 最后选绝对值最小的
            if (outOfRange < bestOutOfRange || (outOfRange === bestOutOfRange && inRange > bestInRange)) {
                bestOutOfRange = outOfRange;
                bestInRange = inRange;
                bestOffset = off;
            } else if (outOfRange === bestOutOfRange && inRange === bestInRange) {
                if (Math.abs(off) < Math.abs(bestOffset)) bestOffset = off;
            }
        }

        return { offset: bestOffset, outOfRangeCount: bestOutOfRange };
    }

    // 模式切换时, 为通道映射表自动计算并填充最优八度/音调偏移
    function updateChannelOctaveForMode(mode) {
        if (!state._midiInfo || !state._midiInfo.channels) return;

        // 智能音色替代 checkbox 可见性: 仅模式 2/3 可见可勾选
        // (模式 0 不处理; 模式 1 归一法无需替代)
        var smartSubLabel = $('midi-smart-substitute-label');
        var smartSubCheck = $('midi-smart-substitute');
        if (smartSubLabel) {
            var smartSubVisible = (mode === 2 || mode === 3);
            if (smartSubVisible) {
                smartSubLabel.style.display = '';
                if (smartSubCheck) smartSubCheck.disabled = false;
            } else {
                smartSubLabel.style.display = 'none';
                if (smartSubCheck) {
                    smartSubCheck.disabled = true;
                    // 模式 0/1 下不强制取消勾选, 保留用户选择以便切回模式 2/3 时恢复
                }
            }
        }

        // 全局强制归位 checkbox 可见性: 仅模式 2/3 可见可勾选
        // (模式 0 不处理; 模式 1 逐音符归一化已保证合法, 不需要兜底)
        var forceFoldLabel = $('midi-force-fold-label');
        var forceFoldCheck = $('midi-force-fold');
        if (forceFoldLabel) {
            var forceFoldVisible = (mode === 2 || mode === 3);
            if (forceFoldVisible) {
                forceFoldLabel.style.display = '';
                if (forceFoldCheck) forceFoldCheck.disabled = false;
            } else {
                forceFoldLabel.style.display = 'none';
                if (forceFoldCheck) {
                    forceFoldCheck.disabled = true;
                    forceFoldCheck.checked = false;
                }
            }
        }

        var rows = document.querySelectorAll('#midi-channel-rows tr');

        // 模式 0 (不启用): 始终清零, select 可编辑
        if (mode === 0) {
            for (var i = 0; i < rows.length; i++) {
                var octSel = rows[i].querySelector('.midi-octave-select');
                setMidiSelectValue(octSel, 0);
                var keySel = rows[i].querySelector('.midi-key-shift-select');
                setMidiSelectValue(keySel, 0);
                updateChannelRangeAfter(rows[i], mode);
            }
            return;
        }

        // 模式 1 (单独音符归一法): 逐音符 ±12 取模到 [42, 114], 不需要音轨级偏移, select 只读
        if (mode === 1) {
            for (var i2 = 0; i2 < rows.length; i2++) {
                var octSel2 = rows[i2].querySelector('.midi-octave-select');
                setMidiSelectValue(octSel2, 0);
                var keySel2 = rows[i2].querySelector('.midi-key-shift-select');
                setMidiSelectValue(keySel2, 0);
                updateChannelRangeAfter(rows[i2], mode);
            }
            return;
        }

        // 模式 2 (整体八度偏移法) / 模式 3 (整体音调偏移法): 自动计算最优偏移, select 只读
        // 新流程 (补充补丁): 先模拟音色替代, 再对残留超限的音轨计算偏移
        var smartSubEnabled = smartSubCheck && !smartSubCheck.disabled && smartSubCheck.checked;
        var substConfig = smartSubEnabled ? loadSubstituteConfig() : null;
        var midiEvents = state._midiInfo._rawEvents;
        // 收集音色拟合 (用户在 UI 中为通道设置的 slot1 主乐器, 优先作为替代链起点)
        var timbreFitting = collectTimbreFitting();
        // 拟合面板的 channels map (channel -> [slot1, slot2, slot3])
        var timbreFittingChannels = (timbreFitting && timbreFitting.channels) ? timbreFitting.channels : {};

        // 构建 trackIndex -> 是否在替代作用域内的映射
        var substTracksSet = null;
        if (_substituteSelectedTracks) {
            substTracksSet = _substituteSelectedTracks;
        }

        if (!midiEvents || midiEvents.length === 0) {
            // 回退到用 channel 的 min_note/max_note 估算
            for (var r = 0; r < rows.length; r++) {
                var ch2 = parseInt(rows[r].getAttribute('data-channel'));
                var chInfo2 = null;
                for (var ci2 = 0; ci2 < state._midiInfo.channels.length; ci2++) {
                    if (state._midiInfo.channels[ci2].channel === ch2) { chInfo2 = state._midiInfo.channels[ci2]; break; }
                }
                if (!chInfo2 || chInfo2.min_note == null) {
                    updateChannelRangeAfter(rows[r], mode);
                    continue;
                }
                var fakeNotes = [];
                for (var fn = chInfo2.min_note; fn <= chInfo2.max_note; fn += Math.max(1, Math.floor((chInfo2.max_note - chInfo2.min_note) / 20))) {
                    fakeNotes.push({ channel: ch2, note: fn });
                }
                fakeNotes.push({ channel: ch2, note: chInfo2.min_note });
                fakeNotes.push({ channel: ch2, note: chInfo2.max_note });
                var result = calculateOptimalOffsetWithSubstitute(fakeNotes, ch2, mode, substConfig, substTracksSet, timbreFittingChannels);
                applyOffsetToChannelRow(rows[r], result.offset, mode);
            }
            return;
        }

        // 有原始 events, 按通道计算
        for (var r3 = 0; r3 < rows.length; r3++) {
            var ch3 = parseInt(rows[r3].getAttribute('data-channel'));
            var result3 = calculateOptimalOffsetWithSubstitute(midiEvents, ch3, mode, substConfig, substTracksSet, timbreFittingChannels);
            applyOffsetToChannelRow(rows[r3], result3.offset, mode);
        }
    }

    // 计算最优偏移量 (考虑智能音色替代)
    // 新流程: 先对音符模拟替代, 再对残留超限的音轨计算偏移
    // 如果替代后所有音符都在音域内, 返回 offset=0 (跳过偏移)
    // timbreFittingChannels: 可选, {channel: [slot1, slot2, slot3]}, 用于优先确定替代链起点
    function calculateOptimalOffsetWithSubstitute(notes, channel, mode, substConfig, substTracksSet, timbreFittingChannels) {
        if (!notes || notes.length === 0) return { offset: 0, outOfRangeCount: 0 };

        // 收集该 channel 的所有音符 (原始 MIDI, 含 track 索引)
        var channelNotes = [];
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].channel === channel) {
                channelNotes.push(notes[i]);
            }
        }
        if (channelNotes.length === 0) return { offset: 0, outOfRangeCount: 0 };

        // 鼓组通道 (channel 9) 不参与替代和偏移
        if (channel === 9) return { offset: 0, outOfRangeCount: 0 };

        // 确定该通道的替代链起点乐器 (与 nbs_client.js 保持一致):
        // 优先级: timbre_fitting slot1 (>=0) > default_instrument (GM 表) > 0 (Harp)
        var defaultInst = 0; // Harp
        if (timbreFittingChannels && Object.prototype.hasOwnProperty.call(timbreFittingChannels, channel)) {
            var fitSlots = timbreFittingChannels[channel];
            if (fitSlots && fitSlots[0] >= 0) {
                defaultInst = fitSlots[0];
            }
        }
        if (defaultInst === 0 && state._midiInfo && state._midiInfo.channels) {
            for (var ci = 0; ci < state._midiInfo.channels.length; ci++) {
                if (state._midiInfo.channels[ci].channel === channel) {
                    defaultInst = state._midiInfo.channels[ci].default_instrument || 0;
                    break;
                }
            }
        }

        // 阶段1: 模拟音色替代 (如果启用)
        // 替代触发条件: processedMidi 超出 Minecraft 标准音域 [MC_MIDI_MIN, MC_MIDI_MAX]
        var substitutedMidis = [];
        for (var i2 = 0; i2 < channelNotes.length; i2++) {
            var n = channelNotes[i2];
            var m = n.note;
            if (m >= MC_MIDI_MIN && m <= MC_MIDI_MAX) {
                substitutedMidis.push(m);
                continue;
            }
            if (substConfig) {
                var trackIdx = n.track || 0;
                var trackInScope = true;
                if (substTracksSet) trackInScope = !!substTracksSet[trackIdx];
                if (trackInScope) {
                    // 模拟链条式替代
                    var chainInst = defaultInst;
                    var chainMidi = m;
                    for (var step = 0; step < 4; step++) {
                        var substCfg = substConfig[chainInst];
                        if (!substCfg) break;
                        var targetInst = -1;
                        if (chainMidi > MC_MIDI_MAX && substCfg.high >= 0) {
                            targetInst = substCfg.high;
                        } else if (chainMidi < MC_MIDI_MIN && substCfg.low >= 0) {
                            targetInst = substCfg.low;
                        } else {
                            break;
                        }
                        var chainOrigOffset = INSTRUMENT_OFFSET[chainInst] || 0;
                        var chainTargetOffset = INSTRUMENT_OFFSET[targetInst] || 0;
                        var newMidi = chainMidi - (chainTargetOffset - chainOrigOffset);
                        if (newMidi >= MC_MIDI_MIN && newMidi <= MC_MIDI_MAX) {
                            m = newMidi; // 替代成功, 更新 MIDI
                            break;
                        }
                        chainInst = targetInst;
                        chainMidi = newMidi;
                    }
                }
            }
            substitutedMidis.push(m);
        }

        // 阶段2: 统计残留超限 (基于 Minecraft 标准音域)
        var minSubst = Math.min.apply(null, substitutedMidis);
        var maxSubst = Math.max.apply(null, substitutedMidis);

        // 如果替代后所有音符都在 Minecraft 标准音域内, 跳过偏移
        if (minSubst >= MC_MIDI_MIN && maxSubst <= MC_MIDI_MAX) {
            return { offset: 0, outOfRangeCount: 0 };
        }

        // 阶段3: 对残留超限的音轨计算最优偏移 (基于替代后的 MIDI)
        var fakeNotes = [];
        for (var fn2 = 0; fn2 < substitutedMidis.length; fn2++) {
            fakeNotes.push({ channel: channel, note: substitutedMidis[fn2] });
        }
        return calculateOptimalOffset(fakeNotes, channel, mode);
    }

    // 更新音域处理模式提示的可见性。导入前不再展示不可靠的超出数量估算。
    function updateOctaveModeHint(mode) {
        var hint = $('midi-octave-mode-hint');
        var text = $('midi-octave-mode-hint-text');
        if (!hint || !text) return;

        // 所有模式都显示提示
        hint.style.display = '';

        var baseMsg = 'MC 音域 F#3~F#5 (MIDI 54~78)';
        if (mode === 0) {
            text.textContent = baseMsg + ' · 不进行音域转换';
        } else if (mode === 1) {
            text.textContent = baseMsg + ' · 超出音域的音符会按八度归一';
        } else {
            var forceFoldCheck = $('midi-force-fold');
            var forceFold = forceFoldCheck && !forceFoldCheck.disabled && forceFoldCheck.checked;
            if (forceFold) {
                text.textContent = baseMsg + ' · 自动偏移、音色替代并强制归位';
            } else {
                text.textContent = baseMsg + ' · 自动偏移并按需使用音色替代';
            }
        }
    }

    // 计算当前设置下预计超出音域的音符数
    // mode 0: 原始超出数; mode 1: 0; mode 2/3: 替代+偏移后超出数 (不考虑 forceFold)
    function calculateExpectedOutOfRange(mode) {
        if (!state._midiInfo) return 0;
        var midiEvents = state._midiInfo._rawEvents;
        if (!midiEvents || midiEvents.length === 0) return 0;

        if (mode === 1) return 0; // 归一化保证合法

        var smartSubCheck = $('midi-smart-substitute');
        var smartSubEnabled = smartSubCheck && !smartSubCheck.disabled && smartSubCheck.checked;
        var substConfig = (smartSubEnabled && (mode === 2 || mode === 3)) ? loadSubstituteConfig() : null;
        var timbreFitting = collectTimbreFitting();
        var timbreFittingChannels = (timbreFitting && timbreFitting.channels) ? timbreFitting.channels : {};
        var substTracksSet = _substituteSelectedTracks || null;

        if (mode === 0) {
            // 模式 0: 统计原始 MIDI 超出 [MC_MIDI_MIN, MC_MIDI_MAX] 的音符数
            var count0 = 0;
            for (var i = 0; i < midiEvents.length; i++) {
                var ev0 = midiEvents[i];
                if (ev0.type !== 'noteOn') continue;
                if (ev0.channel === 9) continue; // 鼓组不参与
                if (ev0.note < MC_MIDI_MIN || ev0.note > MC_MIDI_MAX) count0++;
            }
            return count0;
        }

        // 模式 2/3: 累加每通道的 outOfRangeCount
        var totalCount = 0;
        var processedChannels = {};
        for (var j = 0; j < midiEvents.length; j++) {
            var ev = midiEvents[j];
            if (ev.type !== 'noteOn') continue;
            if (ev.channel === 9) continue;
            if (processedChannels[ev.channel]) continue;
            processedChannels[ev.channel] = true;
            var result = calculateOptimalOffsetWithSubstitute(
                midiEvents, ev.channel, mode, substConfig, substTracksSet, timbreFittingChannels
            );
            totalCount += result.outOfRangeCount || 0;
        }
        return totalCount;
    }

    // 通用辅助: 确保 select 中存在目标值的选项, 且选项 enabled, 然后设置 value
    // 关键修复: buildOctaveSelect 会给"无效"八度加 disabled 属性,
    // 浏览器会拒绝把 select.value 设到 disabled option, 导致设置静默失败 (间歇性BUG根因)
    function setMidiSelectValue(sel, val) {
        if (!sel) return;
        var targetOpt = null;
        for (var i = 0; i < sel.options.length; i++) {
            if (parseInt(sel.options[i].value) === val) { targetOpt = sel.options[i]; break; }
        }
        if (!targetOpt) {
            targetOpt = document.createElement('option');
            targetOpt.value = val;
            targetOpt.textContent = (val >= 0 ? '+' : '') + val;
            sel.appendChild(targetOpt);
        }
        // 移除 disabled 属性, 否则设置 value 会被浏览器拒绝
        targetOpt.disabled = false;
        sel.disabled = false;
        sel.value = val;
        // 如果 value 仍未设置成功 (极端情况), 强制设置 selected 属性
        if (parseInt(sel.value) !== val) {
            targetOpt.selected = true;
        }
        // 通知 custom_dropdown 刷新显示
        try {
            if (sel._cdd && sel._cdd.refresh) sel._cdd.refresh();
            else if (window.CustomDropdown && window.CustomDropdown.refresh) window.CustomDropdown.refresh(sel);
        } catch(e) {}
    }

    // 将计算出的偏移量应用到通道映射表行
    function applyOffsetToChannelRow(row, offset, mode) {
        if (mode === 2) {
            // 八度偏移: 写入八度列, 音调列清零
            var octaves = Math.round(offset / 12);
            var octSel = row.querySelector('.midi-octave-select');
            setMidiSelectValue(octSel, octaves);
            var keySel = row.querySelector('.midi-key-shift-select');
            setMidiSelectValue(keySel, 0);
        } else if (mode === 3) {
            // 半音偏移: 拆分为八度 + 音调
            var oct = Math.floor(offset / 12);
            var keyShift = offset - oct * 12;
            var octSel2 = row.querySelector('.midi-octave-select');
            setMidiSelectValue(octSel2, oct);
            var keySel2 = row.querySelector('.midi-key-shift-select');
            setMidiSelectValue(keySel2, keyShift);
        }
        updateChannelRangeAfter(row, mode);
    }

    // 根据当前模式更新单行的偏移后音域显示和 select 的 disabled 状态
    function updateChannelRangeAfter(row, mode) {
        var octSel = row.querySelector('.midi-octave-select');
        var keySel = row.querySelector('.midi-key-shift-select');
        var afterCell = row.querySelector('.midi-range-after');
        if (!afterCell) return;

        // select 的 disabled 状态: mode 0 可编辑, mode 1/2/3 只读
        var readOnly = (mode !== 0);
        if (octSel) octSel.disabled = readOnly;
        if (keySel) keySel.disabled = readOnly;
        // 视觉反馈: disabled 时灰显 (因为 HTML 内联样式覆盖了 CSS 的 select:disabled)
        var dimStyle = readOnly ? '0.55' : '1';
        var dimColor = readOnly ? 'var(--text-disabled)' : 'var(--text-primary)';
        var dimBg = readOnly ? 'var(--ctrl-fill-disabled)' : 'var(--ctrl-fill-default)';
        if (octSel) { octSel.style.opacity = dimStyle; octSel.style.color = dimColor; octSel.style.backgroundColor = dimBg; }
        if (keySel) { keySel.style.opacity = dimStyle; keySel.style.color = dimColor; keySel.style.backgroundColor = dimBg; }
        // 通知 custom_dropdown 刷新禁用状态
        try {
            if (window.CustomDropdown) {
                if (octSel) window.CustomDropdown.refresh && window.CustomDropdown.refresh(octSel);
                if (keySel) window.CustomDropdown.refresh && window.CustomDropdown.refresh(keySel);
            }
        } catch(e) {}

        // 计算偏移后音域
        var ch = parseInt(row.getAttribute('data-channel'));
        var chInfo = null;
        if (state._midiInfo && state._midiInfo.channels) {
            for (var ci = 0; ci < state._midiInfo.channels.length; ci++) {
                if (state._midiInfo.channels[ci].channel === ch) { chInfo = state._midiInfo.channels[ci]; break; }
            }
        }
        if (!chInfo) return;
        var octave = octSel ? (parseInt(octSel.value) || 0) : 0;
        var keyShift = keySel ? (parseInt(keySel.value) || 0) : 0;
        afterCell.innerHTML = getChannelRangeAfterText(chInfo, octave, keyShift, mode);

        // 标记超出 MC 标准音域的偏移后音域为红色
        var minNote = chInfo.min_note;
        var maxNote = chInfo.max_note;
        if (minNote != null && maxNote != null && mode !== 1) {
            var afterMin = minNote + octave * 12 + keyShift;
            var afterMax = maxNote + octave * 12 + keyShift;
            if (afterMin < MC_MIDI_MIN || afterMax > MC_MIDI_MAX) {
                afterCell.style.color = 'var(--accent-orange,#ff8c42)';
            } else {
                afterCell.style.color = 'var(--text-secondary)';
            }
        } else {
            afterCell.style.color = 'var(--text-secondary)';
        }
    }

    function showMidiPopup() {
        var p = $('midi-popup');
        if (!p) return;
        // 打开 MIDI 导入弹窗时暂停 NBS 播放
        if (state.isPlaying) {
            handlePlayToggle();
        }
        p.classList.add('active');
        p.style.display = 'flex';
        // 默认显示乐器标签页
        switchMidiTab('midi-basic');
        // 重置已解析事件，populateMidiDialog 会在行构建后重新解析
        state._midiParsedEvents = null;
    }

    function closeMidiPopup() {
        stopMidiTrackPlayback();
        stopSustainTrackPreview();
        stopMidiPreview();
        var p = $('midi-popup');
        if (p) { p.classList.remove('active'); p.style.display = ''; }
        $('file-input').value = '';
        state._midiFile = null;
        state._midiInfo = null;
        state._midiTrackInfo = null;
        _midiTrackStates = {};
        _substituteSelectedTracks = null; // 重置音色替代 track 选择
    }

    function switchMidiTab(tabName) {
        // 更新标签按钮
        var tabs = document.querySelectorAll('.midi-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].getAttribute('data-tab') === tabName);
        }
        // 更新面板
        var panels = document.querySelectorAll('.midi-tab-panel');
        var activePanel = null;
        for (var j = 0; j < panels.length; j++) {
            var isActive = panels[j].id === 'midi-tab-' + tabName.replace('midi-', '');
            panels[j].classList.toggle('active', isActive);
            if (isActive) activePanel = panels[j];
        }
        // 若该主标签页下没有子标签页被激活，默认显示第一个，避免内容空白
        if (activePanel) {
            var activeSub = activePanel.querySelector('.midi-sub-tab.active');
            if (!activeSub) {
                var firstSub = activePanel.querySelector('.midi-sub-tab');
                if (firstSub) switchMidiSubTab(firstSub.getAttribute('data-subtab'));
            }
        }
    }

    function switchMidiSubTab(subtabName) {
        var subtabs = document.querySelectorAll('.midi-sub-tab');
        for (var i = 0; i < subtabs.length; i++) {
            subtabs[i].classList.toggle('active', subtabs[i].getAttribute('data-subtab') === subtabName);
        }
        var panels = document.querySelectorAll('.midi-sub-panel');
        for (var j = 0; j < panels.length; j++) {
            panels[j].classList.toggle('active', panels[j].id === 'midi-sub-' + subtabName);
        }
    }

    function buildInstrumentSelect(currentValue, channel, useAuto) {
        var html = '<select class="midi-instrument-select" data-channel="' + channel + '"' + (useAuto ? ' data-auto="1"' : '') + '>';
        if (useAuto) {
            html += '<option value="auto"' + (currentValue === 'auto' ? ' selected' : '') + '>自动(用拟合音色)</option>';
        }
        html += '<option value="-1"' + (currentValue === -1 ? ' selected' : '') + '>忽略</option>';
        for (var i = 0; i < INSTRUMENT_NAMES.length; i++) {
            var sel = (currentValue === i) ? ' selected' : '';
            html += '<option value="' + i + '"' + sel + '>' + INSTRUMENT_NAMES[i] + '</option>';
        }
        html += '</select>';
        return html;
    }

    // 绑定 MIDI 导入通道乐器选择事件：当用户从"自动(用拟合音色)"切换为具体乐器时提示
    // _midiManualOverrideChannels 记录"本次导入中已提示过的通道", 仅在 populateMidiDialog 时重置
    function bindMidiInstrumentChangeEvents() {
        var selects = document.querySelectorAll('.midi-instrument-select[data-auto="1"]');
        for (var i = 0; i < selects.length; i++) {
            (function(sel) {
                // 移除旧事件避免重复绑定
                sel.onchange = null;
                sel.addEventListener('change', function() {
                    var channel = sel.getAttribute('data-channel');
                    var val = sel.value;
                    // 只有切到具体乐器时才提示; 切回"自动"不做任何提示, 也不清除已提示标记
                    if (val === 'auto') return;
                    // 如果此前没有手动覆盖过, 弹窗提示
                    if (!state._midiManualOverrideChannels[channel]) {
                        showMidiOverrideWarning(sel, channel);
                    }
                    state._midiManualOverrideChannels[channel] = true;
                });
            })(selects[i]);
        }
    }

    function showMidiOverrideWarning(sel, channel) {
        var existing = $('midi-override-warning-popup');
        if (existing) existing.remove();

        var html = '<div class="popup active" id="midi-override-warning-popup">'
            + '<div class="popup-content" style="max-width:380px;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-triangle-exclamation" style="color:#ff9500;"></i>'
            + '<h4>音色覆盖提示</h4>'
            + '<button class="settings-close-btn" id="midi-override-close-x">&times;</button>'
            + '</div>'
            + '<div class="settings-body">'
            + '<p style="margin:0;font-size:13px;color:var(--text-primary);line-height:1.6;">'
            + '通道 <b>' + channel + '</b> 当前使用拟合音色。你手动选择了具体乐器后，'
            + '<b>该通道将不再跟随拟合结果改变</b>，即后续在"音色拟合"标签页中调整的组合音色不会应用到这个通道。'
            + '</p>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="midi-override-cancel">恢复自动</button>'
            + '<button class="popup-btn popup-btn-primary" id="midi-override-confirm">知道了</button>'
            + '</div>'
            + '</div></div>';

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            var p = $('midi-override-warning-popup');
            if (p) p.remove();
        }

        wrapper.querySelector('#midi-override-close-x').addEventListener('click', close);
        wrapper.querySelector('#midi-override-confirm').addEventListener('click', close);
        wrapper.querySelector('#midi-override-cancel').addEventListener('click', function() {
            sel.value = 'auto';
            close();
        });
        wrapper.addEventListener('click', function(e) {
            if (e.target === wrapper.firstElementChild || e.target === wrapper) close();
        });
    }

    function buildOctaveSelect(currentValue, channel, minNote, maxNote) {
        var valid = getValidOctaveRange(minNote, maxNote);
        var html = '<select class="midi-octave-select" data-channel="' + channel + '" data-min-note="' + (minNote || 0) + '" data-max-note="' + (maxNote || 0) + '">';
        for (var o = -3; o <= 3; o++) {
            var disabled = valid.indexOf(o) < 0 ? ' disabled' : '';
            var sel = (currentValue === o) ? ' selected' : '';
            var label = o >= 0 ? '+' + o : '' + o;
            html += '<option value="' + o + '"' + sel + disabled + '>' + label + '</option>';
        }
        html += '</select>';
        return html;
    }

    function buildKeyShiftSelect(currentValue, channel, minNote, maxNote, octave) {
        var range = getValidKeyRange(minNote, maxNote, octave);
        var html = '<select class="midi-key-shift-select" data-channel="' + channel + '">';
        for (var k = -12; k <= 12; k++) {
            var disabled = (k < range.min || k > range.max) ? ' disabled' : '';
            var sel = (currentValue === k) ? ' selected' : '';
            var label = k >= 0 ? '+' + k : '' + k;
            html += '<option value="' + k + '"' + sel + disabled + '>' + label + '</option>';
        }
        html += '</select>';
        return html;
    }

    // 计算通道在 NBS 音域(0~87)内的有效八度偏移范围
    function getValidOctaveRange(minNote, maxNote) {
        var targetMin = 0;
        var targetMax = 87;
        var min0 = (minNote || 0) - 21;
        var max0 = (maxNote || 0) - 21;
        var valid = [];
        for (var o = -10; o <= 10; o++) {
            if (min0 + 12 * o >= targetMin && max0 + 12 * o <= targetMax) {
                valid.push(o);
            }
        }
        if (valid.length === 0) {
            // 如果 NBS 全音域都无法满足, 返回所有八度作为可选
            for (var o2 = -10; o2 <= 10; o2++) valid.push(o2);
        }
        return valid;
    }

    // 计算指定八度下的有效 Key 微调范围
    function getValidKeyRange(minNote, maxNote, octave) {
        var min0 = (minNote || 0) - 21;
        var max0 = (maxNote || 0) - 21;
        var minKey = min0 + 12 * (octave || 0);
        var maxKey = max0 + 12 * (octave || 0);
        var minK = -minKey;
        var maxK = 87 - maxKey;
        return { min: Math.max(-12, minK), max: Math.min(12, maxK) };
    }

    // 根据用户偏好选择默认八度偏移
    function getDefaultOctave(minNote, maxNote, preferredOctave) {
        var valid = getValidOctaveRange(minNote, maxNote);
        if (valid.length === 0) return 0;
        if (valid.indexOf(preferredOctave) >= 0) return preferredOctave;
        // 优先选 0，否则选绝对值最小的
        if (valid.indexOf(0) >= 0) return 0;
        return valid.reduce(function(prev, curr) {
            return Math.abs(curr) < Math.abs(prev) ? curr : prev;
        });
    }

    // 显示 MIDI 弹窗内的非阻塞提示（替代 alert）
    function showMidiNotice(message, type) {
        type = type || 'info';
        var existing = document.getElementById('midi-notice');
        if (existing) existing.remove();
        var notice = document.createElement('div');
        notice.id = 'midi-notice';
        notice.className = 'midi-notice midi-notice-' + type;
        notice.textContent = message;
        var dialog = document.querySelector('.midi-import-dialog');
        if (dialog) dialog.appendChild(notice);
        setTimeout(function() {
            if (notice.parentNode) notice.parentNode.removeChild(notice);
        }, 3000);
    }

    // 完整的 MIDI note 名称 (0~127, C-1 ~ G9, C4=中央C=60)
    function midiNoteToName(note) {
        if (note === undefined || note === null || note < 0 || note > 127) return '-';
        var names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        var octave = Math.floor(note / 12) - 1;
        return names[note % 12] + octave;
    }

    // 根据通道的 min_note/max_note 生成八度范围显示文本
    // 格式: "范围: C3 ~ C6 (3 个八度)"
    function getChannelNoteRangeText(ch) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return '范围: -';
        }
        var minName = midiNoteToName(minNote);
        var maxName = midiNoteToName(maxNote);
        var octaves = Math.max(0, Math.floor(maxNote / 12) - Math.floor(minNote / 12));
        return '范围: ' + minName + ' ~ ' + maxName + ' (' + octaves + ' 个八度)';
    }

    // 短格式音域文本: "F#2 ~ F#4 (2 个八度)" - 用于通道映射表
    function getChannelRangeShort(ch) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return '-';
        }
        var minName = midiNoteToName(minNote);
        var maxName = midiNoteToName(maxNote);
        var octaves = Math.max(0, Math.round((maxNote - minNote) / 12));
        return minName + ' ~ ' + maxName + '<br><span style="font-size:10px;color:var(--text-tertiary);">' + octaves + ' 八度</span>';
    }

    // 计算偏移后音域文本 (基于 octave + keyShift)
    // mode 0: 偏移前=偏移后; mode 1: 归一化结果; mode 2/3: 偏移前+偏移量
    function getChannelRangeAfterText(ch, octave, keyShift, mode) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return '-';
        }
        if (mode === 1) {
            // 单独音符归一法: 每个音符 ±12 取模到 [MC_MIDI_MIN, MC_MIDI_MAX]
            return midiNoteToName(MC_MIDI_MIN) + ' ~ ' + midiNoteToName(MC_MIDI_MAX) + '<br><span style="font-size:10px;color:var(--text-tertiary);">归一化</span>';
        }
        var offset = (octave || 0) * 12 + (keyShift || 0);
        if (offset === 0) {
            // 无偏移: 直接返回偏移前音域
            var minName0 = midiNoteToName(minNote);
            var maxName0 = midiNoteToName(maxNote);
            return minName0 + ' ~ ' + maxName0 + '<br><span style="font-size:10px;color:var(--text-tertiary);">无偏移</span>';
        }
        var afterMin = minNote + offset;
        var afterMax = maxNote + offset;
        var minName = midiNoteToName(afterMin);
        var maxName = midiNoteToName(afterMax);
        var sign = offset >= 0 ? '+' : '';
        return minName + ' ~ ' + maxName + '<br><span style="font-size:10px;color:var(--text-tertiary);">总偏移 ' + sign + offset + '</span>';
    }

    // 从拟合表读取每通道实际乐器名, 填入通道映射表 NBS 乐器列
    function fillChannelInstrumentNames() {
        var fitting = collectTimbreFitting();
        var channels = fitting && fitting.channels ? fitting.channels : {};
        var rows = document.querySelectorAll('#midi-channel-rows tr[data-channel]');
        for (var i = 0; i < rows.length; i++) {
            var ch = parseInt(rows[i].getAttribute('data-channel'));
            var cell = rows[i].querySelector('.midi-channel-inst');
            if (!cell) continue;
            var slots = channels[ch];
            var instId = (slots && slots[0] >= 0) ? slots[0] : -1;
            if (instId < 0) {
                // 回退到 default_instrument (info.channels 中)
                var defInst = 0;
                if (state._midiInfo && state._midiInfo.channels) {
                    for (var ci = 0; ci < state._midiInfo.channels.length; ci++) {
                        if (state._midiInfo.channels[ci].channel === ch) {
                            defInst = state._midiInfo.channels[ci].default_instrument || 0;
                            break;
                        }
                    }
                }
                instId = defInst;
            }
            cell.textContent = INSTRUMENT_NAMES[instId] || ('乐器 ' + instId);
            // 标记超出 MC 标准音域的乐器
            var instOffset = INSTRUMENT_OFFSET[instId] || 0;
            if (instOffset !== 0) {
                cell.style.color = 'var(--text-primary)';
            } else {
                cell.style.color = 'var(--text-secondary)';
            }
        }
    }

    // 计算通道试听音符: 取平均音高，四舍五入到最近八度，返回该八度的 C-D-E-F (MIDI note)
    function getChannelPreviewNotes(ch) {
        var minNote = ch.min_note;
        var maxNote = ch.max_note;
        if (minNote === undefined || maxNote === undefined || minNote === null || maxNote === null) {
            return [60, 62, 64, 65]; // 默认 C4-D4-E4-F4
        }
        var avg = Math.round((minNote + maxNote) / 2);
        // 四舍五入到最近八度的 C (12 的倍数，C-1=0)
        var baseOctave = Math.round(avg / 12);
        var base = baseOctave * 12;
        return [base, base + 2, base + 4, base + 5];
    }

    function buildPitchSelect(currentValue, note) {
        var html = '<select class="midi-pitch-select" data-note="' + note + '">';
        for (var i = 0; i < 88; i++) {
            var sel = (currentValue === i) ? ' selected' : '';
            html += '<option value="' + i + '"' + sel + '>' + NOTE_NAMES[i] + ' (' + i + ')</option>';
        }
        html += '</select>';
        return html;
    }

    function handleMidiOpen(e) {
        var file = e.target.files[0];
        if (!file) return;
        state._midiFile = file;

        // 显示弹窗
        showMidiPopup();

        // 显示文件名
        $setText('midi-file-name', file.name);
        $setText('midi-type', '...');
        $setText('midi-duration', '...');
        $setText('midi-tracks', '...');
        $setText('midi-notes', '...');

        // 请求 MIDI 信息
        showUploadProgress(file.name);
        API.getMidiInfo(file, function(loaded, total, speed, percent, eta) {
            updateUploadProgress(loaded, total, speed, percent, eta);
        }).then(function(data) {
            hideUploadProgress();
            if (data.success && data.info) {
                state._midiInfo = data.info;
                populateMidiDialog(data.info);
            }
        }).catch(function(err) {
            hideUploadProgress();
            var msg = formatError(err, '无法读取 MIDI 信息');
            $setText('midi-type', '错误: ' + msg);
            showAppAlert('读取 MIDI 信息失败: ' + msg, {title: 'MIDI 信息', icon: 'fa-solid fa-file-audio'});
        });
    }

    function populateMidiDialog(info) {
        // 更新文件信息
        $setText('midi-type', info.type);
        $setText('midi-duration', info.duration);
        $setText('midi-tracks', info.track_count + ' 轨道');
        $setText('midi-notes', info.total_notes + ' 音符');

        // 构建通道表格（音轨设置）
        var channelRows = $('midi-channel-rows');
        if (channelRows) {
            channelRows.innerHTML = '';
            var channels = info.channels || [];
            // 保存通道信息供试听使用
            state._midiChannelInfo = channels;
            for (var i = 0; i < channels.length; i++) {
                var ch = channels[i];
                if (ch.is_percussion) continue; // 打击乐在拟合表中设置
                if ((ch.note_count || 0) === 0) continue; // 只显示有音符的旋律通道
                var rangeBefore = getChannelRangeShort(ch);
                var defaultOctave = getDefaultOctave(ch.min_note, ch.max_note, ch.default_octave || 0);
                var row = document.createElement('tr');
                row.setAttribute('data-channel', ch.channel);
                row.setAttribute('data-program', ch.program || 0);
                row.innerHTML =
                    '<td>' + ch.channel + '</td>' +
                    '<td>' + (ch.program_name || 'Unknown') + '</td>' +
                    '<td class="midi-channel-inst" style="font-size:11px;color:var(--text-secondary);">-</td>' +
                    '<td class="midi-range-before" style="font-size:11px;color:var(--text-secondary);">' + rangeBefore + '</td>' +
                    '<td>' + buildOctaveSelect(defaultOctave, ch.channel, ch.min_note, ch.max_note) + '</td>' +
                    '<td>' + buildKeyShiftSelect(0, ch.channel, ch.min_note, ch.max_note, defaultOctave) + '</td>' +
                    '<td class="midi-range-after" style="font-size:11px;color:var(--text-secondary);">-</td>' +
                    '<td>' +
                    '  <button class="midi-preview-btn midi-preview-midi" data-channel="' + ch.channel + '" title="试听 MIDI 原音"><i class="fa-solid fa-music"></i></button>' +
                    '  <button class="midi-preview-btn midi-preview-nbs" data-channel="' + ch.channel + '" title="试听 NBS 拟合音色"><i class="fa-solid fa-layer-group"></i></button>' +
                    '</td>';
                channelRows.appendChild(row);
            }
            // 如果没有通道数据，显示提示
            if (channelRows.children.length === 0) {
                channelRows.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-dim);">未检测到旋律通道</td></tr>';
            } else {
                bindMidiPreviewButtons();
                bindMidiOctaveKeyChange();
                fillChannelInstrumentNames();
            }
        }

        // 构建打击乐表格
        var percussionRows = $('midi-percussion-rows');
        if (percussionRows) {
            percussionRows.innerHTML = '';
            var percussion = info.percussion || [];
            for (var j = 0; j < percussion.length; j++) {
                var p = percussion[j];
                var row = document.createElement('tr');
                var instHtml = buildInstrumentSelect(p.default_instrument, 'perc_' + p.note);
                // 用 data-note 区分打击乐
                instHtml = instHtml.replace('data-channel="perc_', 'data-perc="');
                instHtml = instHtml.replace('midi-instrument-select', 'midi-perc-instrument-select');
                var pitchHtml = buildPitchSelect(p.default_pitch, p.note);
                pitchHtml = pitchHtml.replace('midi-pitch-select', 'midi-perc-pitch-select');
                row.innerHTML =
                    '<td class="percussion-note">' + p.note + '</td>' +
                    '<td>' + p.name + '</td>' +
                    '<td>' + instHtml + '</td>' +
                    '<td>' + pitchHtml + '</td>';
                percussionRows.appendChild(row);
            }
            if (percussion.length === 0) {
                percussionRows.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);">未检测到打击乐音符</td></tr>';
            }
        }

        // 构建 MIDI 轨道表格
        buildMidiTrackRows(info);
        // 构建音色拟合行
        buildTimbreFittingRows(info);
        // 拟合表建立后, 刷新通道映射表的 NBS 乐器列 (使用拟合 slot1 实际值)
        fillChannelInstrumentNames();

        // 解析 MIDI 文件用于轨道可视化（每行迷你音符图）
        // 在 buildMidiTrackRows 之后调用，确保行已存在
        if (state._midiFile && !state._midiParsedEvents) {
            var _preader = new FileReader();
            _preader.onload = function(e) {
                state._midiParsedEvents = parseMidiFileForPlayback(e.target.result, info);
                initMidiTrackMiniRolls();
            };
            _preader.readAsArrayBuffer(state._midiFile);
        }

        // 新文件时重置延音轨道选择（从已保存的设置恢复，否则为空）
        _sustainTrackIndices = [];
        try {
            var saved = JSON.parse(localStorage.getItem('midi_import_settings'));
            if (saved && Array.isArray(saved.sustain_track_indices)) {
                _sustainTrackIndices = saved.sustain_track_indices.slice();
            }
        } catch(e) {}
        updateSustainTracksUI();
        updateSnapGridInfo();

        // 关键修复: 通道行构建完成后, 必须重新应用当前音域处理模式
        // 否则 updateChannelOctaveForMode 不会被执行, 通道行会停留在默认值,
        // 导致导入时八度偏移错误 (间歇性BUG的根因)
        var _curMode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
        updateChannelOctaveForMode(_curMode);
        // 刷新音域处理提示 (显示预计超出音符数)
        updateOctaveModeHint(_curMode);
    }

    // ========== 音轨设置试听 ==========

    var _midiPreviewTimeout = null;
    var _midiPreviewNotes = []; // 当前正在试听的音符 {source, timeout}

    // TinySynth 软合成器（Web MIDI 不可用时回退使用）
    // SF3 音色库就绪时, 优先使用 SF3Player 替代 TinySynth
    var _tinySynth = null;
    function getTinySynth() {
        // SF3 音色库就绪 → 优先使用
        if (window.SoundfontLoader && SoundfontLoader.isReady()) {
            return SoundfontLoader.getPlayer();
        }
        if (typeof WebAudioTinySynth === 'undefined') return null;
        if (!_tinySynth) {
            _tinySynth = new WebAudioTinySynth({ quality: 2, useReverb: 1, voices: 96 });
            // 尽量与项目 AudioEngine 共享 AudioContext，保证时间线一致
            var ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
            if (!ctx && window.AudioEngine && AudioEngine.init) {
                try { AudioEngine.init(); } catch(e) {}
                ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
            }
            if (ctx) {
                try { _tinySynth.setAudioContext(ctx); } catch(e) {}
            }
        }
        return _tinySynth;
    }
    function prepareTinySynthProgram(synth, channel, program) {
        var ch = (channel || 0) & 0x0F;
        var pgm = Math.max(0, Math.min(127, program || 0));
        try { synth.setQuality && synth.setQuality(2); } catch(e) {}
        try { synth.setReverb && synth.setReverb(0.22); } catch(e2) {}
        try { synth.send([0xB0 | ch, 0, 0]); } catch(e3) {}
        try { synth.send([0xB0 | ch, 32, 0]); } catch(e4) {}
        try { synth.setProgram(ch, pgm); } catch(e5) {
            try { synth.send([0xC0 | ch, pgm]); } catch(e6) {}
        }
        return ch;
    }
    function stopTinySynthAll() {
        var synth = getTinySynth();
        if (!synth) return;
        // SF3Player 有 noteOffAll 方法, TinySynth 逐通道 allSoundOff
        if (synth.noteOffAll) {
            try { synth.noteOffAll(); } catch(e) {}
        } else {
            for (var ch = 0; ch < 16; ch++) {
                try { synth.allSoundOff(ch); } catch(e) {}
            }
        }
    }

    // ========== MIDI 音源选择设置 ==========
    function getEffectiveMidiSource() {
        if (navigator.requestMIDIAccess) return 'webmidi';
        if (window.SoundfontLoader && SoundfontLoader.isReady()) return 'sf3';
        return 'tinysynth';
    }

    function stopMidiPreview() {
        if (_midiPreviewTimeout) {
            clearTimeout(_midiPreviewTimeout);
            _midiPreviewTimeout = null;
        }
        for (var i = 0; i < _midiPreviewNotes.length; i++) {
            var n = _midiPreviewNotes[i];
            if (n.timeout) clearTimeout(n.timeout);
            if (n.source) {
                try { n.source.stop(); } catch(e) {}
                try { n.source.disconnect(); } catch(e) {}
            }
            if (n.noteOff) n.noteOff();
            if (n.synth && n.synthNoteOff) n.synthNoteOff();
        }
        _midiPreviewNotes = [];
        stopTinySynthAll();
    }

    function getChannelSettings(channel) {
        var row = document.querySelector('#midi-channel-rows tr[data-channel="' + channel + '"]');
        if (!row) return { octave: 0, keyShift: 0 };
        var octSel = row.querySelector('.midi-octave-select');
        var keySel = row.querySelector('.midi-key-shift-select');
        return {
            octave: octSel ? parseInt(octSel.value) || 0 : 0,
            keyShift: keySel ? parseInt(keySel.value) || 0 : 0
        };
    }

    function getFittingSlotsForChannel(channel) {
        // 从音色拟合表中查找该通道的 slot 设置
        var row = document.querySelector('#midi-timbre-melody-rows tr[data-type="melody"][data-channel="' + channel + '"]');
        if (!row) return null;
        var slots = row.querySelectorAll('.timbre-slot');
        var result = [];
        for (var i = 0; i < slots.length; i++) {
            result.push(parseInt(slots[i].value));
        }
        return result;
    }

    function midiNoteToFreq(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
    }

    // GM program → 试听用 NBS 乐器（Web MIDI 不可用时作为 TinySynth 回退）
    function gmProgramToNbsInstrument(program) {
        // 与后端 GM_PROGRAM_TABLE 保持一致，仅列出常见映射
        var map = {
            0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0,
            8:7, 9:7, 10:7, 11:10, 12:10, 13:9, 14:7, 15:5,
            16:6, 17:10, 18:6, 19:6, 20:6, 21:6, 22:6, 23:6,
            24:5, 25:5, 26:0, 27:5, 28:1, 29:5, 30:5, 31:5,
            32:1, 33:1, 34:1, 35:1, 36:1, 37:1, 38:1, 39:1,
            40:6, 41:6, 42:6, 43:6, 44:1, 45:6, 46:6, 47:6,
            48:6, 49:6, 50:6, 51:6, 52:6, 53:6, 54:6, 55:6,
            56:6, 57:6, 58:12, 59:12, 60:12, 61:12, 62:6, 63:6,
            64:6, 65:6, 66:6, 67:6, 68:6, 69:6, 70:6, 71:6,
            72:6, 73:6, 74:6, 75:6, 76:6, 77:6, 78:6, 79:6,
            80:13, 81:13, 82:13, 83:13, 84:5, 85:15, 86:5, 87:5,
            88:8, 89:6, 90:8, 91:6, 92:8, 93:6, 94:6, 95:8,
            96:8, 97:6, 98:8, 99:6, 100:15, 101:6, 102:6, 103:5,
            104:14, 105:14, 106:14, 107:5, 108:10, 109:6, 110:6, 111:6,
            112:8, 113:11, 114:10, 115:9, 116:2, 117:3, 118:3, 119:8,
            120:5, 121:6, 122:8, 123:6, 124:7, 125:7, 126:7, 127:3
        };
        return map[program] !== undefined ? map[program] : 0;
    }

    function playMidiPreviewWithWebMidi(notes, channel, program, onUnavailable) {
        if (!navigator.requestMIDIAccess) {
            if (onUnavailable) onUnavailable();
            return false;
        }
        try {
            navigator.requestMIDIAccess().then(function(access) {
                var outputs = access.outputs;
                if (!outputs || outputs.size === 0) {
                    if (onUnavailable) onUnavailable();
                    return;
                }
                var output = outputs.values().next().value;
                var ch = (channel || 0) & 0x0F;
                // 发送 program change（使用原 MIDI 通道）
                try {
                    output.send([0xC0 | ch, program & 0x7F]);
                } catch(e) {}
                notes.forEach(function(note, index) {
                    var timeoutOn = setTimeout(function() {
                        try {
                            output.send([0x90 | ch, note & 0x7F, 100]);
                        } catch(e) {}
                    }, index * 200);
                    var timeoutOff = setTimeout(function() {
                        try {
                            output.send([0x80 | ch, note & 0x7F, 0]);
                        } catch(e) {}
                    }, index * 200 + 180);
                    _midiPreviewNotes.push({ timeout: timeoutOn });
                    _midiPreviewNotes.push({ timeout: timeoutOff });
                });
                var stopT = setTimeout(stopMidiPreview, notes.length * 200 + 300);
                _midiPreviewTimeout = stopT;
            }).catch(function(err) {
                console.warn('Web MIDI API 失败:', err);
                if (onUnavailable) onUnavailable();
            });
            return true;
        } catch(e) {
            if (onUnavailable) onUnavailable();
            return false;
        }
    }

    // Web MIDI 不可用时，使用 TinySynth 软合成器回退，严格遵循原 MIDI 乐器/音符
    function playMidiPreviewFallback(notes, channel, program) {
        // 真正需要播放 MIDI 音符时: 按设置触发音色库下载/询问
        ensureSoundfontOnDemand();
        var synth = getTinySynth();
        if (!synth) {
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。', 'error');
            return;
        }
        var ch = prepareTinySynthProgram(synth, channel, program);
        notes.forEach(function(note, index) {
            var tOn = setTimeout(function() {
                try { synth.noteOn(ch, note & 0x7F, 100); } catch(e) {}
            }, index * 200);
            var tOff = setTimeout(function() {
                try { synth.noteOff(ch, note & 0x7F); } catch(e) {}
            }, index * 200 + 180);
            _midiPreviewNotes.push({ timeout: tOn });
            _midiPreviewNotes.push({ timeout: tOff });
        });
        var stopT = setTimeout(stopMidiPreview, notes.length * 200 + 300);
        _midiPreviewTimeout = stopT;
    }

    function previewMidiChannel(channel) {
        stopMidiPreview();
        var info = state._midiInfo;
        if (!info) return;
        var chInfo = null;
        var channels = info.channels || [];
        for (var i = 0; i < channels.length; i++) {
            if (channels[i].channel === channel) {
                chInfo = channels[i];
                break;
            }
        }
        if (!chInfo) return;
        var notes = getChannelPreviewNotes(chInfo);
        var program = chInfo.program || 0;

        var started = playMidiPreviewWithWebMidi(notes, channel, program, function() {
            // Web MIDI 不可用或失败时静默回退到 TinySynth
            playMidiPreviewFallback(notes, channel, program);
        });
        if (!started) {
            playMidiPreviewFallback(notes, channel, program);
        }
    }

    function previewNbsChannel(channel) {
        stopMidiPreview();
        if (!window.AudioEngine || !AudioEngine.playNote) {
            showAppAlert('无法试听：NBS 音频引擎未就绪。', {title: '试听失败', icon: 'fa-solid fa-volume-xmark'});
            return;
        }
        var settings = getChannelSettings(channel);
        var slots = getFittingSlotsForChannel(channel);
        var info = state._midiInfo;
        var chInfo = null;
        if (info && info.channels) {
            for (var i = 0; i < info.channels.length; i++) {
                if (info.channels[i].channel === channel) {
                    chInfo = info.channels[i];
                    break;
                }
            }
        }
        var notes = chInfo ? getChannelPreviewNotes(chInfo) : [60, 62, 64, 65];

        // 过滤出有效的 slot
        var instruments = [];
        if (slots) {
            for (var s = 0; s < slots.length; s++) {
                if (slots[s] >= 0) instruments.push(slots[s]);
            }
        }
        if (instruments.length === 0) {
            // 没有拟合设置时使用 GM 默认映射
            instruments = [gmProgramToNbsInstrument(chInfo ? chInfo.program : 0)];
        }

        notes.forEach(function(midiNote, index) {
            var nbsKey = midiNote - 21 + 12 * settings.octave + settings.keyShift;
            if (nbsKey < 0 || nbsKey > 87) {
                // 单个音符越界跳过，不影响其他音符
                return;
            }
            var t = setTimeout(function() {
                for (var j = 0; j < instruments.length; j++) {
                    AudioEngine.playNote(instruments[j], nbsKey, 85);
                }
            }, index * 200);
            _midiPreviewNotes.push({ timeout: t });
        });
        var stopT = setTimeout(stopMidiPreview, notes.length * 200 + 300);
        _midiPreviewTimeout = stopT;
    }

    function bindMidiPreviewButtons() {
        var midiBtns = document.querySelectorAll('#midi-channel-rows .midi-preview-midi');
        for (var i = 0; i < midiBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var ch = parseInt(btn.getAttribute('data-channel'));
                    previewMidiChannel(ch);
                });
            })(midiBtns[i]);
        }
        var nbsBtns = document.querySelectorAll('#midi-channel-rows .midi-preview-nbs');
        for (var j = 0; j < nbsBtns.length; j++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var ch = parseInt(btn.getAttribute('data-channel'));
                    previewNbsChannel(ch);
                });
            })(nbsBtns[j]);
        }
    }

    // ========== MIDI 轨道播放控制 ==========

    var _midiTrackStates = {};  // { trackIndex: { muted, solo, excluded } }
    var _sustainTrackIndices = []; // 用户手动选择的需要应用延音的 MIDI 轨道索引
    var _midiTrackPlayback = {
        playing: false,
        startTime: 0,
        pauseTime: 0,
        duration: 0,
        rafId: null,
        scheduled: [],  // { timeout, source/noteOff }
        output: null,
        events: [],     // 解析后的 MIDI 事件列表 {track, tick, type, channel, note, velocity, duration}
        useWebMidi: false
    };

    function initMidiTrackStates(info) {
        _midiTrackStates = {};
        state._trackChannels = {};   // trackIndex → [channels]
        state._channelTracks = {};   // channel → [trackIndices]
        var tracks = info && info.tracks ? info.tracks : [];
        for (var i = 0; i < tracks.length; i++) {
            var tIdx = tracks[i].index;
            _midiTrackStates[tIdx] = { muted: false, solo: false, excluded: false };
            // 保存 track → channels 映射
            var chs = tracks[i].channels || [];
            state._trackChannels[tIdx] = chs;
            // 构建反向映射 channel → tracks
            for (var c = 0; c < chs.length; c++) {
                var ch = chs[c];
                if (!state._channelTracks[ch]) state._channelTracks[ch] = [];
                if (state._channelTracks[ch].indexOf(tIdx) === -1) {
                    state._channelTracks[ch].push(tIdx);
                }
            }
        }
    }

    // 检查某 channel 的所有相关 track 是否都被排除
    function isChannelExcluded(channel) {
        var trackIndices = state._channelTracks ? state._channelTracks[channel] : null;
        if (!trackIndices || trackIndices.length === 0) return false;
        for (var i = 0; i < trackIndices.length; i++) {
            var st = getMidiTrackState(trackIndices[i]);
            if (!st.excluded) return false;
        }
        return true;
    }

    // 检查某 channel 是否应该播放（用于 NBS 播放过滤）
    function isChannelAudible(channel) {
        var trackIndices = state._channelTracks ? state._channelTracks[channel] : null;
        if (!trackIndices || trackIndices.length === 0) return true; // 无映射信息时不阻止播放
        // 如果所有相关 track 都被排除或静音，则不播放
        var hasSolo = false;
        for (var i = 0; i < trackIndices.length; i++) {
            if (getMidiTrackState(trackIndices[i]).solo) { hasSolo = true; break; }
        }
        for (var j = 0; j < trackIndices.length; j++) {
            var st = getMidiTrackState(trackIndices[j]);
            if (st.excluded || st.muted) continue;
            if (hasSolo && !st.solo) continue;
            return true; // 至少有一个 track 可播放
        }
        return false;
    }

    function getMidiTrackState(index) {
        if (!_midiTrackStates[index]) {
            _midiTrackStates[index] = { muted: false, solo: false, excluded: false };
        }
        return _midiTrackStates[index];
    }

    function setMidiTrackState(index, key, value) {
        var st = getMidiTrackState(index);
        // 记录变更前各音轨是否可播放（用于判断哪些音轨需要立即停止发声）
        var wasPlayable = {};
        for (var idx in _midiTrackStates) {
            wasPlayable[idx] = midiTrackShouldPlay(parseInt(idx));
        }
        st[key] = value;
        // 排除生成自动静音并禁止静音/独奏
        if (key === 'excluded' && value) {
            st.muted = true;
            st.solo = false;
        }
        renderAllMidiTrackRows();
        updateMidiTrackPlayerButtons();
        // 排除/静音/独奏状态改变后，刷新拟合表的禁用状态
        updateTimbreFittingDisabled();
        // 播放中：立即停止变更后不再可播放的音轨正在响的音符
        if (_midiTrackPlayback.playing) {
            for (var idx2 in _midiTrackStates) {
                var ti = parseInt(idx2);
                var nowPlayable = midiTrackShouldPlay(ti);
                if (wasPlayable[idx2] && !nowPlayable) {
                    stopTrackActiveNotes(ti);
                }
            }
        }
    }

    // 获取当前播放时间（秒），用于判断哪些音符正在响
    function getCurrentPlaybackTime() {
        if (!_midiTrackPlayback.playing) return null;
        var ctx = null;
        if (_midiTrackPlayback.backend === 'tinysynth') {
            var synth = getTinySynth();
            ctx = synth && synth.getAudioContext ? synth.getAudioContext() : null;
        }
        if (!ctx) {
            ctx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        }
        var now = ctx ? ctx.currentTime : (performance.now() / 1000);
        return now - _midiTrackPlayback.startTime;
    }

    // 停止指定音轨当前正在响的音符（只发 noteOff，不影响其他音轨共享同一通道的音符）
    function stopTrackActiveNotes(trackIndex) {
        if (!_midiTrackPlayback.playing) return;
        var events = _midiTrackPlayback.events;
        if (!events || events.length === 0) return;
        var now = getCurrentPlaybackTime();
        if (now == null) return;

        // 配对 noteOn/noteOff，找出当前正在响的音符（noteOn.time <= now < noteOff.time）
        var pending = {}; // key: "ch-note" → noteOn event
        var activeNotes = []; // [{channel, note}]
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev.track !== trackIndex) continue;
            var key = ev.channel + '-' + ev.note;
            if (ev.type === 'noteOn') {
                pending[key] = ev;
            } else if (ev.type === 'noteOff') {
                var onEv = pending[key];
                if (onEv) {
                    if (onEv.time <= now && now < ev.time) {
                        activeNotes.push({ channel: ev.channel, note: ev.note });
                    }
                    delete pending[key];
                }
            }
        }
        // 未关闭的 noteOn（noteOn.time <= now，但无匹配 noteOff）
        for (var k in pending) {
            if (pending[k].time <= now) {
                activeNotes.push({ channel: pending[k].channel, note: pending[k].note });
            }
        }

        if (activeNotes.length === 0) return;
        var backend = _midiTrackPlayback.backend;
        for (var j = 0; j < activeNotes.length; j++) {
            var n = activeNotes[j];
            if (backend === 'webmidi' && _midiTrackPlayback.output) {
                try { _midiTrackPlayback.output.send([0x80 | (n.channel & 0x0F), n.note & 0x7F, 0]); } catch(e) {}
            } else if (backend === 'tinysynth') {
                var synth = getTinySynth();
                if (synth) {
                    try { synth.send([0x80 | (n.channel & 0x0F), n.note & 0x7F, 0]); } catch(e2) {}
                }
            }
        }
    }

    // 刷新拟合表中因音轨排除/静音而禁用的行
    function updateTimbreFittingDisabled() {
        var melodyTbody = $('midi-timbre-melody-rows');
        var percTbody = $('midi-timbre-percussion-rows');
        if (melodyTbody) {
            var rows = melodyTbody.querySelectorAll('tr.timbre-main-row');
            for (var i = 0; i < rows.length; i++) {
                var ch = parseInt(rows[i].getAttribute('data-channel'));
                var excluded = isChannelExcluded(ch);
                rows[i].classList.toggle('channel-excluded', excluded);
            }
        }
        // 打击乐 (channel 9)
        if (percTbody) {
            var prow = percTbody.querySelectorAll('tr.timbre-main-row');
            var percExcluded = isChannelExcluded(9);
            for (var j = 0; j < prow.length; j++) {
                prow[j].classList.toggle('channel-excluded', percExcluded);
            }
        }
    }

    // 延音轨道选择：更新“选择延音轨道”按钮和已选数量显示
    function updateSustainTracksUI() {
        var select = $('midi-keep-note-length');
        var btn = $('midi-sustain-tracks-btn');
        var count = $('midi-sustain-tracks-count');
        if (!select || !btn || !count) return;
        var isSustain = select.value === 'sustain';
        btn.style.display = isSustain ? 'inline-flex' : 'none';
        count.style.display = isSustain ? 'inline' : 'none';
        count.textContent = '已选择 ' + _sustainTrackIndices.length + ' 个轨道';
    }

    // 转义 HTML 文本，避免弹窗中轨道名称出现注入
    function escapeHtml(text) {
        if (text == null) return '';
        return String(text).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    // 打开延音轨道多选弹窗
    function showSustainTracksDialog() {
        var info = state._midiInfo;
        if (!info || !info.tracks || info.tracks.length === 0) return;
        var existing = $('sustain-tracks-popup');
        if (existing) existing.remove();

        var tracks = info.tracks;
        var listHtml = '';
        for (var i = 0; i < tracks.length; i++) {
            var t = tracks[i];
            var checked = _sustainTrackIndices.indexOf(t.index) !== -1 ? 'checked' : '';
            listHtml += '<div class="sustain-track-item" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--ctrl-stroke-default);">'
                + '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;width:180px;overflow:hidden;flex-shrink:0;">'
                + '<input type="checkbox" class="sustain-track-checkbox" value="' + t.index + '" ' + checked + '>'
                + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">#' + t.index + ' ' + escapeHtml(t.name) + '</span>'
                + '</label>'
                + '<span style="font-size:11px;color:var(--text-tertiary);flex-shrink:0;width:56px;text-align:right;">音符 ' + (t.note_count || 0) + '</span>'
                + '<button class="sustain-track-preview-btn" data-track="' + t.index + '" title="试听此轨道" style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);background:var(--ctrl-fill-default);color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;transition:all 0.15s;">'
                + '<i class="fa-solid fa-play"></i></button>'
                + '<div class="sustain-track-mini-roll" data-track="' + t.index + '" style="flex:1;min-width:120px;height:36px;background:var(--neutral-2);border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:pointer;">'
                + '<canvas style="display:block;width:100%;height:100%;"></canvas>'
                + '</div>'
                + '</div>';
        }

        var html = '<div class="popup active" id="sustain-tracks-popup">'
            + '<div class="popup-content" style="max-width:760px;max-height:85vh;display:flex;flex-direction:column;">'
            + '<div class="settings-header">'
            + '<i class="fa-solid fa-list-check"></i>'
            + '<h4>选择延音轨道</h4>'
            + '<button class="settings-close-btn" id="sustain-tracks-close-x" title="关闭">&times;</button>'
            + '</div>'
            + '<div class="settings-body" style="overflow-y:auto;">'
            + '<p style="margin:0 0 10px;font-size:12px;color:var(--text-secondary);">勾选需要应用延音的 MIDI 轨道（多选）。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。</p>'
            + '<div class="sustain-tracks-list">' + listHtml + '</div>'
            + '</div>'
            + '<div class="popup-actions">'
            + '<button class="popup-btn popup-btn-cancel" id="sustain-tracks-cancel-btn">取消</button>'
            + '<button class="popup-btn popup-btn-primary" id="sustain-tracks-ok-btn">确定</button>'
            + '</div>'
            + '</div></div>';
        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        document.body.appendChild(wrapper);

        function close() {
            stopSustainTrackPreview();
            var p = $('sustain-tracks-popup'); if (p) p.remove();
        }
        wrapper.querySelector('#sustain-tracks-close-x').addEventListener('click', close);
        wrapper.querySelector('#sustain-tracks-cancel-btn').addEventListener('click', close);
        wrapper.querySelector('#sustain-tracks-ok-btn').addEventListener('click', function() {
            var selected = [];
            var boxes = wrapper.querySelectorAll('.sustain-track-checkbox:checked');
            for (var j = 0; j < boxes.length; j++) selected.push(parseInt(boxes[j].value));
            _sustainTrackIndices = selected;
            updateSustainTracksUI();
            close();
        });
        wrapper.addEventListener('click', function(e) { if (e.target === wrapper) close(); });

        // 解析 MIDI 文件，为每行初始化迷你音符图
        if (state._midiFile) {
            var reader = new FileReader();
            reader.onload = function(e) {
                var allEvents = parseMidiFileForPlayback(e.target.result, state._midiInfo);
                var miniRolls = wrapper.querySelectorAll('.sustain-track-mini-roll');
                var fullDuration = (state._midiInfo && state._midiInfo.duration_seconds) || 0;
                if (!fullDuration) {
                    for (var d = 0; d < allEvents.length; d++) {
                        if (allEvents[d].time > fullDuration) fullDuration = allEvents[d].time;
                    }
                }
                for (var i = 0; i < miniRolls.length; i++) {
                    (function(container) {
                        var trackIdx = parseInt(container.getAttribute('data-track'));
                        var notes = extractTrackNotes(allEvents, trackIdx);
                        var canvas = container.querySelector('canvas');
                        var mr = new MiniMidiRoll(canvas, notes, { fullDuration: fullDuration });
                        container._miniRoll = mr;
                        // 点击跳转到该位置开始试听
                        container.addEventListener('click', function(ev) {
                            var rect = container.getBoundingClientRect();
                            var clickX = ev.clientX - rect.left;
                            var seekT = mr.pixelToTime(clickX);
                            var trackIdx2 = parseInt(container.getAttribute('data-track'));
                            var previewBtn = wrapper.querySelector('.sustain-track-preview-btn[data-track="' + trackIdx2 + '"]');
                            stopSustainTrackPreview();
                            if (previewBtn) {
                                previewBtn.classList.add('playing');
                                var pIcon = previewBtn.querySelector('i');
                                if (pIcon) pIcon.className = 'fa-solid fa-stop';
                            }
                            previewSustainTrack(trackIdx2, previewBtn, seekT);
                        });
                    })(miniRolls[i]);
                }
            };
            reader.readAsArrayBuffer(state._midiFile);
        }

        // 绑定试听按钮
        var previewBtns = wrapper.querySelectorAll('.sustain-track-preview-btn');
        for (var k = 0; k < previewBtns.length; k++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var trackIdx = parseInt(btn.getAttribute('data-track'));
                    toggleSustainTrackPreview(trackIdx, btn);
                });
            })(previewBtns[k]);
        }
    }

    function getMidiTrackMeta(trackIdx) {
        var info = state._midiInfo;
        var tracks = info && info.tracks ? info.tracks : [];
        for (var i = 0; i < tracks.length; i++) {
            if (parseInt(tracks[i].index) === parseInt(trackIdx)) return tracks[i];
        }
        return null;
    }

    function buildFallbackTrackPreviewNotes(trackIdx) {
        var meta = getMidiTrackMeta(trackIdx);
        if (!meta || !(meta.note_count > 0)) return [];
        var duration = (state._midiInfo && state._midiInfo.duration_seconds) || _midiTrackPlayback.duration || 5;
        var count = Math.max(1, Math.min(24, meta.note_count || 1));
        var notes = [];
        for (var i = 0; i < count; i++) {
            var t = count === 1 ? 0 : (duration * i / count);
            notes.push({
                note: 60 + (i % 12),
                start: t,
                end: Math.min(duration, t + Math.max(0.08, duration / Math.max(8, count * 2))),
                velocity: 80
            });
        }
        return notes;
    }

    // 从事件列表提取指定轨道的音符（配对 noteOn/noteOff）
    function extractTrackNotes(events, trackIdx) {
        var notes = [];
        var active = {};
        var wanted = parseInt(trackIdx);
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (parseInt(e.track) !== wanted) continue;
            var key = (e.channel !== undefined ? e.channel : 0) + ':' + e.note;
            if (e.type === 'noteOn') {
                if (!active[key]) active[key] = [];
                active[key].push({ note: e.note, start: e.time, velocity: e.velocity });
            } else if (e.type === 'noteOff') {
                var stack = active[key];
                var start = stack && stack.length ? stack.shift() : null;
                if (start) {
                    notes.push({
                        note: start.note,
                        start: start.start,
                        end: Math.max(start.start + 0.05, e.time),
                        velocity: start.velocity
                    });
                    if (stack && stack.length === 0) delete active[key];
                }
            }
        }
        for (var n in active) {
            var pending = active[n] || [];
            for (var p = 0; p < pending.length; p++) {
                notes.push({
                    note: pending[p].note,
                    start: pending[p].start,
                    end: Math.max(pending[p].start + 0.5, _midiTrackPlayback.duration || 5),
                    velocity: pending[p].velocity
                });
            }
        }
        notes.sort(function(a, b) { return a.start - b.start; });
        return notes.length ? notes : buildFallbackTrackPreviewNotes(trackIdx);
    }

    // ========== 延音轨道试听 ==========
    var _sustainPreview = {
        playing: false,
        trackIndex: -1,
        scheduled: [],
        endTime: 0,
        startTime: 0,
        miniRoll: null,
        playheadRAF: null
    };

    function toggleSustainTrackPreview(trackIndex, btn) {
        // 如果正在试听同一轨道，停止
        if (_sustainPreview.playing && _sustainPreview.trackIndex === trackIndex) {
            stopSustainTrackPreview();
            return;
        }
        // 停止当前试听
        stopSustainTrackPreview();
        // 开始试听新轨道
        previewSustainTrack(trackIndex, btn);
    }

    function stopSustainTrackPreview() {
        // 清除所有调度
        for (var i = 0; i < _sustainPreview.scheduled.length; i++) {
            var s = _sustainPreview.scheduled[i];
            if (s.timeout) clearTimeout(s.timeout);
        }
        _sustainPreview.scheduled = [];

        // 停止播放头动画
        if (_sustainPreview.playheadRAF) {
            cancelAnimationFrame(_sustainPreview.playheadRAF);
            _sustainPreview.playheadRAF = null;
        }

        // 停止所有音符
        stopTinySynthAll();
        if (_midiTrackPlayback.output) {
            for (var ch = 0; ch < 16; ch++) {
                try { _midiTrackPlayback.output.send([0xB0 | ch, 0x7B, 0]); } catch(e) {} // All Notes Off
            }
        }
        _sustainPreview.playing = false;
        _sustainPreview.trackIndex = -1;
        _sustainPreview.miniRoll = null;
        // 恢复所有按钮图标
        var btns = document.querySelectorAll('.sustain-track-preview-btn');
        for (var j = 0; j < btns.length; j++) {
            btns[j].classList.remove('playing');
            var icon = btns[j].querySelector('i');
            if (icon) icon.className = 'fa-solid fa-play';
        }
    }

    function previewSustainTrack(trackIndex, btn, seekTime) {
        if (!state._midiFile || !state._midiInfo) return;

        var reader = new FileReader();
        reader.onload = function(e) {
            var arrayBuffer = e.target.result;
            var allEvents = parseMidiFileForPlayback(arrayBuffer, state._midiInfo);
            // 过滤出指定轨道的事件
            var trackEvents = [];
            for (var i = 0; i < allEvents.length; i++) {
                var ev = allEvents[i];
                if (ev.track === trackIndex) {
                    trackEvents.push(ev);
                }
            }
            if (trackEvents.length === 0) {
                showMidiNotice('该轨道没有音符事件', 'error');
                return;
            }

            // 找到该轨道的结束时间
            var endTime = 0;
            for (var j = 0; j < trackEvents.length; j++) {
                if (trackEvents[j].time > endTime) endTime = trackEvents[j].time;
            }
            // Remove the 15 second limit - play full track

            // 默认跳过前面的空白：找到第一个 noteOn 事件的时间
            var skipTime = 0;
            if (seekTime !== undefined && seekTime !== null) {
                // 用户点击缩略图跳转
                skipTime = Math.max(0, Math.min(seekTime, endTime));
            } else {
                // 默认跳过前面的空白
                for (var k = 0; k < trackEvents.length; k++) {
                    if (trackEvents[k].type === 'noteOn') {
                        skipTime = trackEvents[k].time;
                        break;
                    }
                }
            }

            _sustainPreview.playing = true;
            _sustainPreview.trackIndex = trackIndex;
            _sustainPreview.endTime = endTime;
            _sustainPreview.startTime = skipTime;
            _sustainPreview.scheduled = [];

            // 找到对应的 MiniMidiRoll 用于更新播放头
            var miniRollContainer = document.querySelector('.sustain-track-mini-roll[data-track="' + trackIndex + '"]');
            _sustainPreview.miniRoll = miniRollContainer ? miniRollContainer._miniRoll : null;
            if (_sustainPreview.miniRoll) {
                _sustainPreview.miniRoll.setPlayhead(skipTime);
            }

            // 更新按钮图标
            if (btn) {
                btn.classList.add('playing');
                var icon = btn.querySelector('i');
                if (icon) icon.className = 'fa-solid fa-stop';
            }

            // 使用 TinySynth 播放
            var synth = getTinySynth();
            var useWebMidi = false;
            var output = null;

            if (navigator.requestMIDIAccess) {
                navigator.requestMIDIAccess().then(function(access) {
                    var outputs = access.outputs;
                    if (outputs && outputs.size > 0) {
                        output = outputs.values().next().value;
                        useWebMidi = true;
                    }
                    schedulePreview(trackEvents, synth, useWebMidi, output, endTime, btn, skipTime);
                }).catch(function() {
                    schedulePreview(trackEvents, synth, false, null, endTime, btn, skipTime);
                });
            } else {
                schedulePreview(trackEvents, synth, false, null, endTime, btn, skipTime);
            }
        };
        reader.readAsArrayBuffer(state._midiFile);
    }

    function schedulePreview(trackEvents, synth, useWebMidi, output, endTime, btn, skipTime) {
        var audioStartTime;
        var programsSent = {};
        skipTime = skipTime || 0;

        // 优先尝试 NBS 转换路径 (能听到拟合+替代+偏移后的真实效果)
        // 仅当 AudioEngine 可用且能拿到当前 MIDI 设置时启用
        var useNbsPath = !!(window.AudioEngine && AudioEngine.playNote && state._midiInfo);

        if (!useNbsPath) {
            // 回退到原 GM MIDI 路径
            if (useWebMidi && output) {
                audioStartTime = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext().currentTime : performance.now() / 1000;
            } else if (synth) {
                try { synth.reset(); } catch(ex) {}
                var synthCtx = synth.getAudioContext ? synth.getAudioContext() : null;
                if (!synthCtx) synthCtx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
                if (!synthCtx) {
                    showMidiNotice('音频上下文未就绪，无法试听。', 'error');
                    stopSustainTrackPreview();
                    return;
                }
                audioStartTime = synthCtx.currentTime;
            } else {
                showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听。', 'error');
                stopSustainTrackPreview();
                return;
            }
        }

        // 收集 NBS 转换所需的设置
        var nbsSettings = useNbsPath ? collectNbsPreviewSettings() : null;

        // 发送 skipTime 之前的 programChange（确保音色已设置）— 仅 GM 路径需要
        if (!useNbsPath) {
            for (var pi = 0; pi < trackEvents.length; pi++) {
                var pev = trackEvents[pi];
                if (pev.time > skipTime) break;
                if (pev.type === 'programChange') {
                    var progKey = pev.track + '-' + pev.channel;
                    if (!programsSent[progKey]) {
                        if (useWebMidi && output) {
                            try { output.send([0xC0 | (pev.channel & 0x0F), pev.program & 0x7F]); } catch(e) {}
                        } else if (synth) {
                            try { synth.send([0xC0 | (pev.channel & 0x0F), pev.program & 0x7F]); } catch(e) {}
                        }
                        programsSent[progKey] = true;
                    }
                }
            }
        }

        for (var i = 0; i < trackEvents.length; i++) {
            var ev = trackEvents[i];
            if (ev.time > endTime) break;
            // 跳过 skipTime 之前的事件
            if (ev.time < skipTime) continue;

            if (ev.type === 'programChange') {
                if (useNbsPath) continue; // NBS 路径不需要发送 programChange
                var progKey2 = ev.track + '-' + ev.channel;
                if (!programsSent[progKey2]) {
                    var delayMs = Math.max(0, (ev.time - skipTime) * 1000);
                    var t = setTimeout((function(evt) {
                        return function() {
                            if (!_sustainPreview.playing) return;
                            if (useWebMidi && output) {
                                try { output.send([0xC0 | (evt.channel & 0x0F), evt.program & 0x7F]); } catch(e) {}
                            } else if (synth) {
                                try { synth.send([0xC0 | (evt.channel & 0x0F), evt.program & 0x7F]); } catch(e) {}
                            }
                        };
                    })(ev), delayMs);
                    _sustainPreview.scheduled.push({ timeout: t });
                    programsSent[progKey2] = true;
                }
                continue;
            }

            if (ev.type === 'noteOn' || ev.type === 'noteOff') {
                var delayMs2 = Math.max(0, (ev.time - skipTime) * 1000);

                if (useNbsPath) {
                    // NBS 转换路径: 仅处理 noteOn (NBS 音色为短样本, noteOff 不需要主动停止)
                    if (ev.type === 'noteOn') {
                        var tNbs = setTimeout((function(evt) {
                            return function() {
                                if (!_sustainPreview.playing) return;
                                playNoteAsNbs(evt, nbsSettings);
                            };
                        })(ev), delayMs2);
                        _sustainPreview.scheduled.push({ timeout: tNbs });
                    }
                    // noteOff 在 NBS 路径下忽略
                } else {
                    // GM MIDI 路径
                    var t2 = setTimeout((function(evt) {
                        return function() {
                            if (!_sustainPreview.playing) return;
                            var status = evt.type === 'noteOn' ? 0x90 : 0x80;
                            var velocity = evt.type === 'noteOn' ? (evt.velocity || 100) : 0;
                            if (useWebMidi && output) {
                                try { output.send([status | (evt.channel & 0x0F), evt.note & 0x7F, velocity & 0x7F]); } catch(e) {}
                            } else if (synth) {
                                try { synth.send([status | (evt.channel & 0x0F), evt.note & 0x7F, velocity & 0x7F]); } catch(e) {}
                            }
                        };
                    })(ev), delayMs2);
                    _sustainPreview.scheduled.push({ timeout: t2 });
                }
            }
        }

        // 播放头动画更新
        var playheadStart = performance.now();
        function updatePlayhead() {
            if (!_sustainPreview.playing) return;
            var elapsed = (performance.now() - playheadStart) / 1000;
            var currentT = skipTime + elapsed;
            if (_sustainPreview.miniRoll) {
                _sustainPreview.miniRoll.setPlayhead(currentT);
            }
            if (currentT < endTime) {
                _sustainPreview.playheadRAF = requestAnimationFrame(updatePlayhead);
            }
        }
        _sustainPreview.playheadRAF = requestAnimationFrame(updatePlayhead);

        // 自动停止
        var stopDelay = (endTime - skipTime + 1) * 1000;
        var stopT = setTimeout(function() {
            stopSustainTrackPreview();
        }, stopDelay);
        _sustainPreview.scheduled.push({ timeout: stopT });
    }

    // 收集 NBS 预览所需的设置 (拟合、八度、替代配置等)
    function collectNbsPreviewSettings() {
        var settings = {
            octaveMode: $('midi-octave-mode') ? parseInt($('midi-octave-mode').value) || 0 : 0,
            smartSubstituteEnabled: $('midi-smart-substitute') ? $('midi-smart-substitute').checked : false,
            forceFoldEnabled: $('midi-force-fold') ? $('midi-force-fold').checked : false,
            substituteConfig: loadSubstituteConfig(),
            substituteTracksSet: _substituteSelectedTracks,
            channelInstruments: {}, // 留空, 由 fitting/GM 表决定
            timbreFitting: collectTimbreFitting()
        };
        if (settings.octaveMode !== 2 && settings.octaveMode !== 3) {
            settings.smartSubstituteEnabled = false;
        }
        return settings;
    }

    // 把单个 MIDI noteOn 事件转换为 NBS 音色并播放 (与 importMidi 流水线一致)
    function playNoteAsNbs(ev, settings) {
        if (!ev || ev.type !== 'noteOn') return;
        if (!window.AudioEngine || !AudioEngine.playNote) return;

        var ch = ev.channel;
        var midiNote = ev.note;
        var velocity = Math.min(100, Math.floor((ev.velocity || 100) / 127.0 * 100));

        if (ch === 9) {
            // 鼓组: 直接用 DRUM_NOTE_TABLE 查找
            var drumInfo = (typeof DRUM_NOTE_TABLE !== 'undefined') ? DRUM_NOTE_TABLE[midiNote] : null;
            if (drumInfo) {
                var drumInst = drumInfo[1];
                var drumKey = drumInfo[2] + 33;
                AudioEngine.playNote(drumInst, drumKey, velocity);
            }
            return;
        }

        // 旋律通道: 走完整转换链
        // 1. 确定乐器 (优先 fitting slot1 > GM 表 > 0)
        var inst = 0;
        var fitting = settings.timbreFitting && settings.timbreFitting.channels ? settings.timbreFitting.channels[ch] : null;
        if (fitting && fitting[0] >= 0) {
            inst = fitting[0];
        } else {
            var prog = 0;
            if (state._midiInfo && state._midiInfo.channelFirstProgram) {
                prog = state._midiInfo.channelFirstProgram[ch] || 0;
            }
            if (typeof GM_PROGRAM_TABLE !== 'undefined' && GM_PROGRAM_TABLE[prog]) {
                inst = GM_PROGRAM_TABLE[prog][1];
            }
        }

        // 2. 获取八度/keyShift 偏移
        var chSettings = getChannelSettings(ch);
        var octaveOffset = chSettings.octave || 0;
        var keyOffset = chSettings.keyShift || 0;

        // 3. 走转换流水线 (与 nbs_client.js 一致)
        var processedMidi;
        var octaveMode = settings.octaveMode;

        if (octaveMode === 0) {
            // 模式 0: 不处理
            processedMidi = midiNote;
        } else if (octaveMode === 1) {
            // 模式 1: 单独归一 (折叠到 MC 标准音域 [54, 78])
            processedMidi = midiNote + 12 * octaveOffset + keyOffset;
            while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
            while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
        } else {
            // 模式 2/3: 先替代, 后偏移
            processedMidi = midiNote;
            if (settings.smartSubstituteEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                var trackInScope = true;
                if (settings.substituteTracksSet) {
                    trackInScope = !!settings.substituteTracksSet[ev.track || 0];
                }
                if (trackInScope && settings.substituteConfig) {
                    var substResult = applySubstituteToNote(processedMidi, inst, settings.substituteConfig);
                    if (substResult.midi !== processedMidi) {
                        // 替代成功
                        inst = substResult.instrument;
                        processedMidi = substResult.midi;
                    }
                }
            }
            // 应用偏移
            processedMidi += 12 * octaveOffset + keyOffset;
            // 强制兜底
            if (settings.forceFoldEnabled && (processedMidi < MC_MIDI_MIN || processedMidi > MC_MIDI_MAX)) {
                while (processedMidi < MC_MIDI_MIN) processedMidi += 12;
                while (processedMidi > MC_MIDI_MAX) processedMidi -= 12;
            }
        }

        // 4. 转换为 NBS key
        var nbsKey = processedMidi - 21;
        if (nbsKey < 0) nbsKey = 0;
        if (nbsKey > 87) nbsKey = 87;

        // 5. 播放所有 fitting 槽位 (slot1 主乐器 + slot2/3 副乐器)
        AudioEngine.playNote(inst, nbsKey, velocity);
        if (fitting && fitting.length > 1) {
            for (var si = 1; si < fitting.length; si++) {
                if (fitting[si] >= 0) {
                    AudioEngine.playNote(fitting[si], nbsKey, velocity);
                }
            }
        }
    }

    // ========== 简易 MIDI 钢琴卷帘可视化 ==========
    function SimpleMidiRoll(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.notes = [];
        this.minNote = 60;
        this.maxNote = 72;
        this.minTime = 0;
        this.maxTime = 10;
        this.paddingLeft = 36;
        this.paddingRight = 8;
        this.paddingTop = 8;
        this.paddingBottom = 24;
        this.scrollX = 0; // 像素偏移
        this.scrollY = 0;
        this.scaleX = 50; // 像素/秒
        this.scaleY = 12; // 像素/半音
        this.playheadTime = 0;
        this.isPlaying = false;
        this.lastFrameTime = 0;
        this.rafId = null;
        this.onSeek = null;
        this.onTimeUpdate = null;
        this.dragging = false;
        this.dragStartX = 0;
        this.dragStartScrollX = 0;
        this.dragStartY = 0;
        this.dragStartScrollY = 0;
        this.resizeObserver = null;

        this._setupHiDPI();
        this._bindEvents();
        this.fitToNotes();
    }

    SimpleMidiRoll.prototype._setupHiDPI = function() {
        var rect = this.canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
    };

    SimpleMidiRoll.prototype._bindEvents = function() {
        var self = this;
        // 窗口大小变化重绘
        var ro = new ResizeObserver(function() {
            self._setupHiDPI();
            self.render();
        });
        ro.observe(this.canvas.parentElement || this.canvas);
        this.resizeObserver = ro;

        // 鼠标滚轮缩放
        this.canvas.addEventListener('wheel', function(e) {
            e.preventDefault();
            var rect = self.canvas.getBoundingClientRect();
            var mouseX = e.clientX - rect.left;
            var timeBefore = self._pixelToTime(mouseX);
            if (e.deltaY < 0) {
                self.scaleX *= 1.15;
                self.scaleY *= 1.1;
            } else {
                self.scaleX /= 1.15;
                self.scaleY /= 1.1;
            }
            self.scaleX = Math.max(5, Math.min(5000, self.scaleX));
            self.scaleY = Math.max(4, Math.min(40, self.scaleY));
            var timeAfter = self._pixelToTime(mouseX);
            self.scrollX += (timeAfter - timeBefore) * self.scaleX;
            self.render();
        }, { passive: false });

        // 拖拽平移
        function onPointerDown(e) {
            if (e.button !== 0) return;
            self.dragging = true;
            self.dragStartX = e.clientX;
            self.dragStartY = e.clientY;
            self.dragStartScrollX = self.scrollX;
            self.dragStartScrollY = self.scrollY;
            self.canvas.setPointerCapture(e.pointerId);
        }
        function onPointerMove(e) {
            if (!self.dragging) return;
            e.preventDefault();
        }
        function onPointerUp(e) {
            if (!self.dragging) return;
            var dx = e.clientX - self.dragStartX;
            var dy = e.clientY - self.dragStartY;
            self.dragging = false;
            // 点击（几乎没移动）则 seek
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
                var rect = self.canvas.getBoundingClientRect();
                var t = self._pixelToTime(e.clientX - rect.left);
                if (self.onSeek) self.onSeek(Math.max(0, t));
            }
            try { self.canvas.releasePointerCapture(e.pointerId); } catch(ex) {}
        }
        this.canvas.addEventListener('pointerdown', onPointerDown);
        this.canvas.addEventListener('pointermove', onPointerMove);
        this.canvas.addEventListener('pointerup', onPointerUp);
        this.canvas.addEventListener('pointerleave', function(e) { self.dragging = false; });
    };

    SimpleMidiRoll.prototype.setNotes = function(notes) {
        this.notes = notes || [];
        if (this.notes.length === 0) {
            this.minNote = 60; this.maxNote = 72;
            this.minTime = 0; this.maxTime = 5;
        } else {
            this.minNote = 127; this.maxNote = 0;
            this.minTime = Infinity; this.maxTime = 0;
            for (var i = 0; i < this.notes.length; i++) {
                var n = this.notes[i];
                if (n.note < this.minNote) this.minNote = n.note;
                if (n.note > this.maxNote) this.maxNote = n.note;
                if (n.start < this.minTime) this.minTime = n.start;
                if (n.end > this.maxTime) this.maxTime = n.end;
            }
            this.minNote = Math.max(0, this.minNote - 2);
            this.maxNote = Math.min(127, this.maxNote + 2);
        }
        this.fitToNotes();
    };

    SimpleMidiRoll.prototype.fitToNotes = function() {
        if (this.notes.length === 0) {
            this.scrollX = 0;
            this.scrollY = 0;
            this.scaleX = 50;
            this.scaleY = 12;
        } else {
            var timeRange = Math.max(1, this.maxTime - this.minTime);
            var noteRange = Math.max(12, this.maxNote - this.minNote);
            var availW = Math.max(50, this.width - this.paddingLeft - this.paddingRight);
            var availH = Math.max(50, this.height - this.paddingTop - this.paddingBottom);
            this.scaleX = availW / timeRange;
            this.scaleY = availH / noteRange;
            this.scrollX = 0;
            this.scrollY = (availH - noteRange * this.scaleY) / 2;
        }
        this.render();
    };

    SimpleMidiRoll.prototype._timeToPixel = function(t) {
        return this.paddingLeft + (t - this.minTime) * this.scaleX + this.scrollX;
    };

    SimpleMidiRoll.prototype._pixelToTime = function(x) {
        return this.minTime + (x - this.paddingLeft - this.scrollX) / this.scaleX;
    };

    SimpleMidiRoll.prototype._noteToPixel = function(note) {
        return this.height - this.paddingBottom - (note - this.minNote) * this.scaleY + this.scrollY;
    };

    SimpleMidiRoll.prototype.setPlayhead = function(t) {
        this.playheadTime = t;
        this.render();
    };

    SimpleMidiRoll.prototype.play = function() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        var self = this;
        function loop() {
            if (!self.isPlaying) return;
            var now = performance.now();
            var dt = (now - self.lastFrameTime) / 1000;
            self.lastFrameTime = now;
            self.playheadTime += dt;
            if (self.playheadTime > self.maxTime + 1) {
                self.playheadTime = 0;
            }
            self.render();
            if (self.onTimeUpdate) self.onTimeUpdate(self.playheadTime);
            self.rafId = requestAnimationFrame(loop);
        }
        this.rafId = requestAnimationFrame(loop);
    };

    SimpleMidiRoll.prototype.pause = function() {
        this.isPlaying = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    };

    SimpleMidiRoll.prototype.stop = function() {
        this.pause();
        this.playheadTime = 0;
        this.render();
    };

    SimpleMidiRoll.prototype.destroy = function() {
        this.pause();
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    };

    SimpleMidiRoll.prototype.render = function() {
        var ctx = this.ctx;
        var w = this.width, h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(0, 0, w, h);

        // 网格
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        // 时间网格（每 1 秒）
        var startSec = Math.floor(this._pixelToTime(0));
        var endSec = Math.ceil(this._pixelToTime(w));
        for (var s = startSec; s <= endSec; s++) {
            var x = this._timeToPixel(s);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - this.paddingBottom); ctx.stroke();
        }
        // 音高网格（每个 note）
        for (var n = this.minNote; n <= this.maxNote; n++) {
            var y = this._noteToPixel(n);
            ctx.beginPath(); ctx.moveTo(this.paddingLeft, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // 绘制音符块
        for (var i = 0; i < this.notes.length; i++) {
            var note = this.notes[i];
            var x = this._timeToPixel(note.start);
            var y = this._noteToPixel(note.note) - this.scaleY * 0.5;
            var width = Math.max(2, (note.end - note.start) * this.scaleX);
            var height = this.scaleY * 0.85;
            // 根据 velocity 调整透明度
            var alpha = 0.5 + (note.velocity || 100) / 255;
            ctx.fillStyle = 'rgba(76, 194, 255, ' + alpha + ')';
            ctx.fillRect(x, y, width, height);
            ctx.strokeStyle = 'rgba(76, 194, 255, 0.8)';
            ctx.strokeRect(x, y, width, height);
        }

        // 绘制播放头
        var px = this._timeToPixel(this.playheadTime);
        ctx.strokeStyle = '#ff6b6b';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();

        // 底部时间轴
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, h - this.paddingBottom, w, this.paddingBottom);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        for (var t = startSec; t <= endSec; t++) {
            var tx = this._timeToPixel(t);
            ctx.fillText(t + 's', tx, h - 8);
        }

        // 左侧音高轴
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, this.paddingLeft, h - this.paddingBottom);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'right';
        for (var nn = this.minNote; nn <= this.maxNote; nn += 2) {
            var ny = this._noteToPixel(nn);
            ctx.fillText(nn, this.paddingLeft - 6, ny + 3);
        }
    };

    // ========== 迷你 MIDI 音符图（每行右侧用，Y自动压缩音域，仅左右拖拽） ==========
    function MiniMidiRoll(canvas, notes, options) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.notes = notes || [];
        this.options = options || {};
        this.scrollX = 0; // 像素偏移
        this.paddingLeft = 2;
        this.paddingRight = 2;
        this.paddingTop = 2;
        this.paddingBottom = 2;
        // 自动计算音域范围
        this.minNote = 60; this.maxNote = 72;
        this.minTime = 0; this.maxTime = 5;
        this._computeRange();
        this._setupHiDPI();
        this.render();
        // 监听容器大小变化
        var self = this;
        this._ro = new ResizeObserver(function() {
            self._setupHiDPI();
            self.render();
        });
        this._ro.observe(this.canvas.parentElement || this.canvas);
    }

    MiniMidiRoll.prototype._computeRange = function() {
        if (this.notes.length === 0) {
            this.minNote = 60; this.maxNote = 72;
            this.minTime = 0; this.maxTime = 5;
            return;
        }
        this.minNote = 127; this.maxNote = 0;
        this.minTime = this.options.fullDuration ? 0 : Infinity;
        this.maxTime = this.options.fullDuration ? this.options.fullDuration : 0;
        for (var i = 0; i < this.notes.length; i++) {
            var n = this.notes[i];
            if (n.note < this.minNote) this.minNote = n.note;
            if (n.note > this.maxNote) this.maxNote = n.note;
            if (!this.options.fullDuration && n.start < this.minTime) this.minTime = n.start;
            if (n.end > this.maxTime) this.maxTime = n.end;
        }
        if (this.options.fullDuration) this.maxTime = Math.max(this.maxTime, this.options.fullDuration);
        // 至少要有 1 个半音的范围
        if (this.maxNote <= this.minNote) this.maxNote = this.minNote + 1;
        // 至少要有 0.5 秒的范围
        if (this.maxTime <= this.minTime) this.maxTime = this.minTime + 0.5;
    };

    MiniMidiRoll.prototype._setupHiDPI = function() {
        var rect = this.canvas.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.width = rect.width;
        this.height = rect.height;
    };

    MiniMidiRoll.prototype.setNotes = function(notes) {
        this.notes = notes || [];
        this._computeRange();
        this.scrollX = 0;
        this.render();
    };

    MiniMidiRoll.prototype.setPlayhead = function(t) {
        this.playheadTime = t;
        this.render();
    };

    MiniMidiRoll.prototype.render = function() {
        var ctx = this.ctx;
        var w = this.width, h = this.height;
        if (w <= 0 || h <= 0) return;
        ctx.clearRect(0, 0, w, h);

        // 背景
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(0, 0, w, h);

        if (this.notes.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '10px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('无音符', w / 2, h / 2 + 3);
            return;
        }

        var availW = Math.max(10, w - this.paddingLeft - this.paddingRight);
        var availH = Math.max(10, h - this.paddingTop - this.paddingBottom);
        var timeRange = Math.max(0.1, this.maxTime - this.minTime);
        var noteRange = Math.max(1, this.maxNote - this.minNote);

        // 默认缩放：填满宽度
        var scaleX = availW / timeRange;
        var scaleY = availH / noteRange;

        var self = this;
        function timeToX(t) {
            return self.paddingLeft + (t - self.minTime) * scaleX + self.scrollX;
        }
        function noteToY(note) {
            // 高音在上
            return self.paddingTop + (self.maxNote - note) * scaleY;
        }

        // 绘制音符块
        for (var i = 0; i < this.notes.length; i++) {
            var n = this.notes[i];
            var x = timeToX(n.start);
            var y = noteToY(n.note);
            var width = Math.max(1.5, (n.end - n.start) * scaleX);
            var height = Math.max(2, scaleY * 0.8);
            var alpha = 0.5 + (n.velocity || 100) / 255;
            ctx.fillStyle = 'rgba(76, 194, 255, ' + alpha + ')';
            ctx.fillRect(x, y + (scaleY - height) / 2, width, height);
        }

        // 播放头
        if (this.playheadTime !== undefined && this.playheadTime !== null) {
            var px = timeToX(this.playheadTime);
            if (px >= 0 && px <= w) {
                ctx.strokeStyle = '#ff6b6b';
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
            }
        }
    };

    // 将像素 X 坐标转换为时间（用于点击跳转）
    MiniMidiRoll.prototype.pixelToTime = function(px) {
        var availW = Math.max(10, this.width - this.paddingLeft - this.paddingRight);
        var timeRange = Math.max(0.1, this.maxTime - this.minTime);
        var scaleX = availW / timeRange;
        return this.minTime + (px - this.paddingLeft - this.scrollX) / scaleX;
    };

    MiniMidiRoll.prototype.destroy = function() {
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
    };

    function renderMidiTrackRow(index) {
        var row = document.querySelector('#midi-track-rows tr[data-track-index="' + index + '"]');
        if (!row) return;
        var st = getMidiTrackState(index);
        row.classList.toggle('muted', !!st.muted);
        row.classList.toggle('excluded', !!st.excluded);

        var muteBtn = row.querySelector('.midi-track-btn.mute');
        var soloBtn = row.querySelector('.midi-track-btn.solo');
        var excludeBtn = row.querySelector('.midi-track-btn.exclude');

        if (muteBtn) {
            muteBtn.classList.toggle('on', !!st.muted);
            muteBtn.disabled = !!st.excluded;
            // Force red background when muted, overriding td background
            if (st.muted) {
                muteBtn.style.background = 'var(--accent-red)';
                muteBtn.style.borderColor = 'var(--accent-red)';
                muteBtn.style.color = '#fff';
            } else {
                muteBtn.style.background = '';
                muteBtn.style.borderColor = '';
                muteBtn.style.color = '';
            }
        }
        if (soloBtn) {
            soloBtn.classList.toggle('on', !!st.solo);
            soloBtn.disabled = !!st.excluded;
        }
        if (excludeBtn) {
            excludeBtn.classList.toggle('on', !!st.excluded);
        }
    }

    function renderAllMidiTrackRows() {
        var rows = document.querySelectorAll('#midi-track-rows tr[data-track-index]');
        for (var i = 0; i < rows.length; i++) {
            renderMidiTrackRow(parseInt(rows[i].getAttribute('data-track-index')));
        }
    }

    function buildMidiTrackRows(info) {
        var trackRows = $('midi-track-rows');
        if (!trackRows) return;
        trackRows.innerHTML = '';
        var tracks = info.tracks || [];
        // 第一次构建或文件变化时重置状态
        if (!state._midiTrackInfo || state._midiTrackInfo.fileKey !== (state._midiFile ? state._midiFile.name : '')) {
            initMidiTrackStates(info);
            state._midiTrackInfo = { fileKey: state._midiFile ? state._midiFile.name : '', trackCount: tracks.length };
        }
        for (var k = 0; k < tracks.length; k++) {
            var t = tracks[k];
            var st = getMidiTrackState(t.index);
            var row = document.createElement('tr');
            row.setAttribute('data-track-index', t.index);
            row.className = (st.muted ? 'muted ' : '') + (st.excluded ? 'excluded' : '');
            row.innerHTML =
                '<td>' + (t.index + 1) + '</td>' +
                '<td>' + (t.name || 'Track ' + (t.index + 1)) + '</td>' +
                '<td>' + (t.event_count || 0) + '</td>' +
                '<td>' + (t.note_count || 0) + '</td>' +
                '<td><button class="midi-track-btn mute' + (st.muted ? ' on' : '') + '" data-track="' + t.index + '" data-action="mute"' + (st.excluded ? ' disabled' : '') + '>M</button></td>' +
                '<td><button class="midi-track-btn solo' + (st.solo ? ' on' : '') + '" data-track="' + t.index + '" data-action="solo"' + (st.excluded ? ' disabled' : '') + '>S</button></td>' +
                '<td><button class="midi-track-btn exclude' + (st.excluded ? ' on' : '') + '" data-track="' + t.index + '" data-action="exclude">X</button></td>' +
                '<td><div class="midi-track-mini-roll" data-track="' + t.index + '" style="width:140px;height:36px;background:var(--neutral-2);border:1px solid var(--ctrl-stroke-default);border-radius:var(--radius-sm);overflow:hidden;position:relative;cursor:default;"><canvas style="display:block;width:100%;height:100%;"></canvas></div></td>';
            trackRows.appendChild(row);
        }
        bindMidiTrackButtons();
        updateMidiTrackProgressDuration(info.duration_seconds || 0);
    }

    function bindMidiTrackButtons() {
        var tbody = $('midi-track-rows');
        if (tbody && !tbody._midiTrackButtonsBound) {
            tbody._midiTrackButtonsBound = true;
            tbody.addEventListener('click', function(e) {
                var btn = e.target && e.target.closest ? e.target.closest('.midi-track-btn') : null;
                if (!btn || !tbody.contains(btn)) return;
                e.preventDefault();
                e.stopPropagation();
                var trackIndex = parseInt(btn.getAttribute('data-track'));
                var action = btn.getAttribute('data-action');
                var st = getMidiTrackState(trackIndex);
                if (action === 'mute') {
                    if (st.excluded) return;
                    setMidiTrackState(trackIndex, 'muted', !st.muted);
                } else if (action === 'solo') {
                    if (st.excluded) return;
                    setMidiTrackState(trackIndex, 'solo', !st.solo);
                } else if (action === 'exclude') {
                    setMidiTrackState(trackIndex, 'excluded', !st.excluded);
                }
            });
        }
        // 初始化每行的迷你音符图
        initMidiTrackMiniRolls();
    }

    // 为 MIDI 音轨表格每行初始化迷你音符图
    var _midiTrackMiniRolls = {}; // trackIndex → MiniMidiRoll
    function initMidiTrackMiniRolls() {
        // 清理旧的
        for (var k in _midiTrackMiniRolls) {
            if (_midiTrackMiniRolls[k] && _midiTrackMiniRolls[k].destroy) {
                _midiTrackMiniRolls[k].destroy();
            }
        }
        _midiTrackMiniRolls = {};

        var events = state._midiParsedEvents || [];

        var containers = document.querySelectorAll('#midi-track-rows .midi-track-mini-roll');
        for (var i = 0; i < containers.length; i++) {
            (function(container) {
                var trackIdx = parseInt(container.getAttribute('data-track'));
                var notes = extractTrackNotes(events, trackIdx);
                var canvas = container.querySelector('canvas');
                var fullDuration = (state._midiInfo && state._midiInfo.duration_seconds) || _midiTrackPlayback.duration || 0;
                var mr = new MiniMidiRoll(canvas, notes, { fullDuration: fullDuration });
                _midiTrackMiniRolls[trackIdx] = mr;
                // 不允许拖拽，仅作为预览显示
            })(containers[i]);
        }
    }

    // 播放时更新所有迷你音符图的播放头
    function updateMidiTrackMiniRollsPlayhead(time) {
        for (var k in _midiTrackMiniRolls) {
            if (_midiTrackMiniRolls[k]) {
                _midiTrackMiniRolls[k].setPlayhead(time);
            }
        }
    }

    function updateMidiTrackRollTime(time) {
        var el = $('midi-track-roll-time');
        if (el) el.textContent = time.toFixed(1) + 's';
    }

    function updateMidiTrackPlayerButtons() {
        var playBtn = $('midi-track-play');
        if (playBtn) {
            playBtn.classList.toggle('playing', _midiTrackPlayback.playing);
            var icon = playBtn.querySelector('i');
            if (icon) icon.className = _midiTrackPlayback.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
        }
    }

    function formatMidiTrackTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) seconds = 0;
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateMidiTrackProgressDuration(seconds) {
        _midiTrackPlayback.duration = seconds || 0;
        var timeEl = $('midi-track-progress-time');
        if (timeEl) {
            timeEl.textContent = '0:00 / ' + formatMidiTrackTime(_midiTrackPlayback.duration);
        }
    }

    function updateMidiTrackProgressUI(currentSeconds) {
        var duration = _midiTrackPlayback.duration || 1;
        if (currentSeconds < 0) currentSeconds = 0;
        if (currentSeconds > duration) currentSeconds = duration;
        var pct = duration > 0 ? (currentSeconds / duration * 100) : 0;
        var fill = $('midi-track-progress-fill');
        var handle = $('midi-track-progress-handle');
        var timeEl = $('midi-track-progress-time');
        if (fill) fill.style.width = pct + '%';
        if (handle) handle.style.left = pct + '%';
        if (timeEl) timeEl.textContent = formatMidiTrackTime(currentSeconds) + ' / ' + formatMidiTrackTime(duration);
        // 同步迷你音符图的播放头
        updateMidiTrackMiniRollsPlayhead(currentSeconds);
    }

    function initMidiTrackPlayer() {
        var playBtn = $('midi-track-play');
        var stopBtn = $('midi-track-stop');
        var progress = $('midi-track-progress');

        if (playBtn) {
            playBtn.addEventListener('click', function() {
                if (_midiTrackPlayback.playing) {
                    pauseMidiTrackPlayback();
                } else {
                    startMidiTrackPlayback();
                }
            });
        }
        if (stopBtn) {
            stopBtn.addEventListener('click', function() {
                stopMidiTrackPlayback();
            });
        }
        if (progress) {
            var isDragging = false;
            function seekFromEvent(e) {
                var rect = progress.getBoundingClientRect();
                var clientX = e.clientX;
                if (clientX === undefined && e.touches && e.touches.length) clientX = e.touches[0].clientX;
                if (clientX === undefined && e.changedTouches && e.changedTouches.length) clientX = e.changedTouches[0].clientX;
                var x = (clientX !== undefined ? clientX : rect.left) - rect.left;
                var pct = Math.max(0, Math.min(1, x / rect.width));
                var duration = _midiTrackPlayback.duration || 1;
                return pct * duration;
            }
            function applySeek(e) {
                var targetTime = seekFromEvent(e);
                if (_midiTrackPlayback.playing) {
                    stopMidiTrackPlayback();
                    _midiTrackPlayback.pauseTime = targetTime;
                    startMidiTrackPlayback();
                } else {
                    _midiTrackPlayback.pauseTime = targetTime;
                    updateMidiTrackProgressUI(targetTime);
                }
            }
            progress.addEventListener('click', function(e) {
                if (isDragging) return;
                applySeek(e);
            });
            progress.addEventListener('pointerdown', function(e) {
                isDragging = true;
                try { progress.setPointerCapture(e.pointerId); } catch(ex) {}
                applySeek(e);
            });
            progress.addEventListener('pointermove', function(e) {
                if (!isDragging) return;
                e.preventDefault();
                var targetTime = seekFromEvent(e);
                updateMidiTrackProgressUI(targetTime);
            });
            progress.addEventListener('pointerup', function(e) {
                if (!isDragging) return;
                isDragging = false;
                try { progress.releasePointerCapture(e.pointerId); } catch(ex) {}
                applySeek(e);
            });
            progress.addEventListener('pointercancel', function(e) {
                isDragging = false;
                try { progress.releasePointerCapture(e.pointerId); } catch(ex) {}
            });
        }
    }

    // 解析 MIDI 文件为事件列表（简化版，仅用于试听/预览）
    // 优先使用与 getMidiInfo 相同的解析器，保证 track 索引一致
    function parseMidiFileForPlayback(arrayBuffer, info) {
        // 优先使用 @tonejs/midi (与 getMidiInfo 保持一致)
        if (typeof window.__ToneMidi !== 'undefined') {
            var toneParseFn = null;
            if (window.NBSClient && typeof NBSClient._parseMidiWithToneJS === 'function') {
                toneParseFn = NBSClient._parseMidiWithToneJS;
            } else if (typeof _parseMidiWithToneJS === 'function') {
                toneParseFn = _parseMidiWithToneJS;
            }
            if (toneParseFn) {
                try {
                    var toneData = toneParseFn(arrayBuffer);
                    if (toneData && toneData.events && toneData.events.length > 0) {
                        return _convertToneEventsForPlayback(toneData);
                    }
                } catch (e) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('[WebNBS] parseMidiFileForPlayback: @tonejs/midi 解析失败, 回退到自包含解析器', e);
                    }
                }
            }
        }
        return _parseMidiFileForPlaybackFallback(arrayBuffer, info);
    }

    // 将 @tonejs/midi 解析结果转换为试听/预览所需的事件格式
    // toneData.events 中只包含音符事件 (无 programChange), 需从 channelFirstProgram 生成
    function _convertToneEventsForPlayback(toneData) {
        var events = [];
        var tempoChanges = (toneData.tempoChangesList && toneData.tempoChangesList.length > 0)
            ? toneData.tempoChangesList.slice()
            : [{ tick: 0, tempo_us: 500000 }];
        tempoChanges.sort(function(a, b) { return a.tick - b.tick; });
        var ppq = toneData.ticksPerBeat || 480;

        // 从 channelFirstProgram 生成 programChange 事件 (tick 0, 供 TinySynth 设置音色)
        var cfp = toneData.channelFirstProgram || {};
        for (var chKey in cfp) {
            if (!Object.prototype.hasOwnProperty.call(cfp, chKey)) continue;
            events.push({
                track: -1,
                tick: 0,
                type: 'programChange',
                channel: parseInt(chKey, 10),
                program: cfp[chKey],
                time: 0
            });
        }

        for (var i = 0; i < toneData.events.length; i++) {
            var ev = toneData.events[i];
            // 防御: 跳过非音符事件 (programChange 等不应出现在 events 中)
            if (ev.type && ev.type !== 'note') continue;
            // 音符事件 -> 拆为 noteOn / noteOff
            var dur = ev.duration_ticks || 0;
            events.push({
                track: ev.track,
                tick: ev.tick,
                type: 'noteOn',
                channel: ev.channel,
                note: ev.note,
                velocity: ev.velocity || 100,
                time: _tickToSeconds(ev.tick, tempoChanges, ppq)
            });
            events.push({
                track: ev.track,
                tick: ev.tick + dur,
                type: 'noteOff',
                channel: ev.channel,
                note: ev.note,
                velocity: 0,
                time: _tickToSeconds(ev.tick + dur, tempoChanges, ppq)
            });
        }
        events.sort(function(a, b) { return a.time - b.time; });
        return events;
    }

    function _tickToSeconds(tick, tempoChanges, ppq) {
        var time = 0;
        var lastTick = 0;
        var currentTempoUs = tempoChanges[0].tempo_us;
        for (var i = 1; i < tempoChanges.length; i++) {
            if (tempoChanges[i].tick > tick) break;
            time += (tempoChanges[i].tick - lastTick) / ppq * (currentTempoUs / 1000000);
            lastTick = tempoChanges[i].tick;
            currentTempoUs = tempoChanges[i].tempo_us;
        }
        time += (tick - lastTick) / ppq * (currentTempoUs / 1000000);
        return time;
    }

    // 自包含 MIDI 解析器（@tonejs/midi 不可用时回退）
    function _parseMidiFileForPlaybackFallback(arrayBuffer, info) {
        var data = new Uint8Array(arrayBuffer);
        var pos = 0;
        function readByte() { return data[pos++]; }
        function readUint16() { return (data[pos++] << 8) | data[pos++]; }
        function readUint32() { return (data[pos++] << 24) | (data[pos++] << 16) | (data[pos++] << 8) | data[pos++]; }
        function readVarLen() {
            var result = 0;
            while (true) {
                var b = data[pos++];
                result = (result << 7) | (b & 0x7F);
                if (!(b & 0x80)) break;
            }
            return result;
        }

        if (readUint32() !== 0x4D546864) return []; // MThd
        var headerLen = readUint32();
        pos += headerLen;

        var events = [];
        var trackIndex = 0;
        var ticksPerBeat = info.ticks_per_beat || 480;
        var tempo = 500000; // 默认 120 BPM
        var tempoByTick = [{ tick: 0, tempo: tempo }];

        while (pos < data.length) {
            if (readUint32() !== 0x4D54726B) { // MTrk
                // 跳过未知块
                var len = readUint32();
                pos += len;
                continue;
            }
            var trackLen = readUint32();
            var trackEnd = pos + trackLen;
            var currentTick = 0;
            var lastStatus = 0;

            while (pos < trackEnd) {
                var delta = readVarLen();
                currentTick += delta;
                var status = data[pos];
                if (status & 0x80) {
                    lastStatus = status;
                    pos++;
                } else {
                    status = lastStatus;
                }

                var type = (status & 0xF0) >> 4;
                var channel = status & 0x0F;

                if (status === 0xFF) { // Meta
                    var metaType = readByte();
                    var metaLen = readVarLen();
                    var metaData = data.slice(pos, pos + metaLen);
                    pos += metaLen;
                    if (metaType === 0x51 && metaLen >= 3) {
                        tempo = (metaData[0] << 16) | (metaData[1] << 8) | metaData[2];
                        tempoByTick.push({ tick: currentTick, tempo: tempo });
                    }
                } else if (status === 0xF0 || status === 0xF7) { // SysEx
                    var sysLen = readVarLen();
                    pos += sysLen;
                } else if (type === 0x9) { // Note On
                    var note = readByte();
                    var velocity = readByte();
                    if (velocity > 0) {
                        events.push({
                            track: trackIndex,
                            tick: currentTick,
                            type: 'noteOn',
                            channel: channel,
                            note: note,
                            velocity: velocity
                        });
                    } else {
                        events.push({
                            track: trackIndex,
                            tick: currentTick,
                            type: 'noteOff',
                            channel: channel,
                            note: note,
                            velocity: 0
                        });
                    }
                } else if (type === 0x8) { // Note Off
                    var note = readByte();
                    var velocity = readByte();
                    events.push({
                        track: trackIndex,
                        tick: currentTick,
                        type: 'noteOff',
                        channel: channel,
                        note: note,
                        velocity: 0
                    });
                } else if (type === 0xC) { // Program Change
                    var program = readByte();
                    events.push({
                        track: trackIndex,
                        tick: currentTick,
                        type: 'programChange',
                        channel: channel,
                        program: program
                    });
                } else if (type === 0xB) { // Control Change
                    readByte(); readByte();
                } else if (type === 0xE) { // Pitch Bend
                    readByte(); readByte();
                } else if (type === 0xA) { // Polyphonic Aftertouch
                    readByte(); readByte();
                } else if (type === 0xD) { // Channel Aftertouch
                    readByte();
                }
            }
            trackIndex++;
        }

        // 按 tick 排序
        events.sort(function(a, b) { return a.tick - b.tick; });

        // 计算每个事件的时间（秒）
        tempoByTick.sort(function(a, b) { return a.tick - b.tick; });
        var tempoIdx = 0;
        var currentTempo = tempoByTick[0].tempo;
        var lastTick = 0;
        var lastTime = 0;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            while (tempoIdx + 1 < tempoByTick.length && tempoByTick[tempoIdx + 1].tick <= e.tick) {
                var segTicks = tempoByTick[tempoIdx + 1].tick - lastTick;
                lastTime += (segTicks / ticksPerBeat) * (currentTempo / 1000000);
                lastTick = tempoByTick[tempoIdx + 1].tick;
                currentTempo = tempoByTick[tempoIdx + 1].tempo;
                tempoIdx++;
            }
            e.time = lastTime + ((e.tick - lastTick) / ticksPerBeat) * (currentTempo / 1000000);
        }

        return events;
    }

    function midiTrackShouldPlay(trackIndex) {
        var st = getMidiTrackState(trackIndex);
        if (st.excluded || st.muted) return false;
        // 检查是否有独奏
        var hasSolo = false;
        for (var idx in _midiTrackStates) {
            if (_midiTrackStates[idx].solo) { hasSolo = true; break; }
        }
        if (hasSolo && !st.solo) return false;
        return true;
    }

    function startMidiTrackPlayback() {
        if (!state._midiFile || !state._midiInfo) return;
        stopMidiTrackPlayback();

        var reader = new FileReader();
        reader.onload = function(e) {
            var arrayBuffer = e.target.result;
            var events = parseMidiFileForPlayback(arrayBuffer, state._midiInfo);
            _midiTrackPlayback.events = events;
            _midiTrackPlayback.duration = state._midiInfo.duration_seconds || 0;
            if (_midiTrackPlayback.duration <= 0 && events.length > 0) {
                _midiTrackPlayback.duration = events[events.length - 1].time || 0;
            }

            var source = getEffectiveMidiSource();
            if (source === 'webmidi') {
                // 尝试 Web MIDI API
                if (navigator.requestMIDIAccess) {
                    navigator.requestMIDIAccess().then(function(access) {
                        var outputs = access.outputs;
                        if (outputs && outputs.size > 0) {
                            _midiTrackPlayback.output = outputs.values().next().value;
                            _midiTrackPlayback.useWebMidi = true;
                            _midiTrackPlayback.backend = 'webmidi';
                            scheduleMidiTrackEvents(events);
                        } else {
                            startMidiTrackFallback(events);
                        }
                    }).catch(function() {
                        startMidiTrackFallback(events);
                    });
                } else {
                    startMidiTrackFallback(events);
                }
            } else {
                startMidiTrackFallback(events);
            }
        };
        reader.readAsArrayBuffer(state._midiFile);
    }

    function scheduleMidiTrackEvents(events) {
        _midiTrackPlayback.playing = true;
        _midiTrackPlayback.startTime = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext().currentTime : performance.now() / 1000;
        _midiTrackPlayback.startTime -= _midiTrackPlayback.pauseTime;
        updateMidiTrackPlayerButtons();

        var backend = _midiTrackPlayback.backend || 'webmidi';
        var out = _midiTrackPlayback.output;
        var programsSent = {};
        var batchSizeMs = 100; // 每 100ms 一个批次，避免创建过多定时器

        // 不在调度时过滤，所有事件都保留，在批次回调中实时检查静音/独奏状态
        // 这样播放过程中切换静音/独奏会立即生效
        var allEvents = events.slice();

        // 按时间分批次调度
        var batches = [];
        for (var j = 0; j < allEvents.length; j++) {
            var ev = allEvents[j];
            var delayMs = Math.max(0, (ev.time - _midiTrackPlayback.pauseTime) * 1000);
            var batchIdx = Math.floor(delayMs / batchSizeMs);
            if (!batches[batchIdx]) batches[batchIdx] = { delayMs: batchIdx * batchSizeMs, events: [] };
            batches[batchIdx].events.push(ev);
        }

        for (var b = 0; b < batches.length; b++) {
            if (!batches[b]) continue;
            var batch = batches[b];
            var t = setTimeout((function(bt) {
                return function() {
                    if (!_midiTrackPlayback.playing) return;
                    if (backend === 'webmidi' && !out) return;
                    for (var k = 0; k < bt.events.length; k++) {
                        var evt = bt.events[k];
                        // 实时检查静音/独奏状态（noteOff 总是发送，确保被静音的音符能停止）
                        var shouldPlay = midiTrackShouldPlay(evt.track);
                        if (evt.type === 'programChange') {
                            if (!shouldPlay) continue;
                            var progKey = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey]) {
                                if (backend === 'webmidi') {
                                    try { out.send([0xC0 | evt.channel, evt.program & 0x7F]); } catch(e) {}
                                }
                                programsSent[progKey] = true;
                            }
                        } else if (evt.type === 'noteOn') {
                            if (!shouldPlay) continue; // 被静音/独奏过滤的音符不触发
                            var progKey2 = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey2]) {
                                var program = findProgramForChannel(evt.track, evt.channel);
                                // channel 9 (鼓组) 返回 null, 跳过 programChange 以保持鼓组模式
                                if (program !== null && backend === 'webmidi') {
                                    try { out.send([0xC0 | evt.channel, program & 0x7F]); } catch(e) {}
                                }
                                programsSent[progKey2] = true;
                            }
                            if (backend === 'webmidi') {
                                try { out.send([0x90 | evt.channel, evt.note & 0x7F, evt.velocity & 0x7F]); } catch(e) {}
                            }
                        } else if (evt.type === 'noteOff') {
                            // noteOff 总是发送，防止音符卡住
                            if (backend === 'webmidi') {
                                try { out.send([0x80 | evt.channel, evt.note & 0x7F, 0]); } catch(e) {}
                            }
                        }
                    }
                };
            })(batch), batch.delayMs);
            _midiTrackPlayback.scheduled.push({ timeout: t });
        }

        // 进度条动画
        function tick() {
            if (!_midiTrackPlayback.playing) return;
            var ctx2 = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext() : null;
            var now = ctx2 ? ctx2.currentTime : (performance.now() / 1000);
            var current = now - _midiTrackPlayback.startTime;
            updateMidiTrackProgressUI(current);
            if (current >= _midiTrackPlayback.duration) {
                stopMidiTrackPlayback();
                _midiTrackPlayback.pauseTime = 0;
                updateMidiTrackProgressUI(0);
                return;
            }
            _midiTrackPlayback.rafId = requestAnimationFrame(tick);
        }
        _midiTrackPlayback.rafId = requestAnimationFrame(tick);

        // 自动停止
        var endDelay = Math.max(0, (_midiTrackPlayback.duration - _midiTrackPlayback.pauseTime) * 1000) + 300;
        var endT = setTimeout(function() {
            stopMidiTrackPlayback();
        }, endDelay);
        _midiTrackPlayback.scheduled.push({ timeout: endT });
    }

    function findProgramForChannel(trackIndex, channel) {
        // 鼓组通道 (channel 9) 不需要 programChange, 返回 null 表示跳过
        // 发送 programChange 到 channel 9 会破坏鼓组模式, 导致鼓音符无声
        if (channel === 9) return null;
        var events = _midiTrackPlayback.events;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (e.track === trackIndex && e.channel === channel && e.type === 'programChange') {
                return e.program;
            }
        }
        // 查找全局该通道的第一个 program
        for (var j = 0; j < events.length; j++) {
            var e2 = events[j];
            if (e2.channel === channel && e2.type === 'programChange') {
                return e2.program;
            }
        }
        return 0;
    }

    function startMidiTrackFallback(events) {
        // 真正需要播放 MIDI 音符时: 按设置触发音色库下载/询问
        ensureSoundfontOnDemand();
        var synth = getTinySynth();
        if (!synth) {
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听。', 'error');
            return;
        }

        _midiTrackPlayback.playing = true;
        _midiTrackPlayback.useWebMidi = false;
        _midiTrackPlayback.backend = 'tinysynth';
        updateMidiTrackPlayerButtons();

        var synthCtx = synth.getAudioContext ? synth.getAudioContext() : null;
        if (!synthCtx) synthCtx = (window.AudioEngine && AudioEngine.getContext) ? AudioEngine.getContext() : null;
        if (!synthCtx) {
            showMidiNotice('音频上下文未就绪，无法试听。', 'error');
            _midiTrackPlayback.playing = false;
            updateMidiTrackPlayerButtons();
            return;
        }
        _midiTrackPlayback.startTime = synthCtx.currentTime;
        _midiTrackPlayback.startTime -= _midiTrackPlayback.pauseTime;

        try { synth.reset(); } catch(ex) {}

        var programsSent = {};
        var batchSizeMs = 100; // 每 100ms 一个批次

        // 不在调度时过滤，所有事件都保留，在批次回调中实时检查静音/独奏状态
        // 这样播放过程中切换静音/独奏会立即生效
        var allEvents = events.slice();

        // 按时间分批次，每批一次性用 Web Audio 精确时间发送
        var batches = [];
        for (var j = 0; j < allEvents.length; j++) {
            var ev = allEvents[j];
            var delayMs = Math.max(0, (ev.time - _midiTrackPlayback.pauseTime) * 1000);
            var batchIdx = Math.floor(delayMs / batchSizeMs);
            if (!batches[batchIdx]) batches[batchIdx] = { baseDelayMs: batchIdx * batchSizeMs, events: [] };
            batches[batchIdx].events.push(ev);
        }

        for (var b = 0; b < batches.length; b++) {
            if (!batches[b]) continue;
            var batch = batches[b];
            var t = setTimeout((function(bt) {
                return function() {
                    if (!_midiTrackPlayback.playing) return;
                    for (var k = 0; k < bt.events.length; k++) {
                        var evt = bt.events[k];
                        // 实时检查静音/独奏状态（noteOff 总是发送，确保被静音的音符能停止）
                        var shouldPlay = midiTrackShouldPlay(evt.track);
                        var delaySec = Math.max(0, evt.time - _midiTrackPlayback.pauseTime);
                        var sendT = _midiTrackPlayback.startTime + delaySec;
                        if (evt.type === 'programChange') {
                            if (!shouldPlay) continue;
                            var progKey = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey]) {
                                try { synth.send([0xC0 | (evt.channel & 0x0F), evt.program & 0x7F], sendT); } catch(ex) {}
                                programsSent[progKey] = true;
                            }
                        } else if (evt.type === 'noteOn') {
                            if (!shouldPlay) continue; // 被静音/独奏过滤的音符不触发
                            var progKey2 = evt.track + '-' + evt.channel;
                            if (!programsSent[progKey2]) {
                                var program2 = findProgramForChannel(evt.track, evt.channel);
                                // channel 9 (鼓组) 返回 null, 跳过 programChange 以保持鼓组模式
                                if (program2 !== null) {
                                    try { synth.send([0xC0 | (evt.channel & 0x0F), program2 & 0x7F], sendT - 0.001); } catch(ex) {}
                                }
                                programsSent[progKey2] = true;
                            }
                            try { synth.send([0x90 | (evt.channel & 0x0F), evt.note & 0x7F, (evt.velocity || 100) & 0x7F], sendT); } catch(ex) {}
                        } else if (evt.type === 'noteOff') {
                            // noteOff 总是发送，防止音符卡住
                            try { synth.send([0x80 | (evt.channel & 0x0F), evt.note & 0x7F, 0], sendT); } catch(ex) {}
                        }
                    }
                };
            })(batch), batch.baseDelayMs);
            _midiTrackPlayback.scheduled.push({ timeout: t });
        }

        function tick() {
            if (!_midiTrackPlayback.playing) return;
            var current = synthCtx.currentTime - _midiTrackPlayback.startTime;
            updateMidiTrackProgressUI(current);
            if (current >= _midiTrackPlayback.duration) {
                stopMidiTrackPlayback();
                _midiTrackPlayback.pauseTime = 0;
                updateMidiTrackProgressUI(0);
                return;
            }
            _midiTrackPlayback.rafId = requestAnimationFrame(tick);
        }
        _midiTrackPlayback.rafId = requestAnimationFrame(tick);

        var endDelay = Math.max(0, (_midiTrackPlayback.duration - _midiTrackPlayback.pauseTime) * 1000) + 300;
        var endT = setTimeout(function() {
            stopMidiTrackPlayback();
        }, endDelay);
        _midiTrackPlayback.scheduled.push({ timeout: endT });
    }

    function pauseMidiTrackPlayback() {
        if (!_midiTrackPlayback.playing) return;
        var ctx = null;
        if (_midiTrackPlayback.useWebMidi) {
            ctx = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext() : null;
        } else {
            var synth = getTinySynth();
            ctx = synth && synth.getAudioContext ? synth.getAudioContext() : null;
            if (!ctx) ctx = AudioEngine && AudioEngine.getContext ? AudioEngine.getContext() : null;
        }
        var now = ctx ? ctx.currentTime : (performance.now() / 1000);
        _midiTrackPlayback.pauseTime = now - _midiTrackPlayback.startTime;
        stopMidiTrackPlayback(false);
        updateMidiTrackProgressUI(_midiTrackPlayback.pauseTime);
    }

    function stopMidiTrackPlayback(reset) {
        if (reset !== false) _midiTrackPlayback.pauseTime = 0;
        _midiTrackPlayback.playing = false;
        if (_midiTrackPlayback.rafId) {
            cancelAnimationFrame(_midiTrackPlayback.rafId);
            _midiTrackPlayback.rafId = null;
        }
        for (var i = 0; i < _midiTrackPlayback.scheduled.length; i++) {
            clearTimeout(_midiTrackPlayback.scheduled[i].timeout);
        }
        _midiTrackPlayback.scheduled = [];
        // 停止播放后立即抬起所有正在响的音符，避免最后一次播放的音符一直延音
        // 根据当前后端发送 All Notes Off / All Sound Off
        stopAllPlaybackNotes();
        _midiTrackPlayback.output = null;
        _midiTrackPlayback.useWebMidi = false;
        if (reset !== false) _midiTrackPlayback.backend = null;
        updateMidiTrackPlayerButtons();
        if (reset !== false) updateMidiTrackProgressUI(0);
    }

    // 向当前播放后端的所有通道发送 All Notes Off / All Sound Off
    // 用于停止播放、暂停、静音切换时抬起正在响的音符
    function stopAllPlaybackNotes(channels) {
        var backend = _midiTrackPlayback.backend;
        var out = _midiTrackPlayback.output;
        // 默认所有 16 个通道
        var chs = channels;
        if (!chs) {
            chs = [];
            for (var c = 0; c < 16; c++) chs.push(c);
        }
        if (backend === 'webmidi' && out) {
            // Web MIDI: 发送 CC 123 (All Notes Off) 和 CC 120 (All Sound Off)
            for (var i = 0; i < chs.length; i++) {
                var ch = chs[i];
                try { out.send([0xB0 | (ch & 0x0F), 123, 0]); } catch(e) {}
                try { out.send([0xB0 | (ch & 0x0F), 120, 0]); } catch(e) {}
            }
        } else if (backend === 'tinysynth') {
            // TinySynth: 使用已有的 stopTinySynthAll（遍历 0-15 调用 allSoundOff）
            // 如果指定了特定通道，只停那些通道
            if (channels) {
                var synth = getTinySynth();
                if (synth) {
                    for (var k = 0; k < chs.length; k++) {
                        try { synth.allSoundOff(chs[k]); } catch(e) {}
                    }
                }
            } else {
                stopTinySynthAll();
            }
        }
    }

    // 八度选择变化时重新计算 Key 微调可用范围
    function bindMidiOctaveKeyChange() {
        var octaveSelects = document.querySelectorAll('#midi-channel-rows .midi-octave-select');
        for (var i = 0; i < octaveSelects.length; i++) {
            (function(select) {
                select.addEventListener('change', function() {
                    var ch = parseInt(select.getAttribute('data-channel'));
                    var minNote = parseInt(select.getAttribute('data-min-note'));
                    var maxNote = parseInt(select.getAttribute('data-max-note'));
                    var octave = parseInt(select.value);
                    var keySelect = document.querySelector('#midi-channel-rows .midi-key-shift-select[data-channel="' + ch + '"]');
                    if (!keySelect) return;
                    var currentKey = parseInt(keySelect.value) || 0;
                    var range = getValidKeyRange(minNote, maxNote, octave);
                    var options = keySelect.querySelectorAll('option');
                    for (var j = 0; j < options.length; j++) {
                        var k = parseInt(options[j].value);
                        options[j].disabled = (k < range.min || k > range.max);
                    }
                    if (currentKey < range.min) keySelect.value = range.min;
                    else if (currentKey > range.max) keySelect.value = range.max;
                    // 更新偏移后音域显示
                    var row = select.closest('tr');
                    if (row) {
                        var mode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
                        updateChannelRangeAfter(row, mode);
                    }
                });
            })(octaveSelects[i]);
        }
        var keySelects = document.querySelectorAll('#midi-channel-rows .midi-key-shift-select');
        for (var j = 0; j < keySelects.length; j++) {
            (function(select) {
                select.addEventListener('change', function() {
                    var row = select.closest('tr');
                    if (row) {
                        var mode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
                        updateChannelRangeAfter(row, mode);
                    }
                });
            })(keySelects[j]);
        }
    }

    // ========== 音色拟合 ==========

    // 音色预览上下文 (Web Audio API)
    var _timbrePreviewCtx = null;
    var _timbrePreviewNodes = [];  // 存储所有 osc + gain, 用于 stopTimbrePreview
    var _timbrePreviewTimeout = null;
    var _activePreviewBtn = null;  // 当前正在播放的按钮

    function getTimbrePreviewCtx() {
        if (!_timbrePreviewCtx) {
            try {
                _timbrePreviewCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch(e) { return null; }
        }
        // 某些浏览器 (尤其是 Chrome) 需要用户交互后才能 resume
        if (_timbrePreviewCtx.state === 'suspended') {
            try { _timbrePreviewCtx.resume(); } catch(e) {}
        }
        return _timbrePreviewCtx;
    }

    function stopTimbrePreview() {
        if (_timbrePreviewTimeout) { clearTimeout(_timbrePreviewTimeout); _timbrePreviewTimeout = null; }
        for (var i = 0; i < _timbrePreviewNodes.length; i++) {
            var node = _timbrePreviewNodes[i];
            if (!node) continue;
            if (node.osc) { try { node.osc.stop(); } catch(e) {} }
            if (node.gain) { try { node.gain.disconnect(); } catch(e) {} }
            if (node.noteOff) { try { node.noteOff(); } catch(e) {} }
            if (node.synth && node.synthNoteOff) { try { node.synthNoteOff(); } catch(e) {} }
        }
        _timbrePreviewNodes = [];
        stopTinySynthAll();
        if (_activePreviewBtn) {
            _activePreviewBtn.classList.remove('playing');
            _activePreviewBtn = null;
        }
    }

    function previewTimbreNote(instrument, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var ctx = getTimbrePreviewCtx();
        if (!ctx) return;
        var freq = 440 * Math.pow(2, (midiNote - 69) / 12);

        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        // 波形选择 (模拟不同乐器)
        if (instrument === 0) { osc.type = 'sine'; }
        else if (instrument === 1) { osc.type = 'sine'; }
        else if (instrument === 2) { osc.type = 'sine'; }
        else if (instrument === 3) { osc.type = 'sine'; }
        else if (instrument === 4) { osc.type = 'sine'; }
        else if (instrument === 5) { osc.type = 'square'; }
        else if (instrument === 6) { osc.type = 'triangle'; }
        else if (instrument === 7) { osc.type = 'sine'; }
        else if (instrument === 8) { osc.type = 'sine'; }
        else if (instrument === 9) { osc.type = 'sawtooth'; }
        else if (instrument === 10) { osc.type = 'sine'; }
        else if (instrument === 11) { osc.type = 'sine'; }
        else if (instrument === 12) { osc.type = 'sine'; }
        else if (instrument === 13) { osc.type = 'sine'; }
        else if (instrument === 14) { osc.type = 'sine'; }
        else if (instrument === 15) { osc.type = 'sine'; }
        else { osc.type = 'sine'; }

        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.3);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.8);

        _timbrePreviewNodes.push({ osc: osc, gain: gain });
        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 850);
    }

    // 试听 MIDI 原音：优先 Web MIDI 设备，不可用则使用 TinySynth，严格遵循原乐器/音符
    function previewMidiNote(channel, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var row = btn ? btn.closest('tr') : null;
        var program = 0;
        if (row) {
            var infoAttr = row.getAttribute('data-program');
            if (infoAttr) program = parseInt(infoAttr) || 0;
        }

        // Web MIDI 可用时直接输出原 MIDI 音色
        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(function(access) {
                var outputs = access.outputs;
                if (outputs && outputs.size > 0) {
                    var output = outputs.values().next().value;
                    var ch = (channel || 0) & 0x0F;
                    try { output.send([0xC0 | ch, program & 0x7F]); } catch(e) {}
                    try { output.send([0x90 | ch, midiNote & 0x7F, 100]); } catch(e) {}
                    _timbrePreviewNodes.push({
                        noteOff: function() {
                            try { output.send([0x80 | ch, midiNote & 0x7F, 0]); } catch(e) {}
                        }
                    });
                    _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
                    return;
                }
                previewMidiNoteTinySynth(channel, midiNote, program);
            }).catch(function() {
                previewMidiNoteTinySynth(channel, midiNote, program);
            });
        } else {
            previewMidiNoteTinySynth(channel, midiNote, program);
        }
    }

    function previewMidiNoteTinySynth(channel, midiNote, program) {
        var synth = getTinySynth();
        if (!synth) {
            if (_activePreviewBtn) _activePreviewBtn.classList.remove('playing');
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。', 'error');
            return;
        }
        var ch = prepareTinySynthProgram(synth, channel, program);
        try { synth.noteOn(ch, midiNote & 0x7F, 100); } catch(e) {}
        _timbrePreviewNodes.push({
            synth: synth,
            synthNoteOff: function() {
                try { synth.noteOff(ch, midiNote & 0x7F); } catch(e) {}
            }
        });
        _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
    }

    // 试听打击乐 MIDI 原音：在通道 9 播放原始鼓音符
    function previewMidiPercussion(drumNote, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');
        // 这里忽略用户选择的 midiNote（那是给 NBS 组合试听用的），使用原鼓音符 drumNote
        var playNote = (drumNote !== undefined && drumNote !== null) ? drumNote : midiNote;

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(function(access) {
                var outputs = access.outputs;
                if (outputs && outputs.size > 0) {
                    var output = outputs.values().next().value;
                    try { output.send([0x99, playNote & 0x7F, 100]); } catch(e) {}
                    _timbrePreviewNodes.push({
                        noteOff: function() {
                            try { output.send([0x89, playNote & 0x7F, 0]); } catch(e) {}
                        }
                    });
                    _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
                    return;
                }
                previewMidiPercussionTinySynth(playNote);
            }).catch(function() {
                previewMidiPercussionTinySynth(playNote);
            });
        } else {
            previewMidiPercussionTinySynth(playNote);
        }
    }

    function previewMidiPercussionTinySynth(drumNote) {
        var synth = getTinySynth();
        if (!synth) {
            if (_activePreviewBtn) _activePreviewBtn.classList.remove('playing');
            showMidiNotice('浏览器不支持 Web MIDI，且 TinySynth 未加载，无法试听原音色。', 'error');
            return;
        }
        try { synth.noteOn(9, drumNote & 0x7F, 100); } catch(e) {}
        _timbrePreviewNodes.push({
            synth: synth,
            synthNoteOff: function() {
                try { synth.noteOff(9, drumNote & 0x7F); } catch(e) {}
            }
        });
        _timbrePreviewTimeout = setTimeout(stopTimbrePreview, 900);
    }

    // 创建固定默认混响 (Convolution impulse)
    var _timbreReverbNode = null;
    function getTimbreReverbNode(ctx) {
        if (_timbreReverbNode) return _timbreReverbNode;
        try {
            var convolver = ctx.createConvolver();
            var rate = ctx.sampleRate;
            var length = Math.floor(rate * 1.2); // 1.2 秒混响
            var impulse = ctx.createBuffer(2, length, rate);
            for (var c = 0; c < 2; c++) {
                var data = impulse.getChannelData(c);
                for (var i = 0; i < length; i++) {
                    // 指数衰减白噪声
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
                }
            }
            convolver.buffer = impulse;
            var wetGain = ctx.createGain();
            wetGain.gain.value = 0.35; // 混响强度
            convolver.connect(wetGain);
            wetGain.connect(ctx.destination); // 湿声一次性连到输出
            _timbreReverbNode = { input: convolver, output: wetGain };
            return _timbreReverbNode;
        } catch(e) { return null; }
    }

    // 播放 NBS 组合音色和弦 (带固定混响)
    function previewTimbreChordWithReverb(instruments, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var ctx = getTimbrePreviewCtx();
        if (!ctx) return;

        var baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12);
        var reverb = getTimbreReverbNode(ctx);

        var playedCount = 0;
        for (var idx = 0; idx < instruments.length; idx++) {
            var instrument = instruments[idx];
            if (instrument < 0 || instrument === undefined) continue;

            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            if (reverb) gain.connect(reverb.input);

            // 与 previewTimbreChord 相同的波形映射
            if (instrument === 0) { osc.type = 'sine'; }
            else if (instrument === 1) { osc.type = 'triangle'; }
            else if (instrument === 2) { osc.type = 'sine'; }
            else if (instrument === 3) { osc.type = 'square'; }
            else if (instrument === 4) { osc.type = 'triangle'; }
            else if (instrument === 5) { osc.type = 'sawtooth'; }
            else if (instrument === 6) { osc.type = 'sine'; }
            else if (instrument === 7) { osc.type = 'triangle'; }
            else if (instrument === 8) { osc.type = 'sine'; }
            else if (instrument === 9) { osc.type = 'triangle'; }
            else if (instrument === 10) { osc.type = 'triangle'; }
            else if (instrument === 11) { osc.type = 'sawtooth'; }
            else if (instrument === 12) { osc.type = 'sine'; }
            else if (instrument === 13) { osc.type = 'square'; }
            else if (instrument === 14) { osc.type = 'triangle'; }
            else if (instrument === 15) { osc.type = 'sine'; }
            else { osc.type = 'sine'; }

            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.02);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.1);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.15);

            _timbrePreviewNodes.push({ osc: osc, gain: gain });
            playedCount++;
        }

        if (playedCount === 0) {
            if (btn) btn.classList.remove('playing');
            return;
        }

        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 1300);
    }

    // 图标数组：slot 按钮文字左侧显示的小图标 (不加边框/发光/阴影)
    function getInstrumentIconHtml(instIndex) {
        var idx = parseInt(instIndex);
        if (isNaN(idx) || idx < 0) return '<span class="timbre-slot-icon timbre-slot-icon-none">-</span>';
        return '<img class="timbre-slot-icon" src="static/sprites/spr_instrumenticons/inst_' + idx + '.png" alt="">';
    }

    // 从 localStorage 读取/保存音色拟合设置
    var TIMBRE_FITTING_KEY = 'webnbs_timbre_fitting_v1';
    function loadSavedTimbreFitting() {
        try {
            var raw = localStorage.getItem(TIMBRE_FITTING_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                return { programs: parsed.programs || {}, drums: parsed.drums || {} };
            }
        } catch (e) {}
        return { programs: {}, drums: {} };
    }
    function saveTimbreFitting(programs, drums) {
        try {
            localStorage.setItem(TIMBRE_FITTING_KEY, JSON.stringify({ programs: programs, drums: drums }));
        } catch (e) {}
    }
    function getSavedFittingSlots(saved, program, drumNote) {
        if (drumNote !== null && drumNote !== undefined && saved.drums[drumNote] !== undefined) {
            return saved.drums[drumNote];
        }
        if (program !== null && program !== undefined && saved.programs[program] !== undefined) {
            return saved.programs[program];
        }
        return null;
    }

function buildTimbreFittingRows(info) {
        var savedFitting = loadSavedTimbreFitting();
        state._midiTimbreFittingSaved = savedFitting;

        // 收集旋律通道行
        var melodyRows = [];
        if (info.channels && info.channels.length) {
            for (var ci = 0; ci < info.channels.length; ci++) {
                var chInfo = info.channels[ci];
                if (chInfo.is_percussion) continue;
                if ((chInfo.note_count || 0) > 0) {
                    melodyRows.push({
                        type: 'melody',
                        channel: chInfo.channel,
                        program: chInfo.program,
                        name: chInfo.program_name || ('乐器 ' + chInfo.program),
                        noteCount: chInfo.note_count,
                        defaultInstrument: chInfo.default_instrument !== undefined ? chInfo.default_instrument : 0,
                        defaultOctave: chInfo.default_octave || 0
                    });
                }
            }
        }
        melodyRows.sort(function(a, b) {
            return (a.channel - b.channel) || ((a.program || 0) - (b.program || 0));
        });

        // 收集打击乐行
        var percussionRows = [];
        if (info.percussion && info.percussion.length) {
            for (var pi = 0; pi < info.percussion.length; pi++) {
                var pInfo = info.percussion[pi];
                percussionRows.push({
                    type: 'percussion',
                    channel: 9,
                    drumNote: pInfo.note,
                    name: pInfo.name || ('鼓 ' + pInfo.note),
                    noteCount: 1,
                    defaultInstrument: pInfo.default_instrument !== undefined ? pInfo.default_instrument : 0,
                    defaultPitch: pInfo.default_pitch
                });
            }
        }
        percussionRows.sort(function(a, b) {
            return (a.drumNote || 0) - (b.drumNote || 0);
        });

        var melodyTbody = $('midi-timbre-melody-rows');
        if (melodyTbody) {
            melodyTbody.innerHTML = '';
            buildTimbreRowsForTbody(melodyTbody, melodyRows, savedFitting);
        }
        var percussionTbody = $('midi-timbre-percussion-rows');
        if (percussionTbody) {
            percussionTbody.innerHTML = '';
            buildTimbreRowsForTbody(percussionTbody, percussionRows, savedFitting);
        }
        // 初始化拟合表的禁用状态（排除的 channel 行显示为只读）
        updateTimbreFittingDisabled();
    }

    function buildTimbreRowsForTbody(tbody, rowsData, savedFitting) {
        if (!tbody) return;
        // 试听音高选项, 默认 C5 (72)
        var pitchOptions = '';
        for (var p = 60; p <= 84; p += 4) {
            var selected = (p === 72) ? ' selected' : '';
            pitchOptions += '<option value="' + p + '"' + selected + '>' + MIDI_NOTE_NAMES[p] + '</option>';
        }

        for (var j = 0; j < rowsData.length; j++) {
            var rowData = rowsData[j];
            var isPercussion = rowData.type === 'percussion';
            var idKey = isPercussion ? (rowData.drumNote || 0) : (rowData.program || 0);
            var savedSlots = getSavedFittingSlots(savedFitting, isPercussion ? null : idKey, isPercussion ? idKey : null);
            var defaultSlots = savedSlots || [rowData.defaultInstrument, -1, -1];

            var row = document.createElement('tr');
            row.className = 'timbre-main-row';
            if (isPercussion) {
                row.setAttribute('data-percussion', idKey);
                row.setAttribute('data-type', 'percussion');
            } else {
                row.setAttribute('data-channel', rowData.channel);
                row.setAttribute('data-program', idKey);
                row.setAttribute('data-type', 'melody');
            }

            // 乐器名称列
            var nameCell = document.createElement('td');
            var subText = isPercussion
                ? ('鼓音符 ' + idKey + ' · ' + rowData.name)
                : ('通道 ' + rowData.channel + ' · ' + rowData.noteCount + ' 音符');
            nameCell.innerHTML = '<span class="midi-inst-name">' + escapeHTML(rowData.name) + '</span>' +
                '<span class="midi-inst-sub">' + escapeHTML(subText) + '</span>';
            row.appendChild(nameCell);

            // MIDI 原音试听列
            var previewMidiCell = document.createElement('td');
            var midiBtnAttr = isPercussion ? ('data-percussion="' + idKey + '"') : ('data-channel="' + rowData.channel + '" data-program="' + idKey + '"');
            previewMidiCell.innerHTML = '<div class="timbre-preview-wrap">'
                + '<button class="timbre-preview-btn timbre-preview-midi" title="试听 MIDI 原音" ' + midiBtnAttr + '><i class="fa-solid fa-music"></i></button>'
                + '<select class="timbre-pitch-select" ' + (isPercussion ? ('data-percussion="' + idKey + '"') : ('data-channel="' + rowData.channel + '"')) + '>' + pitchOptions + '</select>'
                + '</div>';
            row.appendChild(previewMidiCell);

            // NBS 组合试听按钮列
            var previewNbsCell = document.createElement('td');
            previewNbsCell.innerHTML = '<button class="timbre-preview-btn timbre-preview-nbs" title="试听 NBS 组合音" ' + midiBtnAttr + '><i class="fa-solid fa-layer-group"></i></button>';
            row.appendChild(previewNbsCell);

            // 音色槽
            var slotAttr = isPercussion ? ('data-percussion="' + idKey + '"') : ('data-channel="' + rowData.channel + '"');
            for (var s = 0; s < 3; s++) {
                var slotVal = defaultSlots[s];
                if (slotVal === undefined || slotVal === null || isNaN(slotVal)) slotVal = -1;
                var slotCell = document.createElement('td');
                var displayName = slotVal >= 0 ? INSTRUMENT_NAMES[slotVal] : '无';
                slotCell.innerHTML = '<input type="hidden" class="timbre-slot" ' + slotAttr + ' data-slot="' + (s + 1) + '" value="' + slotVal + '">'
                    + '<div class="timbre-slot-btn" ' + slotAttr + ' data-slot="' + (s + 1) + '">' + getInstrumentIconHtml(slotVal) + '<span class="timbre-slot-text">' + displayName + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i></div>';
                row.appendChild(slotCell);
            }

            tbody.appendChild(row);
        }

        // 绑定试听 MIDI 原音按钮
        var midiPreviewBtns = tbody.querySelectorAll('.timbre-preview-midi');
        for (var n = 0; n < midiPreviewBtns.length; n++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var pitchSelect = row.querySelector('.timbre-pitch-select');
                    var midiNote = pitchSelect ? parseInt(pitchSelect.value) : 72;
                    var isPerc = row.getAttribute('data-type') === 'percussion';
                    if (isPerc) {
                        var drumNote = parseInt(row.getAttribute('data-percussion'));
                        previewMidiPercussion(drumNote, midiNote, btn);
                    } else {
                        var ch = parseInt(btn.getAttribute('data-channel'));
                        previewMidiNote(ch, midiNote, btn);
                    }
                });
            })(midiPreviewBtns[n]);
        }

        // 绑定试听 NBS 组合按钮
        var nbsPreviewBtns = tbody.querySelectorAll('.timbre-preview-nbs');
        for (var m = 0; m < nbsPreviewBtns.length; m++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var pitchSelect = row.querySelector('.timbre-pitch-select');
                    var midiNote = pitchSelect ? parseInt(pitchSelect.value) : 72;
                    var slots = row.querySelectorAll('.timbre-slot');
                    var instruments = [];
                    for (var si = 0; si < slots.length; si++) {
                        instruments.push(parseInt(slots[si].value));
                    }
                    previewNbsCombination(instruments, midiNote, btn);
                });
            })(nbsPreviewBtns[m]);
        }

        // 绑定音色槽右键菜单
        var slotBtns = tbody.querySelectorAll('.timbre-slot-btn');
        for (var s = 0; s < slotBtns.length; s++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var isPerc = row.getAttribute('data-type') === 'percussion';
                    var channel = isPerc ? null : parseInt(btn.getAttribute('data-channel'));
                    var percussionNote = isPerc ? parseInt(btn.getAttribute('data-percussion')) : null;
                    var slotNum = parseInt(btn.getAttribute('data-slot'));
                    showTimbreSlotMenu(btn, channel, slotNum, percussionNote);
                });
                btn.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var row = btn.closest('tr');
                    var isPerc = row.getAttribute('data-type') === 'percussion';
                    var channel = isPerc ? null : parseInt(btn.getAttribute('data-channel'));
                    var percussionNote = isPerc ? parseInt(btn.getAttribute('data-percussion')) : null;
                    var slotNum = parseInt(btn.getAttribute('data-slot'));
                    showTimbreSlotMenu(btn, channel, slotNum, percussionNote);
                });
            })(slotBtns[s]);
        }
    }

    // 显示音色槽右键菜单
    // channel: 旋律通道号; percussionNote: 鼓音符(非打击乐为 null)
    function showTimbreSlotMenu(anchorEl, channel, slotNum, percussionNote) {
        var existing = $('timbre-slot-menu');
        if (existing) existing.remove();

        var currentValue = -1;
        var slotInput;
        if (percussionNote !== null && percussionNote !== undefined) {
            slotInput = document.querySelector('.timbre-slot[data-percussion="' + percussionNote + '"][data-slot="' + slotNum + '"]');
        } else {
            slotInput = document.querySelector('.timbre-slot[data-channel="' + channel + '"][data-slot="' + slotNum + '"]');
        }
        if (slotInput) currentValue = parseInt(slotInput.value);

        var menu = document.createElement('div');
        menu.id = 'timbre-slot-menu';
        menu.className = 'timbre-slot-menu';

        var names = INSTRUMENT_NAMES;
        var colors = (window.NOTE_COLORS && window.NOTE_COLORS.length >= 20) ? window.NOTE_COLORS : ['#d4a96a','#8b5a2b','#c84b3c','#f0e68c','#dcdcdc','#6b8e23','#87ceeb','#fffacd','#fff0f5','#ffb6c1','#b0c4de','#daa520','#cd853f','#ffd700','#cd5c5c','#e6e6fa','#c46b3d','#8b6f47','#5c8b5c','#3d7a6b'];

        // 如果是 slot 2 或 3，添加"无"选项
        if (slotNum > 1) {
            var noneItem = document.createElement('div');
            noneItem.className = 'timbre-menu-item';
            noneItem.innerHTML = '<span class="timbre-menu-icon timbre-menu-icon-none">-</span><span style="color:#888;font-style:italic;">无</span>';
            noneItem.addEventListener('click', function(e) {
                selectTimbreSlot(channel, slotNum, -1, '无', percussionNote);
                menu.remove();
                e.stopPropagation();
            });
            menu.appendChild(noneItem);
        }

        for (var i = 0; i < names.length; i++) {
            var item = document.createElement('div');
            var isSelected = (currentValue === i);
            item.className = 'timbre-menu-item' + (isSelected ? ' selected' : '');
            item.innerHTML = '<span class="timbre-menu-icon" style="background:' + colors[i] + ';">'
                + '<img src="static/sprites/spr_instrumenticons/inst_' + i + '.png" alt="" />'
                + (isSelected ? '<span class="timbre-menu-check"><i class="fa-solid fa-check"></i></span>' : '')
                + '</span><span>' + names[i] + '</span>';
            item.addEventListener('click', (function(instIndex, instName) {
                return function(e) {
                    selectTimbreSlot(channel, slotNum, instIndex, instName, percussionNote);
                    menu.remove();
                    e.stopPropagation();
                };
            })(i, names[i]));
            menu.appendChild(item);
        }

        document.body.appendChild(menu);

        // 智能计算尺寸与位置
        var rect = anchorEl.getBoundingClientRect();
        var winHeight = window.innerHeight;
        var winWidth = window.innerWidth;
        var margin = 8;
        var naturalHeight = menu.scrollHeight;
        var menuWidth = Math.max(menu.offsetWidth, 150);

        // 垂直可用空间
        var spaceBelow = winHeight - rect.bottom - margin;
        var spaceAbove = rect.top - margin;
        var preferredHeight = Math.min(naturalHeight, 260);

        // 如果空间紧张, 使用紧凑模式并进一步限制高度
        var compact = false;
        if (Math.max(spaceBelow, spaceAbove) < 220 || naturalHeight > Math.max(spaceBelow, spaceAbove)) {
            compact = true;
            menu.classList.add('compact');
            preferredHeight = Math.min(menu.scrollHeight, Math.max(spaceBelow, spaceAbove) - margin, 220);
        }
        preferredHeight = Math.max(preferredHeight, 80); // 至少显示几行

        // 默认放下方, 放不下则放上方
        var menuY = rect.bottom + 4;
        if (menuY + preferredHeight > winHeight - margin && spaceAbove > spaceBelow) {
            menuY = rect.top - preferredHeight - 4;
        }

        // 水平边界
        var menuX = rect.left;
        if (menuX + menuWidth > winWidth - margin) {
            menuX = winWidth - menuWidth - margin;
        }
        if (menuX < margin) menuX = margin;
        if (menuY < margin) menuY = margin;
        if (menuY + preferredHeight > winHeight - margin) {
            preferredHeight = winHeight - margin - menuY;
        }

        menu.style.left = menuX + 'px';
        menu.style.top = menuY + 'px';
        menu.style.maxHeight = preferredHeight + 'px';
        menu.style.width = menuWidth + 'px';
        menu.style.transform = 'none';
        window.WebNBSPositionFlyout(menu, rect, {
            placement: menuY < rect.top ? 'top-start' : 'bottom-start',
            maxHeight: preferredHeight
        });

        // 播放选中音色的预览音效 (使用 MIDI 音调)
        if (window.AudioEngine && AudioEngine.playNote && currentValue >= 0) {
            var row = slotInput ? slotInput.closest('tr') : null;
            var pitchSelect = row ? row.querySelector('.timbre-pitch-select') : null;
            var previewPitch = pitchSelect ? parseInt(pitchSelect.value) : 60;
            AudioEngine.playNote(currentValue, previewPitch, 70);
        }

        // 点击其他地方关闭菜单
        var closeMenu = function(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(function() {
            document.addEventListener('click', closeMenu);
        }, 10);
    }

    // 选择音色槽后更新 UI, 保存到 localStorage, 并立即播放单个 NBS 音色音符 (使用 MIDI 音调)
    function selectTimbreSlot(channel, slotNum, value, displayName, percussionNote) {
        var selector;
        if (percussionNote !== null && percussionNote !== undefined) {
            selector = '[data-percussion="' + percussionNote + '"]';
        } else {
            selector = '[data-channel="' + channel + '"]';
        }
        var slotInput = document.querySelector('.timbre-slot' + selector + '[data-slot="' + slotNum + '"]');
        var slotBtn = document.querySelector('.timbre-slot-btn' + selector + '[data-slot="' + slotNum + '"]');
        if (slotInput) slotInput.value = value;
        if (slotBtn) {
            slotBtn.innerHTML = getInstrumentIconHtml(value) + '<span class="timbre-slot-text">' + displayName + '</span> <i class="fa-solid fa-caret-up" style="opacity:0.5;font-size:10px;"></i>';
        }

        // 保存设置到 localStorage
        var row = slotInput ? slotInput.closest('tr') : null;
        var isPercussion = row ? (row.getAttribute('data-type') === 'percussion') : (percussionNote !== null && percussionNote !== undefined);
        var saved = state._midiTimbreFittingSaved || loadSavedTimbreFitting();
        var idKey = isPercussion ? parseInt(row ? row.getAttribute('data-percussion') : percussionNote) : parseInt(row ? row.getAttribute('data-program') : channel);
        var slotsKey = isPercussion ? 'drums' : 'programs';
        if (!saved[slotsKey][idKey]) saved[slotsKey][idKey] = [-1, -1, -1];
        saved[slotsKey][idKey][slotNum - 1] = value;
        state._midiTimbreFittingSaved = saved;
        saveTimbreFitting(saved.programs, saved.drums);

        // 立即播放单个 NBS 音色音符 (使用该行选择的 MIDI 音调)
        var pitchSelect = row ? row.querySelector('.timbre-pitch-select') : null;
        var midiNote = pitchSelect ? parseInt(pitchSelect.value) : 60;
        if (value >= 0) {
            var nbsKey = Math.max(0, Math.min(87, midiNote - 21));
            if (window.AudioEngine && AudioEngine.playNote) {
                AudioEngine.playNote(value, nbsKey, 80);
            } else {
                previewTimbreNote(value, midiNote, slotBtn);
            }
        }

        // 同步通道映射表: 更新 NBS 乐器列显示和偏移后音域
        // (slot1 是替代链的起点乐器, 变化后影响偏移和替代结果)
        if (!isPercussion && slotNum === 1) {
            fillChannelInstrumentNames();
            var _curMode = $('midi-octave-mode') ? (parseInt($('midi-octave-mode').value) || 0) : 0;
            if (_curMode === 2 || _curMode === 3) {
                updateChannelOctaveForMode(_curMode);
            }
            updateOctaveModeHint(_curMode);
        }
    }

    // 试听 NBS 组合: 同时播放选中的 NBS 乐器 (使用真实 NBS 样本)
    // instruments: [inst1, inst2, inst3] 中 -1 表示"无"槽
    // midiNote: 音调 (沿用 midi 弹窗左侧选择, 默认 C5)
    function previewNbsCombination(instruments, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        if (!window.AudioEngine || !AudioEngine.playNote) return;

        var nbsKey = Math.max(0, Math.min(87, (midiNote || 72) - 21));
        var played = 0;
        for (var i = 0; i < instruments.length; i++) {
            var inst = instruments[i];
            if (inst === undefined || inst < 0) continue;
            AudioEngine.playNote(inst, nbsKey, 80);
            played++;
        }

        if (played === 0) {
            if (btn) btn.classList.remove('playing');
            return;
        }

        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 500);
    }

    // 播放组合音色和弦 (旧版 Web Audio 合成, 保留供 fallback 使用)
    // instruments: [inst1, inst2, inst3] 中 -1 表示"无"槽
    // midiNote: 音调 (沿用 midi 弹窗左侧选择)
    function previewTimbreChord(instruments, midiNote, btn) {
        stopTimbrePreview();
        _activePreviewBtn = btn;
        if (btn) btn.classList.add('playing');

        var ctx = getTimbrePreviewCtx();
        if (!ctx) return;

        var baseFreq = 440 * Math.pow(2, (midiNote - 69) / 12);

        var playedCount = 0;
        for (var idx = 0; idx < instruments.length; idx++) {
            var instrument = instruments[idx];
            if (instrument < 0 || instrument === undefined) continue; // 跳过"无"槽

            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            // 根据 NBS 乐器类型选择波形 (与 _timbrePreviewChord 旧版相同, 让各音色有辨识度)
            if (instrument === 0) { osc.type = 'sine'; }           // 钢琴
            else if (instrument === 1) { osc.type = 'triangle'; }  // 低音提琴
            else if (instrument === 2) { osc.type = 'sine'; }     // 低音鼓
            else if (instrument === 3) { osc.type = 'square'; }    // 小军鼓 (用方波代替 noise, browser 兼容)
            else if (instrument === 4) { osc.type = 'triangle'; } // 击打声
            else if (instrument === 5) { osc.type = 'sawtooth'; }  // 吉他
            else if (instrument === 6) { osc.type = 'sine'; }     // 长笛
            else if (instrument === 7) { osc.type = 'triangle'; } // 钟琴
            else if (instrument === 8) { osc.type = 'sine'; }     // 风铃
            else if (instrument === 9) { osc.type = 'triangle'; } // 木琴
            else if (instrument === 10) { osc.type = 'triangle'; } // 铁木琴
            else if (instrument === 11) { osc.type = 'sawtooth'; } // 牛铃
            else if (instrument === 12) { osc.type = 'sine'; }    // 迪吉里杜管
            else if (instrument === 13) { osc.type = 'square'; }  // 芯片音
            else if (instrument === 14) { osc.type = 'triangle'; } // 班卓琴
            else if (instrument === 15) { osc.type = 'sine'; }    // 电钢琴
            else { osc.type = 'sine'; }

            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.02);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.0);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.05);

            _timbrePreviewNodes.push({ osc: osc, gain: gain });
            playedCount++;
        }

        if (playedCount === 0) {
            // 全是"无"槽, 恢复按钮状态
            if (btn) btn.classList.remove('playing');
            return;
        }

        // 1.2 秒后恢复按钮状态
        _timbrePreviewTimeout = setTimeout(function() {
            stopTimbrePreview();
        }, 1200);
    }

    // 收集音色拟合设置
    // 返回 { channels: {channel: [slot1,slot2,slot3]}, drums: {drumNote: [slot1,slot2,slot3]} }
    function collectTimbreFitting() {
        var result = { channels: {}, drums: {} };
        var rows = document.querySelectorAll('#midi-timbre-melody-rows tr, #midi-timbre-percussion-rows tr');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var isPercussion = row.getAttribute('data-type') === 'percussion';
            var slots = row.querySelectorAll('.timbre-slot');
            var instruments = [];
            for (var j = 0; j < slots.length; j++) {
                instruments.push(parseInt(slots[j].value));
            }
            // 只收集至少有 slot1 设置了的 (不是 -1 的都算)
            if (instruments[0] < 0) continue;
            if (isPercussion) {
                var drumNote = parseInt(row.getAttribute('data-percussion'));
                result.drums[drumNote] = instruments;
            } else {
                var ch = parseInt(row.getAttribute('data-channel'));
                result.channels[ch] = instruments;
            }
        }
        return result;
    }

    function collectMidiSettings() {
        var settings = {
            channel_instruments: {},  // 留空，服务端默认强制使用拟合
            channel_octaves: {},
            channel_keys: {},
            percussion_instruments: {},
            percussion_pitches: {},
            remove_silent: $('midi-remove-silent') ? $('midi-remove-silent').checked : true,
            name_layers: $('midi-name-layers') ? $('midi-name-layers').checked : true,
            name_after_patches: true,
            same_tempo: true,
            tempo_changes: $('midi-tempo-changes') ? $('midi-tempo-changes').checked : false,
            read_velocity: $('midi-read-velocity') ? $('midi-read-velocity').checked : true,
            precision: $('midi-precision') ? parseInt($('midi-precision').value) : 1,
            keep_note_length: $('midi-keep-note-length') ? $('midi-keep-note-length').value : 'none',
            sustain_tracks: _sustainTrackIndices.slice(),
            snap_enabled: $('midi-snap-enabled') ? $('midi-snap-enabled').checked : false,
            snap_beat: $('midi-snap-beat') ? parseInt($('midi-snap-beat').value) : 4,
            // 音域处理模式: 0=不应用, 1=单独音符归一法, 2=整体八度偏移法, 3=整体半音偏移法
            octave_mode: $('midi-octave-mode') ? parseInt($('midi-octave-mode').value) || 0 : 0,
            // 智能音色替代开关 (仅在模式 2/3 下有效, 模式 0/1 灰显无效)
            smart_substitute_enabled: $('midi-smart-substitute') ? $('midi-smart-substitute').checked : true,
        };

        // 收集音色替代配置
        var substConfig = loadSubstituteConfig();
        settings.substitute_config = substConfig;
        settings.substitute_tracks = _substituteSelectedTracks
            ? Object.keys(_substituteSelectedTracks).filter(function(k) { return _substituteSelectedTracks[k]; }).map(function(k) { return parseInt(k); })
            : null; // null = 全部应用

        // 模式 0/1 下强制关闭智能替代 (灰显无效)
        if (settings.octave_mode !== 2 && settings.octave_mode !== 3) {
            settings.smart_substitute_enabled = false;
        }

        // 收集命名模式
        var nameModeRadios = document.getElementsByName('midi-name-mode');
        for (var i = 0; i < nameModeRadios.length; i++) {
            if (nameModeRadios[i].checked) {
                settings.name_after_patches = (nameModeRadios[i].value === 'patches');
            }
        }

        // 收集通道八度偏移与 key 微调（NBS 乐器强制使用拟合，不再单独选择）
        var octSelects = document.querySelectorAll('#midi-channel-rows .midi-octave-select');
        for (var k = 0; k < octSelects.length; k++) {
            var s = octSelects[k];
            var ch = parseInt(s.getAttribute('data-channel'));
            settings.channel_octaves[ch] = parseInt(s.value);
        }
        var keySelects = document.querySelectorAll('#midi-channel-rows .midi-key-shift-select');
        for (var kk = 0; kk < keySelects.length; kk++) {
            var ks = keySelects[kk];
            var ch = parseInt(ks.getAttribute('data-channel'));
            settings.channel_keys[ch] = parseInt(ks.value);
        }

        // 收集强制归位设置 (全局 checkbox, 仅模式 2/3 有效)
        settings.force_fold_enabled = $('midi-force-fold') ? $('midi-force-fold').checked : false;

        // 收集打击乐映射
        var percInstSelects = document.querySelectorAll('.midi-perc-instrument-select');
        for (var p = 0; p < percInstSelects.length; p++) {
            var ps = percInstSelects[p];
            var note = parseInt(ps.getAttribute('data-perc'));
            settings.percussion_instruments[note] = parseInt(ps.value);
        }
        var percPitchSelects = document.querySelectorAll('.midi-perc-pitch-select');
        for (var q = 0; q < percPitchSelects.length; q++) {
            var pp = percPitchSelects[q];
            var note = parseInt(pp.getAttribute('data-note'));
            settings.percussion_pitches[note] = parseInt(pp.value);
        }

        // 记住设置
        if ($('midi-remember') && $('midi-remember').checked) {
            try {
                var saved = {
                    remove_silent: settings.remove_silent,
                    name_layers: settings.name_layers,
                    name_after_patches: settings.name_after_patches,
                    tempo_changes: settings.tempo_changes,
                    octave_mode: settings.octave_mode,
                    force_fold_enabled: settings.force_fold_enabled,
                    smart_substitute_enabled: settings.smart_substitute_enabled,
                    read_velocity: settings.read_velocity,
                    precision: settings.precision,
                    keep_note_length: settings.keep_note_length,
                    sustain_track_indices: (settings.sustain_tracks || []).slice(),
                    snap_enabled: settings.snap_enabled,
                    snap_beat: settings.snap_beat,
                };
                localStorage.setItem('midi_import_settings', JSON.stringify(saved));
            } catch(e) {}
        }

        // 收集音色拟合设置
        settings.timbre_fitting = collectTimbreFitting();

        // 收集排除生成的 MIDI 轨道
        settings.excluded_tracks = [];
        for (var idx in _midiTrackStates) {
            if (_midiTrackStates[idx].excluded) {
                settings.excluded_tracks.push(parseInt(idx));
            }
        }

        return settings;
    }

    function loadMidiSettings() {
        try {
            var saved = JSON.parse(localStorage.getItem('midi_import_settings'));
            if (saved) {
                if (saved.remove_silent !== undefined && $('midi-remove-silent')) $('midi-remove-silent').checked = saved.remove_silent;
                if (saved.name_layers !== undefined && $('midi-name-layers')) $('midi-name-layers').checked = saved.name_layers;
                if (saved.name_after_patches !== undefined) {
                    var val = saved.name_after_patches ? 'patches' : 'channels';
                    var radios = document.getElementsByName('midi-name-mode');
                    for (var i = 0; i < radios.length; i++) {
                        radios[i].checked = (radios[i].value === val);
                    }
                }
                if (saved.tempo_changes !== undefined && $('midi-tempo-changes')) $('midi-tempo-changes').checked = saved.tempo_changes;
                if (saved.octave_mode !== undefined && $('midi-octave-mode')) $('midi-octave-mode').value = saved.octave_mode;
                if (saved.force_fold_enabled !== undefined && $('midi-force-fold')) $('midi-force-fold').checked = saved.force_fold_enabled;
                if (saved.smart_substitute_enabled !== undefined && $('midi-smart-substitute')) $('midi-smart-substitute').checked = saved.smart_substitute_enabled;
                if (saved.read_velocity !== undefined && $('midi-read-velocity')) $('midi-read-velocity').checked = saved.read_velocity;
                if (saved.precision !== undefined && $('midi-precision')) $('midi-precision').value = saved.precision;
                if (saved.keep_note_length !== undefined && $('midi-keep-note-length')) $('midi-keep-note-length').value = saved.keep_note_length;
                if (Array.isArray(saved.sustain_track_indices)) {
                    _sustainTrackIndices = saved.sustain_track_indices.slice();
                }
                if (saved.snap_enabled !== undefined && $('midi-snap-enabled')) $('midi-snap-enabled').checked = saved.snap_enabled;
                if (saved.snap_beat !== undefined && $('midi-snap-beat')) $('midi-snap-beat').value = saved.snap_beat;
                updateSustainTracksUI();
                updateSnapGridInfo();
            }
        } catch(e) {}
    }

    function doImportMidi() {
        var file = state._midiFile;
        if (!file) return;
        var settings = collectMidiSettings();

        // 导入 MIDI 前自动暂停当前 NBS 播放
        if (state.isPlaying) {
            handleStop();
        }

        // 在关闭弹窗前保存音轨状态（closeMidiPopup 会清除 _midiTrackStates）
        var savedTrackStates = {};
        for (var idx in _midiTrackStates) {
            savedTrackStates[idx] = {
                muted: _midiTrackStates[idx].muted,
                solo: _midiTrackStates[idx].solo,
                excluded: _midiTrackStates[idx].excluded
            };
        }
        var savedChannelTracks = state._channelTracks ? JSON.parse(JSON.stringify(state._channelTracks)) : {};

        // 关闭 MIDI 配置弹窗
        closeMidiPopup();

        // 新文件, 重置文件 ID
        state.currentFileId = null;

        showUploadProgress(file.name);
        API.importMidi(file, settings, function(loaded, total, speed, percent, eta) {
            updateUploadProgress(loaded, total, speed, percent, eta);
        }).then(function(data) {
            hideUploadProgress();
            state.song = data.song;
            state.notes = data.song.notes || [];
            // 恢复音轨状态（用于 NBS 播放时过滤静音/排除的音轨）
            _midiTrackStates = savedTrackStates;
            state._channelTracks = savedChannelTracks;
            // 保存 layer → channel 映射（用于 NBS 播放时查找音符所属 MIDI channel）
            state.layerChannelMap = data.song.layer_channel_map || {};
            // 保存导入文件名（去掉扩展名）
            state.importedFileName = file.name.replace(/\.[^.]+$/, '');
            var t = parseFloat(data.song.tempo);
            if (!isFinite(t) || t <= 0) t = 10;
            state.tempo = t;
            $setValue('tempo-slider', state.tempo);
            $('tempo-value').value = state.tempo;
            $setValue('fls-tempo-input', Math.round(state.tempo));
            $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
            $setValue('settings-tempo-input', state.tempo);
            $setText('settings-tempo-value', (state.tempo).toFixed(1));
            buildNoteIndex(state.notes);
            state.undoStack = [];
            state.redoStack = [];
            updateUndoRedoButtons();

            if (state.flsEnabled && state.flsModel) {
                state.flsModel = new FLS.Model();
                state.flsModel.loadFromFlatNotes(state.notes, state.tempo);
                enterFLSModeFromLoaded();
            } else if (state.pianoRoll) {
                state.pianoRoll.setNotes(state.notes);
            }

            updateSongInfo();
            checkOctaveRange(state.notes);
            updateTrackPanelUI();
            updateProgressUI();
            handleStop();
            markDirty();
            $('file-input').value = '';
            state._midiFile = null;
            state._midiInfo = null;
        }).catch(function(err) {
            hideUploadProgress();
            // 弹窗已关闭, showMidiNotice 会写入隐藏的弹窗导致用户看不到错误
            // 改用 showAppAlert 显示可见的错误提示
            showAppAlert('MIDI 导入失败: ' + formatError(err, '无法导入 MIDI'), {
                title: '导入失败',
                icon: 'fa-solid fa-triangle-exclamation'
            });
        });
    }

    // ============ FLS 模式 ============
    function toggleFLSMode() {
        state.flsEnabled = !state.flsEnabled;
        if (state.flsEnabled) enterFLSMode();
        else exitFLSMode();
    }

    // 更新吸附网格信息显示
    function updateSnapGridInfo() {
        var snapEnabled = $('midi-snap-enabled') && $('midi-snap-enabled').checked;
        var snapBeat = $('midi-snap-beat') ? parseInt($('midi-snap-beat').value) : 4;
        // NBS standard: 4 ticks per beat (quarter note)
        // gridStep 必须是整数 tick, 与 applySnap 保持一致
        var ticksPerBeat = 4; // NBS standard
        var nbsTicksPerGrid = Math.max(1, Math.round(ticksPerBeat * 4 / snapBeat));
        var infoEl = $('midi-snap-grid-info');
        var beatLabel = $('midi-snap-beat-label');
        if (beatLabel) beatLabel.style.display = snapEnabled ? '' : 'none';
        if (infoEl) {
            if (snapEnabled) {
                infoEl.textContent = '吸附网格: ' + nbsTicksPerGrid + ' tick';
            } else {
                infoEl.textContent = '';
            }
        }
    }

    // 监听吸附控件变化
    if ($('midi-snap-enabled')) $('midi-snap-enabled').addEventListener('change', updateSnapGridInfo);
    if ($('midi-snap-beat')) $('midi-snap-beat').addEventListener('change', updateSnapGridInfo);
    if ($('midi-precision')) $('midi-precision').addEventListener('change', updateSnapGridInfo);
    updateSnapGridInfo();

    function enterFLSMode() {
        state.isPlaying = false;
        stopPlaybackLoop();

        if (!state.flsModel) state.flsModel = new FLS.Model();

        if (state.notes.length > 0 && state.flsModel.tracks.length === 0) {
            state.flsModel.loadFromFlatNotes(state.notes, state.tempo);
        } else if (state.flsModel.tracks.length === 0) {
            var t = state.flsModel.addTrack(0, '音轨 1');
            state.flsModel.addClip(t.id, 0, 32, 'Clip 1');
        }

        hideElement('main-content');
        hideElement('toolbar');
        hideByClass('status-bar');
        hideByQuery('.status-normal');

        var flsApp = $('fls-app');
        if (flsApp) flsApp.style.display = '';
        var flsBottom = $('fls-bottom-bar');
        if (flsBottom) flsBottom.style.display = '';

        if (!state.flsPlaylist) {
            state.flsPlaylist = new FLSPlaylist(state.flsModel, {
                onClipClick: function(clip) { openPianoRoll(clip); },
                onTrackIconClick: function(trackId) {
                    if (!state.flsTrackPanel) return;
                    state.flsTrackPanel.toggle(trackId);
                },
                onTrackChanged: function() { renderFLS(); },
                onModelChanged: function() { syncNotesFromFLS(); renderFLS(); }
            });
        }

        if (!state.flsTrackPanel) {
            state.flsTrackPanel = new FLSTrackPanel(state.flsModel, {
                onModelChanged: function() { syncNotesFromFLS(); renderFLS(); }
            });
        }

        if (!state.flsPianoRoll && window.FLSPianoRoll) {
            state.flsPianoRoll = new FLSPianoRoll(state.flsModel, {
                onBack: function() { closePianoRoll(); },
                onModelChanged: function() {
                    syncNotesFromFLS();
                    if (state.flsPlaylist) state.flsPlaylist.render();
                },
                onTickPlay: function(inst, key, vel) {
                    if (window.AudioEngine && AudioEngine.playNote) {
                        AudioEngine.playNote(inst, key, vel || 100);
                    }
                }
            });
        }

        renderFLS();
    }

    function exitFLSMode() {
        syncNotesFromFLS(true);

        var flsApp = $('fls-app');
        if (flsApp) flsApp.style.display = 'none';
        var flsBottom = $('fls-bottom-bar');
        if (flsBottom) flsBottom.style.display = 'none';

        showElement('main-content');
        showElement('toolbar');
        showByClass('status-bar');

        if (state.flsPianoRoll) closePianoRoll();

        if (state.pianoRoll) {
            state.pianoRoll.setNotes(state.notes);
            state.pianoRoll._setupCanvas();
            state.pianoRoll.render();
        }
        updateTrackPanelUI();
    }

    function openPianoRoll(clip) {
        if (state.flsPianoRoll) state.flsPianoRoll.openClip(clip);
    }

    function closePianoRoll() {
        if (state.flsPianoRoll) state.flsPianoRoll.close();
    }

    function renderFLS() {
        if (state.flsPlaylist) state.flsPlaylist.render();
        if (state.flsModel) {
            var total = 0;
            for (var i = 0; i < state.flsModel.clips.length; i++) {
                total += state.flsModel.clips[i].notes.length;
            }
            var songName = state.song ? (state.song.name || state.song.song_name || '未命名') : '未加载歌曲';
            $setText('fls-song-name', songName + ' · ' + state.flsModel.tracks.length + ' 音轨 · ' + total + ' 音符');
            $setText('song-name', songName);
        }
        updateNoteCount();
    }

    function syncNotesFromFLS(includeAll) {
        if (!state.flsModel) return;
        state.notes = state.flsModel.toFlatNotes(includeAll);
        buildNoteIndex(state.notes);
    }

    function enterFLSModeFromLoaded() {
        hideElement('main-content');
        hideElement('toolbar');
        hideByClass('status-bar');
        var flsApp = $('fls-app');
        if (flsApp) flsApp.style.display = '';
        var flsBottom = $('fls-bottom-bar');
        if (flsBottom) flsBottom.style.display = '';

        state.flsPlaylist = new FLSPlaylist(state.flsModel, {
            onClipClick: function(clip) { openPianoRoll(clip); },
            onTrackIconClick: function(trackId) {
                if (!state.flsTrackPanel) return;
                state.flsTrackPanel.toggle(trackId);
            },
            onTrackChanged: function() { renderFLS(); },
            onModelChanged: function() { syncNotesFromFLS(); renderFLS(); }
        });
        state.flsTrackPanel = new FLSTrackPanel(state.flsModel, {
            onModelChanged: function() { syncNotesFromFLS(); renderFLS(); }
        });
        if (window.FLSPianoRoll && !state.flsPianoRoll) {
            state.flsPianoRoll = new FLSPianoRoll(state.flsModel, {
                onBack: function() { closePianoRoll(); },
                onModelChanged: function() {
                    syncNotesFromFLS();
                    if (state.flsPlaylist) state.flsPlaylist.render();
                },
                onTickPlay: function(inst, key, vel) {
                    if (window.AudioEngine && AudioEngine.playNote) {
                        AudioEngine.playNote(inst, key, vel || 100);
                    }
                }
            });
        }
        renderFLS();
    }

    // ============ UI 辅助 ============
    function updateSongInfo() {
        var name = state.song ? (state.song.name || state.song.song_name || '未命名') : '未加载歌曲';
        $setText('song-name', name);
        updateNoteCount();
    }

    function updateNoteCount() {
        var count = state.notes.length;
        $setText('note-count', '音符: ' + count);
        // 也更新轨道面板
        updateTrackPanelUI();
    }

    function checkOctaveRange(notes) {
        if (!notes || notes.length === 0) return;
        var outside = 0;
        for (var i = 0; i < notes.length; i++) {
            var k = notes[i].key;
            if (k < 33 || k > 57) outside++;
        }
        if (outside > 0) {
            var octCountEl = $('octave-count');
            if (octCountEl) octCountEl.textContent = outside;
            var p = $('octave-popup');
            if (p) { p.classList.add('active'); p.style.display = 'flex'; }
        }
    }

    function loadInstruments() {
        // 使用本地乐器列表
        renderInstrumentList(getDefaultInstruments());
    }

    function getDefaultInstruments() {
        var names = getInstrumentNames();
        var arr = [];
        for (var i = 0; i < names.length; i++) arr.push({ id: i, name: names[i] });
        return arr;
    }

    function renderInstrumentList(instruments) {
        // 不再使用旧的乐器列表面板，而是使用乐器选择器弹窗
        updateInstrumentSelectorUI();
    }

    // ============ DOM 工具 ============
    function hideElement(id) { var el = $(id); if (el) el.style.display = 'none'; }
    function showElement(id) { var el = $(id); if (el) el.style.display = ''; }
    function hideByClass(cls) {
        var els = document.getElementsByClassName(cls);
        for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
    }
    function showByClass(cls) {
        var els = document.getElementsByClassName(cls);
        for (var i = 0; i < els.length; i++) els[i].style.display = '';
    }
    function hideByQuery(sel) {
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
    }

    // ============ 文件菜单 ============
    function showFileMenu() {
        var btn = $('btn-file');
        if (!btn) return;
        hideFileMenu();
        var menu = document.createElement('div');
        var t = i18nText;
        menu.id = 'file-menu';
        menu.className = 'file-menu';
        menu.style.cssText = 'position:fixed;z-index:10000;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px 0;min-width:180px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;';
        var rect = btn.getBoundingClientRect();

        // 打开文件 (第一个选项)
        var itemOpen = document.createElement('div');
        itemOpen.className = 'file-menu-item';
        itemOpen.innerHTML = '<i class="fa-solid fa-folder-open"></i><span>' + t('打开文件') + '</span>';
        itemOpen.addEventListener('click', function() { hideFileMenu(); $('file-input').click(); });
        menu.appendChild(itemOpen);

        // 新建
        var item0 = document.createElement('div');
        item0.className = 'file-menu-item';
        item0.innerHTML = '<i class="fa-solid fa-file-circle-plus"></i><span>' + t('新建文件') + '</span>';
        item0.addEventListener('click', function() { hideFileMenu(); createNewFile(); });
        menu.appendChild(item0);

        // 保存
        var item1 = document.createElement('div');
        item1.className = 'file-menu-item';
        item1.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>' + t('保存') + '</span>';
        item1.addEventListener('click', function() { hideFileMenu(); saveFileToLocalStorage(); });
        menu.appendChild(item1);

        // 导出
        var item2 = document.createElement('div');
        item2.className = 'file-menu-item';
        item2.innerHTML = '<i class="fa-solid fa-file-export"></i><span>' + t('导出 NBS') + '</span>';
        item2.addEventListener('click', function() { hideFileMenu(); exportNBS(); });
        menu.appendChild(item2);
        
        // 分隔线
        var divider = document.createElement('div');
        divider.className = 'file-menu-divider';
        menu.appendChild(divider);
        
        // 历史文件 (带子菜单)
        var item3 = document.createElement('div');
        item3.className = 'file-menu-item file-menu-has-sub';
        item3.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i><span>' + t('历史文件') + '</span><i class="fa-solid fa-chevron-right file-menu-arrow"></i>';
        item3.addEventListener('mouseenter', function() { showHistorySubmenu(item3, menu); });
        menu.appendChild(item3);
        
        document.body.appendChild(menu);
        window.WebNBSPositionFlyout(menu, rect, { placement: 'bottom-start' });
        
        setTimeout(function() {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target) && e.target.id !== 'btn-file') {
                    hideFileMenu();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 10);
    }

    function hideFileMenu() {
        var menu = document.getElementById('file-menu');
        if (menu) menu.remove();
        hideHistorySubmenu();
    }

    function showHistorySubmenu(parentItem, parentMenu) {
        hideHistorySubmenu();
        var sub = document.createElement('div');
        sub.id = 'history-submenu';
        sub.className = 'file-menu';
        sub.style.cssText = 'position:fixed;z-index:10001;background:rgba(22,33,62,0.98);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px 0;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,0.5);color:#eaeaea;font-size:13px;max-height:360px;overflow-y:auto;';
        var parentRect = parentItem.getBoundingClientRect();
        
        var history = getHistoryFiles();
        history = history.slice(0, 10);
        for (var i = 0; i < history.length; i++) {
            (function(h) {
                var item = document.createElement('div');
                item.className = 'file-menu-item';
                item.innerHTML = '<span>' + escapeHTML(h.name) + '</span><span style="font-size:10px;color:#888;margin-left:auto;">' + (h.date || '') + '</span>';
                item.addEventListener('click', function() {
                    hideFileMenu();
                    hideHistorySubmenu();
                    loadFileFromLocalStorage(h.id);
                });
                sub.appendChild(item);
            })(history[i]);
        }
        
        if (history.length === 0) {
            var emptyItem = document.createElement('div');
            emptyItem.className = 'file-menu-item';
            emptyItem.style.color = '#888';
            emptyItem.textContent = i18nText('暂无历史文件');
            sub.appendChild(emptyItem);
        }
        
        // 更多选项
        var moreItem = document.createElement('div');
        moreItem.className = 'file-menu-item';
        moreItem.innerHTML = '<i class="fa-solid fa-ellipsis"></i><span>' + i18nText('更多...') + '</span>';
        moreItem.addEventListener('click', function() {
            hideFileMenu();
            hideHistorySubmenu();
            showHistoryDialog();
        });
        sub.appendChild(moreItem);
        
        document.body.appendChild(sub);
        window.WebNBSPositionFlyout(sub, parentRect, { placement: 'right-start' });
    }

    function hideHistorySubmenu() {
        var sub = document.getElementById('history-submenu');
        if (sub) sub.remove();
    }

    // 清理孤儿 nbs_file_* 文件 (历史列表中被截断的旧文件)
    function cleanupOrphanedFiles() {
        try {
            var history = getHistoryFiles();
            var validIds = {};
            for (var i = 0; i < history.length; i++) {
                validIds[history[i].id] = true;
            }
            var keysToRemove = [];
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (key && key.indexOf('nbs_file_') === 0) {
                    var fileId = key.substring('nbs_file_'.length);
                    if (!validIds[fileId]) {
                        keysToRemove.push(key);
                    }
                }
            }
            for (var k = 0; k < keysToRemove.length; k++) {
                localStorage.removeItem(keysToRemove[k]);
            }
            if (keysToRemove.length > 0) {
                console.info('已清理 ' + keysToRemove.length + ' 个孤儿历史文件');
            }
            return keysToRemove.length;
        } catch(e) {
            console.warn('清理孤儿文件失败:', e);
            return 0;
        }
    }

    // 尝试保存到 localStorage, 配额超限时自动清理最旧文件后重试
    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch(e) {
            if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                // 配额超限: 清理最旧的历史文件后重试
                var cleaned = 0;
                try {
                    var history = getHistoryFiles();
                    // 从最旧的开始删除 (数组末尾), 每次删一个就重试
                    while (history.length > 1) {
                        var oldest = history.pop();
                        try { localStorage.removeItem('nbs_file_' + oldest.id); } catch(e2) {}
                        cleaned++;
                        try {
                            localStorage.setItem('nbs_history', JSON.stringify(history));
                            localStorage.setItem(key, value);
                            console.info('配额超限, 已清理 ' + cleaned + ' 个旧文件后重试成功');
                            return true;
                        } catch(e2) {
                            // 仍然超限, 继续清理
                            continue;
                        }
                    }
                    // 历史文件已全部清理, 仍然超限, 最后尝试清理 autoSave 数据
                    try { localStorage.removeItem('noteblockweb_data'); } catch(e3) {}
                    try {
                        localStorage.setItem(key, value);
                        console.info('清理自动保存数据后重试成功');
                        return true;
                    } catch(e3) {
                        console.warn('localStorage 配额严重不足, 保存失败:', e3);
                        return false;
                    }
                } catch(e2) {
                    console.warn('清理配额失败:', e2);
                    return false;
                }
            }
            console.warn('localStorage 保存失败:', e);
            return false;
        }
    }

    function saveFileToLocalStorage(silent) {
        if (state.flsEnabled && state.flsModel) syncNotesFromFLS(true);
        // 保存歌曲元数据 (author/original_author/description/name)
        var songMeta = state.song || {};
        var data = {
            song: {
                name: songMeta.name || songMeta.song_name || 'Untitled',
                song_name: songMeta.name || songMeta.song_name || 'Untitled',
                author: songMeta.author || '',
                original_author: songMeta.original_author || '',
                description: songMeta.description || '',
                tempo: state.tempo,
                notes: state.notes,
                layers: songMeta.layers || []
            },
            notes: state.notes,
            tempo: state.tempo
        };
        var history = getHistoryFiles();
        // 使用当前文件的持久 ID (多次保存覆盖同一文件, 不产生重复)
        if (!state.currentFileId) {
            state.currentFileId = Date.now().toString();
        }
        var id = state.currentFileId;
        var name = (state.song && (state.song.name || state.song.song_name)) || 'Untitled';
        // 查找是否已有该 ID 的历史记录
        var existingIdx = -1;
        for (var i = 0; i < history.length; i++) {
            if (history[i].id === id) { existingIdx = i; break; }
        }
        var entry = { id: id, name: name, date: new Date().toLocaleString(), size: state.notes.length, tempo: state.tempo };
        if (existingIdx >= 0) {
            // 覆盖已有记录, 但保持在列表中的位置
            history[existingIdx] = entry;
        } else {
            history.unshift(entry);
            // 降低上限为 20, 避免占用过多配额, 同时清理被截断的孤儿文件
            if (history.length > 20) {
                var removed = history.splice(20);
                // 立即清理被截断的孤儿文件
                for (var r = 0; r < removed.length; r++) {
                    try { localStorage.removeItem('nbs_file_' + removed[r].id); } catch(e) {}
                }
            }
        }
        var historyOk = safeSetItem('nbs_history', JSON.stringify(history));
        var fileOk = safeSetItem('nbs_file_' + id, JSON.stringify(data));
        if (historyOk && fileOk) {
            if (!silent) showAppAlert('保存成功', {title: '保存', icon: 'fa-solid fa-circle-check'});
        } else {
            if (!silent) showAppAlert('存储空间不足, 部分数据可能未保存', {title: '警告', icon: 'fa-solid fa-triangle-exclamation'});
        }
    }

    // 自动保存定时器 (每 30 秒保存一次)
    var _autoSaveIntervalMs = 30000;
    var _autoSaveIntervalTimer = null;

    function startAutoSaveInterval() {
        if (_autoSaveIntervalTimer) clearInterval(_autoSaveIntervalTimer);
        _autoSaveIntervalTimer = setInterval(function() {
            // 只在有音符且不在播放时自动保存 (避免播放时序列化阻塞)
            if (state.notes && state.notes.length > 0 && !state.isPlaying) {
                // 使用 setTimeout(0) 推迟到下一帧, 避免阻塞 UI
                setTimeout(function() {
                    saveFileToLocalStorage(true);
                }, 0);
            }
        }, _autoSaveIntervalMs);
    }

    // 播放时保存 (延迟执行, 避免阻塞播放启动)
    function saveOnPlay() {
        if (state.notes && state.notes.length > 0) {
            setTimeout(function() {
                saveFileToLocalStorage(true);
            }, 100);
        }
    }

    function getHistoryFiles() {
        try { return JSON.parse(localStorage.getItem('nbs_history') || '[]'); } catch(e) { return []; }
    }

    function loadFileFromLocalStorage(id) {
        try {
            var raw = localStorage.getItem('nbs_file_' + id);
            if (!raw) {
                showAppAlert('文件数据不存在，可能已被清理', {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
                return;
            }
            var data = JSON.parse(raw);
            // 兼容旧格式: 早期只保存了 data.song, 没有顶层 data.notes
            var song = data && data.song ? data.song : {};
            var notes = Array.isArray(data && data.notes) ? data.notes
                : (Array.isArray(song.notes) ? song.notes : []);
            if (!data || (!data.song && !Array.isArray(data.notes) && !Array.isArray(song.notes))) {
                showAppAlert('文件数据不完整', {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'});
                console.warn('[loadFileFromLocalStorage] id=' + id + ' 数据缺失:', data);
                return;
            }
            // 设置当前文件 ID, 后续保存将覆盖此文件
            state.currentFileId = id;
            state.song = song;
            if (!state.song.layers) state.song.layers = [];
            state.notes = notes;
            // 从历史记录加载，清除残留的 MIDI 音轨状态
            state.layerChannelMap = {};
            _midiTrackStates = {};
            state._channelTracks = {};
            state.tempo = data.tempo || song.tempo || 20;
            // 同步速度 UI
            $setValue('tempo-slider', state.tempo);
            $('tempo-value').value = state.tempo;
            $setValue('fls-tempo-input', Math.round(state.tempo));
            $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
            $setValue('settings-tempo-input', state.tempo);
            $setText('settings-tempo-value', (state.tempo).toFixed(1));
            buildNoteIndex(state.notes);
            state.undoStack = [];
            state.redoStack = [];
            updateUndoRedoButtons();
            if (state.pianoRoll) state.pianoRoll.setNotes(state.notes);
            updateSongInfo();
            updateTrackPanelUI();
            handleStop();
            markDirty();
        } catch(e) { showAppAlert('加载失败: ' + formatError(e, '无法加载本地文件'), {title: '加载失败', icon: 'fa-solid fa-triangle-exclamation'}); }
    }

    function showHistoryDialog() {
        // WinUI 3 / Fluent Design ContentDialog 风格
        var mask = document.createElement('div');
        mask.id = 'history-dialog-mask';
        mask.className = 'popup';
        mask.style.cssText = 'display:flex;';

        var history = getHistoryFiles();
        var tableHtml = '';
        if (history.length === 0) {
            tableHtml = '<div class="history-empty"><i class="fa-regular fa-folder-open"></i><p>暂无历史文件</p></div>';
        } else {
            tableHtml = '<div class="history-table-wrap"><table class="history-table">';
            tableHtml += '<thead><tr><th>名称</th><th>时间</th><th>大小</th><th class="history-action-col">操作</th></tr></thead><tbody>';
            for (var i = 0; i < history.length; i++) {
                var h = history[i];
                tableHtml += '<tr>';
                tableHtml += '<td class="history-name">' + escapeHTML(h.name) + '</td>';
                tableHtml += '<td class="history-date">' + (h.date || '') + '</td>';
                tableHtml += '<td class="history-size">' + (h.size || 0) + ' 音符</td>';
                tableHtml += '<td class="history-action"><button class="popup-btn popup-btn-primary" data-id="' + escapeHTML(h.id) + '">加载</button></td>';
                tableHtml += '</tr>';
            }
            tableHtml += '</tbody></table></div>';
        }

        var html = ''+
            '<div class="popup-content settings-dialog history-dialog">'+
                '<div class="settings-header">'+
                    '<i class="fa-solid fa-clock-rotate-left"></i>'+
                    '<h4>历史文件</h4>'+
                    '<button class="settings-close-btn" id="history-close-btn" title="关闭">&times;</button>'+
                '</div>'+
                '<div class="settings-body history-body">'+
                    tableHtml +
                '</div>'+
                '<div class="popup-actions">'+
                    '<button class="popup-btn popup-btn-cancel" id="history-close-btn-2">关闭</button>'+
                '</div>'+
            '</div>';

        mask.innerHTML = html;
        document.body.appendChild(mask);

        function close() { mask.remove(); }
        $('history-close-btn').addEventListener('click', close);
        $('history-close-btn-2').addEventListener('click', close);
        mask.addEventListener('click', function(e) { if (e.target === mask) close(); });

        var loadBtns = mask.querySelectorAll('.history-action .popup-btn');
        for (var j = 0; j < loadBtns.length; j++) {
            (function(btn){
                btn.addEventListener('click', function() {
                    var id = btn.getAttribute('data-id');
                    close();
                    loadFileFromLocalStorage(id);
                });
            })(loadBtns[j]);
        }
    }

    // 导出锁: 防止在导出过程中再次触发导出 (修复不刷新网页无法再次导出的问题)
    var _isExporting = false;

    function exportNBS() {
        // 导出锁: 防止重复导出
        if (_isExporting) return;
        if (state.flsEnabled && state.flsModel) syncNotesFromFLS(true);
        if (!state.song || !state.notes) { showAppAlert('没有可导出的歌曲', {title: '导出', icon: 'fa-solid fa-triangle-exclamation'}); return; }

        // 弹窗获取文件名 / 作者 / 介绍
        var defaultName = state.importedFileName || (state.song.name || state.song.song_name || 'Untitled');
        var defaultAuthor = state.song.author || state.song.original_author || '';
        var defaultDesc = state.song.description || '';
        showExportDialog(defaultName, defaultAuthor, defaultDesc).then(function(input) {
            if (!input) return; // 用户取消
            _performExport(input);
        });
    }

    function _performExport(input) {
        if (_isExporting) return;
        _isExporting = true;
        try {
            // 深拷贝 song 数据, 避免直接修改 state.song 导致状态不一致
            var song = {
                name: input.name,
                song_name: input.name,
                author: input.author,
                original_author: input.author,
                description: input.description,
                tempo: state.tempo,
                length: state.maxTick + 4,
                time_signature: (state.song && state.song.time_signature) || 4,
                auto_save: (state.song && state.song.auto_save) || false,
                auto_save_minutes: (state.song && state.song.auto_save_minutes) || 0,
                loop: (state.song && state.song.loop) || 0,
                max_loop_count: (state.song && state.song.max_loop_count) || 0,
                loop_start: (state.song && state.song.loop_start) || 0,
                notes: deepCloneNotes(state.notes),
                layers: JSON.parse(JSON.stringify((state.song && state.song.layers) || []))
            };

            // 补全 layers
            if (!song.layers || song.layers.length === 0) {
                var maxLayer = 0;
                for (var i = 0; i < state.notes.length; i++) {
                    if (state.notes[i].layer > maxLayer) maxLayer = state.notes[i].layer;
                }
                song.layers = [];
                for (var l = 0; l <= maxLayer; l++) {
                    song.layers.push({ name: 'Layer ' + (l + 1), volume: 100, stereo: 100, lock: 0 });
                }
            }

            // 保存时根据当前轨道状态写入 lock 字段
            // pynbs 1.0.0-beta.0 仅支持 bool 类型的 lock, 因此只持久化静音(1), 不持久化独奏
            for (var li2 = 0; li2 < song.layers.length; li2++) {
                if (song.layers[li2].lock === undefined) song.layers[li2].lock = 0;
                var t2 = findTrackByLayer(li2);
                if (t2) {
                    song.layers[li2].lock = t2.muted ? 1 : 0;
                }
            }

            var exportName = input.name + '.nbs';
            showUploadProgress(exportName, '导出 NBS');
            API.saveSong(song, function(loaded, total, speed, percent, eta, phase) {
                updateUploadProgress(loaded, total, speed, percent, eta, phase);
            }).then(function(result) {
                hideUploadProgress();
                var filename = result.filename || exportName;
                // 使用 <a download> 触发下载，保留文件名
                var a = document.createElement('a');
                a.href = result.downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(function() {
                    if (a.parentNode) a.parentNode.removeChild(a);
                    URL.revokeObjectURL(result.downloadUrl);
                }, 5000);
                clearAutoSaveLocal();
            }).catch(function(err) {
                hideUploadProgress();
                showAppAlert('导出失败: ' + formatError(err, '无法导出文件'), {title: '导出失败', icon: 'fa-solid fa-triangle-exclamation'});
            });
        } catch (e) {
            hideUploadProgress();
            showAppAlert('导出失败: ' + (e && e.message ? e.message : '未知错误'), {title: '导出失败', icon: 'fa-solid fa-triangle-exclamation'});
        } finally {
            // 无论成功或失败, 都释放导出锁
            _isExporting = false;
        }
    }
    var STORAGE_KEY = 'noteblockweb_data';
    var _dirty = false;
    var _saveTimer = null;
    var _saveDebounceMs = 800;

    function markDirty() {
        if (!_dirty) {
            _dirty = true;
        }
        // 防抖保存
        if (_saveTimer) clearTimeout(_saveTimer);
        _saveTimer = setTimeout(autoSaveLocal, _saveDebounceMs);
    }

    function autoSaveLocal() {
        try {
            var data = {
                notes: state.notes,
                tempo: state.tempo,
                currentInstrument: state.currentInstrument,
                zoom: state.pianoRoll ? state.pianoRoll.zoom : 1,
                scrollX: state.pianoRoll ? state.pianoRoll.scrollX : 0,
                scrollY: state.pianoRoll ? state.pianoRoll.scrollY : 0,
                trackInfo: state.pianoRoll ? state.pianoRoll.trackInfo : {},
                smoothScroll: state.smoothScroll,
                selectedPianoKey: state.selectedPianoKey,
                song: state.song ? {
                    name: state.song.name || state.song.song_name,
                    song_name: state.song.name || state.song.song_name,
                    author: state.song.author || '',
                    original_author: state.song.original_author || '',
                    description: state.song.description || '',
                    layers: state.song.layers || []
                } : null,
                savedAt: Date.now()
            };
            // 使用 safeSetItem, 配额超限时自动清理旧历史文件
            if (safeSetItem(STORAGE_KEY, JSON.stringify(data))) {
                _dirty = false;
            }
        } catch(e) {
            console.warn('保存本地数据失败:', e);
        }
    }

    function autoLoadLocal() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;
            var data = JSON.parse(raw);
            if (!data || !data.notes) return false;

            state.notes = data.notes || [];
            state.tempo = data.tempo || 20;
            state.currentInstrument = data.currentInstrument || 0;
            // 兼容旧版 autoScrollMode 数据: 非 0 视为开启
            if (data.smoothScroll !== undefined) {
                state.smoothScroll = !!data.smoothScroll;
            } else if (data.autoScrollMode !== undefined) {
                state.smoothScroll = data.autoScrollMode !== 0;
            }
            // A refresh always returns to C4 so drawing has a predictable default.
            state.selectedPianoKey = 39;
            if (data.song) {
                state.song = {
                    name: data.song.name || '',
                    song_name: data.song.song_name || data.song.name || '',
                    author: data.song.author || '',
                    original_author: data.song.original_author || data.song.author || '',
                    description: data.song.description || '',
                    tempo: state.tempo,
                    notes: state.notes,
                    layers: data.song.layers || []
                };
            }
            if (!state.song) {
                state.song = {
                    name: 'Untitled',
                    song_name: 'Untitled',
                    author: '',
                    original_author: '',
                    description: '',
                    tempo: state.tempo,
                    notes: state.notes,
                    layers: []
                };
            }
            if ((!state.notes || state.notes.length === 0) && (!state.song.layers || state.song.layers.length === 0)) {
                state.song.layers = createDefaultLayers(8);
            }

            buildNoteIndex(state.notes);
            state.undoStack = [];
            state.redoStack = [];
            updateUndoRedoButtons();

            if (state.pianoRoll) {
                state.pianoRoll.trackCount = state.song.layers ? state.song.layers.length : 8;
                state.pianoRoll.setNotes(state.notes);
                state.pianoRoll.setInstrument(state.currentInstrument);
                state.pianoRoll.smoothScrollEnabled = state.smoothScroll;
                if (data.zoom) state.pianoRoll.setZoom(data.zoom);
                if (data.scrollX !== undefined) state.pianoRoll.scrollX = data.scrollX;
                if (data.scrollY !== undefined) state.pianoRoll.scrollY = data.scrollY;
                if (data.trackInfo) state.pianoRoll.trackInfo = data.trackInfo;
                state.pianoRoll.setSelectedKey(state.selectedPianoKey);
            }

            $setValue('tempo-slider', state.tempo);
            $('tempo-value').value = state.tempo;
            $setValue('fls-tempo-input', Math.round(state.tempo));
            $setValue('settings-tempo-slider', Math.max(5, Math.min(655, state.tempo)));
            $setValue('settings-tempo-input', state.tempo);
            $setText('settings-tempo-value', (state.tempo).toFixed(1));

            updateSongInfo();
            updateInstrumentSelectorUI();
            updateAutoScrollBtnIcon();
            updateTrackPanelUI();
            updateNoteCount();
            updateProgressUI();
            handleStop();
            updatePianoKeyboardHighlight();

            _dirty = false;
            return true;
        } catch(e) {
            console.warn('加载本地数据失败:', e);
            return false;
        }
    }

    function clearAutoSaveLocal() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            _dirty = false;
        } catch(e) {}
    }

    // 页面关闭前提醒
    window.addEventListener('beforeunload', function(e) {
        if (_dirty) {
            // 紧急保存一次
            autoSaveLocal();
            e.preventDefault();
            e.returnValue = '您有未保存的编辑内容，确定要离开吗？数据已自动保存到本地。';
            return e.returnValue;
        }
    });

    // ============ Button Tooltip System ============
    (function() {
        var tooltipEl = null;
        var tooltipTimeout = null;
        var tooltipTarget = null;

        function ensureTooltip() {
            if (tooltipEl) return;
            tooltipEl = document.createElement('div');
            tooltipEl.className = 'btn-tooltip';
            tooltipEl.style.cssText = 'position:fixed;z-index:99999;padding:6px 10px;background:rgba(0,0,0,0.88);color:#fff;font-size:12px;border-radius:6px;pointer-events:none;opacity:0;transition:opacity 0.15s;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
            document.body.appendChild(tooltipEl);
        }

        function showTooltip(btn, text) {
            ensureTooltip();
            tooltipTarget = btn;
            tooltipEl.textContent = text;
            var rect = btn.getBoundingClientRect();
            tooltipEl.style.left = rect.left + rect.width / 2 + 'px';
            tooltipEl.style.top = (rect.bottom + 8) + 'px';
            tooltipEl.style.transform = 'translateX(-50%)';
            tooltipEl.style.opacity = '1';
        }

        function hideTooltip() {
            if (tooltipEl) tooltipEl.style.opacity = '0';
            tooltipTarget = null;
            if (tooltipTimeout) clearTimeout(tooltipTimeout);
        }

        function attachTooltips() {
            var buttons = document.querySelectorAll('.toolbar-btn, .status-control-btn');
            for (var i = 0; i < buttons.length; i++) {
                (function(btn) {
                    var title = btn.getAttribute('title');
                    if (!title) return;
                    btn.addEventListener('mouseenter', function() {
                        if (tooltipTimeout) clearTimeout(tooltipTimeout);
                        tooltipTimeout = setTimeout(function() { showTooltip(btn, btn.getAttribute('title') || title); }, 200);
                    });
                    btn.addEventListener('mouseleave', hideTooltip);
                    btn.addEventListener('mousedown', hideTooltip);
                })(buttons[i]);
            }
        }

        window.attachTooltips = attachTooltips;
    })();

    // ============ 启动 ============
    document.addEventListener('DOMContentLoaded', init);
})();
