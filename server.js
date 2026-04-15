const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('\n Missing ANTHROPIC_API_KEY environment variable.\n');
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
        const typeHint = sourceType && sourceType !== 'auto' ? `The user believes this is a "${sourceType}" source.` : '';

        const isWhitepages = pages === 'whitepages';

        const system = `You are a Bluebook legal citation expert trained on the Bluebook: A Uniform System of Citation, 21st Edition.

The user has selected: ${isWhitepages ? 'WHITEPAGES (academic law review style)' : 'BLUEPAGES (practitioner style for briefs and memos)'}.

${isWhitepages ? `WHITEPAGES RULES:
- Used in law review articles and academic writing
- Citations go in footnotes
- Author names in LARGE AND SMALL CAPS (mark with [[SC]]name[[/SC]])
- Book and journal titles in LARGE AND SMALL CAPS (mark with [[SC]]title[[/SC]])
- Article titles in regular roman text, no italics
- Case names italicized (mark with [[I]]case name[[/I]])
- Example article: [[SC]]John Smith[[/SC]], Article Title, 84 U. Chi. L. Rev. 1, 5 (2017).
- Example book: [[SC]]John Smith, Book Title[[/SC]] 42 (3d ed. 2020).
- Example case: [[I]]Brown v. Board of Education[[/I]], 347 U.S. 483, 495 (1954).` : `BLUEPAGES RULES:
- Used by practitioners in court documents, briefs, and memos
- Citations appear inline in text
- No small caps — use regular roman typeface for everything except case names and book/article titles
- Case names italicized (mark with [[I]]case name[[/I]])
- Book titles italicized (mark with [[I]]title[[/I]])
- Article titles italicized (mark with [[I]]title[[/I]])
- Example case: [[I]]Brown v. Board of Education[[/I]], 347 U.S. 483, 495 (1954).
- Example article: John Smith, [[I]]Article Title[[/I]], 84 U. Chi. L. Rev. 1, 5 (2017).`}

CITATION FORMAT REQUESTED: ${citationFormat === 'brief' ? 'Court brief (practitioner inline)' : citationFormat === 'journal' ? 'Law review footnote' : 'General purpose'}

Core citation rules:
- Internet/websites (Rule 18.2): Author (if any), [[I]]Title[[/I]], Site Name, URL (last visited ${today}).
- News articles (Rule 16.6): Author, [[I]]Title[[/I]], Newspaper, Date, URL.
- Law review articles (Rule 16): Author, [[I]]Title[[/I]] or [[SC]]Author[[/SC]], title, Volume Abbrev. Journal Page (Year).
- Court cases (Rule 10): [[I]]Case Name[[/I]], Volume Reporter Page (Court Year).
- Statutes (Rule 12): Name, Code Section (Year).
- Government docs (Rule 14): Author/Agency, [[I]]Title[[/I]], Doc info (Date), URL.
- Books (Rule 15): Author, [[I]]Title[[/I]] page (ed. Year). [Whitepages: [[SC]]Author, Title[[/SC]] page]
- Patents (Rule 14.8): Inventor(s), [[I]]Title[[/I]], U.S. Patent No. X,XXX,XXX (filed Date, issued Date).

Use [[I]]text[[/I]] to mark italic text.
Use [[SC]]text[[/SC]] to mark small caps text (whitepages only).

Today's date: ${today}.
Use web_search to find the page title, author, publication name, and date.

Respond ONLY with valid JSON (no markdown fences, no extra text):
{
  "citation_general": "general citation with [[I]] and [[SC]] markers",
  "citation_brief": "court brief citation with [[I]] and [[SC]] markers",
  "citation_journal": "law review citation with [[I]] and [[SC]] markers",
  "type": "source type label",
  "rule": "Rule X.X",
  "fields": {
    "author": "...",
    "title": "...",
    "source": "...",
    "date": "...",
    "url": "..."
  },
  "notes": "any caveats or fields to verify",
  "confidence": "high|medium|low"
}`;

        console.log(`[${new Date().toLocaleTimeString()}] Citing (${pages}, ${citationFormat}): ${url}`);

        const result = await callAnthropicAPI({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{
            role: 'user',
            content: `Generate a Bluebook citation for: ${url}\n${typeHint}\nUse web_search to find the title, author, date, and publication name. Apply [[I]] and [[SC]] markers exactly as instructed.`
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
  console.log(`\n Bluebook Citation Generator running at http://localhost:${PORT}`);
  console.log('   Open that URL in your browser.');
  console.log('   Press Ctrl+C to stop.\n');
});
