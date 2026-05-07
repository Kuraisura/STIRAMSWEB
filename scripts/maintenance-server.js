const fs = require('fs')
const path = require('path')
const http = require('http')

const portArg = Number.parseInt(process.argv[2] || '3000', 10)
const port = Number.isNaN(portArg) ? 3000 : portArg
const htmlPath = path.join(__dirname, '..', 'public', 'maintenance.html')
const statusPath = path.join(__dirname, '..', 'public', 'maintenance-status.txt')

const fallbackHtml = `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>Maintenance</title></head>
<body style="font-family:Segoe UI,Tahoma,sans-serif;background:#0b1220;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
<div><h1>Under Maintenance</h1><p>System is being updated. Please try again shortly.</p></div>
</body>
</html>`

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/maintenance-status.txt')) {
    let statusText = 'Preparing maintenance mode...\nUnknown'
    try {
      statusText = fs.readFileSync(statusPath, 'utf8')
    } catch {}

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      SurrogateControl: 'no-store',
    })
    res.end(statusText)
    return
  }

  if ((req.url || '').startsWith('/favicon')) {
    res.writeHead(204)
    res.end()
    return
  }

  let html = fallbackHtml
  try {
    html = fs.readFileSync(htmlPath, 'utf8')
  } catch {}

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    SurrogateControl: 'no-store',
  })
  res.end(html)
})

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`[MAINTENANCE] Listening on http://localhost:${port}\n`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
