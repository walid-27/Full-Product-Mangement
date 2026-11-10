const { readdirSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const files = [];
const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (["node_modules", ".git", "coverage"].includes(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith(".js") && !path.includes("tests/load")) files.push(path);
    }
};
for (const directory of ["app.js", "server.js", "worker.js", "src", "tests", "scripts"]) {
    if (directory.endsWith(".js")) files.push(directory);
    else walk(directory);
}
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
    if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
