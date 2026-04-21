import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const params = await context.params;
  const code = Number.parseInt(params.code, 10);
  const supported = new Set([401, 403, 404, 500]);
  const status = supported.has(code) ? code : 500;

  return NextResponse.json(
    {
      status,
      message:
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : status === 404
              ? "not found"
              : "server error",
    },
    { status }
  );
}

