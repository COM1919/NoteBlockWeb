"""
WebNBS - 基于网页的 NBS 音符块编曲工具
FastAPI 主应用
"""
import os
import uuid
import base64
import json
import time
from typing import Optional, List, Dict
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, Response, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel
import asyncio

from nbs.models import Song, Note
from nbs.nbs_handler import NBSHandler, INSTRUMENT_NAMES
from nbs.midi_handler import MIDIHandler

# ============ 加载配置文件 ============
# 默认配置文件模板 (带注释, 首次启动时自动写入 config.yaml)
_DEFAULT_CONFIG_YAML = """# WebNBS 配置文件
# 修改后需重启服务生效

# 服务器监听配置
server:
  # 监听 IP
  # - 0.0.0.0 : 公开服务, 接受任意IP访问 (公网模式)
  # - 127.0.0.1 : 仅本机访问 (本地开发模式)
  host: 0.0.0.0
  # 监听端口
  port: 8000

# 公开模式配置
# - true  : 公开为站点, 任何人可访问, 多用户可并发编辑自己的 NBS
# - false : 本地/受控模式, 仅受信任用户访问
public: true

# 隐私政策 (首次访问时强制同意)
privacy:
  # 是否启用隐私弹窗
  enabled: true
  # 隐私政策内容 (简短一句话)
  message: "本服务会上传MIDI或NBS文件用于解析，解析结果仅在当前会话期间临时使用，不会持久保留，也不会收集用户隐私。"

# 版本更新提示：修改版本号或内容后，客户端会在下次访问时显示更新日志
release:
  version: "2.4.9"
  notes: |
    欢迎使用 WebNBS。
    修改此处的 version 或 notes 后, 客户端会在下次访问时显示更新日志。

# 高级配置 (可选)
advanced:
  # 工作线程数 (当前版本使用内存会话, 强制单 worker 以保证多用户隔离)
  # 如需多 worker 并发, 需配合外部缓存(如 Redis) 存储会话
  workers: 1
  # 临时文件保留时间 (秒), 超时自动清理
  temp_cleanup_seconds: 3600
  # MIDI/NBS 文件最大大小 (MB)
  max_upload_size_mb: 50
"""


def load_config():
    """加载 config.yaml 配置文件, 不存在则自动创建默认配置"""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.yaml')
    default_config = {
        'server': {'host': '0.0.0.0', 'port': 8000},
        'public': True,
        'privacy': {
            'enabled': True,
            'message': '本服务会上传MIDI或NBS文件用于解析，解析后会立即清除数据，不会保留，也不会收集用户隐私。'
        },
        'release': {
            'version': '2.4.9',
            'notes': 'See config.yaml for the current release notes.'
        },
        'advanced': {
            'workers': 4,
            'temp_cleanup_seconds': 3600,
            'max_upload_size_mb': 50
        }
    }
    if not os.path.exists(config_path):
        # 配置文件不存在, 自动创建带注释的默认配置
        try:
            import yaml
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write(_DEFAULT_CONFIG_YAML)
            print(f"[WebNBS] 已自动创建默认配置文件: {config_path}")
        except ImportError:
            print("[警告] 未安装 PyYAML, 无法写入默认配置文件, 使用内存默认配置. pip install pyyaml")
        except Exception as e:
            print(f"[警告] 创建默认 config.yaml 失败: {e}, 使用内存默认配置")
        return default_config
    try:
        import yaml
        with open(config_path, 'r', encoding='utf-8') as f:
            user_config = yaml.safe_load(f) or {}
        # 合并配置
        for key in default_config:
            if key in user_config:
                if isinstance(default_config[key], dict):
                    if isinstance(user_config[key], dict):
                        default_config[key].update(user_config[key])
                    else:
                        default_config[key] = user_config[key]
                else:
                    default_config[key] = user_config[key]
        return default_config
    except ImportError:
        print("[警告] 未安装 PyYAML, 使用默认配置. pip install pyyaml")
        return default_config
    except Exception as e:
        print(f"[警告] 加载 config.yaml 失败: {e}, 使用默认配置")
        return default_config


CONFIG = load_config()


# 创建 FastAPI 应用
app = FastAPI(title="WebNBS", description="基于网页的 NBS 音符块编曲工具")

# 启用 GZip 压缩 (小响应不压缩, 大响应自动压缩, 显著降低 JSON 体积)
# 客户端需带 Accept-Encoding: gzip
app.add_middleware(GZipMiddleware, minimum_size=512, compresslevel=6)

# 配置静态文件
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SF2_DIR = os.path.join(BASE_DIR, "sf2")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ========== SoundFont 音色库配置 ==========
# 从 sf2/config.yaml 读取移动端/PC端音色库配置。
# 配置支持 url（客户端直链下载，减少服务器压力）或 file（从本服务器 /sf2/<file> 下载）。
def load_sf2_config():
    """加载 sf2/config.yaml，返回标准化后的移动端/PC端音色库配置"""
    config_path = os.path.join(SF2_DIR, 'config.yaml')
    default = {'mobile': None, 'pc': None}
    if not os.path.exists(config_path):
        return default
    try:
        import yaml
        with open(config_path, 'r', encoding='utf-8') as f:
            cfg = yaml.safe_load(f) or {}
    except Exception as e:
        print(f"[警告] 加载 sf2/config.yaml 失败: {e}")
        return default

    def _normalize(entry, key):
        if not isinstance(entry, dict):
            return None
        name = entry.get('name') or ('移动端音色库' if key == 'mobile' else 'PC 端音色库')
        url = str(entry.get('url', '')).strip()
        file = str(entry.get('file', '')).strip()
        # 优先使用 url；没有 url 时使用 file
        source = url if url else file
        source_type = 'url' if url else ('file' if file else None)
        if not source_type:
            return None
        return {'name': name, 'source': source, 'type': source_type}

    return {
        'mobile': _normalize(cfg.get('mobile'), 'mobile'),
        'pc': _normalize(cfg.get('pc'), 'pc')
    }


SF2_CONFIG = load_sf2_config()

# 服务器配置 (从 config.yaml 读取)
SERVER_HOST = CONFIG.get('server', {}).get('host', '0.0.0.0')
SERVER_PORT = CONFIG.get('server', {}).get('port', 8000)
IS_PUBLIC = CONFIG.get('public', True)

# ========== 用户身份隔离 ==========
# 服务端不持久化用户数据, 仅在内存中保存当前会话用于解析/转换
# 客户端生成 user_id 存 cookie, 每次请求带 cookie 标识身份
# 公开模式下, 服务端不会将任何会话数据与真实身份关联
USER_COOKIE_NAME = "webnbs_uid"
USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365  # 1年

MAX_USER_SESSIONS = 1000
MAX_UPLOAD_SIZE_MB = CONFIG.get('advanced', {}).get('max_upload_size_mb', 50)
MAX_UPLOAD_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024


class UserSession:
    """每个用户的独立会话状态, 避免多用户间数据串扰"""
    __slots__ = ('song', 'song_path', 'tick', 'is_playing', 'speed', 'clipboard', 'last_access')

    def __init__(self):
        self.song: Optional[Song] = None
        self.song_path: Optional[str] = None
        self.tick: int = 0
        self.is_playing: bool = False
        self.speed: float = 1.0
        self.clipboard: List[Note] = []
        self.last_access: float = time.time()


# 用户会话存储: {user_id: UserSession}
# 注意：多进程 workers 不共享此内存，公开部署应使用单 worker 或外部缓存
user_sessions: Dict[str, UserSession] = {}


class ExportJob:
    """NBS 导出任务，支持 SSE 进度推送"""
    __slots__ = ('job_id', 'created_at', 'queue', 'done', 'result', 'error', 'filename')

    def __init__(self, job_id: str):
        self.job_id: str = job_id
        self.created_at: float = time.time()
        self.queue: asyncio.Queue = asyncio.Queue()
        self.done: bool = False
        self.result: Optional[bytes] = None
        self.error: Optional[str] = None
        self.filename: str = 'Untitled.nbs'


# 导出任务存储: {job_id: ExportJob}
# 注意：多进程 workers 不共享此内存
export_jobs: Dict[str, ExportJob] = {}
MAX_EXPORT_JOBS = 50
EXPORT_JOB_TTL_SECONDS = 300  # 5 分钟后清理


def _cleanup_old_export_jobs(target_free: int = 1):
    """简单 LRU 清理: 删除最久未创建/完成的导出任务"""
    if len(export_jobs) <= MAX_EXPORT_JOBS - target_free:
        return
    sorted_jobs = sorted(export_jobs.items(), key=lambda x: x[1].created_at)
    for job_id, _ in sorted_jobs[:max(target_free, len(export_jobs) - MAX_EXPORT_JOBS + 1)]:
        if job_id in export_jobs:
            del export_jobs[job_id]


def _cleanup_old_sessions(target_free: int = 1):
    """简单 LRU 清理: 删除最久未访问的会话"""
    if len(user_sessions) <= MAX_USER_SESSIONS - target_free:
        return
    sorted_sessions = sorted(user_sessions.items(), key=lambda x: x[1].last_access)
    for uid, _ in sorted_sessions[:max(target_free, len(user_sessions) - MAX_USER_SESSIONS + 1)]:
        if uid in user_sessions:
            del user_sessions[uid]


def get_user_session(uid: str) -> UserSession:
    """获取或创建用户会话, 并更新最后访问时间"""
    sess = user_sessions.get(uid)
    if sess is None:
        if len(user_sessions) >= MAX_USER_SESSIONS:
            _cleanup_old_sessions(1)
        sess = UserSession()
        user_sessions[uid] = sess
    sess.last_access = time.time()
    return sess


def _get_request_uid(request: Request) -> str:
    """从请求状态或 cookie 读取 user_id"""
    return getattr(request.state, 'user_id', None) or request.cookies.get(USER_COOKIE_NAME) or 'anonymous'


def _check_upload_size(content: bytes):
    """检查上传文件大小是否超过配置限制"""
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"文件大小超过 {MAX_UPLOAD_SIZE_MB}MB 限制"
        )


def get_or_create_user_id(request: Request, response: Response) -> str:
    """从 cookie 读取或创建新的 user_id, 并确保返回的响应带 set-cookie"""
    uid = request.cookies.get(USER_COOKIE_NAME)
    if not uid:
        # 生成一个固定的随机 user_id
        uid = "u_" + uuid.uuid4().hex[:24]
        response.set_cookie(
            key=USER_COOKIE_NAME,
            value=uid,
            max_age=USER_COOKIE_MAX_AGE,
            samesite="lax",
            httponly=False,  # 前端 JS 也能读取
            path="/"
        )
    return uid


@app.middleware("http")
async def user_id_middleware(request: Request, call_next):
    """中间件: 为每个请求分配 user_id 并写入 request.state, 供后续端点使用"""
    uid = request.cookies.get(USER_COOKIE_NAME)
    if not uid:
        uid = "u_" + uuid.uuid4().hex[:24]
    request.state.user_id = uid
    response = await call_next(request)
    # 如果客户端还没有 cookie, 通过响应设置
    if USER_COOKIE_NAME not in request.cookies:
        response.set_cookie(
            key=USER_COOKIE_NAME,
            value=uid,
            max_age=USER_COOKIE_MAX_AGE,
            samesite="lax",
            httponly=False,
            path="/"
        )
    return response


class NoteUpdate(BaseModel):
    """音符更新模型"""
    tick: Optional[int] = None
    layer: Optional[int] = None
    instrument: Optional[int] = None
    key: Optional[int] = None
    velocity: Optional[int] = None
    pan: Optional[int] = None
    pitch: Optional[int] = None


class BatchOperation(BaseModel):
    """批量操作模型"""
    action: str  # change_instrument, change_velocity, delete, move
    note_ids: List[str]
    params: dict = {}


class SongData(BaseModel):
    """歌曲数据模型（用于前端保存/导出）"""
    name: str = "Untitled"
    author: str = ""
    original_author: str = ""
    description: str = ""
    tempo: float = 20.0
    notes: list = []
    layers: list = []


class TempoUpdate(BaseModel):
    """速度更新模型"""
    tempo: float


# 路由
@app.get("/")
async def index():
    """主页"""
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/api/config")
async def get_config():
    """获取服务器配置 (供前端决定是否显示隐私弹窗等)"""
    privacy_cfg = CONFIG.get('privacy', {})
    return {
        "is_public": IS_PUBLIC,
        "server_host": SERVER_HOST,
        "server_port": SERVER_PORT,
        "privacy": {
            "enabled": privacy_cfg.get('enabled', True),
            "message": privacy_cfg.get('message', '')
        },
        "release": {
            "version": str(CONFIG.get('release', {}).get('version', '')),
            "notes": str(CONFIG.get('release', {}).get('notes', ''))
        }
    }


@app.get("/api/sf2/config")
async def get_sf2_config():
    """获取 SoundFont 音色库配置（移动端/PC端）。

    服务器不会主动下载远程 SF2 文件，而是把配置（url 或本地文件名）推送给客户端，
    由客户端根据设备类型自行下载，减少服务器带宽压力。
    """
    return {
        "mobile": SF2_CONFIG.get('mobile'),
        "pc": SF2_CONFIG.get('pc')
    }


@app.get("/sf2/{filename}")
async def download_sf2_file(filename: str):
    """提供 sf2/ 目录下的音色库文件下载（仅当配置文件中使用 file 模式时由客户端访问）。"""
    # 防止路径穿越
    safe_name = os.path.basename(filename)
    file_path = os.path.join(SF2_DIR, safe_name)
    if not os.path.exists(file_path) or not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="音色库文件不存在")
    return FileResponse(file_path, filename=safe_name)


@app.get("/api/session")
async def get_session(request: Request, response: Response):
    """获取/创建用户会话身份 (返回 user_id 供前端绑定本地数据)"""
    uid = get_or_create_user_id(request, response)
    return {
        "user_id": uid,
        "is_public_mode": IS_PUBLIC,
        "server_note": "服务端不存储任何用户数据, 仅提供解析/转换接口"
    }


@app.get("/api/instruments")
async def get_instruments():
    """获取乐器列表"""
    return {
        "instruments": [
            {"id": i, "name": name}
            for i, name in enumerate(INSTRUMENT_NAMES)
        ]
    }


@app.post("/api/song/load")
async def load_song(request: Request, file: UploadFile = File(...)):
    """加载 NBS 文件"""
    if not file.filename.endswith('.nbs'):
        raise HTTPException(status_code=400, detail="只支持 .nbs 格式文件")

    try:
        content = await file.read()
        _check_upload_size(content)
        song = NBSHandler.read_nbs(content)

        uid = _get_request_uid(request)
        sess = get_user_session(uid)
        sess.song = song
        sess.song_path = None  # 新加载的文件，未保存

        return {
            "success": True,
            "song": song.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"加载文件失败: {str(e)}")


async def _process_export_job(job_id: str, song_data: dict):
    """后台处理 NBS 导出任务，通过 queue 推送进度"""
    job = export_jobs.get(job_id)
    if not job:
        return
    try:
        # 1. 解析/构建 Song
        await job.queue.put({"phase": "parse", "percent": 15, "message": "正在解析歌曲数据..."})
        song = Song.from_dict(song_data)

        # 2. 写入 NBS 二进制
        await job.queue.put({"phase": "process", "percent": 50, "message": "正在生成 NBS 二进制..."})
        nbs_data = NBSHandler.write_nbs(song)
        job.filename = f"{song.name or 'Untitled'}.nbs"
        job.result = nbs_data
        job.done = True

        # 3. 完成
        await job.queue.put({
            "phase": "complete",
            "percent": 100,
            "message": "导出完成",
            "size": len(nbs_data),
            "filename": job.filename
        })
    except Exception as e:
        job.error = str(e)
        try:
            await job.queue.put({"phase": "error", "percent": 0, "message": f"导出失败: {str(e)}"})
        except Exception:
            pass


@app.post("/api/song/save")
async def save_song(request: Request, song_data: SongData, background_tasks: BackgroundTasks):
    """保存/导出 NBS 文件 — 创建异步导出任务, 返回 job_id 用于 SSE 进度和下载"""
    if len(export_jobs) >= MAX_EXPORT_JOBS:
        _cleanup_old_export_jobs(1)

    job_id = uuid.uuid4().hex
    export_jobs[job_id] = ExportJob(job_id)

    # 将会话中的歌曲同步保存（保留原有行为）
    try:
        song = Song.from_dict(song_data.model_dump())
        uid = _get_request_uid(request)
        sess = get_user_session(uid)
        sess.song = song
    except Exception:
        pass

    background_tasks.add_task(_process_export_job, job_id, song_data.model_dump())
    return {"success": True, "job_id": job_id}


@app.get("/api/song/save/progress/{job_id}")
async def save_progress(job_id: str):
    """SSE 推送 NBS 导出进度"""
    job = export_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="导出任务不存在")

    async def event_stream():
        last_heartbeat = time.time()
        while True:
            try:
                # 最多等待 1 秒获取新消息
                msg = await asyncio.wait_for(job.queue.get(), timeout=1.0)
                yield f"data: {json.dumps(msg)}\n\n"
                if msg.get("phase") in ("complete", "error"):
                    break
                last_heartbeat = time.time()
            except asyncio.TimeoutError:
                # 发送心跳保持连接，并检查任务是否意外完成
                now = time.time()
                if now - last_heartbeat >= 3:
                    yield ": heartbeat\n\n"
                    last_heartbeat = now
                if job.done and job.queue.empty():
                    # 任务已完成但队列中可能没有 complete 消息（小概率）
                    yield f"data: {json.dumps({'phase': 'complete', 'percent': 100, 'message': '导出完成', 'size': len(job.result or b''), 'filename': job.filename})}\n\n"
                    break
                if job.error and job.queue.empty():
                    yield f"data: {json.dumps({'phase': 'error', 'percent': 0, 'message': job.error})}\n\n"
                    break
            except Exception:
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Expose-Headers": "Content-Disposition, X-NBS-Filename, X-NBS-Size",
        }
    )


@app.get("/api/song/save/download/{job_id}")
async def download_song(job_id: str):
    """下载已完成的 NBS 导出结果"""
    job = export_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="导出任务不存在")
    if not job.done:
        raise HTTPException(status_code=400, detail="导出任务尚未完成")
    if job.error or job.result is None:
        raise HTTPException(status_code=500, detail=job.error or "导出结果为空")

    return Response(
        content=job.result,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{job.filename}"',
            "X-NBS-Filename": job.filename,
            "X-NBS-Size": str(len(job.result)),
            "Access-Control-Expose-Headers": "Content-Disposition, X-NBS-Filename, X-NBS-Size",
        }
    )


@app.get("/api/song/info")
async def get_song_info(request: Request):
    """获取当前歌曲信息"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)
    if sess.song is None:
        return {"song": None}

    return {
        "song": sess.song.to_dict()
    }


@app.post("/api/midi/info")
async def get_midi_info(file: UploadFile = File(...)):
    """获取 MIDI 文件信息（不导入）"""
    if not file.filename.lower().endswith(('.mid', '.midi')):
        raise HTTPException(status_code=400, detail="只支持 .mid 或 .midi 格式文件")

    try:
        content = await file.read()
        _check_upload_size(content)
        info = MIDIHandler.get_midi_info(content)
        return {"success": True, "info": info}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取 MIDI 信息失败: {str(e)}")


@app.post("/api/midi/import")
async def import_midi(
    request: Request,
    file: UploadFile = File(...),
    channel_instruments: str = Form("{}"),
    channel_octaves: str = Form("{}"),
    channel_keys: str = Form("{}"),
    percussion_instruments: str = Form("{}"),
    percussion_pitches: str = Form("{}"),
    remove_silent: bool = Form(True),
    name_layers: bool = Form(True),
    name_after_patches: bool = Form(True),
    same_tempo: bool = Form(True),
    tempo_changes: bool = Form(False),
    keep_octave: bool = Form(True),
    read_velocity: bool = Form(True),
    precision: int = Form(1),
    keep_note_length: str = Form("none"),
    sustain_tracks: str = Form("[]"),
    timbre_fitting: str = Form("{}"),
    percussion_fitting: str = Form("{}"),
    excluded_tracks: str = Form("[]"),
    snap_enabled: bool = Form(False),
    snap_beat: int = Form(4),
):
    """导入 MIDI 文件 — 完全复刻 NoteBlockStudio"""
    if not file.filename.lower().endswith(('.mid', '.midi')):
        raise HTTPException(status_code=400, detail="只支持 .mid 或 .midi 格式文件")

    import json
    try:
        content = await file.read()
        _check_upload_size(content)
        song = MIDIHandler.import_midi(
            content,
            channel_instruments=json.loads(channel_instruments) if channel_instruments else {},
            channel_octaves=json.loads(channel_octaves) if channel_octaves else {},
            channel_keys=json.loads(channel_keys) if channel_keys else {},
            percussion_instruments=json.loads(percussion_instruments) if percussion_instruments else {},
            percussion_pitches=json.loads(percussion_pitches) if percussion_pitches else {},
            remove_silent=remove_silent,
            name_layers=name_layers,
            name_after_patches=name_after_patches,
            same_tempo=same_tempo,
            tempo_changes=tempo_changes,
            keep_octave=keep_octave,
            read_velocity=read_velocity,
            precision=precision,
            keep_note_length=keep_note_length,
            sustain_tracks=json.loads(sustain_tracks) if sustain_tracks else [],
            timbre_fitting=json.loads(timbre_fitting) if timbre_fitting else {},
            percussion_fitting=json.loads(percussion_fitting) if percussion_fitting else {},
            excluded_tracks=json.loads(excluded_tracks) if excluded_tracks else [],
            snap_enabled=snap_enabled,
            snap_beat=snap_beat,
        )

        uid = _get_request_uid(request)
        sess = get_user_session(uid)
        sess.song = song
        sess.song_path = None

        return {
            "success": True,
            "song": song.to_dict(),
            "suggested_tempo": song.tempo
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"MIDI 导入失败: {str(e)}")


@app.get("/api/notes")
async def get_notes(request: Request):
    """获取所有音符"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)
    if sess.song is None:
        return {"notes": []}

    return {
        "notes": [n.to_dict() for n in sess.song.notes]
    }


@app.post("/api/notes")
async def add_note(request: Request, note: NoteUpdate):
    """添加音符"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)

    if sess.song is None:
        sess.song = Song()

    new_note = Note(
        tick=note.tick or 0,
        layer=note.layer or 0,
        instrument=note.instrument if note.instrument is not None else 0,
        key=note.key if note.key is not None else 33,
        velocity=note.velocity if note.velocity is not None else 100,
        pan=note.pan if note.pan is not None else 50,
        pitch=note.pitch if note.pitch is not None else 0
    )

    sess.song.add_note(new_note)

    return {
        "success": True,
        "note": new_note.to_dict()
    }


@app.put("/api/notes/{note_id}")
async def update_note(request: Request, note_id: str, update: NoteUpdate):
    """更新音符"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)

    if sess.song is None:
        raise HTTPException(status_code=400, detail="没有已加载的歌曲")

    # 解析 note_id
    parts = note_id.replace("note_", "").split("_")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="无效的音符 ID")

    tick = int(parts[0])
    layer = int(parts[1])

    # 找到音符
    note = sess.song.get_note(tick, layer)
    if note is None:
        raise HTTPException(status_code=404, detail="找不到指定的音符")

    # 更新字段
    if update.instrument is not None:
        note.instrument = max(0, min(19, update.instrument))
    if update.key is not None:
        note.key = max(0, min(87, update.key))
    if update.velocity is not None:
        note.velocity = max(0, min(100, update.velocity))
    if update.pan is not None:
        note.pan = max(0, min(100, update.pan))
    if update.pitch is not None:
        note.pitch = update.pitch
    if update.tick is not None:
        note.tick = update.tick
    if update.layer is not None:
        note.layer = update.layer

    return {
        "success": True,
        "note": note.to_dict()
    }


@app.delete("/api/notes/{note_id}")
async def delete_note(request: Request, note_id: str):
    """删除音符"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)

    if sess.song is None:
        raise HTTPException(status_code=400, detail="没有已加载的歌曲")

    parts = note_id.replace("note_", "").split("_")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="无效的音符 ID")

    tick = int(parts[0])
    layer = int(parts[1])

    if sess.song.remove_note(tick, layer):
        return {"success": True}
    else:
        raise HTTPException(status_code=404, detail="找不到指定的音符")


@app.post("/api/notes/batch")
async def batch_operation(request: Request, operation: BatchOperation):
    """批量操作"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)

    if sess.song is None:
        raise HTTPException(status_code=400, detail="没有已加载的歌曲")

    # 解析音符 ID
    notes_to_process = []
    for note_id in operation.note_ids:
        parts = note_id.replace("note_", "").split("_")
        if len(parts) == 2:
            tick = int(parts[0])
            layer = int(parts[1])
            note = sess.song.get_note(tick, layer)
            if note:
                notes_to_process.append(note)

    if operation.action == "change_instrument":
        new_instrument = operation.params.get("instrument", 0)
        for note in notes_to_process:
            note.instrument = max(0, min(19, new_instrument))

    elif operation.action == "change_velocity":
        new_velocity = operation.params.get("velocity", 100)
        for note in notes_to_process:
            note.velocity = max(0, min(100, new_velocity))

    elif operation.action == "delete":
        for note in notes_to_process:
            sess.song.remove_note(note.tick, note.layer)

    elif operation.action == "move":
        offset_tick = operation.params.get("offset_tick", 0)
        offset_layer = operation.params.get("offset_layer", 0)
        for note in notes_to_process:
            note.tick = max(0, note.tick + offset_tick)
            note.layer = max(0, note.layer + offset_layer)

    elif operation.action == "copy":
        sess.clipboard = [Note(
            tick=n.tick,
            layer=n.layer,
            instrument=n.instrument,
            key=n.key,
            velocity=n.velocity,
            pan=n.pan,
            pitch=n.pitch
        ) for n in notes_to_process]

    elif operation.action == "paste":
        if not sess.clipboard:
            return {"success": True, "notes": []}

        offset_tick = operation.params.get("offset_tick", 0)
        offset_layer = operation.params.get("offset_layer", 0)

        new_notes = []
        for n in sess.clipboard:
            new_note = Note(
                tick=n.tick + offset_tick,
                layer=n.layer + offset_layer,
                instrument=n.instrument,
                key=n.key,
                velocity=n.velocity,
                pan=n.pan,
                pitch=n.pitch
            )
            sess.song.add_note(new_note)
            new_notes.append(new_note)

        return {
            "success": True,
            "notes": [n.to_dict() for n in new_notes]
        }

    return {"success": True}


@app.post("/api/play")
async def play(request: Request, start_tick: int = 0):
    """开始播放"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)

    if sess.song is None:
        raise HTTPException(status_code=400, detail="没有已加载的歌曲")

    sess.is_playing = True
    sess.tick = start_tick

    return {
        "success": True,
        "message": "Playback started"
    }


@app.post("/api/pause")
async def pause(request: Request):
    """暂停播放"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)
    sess.is_playing = False

    return {
        "success": True,
        "message": "Playback paused"
    }


@app.post("/api/stop")
async def stop(request: Request):
    """停止播放"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)
    sess.is_playing = False
    sess.tick = 0

    return {
        "success": True,
        "message": "Playback stopped"
    }


@app.put("/api/tempo")
async def set_tempo(request: Request, update: TempoUpdate):
    """设置速度"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)

    if sess.song is None:
        raise HTTPException(status_code=400, detail="没有已加载的歌曲")

    sess.song.tempo = max(1.0, min(100.0, update.tempo))

    return {
        "success": True,
        "tempo": sess.song.tempo
    }


@app.get("/api/playback/status")
async def get_playback_status(request: Request):
    """获取播放状态"""
    uid = _get_request_uid(request)
    sess = get_user_session(uid)
    return {
        "is_playing": sess.is_playing,
        "current_tick": sess.tick,
        "tempo": sess.song.tempo if sess.song else 20.0,
        "song_length": sess.song.length if sess.song else 0
    }


# 启动服务器
if __name__ == "__main__":
    import uvicorn
    # 内存中的用户会话无法跨 worker 共享, 公开部署也使用单 worker
    # 如需更高并发, 应改用外部缓存(如 Redis) 存储会话
    workers = 1
    print(f"[WebNBS] 启动服务器: http://{SERVER_HOST}:{SERVER_PORT}")
    print(f"[WebNBS] 公开模式: {IS_PUBLIC}, workers: {workers}")
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, workers=workers)
