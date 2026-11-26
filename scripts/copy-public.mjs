// build の後段：public/ の静的ファイルを dist/ へコピーする。
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
cpSync("public/index.html", "dist/index.html");
cpSync("public/style.css", "dist/style.css");
console.log("copied public/ -> dist/");
