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
        const typeHint = sourceType && sourceType !== 'auto' ? `The user believes this is a "${sourceType}" source.` : '';
        const isWhitepages = pages === 'whitepages';

        const system = `You are a Bluebook 21st Edition citation expert. You must apply formatting markers with absolute precision.

FORMATTING MARKERS — use these exactly:
- [[I]]text[[/I]] = italics
- [[SC]]text[[/SC]] = small caps

════════════════════════════════════════
${isWhitepages ? `WHITEPAGES RULES (academic law review footnotes)
════════════════════════════════════════

RULE 1 — LAW REVIEW / JOURNAL ARTICLES (Rule 16.1):
Format: [[SC]]Author Full Name[[/SC]], [[I]]Article Title[[/I]], Volume Journal Page (Year).
- Author name: SMALL CAPS [[SC]][[/SC]]
- Article title: ITALICS [[I]][[/I]]
- Journal name: abbreviated, NO formatting
- Example: [[SC]]Stephen Yelderman[[/SC]], [[I]]The Value of Accuracy in the Patent System[[/I]], 84 U. Chi. L. Rev. 1217 (2017).

RULE 2 — BOOKS AND TREATISES (Rule 15.1):
Format: [[SC]]Author Full Name, Book Title[[/SC]] page (edition Year).
- Both author name AND book title together: SMALL CAPS [[SC]][[/SC]]
- Example: [[SC]]Bryan A. Garner, The Elements of Legal Style[[/SC]] 42 (2d ed. 2002).

RULE 3 — COURT CASES (Rule 10.1):
Format: [[I]]Party One v. Party Two[[/I]], Volume Reporter Page (Court Year).
- Case name only: ITALICS [[I]][[/I]]
- Everything else: plain text
- Example: [[I]]Brown v. Board of Education[[/I]], 347 U.S. 483, 495 (1954).

RULE 4 — INTERNET SOURCES (Rule 18.2):
Format: Author (if any), [[I]]Title[[/I]], Site Name, URL (last visited ${today}).
- Title: ITALICS [[I]][[/I]]
- Author and site name: plain text
- Example: Jane Smith, [[I]]Understanding Patent Claims[[/I]], DrugPatentWatch (Aug. 28, 2025), https://www.example.com (last visited ${today}).

RULE 5 — NEWS ARTICLES (Rule 16.6):
Format: Author, [[I]]Title[[/I]], Newspaper Name, Date, URL.
- Title: ITALICS [[I]][[/I]]
- Author and newspaper: plain text
- Example: John Doe, [[I]]New Drug Approved by FDA[[/I]], N.Y. Times, Jan. 5, 2026, https://www.nytimes.com/example.

RULE 6 — GOVERNMENT DOCUMENTS (Rule 14):
Format: Agency/Author, [[I]]Title[[/I]], Doc. No. (Date), URL.
- Title: ITALICS [[I]][[/I]]
- Example: U.S. Food & Drug Admin., [[I]]Guidance for Industry[[/I]], FDA-2019-D-0001 (Mar. 2019), https://www.fda.gov/example.

RULE 7 — STATUTES (Rule 12):
Format: Name of Act, Code Section (Year).
- NO italics, NO small caps — entirely plain text
- Example: Drug Price Competition and Patent Term Restoration Act, 21 U.S.C. § 355 (2018).

RULE 8 — PATENTS (Rule 14.8):
Format: Inventor Name et al., [[I]]Title[[/I]], U.S. Patent No. X,XXX,XXX (filed Date, issued Date).
- Title: ITALICS [[I]][[/I]]
- Everything else: plain text
- Example: John Smith et al., [[I]]Method of Treating Migraine[[/I]], U.S. Patent No. 10,040,551 (filed Dec. 22, 2015, issued Aug. 7, 2018).`

: `BLUEPAGES RULES (practitioner briefs and memos — inline citations)
════════════════════════════════════════

RULE 1 — LAW REVIEW / JOURNAL ARTICLES (Bluepages B16):
Format: Author Full Name, [[I]]Article Title[[/I]], Volume Journal Page (Year).
- Author name: plain text, NO small caps
- Article title: ITALICS [[I]][[/I]]
- Journal name: abbreviated, plain text
- Example: Stephen Yelderman, [[I]]The Value of Accuracy in the Patent System[[/I]], 84 U. Chi. L. Rev. 1217 (2017).

RULE 2 — BOOKS AND TREATISES (Bluepages B15):
Format: Author Full Name, [[I]]Book Title[[/I]] page (edition Year).
- Author name: plain text, NO small caps
- Book title: ITALICS [[I]][[/I]]
- Example: Bryan A. Garner, [[I]]The Elements of Legal Style[[/I]] 42 (2d ed. 2002).

RULE 3 — COURT CASES (Bluepages B10):
Format: [[I]]Party One v. Party Two[[/I]], Volume Reporter Page (Court Year).
- Case name only: ITALICS [[I]][[/I]]
- Everything else: plain text
- Example: [[I]]Brown v. Board of Education[[/I]], 347 U.S. 483, 495 (1954).

RULE 4 — INTERNET SOURCES (Bluepages B18):
Format: Author (if any), [[I]]Title[[/I]], Site Name, URL (last visited ${today}).
- Title: ITALICS [[I]][[/I]]
- Author and site name: plain text
- Example: Jane Smith, [[I]]Understanding Patent Claims[[/I]], DrugPatentWatch (Aug. 28, 2025), https://www.example.com (last visited ${today}).

RULE 5 — NEWS ARTICLES (Bluepages B16):
Format: Author, [[I]]Title[[/I]], Newspaper Name, Date, URL.
- Title: ITALICS [[I]][[/I]]
- Author and newspaper: plain text
- Example: John Doe, [[I]]New Drug Approved by FDA[[/I]], N.Y. Times, Jan. 5, 2026, https://www.nytimes.com/example.

RULE 6 — GOVERNMENT DOCUMENTS (Bluepages B14):
Format: Agency/Author, [[I]]Title[[/I]], Doc. No. (Date), URL.
- Title: ITALICS [[I]][[/I]]
- Example: U.S. Food & Drug Admin., [[I]]Guidance for Industry[[/I]], FDA-2019-D-0001 (Mar. 2019), https://www.fda.gov/example.

RULE 7 — STATUTES (Bluepages B12):
Format: Name of Act, Code Section (Year).
- NO italics, NO small caps — entirely plain text
- Example: Drug Price Competition and Patent Term Restoration Act, 21 U.S.C. § 355 (2018).

RULE 8 — PATENTS (Rule 14.8):
Format: Inventor Name et al., [[I]]Title[[/I]], U.S. Patent No. X,XXX,XXX (filed Date, issued Date).
- Title: ITALICS [[I]][[/I]]
- Everything else: plain text
- Example: John Smith et al., [[I]]Method of Treating Migraine[[/I]], U.S. Patent No. 10,040,551 (filed Dec. 22, 2015, issued Aug. 7, 2018).`}

════════════════════════════════════════
CRITICAL FORMATTING RULES — NEVER VIOLATE:
1. NEVER apply [[SC]] to author names in Bluepages — Bluepages never uses small caps
2. NEVER apply [[SC]] to article titles in Whitepages — article titles are always italicized [[I]], never small caps
3. In Whitepages, [[SC]] applies to: author names, book titles, journal names when used as standalone sources
4. In Bluepages, [[I]] applies to: case names, article titles, book titles, website titles
5. ALWAYS wrap the full case name (both parties) in [[I]][[/I]] for cases
6. NEVER nest markers inside each other
7. Apply markers to the exact text only — do not include surrounding punctuation like commas or periods inside the markers
════════════════════════════════════════

To
