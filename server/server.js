const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const PORT = process.env.PORT || 9090;

// Keycloak 프록시 대상 URL — 서버에서 관리 (오픈 프록시 방지)
const KEYCLOAK_URLS = {
  dev:  'https://auth-dxbuilder.hd.com/realms/bff/protocol/openid-connect/token',
  prod: 'https://auth-dxb.hd.com/realms/bff/protocol/openid-connect/token',
};

const app = express();

// file:// (Origin: null), localhost, 127.0.0.1 허용
app.use(cors({
  origin: (origin, cb) => {
    if (
      !origin || origin === 'null' ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
}));

app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.use(express.json({ limit: '512kb' }));

// upload-api만 큰 한도 별도 적용 (OpenAPI 스펙 파일 업로드 용)
const jsonLarge = express.json({ limit: '20mb' });

// ── API Gateway 연결 프로파일 서빙 ────────────────────────────
// GET /api/connections  →  ../apigw_api_mgmt/connections.json 반환
const CONNECTIONS_FILE = path.join(__dirname, '..', 'apigw_api_mgmt', 'connections.json');

app.get('/api/connections', (req, res) => {
  try {
    const raw = fs.readFileSync(CONNECTIONS_FILE, 'utf8');
    const list = JSON.parse(raw);
    // password 필드가 있더라도 응답에서 제거 (안전 장치)
    const safe = list.map(({ name, host }) => ({ name, host }));
    res.json(safe);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.json([]);  // 파일 없으면 빈 배열 반환
    } else {
      console.error('[connections error]', err.message);
      res.status(500).json({ error: 'Failed to read connections.json' });
    }
  }
});

// ── Keycloak 토큰 발급 프록시 ──────────────────────────────
// POST /proxy/keycloak/:env  (env = dev | prod)
app.post('/proxy/keycloak/:env', async (req, res) => {
  const targetUrl = KEYCLOAK_URLS[req.params.env];
  if (!targetUrl) {
    return res.status(400).json({ error: `Unknown environment: "${req.params.env}". Use "dev" or "prod".` });
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(req.body).toString(),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[keycloak proxy error]', err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// ── 범용 JSON fetch 프록시 ─────────────────────────────────
// POST /proxy/fetch-json  body: { url }
app.post('/proxy/fetch-json', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    console.error('[fetch-json proxy error]', err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// ── 범용 인증 포함 forward 프록시 ──────────────────────────
// POST /proxy/forward  body: { url, method, headers, body }
app.post('/proxy/forward', async (req, res) => {
  const { url, method = 'GET', headers = {}, body } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  try {
    const fetchOpts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    };
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
      fetchOpts.body = JSON.stringify(body);
    }

    console.log(`[forward] ${method} ${url}`);
    if (body) console.log(`[forward] body:`, JSON.stringify(body));

    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }

    console.log(`[forward] → ${upstream.status}`, text.length > 300 ? text.slice(0, 300) + '...' : text);

    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[forward proxy error]', err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

// ── API Gateway 스펙 파일 업로드 프록시 ────────────────────
// POST /proxy/upload-api
// body: { url, method, auth, specText, apiName, apiVersion, apiDescription, specType }
// specType: 'openapi' | 'swagger' | 'raml' | 'wsdl'
app.post('/proxy/upload-api', jsonLarge, async (req, res) => {
  const { url, method = 'POST', auth, specText, apiName, apiVersion, apiDescription, specType = 'openapi' } = req.body;
  if (!url || !specText || !apiName) {
    return res.status(400).json({ error: 'url, specText, apiName are required' });
  }

  try {
    const form = new FormData();
    form.append('file', new Blob([specText], { type: 'application/json' }), 'spec.json');
    form.append('apiName', apiName);
    form.append('type', specType);
    if (apiVersion)     form.append('apiVersion', apiVersion);
    if (apiDescription) form.append('apiDescription', apiDescription);

    // Content-Type은 fetch가 FormData에서 boundary 포함해서 자동 설정 — 수동 지정 금지
    const upstream = await fetch(url, {
      method,
      headers: { Authorization: auth },
      body: form,
    });

    const text = await upstream.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
    }
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[upload-api proxy error]', err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
});

app.listen(PORT, () => {
  // HTML 파일들이 참조하는 proxy-config.js를 현재 포트로 갱신
  const configPath = path.join(__dirname, '..', 'shared', 'js', 'proxy-config.js');
  fs.writeFileSync(configPath,
    `// 서버 시작 시 자동 갱신됨 — 직접 편집하지 말 것\n` +
    `// PORT=${PORT} npm start 로 포트 변경 가능\n` +
    `window.WEB_TOOLS_PROXY = 'http://localhost:${PORT}';\n`
  );

  console.log(`Proxy server running on http://localhost:${PORT}`);
  console.log(`  POST /proxy/keycloak/dev   → ${KEYCLOAK_URLS.dev}`);
  console.log(`  POST /proxy/keycloak/prod  → ${KEYCLOAK_URLS.prod}`);
  console.log(`  POST /proxy/fetch-json     → 범용 JSON fetch 프록시`);
  console.log(`  POST /proxy/forward        → 인증 헤더 포함 범용 forward 프록시`);
  console.log(`  POST /proxy/upload-api     → API Gateway 스펙 파일 업로드 프록시`);
  console.log(`  GET  /api/connections      → apigw_api_mgmt/connections.json 서빙`);
});
