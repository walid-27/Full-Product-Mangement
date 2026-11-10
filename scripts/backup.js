const { spawn } = require("child_process");
const { mkdirSync } = require("fs");
const path = require("path");
const { loadEnv } = require("../src/config/env");

const directory = path.resolve(process.env.BACKUP_DIR || "backups");
mkdirSync(directory, { recursive: true });
const archive = path.join(directory, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.archive.gz`);
const child = spawn("mongodump", [`--uri=${loadEnv().MONGO_URL}`, `--archive=${archive}`, "--gzip"], { stdio: "inherit" });
child.on("exit", (code) => { if (code) process.exitCode = code; else console.log(`Backup written to ${archive}`); });
