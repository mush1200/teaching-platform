const express = require("express");
const db = require("../config/db");
const { requireAuth, optionalAuth, requireRole } = require("../middlewares/auth");
const { writeActivityLog } = require("../utils/activityLog");
const reviewService = require("../services/review.service");
const reportRepository = require("../repositories/report.repository");
const { parseOptionalReportStatusQuery } = require("../utils/reportStatusQuery");
const { MATERIAL_FEATURE_SET, normalizeMaterialFeatures } = require("../constants/materialFeatures");
const { isDeliverable } = require("../utils/materialDeliverability");
const materialReviewService = require("../services/materialReview.service");
const materialFileService = require("../services/materialFile.service");
const materialMediaService = require("../services/materialMedia.service");
const materialWorkflow = require("../utils/materialWorkflow");
const { sendFileDownload } = require("../utils/fileDownloadResponse");

const router = express.Router();
const { requireActiveAccount } = require("../middlewares/accountStatus");

/**
 * 對外回傳的教材欄位。
 *
 * 審核快照（`review_*` / `reviewed_*`）也在其中，但**不是每個人都看得到** ——
 * 見 `applyReviewSnapshotVisibility`。
 */
/**
 * 評分彙總 —— **與 `repositories/review.repository.js` 的 `ratingStats()` 同一個定義**
 * （`ROUND(AVG(rating)::numeric, 1)` ＋ `COUNT(*)`）。
 *
 * 先前只有 `GET /materials/:id/rating` 會算評分，清單 payload 完全沒有這兩個欄位，
 * 於是前端的 mapper 只能把每張卡片寫死成 `rating: 0, reviewCount: 0`。
 * 結果是同一份教材在 `/materials`／`/explore` 顯示 `0.0 (0)`，在詳情頁顯示 `4.5 (2)`，
 * 而「評分」排序與「4 星以上」篩選因為全部值都是 0 而永遠無效
 * （後者對每一份教材都回傳空結果）。
 *
 * 用 `LEFT JOIN LATERAL` 而不是相關子查詢：一次掃描同時取回平均與筆數，
 * 也讓兩個欄位保證來自同一次彙總。
 */
const RATING_AGGREGATE_LATERAL_SQL = `
       LEFT JOIN LATERAL (
         SELECT ROUND(AVG(r.rating)::numeric, 1) AS average, COUNT(*)::integer AS count
         FROM review r
         WHERE r.material_id = materials.id
       ) rating_agg ON TRUE`;

const MATERIAL_COLUMNS = `id, title, description, price, created_at, updated_at, category, age_range,
              teacher_id, status, ip_declaration_accepted, ip_declaration_at,
              teaching_objective, teaching_methods, usage_duration, activity_steps, extension_value,
              short_description, cover_image_url, demo_video_url, material_features,
              review_reason_code, review_note, reviewed_by, reviewed_at, published_at`;

/**
 * 審核快照只給 **admin 與教材擁有者**。
 *
 * 退回原因與審核者是**內部審核資訊**：對買家沒有意義，而 `reviewed_by` 還是一個
 * admin 的 user id。published 教材是公開可讀的，因此不能無條件把這些欄位帶出去。
 * `published_at`（上架時間）不屬於審核資訊，公開保留。
 *
 * @param {object} row
 * @param {{userId?: string, role?: string}|null} user
 */
function applyReviewSnapshotVisibility(row, user) {
  if (!row) return row;
  const isAdmin = user?.role === "admin";
  const isOwner = user?.role === "teacher" && String(row.teacher_id) === String(user?.userId);
  if (isAdmin || isOwner) return row;
  const { review_reason_code, review_note, reviewed_by, reviewed_at, ...rest } = row;
  return rest;
}

function newId() {
  return `mat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeTeachingMethods(value) {
  if (!Array.isArray(value)) return null;
  const methods = value.map((v) => String(v || "").trim()).filter(Boolean);
  return methods.length > 0 ? methods : null;
}

function validateMaterialFeatures(rawFeatures) {
  const features = normalizeMaterialFeatures(rawFeatures);
  if (features === null) return { normalized: null, error: null };
  for (const feature of features) {
    if (!MATERIAL_FEATURE_SET.has(feature)) {
      return { normalized: null, error: `invalid material feature: ${feature}` };
    }
  }
  return { normalized: features, error: null };
}

function normalizeContents(value) {
  if (!Array.isArray(value)) return null;
  const items = [];
  for (const row of value) {
    const type = cleanText(row?.type);
    const name = cleanText(row?.name);
    const description = cleanText(row?.description);
    const rawCount = row?.count;
    const count = rawCount === undefined || rawCount === null || rawCount === "" ? null : Number(rawCount);
    items.push({ type, name, description, count });
  }
  return items;
}

function isValidUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeDetailImages(value) {
  if (!Array.isArray(value)) return null;
  const rows = [];
  for (let i = 0; i < value.length; i += 1) {
    const row = value[i];
    const imageUrl = cleanText(typeof row === "string" ? row : row?.image_url ?? row?.imageUrl ?? row?.url);
    const altText = cleanText(typeof row === "string" ? null : row?.alt_text ?? row?.altText);
    const rawSort = typeof row === "string" ? i : row?.sort_order ?? row?.sortOrder ?? i;
    const sortOrder = Number.isFinite(Number(rawSort)) ? Number(rawSort) : i;
    rows.push({ image_url: imageUrl, alt_text: altText, sort_order: sortOrder });
  }
  return rows;
}

function validatePayload(body, { isCreate }) {
  const title = cleanText(body?.title);
  const fileId = cleanText(body?.fileId ?? body?.file_id);
  const price = body?.price === undefined || body?.price === null ? null : Number(body.price);
  const teachingObjective = cleanText(body?.teachingObjective ?? body?.teaching_objective);
  const teachingMethods = normalizeTeachingMethods(body?.teachingMethods ?? body?.teaching_methods);
  const usageDuration = cleanText(body?.usageDuration ?? body?.usage_duration);
  const activitySteps = cleanText(body?.activitySteps ?? body?.activity_steps);
  const contents = normalizeContents(body?.contents);
  const coverImageUrl = cleanText(body?.cover_image_url ?? body?.coverImageUrl);
  const detailImages = normalizeDetailImages(body?.detail_images ?? body?.detailImages);
  const demoVideoUrl = cleanText(body?.demo_video_url ?? body?.demoVideoUrl);
  const materialFeaturesResult = validateMaterialFeatures(body?.material_features ?? body?.materialFeatures);
  const materialFeatures = materialFeaturesResult.normalized;

  if (isCreate) {
    if (!title) return "title is required";
    if (!Number.isFinite(price) || price <= 0) return "price must be greater than 0";
    if (!fileId) return "fileId is required (upload the material file first)";
    if (!teachingObjective) return "teaching_objective is required";
    if (!teachingMethods || teachingMethods.length < 1) return "teaching_methods must include at least one item";
    if (teachingMethods.length > 4) return "teaching_methods cannot exceed 4 items";
    if (!usageDuration) return "usage_duration is required";
    if (!activitySteps) return "activity_steps is required";
    if (!contents || contents.length < 1) return "contents must include at least one item";
    if (!coverImageUrl) return "cover_image_url is required";
    if (!materialFeatures || materialFeatures.length < 1) return "material_features must include at least one item";
  }

  if (!isCreate && price !== null && (!Number.isFinite(price) || price <= 0)) {
    return "price must be greater than 0";
  }
  if (teachingMethods && teachingMethods.length > 4) return "teaching_methods cannot exceed 4 items";
  if (contents) {
    if (contents.length < 1) return "contents must include at least one item";
    for (const c of contents) {
      if (!c.type) return "content.type is required";
      if (!c.name) return "content.name is required";
      if (c.count !== null && (!Number.isFinite(c.count) || c.count <= 0)) return "content.count must be greater than 0";
    }
  }
  if (coverImageUrl && !isValidUrl(coverImageUrl)) return "cover_image_url must be a valid URL";
  if (detailImages) {
    for (const image of detailImages) {
      if (!image.image_url) return "detail_images.image_url is required";
      if (!isValidUrl(image.image_url)) return "detail_images.image_url must be a valid URL";
    }
  }
  if (demoVideoUrl && !isValidUrl(demoVideoUrl)) return "demo_video_url must be a valid URL";
  if (materialFeaturesResult.error) return materialFeaturesResult.error;

  return null;
}

async function replaceMaterialContents(materialId, contents) {
  if (!Array.isArray(contents)) return;
  await db.query(`DELETE FROM material_contents WHERE material_id = $1`, [materialId]);
  for (let i = 0; i < contents.length; i += 1) {
    const item = contents[i];
    await db.query(
      `INSERT INTO material_contents(id, material_id, type, name, count, description, sort_order)
       VALUES((gen_random_uuid()::text), $1, $2, $3, $4, $5, $6)`,
      [materialId, item.type, item.name, item.count, item.description, i]
    );
  }
}

async function replaceMaterialImages(materialId, detailImages) {
  if (!Array.isArray(detailImages)) return;
  await db.query(`DELETE FROM material_images WHERE material_id = $1`, [materialId]);
  for (let i = 0; i < detailImages.length; i += 1) {
    const image = detailImages[i];
    await db.query(
      `INSERT INTO material_images(id, material_id, image_url, alt_text, sort_order)
       VALUES((gen_random_uuid()::text), $1, $2, $3, $4)`,
      [materialId, image.image_url, image.alt_text, image.sort_order ?? i]
    );
  }
}

router.get("/", optionalAuth, async (req, res) => {
  try {
    const user = req.user || null;
    const canSeeAll = user?.role === "admin";
    const canSeeOwn = user?.role === "teacher";
    const result = await db.query(
      `SELECT ${MATERIAL_COLUMNS},
              COALESCE(rating_agg.average, 0)::float AS average_rating,
              COALESCE(rating_agg.count, 0)::integer AS review_count
       FROM materials
       ${RATING_AGGREGATE_LATERAL_SQL}
       WHERE ($1::boolean = true)
          OR ($2::boolean = true AND teacher_id = $3)
          OR status = 'published'
       ORDER BY (
          CASE
            WHEN teaching_methods IS NOT NULL
             AND jsonb_typeof(teaching_methods) = 'array'
             AND jsonb_array_length(teaching_methods) >= 2
            THEN 2 ELSE 0
          END
          + CASE WHEN NULLIF(TRIM(usage_duration), '') IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN NULLIF(TRIM(activity_steps), '') IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN EXISTS (
              SELECT 1 FROM material_contents mc WHERE mc.material_id = materials.id
            ) THEN 1 ELSE 0 END
          + CASE WHEN NULLIF(TRIM(short_description), '') IS NOT NULL THEN 1 ELSE 0 END
       ) DESC,
       created_at DESC`,
      [canSeeAll, canSeeOwn, user?.userId || null]
    );
    return res.json({ items: result.rows.map((row) => applyReviewSnapshotVisibility(row, user)) });
  } catch (err) {
    console.error("list materials failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * 解析 `Range: bytes=start-end`。只支援**單一區間**。
 *
 * 多重區間（`bytes=0-9,20-29`）要求 multipart/byteranges 回應，而實務上沒有任何
 * 瀏覽器的 `<video>` 會發它 —— 支援它只是為了一個不存在的呼叫端寫程式。
 * 無法解析或超出檔案長度時回 `null`，呼叫端就當作整檔請求（200），
 * 這是 RFC 9110 允許的行為。
 *
 * @returns {{start: number, end: number}|null}
 */
function parseByteRange(header, totalBytes) {
  const raw = String(header ?? "").trim();
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match || totalBytes <= 0) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start;
  let end;
  if (rawStart === "") {
    // `bytes=-N` = 最後 N 個位元組
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalBytes - suffixLength);
    end = totalBytes - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? totalBytes - 1 : Number(rawEnd);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || start >= totalBytes || end < start) return null;
  return { start, end: Math.min(end, totalBytes - 1) };
}

/**
 * GET /materials/media/:mediaId — 教材行銷素材（封面／詳情圖／試看影片）的位元組。
 *
 * ## 為什麼是 `optionalAuth` 而不是 `requireAuth`
 *
 * 這是本 repo 第一個**條件公開**的檔案端點。已上架教材的封面必須讓匿名訪客直接用
 * `<img src>` 取得（公開商品頁），而 `<img>` 不會帶 `Authorization` header。
 * 授權判斷因此不能放在 middleware，只能在服務層依**所屬教材的 status** 決定
 * （canonical 規則見 `docs/mvp_rules.md` §3.1）：
 *
 *     published                                   → 任何人
 *     material_id IS NULL（尚未認領）              → 上傳者 或 Admin
 *     pending_review / changes_requested /
 *     unpublished                                  → 教材擁有者 或 Admin
 *
 * 下架因此是**立即生效**的：`status` 一變，同一條 URL 對匿名訪客就變成 401。
 * 這正是舊的 `express.static` 做不到、而 `SEC-02` 要修的事。
 *
 * 快取策略跟著授權走：公開素材給 `public, max-age`（否則每次瀏覽商品頁都重抓一次圖），
 * 受保護的素材一律 `private, no-store`（不能讓共享快取留下副本）。
 */
router.get("/media/:mediaId", optionalAuth, async (req, res) => {
  const mediaId = String(req.params.mediaId);
  try {
    const resolved = await materialMediaService.resolveForAccess({
      mediaId,
      user: req.user || null,
    });
    if (!resolved.ok) {
      return res
        .status(materialMediaService.statusForCode(resolved.code))
        .json({ error: resolved.code, message: resolved.message });
    }

    // Range 需要先知道檔案長度，所以先開一次（無 range）取得 totalBytes。
    const probe = await materialMediaService.openForDelivery(resolved.media, null);
    if (!probe.ok) {
      return res
        .status(materialMediaService.statusForCode(probe.code))
        .json({ error: probe.code, message: probe.message });
    }
    probe.stream.destroy();

    const range = req.headers.range ? parseByteRange(req.headers.range, probe.totalBytes) : null;
    const opened = await materialMediaService.openForDelivery(resolved.media, range);
    if (!opened.ok) {
      return res
        .status(materialMediaService.statusForCode(opened.code))
        .json({ error: opened.code, message: opened.message });
    }

    // 試看影片要能拖曳進度條 → 必須告訴瀏覽器這支端點支援 Range。
    res.setHeader("Accept-Ranges", "bytes");
    if (opened.range) {
      res.status(206);
      res.setHeader(
        "Content-Range",
        `bytes ${opened.range.start}-${opened.range.end}/${opened.totalBytes}`
      );
    }

    return sendFileDownload(res, {
      file: {
        mime_type: resolved.media.mime_type,
        original_filename: resolved.media.original_filename,
      },
      stream: opened.stream,
      sizeBytes: opened.sizeBytes,
      // 素材是拿來「看」的，不是拿來下載的檔案。
      disposition: "inline",
      cacheControl: resolved.isPublic ? "public, max-age=300" : "private, no-store",
    });
  } catch (err) {
    console.error("material media delivery failed:", err);
    if (!res.headersSent) return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id/reviews", async (req, res) => {
  try {
    const materialId = String(req.params.id);
    const items = await reviewService.listMaterialReviews(materialId);
    return res.json(items);
  } catch (err) {
    console.error("list material reviews failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id/rating", async (req, res) => {
  try {
    const materialId = String(req.params.id);
    const stats = await reviewService.getMaterialRatingStats(materialId);
    return res.json(stats);
  } catch (err) {
    console.error("material rating stats failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id/rating-distribution", async (req, res) => {
  try {
    const materialId = String(req.params.id);
    const distResult = await db.query(
      `SELECT rating, COUNT(*)::int AS c
       FROM review
       WHERE material_id = $1
       GROUP BY rating`,
      [materialId]
    );
    const countsByStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    for (const row of distResult.rows) {
      const star = Number(row.rating);
      const c = Number(row.c) || 0;
      if (star >= 1 && star <= 5) {
        countsByStar[star] = c;
        total += c;
      }
    }
    const items = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: countsByStar[star],
      percent: total > 0 ? Number((countsByStar[star] / total).toFixed(4)) : 0,
    }));
    return res.json({ total, items });
  } catch (err) {
    console.error("material rating distribution failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/** Admin：某教材之檢舉列表（與 GET /admin/materials/:materialId/reports 同欄位／同 optional status）。 */
router.get("/:id/reports", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const parsed = parseOptionalReportStatusQuery(req, res);
    if (!parsed.valid) return;
    const materialId = String(req.params.id);
    const rows = await reportRepository.listReportsByMaterialId(materialId, {
      status: parsed.status,
    });
    return res.json(rows);
  } catch (err) {
    console.error("list material reports failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      /*
       * `approved_file_id` 只用來計算對外的 `is_purchasable` 布林值，**不會**出現在回應裡
       * （下方立即解構掉）。CLAUDE.md §5：檔案識別碼不得出現在任何 API 回應。
       */
      `SELECT ${MATERIAL_COLUMNS}, approved_file_id
       FROM materials WHERE id = $1 LIMIT 1`,
      [String(req.params.id)]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "material not found" });
    const { approved_file_id: approvedFileId, ...row } = result.rows[0];
    /*
     * 可交付性（`utils/materialDeliverability.js`）。買家在**按下加入購物車之前**
     * 就該知道這份教材買不到 —— 後端的三道防線會擋住購買，但擋在點擊之後才說明，
     * 等於讓買家先期待再落空。這裡只回布林值，不洩漏檔案是否存在以外的任何資訊。
     */
    const isPurchasable = row.status === "published" && isDeliverable({ approved_file_id: approvedFileId });
    const user = req.user || null;
    const allowed =
      row.status === "published" ||
      user?.role === "admin" ||
      (user?.role === "teacher" && String(row.teacher_id) === String(user.userId));
    if (!allowed) return res.status(403).json({ message: "forbidden" });
    const contentsResult = await db.query(
      `SELECT type, name, count, description
       FROM material_contents
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [row.id]
    );
    const imagesResult = await db.query(
      `SELECT image_url, alt_text, sort_order
       FROM material_images
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [row.id]
    );
    /*
     * 檔案摘要（檔名／大小／狀態）只給 admin 與擁有者。
     * 對匿名訪客與買家而言，它既不是購買決策資訊，又會洩漏審核中的候選檔存在與否；
     * 買家真正需要的檔名在下載回應裡給。
     */
    const isAdmin = user?.role === "admin";
    const isOwner = user?.role === "teacher" && String(row.teacher_id) === String(user.userId);
    const materialFile = isAdmin || isOwner ? await materialFileService.getMaterialFileSummary(row.id) : undefined;

    return res.json({
      ...applyReviewSnapshotVisibility(row, user),
      ...(materialFile ? { material_file: materialFile } : {}),
      is_purchasable: isPurchasable,
      contents: contentsResult.rows,
      detail_images: imagesResult.rows,
    });
  } catch (err) {
    console.error("get material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

router.post("/", requireAuth, requireRole("teacher"), requireActiveAccount, async (req, res) => {
  try {
    const errMsg = validatePayload(req.body || {}, { isCreate: true });
    if (errMsg) return res.status(400).json({ message: errMsg });
    const { title, description, category, ipDeclarationAccepted } = req.body || {};
    const price = Number(req.body?.price);
    const ageRange = req.body?.ageRange ?? req.body?.age_range;
    const fileId = cleanText(req.body?.fileId ?? req.body?.file_id);
    const teachingObjective = req.body?.teachingObjective ?? req.body?.teaching_objective;
    const teachingMethods = req.body?.teachingMethods ?? req.body?.teaching_methods;
    const usageDuration = req.body?.usageDuration ?? req.body?.usage_duration;
    const activitySteps = req.body?.activitySteps ?? req.body?.activity_steps;
    const extensionValue = req.body?.extensionValue ?? req.body?.extension_value;
    const shortDescription = req.body?.shortDescription ?? req.body?.short_description;
    const coverImageUrl = cleanText(req.body?.coverImageUrl ?? req.body?.cover_image_url);
    const demoVideoUrl = cleanText(req.body?.demoVideoUrl ?? req.body?.demo_video_url);
    const materialFeatures = validateMaterialFeatures(req.body?.material_features ?? req.body?.materialFeatures).normalized || [];
    const contents = normalizeContents(req.body?.contents) || [];
    const detailImages = normalizeDetailImages(req.body?.detailImages ?? req.body?.detail_images) || [];

    if (ipDeclarationAccepted !== true) {
      return res.status(400).json({ message: "ipDeclarationAccepted must be true" });
    }

    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "status")) {
      return res.status(400).json({
        message: "status cannot be set on create; new materials start as pending_review",
      });
    }

    const id = newId();

    /*
     * 建立教材與認領教材檔案是**同一個業務動作**，因此在同一個 transaction 裡。
     * 分開做的話，檔案認領失敗會留下一份沒有教材檔的教材（買家點下載會拿到 409），
     * 而創作者以為自己已經上傳成功了。
     *
     * `file_key` 不再寫入 —— 教材本體的 canonical 來源是 `pending_file_id` /
     * `approved_file_id`。舊欄位保留給既有資料，新教材為 NULL。
     */
    const client = await db.pool.connect();
    let created;
    try {
      await client.query("BEGIN");
      created = await client.query(
        `INSERT INTO materials(
           id, title, description, price, category, age_range, teacher_id, status,
           ip_declaration_accepted, ip_declaration_at,
           teaching_objective, teaching_methods, usage_duration, activity_steps, extension_value, short_description,
           cover_image_url, demo_video_url, material_features
         ) VALUES($1, $2, $3, $4, $5, $6, $7, 'pending_review', $8, NOW(), $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::text[])
         RETURNING *`,
        [
          id,
          cleanText(title),
          cleanText(description),
          price,
          cleanText(category),
          cleanText(ageRange),
          req.user.userId,
          // 上方的 `ipDeclarationAccepted !== true` guard 已擋掉其他值，因此這裡恆為 true。
          // 綁定變數而非寫字面值，是為了讓「這一欄的值來自創作者的請求」在程式碼上看得出來。
          // 這**不是**版本化的同意證據 —— 沒有文件版本與內容雜湊，見 Gate 2 / Gate 5。
          ipDeclarationAccepted,
          cleanText(teachingObjective),
          JSON.stringify(normalizeTeachingMethods(teachingMethods) || []),
          cleanText(usageDuration),
          cleanText(activitySteps),
          cleanText(extensionValue),
          cleanText(shortDescription),
          coverImageUrl,
          demoVideoUrl,
          materialFeatures,
        ]
      );

      const claim = await materialFileService.claimCandidate(client, {
        materialId: id,
        fileId,
        userId: req.user.userId,
      });
      if (!claim.ok) {
        await client.query("ROLLBACK");
        return res
          .status(materialFileService.statusForCode(claim.code))
          .json({ error: claim.code, message: claim.message });
      }

      /*
       * 行銷素材的認領也在**同一個 transaction** 裡。
       *
       * 素材的可見性是由「它屬於哪份教材」決定的，所以「建立教材」與「把素材綁上去」
       * 必須一起成立：只做前者會產生一份已上架、封面卻仍是 owner-only 的教材
       * （公開商品頁破圖）；只做後者會把素材綁到一份不存在的教材上。
       *
       * 外部 CDN 連結會被 `claimForMaterial` 忽略 —— 那是合法用法，不是錯誤。
       */
      const mediaClaim = await materialMediaService.claimForMaterial(client, {
        materialId: id,
        urls: [coverImageUrl, demoVideoUrl, ...detailImages.map((image) => image.image_url)],
        userId: req.user.userId,
        isAdmin: false,
      });
      if (!mediaClaim.ok) {
        await client.query("ROLLBACK");
        return res
          .status(materialMediaService.statusForCode(mediaClaim.code))
          .json({ error: mediaClaim.code, message: mediaClaim.message });
      }

      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* 連線已失效時 ROLLBACK 也會失敗；原始錯誤才是要往上拋的那一個 */
      }
      throw err;
    } finally {
      client.release();
    }

    await replaceMaterialContents(id, contents);
    await replaceMaterialImages(id, detailImages);

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: id,
      action: "material.created",
      meta: { status: "pending_review", fileId },
    });
    // claimCandidate 在 transaction 內改過 pending_file_id，INSERT 的回傳值已經過時。
    const fileSummary = await materialFileService.getMaterialFileSummary(id);
    return res.status(201).json({
      ...created.rows[0],
      pending_file_id: fileSummary?.pendingFile?.id ?? null,
      material_file: fileSummary,
      contents,
      detail_images: detailImages,
    });
  } catch (err) {
    console.error("create material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

async function updateMaterialHandler(req, res) {
  try {
    const id = String(req.params.id);
    const beforeResult = await db.query(`SELECT * FROM materials WHERE id = $1 LIMIT 1`, [id]);
    if (beforeResult.rows.length === 0) return res.status(404).json({ message: "material not found" });
    const before = beforeResult.rows[0];

    const isOwnerTeacher = req.user.role === "teacher" && String(before.teacher_id) === String(req.user.userId);
    const isAdmin = req.user.role === "admin";
    if (!isOwnerTeacher && !isAdmin) return res.status(403).json({ message: "forbidden" });

    const body = req.body || {};
    const errMsg = validatePayload(body, { isCreate: false });
    if (errMsg) return res.status(400).json({ message: errMsg });
    if (!isAdmin && Object.prototype.hasOwnProperty.call(body, "status")) {
      return res.status(403).json({ message: "only admin can change material status" });
    }

    /*
     * **這支端點不再改變 status。**
     *
     * 教材的狀態轉移是有語意的業務動作，各自有不變條件（轉移規則、退回原因、
     * reviewer 快照、published_at、稽核事件、通知信）。允許一支部分更新端點順手改
     * status，等於讓同一個結果有兩條路徑，其中一條什麼副作用都不做 ——
     * 那正是「已上架但沒有審核者、沒有上架時間、創作者沒收到通知」的來源。
     *
     * 正式入口：
     *   POST /admin/materials/:id/approve          pending_review → published
     *   POST /admin/materials/:id/request-changes  pending_review → changes_requested
     *   POST /materials/:id/resubmit               changes_requested|unpublished → pending_review
     *   POST /admin/report-cases/:id/resolve       published → unpublished（檢舉處置）
     */
    if (isAdmin && Object.prototype.hasOwnProperty.call(body, "status")) {
      return res.status(400).json({
        message:
          "material status is managed by the review workflow; use POST /admin/materials/:id/approve, POST /admin/materials/:id/request-changes, POST /materials/:id/resubmit, or the report resolution flow",
        error: "status_not_updatable_here",
      });
    }

    /*
     * **這支端點也不再碰教材本體檔案。**
     *
     * 同樣的理由：換檔有自己的不變條件（只有 changes_requested / unpublished 可以換、
     * 舊候選要退場、已核准檔絕不能被創作者覆寫）。讓一支 COALESCE 式的部分更新端點
     * 順手改檔案指標，等於把「買家拿到什麼」交給一個沒有任何檢查的路徑。
     *
     * 正式入口：POST /teacher/uploads/material-file（上傳）→ POST /materials/:id/file（換檔）。
     * `fileKey` / `file_key` 是 legacy 欄位，一併拒絕：接受它會讓人以為那還有作用。
     */
    const FILE_FIELDS = ["fileId", "file_id", "fileKey", "file_key", "pendingFileId", "pending_file_id", "approvedFileId", "approved_file_id"];
    const touchedFileField = FILE_FIELDS.find((field) =>
      Object.prototype.hasOwnProperty.call(body, field)
    );
    if (touchedFileField) {
      return res.status(400).json({
        error: "file_not_updatable_here",
        message:
          "material file is managed separately; upload via POST /teacher/uploads/material-file then attach with POST /materials/:id/file",
      });
    }

    const nextStatus = before.status;

    /*
     * 行銷素材的認領。**在 UPDATE 之前**做，理由是失敗方向的取捨：
     *
     *   先認領再更新 → 更新失敗時，素材已綁到這份教材但欄位還沒指向它。
     *                  素材仍屬同一位創作者、仍不對外，只是暫時沒被引用 —— 無害。
     *   先更新再認領 → 認領失敗時，教材欄位已經指向一份未認領的素材。
     *                  這份教材一旦上架，公開商品頁就會破圖，而創作者看不出原因。
     *
     * 因此選前者：認領不過就整個 PATCH 400，欄位不會存進一個交付不了的連結。
     *
     * 只有 payload 真的帶了平台素材 URL 時才開 transaction —— 絕大多數 PATCH
     * （改標題、改價格）不該為此多付一次連線。
     */
    const nextCoverImageUrl = cleanText(req.body?.coverImageUrl ?? req.body?.cover_image_url);
    const nextDemoVideoUrl = cleanText(req.body?.demoVideoUrl ?? req.body?.demo_video_url);
    const detailImagesProvided =
      Object.prototype.hasOwnProperty.call(req.body || {}, "detail_images") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "detailImages");
    const nextDetailImages = detailImagesProvided
      ? normalizeDetailImages(req.body?.detail_images ?? req.body?.detailImages) || []
      : [];
    const incomingMediaUrls = [
      nextCoverImageUrl,
      nextDemoVideoUrl,
      ...nextDetailImages.map((image) => image.image_url),
    ];

    if (incomingMediaUrls.some((url) => materialMediaService.parseMediaId(url))) {
      const mediaClient = await db.pool.connect();
      try {
        await mediaClient.query("BEGIN");
        const mediaClaim = await materialMediaService.claimForMaterial(mediaClient, {
          materialId: id,
          urls: incomingMediaUrls,
          userId: req.user.userId,
          isAdmin,
        });
        if (!mediaClaim.ok) {
          await mediaClient.query("ROLLBACK");
          return res
            .status(materialMediaService.statusForCode(mediaClaim.code))
            .json({ error: mediaClaim.code, message: mediaClaim.message });
        }
        await mediaClient.query("COMMIT");
      } catch (err) {
        try {
          await mediaClient.query("ROLLBACK");
        } catch {
          /* 連線已失效時 ROLLBACK 也會失敗；原始錯誤才是要往上拋的那一個 */
        }
        throw err;
      } finally {
        mediaClient.release();
      }
    }

    const updated = await db.query(
      `UPDATE materials
       SET title = COALESCE($2, title),
           description = COALESCE($3, description),
           price = COALESCE($4, price),
           category = COALESCE($5, category),
           age_range = COALESCE($6, age_range),
           status = $7,
           teaching_objective = COALESCE($8, teaching_objective),
           teaching_methods = COALESCE($9::jsonb, teaching_methods),
           usage_duration = COALESCE($10, usage_duration),
           activity_steps = COALESCE($11, activity_steps),
           extension_value = COALESCE($12, extension_value),
           short_description = COALESCE($13, short_description),
           cover_image_url = COALESCE($14, cover_image_url),
           demo_video_url = COALESCE($15, demo_video_url),
           material_features = COALESCE($16::text[], material_features),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        req.body?.title ?? null,
        req.body?.description ?? null,
        req.body?.price ?? null,
        req.body?.category ?? null,
        req.body?.ageRange ?? req.body?.age_range ?? null,
        nextStatus,
        cleanText(req.body?.teachingObjective ?? req.body?.teaching_objective),
        (() => {
          const methods = normalizeTeachingMethods(req.body?.teachingMethods ?? req.body?.teaching_methods);
          return methods ? JSON.stringify(methods) : null;
        })(),
        cleanText(req.body?.usageDuration ?? req.body?.usage_duration),
        cleanText(req.body?.activitySteps ?? req.body?.activity_steps),
        cleanText(req.body?.extensionValue ?? req.body?.extension_value),
        cleanText(req.body?.shortDescription ?? req.body?.short_description),
        nextCoverImageUrl,
        nextDemoVideoUrl,
        (() => {
          const features = validateMaterialFeatures(req.body?.material_features ?? req.body?.materialFeatures).normalized;
          return features ? features : null;
        })(),
      ]
    );
    const row = updated.rows[0];
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contents")) {
      await replaceMaterialContents(id, normalizeContents(req.body?.contents) || []);
    }
    if (detailImagesProvided) {
      await replaceMaterialImages(id, nextDetailImages);
    }

    /*
     * 這裡不再有狀態變更的稽核分支：status 已經無法經由本端點改變（見上方），
     * 因此 `material.published` / `material.unpublished` / `material.changes_requested`
     * / `material.resubmitted` 一律由審核 workflow 寫入
     * （services/materialReview.service.js 與 services/reportAdmin.service.js）。
     */

    const contentsResult = await db.query(
      `SELECT type, name, count, description
       FROM material_contents
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );
    const imagesResult = await db.query(
      `SELECT image_url, alt_text, sort_order
       FROM material_images
       WHERE material_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );
    return res.json({ ...row, contents: contentsResult.rows, detail_images: imagesResult.rows });
  } catch (err) {
    console.error("update material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
}

router.put("/:id", requireAuth, requireActiveAccount, updateMaterialHandler);
router.patch("/:id", requireAuth, requireActiveAccount, updateMaterialHandler);

/**
 * POST /materials/:id/resubmit — 創作者重新送審。
 *
 * 只允許教材**擁有者**，且只允許 `changes_requested | unpublished → pending_review`
 * （轉移規則見 `utils/materialWorkflow.js`）。
 *
 * 為什麼是獨立端點而不是讓 creator 在 `PUT /materials/:id` 帶 status：
 *   1. 創作者能改的狀態只有這一個轉移，開放 `status` 欄位等於開放整個狀態機；
 *   2. 送審是**明確的意圖**。若把它綁進一般儲存，創作者每按一次「儲存變更」
 *      就會偷偷把還沒改完的教材送進審核佇列。
 *
 * 不是自己的教材一律 404（不回 403 —— 那會洩漏「這個 id 存在」）。
 */
/**
 * POST /materials/:id/file — 創作者更換教材本體檔案（候選檔）。
 *
 * 這支端點**只能寫 `pending_file_id`**。創作者在系統中沒有任何路徑可以寫
 * `approved_file_id` —— 那是 Admin 核准流程的專屬動作。因此就算這裡被繞過，
 * 買家拿到的檔案也不會改變。
 *
 * 狀態限制見 `materialWorkflow.canReplaceFile()`：
 *   - `published` 不可換 —— 那等於在買家背後偷換已售出的商品；
 *   - `pending_review` 不可換 —— 會讓 Admin 正在審的東西在腳下改變。
 *
 * 不是自己的教材一律 404。
 */
router.post("/:id/file", requireAuth, requireRole("teacher"), requireActiveAccount, async (req, res) => {
  const materialId = String(req.params.id);
  const fileId = cleanText(req.body?.fileId ?? req.body?.file_id);
  if (!fileId) {
    return res.status(400).json({ error: "invalid_input", message: "fileId is required" });
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const locked = await client.query(
      `SELECT id, teacher_id, status FROM materials WHERE id = $1 FOR UPDATE`,
      [materialId]
    );
    if (locked.rows.length === 0 || String(locked.rows[0].teacher_id) !== String(req.user.userId)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "material not found" });
    }
    const material = locked.rows[0];

    if (!materialWorkflow.canReplaceFile(material.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "file_replacement_not_allowed",
        message:
          material.status === "published"
            // `PRE-14`：原本只寫「請聯絡平台」，沒有任何管道。改指真的到得了的 `/support`。
            ? "已上架的教材無法更換教材檔案。如需更換內容，請透過平台的「聯絡平台」頁面取得協助，或另建新教材。"
            : "審核中的教材無法更換教材檔案，請等待審核結果。",
      });
    }

    const claim = await materialFileService.claimCandidate(client, {
      materialId,
      fileId,
      userId: req.user.userId,
    });
    if (!claim.ok) {
      await client.query("ROLLBACK");
      return res
        .status(materialFileService.statusForCode(claim.code))
        .json({ error: claim.code, message: claim.message });
    }

    await client.query("COMMIT");

    await writeActivityLog({
      actorId: req.user.userId,
      actorRole: req.user.role,
      targetType: "material",
      targetId: materialId,
      action: "material.file_uploaded",
      meta: {
        fileId: claim.file.id,
        originalFilename: claim.file.originalFilename,
        sizeBytes: claim.file.sizeBytes,
        materialStatus: material.status,
        replacement: true,
      },
    });

    return res.json({ material_file: await materialFileService.getMaterialFileSummary(materialId) });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* 連線已失效時 ROLLBACK 也會失敗；原始錯誤才是要往上拋的那一個 */
    }
    console.error("attach material file failed:", err);
    return res.status(500).json({ message: "server error" });
  } finally {
    client.release();
  }
});

router.post("/:id/resubmit", requireAuth, requireRole("teacher"), requireActiveAccount, async (req, res) => {
  try {
    const result = await materialReviewService.resubmitMaterial(String(req.params.id), req.user);
    if (!result.ok) {
      const status = materialReviewService.ERROR_STATUS[result.code] || 400;
      return res.status(status).json({ message: result.message, error: result.code });
    }
    return res.json({ material: result.material });
  } catch (err) {
    console.error("resubmit material failed:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
