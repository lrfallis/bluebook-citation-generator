# Bluebook Citation Generator — Local App

A local web app that generates properly formatted Bluebook 21st edition citations from any URL.

## Requirements

- Node.js v18 or later — download at https://nodejs.org
- An Anthropic API key — get one free at https://console.anthropic.com

---

## Setup & Run

### Step 1 — Set your API key

**Mac / Linux:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Windows (Command Prompt):**
```cmd
set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

> Tip: Add the export line to your ~/.zshrc or ~/.bashrc so you don't have to set it every time.

---

### Step 2 — Start the server

```bash
node server.js
```

You should see:
```
✅  Bluebook Citation Generator running at http://localhost:3000
```

### Step 3 — Open the app

Open your browser and go to: **http://localhost:3000**

---

## Usage

1. Paste any URL into the input field
2. Optionally select the source type (auto-detect works well)
3. Click **Generate citation**
4. Copy the formatted citation

---

## Why two versions?

| | Standalone HTML | This Node.js app |
|---|---|---|
| Setup | Just open the file | Run `node server.js` |
| API key | Stored in browser | Set as env variable (more secure) |
| Internet needed | Yes | Yes (for API calls) |

---

## Supported citation types (Bluebook 21st Ed.)

- Internet / websites (Rule 18.2)
- News articles (Rule 16.6)
- Law review & journal articles (Rule 16)
- Court cases (Rule 10)
- Statutes & regulations (Rule 12)
- Government documents (Rule 14)
- Books & treatises (Rule 15)
