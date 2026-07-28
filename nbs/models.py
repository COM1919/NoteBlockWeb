from dataclasses import dataclass, field
from typing import List, Optional, Dict


@dataclass
class Note:
    """音符数据模型"""
    tick: int = 0          # 时间位置
    layer: int = 0         # 音层
    instrument: int = 0    # 乐器编号 0-14
    key: int = 33         # 音高 0-87 (F#0 = 33, F#5 = 57)
    velocity: int = 100   # 音量 0-100
    pan: int = 50         # 声像 0-100
    pitch: int = 0        # 音调偏移

    def __post_init__(self):
        self.key = max(0, min(87, self.key))
        self.velocity = max(0, min(100, self.velocity))
        self.pan = max(0, min(100, self.pan))

    @property
    def id(self) -> str:
        return f"note_{self.tick}_{self.layer}"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "tick": self.tick,
            "layer": self.layer,
            "instrument": self.instrument,
            "key": self.key,
            "velocity": self.velocity,
            "pan": self.pan,
            "pitch": self.pitch
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Note':
        return cls(
            tick=data.get("tick", 0),
            layer=data.get("layer", 0),
            instrument=data.get("instrument", 0),
            key=data.get("key", 33),
            velocity=data.get("velocity", 100),
            pan=data.get("pan", 50),
            pitch=data.get("pitch", 0)
        )


@dataclass
class Layer:
    """音层数据模型"""
    name: str = ""
    volume: int = 100     # 音量 0-100
    stereo: int = 100     # 立体声位置 0-100
    lock: int = 0         # 0=unlocked, 1=locked, 2=solo


@dataclass
class CustomInstrument:
    """自定义乐器"""
    name: str = ""
    filename: str = ""
    key: int = 0
    press_time: int = 0


@dataclass
class Song:
    """歌曲数据模型"""
    name: str = ""
    author: str = ""
    original_author: str = ""
    description: str = ""
    tempo: float = 20.0   # ticks per second
    auto_save: bool = False
    auto_save_minutes: int = 0
    time_signature: int = 4
    layers: List[Layer] = field(default_factory=list)
    custom_instruments: List[CustomInstrument] = field(default_factory=list)
    notes: List[Note] = field(default_factory=list)
    # layer → MIDI channel 映射 (仅 MIDI 导入时填充, 用于音轨排除/静音联动)
    layer_channel_map: Dict[int, int] = field(default_factory=dict)

    @property
    def length(self) -> int:
        """歌曲长度（最大tick位置）"""
        if not self.notes:
            return 0
        return max(n.tick for n in self.notes) + 1

    @property
    def layer_count(self) -> int:
        """音层数量"""
        if not self.notes:
            return 0
        return max(n.layer for n in self.notes) + 1

    @property
    def note_count(self) -> int:
        """音符数量"""
        return len(self.notes)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "song_name": self.name,  # 兼容旧前端引用
            "author": self.author,
            "original_author": self.original_author,
            "description": self.description,
            "tempo": self.tempo,
            "auto_save": self.auto_save,
            "auto_save_minutes": self.auto_save_minutes,
            "time_signature": self.time_signature,
            "length": self.length,
            "layers": [{"name": l.name, "volume": l.volume, "stereo": l.stereo, "lock": l.lock} for l in self.layers],
            "note_count": self.note_count,
            "notes": [n.to_dict() for n in self.notes],
            "layer_channel_map": dict(self.layer_channel_map)
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Song':
        song = cls(
            name=data.get("name", ""),
            author=data.get("author", ""),
            original_author=data.get("original_author", ""),
            description=data.get("description", ""),
            tempo=data.get("tempo", 20.0),
            auto_save=data.get("auto_save", False),
            auto_save_minutes=data.get("auto_save_minutes", 0),
            time_signature=data.get("time_signature", 4)
        )

        # 解析音符
        for note_data in data.get("notes", []):
            song.notes.append(Note.from_dict(note_data))

        # 解析 layers
        for layer_data in data.get("layers", []):
            song.layers.append(Layer(
                name=layer_data.get("name", ""),
                volume=layer_data.get("volume", 100),
                stereo=layer_data.get("stereo", 100),
                lock=layer_data.get("lock", 0)
            ))

        return song

    def add_note(self, note: Note):
        """添加音符"""
        self.notes.append(note)

    def remove_note(self, tick: int, layer: int) -> bool:
        """删除指定位置的音符"""
        for i, n in enumerate(self.notes):
            if n.tick == tick and n.layer == layer:
                self.notes.pop(i)
                return True
        return False

    def get_note(self, tick: int, layer: int) -> Optional[Note]:
        """获取指定位置的音符"""
        for n in self.notes:
            if n.tick == tick and n.layer == layer:
                return n
        return None

    def get_notes_in_range(self, tick_start: int, tick_end: int,
                          layer_start: int, layer_end: int) -> List[Note]:
        """获取指定范围内的音符"""
        result = []
        for n in self.notes:
            if tick_start <= n.tick <= tick_end and layer_start <= n.layer <= layer_end:
                result.append(n)
        return result
