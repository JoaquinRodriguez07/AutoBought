const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const pactum = require("pactum");

const FRONTEND_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.resolve(FRONTEND_DIR, "..", "backend");
const PYTHON = path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe");
const HOST = "127.0.0.1";
const DATABASE_PATH = path.join(
  os.tmpdir(),
  `autobought-pactum-${process.pid}.db`
);

let server;
let baseUrl;
let serverErrors = "";

function sqliteUrl(databasePath) {
  return `sqlite:///${databasePath.replaceAll("\\", "/")}`;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, HOST, () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

async function waitForApi(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/v1/brands`);
      if (response.ok) return;
    } catch {
      // Uvicorn may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

    throw new Error(
      `The FastAPI server did not become ready in time.\n${serverErrors}`
    );
}

beforeAll(async () => {
  if (fs.existsSync(DATABASE_PATH)) fs.rmSync(DATABASE_PATH);

  const environment = {
    ...process.env,
    DATABASE_URL: sqliteUrl(DATABASE_PATH),
  };

  const seed = spawnSync(PYTHON, ["-m", "scripts.seed"], {
    cwd: BACKEND_DIR,
    env: environment,
    encoding: "utf8",
  });
  if (seed.status !== 0) {
    throw new Error(`Could not seed integration database:\n${seed.stderr}`);
  }

  const port = await findFreePort();
  baseUrl = `http://${HOST}:${port}`;
  server = spawn(
    PYTHON,
    ["-m", "uvicorn", "main:app", "--host", HOST, "--port", String(port)],
    { cwd: BACKEND_DIR, env: environment, stdio: ["ignore", "ignore", "pipe"] }
  );
  server.stderr.on("data", (data) => {
    serverErrors += data.toString();
  });

  pactum.request.setBaseUrl(baseUrl);
  await waitForApi(baseUrl);
}, 30000);

afterAll(async () => {
  pactum.request.setBaseUrl("");
  if (server && server.exitCode === null) {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 1000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"]);
      } else {
        server.kill();
      }
    });
  }
  if (fs.existsSync(DATABASE_PATH)) {
    fs.rmSync(DATABASE_PATH, { maxRetries: 5, retryDelay: 100 });
  }
});

describe("catalog API frontend contract", () => {
  test("returns brands and models for the frontend brand selector", async () => {
    await pactum
      .spec()
      .get("/api/v1/brands")
      .expectStatus(200)
      .expectJson("brands[0].brand", "Chevrolet")
      .expectJson("brands[0].models[0]", "Corsa");
  });

  test("returns frontend-compatible part catalog data", async () => {
    await pactum
      .spec()
      .get("/api/v1/parts")
      .expectStatus(200)
      .expectJsonLike({
        parts: [
          {
            id: 1,
            name: "Oil filter 1.4 8V",
            compatible_brands: ["Chevrolet"],
            compatible_models: ["Onix", "Prisma"],
            year_from: 2013,
            year_to: 2019,
            engine_code: "1.4 8V",
            part_code: "FIL-0001",
            category: "Filters",
            color: null,
            price: 790,
            stock: 38,
          },
        ],
      });
  });
});