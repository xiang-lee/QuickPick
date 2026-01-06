const test = require("node:test");
const assert = require("node:assert");
const app = require("../server");

test("GET /api/health returns ok", async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const response = await fetch(`http://localhost:${port}/api/health`);
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.status, "ok");

  server.close();
});
