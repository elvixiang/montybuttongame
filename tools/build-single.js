#!/usr/bin/env node
/* Builds dist/MontyCupChallenge.html — one self-contained file (all images,
   fonts, CSS and JS embedded). Handy for offline testing: just open it.
   Usage:  node tools/build-single.js                                    */
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const mime = { ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const dataUri = (p) => "data:" + mime[path.extname(p)] + ";base64," + fs.readFileSync(path.join(root, p)).toString("base64");

let html = read("index.html");
let css = read("css/style.css").replace(/\.\.\/fonts\//g, "fonts/");
html = html.replace(/<link rel="stylesheet" href="css\/style.css">/, () => "<style>\n" + css + "\n</style>");
html = html.replace(/<link rel="(manifest|preload)"[^>]*>\n?/g, "");
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (_, src) => "<script>\n" + read(src) + "\n</script>");

const files = [];
["assets", "fonts", "icons"].forEach((d) => fs.readdirSync(path.join(root, d)).forEach((f) => files.push(d + "/" + f)));
const cache = {};
files.forEach((f) => {
  const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  if (re.test(html)) { cache[f] = cache[f] || dataUri(f); html = html.replace(re, () => cache[f]); }
});

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "MontyCupChallenge.html");
fs.writeFileSync(out, html);
console.log("Built", out, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + " MB");
