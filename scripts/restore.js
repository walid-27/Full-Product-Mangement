const { existsSync } = require("fs");
const { spawn } = require("child_process");
const path = require("path");
const { loadEnv } = require("../src/config/env");

const archive = process.argv[2] && path.resolve(process.argv[2]);
if (!archive || !existsSync(archive)) throw new Error("Usage: node scripts/restore.js <backup.archive.gz>");
if (process.env.CONFIRM_RESTORE !== "true") throw new Error("Set CONFIRM_RESTORE=true after testing this archive on staging");
const child = spawn("mongorestore", [`--uri=${loadEnv().MONGO_URL}`, `--archive=${archive}`, "--gzip", "--drop"], { stdio: "inherit" });
child.on("exit", (code) => { process.exitCode = code || 0; });
