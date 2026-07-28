/* WebNBS interface locale selection. Only the supported, well-formed locales are accepted. */
(function() {
    'use strict';

    var STORAGE_KEY = 'webnbs_language';
    var SUPPORTED = ['zh-CN', 'en-US', 'pt-BR', 'id-ID'];
    // Keep both the Chinese source and the last rendered value. UI state is
    // updated frequently (counts, device names, etc.), so a plain source string
    // would otherwise leave dynamic content stuck on an old translation.
    var sourceText = new WeakMap();
    var current;

    var TEXT = {
        'zh-CN': {
            page_title: 'NoteBlockWeb - Minecraft 音符盒编辑器', language: '语言', settings: '设置', about: '关于', functions: '功能',
            privacy_title: '隐私声明', privacy_message: '本服务仅在当前会话中临时处理您选择的 MIDI 或 NBS 文件。文件内容不会被永久保存，也不会收集个人隐私信息。',
            agree: '同意', feedback: '反馈邮箱', open_source: '开源库', update_notes: '更新日志', close: '关闭', file: '文件', keyboard_piano: '钢琴键盘', midi_import: 'MIDI 导入'
        },
        'en-US': {
            page_title: 'NoteBlockWeb - Minecraft Note Block Editor', language: 'Language', settings: 'Settings', about: 'About', functions: 'Tools',
            privacy_title: 'Privacy Notice', privacy_message: 'This service processes the MIDI or NBS file you choose only for the current session. File contents are not stored permanently and no personal data is collected.',
            agree: 'Agree', feedback: 'Feedback', open_source: 'Open-source libraries', update_notes: "What's new", close: 'Close', file: 'File', keyboard_piano: 'Piano keyboard', midi_import: 'Import MIDI'
        },
        'pt-BR': {
            page_title: 'NoteBlockWeb - Editor de Blocos de Nota do Minecraft', language: 'Idioma', settings: 'Configurações', about: 'Sobre', functions: 'Ferramentas',
            privacy_title: 'Aviso de privacidade', privacy_message: 'Este serviço processa o arquivo MIDI ou NBS escolhido apenas durante a sessão atual. O conteúdo não é armazenado permanentemente e nenhum dado pessoal é coletado.',
            agree: 'Concordo', feedback: 'Contato', open_source: 'Bibliotecas de código aberto', update_notes: 'Novidades', close: 'Fechar', file: 'Arquivo', keyboard_piano: 'Teclado de piano', midi_import: 'Importar MIDI'
        },
        'id-ID': {
            page_title: 'NoteBlockWeb - Editor Blok Nada Minecraft', language: 'Bahasa', settings: 'Pengaturan', about: 'Tentang', functions: 'Alat',
            privacy_title: 'Pemberitahuan privasi', privacy_message: 'Layanan ini memproses berkas MIDI atau NBS yang Anda pilih hanya selama sesi saat ini. Isi berkas tidak disimpan secara permanen dan data pribadi tidak dikumpulkan.',
            agree: 'Setuju', feedback: 'Umpan balik', open_source: 'Pustaka sumber terbuka', update_notes: 'Catatan pembaruan', close: 'Tutup', file: 'Berkas', keyboard_piano: 'Keyboard piano', midi_import: 'Impor MIDI'
        }
    };

    var UI_TEXT = {
        'en-US': {
            '文件': 'File', '速度': 'Tempo', '撤销': 'Undo', '重做': 'Redo', '设置': 'Settings', '关于': 'About', '功能': 'Tools',
            '撤销 (Ctrl+Z)': 'Undo (Ctrl+Z)', '重做 (Ctrl+Y)': 'Redo (Ctrl+Y)', '速度 (Tick/秒)': 'Tempo (ticks/sec)',
            '更多': 'More', '钢琴键盘': 'Piano keyboard', '使用键盘触发钢琴': 'Use computer keyboard as piano', '折叠音轨列表': 'Collapse track list',
            '默认工具 (D)': 'Default tool (D)', '选择工具 (S)': 'Selection tool (S)', '橡皮擦 (E)': 'Eraser (E)', '画笔 (B)': 'Brush (B)', '演奏模式 (P)': 'Performance mode (P)',
            '播放/暂停 (Space)': 'Play/Pause (Space)', '开始录制 (Space)': 'Start recording (Space)', '停止 (Esc)': 'Stop (Esc)', '选择乐器': 'Select instrument',
            '缩放精度': 'Scale precision', '音调偏移': 'Pitch shift', '延音填充': 'Sustain fill', '清除延音': 'Clear sustain', '上下起伏': 'Arpeggio motion',
            '转8度内': 'Fold to 2 octaves', '音域处理': 'Range processing', '清除空轨道': 'Remove empty tracks', '新建文件': 'New file', '打开文件': 'Open file',
            '保存': 'Save', '导出 NBS': 'Export NBS', '取消': 'Cancel', '导入': 'Import', '基本设置': 'Basic', '音轨': 'Tracks', '音色拟合': 'Timbre fitting',
            '读取音符力度': 'Read note velocity', '音符吸附': 'Note snap', '歌曲精度:': 'Song precision:', '拍子:': 'Beat:', '延音处理:': 'Sustain handling:', '移除无音符轨道': 'Remove empty tracks',
            '全选': 'Select all', '取消选择': 'Deselect', '复制': 'Copy', '剪切': 'Cut', '粘贴': 'Paste', '删除': 'Delete', '更改乐器': 'Change instrument', '更改音量': 'Change volume',
            '静音': 'Mute', '取消静音': 'Unmute', '独奏': 'Solo', '取消独奏': 'Unsolo', '删除音轨': 'Delete track', '上移轨道': 'Move track up', '下移轨道': 'Move track down', '音量:': 'Volume:',
            '打开文件': 'Open file', '新建文件': 'New file', '历史文件': 'History', '暂无历史文件': 'No saved files', '更多...': 'More...', '加载': 'Load', '重命名': 'Rename', '关闭': 'Close',
            '展开/折叠钢琴键盘': 'Show/hide piano keyboard', '设置小键盘弹奏音域': 'Set numpad playing range', '超出范围': 'Out of range', '音符:': 'Notes:', '位置:': 'Position:'
        },
        'pt-BR': {
            '文件': 'Arquivo', '速度': 'Andamento', '撤销': 'Desfazer', '重做': 'Refazer', '设置': 'Configurações', '关于': 'Sobre', '功能': 'Ferramentas',
            '撤销 (Ctrl+Z)': 'Desfazer (Ctrl+Z)', '重做 (Ctrl+Y)': 'Refazer (Ctrl+Y)', '速度 (Tick/秒)': 'Andamento (ticks/s)',
            '更多': 'Mais', '钢琴键盘': 'Teclado de piano', '使用键盘触发钢琴': 'Usar o teclado do computador como piano', '折叠音轨列表': 'Recolher lista de faixas',
            '默认工具 (D)': 'Ferramenta padrão (D)', '选择工具 (S)': 'Ferramenta de seleção (S)', '橡皮擦 (E)': 'Borracha (E)', '画笔 (B)': 'Pincel (B)', '演奏模式 (P)': 'Modo de apresentação (P)',
            '播放/暂停 (Space)': 'Reproduzir/Pausar (Espaço)', '开始录制 (Space)': 'Iniciar gravação (Espaço)', '停止 (Esc)': 'Parar (Esc)', '选择乐器': 'Selecionar instrumento',
            '缩放精度': 'Escalar precisão', '音调偏移': 'Transpor tom', '延音填充': 'Preencher sustain', '清除延音': 'Limpar sustain', '上下起伏': 'Movimento de arpejo',
            '转8度内': 'Dobrar para 2 oitavas', '音域处理': 'Processar extensão', '清除空轨道': 'Remover faixas vazias', '新建文件': 'Novo arquivo', '打开文件': 'Abrir arquivo',
            '保存': 'Salvar', '导出 NBS': 'Exportar NBS', '取消': 'Cancelar', '导入': 'Importar', '基本设置': 'Básico', '音轨': 'Faixas', '音色拟合': 'Ajuste de timbre',
            '读取音符力度': 'Ler velocidade das notas', '音符吸附': 'Quantizar notas', '歌曲精度:': 'Precisão da música:', '拍子:': 'Divisão:', '延音处理:': 'Sustain:', '移除无音符音轨': 'Remover faixas vazias',
            '全选': 'Selecionar tudo', '取消选择': 'Desmarcar', '复制': 'Copiar', '剪切': 'Recortar', '粘贴': 'Colar', '删除': 'Excluir', '更改乐器': 'Alterar instrumento', '更改音量': 'Alterar volume',
            '静音': 'Silenciar', '取消静音': 'Ativar som', '独奏': 'Solo', '取消独奏': 'Cancelar solo', '删除音轨': 'Excluir faixa', '上移轨道': 'Mover faixa para cima', '下移轨道': 'Mover faixa para baixo', '音量:': 'Volume:',
            '打开文件': 'Abrir arquivo', '新建文件': 'Novo arquivo', '历史文件': 'Histórico', '暂无历史文件': 'Nenhum arquivo salvo', '更多...': 'Mais...', '加载': 'Carregar', '重命名': 'Renomear', '关闭': 'Fechar',
            '展开/折叠钢琴键盘': 'Mostrar/ocultar teclado de piano', '设置小键盘弹奏音域': 'Definir extensão do teclado numérico', '超出范围': 'Fora da extensão', '音符:': 'Notas:', '位置:': 'Posição:'
        },
        'id-ID': {
            '文件': 'Berkas', '速度': 'Tempo', '撤销': 'Urungkan', '重做': 'Ulangi', '设置': 'Pengaturan', '关于': 'Tentang', '功能': 'Alat',
            '撤销 (Ctrl+Z)': 'Urungkan (Ctrl+Z)', '重做 (Ctrl+Y)': 'Ulangi (Ctrl+Y)', '速度 (Tick/秒)': 'Tempo (tick/detik)',
            '更多': 'Lainnya', '钢琴键盘': 'Keyboard piano', '使用键盘触发钢琴': 'Gunakan keyboard komputer sebagai piano', '折叠音轨列表': 'Ciutkan daftar trek',
            '默认工具 (D)': 'Alat bawaan (D)', '选择工具 (S)': 'Alat pilih (S)', '橡皮擦 (E)': 'Penghapus (E)', '画笔 (B)': 'Kuas (B)', '演奏模式 (P)': 'Mode pertunjukan (P)',
            '播放/暂停 (Space)': 'Putar/Jeda (Spasi)', '开始录制 (Space)': 'Mulai merekam (Spasi)', '停止 (Esc)': 'Berhenti (Esc)', '选择乐器': 'Pilih instrumen',
            '缩放精度': 'Skalakan presisi', '音调偏移': 'Geser nada', '延音填充': 'Isi sustain', '清除延音': 'Hapus sustain', '上下起伏': 'Gerak arpeggio',
            '转8度内': 'Lipat ke 2 oktaf', '音域处理': 'Proses rentang nada', '清除空轨道': 'Hapus trek kosong', '新建文件': 'Berkas baru', '打开文件': 'Buka berkas',
            '保存': 'Simpan', '导出 NBS': 'Ekspor NBS', '取消': 'Batal', '导入': 'Impor', '基本设置': 'Dasar', '音轨': 'Trek', '音色拟合': 'Pencocokan timbre',
            '读取音符力度': 'Baca velocity not', '音符吸附': 'Kuantisasi not', '歌曲精度:': 'Presisi lagu:', '拍子:': 'Ketukan:', '延音处理:': 'Sustain:', '移除无音符音轨': 'Hapus trek kosong',
            '全选': 'Pilih semua', '取消选择': 'Batalkan pilihan', '复制': 'Salin', '剪切': 'Potong', '粘贴': 'Tempel', '删除': 'Hapus', '更改乐器': 'Ubah instrumen', '更改音量': 'Ubah volume',
            '静音': 'Bisukan', '取消静音': 'Bunyikan', '独奏': 'Solo', '取消独奏': 'Batalkan solo', '删除音轨': 'Hapus trek', '上移轨道': 'Naikkan trek', '下移轨道': 'Turunkan trek', '音量:': 'Volume:',
            '打开文件': 'Buka berkas', '新建文件': 'Berkas baru', '历史文件': 'Riwayat', '暂无历史文件': 'Belum ada berkas tersimpan', '更多...': 'Lainnya...', '加载': 'Muat', '重命名': 'Ubah nama', '关闭': 'Tutup',
            '展开/折叠钢琴键盘': 'Tampilkan/sembunyikan keyboard piano', '设置小键盘弹奏音域': 'Atur jangkauan keypad numerik', '超出范围': 'Di luar jangkauan', '音符:': 'Not:', '位置:': 'Posisi:'
        }
    };

    // Shared editor vocabulary used by settings, import dialogs, context menus and
    // dynamically-created controls. Keeping it here lets MutationObserver translate
    // UI added after the initial page load as well.
    Object.assign(UI_TEXT['en-US'], {
        '平滑翻页 (播放头居中)': 'Smooth follow (center playhead)', '音符播放高亮动画': 'Note playback highlight', '录制时显示音符动画 (关闭可提升录制性能)': 'Show note animation while recording',
        '音效优化 (混响/立体声)': 'Audio enhancement (reverb/stereo)', 'NBS 导出版本:': 'NBS export version:', '含铜号角乐器时自动 V6': 'Use V6 automatically for copper horn instruments',
        '关于 NoteBlockWeb': 'About NoteBlockWeb', '调节速度': 'Adjust tempo', '基于 Web 的 Minecraft 音符盒编辑器': 'A web-based Minecraft note block editor',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'Supports NBS import/export, MIDI import, and piano-roll editing', '版本:': 'Version:', '开发者:': 'Developer:', '反馈邮箱:': 'Feedback:',
        '演奏模式设置': 'Performance mode settings', '节拍器:': 'Metronome:', '启用': 'Enable', '延音录制': 'Sustain recording', '外部 MIDI 设备输入': 'External MIDI input', '未连接': 'Not connected',
        '开始演奏': 'Start performance', '文件:': 'File:', '类型:': 'Type:', '时长:': 'Duration:', '轨道:': 'Tracks:', '基本设置': 'Basic', '通道映射': 'Channel mapping',
        '打击乐': 'Percussion', '通道': 'Channel', '音色': 'Timbre', 'NBS 乐器': 'NBS instrument', '偏移前音域': 'Range before shift', '偏移后音域': 'Range after shift',
        '八度': 'Octave', '音调': 'Pitch', '试听': 'Preview', '名称': 'Name', '事件': 'Events', '预览': 'Preview', '旋律': 'Melody', '乐器': 'Instrument',
        'MIDI 音符': 'MIDI note', 'NBS 音高': 'NBS pitch', '音色槽 1': 'Timbre slot 1', '音色槽 2': 'Timbre slot 2', '音色槽 3': 'Timbre slot 3',
        '移除无音符轨道': 'Remove empty tracks', '自动命名轨道': 'Auto-name tracks', '命名依据:': 'Naming based on:', '通道号': 'Channel number', '音色名': 'Patch name',
        '导入速度变化事件': 'Import tempo changes', '音域处理:': 'Range processing:', '不启用': 'Disabled', '单独音符归一法': 'Per-note normalization',
        '整体八度偏移法': 'Whole-track octave shift', '整体音调偏移法': 'Whole-track chromatic shift', '优先大调': 'Prefer major', '优先小调': 'Prefer minor',
        '启用智能音色替代': 'Enable smart timbre substitution', '启用溢出强制归位 (Fallback)': 'Force fold overflow (fallback)', '音色替代': 'Timbre substitution',
        '选择轨道': 'Select tracks', '记住以上设置': 'Remember these settings', '音色替代设置': 'Timbre substitution settings', '应用音轨': 'Apply to tracks',
        '音色替代配置': 'Substitution configuration', '高音替代': 'High-note substitute', '低音替代': 'Low-note substitute', '恢复默认': 'Restore defaults', '应用': 'Apply',
        '竖琴': 'Harp', '低音提琴': 'Double bass', '大鼓': 'Bass drum', '小鼓': 'Snare drum', '击打声': 'Click', '吉他': 'Guitar', '长笛': 'Flute', '钟琴': 'Bell',
        '风铃': 'Chime', '木琴': 'Xylophone', '铁木琴': 'Iron xylophone', '牛铃': 'Cow bell', '迪吉里杜管': 'Didgeridoo', '芯片音': 'Bit', '班卓琴': 'Banjo',
        '电钢琴': 'Pling', '铜号角': 'Copper Horn', '斑驳的铜号角': 'Exposed Copper Horn', '锈蚀的铜号角': 'Weathered Copper Horn', '氧化的铜号角': 'Oxidized Copper Horn', '无': 'None'
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '平滑翻页 (播放头居中)': 'Rolagem suave (cabeçote central)', '音符播放高亮动画': 'Destaque de nota ao tocar', '录制时显示音符动画 (关闭可提升录制性能)': 'Mostrar animação de notas ao gravar',
        '音效优化 (混响/立体声)': 'Aprimoramento de áudio (reverberação/estéreo)', 'NBS 导出版本:': 'Versão de exportação NBS:', '含铜号角乐器时自动 V6': 'Usar V6 automaticamente com instrumentos de trompa de cobre',
        '关于 NoteBlockWeb': 'Sobre o NoteBlockWeb', '调节速度': 'Ajustar andamento', '基于 Web 的 Minecraft 音符盒编辑器': 'Editor web de blocos de nota do Minecraft',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'Compatível com importação/exportação NBS, MIDI e editor piano roll', '版本:': 'Versão:', '开发者:': 'Desenvolvedor:', '反馈邮箱:': 'Contato:',
        '演奏模式设置': 'Configurações do modo de apresentação', '节拍器:': 'Metrônomo:', '启用': 'Ativar', '延音录制': 'Gravação de sustain', '外部 MIDI 设备输入': 'Entrada MIDI externa', '未连接': 'Desconectado',
        '开始演奏': 'Iniciar apresentação', '文件:': 'Arquivo:', '类型:': 'Tipo:', '时长:': 'Duração:', '轨道:': 'Faixas:', '通道映射': 'Mapeamento de canais',
        '打击乐': 'Percussão', '通道': 'Canal', '音色': 'Timbre', 'NBS 乐器': 'Instrumento NBS', '偏移前音域': 'Extensão antes do ajuste', '偏移后音域': 'Extensão após o ajuste',
        '八度': 'Oitava', '音调': 'Tom', '试听': 'Ouvir', '名称': 'Nome', '事件': 'Eventos', '预览': 'Prévia', '旋律': 'Melodia', '乐器': 'Instrumento',
        'MIDI 音符': 'Nota MIDI', 'NBS 音高': 'Tom NBS', '音色槽 1': 'Slot de timbre 1', '音色槽 2': 'Slot de timbre 2', '音色槽 3': 'Slot de timbre 3',
        '移除无音符轨道': 'Remover faixas sem notas', '自动命名轨道': 'Nomear faixas automaticamente', '命名依据:': 'Nomear por:', '通道号': 'Número do canal', '音色名': 'Nome do timbre',
        '导入速度变化事件': 'Importar mudanças de andamento', '音域处理:': 'Processamento de extensão:', '不启用': 'Desativado', '单独音符归一法': 'Normalização por nota',
        '整体八度偏移法': 'Deslocamento de oitava por faixa', '整体音调偏移法': 'Transposição cromática por faixa', '优先大调': 'Priorizar maior', '优先小调': 'Priorizar menor',
        '启用智能音色替代': 'Ativar substituição inteligente de timbre', '启用溢出强制归位 (Fallback)': 'Dobrar excedentes à força (reserva)', '音色替代': 'Substituição de timbre',
        '选择轨道': 'Selecionar faixas', '记住以上设置': 'Lembrar configurações', '音色替代设置': 'Configurações de substituição', '应用音轨': 'Aplicar às faixas',
        '音色替代配置': 'Configuração de substituição', '高音替代': 'Substituto agudo', '低音替代': 'Substituto grave', '恢复默认': 'Restaurar padrão', '应用': 'Aplicar',
        '竖琴': 'Harpa', '低音提琴': 'Contrabaixo', '大鼓': 'Bumbo', '小鼓': 'Caixa', '击打声': 'Clique', '吉他': 'Guitarra', '长笛': 'Flauta', '钟琴': 'Sino',
        '风铃': 'Carrilhão', '木琴': 'Xilofone', '铁木琴': 'Xilofone de ferro', '牛铃': 'Chocalho de vaca', '迪吉里杜管': 'Didgeridoo', '芯片音': 'Bit', '班卓琴': 'Banjo',
        '电钢琴': 'Pling', '铜号角': 'Trompa de cobre', '斑驳的铜号角': 'Trompa de cobre exposta', '锈蚀的铜号角': 'Trompa de cobre desgastada', '氧化的铜号角': 'Trompa de cobre oxidada', '无': 'Nenhum'
    });
    Object.assign(UI_TEXT['id-ID'], {
        '平滑翻页 (播放头居中)': 'Gulir halus (kepala putar di tengah)', '音符播放高亮动画': 'Sorotan not saat dimainkan', '录制时显示音符动画 (关闭可提升录制性能)': 'Tampilkan animasi not saat merekam',
        '音效优化 (混响/立体声)': 'Penyempurnaan audio (reverb/stereo)', 'NBS 导出版本:': 'Versi ekspor NBS:', '含铜号角乐器时自动 V6': 'Gunakan V6 otomatis untuk instrumen terompet tembaga',
        '关于 NoteBlockWeb': 'Tentang NoteBlockWeb', '调节速度': 'Atur tempo', '基于 Web 的 Minecraft 音符盒编辑器': 'Editor blok nada Minecraft berbasis web',
        '支持 NBS 格式导入/导出, MIDI 导入, 钢琴卷帘编辑': 'Mendukung impor/ekspor NBS, impor MIDI, dan editor piano roll', '版本:': 'Versi:', '开发者:': 'Pengembang:', '反馈邮箱:': 'Umpan balik:',
        '演奏模式设置': 'Pengaturan mode pertunjukan', '节拍器:': 'Metronom:', '启用': 'Aktifkan', '延音录制': 'Rekam sustain', '外部 MIDI 设备输入': 'Input MIDI eksternal', '未连接': 'Tidak terhubung',
        '开始演奏': 'Mulai pertunjukan', '文件:': 'Berkas:', '类型:': 'Jenis:', '时长:': 'Durasi:', '轨道:': 'Trek:', '通道映射': 'Pemetaan kanal',
        '打击乐': 'Perkusi', '通道': 'Kanal', '音色': 'Timbre', 'NBS 乐器': 'Instrumen NBS', '偏移前音域': 'Rentang sebelum pergeseran', '偏移后音域': 'Rentang setelah pergeseran',
        '八度': 'Oktaf', '音调': 'Nada', '试听': 'Pratinjau', '名称': 'Nama', '事件': 'Peristiwa', '预览': 'Pratinjau', '旋律': 'Melodi', '乐器': 'Instrumen',
        'MIDI 音符': 'Not MIDI', 'NBS 音高': 'Nada NBS', '音色槽 1': 'Slot timbre 1', '音色槽 2': 'Slot timbre 2', '音色槽 3': 'Slot timbre 3',
        '移除无音符轨道': 'Hapus trek tanpa not', '自动命名轨道': 'Namai trek otomatis', '命名依据:': 'Dasar penamaan:', '通道号': 'Nomor kanal', '音色名': 'Nama timbre',
        '导入速度变化事件': 'Impor perubahan tempo', '音域处理:': 'Pemrosesan rentang:', '不启用': 'Nonaktif', '单独音符归一法': 'Normalisasi per not',
        '整体八度偏移法': 'Geser oktaf per trek', '整体音调偏移法': 'Geser kromatik per trek', '优先大调': 'Prioritaskan mayor', '优先小调': 'Prioritaskan minor',
        '启用智能音色替代': 'Aktifkan penggantian timbre cerdas', '启用溢出强制归位 (Fallback)': 'Paksa lipat nada berlebih (cadangan)', '音色替代': 'Penggantian timbre',
        '选择轨道': 'Pilih trek', '记住以上设置': 'Ingat pengaturan', '音色替代设置': 'Pengaturan penggantian timbre', '应用音轨': 'Terapkan ke trek',
        '音色替代配置': 'Konfigurasi penggantian', '高音替代': 'Pengganti nada tinggi', '低音替代': 'Pengganti nada rendah', '恢复默认': 'Pulihkan bawaan', '应用': 'Terapkan',
        '竖琴': 'Harpa', '低音提琴': 'Kontrabas', '大鼓': 'Drum bas', '小鼓': 'Snare', '击打声': 'Klik', '吉他': 'Gitar', '长笛': 'Seruling', '钟琴': 'Lonceng',
        '风铃': 'Chime', '木琴': 'Xilofon', '铁木琴': 'Xilofon besi', '牛铃': 'Lonceng sapi', '迪吉里杜管': 'Didgeridoo', '芯片音': 'Bit', '班卓琴': 'Banjo',
        '电钢琴': 'Pling', '铜号角': 'Terompet Tembaga', '斑驳的铜号角': 'Terompet Tembaga Terpapar', '锈蚀的铜号角': 'Terompet Tembaga Lapuk', '氧化的铜号角': 'Terompet Tembaga Teroksidasi', '无': 'Tidak ada'
    });

    // Shared commands, menus and popovers. These strings are generated at runtime
    // by the editor, so they cannot rely on static HTML translation alone.
    Object.assign(UI_TEXT['en-US'], {
        '提示': 'Notice', '确认': 'Confirm', '输入': 'Input', '确定': 'OK', '导出': 'Export', '文件名:': 'File name:', '请输入文件名': 'Enter a file name',
        '作者和介绍 (可选)': 'Author and description (optional)', '作者:': 'Author:', '作者名 (可选)': 'Author name (optional)', '介绍:': 'Description:', '歌曲介绍 (可选)': 'Song description (optional)',
        '点击重命名音轨': 'Rename track', '选择这一轨的全部音符': 'Select all notes in this track', '拖动调整音轨顺序': 'Drag to reorder tracks', '删除这一条音轨': 'Delete this track',
        '设置音量': 'Set volume', '静音这一条音轨': 'Mute this track', '只试听这一条音轨': 'Solo this track', '添加新音轨': 'Add track', '更多音轨操作': 'More track actions',
        '展开音轨信息栏': 'Expand track panel', '折叠音轨信息栏': 'Collapse track panel', '展开/折叠钢琴键盘': 'Show/hide piano keyboard', '设置小键盘弹奏音域': 'Set numpad playing range',
        '弹奏音域设置': 'Playing range settings', '字母键盘': 'Letter keyboard', '小键盘': 'Numeric keypad', '八度偏移': 'Octave shift', '半音偏移': 'Semitone shift', '重置': 'Reset',
        '打开文件': 'Open file', '新建文件': 'New file', '历史文件': 'History', '暂无历史文件': 'No saved files', '更多...': 'More...',
        '修改音量': 'Change volume', '输入音量 (0-100):': 'Enter volume (0-100):', '删除轨道': 'Delete track', '上移轨道': 'Move track up', '下移轨道': 'Move track down',
        '请在画布中点击选择要录制的音轨': 'Click a track row on the canvas to select it for recording', '请先在画布中点击选择要录制的音轨！': 'Select a track row on the canvas before recording.',
        '浏览器不支持 MIDI 设备': 'This browser does not support MIDI devices', 'MIDI 设备访问被拒绝': 'MIDI device access was denied', '未检测到 MIDI 设备': 'No MIDI device detected',
        '停止录制': 'Stop recording', '开始演奏录制': 'Start performance recording', '播放/暂停试听': 'Play/pause preview', '平滑翻页: 开启': 'Smooth follow: on', '平滑翻页: 关闭': 'Smooth follow: off',
        '缩放精度': 'Scale precision', '将所有音符的时间位置 (tick) 按比例缩放：': 'Scale every note time position (tick) by a factor:', '选择缩放倍数：': 'Choose a scale factor:',
        '音符吸附': 'Note snap', '将音符吸附到最近的网格线上。': 'Snap notes to the nearest grid line.', '选择范围：': 'Choose scope:', '全部音符': 'All notes', '当前轨道': 'Current track', '选中音符': 'Selected notes', '选择拍子：': 'Choose beat:',
        '音调偏移': 'Pitch shift', '偏移方式:': 'Shift mode:', '按音调': 'Semitones', '按八度': 'Octaves', '偏移量:': 'Shift amount:', '正=向上, 负=向下': 'Positive = up, negative = down',
        '延音填充': 'Sustain fill', '清除延音': 'Clear sustain', '上下起伏': 'Arpeggio motion', '转8度内': 'Fold to 2 octaves',
        '当前没有音符，无法缩放': 'There are no notes to scale', '当前没有音符': 'There are no notes', '没有选中任何音符': 'No notes are selected', '没有需要吸附的音符': 'There are no notes to snap',
        '没有空轨可清除': 'There are no empty tracks to remove', '清除空轨': 'Remove empty tracks', '至少保留一条音轨。': 'Keep at least one track.',
        '未检测到旋律通道': 'No melodic channels detected', '未检测到打击乐音符': 'No percussion notes detected', '暂无 MIDI 音轨数据': 'No MIDI track data available',
        '加载': 'Load', '保存成功': 'Saved successfully', '警告': 'Warning', '保存': 'Save', '加载失败': 'Load failed', '导出失败': 'Export failed', '没有可导出的歌曲': 'There is no song to export',
        '演奏模式': 'Performance mode', '关闭': 'Close', '知道了': 'Got it', '应用': 'Apply'
        , '音轨': 'Track', '名称': 'Name', '乐器': 'Instrument', '音量': 'Volume', '声像': 'Pan', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out',
        '打开钢琴卷帘': 'Open piano roll', '复制片段': 'Duplicate clip', '删除片段': 'Delete clip', '回到开头': 'Back to start', '菜单': 'Menu',
        '音符超出范围': 'Notes out of range', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': 'Some notes are outside the Minecraft standard range (F#3-F#5):',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': 'Notes outside the range may use an incorrect timbre in Minecraft. Use "Fold to 2 octaves" in Tools to correct them.',
        '按住琴键会按持续时长补齐音符': 'Holding a piano key fills notes for its duration', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'Tip: click track rows on the canvas to select or deselect them; multiple tracks are supported.',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': 'Enable this to use an external MIDI keyboard or drum pad.', '不保留': 'Do not keep', '全部保留': 'Keep all', '按轨道选择': 'Choose tracks',
        '为每个 MIDI 通道指定至多 3 个音色槽进行拟合，点击音色槽选择乐器。': 'Assign up to three timbre slots for each MIDI channel. Click a slot to choose an instrument.',
        '为每个打击乐音符指定至多 3 个音色槽进行拟合。': 'Assign up to three timbre slots for each percussion note.',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Choose MIDI tracks for timbre substitution. Out-of-range notes in unselected tracks stay unchanged. The mini roll previews pitch (Y) over time (X); click it to preview from that point.',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': 'Configure high and low substitutes for each NBS timbre. Notes outside F#3-F#5 use an equivalent-pitch substitute so their actual pitch remains unchanged. Click a slot to preview and choose an instrument.',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Targets the Minecraft note-block range F#3-F#5. It shifts first, then tries timbre substitution, then can force-fold remaining notes.',
        '偏移转换': 'Pitch conversion', '同分偏移': 'Tie-break shift', '启用音色替代': 'Enable timbre substitution', '强制转音域内': 'Force fold into range', '全部': 'All', '不启用': 'Disabled', '单独音符归一法': 'Per-note normalization', '整体八度偏移法': 'Whole-track octave shift', '整体音调偏移法': 'Whole-track chromatic shift'
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '提示': 'Aviso', '确认': 'Confirmar', '输入': 'Entrada', '确定': 'OK', '导出': 'Exportar', '文件名:': 'Nome do arquivo:', '请输入文件名': 'Digite um nome de arquivo',
        '作者和介绍 (可选)': 'Autor e descrição (opcional)', '作者:': 'Autor:', '作者名 (可选)': 'Nome do autor (opcional)', '介绍:': 'Descrição:', '歌曲介绍 (可选)': 'Descrição da música (opcional)',
        '点击重命名音轨': 'Renomear faixa', '选择这一轨的全部音符': 'Selecionar todas as notas desta faixa', '拖动调整音轨顺序': 'Arraste para reordenar faixas', '删除这一条音轨': 'Excluir esta faixa',
        '设置音量': 'Definir volume', '静音这一条音轨': 'Silenciar esta faixa', '只试听这一条音轨': 'Solar esta faixa', '添加新音轨': 'Adicionar faixa', '更多音轨操作': 'Mais ações de faixa',
        '展开音轨信息栏': 'Expandir painel de faixas', '折叠音轨信息栏': 'Recolher painel de faixas', '展开/折叠钢琴键盘': 'Mostrar/ocultar teclado de piano', '设置小键盘弹奏音域': 'Definir extensão do teclado numérico',
        '弹奏音域设置': 'Configurações de extensão para tocar', '字母键盘': 'Teclado de letras', '小键盘': 'Teclado numérico', '八度偏移': 'Deslocamento de oitava', '半音偏移': 'Deslocamento de semitom', '重置': 'Redefinir',
        '打开文件': 'Abrir arquivo', '新建文件': 'Novo arquivo', '历史文件': 'Histórico', '暂无历史文件': 'Nenhum arquivo salvo', '更多...': 'Mais...',
        '修改音量': 'Alterar volume', '输入音量 (0-100):': 'Digite o volume (0-100):', '删除轨道': 'Excluir faixa', '上移轨道': 'Mover faixa para cima', '下移轨道': 'Mover faixa para baixo',
        '请在画布中点击选择要录制的音轨': 'Clique em uma faixa no painel para selecioná-la para gravação', '请先在画布中点击选择要录制的音轨！': 'Selecione uma faixa no painel antes de gravar.',
        '浏览器不支持 MIDI 设备': 'Este navegador não oferece suporte a dispositivos MIDI', 'MIDI 设备访问被拒绝': 'O acesso ao dispositivo MIDI foi negado', '未检测到 MIDI 设备': 'Nenhum dispositivo MIDI detectado',
        '停止录制': 'Parar gravação', '开始演奏录制': 'Iniciar gravação de apresentação', '播放/暂停试听': 'Reproduzir/pausar prévia', '平滑翻页: 开启': 'Rolagem suave: ativada', '平滑翻页: 关闭': 'Rolagem suave: desativada',
        '缩放精度': 'Escalar precisão', '将所有音符的时间位置 (tick) 按比例缩放：': 'Escalone a posição temporal (tick) de todas as notas:', '选择缩放倍数：': 'Escolha um fator de escala:',
        '音符吸附': 'Quantizar notas', '将音符吸附到最近的网格线上。': 'Quantize notas para a linha de grade mais próxima.', '选择范围：': 'Escolha o escopo:', '全部音符': 'Todas as notas', '当前轨道': 'Faixa atual', '选中音符': 'Notas selecionadas', '选择拍子：': 'Escolha a divisão:',
        '音调偏移': 'Transpor tom', '偏移方式:': 'Modo de transposição:', '按音调': 'Semitons', '按八度': 'Oitavas', '偏移量:': 'Valor da transposição:', '正=向上, 负=向下': 'Positivo = sobe, negativo = desce',
        '延音填充': 'Preencher sustain', '清除延音': 'Limpar sustain', '上下起伏': 'Movimento de arpejo', '转8度内': 'Dobrar para 2 oitavas',
        '当前没有音符，无法缩放': 'Não há notas para escalar', '当前没有音符': 'Não há notas', '没有选中任何音符': 'Nenhuma nota selecionada', '没有需要吸附的音符': 'Não há notas para quantizar',
        '没有空轨可清除': 'Não há faixas vazias para remover', '清除空轨': 'Remover faixas vazias', '至少保留一条音轨。': 'Mantenha pelo menos uma faixa.',
        '未检测到旋律通道': 'Nenhum canal melódico detectado', '未检测到打击乐音符': 'Nenhuma nota de percussão detectada', '暂无 MIDI 音轨数据': 'Não há dados de faixa MIDI',
        '加载': 'Carregar', '保存成功': 'Salvo com sucesso', '警告': 'Aviso', '保存': 'Salvar', '加载失败': 'Falha ao carregar', '导出失败': 'Falha ao exportar', '没有可导出的歌曲': 'Não há música para exportar',
        '演奏模式': 'Modo de apresentação', '关闭': 'Fechar', '知道了': 'Entendi', '应用': 'Aplicar'
        , '音轨': 'Faixa', '名称': 'Nome', '乐器': 'Instrumento', '音量': 'Volume', '声像': 'Panorama', '混响': 'Reverberação', '淡入': 'Fade in', '淡出': 'Fade out',
        '打开钢琴卷帘': 'Abrir piano roll', '复制片段': 'Duplicar clipe', '删除片段': 'Excluir clipe', '回到开头': 'Voltar ao início', '菜单': 'Menu',
        '音符超出范围': 'Notas fora da extensão', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': 'Algumas notas estão fora da extensão padrão do Minecraft (F#3-F#5):',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': 'Notas fora da extensão podem soar com timbre incorreto no Minecraft. Use "Dobrar para 2 oitavas" em Ferramentas para corrigir.',
        '按住琴键会按持续时长补齐音符': 'Segurar uma tecla preenche notas pela duração', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'Dica: clique nas faixas no painel para selecionar ou desmarcar; é possível selecionar várias.',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': 'Ative para usar um teclado MIDI ou pad de bateria externo.', '不保留': 'Não manter', '全部保留': 'Manter tudo', '按轨道选择': 'Escolher faixas',
        '为每个 MIDI 通道指定至多 3 个音色槽进行拟合，点击音色槽选择乐器。': 'Atribua até três slots de timbre para cada canal MIDI. Clique em um slot para escolher o instrumento.',
        '为每个打击乐音符指定至多 3 个音色槽进行拟合。': 'Atribua até três slots de timbre para cada nota de percussão.',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Escolha faixas MIDI para substituir o timbre. Notas fora da extensão em faixas não selecionadas permanecem inalteradas. Clique no mini piano roll para ouvir a partir daquele ponto.',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': 'Configure substitutos agudos e graves para cada timbre NBS. Notas fora de F#3-F#5 usam um substituto de mesmo tom, preservando a altura real.',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Tem como alvo a extensão F#3-F#5 dos blocos de nota do Minecraft. Primeiro desloca, depois tenta substituir o timbre e por fim pode dobrar o restante.',
        '偏移转换': 'Conversão de tom', '同分偏移': 'Desempate de transposição', '启用音色替代': 'Ativar substituição de timbre', '强制转音域内': 'Forçar dentro da extensão', '全部': 'Tudo', '不启用': 'Desativado', '单独音符归一法': 'Normalização por nota', '整体八度偏移法': 'Deslocamento de oitava por faixa', '整体音调偏移法': 'Transposição cromática por faixa'
    });
    Object.assign(UI_TEXT['id-ID'], {
        '提示': 'Pemberitahuan', '确认': 'Konfirmasi', '输入': 'Masukan', '确定': 'OK', '导出': 'Ekspor', '文件名:': 'Nama berkas:', '请输入文件名': 'Masukkan nama berkas',
        '作者和介绍 (可选)': 'Penulis dan deskripsi (opsional)', '作者:': 'Penulis:', '作者名 (可选)': 'Nama penulis (opsional)', '介绍:': 'Deskripsi:', '歌曲介绍 (可选)': 'Deskripsi lagu (opsional)',
        '点击重命名音轨': 'Ubah nama trek', '选择这一轨的全部音符': 'Pilih semua not di trek ini', '拖动调整音轨顺序': 'Seret untuk mengurutkan trek', '删除这一条音轨': 'Hapus trek ini',
        '设置音量': 'Atur volume', '静音这一条音轨': 'Bisukan trek ini', '只试听这一条音轨': 'Solo trek ini', '添加新音轨': 'Tambah trek', '更多音轨操作': 'Tindakan trek lainnya',
        '展开音轨信息栏': 'Buka panel trek', '折叠音轨信息栏': 'Ciutkan panel trek', '展开/折叠钢琴键盘': 'Tampilkan/sembunyikan keyboard piano', '设置小键盘弹奏音域': 'Atur jangkauan keypad numerik',
        '弹奏音域设置': 'Pengaturan jangkauan bermain', '字母键盘': 'Keyboard huruf', '小键盘': 'Keypad numerik', '八度偏移': 'Geser oktaf', '半音偏移': 'Geser semiton', '重置': 'Atur ulang',
        '打开文件': 'Buka berkas', '新建文件': 'Berkas baru', '历史文件': 'Riwayat', '暂无历史文件': 'Belum ada berkas tersimpan', '更多...': 'Lainnya...',
        '修改音量': 'Ubah volume', '输入音量 (0-100):': 'Masukkan volume (0-100):', '删除轨道': 'Hapus trek', '上移轨道': 'Naikkan trek', '下移轨道': 'Turunkan trek',
        '请在画布中点击选择要录制的音轨': 'Klik baris trek di kanvas untuk memilihnya sebagai tujuan rekam', '请先在画布中点击选择要录制的音轨！': 'Pilih baris trek di kanvas sebelum merekam.',
        '浏览器不支持 MIDI 设备': 'Browser ini tidak mendukung perangkat MIDI', 'MIDI 设备访问被拒绝': 'Akses perangkat MIDI ditolak', '未检测到 MIDI 设备': 'Tidak ada perangkat MIDI terdeteksi',
        '停止录制': 'Hentikan rekam', '开始演奏录制': 'Mulai rekam pertunjukan', '播放/暂停试听': 'Putar/jeda pratinjau', '平滑翻页: 开启': 'Gulir halus: aktif', '平滑翻页: 关闭': 'Gulir halus: nonaktif',
        '缩放精度': 'Skalakan presisi', '将所有音符的时间位置 (tick) 按比例缩放：': 'Skalakan posisi waktu (tick) semua not:', '选择缩放倍数：': 'Pilih faktor skala:',
        '音符吸附': 'Kuantisasi not', '将音符吸附到最近的网格线上。': 'Kuantisasi not ke garis kisi terdekat.', '选择范围：': 'Pilih cakupan:', '全部音符': 'Semua not', '当前轨道': 'Trek saat ini', '选中音符': 'Not terpilih', '选择拍子：': 'Pilih ketukan:',
        '音调偏移': 'Geser nada', '偏移方式:': 'Mode geser:', '按音调': 'Semiton', '按八度': 'Oktaf', '偏移量:': 'Nilai geser:', '正=向上, 负=向下': 'Positif = naik, negatif = turun',
        '延音填充': 'Isi sustain', '清除延音': 'Hapus sustain', '上下起伏': 'Gerak arpeggio', '转8度内': 'Lipat ke 2 oktaf',
        '当前没有音符，无法缩放': 'Tidak ada not untuk diskalakan', '当前没有音符': 'Tidak ada not', '没有选中任何音符': 'Tidak ada not dipilih', '没有需要吸附的音符': 'Tidak ada not untuk dikuantisasi',
        '没有空轨可清除': 'Tidak ada trek kosong untuk dihapus', '清除空轨': 'Hapus trek kosong', '至少保留一条音轨。': 'Sisakan setidaknya satu trek.',
        '未检测到旋律通道': 'Tidak ada kanal melodi terdeteksi', '未检测到打击乐音符': 'Tidak ada not perkusi terdeteksi', '暂无 MIDI 音轨数据': 'Tidak ada data trek MIDI',
        '加载': 'Muat', '保存成功': 'Berhasil disimpan', '警告': 'Peringatan', '保存': 'Simpan', '加载失败': 'Gagal memuat', '导出失败': 'Gagal mengekspor', '没有可导出的歌曲': 'Tidak ada lagu untuk diekspor',
        '演奏模式': 'Mode pertunjukan', '关闭': 'Tutup', '知道了': 'Mengerti', '应用': 'Terapkan'
        , '音轨': 'Trek', '名称': 'Nama', '乐器': 'Instrumen', '音量': 'Volume', '声像': 'Panorama', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out',
        '打开钢琴卷帘': 'Buka piano roll', '复制片段': 'Duplikat klip', '删除片段': 'Hapus klip', '回到开头': 'Kembali ke awal', '菜单': 'Menu',
        '音符超出范围': 'Not di luar rentang', '部分音符超出了 Minecraft 标准音域 (F#3 ~ F#5):': 'Beberapa not berada di luar rentang standar Minecraft (F#3-F#5):',
        '超出范围的音符在 Minecraft 中播放可能音色异常。你可以在"功能"菜单中使用"转8度内"修正。': 'Not di luar rentang mungkin memakai timbre yang salah di Minecraft. Gunakan "Lipat ke 2 oktaf" di Alat untuk memperbaikinya.',
        '按住琴键会按持续时长补齐音符': 'Menahan tuts akan mengisi not sesuai durasinya', '提示: 在画布中点击音轨行可选择/取消选择，可多选': 'Tip: klik baris trek di kanvas untuk memilih atau membatalkan pilihan; beberapa trek dapat dipilih.',
        '勾选后可连接外部 MIDI 键盘/架子鼓进行输入': 'Aktifkan untuk memakai keyboard MIDI atau drum pad eksternal.', '不保留': 'Jangan pertahankan', '全部保留': 'Pertahankan semua', '按轨道选择': 'Pilih trek',
        '为每个 MIDI 通道指定至多 3 个音色槽进行拟合，点击音色槽选择乐器。': 'Tetapkan hingga tiga slot timbre untuk setiap kanal MIDI. Klik slot untuk memilih instrumen.',
        '为每个打击乐音符指定至多 3 个音色槽进行拟合。': 'Tetapkan hingga tiga slot timbre untuk setiap not perkusi.',
        '选择需要应用音色替代的 MIDI 音轨。未选中的音轨中超出音域的音符将保留原状。右侧迷你图为该轨道音符预览（Y=音高，X=时间），点击可从该位置开始试听。': 'Pilih trek MIDI untuk penggantian timbre. Not di luar rentang pada trek yang tidak dipilih tidak diubah. Klik mini roll untuk pratinjau dari titik itu.',
        '为每个 NBS 音色配置高音/低音替代乐器。超出 MC 音域 (F#3~F#5) 的音符将切换到替代音色并使用等音高换算，保证实际播放音高不变。点击音色槽打开菜单试听当前音色，选择新音色后也会立即试听。': 'Atur pengganti nada tinggi dan rendah untuk setiap timbre NBS. Not di luar F#3-F#5 memakai pengganti dengan tinggi yang setara agar nada sebenarnya tidak berubah.',
        '目标为 Minecraft 原版音符盒标准音域 F#3-F#5。先应用偏移，再尝试音色替代，最后可选择强制归位。': 'Menargetkan rentang blok nada Minecraft F#3-F#5. Nada digeser terlebih dahulu, lalu dicoba penggantian timbre, dan sisanya dapat dipaksa dilipat.',
        '偏移转换': 'Konversi nada', '同分偏移': 'Pergeseran pemecah seri', '启用音色替代': 'Aktifkan penggantian timbre', '强制转音域内': 'Paksa lipat ke rentang', '全部': 'Semua', '不启用': 'Nonaktif', '单独音符归一法': 'Normalisasi per not', '整体八度偏移法': 'Geser oktaf per trek', '整体音调偏移法': 'Geser kromatik per trek'
    });

    // Static controls that are shared by the toolbar, floating menus, MIDI
    // dialog and FLS view. Keeping these additions together prevents the same
    // visible label from being translated in one dialog but missed in another.
    Object.assign(UI_TEXT['en-US'], {
        '速度:': 'Tempo:', '速度 (Tick/秒):': 'Tempo (ticks/sec):', '音符:': 'Notes:', '音符': 'Notes', '音轨设置': 'Track settings',
        '音域': 'Range', '处理中': 'Processing', '计算中…': 'Calculating…', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'Minecraft range F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'MIDI preview', 'NBS 试听': 'NBS preview', 'NBS 音色': 'NBS timbre', 'QQ交流群:': 'QQ community:',
        '试听 MIDI 原音': 'Preview original MIDI', '试听 NBS 拟合音色': 'Preview fitted NBS timbre', '试听 NBS 组合音': 'Preview NBS timbre mix',
        '点击选择高音替代音色': 'Choose high-note substitute', '点击选择低音替代音色': 'Choose low-note substitute',
        '回到开头': 'Back to start', '恢复自动': 'Restore automatic', '忽略': 'Ignore', '自动(用拟合音色)': 'Automatic (use fitted timbre)',
        '范围:': 'Range:', '范围: -': 'Range: -', 'MIDI 信息': 'MIDI information', '轨道': 'Track', '语言:': 'Language:',
        '音域 F#3~F#5 (MIDI 54~78)': 'Range F#3-F#5 (MIDI 54-78)', '个音符': 'note(s)', '加载中…': 'Loading…', '音符: 0': 'Notes: 0',
        '处理中…': 'Processing…', '速度': 'Tempo', '加载': 'Load', '操作': 'Actions', '时间': 'Time', '大小': 'Size',
        '打开钢琴卷帘': 'Open piano roll', '复制片段': 'Duplicate clip', '删除片段': 'Delete clip', '重命名': 'Rename',
        '添加音轨': 'Add track', '新音轨名称:': 'New track name:', 'Clip 名称:': 'Clip name:', '重命名 Clip': 'Rename clip',
        '删除 Clip': 'Delete clip', '删除音轨': 'Delete track', '乐器': 'Instrument', '声像': 'Pan', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out'
        , '播放/暂停': 'Play/Pause', '停止': 'Stop', 'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Minecraft standard range: MIDI 54-78 (NBS keys 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': 'Prefer timbre substitution for out-of-range notes. Use whole-track shifting only when substitution cannot cover them all. Available only in modes 2 and 3.',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': 'When enabled, remaining out-of-range notes are folded by +/-12 semitones after all timbre substitutes are exhausted. Available only in modes 2 and 3.',
        '配置超出音域音符的音色替代方案': 'Configure timbre substitutes for out-of-range notes'
    });
    Object.assign(UI_TEXT['pt-BR'], {
        '速度:': 'Andamento:', '速度 (Tick/秒):': 'Andamento (ticks/s):', '音符:': 'Notas:', '音符': 'Notas', '音轨设置': 'Configurações da faixa',
        '音域': 'Extensão', '处理中': 'Processando', '计算中…': 'Calculando…', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'Extensão do Minecraft F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'Prévia MIDI', 'NBS 试听': 'Prévia NBS', 'NBS 音色': 'Timbre NBS', 'QQ交流群:': 'Comunidade QQ:',
        '试听 MIDI 原音': 'Ouvir MIDI original', '试听 NBS 拟合音色': 'Ouvir timbre NBS ajustado', '试听 NBS 组合音': 'Ouvir combinação NBS',
        '点击选择高音替代音色': 'Escolher substituto agudo', '点击选择低音替代音色': 'Escolher substituto grave',
        '回到开头': 'Voltar ao início', '恢复自动': 'Restaurar automático', '忽略': 'Ignorar', '自动(用拟合音色)': 'Automático (usar timbre ajustado)',
        '范围:': 'Extensão:', '范围: -': 'Extensão: -', 'MIDI 信息': 'Informações MIDI', '轨道': 'Faixa', '语言:': 'Idioma:',
        '音域 F#3~F#5 (MIDI 54~78)': 'Extensão F#3-F#5 (MIDI 54-78)', '个音符': 'nota(s)', '加载中…': 'Carregando…', '音符: 0': 'Notas: 0',
        '处理中…': 'Processando…', '速度': 'Andamento', '加载': 'Carregar', '操作': 'Ações', '时间': 'Tempo', '大小': 'Tamanho',
        '打开钢琴卷帘': 'Abrir piano roll', '复制片段': 'Duplicar clipe', '删除片段': 'Excluir clipe', '重命名': 'Renomear',
        '添加音轨': 'Adicionar faixa', '新音轨名称:': 'Nome da nova faixa:', 'Clip 名称:': 'Nome do clipe:', '重命名 Clip': 'Renomear clipe',
        '删除 Clip': 'Excluir clipe', '删除音轨': 'Excluir faixa', '乐器': 'Instrumento', '声像': 'Panorama', '混响': 'Reverberação', '淡入': 'Fade in', '淡出': 'Fade out'
        , '播放/暂停': 'Reproduzir/Pausar', '停止': 'Parar', 'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Extensão padrão do Minecraft: MIDI 54-78 (chaves NBS 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': 'Priorize a substituição de timbre para notas fora da extensão. Use o deslocamento de faixa inteira somente quando a substituição não cobrir tudo. Disponível apenas nos modos 2 e 3.',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': 'Quando ativado, as notas restantes fora da extensão são dobradas em +/-12 semitons após esgotar todos os substitutos. Disponível apenas nos modos 2 e 3.',
        '配置超出音域音符的音色替代方案': 'Configurar substitutos de timbre para notas fora da extensão'
    });
    Object.assign(UI_TEXT['id-ID'], {
        '速度:': 'Tempo:', '速度 (Tick/秒):': 'Tempo (tick/detik):', '音符:': 'Not:', '音符': 'Not', '音轨设置': 'Pengaturan trek',
        '音域': 'Rentang', '处理中': 'Memproses', '计算中…': 'Menghitung…', 'MC 音域 F#3~F#5 (MIDI 54~78)': 'Rentang Minecraft F#3-F#5 (MIDI 54-78)',
        'MIDI 试听': 'Pratinjau MIDI', 'NBS 试听': 'Pratinjau NBS', 'NBS 音色': 'Timbre NBS', 'QQ交流群:': 'Komunitas QQ:',
        '试听 MIDI 原音': 'Pratinjau MIDI asli', '试听 NBS 拟合音色': 'Pratinjau timbre NBS hasil pencocokan', '试听 NBS 组合音': 'Pratinjau gabungan NBS',
        '点击选择高音替代音色': 'Pilih pengganti nada tinggi', '点击选择低音替代音色': 'Pilih pengganti nada rendah',
        '回到开头': 'Kembali ke awal', '恢复自动': 'Pulihkan otomatis', '忽略': 'Abaikan', '自动(用拟合音色)': 'Otomatis (gunakan timbre hasil pencocokan)',
        '范围:': 'Rentang:', '范围: -': 'Rentang: -', 'MIDI 信息': 'Informasi MIDI', '轨道': 'Trek', '语言:': 'Bahasa:',
        '音域 F#3~F#5 (MIDI 54~78)': 'Rentang F#3-F#5 (MIDI 54-78)', '个音符': 'not', '加载中…': 'Memuat…', '音符: 0': 'Not: 0',
        '处理中…': 'Memproses…', '速度': 'Tempo', '加载': 'Muat', '操作': 'Tindakan', '时间': 'Waktu', '大小': 'Ukuran',
        '打开钢琴卷帘': 'Buka piano roll', '复制片段': 'Duplikat klip', '删除片段': 'Hapus klip', '重命名': 'Ubah nama',
        '添加音轨': 'Tambah trek', '新音轨名称:': 'Nama trek baru:', 'Clip 名称:': 'Nama klip:', '重命名 Clip': 'Ubah nama klip',
        '删除 Clip': 'Hapus klip', '删除音轨': 'Hapus trek', '乐器': 'Instrumen', '声像': 'Panorama', '混响': 'Reverb', '淡入': 'Fade in', '淡出': 'Fade out'
        , '播放/暂停': 'Putar/Jeda', '停止': 'Berhenti', 'Minecraft 标准音域 MIDI 54~78 (NBS key 33~57, F#3~F#5)': 'Rentang standar Minecraft: MIDI 54-78 (kunci NBS 33-57, F#3-F#5)',
        '优先使用音色替代解决超限音符，替代无法完全覆盖时才动用整体偏移。仅在模式2/3可用，模式0/1下灰显无效': 'Utamakan penggantian timbre untuk not di luar rentang. Gunakan pergeseran seluruh trek hanya jika penggantian tidak dapat mencakup semuanya. Hanya tersedia di mode 2 dan 3.',
        '勾选后音色替代链用尽仍有超限时，强制对 MIDI 数值进行 ±12 取模归位。仅在模式2/3可用': 'Jika diaktifkan, not di luar rentang yang tersisa akan dilipat sebesar +/-12 semiton setelah semua pengganti habis. Hanya tersedia di mode 2 dan 3.',
        '配置超出音域音符的音色替代方案': 'Atur pengganti timbre untuk not di luar rentang'
    });

    function normalize(locale) {
        if (typeof locale !== 'string') return null;
        var value = locale.replace(/_/g, '-').trim();
        for (var i = 0; i < SUPPORTED.length; i++) if (value.toLowerCase() === SUPPORTED[i].toLowerCase()) return SUPPORTED[i];
        var fallback = { zh: 'zh-CN', en: 'en-US', pt: 'pt-BR', id: 'id-ID' };
        return fallback[value.split('-')[0].toLowerCase()] || null;
    }

    function detect() {
        try { var stored = normalize(localStorage.getItem(STORAGE_KEY)); if (stored) return stored; } catch (ignore) {}
        var candidates = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
        for (var i = 0; i < candidates.length; i++) { var locale = normalize(candidates[i]); if (locale) return locale; }
        return 'en-US';
    }

    function t(key) { return (TEXT[current] && TEXT[current][key]) || TEXT['en-US'][key] || key; }

    // Dynamic UI often contains counts or track names. Translate the stable
    // surrounding text without attempting to translate user-provided names.
    function translatePattern(text) {
        var patterns = {
            'en-US': [
                [/^音符:\s*(\d+)$/, 'Notes: $1'], [/^位置:\s*(\d+)$/, 'Position: $1'],
                [/^录制到:\s*(.+)$/, 'Recording to: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 note(s) selected'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 track(s) selected'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, 'Length $1 steps · $2 note(s)'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'Snap to: $1 (every $2 ticks)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'Snap grid: $1 ticks'],
                [/^已连接:\s*(.+)$/, 'Connected: $1'], [/^已连接\s+(.+)$/, 'Connected $1'], [/^MIDI 输入\s*(.+)$/, 'MIDI input $1'],
                [/^预计\s*(.+)$/, 'Estimated $1'], [/^已处理\s*(\d+)\s*个音符。$/, 'Processed $1 note(s).'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, 'Only $1 note(s) are selected.'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, 'Range processing complete. Adjusted $1 note(s).'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, 'Processed $1 note(s). Notes outside the Minecraft range were folded by octave.']
            ],
            'pt-BR': [
                [/^音符:\s*(\d+)$/, 'Notas: $1'], [/^位置:\s*(\d+)$/, 'Posição: $1'],
                [/^录制到:\s*(.+)$/, 'Gravando em: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 nota(s) selecionada(s)'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 faixa(s) selecionada(s)'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, 'Duração $1 passos · $2 nota(s)'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'Quantizar em: $1 (a cada $2 ticks)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'Grade: $1 ticks'],
                [/^已连接:\s*(.+)$/, 'Conectado: $1'], [/^已连接\s+(.+)$/, 'Conectado $1'], [/^MIDI 输入\s*(.+)$/, 'Entrada MIDI $1'],
                [/^预计\s*(.+)$/, 'Estimado: $1'], [/^已处理\s*(\d+)\s*个音符。$/, '$1 nota(s) processada(s).'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, 'Apenas $1 nota(s) está(ão) selecionada(s).'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, 'Processamento de extensão concluído. $1 nota(s) ajustada(s).'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, '$1 nota(s) processada(s). Notas fora da extensão do Minecraft foram dobradas por oitava.']
            ],
            'id-ID': [
                [/^音符:\s*(\d+)$/, 'Not: $1'], [/^位置:\s*(\d+)$/, 'Posisi: $1'],
                [/^录制到:\s*(.+)$/, 'Rekam ke: $1'], [/^已选择\s*(\d+)\s*个音符$/, '$1 not dipilih'],
                [/^已选择\s*(\d+)\s*个轨道$/, '$1 trek dipilih'], [/^长度\s*(\d+)\s*步\s*·\s*(\d+)\s*个音符$/, 'Panjang $1 langkah · $2 not'],
                [/^吸附到:\s*(.+)\s*\(每\s*(\d+)\s*tick\)$/, 'Kuantisasi ke: $1 (setiap $2 tick)'], [/^吸附网格:\s*(\d+)\s*tick$/, 'Kisi: $1 tick'],
                [/^已连接:\s*(.+)$/, 'Terhubung: $1'], [/^已连接\s+(.+)$/, 'Terhubung $1'], [/^MIDI 输入\s*(.+)$/, 'Input MIDI $1'],
                [/^预计\s*(.+)$/, 'Perkiraan $1'], [/^已处理\s*(\d+)\s*个音符。$/, '$1 not diproses.'],
                [/^当前只选中了\s*(\d+)\s*个音符。$/, 'Hanya $1 not yang dipilih.'],
                [/^已完成音域处理，调整了\s*(\d+)\s*个音符。$/, 'Pemrosesan rentang selesai. $1 not disesuaikan.'],
                [/^已处理\s*(\d+)\s*个音符，超出 Minecraft 标准音域的音符已按八度折叠。$/, '$1 not diproses. Not di luar rentang Minecraft dilipat per oktaf.']
            ]
        };
        var list = patterns[current] || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i][0].test(text)) return text.replace(list[i][0], list[i][1]);
        }
        return text;
    }

    function translate(text) {
        var dictionary = UI_TEXT[current] || {};
        return dictionary[text] || translatePattern(text);
    }

    function translateStaticText() {
        var dictionary = UI_TEXT[current] || {};
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i], parent = node.parentElement;
            if (!parent || parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') continue;
            var currentValue = node.nodeValue;
            var entry = sourceText.get(node);
            if (!entry || (currentValue !== entry.source && currentValue !== entry.rendered)) {
                entry = { source: currentValue, rendered: currentValue };
                sourceText.set(node, entry);
            }
            var leading = (entry.source.match(/^\s*/) || [''])[0], trailing = (entry.source.match(/\s*$/) || [''])[0], value = entry.source.trim();
            var rendered = leading + (dictionary[value] || translatePattern(value)) + trailing;
            entry.rendered = rendered;
            if (node.nodeValue !== rendered) node.nodeValue = rendered;
        }
    }

    function translateAttributes() {
        var dictionary = UI_TEXT[current] || {};
        var attributes = ['title', 'data-tip', 'placeholder', 'aria-label'];
        for (var a = 0; a < attributes.length; a++) {
            var attribute = attributes[a];
            var elements = document.querySelectorAll('[' + attribute + ']');
            for (var i = 0; i < elements.length; i++) {
                var element = elements[i];
                var dataKey = 'i18n' + attribute.charAt(0).toUpperCase() + attribute.slice(1).replace(/-([a-z])/g, function(_, letter) { return letter.toUpperCase(); });
                var renderedKey = dataKey + 'Rendered';
                var currentValue = element.getAttribute(attribute);
                var original = element.dataset[dataKey];
                var previousRendered = element.dataset[renderedKey];
                if (original === undefined || (currentValue !== original && currentValue !== previousRendered)) {
                    original = currentValue;
                    element.dataset[dataKey] = original;
                }
                var translated = dictionary[original] || translatePattern(original);
                if (element.getAttribute(attribute) !== translated) element.setAttribute(attribute, translated);
                element.dataset[renderedKey] = translated;
            }
        }
    }

    function observeTranslations() {
        if (observeTranslations.observer) return;
        observeTranslations.observer = new MutationObserver(function(mutations) {
            var needsTextTranslation = false;
            var needsAttributeTranslation = false;
            for (var i = 0; i < mutations.length; i++) {
                if (mutations[i].type === 'attributes') {
                    needsAttributeTranslation = true;
                    continue;
                }
                if (mutations[i].type === 'characterData' || mutations[i].addedNodes.length) needsTextTranslation = true;
            }
            if (needsTextTranslation) translateStaticText();
            if (needsTextTranslation || needsAttributeTranslation) translateAttributes();
        });
        observeTranslations.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['title', 'data-tip', 'placeholder', 'aria-label']
        });
    }

    function setText(selector, value) { var element = document.querySelector(selector); if (element) element.textContent = value; }
    function setTitle(selector, value) { var element = document.querySelector(selector); if (element) element.title = value; }

    function apply(locale, persist) {
        current = normalize(locale) || 'en-US';
        document.documentElement.lang = current;
        document.title = t('page_title');
        translateStaticText();
        translateAttributes();
        setText('#settings-popup .settings-header h4', t('settings'));
        setText('#about-popup .settings-header h4', t('about') + ' NoteBlockWeb');
        setText('.privacy-popup-title', t('privacy_title'));
        setText('#privacy-popup-agree', t('agree'));
        setText('#privacy-popup-message', t('privacy_message'));
        setTitle('#btn-settings', t('settings'));
        setTitle('#btn-about', t('about'));
        setTitle('#btn-functions', t('functions'));
        setTitle('#btn-file', t('file'));
        setTitle('#btn-keyboard-piano', t('keyboard_piano'));
        setText('#midi-popup .midi-import-header h3', t('midi_import'));
        var settingLabel = document.querySelector('label[for="settings-language"]');
        if (settingLabel) settingLabel.textContent = t('language') + ':';
        var privacyLabel = document.querySelector('label[for="privacy-language"]');
        if (privacyLabel && privacyLabel.firstChild) privacyLabel.firstChild.nodeValue = t('language') + ' ';
        var selects = document.querySelectorAll('#settings-language, #privacy-language');
        for (var i = 0; i < selects.length; i++) selects[i].value = current;
        if (persist) try { localStorage.setItem(STORAGE_KEY, current); } catch (ignore) {}
        document.dispatchEvent(new CustomEvent('webnbs:languagechange', { detail: { locale: current } }));
    }

    function bindSelect(id) {
        var select = document.getElementById(id);
        if (!select || select.dataset.i18nBound) return;
        select.dataset.i18nBound = '1';
        select.addEventListener('change', function() { apply(this.value, true); });
    }

    function init() { bindSelect('settings-language'); bindSelect('privacy-language'); apply(detect(), false); observeTranslations(); }
    window.WebNBSI18n = { init: init, apply: apply, getLocale: function() { return current; }, t: t, translate: translate, supported: SUPPORTED.slice() };
})();
