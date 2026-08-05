"""NBS 文件处理模块 - 基于 pynbs 库读取 + 自实现写入（pynbs Writer 有 bug）"""
import io
import struct
import pynbs
from pynbs.file import INT, Parser
from .models import Song, Note, Layer


# 让 pynbs 读取字符串时优先按 UTF-8 解码，失败再回退到 cp1252，
# 这样我们自己写入的 UTF-8 中文字符串才能被正确读回。
def _read_string_utf8(self):
    length = self.read_numeric(INT)
    raw = self.fileobj.read(length)
    try:
        return raw.decode('utf-8')
    except UnicodeDecodeError:
        return raw.decode('cp1252', errors='replace')


Parser.read_string = _read_string_utf8


# NBS 标准乐器列表（20种，对应 Minecraft 音符盒音色）
INSTRUMENT_NAMES = [
    "竖琴",       # 0:  Harp/Piano
    "低音提琴",   # 1:  Double Bass
    "大鼓",       # 2:  Bass Drum
    "小鼓",       # 3:  Snare Drum
    "击掌声",     # 4:  Click/Hi-hat
    "吉他",       # 5:  Guitar
    "长笛",       # 6:  Flute
    "钟琴",       # 7:  Bell/Glockenspiel
    "风铃",       # 8:  Chime/Ice
    "木琴",       # 9:  Xylophone
    "铁木琴",     # 10: Iron Xylophone
    "牛铃",       # 11: Cow Bell
    "迪吉里杜管", # 12: Didgeridoo
    "芯片音",     # 13: Bit/Square
    "班卓琴",     # 14: Banjo
    "电钢琴",     # 15: Pling
    "铜号角",         # 16: Copper Horn
    "斑驳的铜号角",   # 17: Exposed Copper Horn
    "锈蚀的铜号角",   # 18: Weathered Copper Horn
    "氧化的铜号角"    # 19: Oxidized Copper Horn
]

# NBS 格式常量
NBS_VERSION = 5

INT   = struct.Struct('<I')     # little-endian unsigned int (string length)
SHORT = struct.Struct('<H')     # little-endian unsigned short
BYTE  = struct.Struct('<B')     # little-endian unsigned byte
SSHORT = struct.Struct('<h')    # little-endian signed short


class NBSHandler:
    """NBS 文件读写处理"""

    @staticmethod
    def read_nbs(file_data: bytes) -> Song:
        """从字节数据读取 NBS 文件 (使用 pynbs Parser)"""
        file_buffer = io.BytesIO(file_data)
        parser = pynbs.Parser(file_buffer)
        nbs_file = parser.read_file()

        song = Song()
        song.name = nbs_file.header.song_name or ""
        song.author = nbs_file.header.song_author or ""
        song.original_author = nbs_file.header.original_author or ""
        song.description = nbs_file.header.description or ""
        song.tempo = nbs_file.header.tempo
        song.time_signature = nbs_file.header.time_signature or 4

        for nbs_note in nbs_file.notes:
            song.notes.append(Note(
                tick=nbs_note.tick,
                layer=nbs_note.layer,
                instrument=nbs_note.instrument,
                key=nbs_note.key,
                velocity=nbs_note.velocity if hasattr(nbs_note, 'velocity') else 100,
                pan=nbs_note.panning if hasattr(nbs_note, 'panning') else 50,
                pitch=nbs_note.pitch if hasattr(nbs_note, 'pitch') else 0
            ))

        for nbs_layer in nbs_file.layers:
            # pynbs 1.0.0-beta.0 将 lock 读取为 bool, 映射为 0/1
            # 0=unlocked, 1=locked/muted; solo(2) 无法通过 pynbs 读取
            lock_val = 1 if (hasattr(nbs_layer, 'lock') and nbs_layer.lock) else 0
            song.layers.append(Layer(
                name=nbs_layer.name or "",
                volume=nbs_layer.volume if hasattr(nbs_layer, 'volume') else 100,
                stereo=nbs_layer.panning if hasattr(nbs_layer, 'panning') else 100,
                lock=lock_val
            ))

        return song

    @staticmethod
    def write_nbs(song: Song, version: int = 5) -> bytes:
        """直接将 Song 对象写入 NBS 二进制 (不依赖 pynbs Writer, 它 1.0.0-beta.0 有 bug)
        含新乐器 (>=16) 时强制 V6, vanillaInstruments=20"""
        # 检测是否含新乐器
        has_new = any(n.instrument >= 16 for n in song.notes) if song.notes else False
        if has_new:
            version = 6
        vanilla_count = 20 if version >= 6 else 16

        buf = io.BytesIO()

        def w_short(v): buf.write(SHORT.pack(v))
        def w_byte(v):  buf.write(BYTE.pack(v))
        def w_sshort(v): buf.write(SSHORT.pack(v))
        def w_int(v):   buf.write(INT.pack(v))

        def w_string(s):
            encoded = (s or "").encode('utf-8')
            w_int(len(encoded))
            buf.write(encoded)

        # ---- Header ----
        w_short(0)                       # song_length = 0 (indicates NBS format)
        w_byte(version)                  # NBS version
        w_byte(vanilla_count)            # vanilla 乐器数 (V6=20, V5=16)
        w_short(song.length)             # song_length
        w_short(len(song.layers))        # song_layers
        w_string(song.name)
        w_string(song.author)
        w_string(song.original_author)
        w_string(song.description)
        w_short(int(song.tempo * 100))   # tempo (stored * 100)
        w_byte(0)                        # auto_save
        w_byte(0)                        # auto_save_duration
        w_byte(song.time_signature)      # time_signature
        w_int(0)                         # minutes_spent
        w_int(0)                         # left_clicks
        w_int(0)                         # right_clicks
        w_int(0)                         # blocks_added
        w_int(0)                         # blocks_removed
        w_string("")                     # song_origin
        if version >= 4:
            w_byte(0)                    # loop
            w_byte(0)                    # max_loop_count
            w_short(0)                   # loop_start

        # ---- Notes (按 tick 分组, 按 layer 排序) ----
        # 使用 jump 格式: { tick_delta, [layer_delta + note_data], 0 } ... { 0 }
        if song.notes:
            # 按 tick 分组
            grouped = {}
            for n in sorted(song.notes, key=lambda x: (x.tick, x.layer)):
                grouped.setdefault(n.tick, []).append(n)

            current_tick = -1
            for tick in sorted(grouped):
                chord = grouped[tick]
                w_short(tick - current_tick)
                current_tick = tick
                current_layer = -1
                for n in chord:
                    w_short(n.layer - current_layer)
                    current_layer = n.layer
                    w_byte(n.instrument)
                    w_byte(n.key)
                    if version >= 4:
                        w_byte(min(100, max(0, n.velocity)))
                        w_byte(min(200, max(0, n.pan * 2)))
                        w_sshort(n.pitch)
                w_short(0)  # end of chord
        w_short(0)  # end of notes

        # ---- Layers ----
        for layer in song.layers:
            w_string(layer.name or "")
            if version >= 4:
                # pynbs 1.0.0-beta.0 仅支持 bool lock, 为兼容只持久化 0/1 (静音)
                lock_val = int(layer.lock) if hasattr(layer, 'lock') else 0
                w_byte(1 if lock_val else 0)
            w_byte(min(100, max(0, layer.volume)))
            if version >= 2:
                w_byte(min(200, max(0, layer.stereo)))

        # ---- Custom Instruments (none) ----
        w_byte(0)  # 0 custom instruments

        return buf.getvalue()
