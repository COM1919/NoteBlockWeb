// CDP 驱动的离线渲染实测: Node 24 原生 WebSocket
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const URL = 'http://localhost:8000/static/_test_render.html';
const USER_DATA = path.join(os.tmpdir(), 'nbs_cdp_' + Date.now());

function getJson(url) {
  return new Promise((ok, no) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { no(e); } });
    }).on('error', no);
  });
}

async function main() {
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    URL
  ], { stdio: 'ignore' });

  // 等待 CDP 端口就绪
  let targets = null;
  for (let i = 0; i < 40; i++) {
    try { targets = await getJson('http://127.0.0.1:' + PORT + '/json'); break; }
    catch (e) { await new Promise(r => setTimeout(r, 250)); }
  }
  if (!targets) { console.error('CDP 端口未就绪'); edge.kill(); process.exit(1); }
  console.log('[ok] CDP 端口就绪, targets=' + targets.length);
  targets.forEach(t => console.log('  target type=' + t.type + ' url=' + t.url));

  const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:8000')) || targets.find(t => t.type === 'page');
  if (!page) { console.error('未找到页面 target'); edge.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let msgId = 0;
  const pending = {};
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  };
  const send = (method, params) => new Promise((ok) => {
    const id = ++msgId;
    pending[id] = ok;
    ws.send(JSON.stringify({ id, method, params }));
  });

  // 轮询结果
  const deadline = Date.now() + 90000;
  let last = '';
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    const r = await send('Runtime.evaluate', {
      expression: "document.getElementById('result') && document.getElementById('result').innerHTML",
      returnByValue: true
    });
    if (polls === 1) console.log('[dbg] first eval raw:', JSON.stringify(r).slice(0, 600));
    const html = r.result && r.result.result && r.result.result.value;
    if (polls === 1 || polls % 20 === 0) console.log('[poll ' + polls + '] html=' + JSON.stringify((html || '').slice(0, 80)));
    if (html && html !== last) {
      last = html;
      const txt = html.replace(/<br[^>]*>/g, '\n').replace(/<[^>]+>/g, '');
      console.log('---- 当前结果 ----');
      console.log(txt);
      if (html.includes('TESTS DONE') || html.includes('ERROR')) break;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  if (!last.includes('TESTS DONE') && !last.includes('ERROR')) console.error('超时未完成');
  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
}

main().catch((e) => { console.error('脚本错误:', e); process.exit(1); });