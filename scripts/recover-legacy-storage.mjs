import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const portFlag = process.argv.indexOf('--port');
const requestedPort = portFlag >= 0 ? Number(process.argv[portFlag + 1]) : 3000;
if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
  console.error('Provide a valid port with --port <1024-65535>');
  process.exit(1);
}

const host = 'localhost';
const recoveryDir = resolve(process.cwd(), 'recovery');

function send(response, status, contentType, body) {
  response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Type': contentType });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of request) {
    chunks.push(chunk);
    totalLength += chunk.length;
    if (totalLength > 2_000_000) throw new Error('Recovery payload is too large');
  }
  const body = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(body || '{}');
}

const page = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SAO Legacy Storage Recovery</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7e21b;color:#111;font:16px/1.5 system-ui,sans-serif}
  main{width:min(680px,calc(100% - 40px));padding:28px;background:#fff;border:5px solid #111;box-shadow:12px 12px 0 #111}
  h1{margin:0 0 12px;font-size:clamp(28px,7vw,54px);line-height:.9;font-style:italic}code{font-weight:800}
  button{margin:10px 10px 0 0;padding:10px 14px;background:#111;color:#fff;border:3px solid #111;font-weight:900;cursor:pointer}
  button.danger{background:#fff;color:#111}pre{overflow:auto;padding:12px;background:#f2f0df;border-left:6px solid #111;font-size:12px}
</style>
<main>
  <h1>LEGACY DATA RECOVERY</h1>
  <p>正在读取 <code>http://localhost:${requestedPort}</code> 当前浏览器配置中的旧任务数据。页面不会自动清除任何内容。</p>
  <pre id="status">READING...</pre>
  <button id="download" disabled>下载 JSON 副本</button>
  <button id="clear" class="danger" disabled>确认备份后清除此端口旧数据</button>
</main>
<script>
  const keys=['sao-planner-tasks-v2','sao-planner-tasks-v1','sao-planner-settings-v1','sao-planner-theme-v1'];
  const values=Object.fromEntries(keys.map(key=>[key,localStorage.getItem(key)]));
  const payload={origin:location.origin,capturedAt:new Date().toISOString(),values};
  const tasksRaw=values['sao-planner-tasks-v2']||values['sao-planner-tasks-v1'];
  let count=0;
  try{count=tasksRaw?JSON.parse(tasksRaw).length:0}catch{}
  fetch('/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(response=>response.json()).then(result=>{
      document.querySelector('#status').textContent='找到任务：'+count+' 条\\n本地恢复文件：'+result.path;
      document.querySelector('#download').disabled=false;
      document.querySelector('#clear').disabled=false;
    }).catch(error=>{document.querySelector('#status').textContent='保存失败：'+error.message});
  document.querySelector('#download').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='sao-legacy-${requestedPort}.json';link.click();URL.revokeObjectURL(url);
  };
  document.querySelector('#clear').onclick=()=>{
    if(!confirm('确认已保存恢复文件，并清除 localhost:${requestedPort} 的旧 SAO 数据？'))return;
    keys.forEach(key=>localStorage.removeItem(key));
    document.querySelector('#status').textContent+='\\n旧键已清除。';
    document.querySelector('#clear').disabled=true;
  };
</script>
</html>`;

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/') return send(response, 200, 'text/html; charset=utf-8', page);
    if (request.method === 'POST' && request.url === '/recover') {
      const payload = await readJson(request);
      if (!payload || typeof payload !== 'object' || typeof payload.origin !== 'string' || !payload.values || typeof payload.values !== 'object') {
        throw new Error('Invalid recovery payload');
      }
      mkdirSync(recoveryDir, { recursive: true });
      const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
      const path = resolve(recoveryDir, `legacy-local-storage-${requestedPort}-${timestamp}.json`);
      writeFileSync(path, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
      return send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, path }));
    }
    return send(response, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    return send(response, 400, 'application/json; charset=utf-8', JSON.stringify({ error: error instanceof Error ? error.message : 'Recovery failed' }));
  }
});

server.listen(requestedPort, host, () => {
  console.log(`Legacy recovery page: http://localhost:${requestedPort}`);
  console.log('Open this URL in the same browser profile that contained the old tasks. Press Ctrl+C when finished.');
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
