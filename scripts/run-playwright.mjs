import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { createServer } from "vite";

const server = await createServer({
  server: { host: "127.0.0.1", port: 4173, strictPort: true },
});

let child;
let closing = false;
const close = async (code = 1) => {
  if (closing) return;
  closing = true;
  if (child && child.exitCode === null) child.kill("SIGTERM");
  await server.close();
  process.exit(code);
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => close(1));

try {
  await server.listen();
  const cli = new URL("../node_modules/@playwright/test/cli.js", import.meta.url);
  child = spawn(process.execPath, [fileURLToPath(cli), "test", ...process.argv.slice(2)], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PW_EXTERNAL_SERVER: "1" },
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", value => resolve(value ?? 1));
  });
  closing = true;
  await server.close();
  process.exit(code);
} catch (error) {
  console.error(error);
  await close(1);
}
