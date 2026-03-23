const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = 5173;

const mime = {
  ".html": "text/html",
  ".json": "application/json",
  ".js": "application/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
  ".css": "text/css"
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const cleaned = urlPath.replace(/^\/+/, "");
  const fallback = cleaned === "" ? "index.html" : cleaned;
  const filePath = path.join(root, fallback);

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, () => {
  console.log(`Special Tracker running at http://localhost:${port}`);
});
