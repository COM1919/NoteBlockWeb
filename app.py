"""
WebNBS - 基于网页的 NBS 音符块编曲工具
FastAPI 静态托管服务

说明: NBS/MIDI 的解析、转换与播放已全部在浏览器端完成 (static/js/nbs_client.js),
服务端仅负责托管前端静态文件并提供少量配置接口。
"""
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware

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
# - true  : 公开为站点, 任何人可访问
# - false : 本地/受控模式, 仅受信任用户访问
public: true

# 隐私政策 (首次访问时强制同意)
privacy:
  # 是否启用隐私弹窗
  enabled: true
  # 隐私政策内容 (简短一句话)
  message: "本服务仅在当前会话中临时处理您选择的 MIDI 或 NBS 文件。文件内容不会被永久保存，也不会收集个人隐私信息。"

# 版本更新提示：修改版本号或内容后，客户端会在下次访问时显示更新日志
release:
  version: "2.4.9"
  notes: |
    本次更新
    - 新增 Español、Русский、Deutsch、Français、日本語和한국어界面语言；Português (Brasil) 已继续保留。
    - 修复底部乐器选择器在桌面端图标缺失、文字被挤为竖排的问题。
    - 将四种最新铜号角乐器统一为 Minecraft Wiki 官方名称。
    - 新增简体中文、English (United States)、Português (Brasil) 和 Bahasa Indonesia 界面语言。
    - 全局补充工具栏、菜单、提示和动态控件的多语言文本。
    - 修复移动端横屏仍显示桌面工具栏的问题。
    - 所有主要右键菜单、功能菜单、文件菜单、轨道菜单、音量浮层和片段菜单均会根据实际可用空间自动翻转、限高并提供内部滚动。
    - 底部 88 键钢琴键盘改为按真实键盘宽度居中。
    - 统一右键和浮层菜单为更接近 Windows 11 WinUI 的半透明 Mica/Acrylic 视觉。

# 高级配置 (可选)
advanced:
  # 临时文件保留时间 (秒), 超时自动清理
  temp_cleanup_seconds: 3600
  # MIDI/NBS 文件最大大小 (MB)
  max_upload_size_mb: 50

# MIDI 音色库配置 (SF3/SF2 格式)
# 配置下载链接后, 由客户端在设置中选择下载策略 (播放时询问 / 自动后台下载 / 不使用)。
# 已下载的音色库会缓存在浏览器 (IndexedDB), 再次访问直接复用。
# 未配置或下载失败时, 自动回退到浏览器内置合成器 (质量较低, 无法准确拟合)。
# 引擎: 使用 SpessaSynth 合成器 (WorkletSynthesizer), 音质与性能优于旧解析器。
soundfont:
  # SF3/SF2 音色文件下载链接 (支持 http/https 直链, 客户端直连下载, 不占用服务器带宽)
  # 文件格式: .sf3 (推荐, Vorbis 压缩, 体积小质量好) 或 .sf2 (未压缩 PCM)
  url: ""
  # 音色库名称 (仅用于下载提示显示, 如 "GeneralUser GS")
  name: ""
"""


def load_config():
    """加载 config.yaml 配置文件, 不存在则自动创建默认配置"""
    config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config.yaml')
    default_config = {
        'server': {'host': '0.0.0.0', 'port': 8000},
        'public': True,
        'privacy': {
            'enabled': True,
            'message': '本服务仅在当前会话中临时处理您选择的 MIDI 或 NBS 文件。文件内容不会被永久保存，也不会收集个人隐私信息。'
        },
        'release': {
            'version': '2.4.9',
            'notes': 'See config.yaml for the current release notes.'
        },
        'soundfont': {
            'url': '',
            'name': ''
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

# 目录结构 (打包后):
#   项目根/
#     app.py            服务入口
#     config.yaml       服务器配置
#     sf2/              SoundFont 配置目录
#     src/
#       index.html     主页
#       static/        前端资源 (css/js/sounds/sprites)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(BASE_DIR, "src")
STATIC_DIR = os.path.join(SRC_DIR, "static")
SF2_DIR = os.path.join(BASE_DIR, "sf2")

# 前端资源挂载在 /static 前缀 (与 index.html 中的 /static/... 绝对路径保持一致,
# 因此打包/重组目录后无需修改 index.html)
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


# 路由
@app.get("/")
async def index():
    """主页"""
    return FileResponse(os.path.join(SRC_DIR, "index.html"))


@app.get("/api/config")
async def get_config():
    """获取服务器配置 (供前端决定是否显示隐私弹窗、更新日志、音色库策略)"""
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
        },
        "soundfont": {
            "url": str(CONFIG.get('soundfont', {}).get('url', '')),
            "name": str(CONFIG.get('soundfont', {}).get('name', ''))
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


# 启动服务器
if __name__ == "__main__":
    import uvicorn
    print(f"[WebNBS] 启动服务器: http://{SERVER_HOST}:{SERVER_PORT}")
    print(f"[WebNBS] 公开模式: {IS_PUBLIC}")
    print(f"[WebNBS] 前端目录: {STATIC_DIR}")
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, workers=1)
