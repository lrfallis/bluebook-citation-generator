const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('\nMissing ANTHROPIC_API_KEY environment variable.\n');
  process.exit(1);
}

function callAnthropicAPI(payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error('Failed to parse API response')); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET') {
    const filePath = req.url === '/' ? '/public/index.html' : '/public' + req.url;
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
      const ext = path.extname(fullPath);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      fs.createReadStream(fullPath).pipe(res);
      return;
    }
    res.writeHead(404); res.end('Not found'); return;
  }

  if (req.method === 'POST' && req.url === '/api/cite') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url, sourceType, citationFormat, pages } = JSON.parse(body);
        if (!url) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing url' })); return; }

        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const typeHint = sourceType && sourceType !== 'auto' ? `Source type: ${sourceType}.` : '';
        const isWhitepages = pages === 'whitepages';

        const system = `You are a Bluebook 21st Edition citation expert. Use these formatting markers:
[[I]]text[[/I]] = italics
[[SC]]text[[/SC]] = small caps

${isWhitepages ? `WHITEPAGES (academic footnotes):
- Journal articles (R16): [[SC]]Author[[/SC]], [[I]]Article Title[[/I]], Vol. Journal Page (Year).
- Books (R15): [[SC]]Author, Book Title[[/SC]] page (ed. Year).
- Cases (R10): [[I]]Case Name[[/I]], Vol. Reporter Page (Court Year).
- Internet (R18.2): Author, [[I]]Title[[/I]], Site (Date), URL (last visited ${today}).
- News (R16.6): Author, [[I]]Title[[/I]], Newspaper, Date, URL.
- Statutes (R12): Plain text only. No markers.
- Patents (R14.8): Inventor et al., [[I]]Title[[/I]], U.S. Patent No. X,XXX,XXX (filed Date, issued Date).
- Gov docs (R14): Agency, [[I]]Title[[/I]], Doc No. (Date), URL.
Key: Author names and book titles use [[SC]]. Article titles always use [[I]], never [[SC]].`

: `BLUEPAGES (practitioner inline):
- Journal articles (B16): Author, [[I]]Article Title[[/I]], Vol. Journal Page (Year).
- Books (B15): Author, [[I]]Book Title[[/I]] page (ed. Year).
- Cases (B10): [[I]]Case Name[[/I]], Vol. Reporter Page (Court Year).
- Internet (B18): Author, [[I]]Title[[/I]], Site (Date), URL (last visited ${today}).
- News (B16): Author, [[I]]Title[[/I]], Newspaper, Date, URL.
- Statutes (B12): Plain text only. No markers.
- Patents (R14.8): Inventor et al., [[I]]Title[[/I]], U.S. Patent No. X,XXX,XXX (filed Date, issued Date).
- Gov docs (B14): Agency, [[I]]Title[[/I]], Doc No. (Date), URL.
Key: Author names are always plain text. Titles always use [[I]]. Never use [[SC]] in Bluepages.`}

Use web_search to find author, title, publication, and date. Today: ${today}.

Return ONLY this JSON (no markdown):
{
  "citation_general": "...",
  "citation_brief": "...",
  "citation_journal": "...",
  "type": "...",
  "rule": "...",
  "fields": { "author": "...", "title": "...", "source": "...", "date": "...", "url": "..." },
  "notes": "...",
  "confidence": "high|medium|low"
}`;

        console.log(`[${new Date().toLocaleTimeString()}] Citing (${pages}, ${citationFormat}): ${url}`);

        const result = await callAnthropicAPI({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Generate a Bluebook citation for: ${url}\n${typeHint}\nSearch for the author, title, publication, and date. Apply [[I]] and [[SC]] markers correctly per the rules above.`
          }]
        });

        if (result.status !== 200) throw new Error(result.body?.error?.message || `API error ${result.status}`);

        const text = (result.body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
        if (!text) throw new Error('No response from API. Check your API key.');

        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Could not parse citation from response.');

        const parsed = JSON.parse(match[0]);
        console.log(`[${new Date().toLocaleTimeString()}] Done: ${parsed.type} (${parsed.confidence})`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(parsed));

      } catch (err) {
        console.error(`Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Server error' }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\nBluebook Citation Generator running at http://localhost:${PORT}`);
  console.log('   Open that URL in your browser.');
  console.log('   Press Ctrl+C to stop.\n');
});
