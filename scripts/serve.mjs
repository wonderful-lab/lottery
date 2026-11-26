// 依存ゼロの開発用サーバー：dist/ を http://localhost:4173 で配信する。
// ESモジュールの読み込みに file:// では CORS で失敗するため、
// ローカル確認はこのサーバー（または npx serve dist）経由で行う。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const PORT = 4173;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const path = req.url === "/" || !req.url ? "/index.html" : req.url.split("?")[0];
  try {
    const data = await readFile(join("dist", path));
    res.writeHead(200, {
      "Content-Type": MIME[extname(path)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`serving dist/ at http://localhost:${PORT}`);
});
