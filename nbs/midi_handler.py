"""MIDI 文件导入处理模块 — 完全复刻 NoteBlockStudio 转换逻辑"""
import io
import struct
from typing import List, Dict, Optional, Any
from .models import Song, Note, Layer


# ========== GM Program → 名称 & 默认映射 (参照 NoteBlockStudio midi_instruments) ==========
# midi_ins[program, 0] = name, [1] = NBS instrument, [2] = octave offset
GM_PROGRAM_TABLE = [
    # Piano (0-7)
    ("Acoustic Grand Piano",      0,  0),
    ("Bright Acoustic Piano",    15,  0),
    ("Electric Grand Piano",     15,  0),
    ("Honky-tonk Piano",         15,  0),
    ("Electric Piano 1",          0,  0),
    ("Electric Piano 2",          0,  0),
    ("Harpsichord",               5,  1),
    ("Clavinet",                 14,  0),
    # Chromatic Percussion (8-15)
    ("Celesta",                   7, -2),
    ("Glockenspiel",              7, -2),
    ("Music Box",                 7, -2),
    ("Vibraphone",               10,  0),
    ("Marimba",                  10,  0),
    ("Xylophone",                 9, -2),
    ("Tubular Bells",             7, -2),
    ("Dulcimer",                  5,  1),
    # Organ (16-23)
    ("Drawbar Organ",             6, -1),
    ("Percussive Organ",         10,  0),
    ("Rock Organ",                6, -1),
    ("Church Organ",              6, -1),
    ("Reed Organ",                6, -1),
    ("Accordion",                 6, -1),
    ("Harmonica",                 6, -1),
    ("Bandoneon",                 6, -1),
    # Guitar (24-31)
    ("Acoustic Guitar (nylon)",   5,  1),
    ("Acoustic Guitar (steel)",   5,  1),
    ("Electric Guitar (jazz)",    0,  0),
    ("Electric Guitar (clean)",   5,  1),
    ("Electric Guitar (muted)",   1,  2),
    ("Overdriven Guitar",        12,  2),
    ("Distortion Guitar",        12,  2),
    ("Guitar Harmonics",          5,  3),
    # Bass (32-39)
    ("Acoustic Bass",             1,  2),
    ("Electric Bass (finger)",    1,  2),
    ("Electric Bass (pick)",      1,  2),
    ("Fretless Bass",             1,  2),
    ("Slap Bass 1",               5,  1),
    ("Slap Bass 2",               5,  1),
    ("Synth Bass 1",              1,  2),
    ("Synth Bass 2",             15,  0),
    # Strings (40-47)
    ("Violin",                    6, -1),
    ("Viola",                     6, -1),
    ("Cello",                     6, -1),
    ("Contrabass",                6, -1),
    ("Tremolo Strings",           6, -1),
    ("Pizzicato Strings",         1,  2),
    ("Orchestral Harp",           0,  0),
    ("Timpani",                   3,  0),
    # Ensemble (48-55)
    ("String Ensemble 1",         6, -1),
    ("String Ensemble 2",         6, -1),
    ("Synth Strings 1",           6, -1),
    ("Synth Strings 2",           6, -1),
    ("Choir Aahs",                6, -1),
    ("Voice Oohs",                6, -1),
    ("Synth Voice",               6, -1),
    ("Orchestra Hit",             3, -1),
    # Brass (56-63)
    ("Trumpet",                   6, -1),
    ("Trombone",                  6, -1),
    ("Tuba",                      6, -1),
    ("Muted Trumpet",            12,  2),
    ("French Horn",               6, -1),
    ("Brass Section",            12,  2),
    ("Synth Brass 1",            12,  2),
    ("Synth Brass 2",             6, -1),
    # Reed (64-71)
    ("Soprano Sax",               6, -1),
    ("Alto Sax",                  6, -1),
    ("Tenor Sax",                 6, -1),
    ("Baritone Sax",              6, -1),
    ("Oboe",                      6, -1),
    ("English Horn",              6, -1),
    ("Bassoon",                   6, -1),
    ("Clarinet",                  6, -1),
    # Pipe (72-79)
    ("Piccolo",                   6, -1),
    ("Flute",                     6, -1),
    ("Recorder",                  6, -1),
    ("Pan Flute",                 6, -1),
    ("Blown Bottle",              6, -1),
    ("Shakuhachi",                6, -1),
    ("Whistle",                   6, -1),
    ("Ocarina",                   6, -1),
    # Synth Lead (80-87)
    ("Lead 1 (square)",          13,  0),
    ("Lead 2 (sawtooth)",         6, -1),
    ("Lead 3 (calliope)",         6, -1),
    ("Lead 4 (chiff)",            6, -1),
    ("Lead 5 (charang)",          5,  1),
    ("Lead 6 (voice)",            6, -1),
    ("Lead 7 (fifths)",           6, -1),
    ("Lead 8 (bass + lead)",      1,  2),
    # Synth Pad (88-95)
    ("Pad 1 (new age)",           7, -2),
    ("Pad 2 (warm)",              6, -1),
    ("Pad 3 (polysynth)",         6, -1),
    ("Pad 4 (choir)",             6, -1),
    ("Pad 5 (bowed)",             6, -1),
    ("Pad 6 (metallic)",          6, -1),
    ("Pad 7 (halo)",              6, -1),
    ("Pad 8 (sweep)",             8, -2),
    # Synth Effects (96-103)
    ("FX 1 (rain)",               8, -2),
    ("FX 2 (soundtrack)",         6, -1),
    ("FX 3 (crystal)",            8, -2),
    ("FX 4 (atmosphere)",         5,  1),
    ("FX 5 (brightness)",        15,  0),
    ("FX 6 (goblins)",            6, -1),
    ("FX 7 (echoes)",             6, -1),
    ("FX 8 (sci-fi)",             5,  1),
    # Ethnic (104-111)
    ("Sitar",                    14,  0),
    ("Banjo",                    14,  0),
    ("Shamisen",                 14,  0),
    ("Koto",                      5,  1),
    ("Kalimba",                  10,  0),
    ("Bag pipe",                  6, -1),
    ("Fiddle",                    6, -1),
    ("Shanai",                    6, -1),
    # Percussive (112-119)
    ("Tinkle Bell",               8, -2),
    ("Agogo",                    11, -1),
    ("Steel Drums",              10,  0),
    ("Woodblock",                 9, -2),
    ("Taiko Drum",                2,  0),
    ("Melodic Tom",               3,  0),
    ("Synth Drum",                3,  0),
    ("Reverse Cymbal",            8, -2),
    # Sound Effects (120-127)
    ("Guitar Fret Noise",         4,  1),
    ("Breath Noise",              6, -1),
    ("Seashore",                  8, -2),
    ("Bird Tweet",                6,  1),
    ("Telephone Ring",            7,  2),
    ("Helicopter",                2,  0),
    ("Applause",                  3,  0),
    ("Gunshot",                   3,  0),
]

# ========== 鼓组音符映射 (Channel 9, 参照 midi_drum) ==========
# midi_drum[midi_note] = (name, NBS_instrument, NBS_key - 33)
DRUM_NOTE_TABLE = {
    24: ("Cutting Noise(SFX)",    13, 39),
    25: ("Snare Roll",             3,  8),
    26: ("Finger Snap",            4, 25),
    27: ("High Q",                 3, 18),
    28: ("Slap",                   3, 27),
    29: ("Scratch Push",           4, 16),
    30: ("Scratch Pull",           4, 13),
    31: ("Sticks",                 4,  9),
    32: ("Square Click",           4,  6),
    33: ("Metronome Click",        4,  2),
    34: ("Metronome Bell",         8, 17),
    35: ("Bass Drum 2",            2, 10),
    36: ("Bass Drum 1",            2,  6),
    37: ("Side Stick",             4,  6),
    38: ("Snare Drum 1",           3,  8),
    39: ("Hand Clap",              4,  6),
    40: ("Snare Drum 2",           3,  4),
    41: ("Low Tom 2",              2,  6),
    42: ("Closed Hi-hat",          3, 22),
    43: ("Low Tom 1",              2, 13),
    44: ("Pedal Hi-hat",           3, 22),
    45: ("Mid Tom 2",              2, 15),
    46: ("Open Hi-hat",            3, 18),
    47: ("Mid Tom 1",              2, 20),
    48: ("High Tom 2",             2, 23),
    49: ("Crash Cymbal 1",         3, 17),
    50: ("High Tom 1",             2, 23),
    51: ("Ride Cymbal 1",          3, 24),
    52: ("Chinese Cymbal",         3,  8),
    53: ("Ride Bell",              3, 13),
    54: ("Tambourine",             4, 18),
    55: ("Splash Cymbal",          3, 18),
    56: ("Cowbell",               11,  5),
    57: ("Crash Cymbal 2",         3, 13),
    58: ("Vibraslap",              4,  2),
    59: ("Ride Cymbal 2",          3, 13),
    60: ("High Bongo",             4,  9),
    61: ("Low Bongo",              4,  2),
    62: ("Mute High Conga",        4,  8),
    63: ("Open High Conga",        2, 22),
    64: ("Low Conga",              2, 15),
    65: ("High Timbale",           3, 13),
    66: ("Low Timbale",            3,  8),
    67: ("High Agogo",             9, 12),
    68: ("Low Agogo",              9,  5),
    69: ("Cabasa",                 4, 20),
    70: ("Maracas",                4, 23),
    71: ("Short Whistle",          6, 34),
    72: ("Long Whistle",           6, 33),
    73: ("Short Guiro",            4, 17),
    74: ("Long Guiro",             4, 11),
    75: ("Claves",                 4, 18),
    76: ("High Wood Block",        4, 10),
    77: ("Low Wood Block",         4,  5),
    78: ("Mute Cuica",            12, 25),
    79: ("Open Cuica",            12, 26),
    80: ("Mute Triangle",          4, 16),
    81: ("Open Triangle",          8, 19),
    82: ("Shaker",                 3, 22),
    83: ("Jingle Bell",            8,  6),
    84: ("Bell Tree",              8, 15),
    85: ("Castanets",              4, 21),
    86: ("Mute Surdo",             2, 14),
    87: ("Open Surdo",             2,  7),
}

# NBS 乐器名称列表
INSTRUMENT_NAMES = [
    "Harp/Piano", "Double Bass", "Bass Drum", "Snare Drum", "Click/Sticks",
    "Guitar", "Flute", "Bell/Glock", "Chime/Box", "Xylophone",
    "Iron Xylophone", "Cow Bell", "Didgeridoo", "Bit/Pluck", "Banjo", "Pling/Elec",
    "Copper Horn", "Exposed Copper Horn", "Weathered Copper Horn", "Oxidized Copper Horn"
]

# MIDI 音符名称 (C4 = 中央C, MIDI note 60)
MIDI_NOTE_NAMES = []
NOTE_BASE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
for n in range(128):
    octave = (n // 12) - 1
    name = NOTE_BASE_NAMES[n % 12] + str(octave)
    MIDI_NOTE_NAMES.append(name)


class MIDIHandler:
    """MIDI 文件导入处理 — 完全复刻 NoteBlockStudio"""

    @staticmethod
    def _read_var_len(buffer: io.BytesIO) -> int:
        result = 0
        while True:
            byte = buffer.read(1)[0]
            result = (result << 7) | (byte & 0x7F)
            if not (byte & 0x80):
                break
        return result

    @staticmethod
    def get_midi_info(file_data: bytes) -> dict:
        """获取 MIDI 文件完整信息（含通道、乐器、打击乐、轨道信息）"""
        buffer = io.BytesIO(file_data)

        header = buffer.read(4)
        if header != b'MThd':
            raise ValueError("无效的 MIDI 文件：缺少 MThd 头")

        header_len = struct.unpack('>I', buffer.read(4))[0]
        format_type = struct.unpack('>H', buffer.read(2))[0]
        num_tracks = struct.unpack('>H', buffer.read(2))[0]
        ticks_per_beat = struct.unpack('>H', buffer.read(2))[0]

        if ticks_per_beat == 0:
            ticks_per_beat = 480

        # 收集每个 channel 的 Program Change
        channel_programs = {}  # channel → (program, bank_msb, bank_lsb)
        channel_first_program = {}  # channel → first program seen
        channel_notes = set()  # set of channels that have notes
        channel_note_count = {}  # channel → note count
        channel_min_note = {}  # channel → min note
        channel_max_note = {}  # channel → max note
        percussion_notes = set()  # set of MIDI notes on channel 9
        track_info_list = []
        tempo_us = 500000
        min_tick = float('inf')
        max_tick = 0
        total_notes = 0
        total_events = 0

        for track_num in range(num_tracks):
            try:
                track_header = buffer.read(4)
                if track_header != b'MTrk':
                    continue

                track_len = struct.unpack('>I', buffer.read(4))[0]
                track_end = buffer.tell() + track_len
                current_tick = 0
                last_event_type = None
                track_event_count = 0
                track_note_count = 0
                track_name = f'Track {track_num}'
                track_channels_set = set()  # 该轨道使用的所有通道

                while buffer.tell() < track_end:
                    delta = MIDIHandler._read_var_len(buffer)
                    current_tick += delta

                    data = buffer.read(1)
                    if not data:
                        break
                    status_byte = data[0]

                    if status_byte == 0xFF:  # Meta
                        data = buffer.read(1)
                        if not data:
                            break
                        meta_type = data[0]
                        length = MIDIHandler._read_var_len(buffer)
                        data = buffer.read(length)

                        if meta_type == 0x51 and len(data) >= 3:  # Tempo
                            tempo_us = (data[0] << 16) | (data[1] << 8) | data[2]
                        elif meta_type == 0x03:  # Track name
                            try:
                                track_name = data.decode('latin-1').rstrip('\x00')
                            except:
                                track_name = f"Track {track_num}"
                        else:
                            continue

                    elif status_byte in (0xF0, 0xF7):  # SysEx
                        length = MIDIHandler._read_var_len(buffer)
                        buffer.read(length)

                    elif status_byte < 0x80:  # Running status
                        if last_event_type is not None:
                            buffer.seek(buffer.tell() - 1)
                            status_byte = last_event_type
                        else:
                            continue
                    else:
                        last_event_type = status_byte

                    event_type = (status_byte & 0xF0) >> 4
                    channel = status_byte & 0x0F

                    if event_type == 0x9:  # Note On
                        data = buffer.read(1)
                        if not data:
                            break
                        note = data[0]
                        data = buffer.read(1)
                        if not data:
                            break
                        velocity = data[0]
                        track_event_count += 1
                        if velocity > 0:
                            track_note_count += 1
                            total_notes += 1
                            channel_notes.add(channel)
                            track_channels_set.add(channel)
                            channel_note_count[channel] = channel_note_count.get(channel, 0) + 1
                            if channel not in channel_min_note or note < channel_min_note[channel]:
                                channel_min_note[channel] = note
                            if channel not in channel_max_note or note > channel_max_note[channel]:
                                channel_max_note[channel] = note
                            if current_tick < min_tick:
                                min_tick = current_tick
                            if current_tick > max_tick:
                                max_tick = current_tick
                            if channel == 9:
                                percussion_notes.add(note)

                    elif event_type == 0x8:  # Note Off
                        buffer.read(2)
                        track_event_count += 1

                    elif event_type == 0xC:  # Program Change
                        data = buffer.read(1)
                        if not data:
                            break
                        program = data[0]
                        track_event_count += 1
                        if channel not in channel_first_program:
                            channel_first_program[channel] = program
                        channel_programs[channel] = program

                    elif event_type == 0xA:
                        buffer.read(2)
                        track_event_count += 1
                    elif event_type == 0xB:
                        buffer.read(2)
                        track_event_count += 1
                    elif event_type == 0xD:
                        buffer.read(1)
                        track_event_count += 1
                    elif event_type == 0xE:
                        buffer.read(2)
                        track_event_count += 1

                total_events += track_event_count
            except (IndexError, struct.error):
                raise ValueError(f"MIDI 文件格式损坏或数据不完整 (轨道 {track_num})")
            if track_event_count > 0:
                track_info_list.append({
                    'index': track_num,
                    'name': locals().get('track_name', f'Track {track_num}'),
                    'note_count': track_note_count,
                    'event_count': track_event_count,
                    'channels': sorted(track_channels_set)
                })

        # 构建通道信息
        channels = []
        max_channel = max(channel_notes) if channel_notes else 0
        for ch in range(max_channel + 1):
            if ch in channel_notes or ch in channel_first_program:
                prog = channel_first_program.get(ch, 0)
                if prog < len(GM_PROGRAM_TABLE):
                    prog_name = GM_PROGRAM_TABLE[prog][0]
                    default_ins = GM_PROGRAM_TABLE[prog][1]
                    default_octave = GM_PROGRAM_TABLE[prog][2]
                else:
                    prog_name = "Unknown"
                    default_ins = 0
                    default_octave = 0

                ch_min = channel_min_note.get(ch)
                ch_max = channel_max_note.get(ch)
                channels.append({
                    'channel': ch,
                    'program': prog,
                    'program_name': prog_name,
                    'default_instrument': default_ins,
                    'default_octave': default_octave,
                    'is_percussion': ch == 9,
                    'note_count': channel_note_count.get(ch, 0),
                    'min_note': ch_min,
                    'max_note': ch_max
                })

        # 构建打击乐信息
        percussion = []
        for note in sorted(percussion_notes):
            if note in DRUM_NOTE_TABLE:
                name, default_ins, default_pitch_offset = DRUM_NOTE_TABLE[note]
                # DRUM_NOTE_TABLE 第 3 项是 NBS_key - 33，显示/导出需用实际 NBS key
                default_pitch = default_pitch_offset + 33
            else:
                name = f"Note {note}"
                default_ins = 0
                default_pitch = max(0, min(87, note - 21))
            percussion.append({
                'note': note,
                'name': name,
                'default_instrument': default_ins,
                'default_pitch': default_pitch
            })

        # 时长
        if max_tick > 0 and tempo_us > 0:
            duration_seconds = (max_tick - min_tick) / ticks_per_beat * (tempo_us / 1_000_000.0)
        else:
            duration_seconds = 0

        hours = int(duration_seconds // 3600)
        minutes = int((duration_seconds % 3600) // 60)
        seconds = int(duration_seconds % 60)
        duration_str = f'{hours}:{minutes:02d}:{seconds:02d}' if hours > 0 else f'{minutes}:{seconds:02d}'

        return {
            'ticks_per_beat': ticks_per_beat,
            'track_count': len(track_info_list),
            'total_notes': total_notes,
            'total_events': total_events,
            'duration': duration_str,
            'duration_seconds': round(duration_seconds, 1),
            'type': 'Type 0' if format_type == 0 else ('Type 1' if format_type == 1 else 'Type 2'),
            'tracks': track_info_list,
            'channels': channels,
            'percussion': percussion,
            'tempo_us': tempo_us,
            'min_tick': min_tick if min_tick != float('inf') else 0,
            'max_tick': max_tick
        }

    @staticmethod
    def import_midi(
        file_data: bytes,
        # 通道映射: {channel: instrument}  (None = 使用拟合, -1 = ignore)
        channel_instruments: Optional[Dict[int, Any]] = None,
        # 通道八度: {channel: octave_offset}
        channel_octaves: Optional[Dict[int, int]] = None,
        # 通道 key 微调: {channel: semitone_offset}
        channel_keys: Optional[Dict[int, int]] = None,
        # 打击乐映射: {midi_note: instrument}  (-1 = ignore)
        percussion_instruments: Optional[Dict[int, int]] = None,
        # 打击乐音高: {midi_note: nbs_key}
        percussion_pitches: Optional[Dict[int, int]] = None,
        # 设置
        remove_silent: bool = True,
        name_layers: bool = True,
        name_after_patches: bool = True,
        same_tempo: bool = True,
        tempo_changes: bool = False,
        keep_octave: bool = True,
        read_velocity: bool = True,
        precision: int = 1,
        # 保持音符长度: 'none' = 不保持, 'all' = 全部应用, 'sustain' = 仅对指定轨道应用
        keep_note_length: str = 'none',
        # 需要应用延音的 MIDI 轨道索引列表（仅 keep_note_length='sustain' 时生效）
        sustain_tracks: Optional[List[int]] = None,
        # 音色拟合: {channel: [slot1, slot2, slot3]}  每个 slot 为 NBS 乐器 ID, -1 表示不使用
        timbre_fitting: Optional[Dict[int, list]] = None,
        # 打击乐拟合: {midi_note: [slot1, slot2, slot3]}
        percussion_fitting: Optional[Dict[int, list]] = None,
        # 排除生成的 MIDI 轨道索引列表
        excluded_tracks: Optional[List[int]] = None,
        # 音符吸附 (量化到节拍网格)
        snap_enabled: bool = False,
        # 吸附拍子分母: 2=1/2拍, 4=1/4拍, 8=1/8拍, 16=1/16拍, 32=1/32拍
        snap_beat: int = 4,
    ) -> Song:
        """导入 MIDI 文件 — 完全复刻 NoteBlockStudio 转换逻辑"""
        if excluded_tracks is None:
            excluded_tracks = []
        excluded_tracks = set(int(t) for t in excluded_tracks)
        if sustain_tracks is None:
            sustain_tracks = []
        sustain_tracks = set(int(t) for t in sustain_tracks)

        buffer = io.BytesIO(file_data)
        song = Song()
        song.name = "Imported MIDI"
        song.tempo = 20  # 整数 TPS, 避免显示小数

        # ---- 读取 MIDI 头 ----
        header = buffer.read(4)
        if header != b'MThd':
            raise ValueError("无效的 MIDI 文件：缺少 MThd 头")

        header_len = struct.unpack('>I', buffer.read(4))[0]
        format_type = struct.unpack('>H', buffer.read(2))[0]
        num_tracks = struct.unpack('>H', buffer.read(2))[0]
        ticks_per_beat = struct.unpack('>H', buffer.read(2))[0]

        if ticks_per_beat == 0:
            ticks_per_beat = 480

        # ---- 初始化默认映射 ----
        if channel_instruments is None:
            channel_instruments = {}
        if channel_octaves is None:
            channel_octaves = {}
        if channel_keys is None:
            channel_keys = {}
        if percussion_instruments is None:
            percussion_instruments = {}
        if percussion_pitches is None:
            percussion_pitches = {}
        if timbre_fitting is None:
            timbre_fitting = {}
        if percussion_fitting is None:
            percussion_fitting = {}

        # 修复 JSON 序列化将整数键转为字符串的问题
        if channel_instruments:
            channel_instruments = {int(k): v for k, v in channel_instruments.items()}
        if channel_octaves:
            channel_octaves = {int(k): v for k, v in channel_octaves.items()}
        if channel_keys:
            channel_keys = {int(k): v for k, v in channel_keys.items()}
        if percussion_instruments:
            percussion_instruments = {int(k): v for k, v in percussion_instruments.items()}
        if percussion_pitches:
            percussion_pitches = {int(k): v for k, v in percussion_pitches.items()}
        if timbre_fitting:
            timbre_fitting = {int(k): [int(x) for x in v] for k, v in timbre_fitting.items()}
        if percussion_fitting:
            percussion_fitting = {int(k): [int(x) for x in v] for k, v in percussion_fitting.items()}

        # 为未配置的通道填充默认值: 默认使用拟合音色(None), 不应用八度/key 偏移
        for ch in range(16):
            if ch not in channel_instruments:
                channel_instruments[ch] = None  # 默认使用拟合
            if ch not in channel_octaves:
                channel_octaves[ch] = 0
            if ch not in channel_keys:
                channel_keys[ch] = 0

        # ---- 收集所有 Note On 事件 ----
        # 每个事件: {tick, channel, note, velocity, duration_ticks, track}
        # duration_ticks 通过 Note Off 事件计算
        events = []
        tempo_microseconds = 500000
        initial_tempo_us = 500000
        tempo_changes_list = []

        # 跟踪活跃的 Note On（用于计算 note length）
        active_notes = {}  # (channel, note) → {tick, velocity}
        channel_first_program = {}  # channel → first program seen

        for track_num in range(num_tracks):
            try:
                track_header = buffer.read(4)
                if track_header != b'MTrk':
                    continue

                track_len = struct.unpack('>I', buffer.read(4))[0]
                track_end = buffer.tell() + track_len

                # 跳过排除生成的轨道
                if track_num in excluded_tracks:
                    buffer.seek(track_end)
                    continue

                current_tick = 0
                last_event_type = None

                while buffer.tell() < track_end:
                    delta = MIDIHandler._read_var_len(buffer)
                    current_tick += delta

                    data = buffer.read(1)
                    if not data:
                        break
                    status_byte = data[0]

                    if status_byte == 0xFF:  # Meta
                        data = buffer.read(1)
                        if not data:
                            break
                        meta_type = data[0]
                        length = MIDIHandler._read_var_len(buffer)
                        data = buffer.read(length)

                        if meta_type == 0x51 and len(data) >= 3:
                            tempo_microseconds = (data[0] << 16) | (data[1] << 8) | data[2]
                            if not tempo_changes_list:
                                initial_tempo_us = tempo_microseconds
                            tempo_changes_list.append({
                                'tick': current_tick,
                                'tempo_us': tempo_microseconds
                            })

                    elif status_byte in (0xF0, 0xF7):
                        length = MIDIHandler._read_var_len(buffer)
                        buffer.read(length)

                    elif status_byte < 0x80:
                        if last_event_type is not None:
                            buffer.seek(buffer.tell() - 1)
                            status_byte = last_event_type
                        else:
                            continue
                    else:
                        last_event_type = status_byte

                    event_type = (status_byte & 0xF0) >> 4
                    channel = status_byte & 0x0F

                    if event_type == 0x9:  # Note On
                        data = buffer.read(1)
                        if not data:
                            break
                        note = data[0]
                        data = buffer.read(1)
                        if not data:
                            break
                        velocity = data[0]
                        if velocity > 0:
                            key = (channel, note)
                            active_notes[key] = {
                                'tick': current_tick,
                                'velocity': velocity
                            }
                        else:
                            # velocity=0 = Note Off
                            key = (channel, note)
                            if key in active_notes:
                                start_info = active_notes.pop(key)
                                events.append({
                                    'tick': start_info['tick'],
                                    'channel': channel,
                                    'note': note,
                                    'velocity': start_info['velocity'],
                                    'duration_ticks': current_tick - start_info['tick'],
                                    'track': track_num
                                })

                    elif event_type == 0x8:  # Note Off
                        data = buffer.read(1)
                        if not data:
                            break
                        note = data[0]
                        data = buffer.read(1)
                        if not data:
                            break
                        velocity = data[0]  # release velocity, ignored
                        key = (channel, note)
                        if key in active_notes:
                            start_info = active_notes.pop(key)
                            events.append({
                                'tick': start_info['tick'],
                                'channel': channel,
                                'note': note,
                                'velocity': start_info['velocity'],
                                'duration_ticks': current_tick - start_info['tick'],
                                'track': track_num
                            })

                    elif event_type == 0xC:  # Program Change
                        data = buffer.read(1)
                        if not data:
                            break
                        program = data[0]
                        if channel not in channel_first_program:
                            channel_first_program[channel] = program
                    elif event_type == 0xA:
                        buffer.read(2)
                    elif event_type == 0xB:
                        buffer.read(2)
                    elif event_type == 0xD:
                        buffer.read(1)
                    elif event_type == 0xE:
                        buffer.read(2)
            except (IndexError, struct.error):
                raise ValueError(f"MIDI 文件格式损坏或数据不完整 (轨道 {track_num})")

        # 处理未关闭的 Note On
        for key, start_info in active_notes.items():
            events.append({
                'tick': start_info['tick'],
                'channel': key[0],
                'note': key[1],
                'velocity': start_info['velocity'],
                'duration_ticks': 1,  # 最小长度
                'track': track_num
            })

        if not events:
            return song

        # ---- 计算 tick 范围 ----
        min_tick = min(e['tick'] for e in events)
        max_tick = max(e['tick'] for e in events)

        # ---- delta_per_tick (参照 NBS: (midi_tempo & 0x7FFF) / 4 / (precision + 1)) ----
        # precision 映射: 0→1x, 1→2x, 3→4x, 7→8x
        precision_map = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5}
        prec_val = precision_map.get(precision, 1)
        delta_per_tick = (ticks_per_beat & 0x7FFF) / 4.0 / (prec_val + 1)

        # ---- 移除开头静音部分 (参照 NBS remove_silent) ----
        silent_offset = min_tick if remove_silent else 0

        # 确定最大 NBS tick
        max_nbs_tick = int((max_tick - silent_offset) / delta_per_tick)

        # ---- 计算吸附网格 (snap_enabled 时量化 NBS 音符位置到最近的节拍网格线) ----
        # PPQ = ticks_per_beat, 1/4 拍 (四分音符) = PPQ MIDI ticks
        # snap_beat 为分母: 2=1/2拍, 4=1/4拍, 8=1/8拍, 16=1/16拍, 32=1/32拍
        if snap_enabled and snap_beat > 0:
            midi_ticks_per_grid = ticks_per_beat * 4.0 / snap_beat
            nbs_ticks_per_grid = max(1, int(round(midi_ticks_per_grid / delta_per_tick)))
        else:
            nbs_ticks_per_grid = 1

        # ---- 计算建议 TPS (参照 NoteBlockStudio 公式) ----
        if max_nbs_tick > 0 and initial_tempo_us > 0 and max_tick > 0:
            midi_songlength_seconds = (max_tick - silent_offset) / ticks_per_beat * (initial_tempo_us / 1_000_000.0)
            enda = float(max_nbs_tick)
            if midi_songlength_seconds > 0:
                tempo_raw = 10.0 / (midi_songlength_seconds / (enda / 10.0))
                song.tempo = max(5.0, min(80.0, tempo_raw))
                # 四舍五入到整数, 避免小数 TPS
                song.tempo = round(song.tempo)

        # ---- 计算每个 channel 需要的层数 (channelheight) ----
        # 参照 NBS: 第一遍扫描确定每个 channel 在每个 NBS tick 处同时发音的最大音符数
        channel_used_ticks = {}  # (channel, nbs_tick) → count

        for e in events:
            ch = e['channel']
            # 检查是否忽略该通道
            if ch == 9:
                if percussion_instruments.get(e['note'], -1) == -1:
                    continue
            else:
                inst = channel_instruments.get(ch, None)
                # -1 表示显式忽略该通道; None 表示使用拟合音色; 其他数值表示指定乐器
                if inst == -1:
                    continue
                if inst is None:
                    # 有拟合则后续处理, 无拟合则使用 GM 默认映射
                    if timbre_fitting and ch in timbre_fitting:
                        if timbre_fitting[ch][0] < 0:
                            continue
                    # 没有拟合也继续, 后续会用 GM 默认映射

            nbs_tick_raw = (e['tick'] - silent_offset) / delta_per_tick
            nbs_tick = int(round(nbs_tick_raw / nbs_ticks_per_grid) * nbs_ticks_per_grid) if nbs_ticks_per_grid > 1 else int(nbs_tick_raw)
            key = (ch, nbs_tick)
            channel_used_ticks[key] = channel_used_ticks.get(key, 0) + 1

        channel_layers_needed = {}
        for (ch, tick), count in channel_used_ticks.items():
            if ch not in channel_layers_needed:
                channel_layers_needed[ch] = 0
            channel_layers_needed[ch] = max(channel_layers_needed[ch], count)

        # ---- 构建 channel → 起始 layer 映射 ----
        channel_layer_offset = {}
        current_layer = 0
        if tempo_changes:
            current_layer = 1  # 为速度变化器预留 layer 0
        max_channel = max(e['channel'] for e in events)
        for ch in range(max_channel + 1):
            channel_layer_offset[ch] = current_layer
            current_layer += channel_layers_needed.get(ch, 1)

        # ---- 转换音符 ----
        layer_counters = {}  # (channel, nbs_tick) → used layers so far

        for e in events:
            nbs_tick_raw = (e['tick'] - silent_offset) / delta_per_tick
            nbs_tick = int(round(nbs_tick_raw / nbs_ticks_per_grid) * nbs_ticks_per_grid) if nbs_ticks_per_grid > 1 else int(nbs_tick_raw)
            ch = e['channel']
            midi_note = e['note']

            # 确定乐器和音高
            if ch == 9:  # 鼓组
                drum_fitting = percussion_fitting.get(midi_note)
                if drum_fitting and drum_fitting[0] >= 0:
                    # 使用打击乐拟合音色
                    inst = drum_fitting[0]
                else:
                    inst = percussion_instruments.get(midi_note, -1)
                    if inst == -1:
                        continue
                nbs_key = percussion_pitches.get(midi_note)
                if nbs_key is None:
                    # 使用默认音高：DRUM_NOTE_TABLE 存储的是 NBS_key - 33，需 +33 还原
                    drum_info = DRUM_NOTE_TABLE.get(midi_note)
                    if drum_info:
                        nbs_key = drum_info[2] + 33
                    else:
                        nbs_key = max(0, min(87, midi_note - 21))
                instrument = inst
            else:
                inst = channel_instruments.get(ch, None)
                if inst == -1:
                    continue
                # 如果 inst 为 None, 优先使用拟合音色 slot1, 否则使用 GM 默认映射
                if inst is None:
                    if timbre_fitting and ch in timbre_fitting:
                        inst = timbre_fitting[ch][0]
                        if inst < 0:
                            continue
                    else:
                        # 使用 GM 默认映射
                        prog = channel_first_program.get(ch, 0)
                        if prog < len(GM_PROGRAM_TABLE):
                            inst = GM_PROGRAM_TABLE[prog][1]
                        else:
                            inst = 0
                instrument = inst
                octave_offset = channel_octaves.get(ch, 0)
                key_offset = channel_keys.get(ch, 0)

                # 核心转换: MIDI note - 21 → NBS key, 然后加 octave offset 和 key 微调
                nbs_key = midi_note - 21 + 12 * octave_offset + key_offset

                # keep_octave (参照 NBS w_midi_octave): 仅当用户未手动设置偏移时才折叠到 Minecraft 标准音域 33~57
                if keep_octave and octave_offset == 0 and key_offset == 0:
                    while nbs_key < 33:
                        nbs_key += 12
                    while nbs_key > 57:
                        nbs_key -= 12

                # 确保最终结果在 NBS 可播放范围 0~87 内; 若仍越界则按八度自动偏移并钳制
                if nbs_key < 0 or nbs_key > 87:
                    while nbs_key < 0:
                        nbs_key += 12
                    while nbs_key > 87:
                        nbs_key -= 12
                    nbs_key = max(0, min(87, nbs_key))

            # 计算 layer
            base_layer = channel_layer_offset.get(ch, 0)
            key = (ch, nbs_tick)
            used = layer_counters.get(key, 0)
            layer = base_layer + used
            layer_counters[key] = used + 1

            # velocity
            if read_velocity:
                velocity = min(100, int(e['velocity'] / 127.0 * 100))
            else:
                velocity = 100

            # 计算 note length (NBS ticks)
            duration_ticks = e.get('duration_ticks', 1)
            note_length = max(1, int(duration_ticks / delta_per_tick))

            # pitch 字段存储 note_length (用于播放时判断延音)
            pitch_val = min(255, max(0, note_length))

            # ---- 判断是否需要保持音符长度 ----
            track_idx = e.get('track', 0)
            should_sustain = False
            if keep_note_length == 'all':
                should_sustain = True
            elif keep_note_length == 'sustain':
                should_sustain = track_idx in sustain_tracks

            song.notes.append(Note(
                tick=nbs_tick,
                layer=layer,
                instrument=instrument,
                key=nbs_key,
                velocity=velocity,
                pan=50,
                pitch=pitch_val
            ))

            # ---- 音色拟合: 为该 MIDI 音符生成额外的 NBS 音符 (slot2/slot3) ----
            if timbre_fitting and ch in timbre_fitting:
                fitting_slots = timbre_fitting[ch]
                # slot1 已在上面生成, 这里处理 slot2 和 slot3
                for slot_idx in range(1, len(fitting_slots)):
                    slot_inst = fitting_slots[slot_idx]
                    if slot_inst >= 0:
                        # 为这个 slot 分配新 layer
                        used2 = layer_counters.get(key, 0)
                        fit_layer = base_layer + used2
                        layer_counters[key] = used2 + 1
                        song.notes.append(Note(
                            tick=nbs_tick,
                            layer=fit_layer,
                            instrument=slot_inst,
                            key=nbs_key,
                            velocity=velocity,
                            pan=50,
                            pitch=pitch_val
                        ))
                        # 保持音符长度也应用于 slot2/slot3
                        if should_sustain:
                            effective_length = max(2, note_length)
                            for sustain_tick in range(1, effective_length):
                                target_tick = nbs_tick + sustain_tick
                                sustain_key = (ch, target_tick)
                                used_s = layer_counters.get(sustain_key, 0)
                                sustain_layer = base_layer + used_s
                                layer_counters[sustain_key] = used_s + 1
                                song.notes.append(Note(
                                    tick=target_tick,
                                    layer=sustain_layer,
                                    instrument=slot_inst,
                                    key=nbs_key,
                                    velocity=velocity,
                                    pan=50,
                                    pitch=pitch_val
                                ))

            # ---- 打击乐拟合: 为鼓点生成额外的 NBS 音符 (slot2/slot3) ----
            if ch == 9 and percussion_fitting and midi_note in percussion_fitting:
                fitting_slots = percussion_fitting[midi_note]
                # slot1 已在上文生成, 这里处理 slot2 和 slot3
                for slot_idx in range(1, len(fitting_slots)):
                    slot_inst = fitting_slots[slot_idx]
                    if slot_inst >= 0:
                        used2 = layer_counters.get(key, 0)
                        fit_layer = base_layer + used2
                        layer_counters[key] = used2 + 1
                        song.notes.append(Note(
                            tick=nbs_tick,
                            layer=fit_layer,
                            instrument=slot_inst,
                            key=nbs_key,
                            velocity=velocity,
                            pan=50,
                            pitch=pitch_val
                        ))

            # ---- 保持音符长度: 在后续 tick 重复放置音符 ----
            # 'all': 所有音符都重复放置
            # 'sustain': 仅延音乐器 (管乐器/电子音) 重复放置
            if should_sustain:
                # 修复: 即使 note_length=1 (短音符), 也至少延长到 2 tick
                # 这样 32分音符等极短音符也能产生延音效果
                effective_length = max(2, note_length)
                for sustain_tick in range(1, effective_length):
                    target_tick = nbs_tick + sustain_tick
                    if target_tick > max_nbs_tick + 100:
                        break
                    # 查找可用的 layer (避免冲突)
                    sustain_key = (ch, target_tick)
                    sustain_used = layer_counters.get(sustain_key, 0)
                    sustain_layer = base_layer + sustain_used
                    layer_counters[sustain_key] = sustain_used + 1
                    song.notes.append(Note(
                        tick=target_tick,
                        layer=sustain_layer,
                        instrument=instrument,
                        key=nbs_key,
                        velocity=velocity,
                        pan=50,
                        pitch=0  # 延续音符, pitch=0
                    ))

        # ---- 添加速度变化器 (参照 NBS tempo_changer) ----
        if tempo_changes and tempo_changes_list:
            # 添加 Tempo Changer instrument 到 layer 0
            for tc in tempo_changes_list:
                pos = int((tc['tick'] - silent_offset) / delta_per_tick)
                if pos < 0:
                    pos = 0
                # tempo_changer_tempo * (precision + 1) → NBS tempo value
                tempo_val = tc['tempo_us']
                # 转换为 NBS tempo 格式: 60000000 / tempo_us / 100 * (precision + 1)
                # 简化：直接存储为 bpm 相关值
                nbs_tempo_raw = 60000000.0 / tempo_val  # BPM
                nbs_tps = nbs_tempo_raw / 15.0 * (prec_val + 1)

                # 查找是否已有该位置的音符
                existing = [n for n in song.notes if n.tick == pos and n.layer == 0]
                if existing:
                    existing[0].key = 39  # tempo changer 默认 key
                    existing[0].velocity = int(nbs_tps)
                else:
                    song.notes.append(Note(
                        tick=pos,
                        layer=0,
                        instrument=0,  # 使用第一个自定义乐器或默认
                        key=39,
                        velocity=int(nbs_tps),
                        pan=50,
                        pitch=0
                    ))

        # ---- 构建 layers 列表并命名 ----
        max_layer = max((n.layer for n in song.notes), default=0)
        for l in range(max_layer + 1):
            song.layers.append(Layer(name=f"Layer {l+1}", volume=100, stereo=100))

        # ---- 构建 layer → channel 映射 (用于前端音轨排除/静音联动) ----
        for ch, offset in channel_layer_offset.items():
            count = channel_layers_needed.get(ch, 1)
            for l in range(offset, offset + count):
                song.layer_channel_map[l] = ch

        # 图层命名 (参照 NBS name_layers)
        if name_layers:
            yy = 0
            if tempo_changes:
                song.layers[yy].name = "TempoChgr"
                yy += 1
            for ch in range(max_channel + 1):
                for b in range(channel_layers_needed.get(ch, 0)):
                    if yy < len(song.layers):
                        layer = song.layers[yy]
                        layer.stereo = 100
                        if name_after_patches:
                            if ch == 9:
                                layer.name = "Percussion"
                            else:
                                # 获取通道使用的乐器名
                                prog = channel_first_program.get(ch, 0)
                                if prog < len(GM_PROGRAM_TABLE):
                                    layer.name = GM_PROGRAM_TABLE[prog][0]
                                else:
                                    layer.name = f"Channel {ch + 1}"
                        else:
                            layer.name = f"Channel {ch + 1}"
                        layer.volume = 100
                    yy += 1

        # ---- 音色拟合: 重命名对应图层 ----
        if timbre_fitting:
            # 收集每个 layer 上使用的乐器, 用于确定图层名称
            layer_instruments = {}  # {layer: instrument}
            for n in song.notes:
                layer_instruments[n.layer] = n.instrument
            # 重命名: 格式 "乐器名(通道N)"
            for ch, slots in timbre_fitting.items():
                for slot_idx, slot_inst in enumerate(slots):
                    if slot_inst >= 0:
                        # 找到对应 layer
                        for layer_idx, inst in layer_instruments.items():
                            # 粗略匹配: 该 layer 的乐器 == slot_inst 且 layer >= channel_layer_offset
                            base_offset = channel_layer_offset.get(ch, 0)
                            if inst == slot_inst and layer_idx >= base_offset and layer_idx < len(song.layers):
                                inst_name = INSTRUMENT_NAMES[slot_inst] if slot_inst < len(INSTRUMENT_NAMES) else f"Inst {slot_inst}"
                                # 只在 slot1 (第一个) 时基于通道命名, slot2/slot3 加编号
                                if slot_idx == 0:
                                    song.layers[layer_idx].name = f"{inst_name}(通道{ch})"
                                else:
                                    song.layers[layer_idx].name = f"{inst_name}(通道{ch}-{slot_idx+1})"
                                # 不再重复命名同一 layer
                                del layer_instruments[layer_idx]
                                break

        # 最终保险: TPS 始终为整数, 避免显示一长串小数
        song.tempo = int(round(song.tempo))

        return song
