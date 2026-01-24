import { createQuickPick } from "../_lib/quickpick.js";
import { jsonResponse, methodNotAllowed, readJson } from "../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return methodNotAllowed();
  }

  const payload = await readJson(context.request);
  const quickPick = createQuickPick(context.env || {});
  const result = await quickPick.handleResult(payload);
  return jsonResponse(result.body, result.status);
}
