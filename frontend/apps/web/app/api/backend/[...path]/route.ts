import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/server-api-base-url";

/**
 * First path segment allowlist — mirrors public backend routes used by the web app.
 *
 * 這只是 **transport allowlist**：決定哪些前綴可以被轉發到 Backend，
 * **不是**授權邊界。授權一律由 Backend 的 `requireAuth` / `requireRole` 決定
 * （CLAUDE.md §3），未列入的前綴在這裡就以 403 擋掉，列入的前綴仍必須自行通過 Backend 驗證。
 *
 * `creator` 與 `teacher` **兩者都要保留**：
 * `Backend/index.js` 把 `creatorCasesRouter` 同時掛在 `/creator/cases`（canonical）
 * 與 `/teacher/cases`（相容別名）。前端呼叫的是 canonical 的 `creator/cases`，
 * 但這裡先前只列了 `teacher`，於是四個呼叫端全部被 proxy 自己擋成 403
 * （`/creator/cases`、`/creator/cases/:id`、`/creator/cases/:id/respond`，
 * 以及 `RoleShell` 的待回覆案件徽章）——Backend 是好的，斷在 transport 這一層。
 * 移除 `teacher` 會連帶打斷 `teacher/sales` 與 `teacher/uploads/*`。
 */
const ALLOW_ROOT = new Set([
  "auth",
  "materials",
  "cart",
  "orders",
  "download",
  "reviews",
  "me",
  "reports",
  "health",
  "admin",
  "creator",
  "payment",
  "teacher",
  // 法律文件（P1-09 Legal Foundation）。Backend 端 `/legal/*` 為 public read-only，
  // 只吐 published 版本；寫入路徑在 `/admin/legal-documents/*`（已由 "admin" 涵蓋）。
  "legal",
]);

function isAllowed(segments: string[]): boolean {
  if (segments.length === 0) return false;
  return ALLOW_ROOT.has(segments[0]);
}

async function proxy(request: NextRequest, segments: string[]): Promise<Response> {
  if (!isAllowed(segments)) {
    return NextResponse.json({ message: "not allowed" }, { status: 403 });
  }

  // `PRE-12`：在 handler 內取值，production 缺漏即明確失敗，不靜默退回 localhost。
  const API_BASE_URL = getServerApiBaseUrl();
  const path = segments.join("/");
  const incoming = new URL(request.url);
  const targetUrl = `${API_BASE_URL}/${path}${incoming.search}`;

  const headersOut = new Headers();
  const auth = request.headers.get("authorization");
  if (auth) {
    headersOut.set("Authorization", auth);
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headersOut.set("Content-Type", contentType);
  }

  const init: RequestInit = {
    method: request.method,
    headers: headersOut,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 0) {
      init.body = buf;
    }
  }

  const upstream = await fetch(targetUrl, init);

  /*
   * 回應**以串流原樣轉發**，不做 `await upstream.text()`。
   *
   * 用 text() 讀回應等於把位元組當成 UTF-8 解碼 —— JSON 沒事，但任何二進位內容
   * （教材檔案、PDF）都會在這裡被靜默毀損：下載得到的檔案打不開，而且 status 是 200，
   * 看起來一切正常。改成串流之後，proxy 不再解讀它轉發的東西是什麼。
   *
   * header 用 allowlist 轉發：下載需要 Content-Disposition 才會有正確檔名，
   * 需要 Content-Length 才有進度條；其餘 upstream header 沒有理由外流到瀏覽器。
   */
  const headersIn = new Headers();
  for (const name of [
    "content-type",
    "content-disposition",
    "cache-control",
    "x-content-type-options",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headersIn.set(name, value);
  }

  /*
   * `Content-Length` **只有在 upstream 沒有壓縮時才轉發**。
   *
   * `fetch()` 會自動解壓縮 `upstream.body`，但**不會**跟著修正 `content-length` ——
   * 那個 header 留在原本的**壓縮後**大小，`content-encoding` 也還在。於是無條件轉發它
   * 等於對一個「已解壓縮、比較大」的 body 宣告一個「壓縮後、比較小」的長度，
   * client 就會在讀到那個長度時**把 body 截斷**。
   *
   * 這不是理論。production 的 Render backend 前面有 Cloudflare，而它**對每一個 JSON 回應
   * 都做 brotli 壓縮**（實測連 15 bytes 的 `/health` 都有 `content-encoding: br`）。
   * `GET /payment/bank-info` 因此在瀏覽器端變成一段開頭是 `{`、結尾沒有 `}` 的字串，
   * `JSON.parse` 丟 `Unexpected end of JSON input` —— 付款指示整頁壞掉，
   * 而 status 是 200、`content-type` 是 `application/json`，看起來一切正常。
   *
   * 本機以「gzip 後 124 bytes / 解壓後 196 bytes」的 origin 對這支 proxy 重現過：
   * 修正前收到 124 bytes 且無法 parse，修正後收到完整 196 bytes。
   *
   * 為什麼不是「一律不轉發」：教材下載要靠 `Content-Length` 才有進度條，而教材本體
   * 多半是 PDF／ZIP 這類**已壓縮**格式，CDN 不會再壓一次，那時 header 是準確的、值得保留。
   * 所以判斷依據是「這個 body 有沒有被解壓縮過」，不是「是不是下載」。
   *
   * 省略 `Content-Length` 時 Next 會改用 chunked transfer encoding —— 對串流而言本來就正確。
   */
  const upstreamEncoding = (upstream.headers.get("content-encoding") || "").trim().toLowerCase();
  const bodyWasDecompressed = upstreamEncoding !== "" && upstreamEncoding !== "identity";
  if (!bodyWasDecompressed) {
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headersIn.set("content-length", contentLength);
  }
  if (!headersIn.has("content-type")) headersIn.set("content-type", "application/json");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: headersIn,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}
