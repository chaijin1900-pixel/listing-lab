const { createServer } = require("node:http");
const { existsSync, readFileSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const amazonSearch = require("./api/amazon-search.js");
const optimizeListing = require("./api/optimize-listing.js");

const rootDir = __dirname;
const defaultPort = Number.parseInt(process.env.PORT || "5175", 10);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, "http://localhost");
  const urlPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const decodedPath = decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(rootDir, decodedPath));

  if (!filePath.startsWith(rootDir) || filePath.includes(`${path.sep}api${path.sep}`)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function createRequestHandler() {
  return async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");

    if (requestUrl.pathname === "/api/amazon-search") {
      await amazonSearch(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/optimize-listing") {
      await optimizeListing(request, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD, POST" });
      response.end();
      return;
    }

    await serveStatic(request, response);
  };
}

function startServer(port, attemptsRemaining = 10) {
  const server = createServer(createRequestHandler());

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsRemaining > 0) {
      startServer(port + 1, attemptsRemaining - 1);
      return;
    }

    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Listing Lab running at http://127.0.0.1:${port}/`);
  });
}

startServer(Number.isFinite(defaultPort) ? defaultPort : 5175);
