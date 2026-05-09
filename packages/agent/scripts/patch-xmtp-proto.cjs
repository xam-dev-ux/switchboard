// Patches @xmtp/proto ESM dist: adds missing .js extensions to all .pb imports.
// The published package imports './foo.pb' but the file on disk is './foo.pb.js' —
// Node's strict ESM resolver requires explicit extensions.
const fs   = require("fs");
const path = require("path");

// Walk up from cwd to find @xmtp/proto (may be hoisted to monorepo root)
function findProtoDir() {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, "node_modules", "@xmtp", "proto");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
}

const protoDir = findProtoDir();
if (!protoDir) {
  console.log("[patch-xmtp-proto] @xmtp/proto not found, skipping");
  process.exit(0);
}

const esmDir = path.join(protoDir, "ts", "dist", "esm");
if (!fs.existsSync(esmDir)) {
  console.log("[patch-xmtp-proto] ESM dist not found, skipping");
  process.exit(0);
}

function patch(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { patch(full); continue; }
    if (!entry.name.endsWith(".js")) continue;
    const original = fs.readFileSync(full, "utf8");
    const fixed = original
      .replace(/from "(\.[^"]*\.pb)"/g,   'from "$1.js"')
      .replace(/from '(\.[^']*\.pb)'/g,   "from '$1.js'")
      .replace(/import "(\.[^"]*\.pb)"/g, 'import "$1.js"')
      .replace(/import '(\.[^']*\.pb)'/g, "import '$1.js'");
    if (fixed !== original) {
      fs.writeFileSync(full, fixed);
      console.log("[patch-xmtp-proto] fixed:", path.relative(protoDir, full));
    }
  }
}

patch(esmDir);
console.log("[patch-xmtp-proto] done");
