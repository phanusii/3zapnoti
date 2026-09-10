import fs from "fs";

const content = fs.readFileSync("app.js", "utf8");
const lines = content.split("\n");
let depth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  let lineChanges = "";
  for (let char of line) {
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
    }
  }
  if (depth < 0) {
    console.log(`❌ Depth went negative at line ${i + 1}: depth = ${depth} | ${line.trim()}`);
    break;
  }
}
console.log(`Final depth: ${depth}`);
