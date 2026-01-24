import { jsonResponse, methodNotAllowed } from "../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed();
  }
  return jsonResponse({ status: "ok" });
}
