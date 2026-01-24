export async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    return {};
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function methodNotAllowed() {
  return new Response("Method Not Allowed", { status: 405 });
}
