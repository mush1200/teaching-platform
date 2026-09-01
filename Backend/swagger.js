const swaggerUi = require("swagger-ui-express");

const bearerSecurity = [{ bearerAuth: [] }];

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Teaching Platform Backend API",
    version: "1.0.0",
    description:
      "教學平台後端 API 文件 (Chinese/English). Backend API docs for auth, materials, cart, orders, reviews, reports and admin workflows.",
  },
  servers: [{ url: "/", description: "Current server / 當前伺服器" }],
  tags: [
    { name: "Health", description: "Service health checks / 服務健康檢查" },
    { name: "Auth", description: "Authentication and user identity / 身分驗證與使用者資訊" },
    { name: "Materials", description: "Material browsing and management / 教材瀏覽與管理" },
    { name: "Cart", description: "Shopping cart operations / 購物車操作" },
    { name: "Orders", description: "Order and payment proof flows / 訂單與付款憑證流程" },
    { name: "Download", description: "Download authorization APIs / 下載授權 API" },
    { name: "Reviews", description: "Review APIs / 評價 API" },
    { name: "Reports", description: "Report APIs / 檢舉 API" },
    {
      name: "Creator",
      description:
        "Creator uploads and sales analytics / 創作者媒體上傳與銷售分析（教材圖片／影片上傳後取得 URL，銷售報表）",
    },
    { name: "Admin", description: "Admin-only endpoints / 管理員專用 API" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["message"],
        properties: {
          message: { type: "string", example: "server error" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", example: "usr_lg76h1ab2cd3" },
          email: { type: "string", format: "email", example: "parent@example.com" },
          role: { type: "string", enum: ["teacher", "parent", "buyer", "admin"], example: "parent" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:10:00.000Z" },
        },
      },
      /**
       * 教材本體檔案。storage key / checksum / uploaded_by **永遠不會**出現在 API 回應中。
       */
      MaterialFileInfo: {
        type: "object",
        properties: {
          id: { type: "string", example: "6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071" },
          originalFilename: { type: "string", example: "三年級數學練習.pdf" },
          mimeType: { type: "string", example: "application/pdf" },
          sizeBytes: { type: "integer", example: 2457600 },
          status: {
            type: "string",
            enum: ["unattached", "candidate", "approved", "superseded", "revoked"],
            example: "approved",
          },
          uploadedAt: { type: "string", format: "date-time", nullable: true },
          approvedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      MaterialFileSummary: {
        type: "object",
        description:
          "approvedFile = 買家實際下載到的版本；pendingFile = 待審候選檔，**買家永遠取不到**。",
        properties: {
          approvedFile: {
            allOf: [{ $ref: "#/components/schemas/MaterialFileInfo" }],
            nullable: true,
          },
          pendingFile: {
            allOf: [{ $ref: "#/components/schemas/MaterialFileInfo" }],
            nullable: true,
          },
        },
      },
      Material: {
        type: "object",
        properties: {
          id: { type: "string", example: "mat_lg8a1f6x9z2" },
          title: { type: "string", example: "Math Worksheet Bundle" },
          description: { type: "string", example: "Includes 30 printable worksheets." },
          price: { type: "number", example: 199 },
          category: { type: "string", example: "math" },
          age_range: { type: "string", example: "7-10" },
          teacher_id: { type: "string", example: "usr_teacher_01" },
          status: {
            type: "string",
            enum: ["pending_review", "published", "unpublished"],
            example: "published",
          },
          file_key: {
            type: "string",
            nullable: true,
            deprecated: true,
            description:
              "LEGACY placeholder（不對應任何實際檔案）。教材本體的 canonical 來源是 material_file；" +
              "此欄位**不會出現在公開／買家回應中**，新建教材為 null。",
            example: null,
          },
          material_file: {
            allOf: [{ $ref: "#/components/schemas/MaterialFileSummary" }],
            description:
              "教材本體檔案。**僅 admin 與教材擁有者**取得得到（公開讀取不含此欄位）。",
          },
          teaching_objective: { type: "string", example: "幫助學生認識地點與物品並完成配對" },
          teaching_methods: {
            type: "array",
            items: { type: "string" },
            example: ["配對遊戲", "搶答遊戲"],
          },
          usage_duration: { type: "string", example: "約 2 堂課，每堂 30 分鐘" },
          activity_steps: { type: "string", example: "1. 展示圖卡\n2. 學生配對\n3. 口語表達" },
          extension_value: { type: "string", nullable: true, example: "可作為回家作業延伸" },
          short_description: { type: "string", nullable: true, example: "透過配對遊戲學習地點與物品" },
          material_features: {
            type: "array",
            items: { type: "string" },
            example: ["PDF教材", "教案", "角色扮演", "語言表達", "小組課", "需成人協助"],
          },
          cover_image_url: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/cover.jpg" },
          demo_video_url: { type: "string", format: "uri", nullable: true, example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
          detail_images: {
            type: "array",
            items: {
              type: "object",
              properties: {
                image_url: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/detail-1.jpg" },
                alt_text: { type: "string", nullable: true, example: "教材卡片細節圖" },
                sort_order: { type: "integer", example: 0 },
              },
            },
          },
          contents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", example: "flashcard" },
                name: { type: "string", example: "地點圖卡" },
                count: { type: "integer", nullable: true, example: 4 },
                description: { type: "string", nullable: true, example: "醫院 / 消防局 / 警察局 / 玩具店" },
              },
            },
          },
          ip_declaration_accepted: { type: "boolean", example: true },
          ip_declaration_at: { type: "string", format: "date-time", example: "2026-04-21T12:15:00.000Z" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:15:00.000Z" },
          updated_at: { type: "string", format: "date-time", example: "2026-04-21T12:16:00.000Z" },
        },
      },
      CartItem: {
        type: "object",
        properties: {
          id: { type: "string", example: "42" },
          user_id: { type: "string", example: "usr_parent_001" },
          material_id: { type: "string", example: "mat_lg8a1f6x9z2" },
          quantity: { type: "integer", example: 1 },
          title: { type: "string", example: "Math Worksheet Bundle" },
          price: { type: "number", example: 199 },
          status: { type: "string", example: "published" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:20:00.000Z" },
          updated_at: { type: "string", format: "date-time", example: "2026-04-21T12:20:00.000Z" },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string", example: "ord_lg8b93v1az1" },
          user_id: { type: "string", example: "usr_parent_001" },
          status: { type: "string", example: "pending_payment" },
          payment_mode: { type: "string", nullable: true, example: "manual_transfer" },
          total_amount: { type: "number", example: 398 },
          total_price: { type: "number", example: 398 },
          paid_at: { type: "string", format: "date-time", nullable: true, example: null },
          cancelled_at: { type: "string", format: "date-time", nullable: true, example: null },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:30:00.000Z" },
          updated_at: { type: "string", format: "date-time", example: "2026-04-21T12:30:00.000Z" },
          payment_proof_pending_review_count: {
            type: "integer",
            description:
              "Count of uploaded proofs still pending admin review (review_status=pending). Used by parent UI for order flow.",
            example: 1,
          },
        },
      },
      PaymentProof: {
        type: "object",
        description:
          "付款憑證。**不含 `proof_url` 或 `storage_key`** —— 憑證是敏感交易檔案，" +
          "位元組只能經 `GET /orders/{orderId}/payment-proofs/{proofId}/file`（Admin 或訂單擁有者）取得。",
        properties: {
          id: { type: "string", example: "9fe1273a-8a4b-4db8-b3f7-7bde0612a4a1" },
          order_id: { type: "string", example: "ord_lg8b93v1az1" },
          proof_file_path: {
            type: "string",
            description: "受保護的讀取路徑（相對）。需帶 Authorization。",
            example: "/orders/ord_lg8b93v1az1/payment-proofs/9fe1273a-8a4b-4db8-b3f7-7bde0612a4a1/file",
          },
          proof_file_available: {
            type: "boolean",
            description: "是否有可交付的影像。legacy 未搬移／檔案遺失的憑證為 false。",
            example: true,
          },
          proof_storage_status: {
            type: "string",
            enum: ["private", "legacy_public", "legacy_external", "legacy_missing"],
            example: "private",
          },
          proof_mime_type: { type: "string", example: "image/jpeg" },
          proof_size_bytes: { type: "integer", example: 421233 },
          original_filename: { type: "string", example: "transfer-proof.jpg" },
          review_status: { type: "string", enum: ["pending", "approved", "rejected"], example: "pending" },
          uploaded_at: { type: "string", format: "date-time", example: "2026-04-21T12:35:00.000Z" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:35:00.000Z" },
          note: { type: "string", nullable: true, example: null },
        },
      },
      Review: {
        type: "object",
        properties: {
          id: { type: "string", example: "rev_lg8byx9f1q" },
          parent_id: { type: "string", example: "usr_parent_001" },
          material_id: { type: "string", example: "mat_lg8a1f6x9z2" },
          rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
          comment: { type: "string", nullable: true, example: "Very useful material" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:40:00.000Z" },
        },
      },
      MaterialRatingStats: {
        type: "object",
        properties: {
          materialId: { type: "string", example: "mat_lg8a1f6x9z2" },
          reviewCount: { type: "integer", example: 12 },
          averageRating: { type: "number", example: 4.7 },
          ratingBreakdown: {
            type: "object",
            properties: {
              "1": { type: "integer", example: 0 },
              "2": { type: "integer", example: 0 },
              "3": { type: "integer", example: 1 },
              "4": { type: "integer", example: 2 },
              "5": { type: "integer", example: 9 },
            },
          },
        },
      },
      Report: {
        type: "object",
        description: "檢舉的基本列。狀態機見 Backend/utils/reportWorkflow.js 與 docs/mvp_rules.md §6。",
        properties: {
          id: { type: "string", example: "rep_lg8c5d8ke2" },
          material_id: { type: "string", example: "mat_lg8a1f6x9z2" },
          reporter_id: { type: "string", example: "usr_parent_001" },
          reason: { type: "string", example: "Suspected copyright issue." },
          status: {
            type: "string",
            enum: ["pending", "investigating", "awaiting_creator", "resolved", "dismissed", "reviewed"],
            description: "`reviewed` 為 legacy 終態（舊的「標記已讀」），既有列不回填。",
            example: "pending",
          },
          resolution: {
            type: "string",
            nullable: true,
            enum: ["dismissed", "warning", "request_changes", "unpublish_material", null],
            example: null,
          },
          resolution_note: { type: "string", nullable: true, example: null },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:45:00.000Z" },
          updated_at: { type: "string", format: "date-time", nullable: true },
          reviewed_at: { type: "string", format: "date-time", nullable: true },
          reviewed_by: { type: "string", nullable: true },
        },
      },
      ReportCase: {
        allOf: [
          { $ref: "#/components/schemas/Report" },
          {
            type: "object",
            description: "案件佇列 / 詳情的 enriched 欄位；Backend JOIN，前端不再自行查 users / materials。",
            properties: {
              material_title: { type: "string", nullable: true, example: "注音符號練習本" },
              material_status: { type: "string", nullable: true, example: "published" },
              creator_id: { type: "string", nullable: true },
              creator_email: { type: "string", nullable: true, example: "creator@example.com" },
              reporter_email: { type: "string", nullable: true, example: "buyer@example.com" },
              reviewed_by_email: { type: "string", nullable: true },
              event_count: { type: "integer", example: 3 },
              last_event_at: { type: "string", format: "date-time", nullable: true },
            },
          },
        ],
      },
      ReportEvent: {
        type: "object",
        description:
          "案件歷程 / Admin 與 Creator 的往來。與 activity_logs 分工：後者是全平台稽核軌跡，" +
          "這裡是案件內容（會顯示給創作者看；`admin_note` 除外）。",
        properties: {
          id: { type: "string" },
          report_id: { type: "string" },
          actor_id: { type: "string", nullable: true },
          actor_role: { type: "string", nullable: true, example: "admin" },
          actor_email: { type: "string", nullable: true },
          event_type: {
            type: "string",
            enum: [
              "status_changed",
              "admin_note",
              "creator_response_requested",
              "creator_response",
              "resolution",
            ],
          },
          message: { type: "string", nullable: true },
          meta: { type: "object", additionalProperties: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      ActivityLog: {
        type: "object",
        properties: {
          id: { type: "string", example: "501" },
          actor_id: { type: "string", example: "usr_admin_001" },
          actor_role: { type: "string", example: "admin" },
          action: { type: "string", example: "payment_proof.approved" },
          target_type: { type: "string", example: "order" },
          target_id: { type: "string", example: "ord_lg8b93v1az1" },
          meta: { type: "object", additionalProperties: true, example: { proofId: "10" } },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:55:00.000Z" },
        },
      },
      Pagination: {
        type: "object",
        description:
          "所有 Admin 清單共用同一份分頁契約（Backend/utils/adminQuery.js）：" +
          "page 1 起算、limit 預設 20 上限 100、totalPages 至少為 1。",
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          total: { type: "integer", example: 152 },
          totalPages: { type: "integer", example: 8 },
        },
      },
      TeacherSalesSummary: {
        type: "object",
        properties: {
          totalSoldUnits: { type: "integer", example: 120 },
          totalRevenue: { type: "integer", example: 56000 },
          totalOrders: { type: "integer", example: 98 },
          materialsCount: { type: "integer", example: 12 },
          trend: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string", format: "date", example: "2026-04-25" },
                soldUnits: { type: "integer", example: 8 },
                revenue: { type: "integer", example: 3200 },
              },
            },
          },
        },
      },
      TeacherSalesByMaterial: {
        type: "object",
        properties: {
          materialId: { type: "string", example: "mat_lg8a1f6x9z2" },
          title: { type: "string", example: "Math Worksheet Bundle" },
          soldUnits: { type: "integer", example: 36 },
          revenue: { type: "integer", example: 7164 },
          lastSoldAt: { type: "string", format: "date-time", nullable: true, example: "2026-04-25T09:30:00.000Z" },
        },
      },
      TeacherMaterialMediaUploadResponse: {
        type: "object",
        required: ["url", "mediaId", "kind", "filename"],
        properties: {
          url: {
            type: "string",
            format: "uri",
            description:
              "Absolute delivery URL (uses PUBLIC_BACKEND_URL when set). Pass this value into POST/PATCH materials fields. **Not a static file path** — the endpoint authorizes every request against the owning material's status.",
            example: "http://localhost:3000/materials/media/6f1c2e40-1f4a-4a8e-9b1e-0c6f2a3d4e5b",
          },
          mediaId: {
            type: "string",
            format: "uuid",
            example: "6f1c2e40-1f4a-4a8e-9b1e-0c6f2a3d4e5b",
          },
          kind: { type: "string", enum: ["cover", "detail", "demo"], example: "cover" },
          filename: {
            type: "string",
            description: "Original filename as uploaded. The on-disk object name is never exposed.",
            example: "封面.png",
          },
          mimeType: { type: "string", example: "image/png" },
          sizeBytes: { type: "integer", example: 204800 },
        },
      },
      TeacherSalesRecord: {
        type: "object",
        properties: {
          orderId: { type: "string", example: "ord_lg8b93v1az1" },
          orderItemId: { type: "string", example: "oi_lg8b93x7ha8" },
          materialId: { type: "string", example: "mat_lg8a1f6x9z2" },
          materialTitle: { type: "string", example: "Math Worksheet Bundle" },
          quantity: { type: "integer", example: 2 },
          unitPrice: { type: "integer", example: 199 },
          subtotal: { type: "integer", example: 398 },
          buyerId: { type: "string", example: "usr_parent_001" },
          orderStatus: { type: "string", example: "approved" },
          createdAt: { type: "string", format: "date-time", example: "2026-04-21T12:30:00.000Z" },
          paidAt: { type: "string", format: "date-time", nullable: true, example: "2026-04-21T13:00:00.000Z" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "參數錯誤 / Invalid request.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Unauthorized: {
        description: "未授權 / Missing or invalid token.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Forbidden: {
        description: "無權限 / Insufficient permission.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      NotFound: {
        description: "資源不存在 / Resource not found.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      Conflict: {
        description: "狀態衝突 / Resource state conflict.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
      ServerError: {
        description: "伺服器錯誤 / Internal server error.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "健康檢查 / Health check",
        description: "確認服務是否運行中。Check whether backend is running.",
        responses: {
          200: {
            description: "成功 / Service is healthy.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: { status: { type: "string", example: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "註冊帳號 / Register account",
        description: "建立使用者並回傳 JWT 與使用者資訊。Create account and return JWT with user info.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password", "role"],
                properties: {
                  email: { type: "string", format: "email", example: "teacher@example.com" },
                  password: { type: "string", minLength: 6, example: "P@ssw0rd123" },
                  role: { type: "string", enum: ["teacher", "parent", "buyer", "admin"], example: "teacher" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "註冊成功 / Registered.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string", example: "eyJhbGciOi..." },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "登入 / Login",
        description: "使用 email+password 驗證並取得 JWT。Authenticate with email/password and return JWT.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "parent@example.com" },
                  password: { type: "string", example: "P@ssw0rd123" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "登入成功 / Login success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string", example: "eyJhbGciOi..." },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "取得當前使用者 / Get current user",
        description: "取得 JWT 對應使用者資訊。Get current authenticated user profile.",
        security: bearerSecurity,
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { user: { $ref: "#/components/schemas/User" } } },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials": {
      get: {
        tags: ["Materials"],
        summary: "教材列表 / List materials",
        description:
          "回傳 `{ \"items\": [...] }`，無分頁。JWT 選填（optionalAuth）。匿名僅可見 **published**；老師可見 **published** 與自己的教材；管理員可見全部。" +
          "\n\n**排序（後端固定）：** 先依「品質分」**由高到低**（加權見 `docs/materials-detail-spec.md` §10：`teaching_methods` 陣列長度、`usage_duration` / `activity_steps` / `short_description` 是否非空、`material_contents` 是否存在至少一筆）；同分再依 **`created_at` 新到舊**。" +
          "\n\n**Query：** URL 上任意 query 參數後端**不**解析，**不**影響篩選與 SQL 排序；若產品需在列表搜尋／重排，請在取得 `items` 後於客戶端處理。" +
          "\n\nReturns `{ \"items\": [...] }`, no pagination. JWT optional. Anonymous: **published** only; teacher: own + **published**; admin: all." +
          "\n\n**Server ordering:** quality score **DESC** (see `docs/materials-detail-spec.md` §10), then **`created_at` DESC**." +
          "\n\n**Query params:** **ignored** by the server; filter or sort client-side after fetching `items` if needed.",
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/Material" } },
                  },
                },
              },
            },
          },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
      post: {
        tags: ["Materials"],
        summary: "建立教材(老師) / Create material (teacher)",
        description:
          "創作者建立教材，初始狀態為 pending_review。Creator creates material with initial status pending_review.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: [
                  "title",
                  "price",
                  "fileId",
                  "teaching_objective",
                  "teaching_methods",
                  "usage_duration",
                  "activity_steps",
                  "cover_image_url",
                  "contents",
                  "ipDeclarationAccepted",
                ],
                properties: {
                  title: { type: "string", example: "Math Worksheet Bundle" },
                  description: { type: "string", example: "Printable activities for grade 2-4." },
                  price: { type: "number", example: 199 },
                  category: { type: "string", example: "math" },
                  ageRange: { type: "string", example: "7-10" },
                  age_range: { type: "string", example: "7-10" },
                  fileId: {
                    type: "string",
                    description:
                      "先呼叫 POST /teacher/uploads/material-file 取得。**不是** URL 也不是 storage key。",
                    example: "6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071",
                  },
                  teaching_objective: { type: "string", example: "幫助學生認識地點與物品並完成配對" },
                  teaching_methods: {
                    type: "array",
                    minItems: 1,
                    maxItems: 4,
                    items: { type: "string" },
                    example: ["配對遊戲", "搶答遊戲"],
                  },
                  usage_duration: { type: "string", example: "約 2 堂課，每堂 30 分鐘" },
                  activity_steps: { type: "string", example: "1. 展示圖卡\n2. 學生配對\n3. 口語表達" },
                  extension_value: { type: "string", example: "可作為回家作業延伸" },
                  short_description: { type: "string", example: "透過配對遊戲學習地點與物品" },
                  material_features: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string" },
                    example: ["PDF教材", "教案", "角色扮演", "語言表達", "小組課"],
                  },
                  cover_image_url: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/cover.jpg" },
                  coverImageUrl: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/cover.jpg" },
                  demo_video_url: { type: "string", format: "uri", example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
                  demoVideoUrl: { type: "string", format: "uri", example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
                  detail_images: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["image_url"],
                      properties: {
                        image_url: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/detail-1.jpg" },
                        alt_text: { type: "string", example: "教材細節照片" },
                        sort_order: { type: "integer", example: 0 },
                      },
                    },
                  },
                  contents: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["type", "name"],
                      properties: {
                        type: { type: "string", example: "flashcard" },
                        name: { type: "string", example: "地點圖卡" },
                        count: { type: "integer", minimum: 1, example: 4 },
                        description: { type: "string", example: "醫院 / 消防局 / 警察局 / 玩具店" },
                      },
                    },
                  },
                  ipDeclarationAccepted: { type: "boolean", enum: [true], example: true },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "建立成功 / Created.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Material" } } },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/{id}": {
      get: {
        tags: ["Materials"],
        summary: "教材詳情 / Material detail",
        description: "讀取單一教材。Get one material by id.",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "成功 / Success.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Material" } } },
          },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
      put: {
        tags: ["Materials"],
        summary: "更新教材 / Update material",
        description:
          "創作者可更新自己教材欄位。**status 不能由這支端點改變**（teacher 403 / admin 400 " +
          "`status_not_updatable_here`）—— 教材狀態由審核 workflow 管理：" +
          "POST /admin/materials/:id/approve、/request-changes、POST /materials/:id/resubmit。" +
          "見 docs/material-review-workflow.md。 " +
          "Creator can edit own material fields; status is managed by the review workflow, not here.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", example: "Updated worksheet title" },
                  description: { type: "string", example: "Updated description" },
                  price: { type: "number", example: 249 },
                  category: { type: "string", example: "math" },
                  ageRange: { type: "string", example: "8-11" },
                  teaching_objective: { type: "string", example: "幫助學生認識地點與物品並完成配對" },
                  teaching_methods: {
                    type: "array",
                    minItems: 1,
                    maxItems: 4,
                    items: { type: "string" },
                    example: ["配對遊戲", "搶答遊戲"],
                  },
                  usage_duration: { type: "string", example: "約 2 堂課，每堂 30 分鐘" },
                  activity_steps: { type: "string", example: "1. 展示圖卡\n2. 學生配對\n3. 口語表達" },
                  extension_value: { type: "string", example: "可作為回家作業延伸" },
                  short_description: { type: "string", example: "透過配對遊戲學習地點與物品" },
                  material_features: {
                    type: "array",
                    minItems: 1,
                    items: { type: "string" },
                    example: ["PDF教材", "教案", "角色扮演", "語言表達", "小組課"],
                  },
                  cover_image_url: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/cover.jpg" },
                  coverImageUrl: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/cover.jpg" },
                  demo_video_url: { type: "string", format: "uri", example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
                  demoVideoUrl: { type: "string", format: "uri", example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
                  detail_images: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["image_url"],
                      properties: {
                        image_url: { type: "string", format: "uri", example: "https://cdn.example.com/materials/mat_001/detail-1.jpg" },
                        alt_text: { type: "string", example: "教材細節照片" },
                        sort_order: { type: "integer", example: 0 },
                      },
                    },
                  },
                  contents: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["type", "name"],
                      properties: {
                        type: { type: "string", example: "flashcard" },
                        name: { type: "string", example: "地點圖卡" },
                        count: { type: "integer", minimum: 1, example: 4 },
                        description: { type: "string", example: "醫院 / 消防局 / 警察局 / 玩具店" },
                      },
                    },
                  },
                  status: { type: "string", enum: ["pending_review", "published", "unpublished"], example: "published" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "更新成功 / Updated.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Material" } } },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/{id}/reviews": {
      get: {
        tags: ["Reviews"],
        summary: "教材評價列表 / Material reviews",
        description: "取得教材的所有評價。Get review list for a material.",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Review" } } } } },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/{id}/rating": {
      get: {
        tags: ["Reviews"],
        summary: "教材評分統計 / Material rating stats",
        description: "回傳教材評分統計。Return aggregated rating stats for a material.",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { $ref: "#/components/schemas/MaterialRatingStats" } } } },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/{id}/reports": {
      get: {
        tags: ["Admin"],
        summary: "管理員查教材檢舉 / Admin list reports by material",
        description: "管理員取得教材檢舉，支援 status 篩選。Admin endpoint for material reports with optional status filter.",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "string" } },
          { in: "query", name: "status", required: false, schema: { type: "string", enum: ["pending", "reviewed"] } },
        ],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Report" } } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/cart": {
      get: {
        tags: ["Cart"],
        summary: "我的購物車 / My cart",
        description: "取得當前使用者購物車。Get current user's cart items.",
        security: bearerSecurity,
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/CartItem" } } } },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/cart/items": {
      post: {
        tags: ["Cart"],
        summary: "加入/更新購物車 / Add or upsert cart item",
        description: "若已存在同教材則更新數量，否則新增。Upsert cart item by material.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["materialId"],
                properties: {
                  materialId: { type: "string", example: "mat_lg8a1f6x9z2" },
                  quantity: { type: "integer", minimum: 1, default: 1, example: 2 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "已更新 / Updated existing item.", content: { "application/json": { schema: { $ref: "#/components/schemas/CartItem" } } } },
          201: { description: "已新增 / Created new item.", content: { "application/json": { schema: { $ref: "#/components/schemas/CartItem" } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/cart/items/{id}": {
      delete: {
        tags: ["Cart"],
        summary: "刪除購物車項目 / Remove cart item",
        description: "刪除指定購物車項目。Remove one cart item by id.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "刪除成功 / Removed.",
            content: { "application/json": { schema: { type: "object", properties: { message: { type: "string", example: "removed" } } } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/orders": {
      post: {
        tags: ["Orders"],
        summary: "從購物車建立訂單 / Create order from cart",
        description: "僅 parent/buyer 可呼叫。Only parent/buyer role can create order from current cart.",
        security: bearerSecurity,
        responses: {
          201: {
            description: "建立成功 / Created.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Order created successfully" },
                    data: {
                      type: "object",
                      properties: {
                        order: { $ref: "#/components/schemas/Order" },
                        items: { type: "array", items: { type: "object", additionalProperties: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/orders/my": {
      get: {
        tags: ["Orders"],
        summary: "我的訂單列表 / My orders",
        description: "取得當前使用者所有訂單。Get all orders of current user.",
        security: bearerSecurity,
        responses: {
          200: {
            description: "成功 / Success.",
            content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Order" } } } } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/orders/{id}/upload-proof": {
      post: {
        tags: ["Orders"],
        summary: "上傳付款憑證 / Upload payment proof",
        description:
          "上傳手動付款憑證圖檔，供管理員審核。Upload payment proof images for admin review. " +
          "允許 JPG / PNG / WebP，單檔上限 10 MB，每筆訂單最多 3 張；" +
          "副檔名、宣告 MIME 與 **magic bytes** 三層驗證（改副檔名的假圖片會被 415 擋下）。" +
          "檔案寫入**私有儲存**（`private-storage/payment-proofs/`），回應**不含**任何公開 URL 或 storage key —— " +
          "只給 `proof_file_path`。舊的 `/uploads/payment-proofs/...` 靜態路徑已停止服務（404）。" +
          "canonical 路徑為 `POST /orders/{id}/payment-proof`；`/upload-proof` 為 legacy 別名，行為相同。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["proofs"],
                properties: {
                  proofs: {
                    type: "array",
                    minItems: 1,
                    maxItems: 3,
                    items: { type: "string", format: "binary" },
                    description: "Payment proof images (JPG/PNG/WebP), each <= 10MB, max 3 per order.",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "上傳成功 / Uploaded.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    proofs: { type: "array", items: { $ref: "#/components/schemas/PaymentProof" } },
                    proof: { $ref: "#/components/schemas/PaymentProof" },
                    uploadedCount: { type: "integer", example: 2 },
                    maxAllowed: { type: "integer", example: 3 },
                    orderId: { type: "string", example: "ord_lg8b93v1az1" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/orders/{orderId}/payment-proofs": {
      get: {
        tags: ["Orders"],
        summary: "列出訂單的付款憑證 / List payment proofs of an order",
        description:
          "回傳這筆訂單的憑證 metadata（**不含**位元組、不含 storage key）。" +
          "授權：**Admin 或該訂單的擁有者**。其他任何已登入使用者一律 403，匿名 401。" +
          "訂單狀態與審核結果都不影響可讀性 —— 憑證是使用者自己交易紀錄的一部分。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "orderId", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    orderId: { type: "string", example: "ord_lg8b93v1az1" },
                    items: { type: "array", items: { $ref: "#/components/schemas/PaymentProof" } },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/orders/{orderId}/payment-proofs/{proofId}/file": {
      get: {
        tags: ["Orders"],
        summary: "取得付款憑證影像 / Fetch a payment proof image",
        description:
          "**唯一**取得憑證位元組的方式。授權：Admin 或該訂單的擁有者。" +
          "回應為二進位影像，並帶 `Cache-Control: private, no-store` 與 " +
          "`X-Content-Type-Options: nosniff`；預設 `Content-Disposition: inline`（Admin 審核需要直接看圖）。" +
          "`?download=1` 改為 `attachment`，並寫一筆 `payment_proof_downloaded` 稽核事件 —— " +
          "單純的 inline 預覽**不寫**稽核，否則每次載入圖片都留一筆會把 activity log 淹掉。" +
          "`proofId` 必須真的屬於 `orderId`（否則 404）—— 授權是對訂單做的，這一條擋掉 IDOR。" +
          "legacy 憑證（尚未搬入私有儲存／外部網址／檔案遺失）回 409，**不會**退回公開 URL。",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "orderId", required: true, schema: { type: "string" } },
          { in: "path", name: "proofId", required: true, schema: { type: "string" } },
          {
            in: "query",
            name: "download",
            required: false,
            schema: { type: "string", enum: ["1", "true", "yes"] },
            description: "改用 attachment 下載並寫入稽核。",
          },
        ],
        responses: {
          200: {
            description: "憑證影像 / Proof image bytes.",
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: {
            description: "憑證存在但沒有可交付的影像（legacy 未搬移／檔案遺失）。",
          },
          503: { description: "儲存後端暫時無法取得物件。" },
        },
      },
    },
    "/teacher/uploads/material-file": {
      post: {
        tags: ["Materials"],
        summary: "上傳教材本體檔案 / Upload the material deliverable",
        description:
          "Creator 專屬。multipart field name: `file`。允許 .pdf / .zip / .pptx / .docx / .xlsx，" +
          "上限 100 MB；副檔名、宣告 MIME 與 magic bytes 三層驗證。" +
          "回傳 `fileId`（**不是** URL，也不是 storage key）—— 建立教材或更換檔案時帶上它。" +
          "未被認領的上傳會在 24 小時後由維運腳本清除。",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          201: {
            description: "上傳成功 / Uploaded.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    fileId: { type: "string", example: "6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071" },
                    originalFilename: { type: "string", example: "三年級數學練習.pdf" },
                    mimeType: { type: "string", example: "application/pdf" },
                    sizeBytes: { type: "integer", example: 2457600 },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          413: { description: "檔案超過上限 / File too large (`file_too_large`)." },
          415: {
            description:
              "型別不合格 / Rejected file type (`unsupported_file_type`、`blocked_file_type`、" +
              "`mime_mismatch`、`signature_mismatch`).",
          },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/{id}/file": {
      post: {
        tags: ["Materials"],
        summary: "更換教材本體檔案 / Replace the material deliverable",
        description:
          "Creator 專屬，且只有 `changes_requested` / `unpublished` 可以更換。" +
          "**只會寫入 `pending_file_id`（候選檔）**；成為買家下載到的版本必須經過 Admin 核准。" +
          "`published` 更換等於在買家背後偷換已售出的商品，一律 409。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fileId"],
                properties: { fileId: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "已更新候選檔 / Candidate replaced.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    material_file: { $ref: "#/components/schemas/MaterialFileSummary" },
                  },
                },
              },
            },
          },
          400: { description: "檔案無法使用 / `file_not_available`." },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { description: "此狀態不可更換檔案 / `file_replacement_not_allowed`." },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/materials/{id}/file": {
      get: {
        tags: ["Admin"],
        summary: "下載教材檔案審閱 / Download a material file for review",
        description:
          "Admin 專屬。`slot=pending` 是這次待審的候選檔，`slot=approved` 是買家目前下載到的版本。" +
          "回應為檔案位元組（`Content-Disposition: attachment`），每次呼叫都寫入 " +
          "`admin.material_file_downloaded` 稽核事件。",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "string" } },
          {
            in: "query",
            name: "slot",
            required: false,
            schema: { type: "string", enum: ["pending", "approved"], default: "pending" },
          },
        ],
        responses: {
          200: {
            description: "檔案位元組 / File bytes.",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          400: { description: "slot 非法 / `invalid_slot`." },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { description: "該 slot 沒有檔案 / `material_file_unavailable`." },
          503: { description: "儲存後端取不到實體檔案 / `file_object_missing`." },
        },
      },
    },
    "/download/file/{token}": {
      get: {
        tags: ["Download"],
        summary: "兌換下載票並取得檔案 / Redeem a download token",
        description:
          "**刻意不需要 Authorization header** —— 這支端點是給瀏覽器直接導航用的，而導航帶不了 header。" +
          "授權已在 `GET /download/{materialId}` 完成並固化進票裡：票是隨機值、只能用一次、" +
          "五分鐘過期，且綁定 userId + materialId + fileId。" +
          "此端點**必須直接打 Backend**，不可經過前端 proxy（二進位會被當文字解碼而毀損）。",
        parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "檔案位元組 / File bytes.",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          404: { description: "票無效、已使用或已過期 / `download_token_invalid`." },
          409: { description: "檔案已停止交付 / `material_file_unavailable`." },
          503: { description: "儲存後端取不到實體檔案 / `file_object_missing`." },
        },
      },
    },
    "/download/{materialId}": {
      get: {
        tags: ["Download"],
        summary: "取得下載連結 / Get signed download URL",
        description:
          "僅已購買且核准訂單可下載。**不看教材 status** —— 教材下架不會沒收已付款買家的權利。" +
          "回傳的是一張一次性下載票（`signedUrl`），實際檔案由 `GET /download/file/{token}` 交付。" +
          "Available only if caller has an approved order containing the material.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "materialId", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    materialId: { type: "string", example: "mat_lg8a1f6x9z2" },
                    signedUrl: {
                      type: "string",
                      format: "uri",
                      description:
                        "一次性下載票。直接指向 Backend（不經前端 proxy），只能用一次。",
                      example: "http://localhost:3000/download/file/LbwU1_G2S8nvXXrE9rZ3IJuq7owj7QKzv7ZDTedlEb8",
                    },
                    expiresInSeconds: { type: "integer", example: 300 },
                    filename: { type: "string", example: "三年級數學練習.pdf" },
                    sizeBytes: { type: "integer", example: 2457600 },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { description: "尚未購買或訂單未核准 / `not_entitled`." },
          409: {
            description:
              "已購買，但這份教材目前沒有可下載的檔案（含 milestone 之前的 legacy 教材）/ " +
              "`material_file_unavailable`.",
          },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/reviews": {
      post: {
        tags: ["Reviews"],
        summary: "新增評價 / Create review",
        description: "僅 parent/buyer 可建立評價。Only parent/buyer role can create review.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["rating"],
                properties: {
                  materialId: { type: "string", example: "mat_lg8a1f6x9z2", description: "建議用此欄位 / recommended key." },
                  material_id: { type: "string", example: "mat_lg8a1f6x9z2", description: "向後相容欄位 / backward-compatible key." },
                  rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
                  comment: { type: "string", example: "Very useful material!" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "建立成功 / Created.", content: { "application/json": { schema: { $ref: "#/components/schemas/Review" } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/me/reviews": {
      get: {
        tags: ["Reviews"],
        summary: "我的評價 / My reviews",
        description: "取得當前使用者評價清單。Get review list created by current user.",
        security: bearerSecurity,
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Review" } } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/me/materials": {
      get: {
        tags: ["Materials", "Me"],
        summary: "我的教材庫 / Purchased materials library",
        description:
          "已購買且訂單狀態為 approved 的教材清單（彙整自 order_items）。需 JWT。",
        security: bearerSecurity,
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          materialId: { type: "string" },
                          title: { type: "string" },
                          coverImageUrl: { type: "string", nullable: true },
                          materialUpdatedAt: { type: "string", format: "date-time", nullable: true },
                          purchasedAt: { type: "string", format: "date-time", nullable: true },
                          authorName: { type: "string", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/reports": {
      post: {
        tags: ["Reports"],
        summary: "新增檢舉 / Create report",
        description: "僅 parent/buyer 可建立檢舉，初始 status=pending。Parent/buyer creates report with initial pending status.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reason"],
                properties: {
                  materialId: { type: "string", example: "mat_lg8a1f6x9z2" },
                  material_id: { type: "string", example: "mat_lg8a1f6x9z2" },
                  reason: { type: "string", example: "Suspected inappropriate content." },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "建立成功 / Created.", content: { "application/json": { schema: { $ref: "#/components/schemas/Report" } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/{id}/resubmit": {
      post: {
        tags: ["Materials"],
        summary: "重新送審 / Resubmit material for review",
        description:
          "changes_requested | unpublished → pending_review。僅教材**擁有者**可呼叫；" +
          "非擁有者一律 404（不回 403，以免洩漏 id 是否存在）。同一份教材繼續 lifecycle，" +
          "不建立新教材。寫 material.resubmitted 稽核事件。見 docs/material-review-workflow.md §7。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "已重新送審 / Resubmitted.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { material: { $ref: "#/components/schemas/Material" } },
                },
              },
            },
          },
          403: { description: "非 teacher 角色 / Not a teacher." },
          404: { description: "教材不存在或不屬於此創作者 / Not found." },
          409: { description: "狀態不允許重新送審 / Illegal transition." },
        },
      },
    },
    "/teacher/uploads/material-media": {
      post: {
        tags: ["Creator"],
        summary: "上傳教材媒體檔並取得 URL / Upload material media (returns URL)",
        description:
          "Requires **teacher** JWT. Send `multipart/form-data` with field **`file`** (single file). Query **`kind`**: `cover` or `detail` accepts JPEG/PNG/GIF/WebP (max 10MB); `demo` accepts MP4/WebM (max 80MB). Type is verified three ways — extension, declared MIME, and **magic bytes** — so a renamed file is rejected. Response `{ url, mediaId, kind, filename, … }`: store `url` in `cover_image_url`, `detail_images[].image_url`, or `demo_video_url`; it is claimed by that material on the next POST/PATCH `/materials`. Bytes are stored **privately** and served only through GET `/materials/media/{mediaId}` — the legacy public path `/uploads/material-media/*` now returns **404** (set **PUBLIC_BACKEND_URL** in production so `url` matches your public API host).",
        security: bearerSecurity,
        parameters: [
          {
            in: "query",
            name: "kind",
            required: false,
            schema: { type: "string", enum: ["cover", "detail", "demo"], default: "cover" },
            description:
              "Validation rules and size limit for the uploaded file. An unrecognised value is rejected with 400 (it is not silently coerced to `cover`).",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", description: "One image or video file." },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Stored successfully; returns absolute URL.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/TeacherMaterialMediaUploadResponse" } },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          413: { description: "檔案超過上限 / File exceeds the size limit." },
          415: {
            description:
              "型別不被接受，或副檔名／MIME／magic bytes 不一致 / Unsupported or mismatched media type.",
          },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/materials/media/{mediaId}": {
      get: {
        tags: ["Materials"],
        summary: "取得教材行銷素材 / Get material media bytes",
        description:
          "教材封面／詳情圖／試看影片的位元組。**可見性由所屬教材的 status 決定**，不由檔名決定：\n\n" +
          "| 所屬教材 | 誰能取得 |\n| --- | --- |\n" +
          "| `published` | 任何人，包含未登入（公開商品頁需要） |\n" +
          "| 尚未認領（剛上傳） | 上傳者或 admin |\n" +
          "| `pending_review` / `changes_requested` / `unpublished` | 教材擁有者（teacher）或 admin |\n\n" +
          "下架因此**立即生效**：`status` 一變，同一條 URL 對匿名訪客就變成 401。\n\n" +
          "Bearer token 為選用（`optionalAuth`）—— 公開素材必須讓 `<img src>` 直接取得，而 `<img>` 不會帶 Authorization header。" +
          "回應為 `inline`，支援 `Range`（試看影片拖曳進度條）。公開素材為 `Cache-Control: public, max-age=300`，受保護的素材為 `private, no-store`。",
        parameters: [
          {
            in: "path",
            name: "mediaId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          200: {
            description: "素材位元組 / Media bytes.",
            content: { "image/*": { schema: { type: "string", format: "binary" } } },
          },
          206: { description: "部分內容（Range 請求） / Partial content." },
          401: { description: "素材尚未公開且未提供有效憑證 / Authentication required." },
          403: { description: "已登入但無權存取此素材 / Not permitted." },
          404: { description: "素材不存在 / Media not found." },
          503: { description: "儲存後端暫時無法取得檔案 / Storage backend unavailable." },
        },
      },
    },
    "/teacher/sales/summary": {
      get: {
        tags: ["Creator"],
        summary: "創作者銷售摘要 / Creator sales summary",
        description: "取得創作者教材銷售總覽與每日趨勢。Get creator sales KPI and daily trend.",
        security: bearerSecurity,
        parameters: [
          { in: "query", name: "status", required: false, schema: { type: "string" } },
          { in: "query", name: "from", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "to", required: false, schema: { type: "string", format: "date" } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TeacherSalesSummary" } } },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/teacher/sales/materials": {
      get: {
        tags: ["Creator"],
        summary: "創作者教材銷售彙總 / Sales by material",
        description: "依教材聚合賣出份數與營收，支援分頁與篩選。Aggregated teacher sales per material.",
        security: bearerSecurity,
        parameters: [
          { in: "query", name: "status", required: false, schema: { type: "string" } },
          { in: "query", name: "from", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "to", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "search", required: false, schema: { type: "string" } },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/TeacherSalesByMaterial" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/teacher/sales/records": {
      get: {
        tags: ["Creator"],
        summary: "創作者成交明細 / Sales records",
        description: "取得創作者教材成交紀錄，支援分頁與條件篩選。List creator sales transaction records.",
        security: bearerSecurity,
        parameters: [
          { in: "query", name: "status", required: false, schema: { type: "string" } },
          { in: "query", name: "materialId", required: false, schema: { type: "string" } },
          { in: "query", name: "from", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "to", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/TeacherSalesRecord" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/materials": {
      get: {
        tags: ["Admin"],
        summary: "教材審核佇列 / Admin material review queue",
        description:
          "Server-side 篩選 / 搜尋 / 排序 / 分頁。`statusCounts` 為**全表**計數，不受 status / q / 分頁影響 —— " +
          "需要總數的 caller（例如 Dashboard 教材 KPI）必須讀它，不得抓一頁再自行計數。" +
          "Server-side filtered, searched, sorted and paginated. `statusCounts` is a whole-table count. " +
          "See docs/mvp_rules.md §20.",
        security: bearerSecurity,
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            description:
              "materials.status 的四個值；沒有 draft / rejected。狀態機見 docs/material-review-workflow.md。",
            schema: {
              type: "string",
              enum: ["pending_review", "published", "changes_requested", "unpublished", "all"],
            },
          },
          {
            in: "query",
            name: "q",
            required: false,
            description: "教材標題 / 創作者 email / 教材 id。LIKE 萬用字元會被跳脫。",
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "sort",
            required: false,
            schema: {
              type: "string",
              enum: ["created_desc", "created_asc", "updated_desc", "title_asc", "price_desc"],
              default: "created_desc",
            },
          },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        allOf: [
                          { $ref: "#/components/schemas/Material" },
                          {
                            type: "object",
                            properties: {
                              creator_email: { type: "string", nullable: true, example: "creator@example.com" },
                              open_report_count: {
                                type: "integer",
                                description:
                                  "未結案檢舉數（pending + investigating + awaiting_creator）。" +
                                  "注意這是**未結案**，不是 Admin 待辦 —— 待辦不含 awaiting_creator。",
                                example: 0,
                              },
                            },
                          },
                        ],
                      },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                    statusCounts: {
                      type: "object",
                      description: "全表計數，不受 status / q / 分頁影響。",
                      properties: {
                        total: { type: "integer", example: 128 },
                        pending_review: { type: "integer", example: 12 },
                        published: { type: "integer", example: 110 },
                        unpublished: { type: "integer", example: 6 },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "管理員訂單列表 / Admin order list",
        description:
          "以 **operational state** 篩選（非 orders.status 原始值）。未帶則回全部；非法值回 400。" +
          "可用 `q` 搜尋訂單編號或買家 Email，並支援分頁。" +
          "Filter by derived operational state, not the raw orders.status. See docs/mvp_rules.md §19.",
        security: bearerSecurity,
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            schema: {
              type: "string",
              enum: ["awaiting_payment", "pending_review", "payment_rejected", "approved", "cancelled"],
            },
          },
          {
            in: "query",
            name: "q",
            required: false,
            description:
              "Human-friendly lookup：訂單編號 / 買家 Email。客訴進來時 Admin 手上就是這兩樣東西。",
            schema: { type: "string", example: "buyer@example.com" },
          },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        allOf: [
                          { $ref: "#/components/schemas/Order" },
                          {
                            type: "object",
                            properties: {
                              operational_status: {
                                type: "string",
                                enum: ["awaiting_payment", "pending_review", "payment_rejected", "approved", "cancelled"],
                              },
                              buyer_email: {
                                type: "string",
                                nullable: true,
                                description: "訂單擁有者的 Email；`q` 的搜尋面之一。",
                                example: "buyer@example.com",
                              },
                              payment_proof_pending_review_count: { type: "integer", example: 0 },
                              payment_proof_latest_status: {
                                type: "string",
                                nullable: true,
                                enum: ["pending", "approved", "rejected", null],
                              },
                            },
                          },
                        ],
                      },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/payment-proofs": {
      get: {
        tags: ["Admin"],
        summary: "管理員付款憑證列表 / Admin payment proof list",
        description: "可用 review_status 篩選，並支援分頁。List payment proofs with optional status filter and pagination.",
        security: bearerSecurity,
        parameters: [
          { in: "query", name: "status", required: false, schema: { type: "string", enum: ["pending", "approved", "rejected", "all"] } },
          {
            in: "query",
            name: "q",
            required: false,
            description:
              "Human-friendly lookup：訂單編號 / 買家 email / 憑證 id。Admin 不需要知道 internal id 才找得到案件。",
            schema: { type: "string", example: "buyer@example.com" },
          },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "10" },
                          order_id: { type: "string", example: "ord_lg8b93v1az1" },
                          user_id: { type: "string", example: "usr_parent_001" },
                          order_status: { type: "string", example: "pending_payment" },
                          proof_file_path: {
                            type: "string",
                            description:
                              "憑證影像的受保護讀取路徑。取代了舊契約的 `proof_url`（公開靜態網址，已移除）。",
                            example: "/orders/ord_lg8b93v1az1/payment-proofs/10/file",
                          },
                          proof_file_available: { type: "boolean", example: true },
                          proof_storage_status: {
                            type: "string",
                            enum: ["private", "legacy_public", "legacy_external", "legacy_missing"],
                            example: "private",
                          },
                          proof_mime_type: { type: "string", example: "image/png" },
                          proof_size_bytes: { type: "integer", example: 328899 },
                          original_filename: { type: "string", nullable: true, example: "proof.png" },
                          review_status: { type: "string", enum: ["pending", "approved", "rejected"], example: "pending" },
                          uploaded_at: { type: "string", format: "date-time", example: "2026-04-21T12:35:00.000Z" },
                          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:35:00.000Z" },
                          reviewed_at: { type: "string", format: "date-time", nullable: true, example: null },
                          reviewed_by: { type: "string", nullable: true, example: null },
                          reviewed_by_email: { type: "string", nullable: true, example: null },
                          note: { type: "string", nullable: true, example: null },
                          rejection_reason: {
                            type: "string",
                            nullable: true,
                            enum: ["amount_mismatch", "unreadable", "payment_not_found", "invalid_proof", "other", null],
                            example: null,
                          },
                          buyer_email: { type: "string", nullable: true, example: "buyer@example.com" },
                          order_total_amount: { type: "integer", nullable: true, example: 450 },
                          order_total_price: { type: "integer", nullable: true, example: 450 },
                          order_discount_amount: { type: "integer", nullable: true, example: 0 },
                          order_promo_code: { type: "string", nullable: true, example: null },
                          order_payment_mode: { type: "string", nullable: true, example: "manual_transfer" },
                          order_created_at: { type: "string", format: "date-time", nullable: true },
                          order_paid_at: { type: "string", format: "date-time", nullable: true },
                          order_payment_due_at: {
                            type: "string",
                            format: "date-time",
                            nullable: true,
                            description: "衍生值（orders.created_at + 3 天），不是資料庫欄位。UI 不得自行推算。",
                          },
                          order_proof_count: { type: "integer", nullable: true, example: 2 },
                        },
                      },
                    },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                    statusCounts: {
                      type: "object",
                      description: "全表計數，不受 status / q / 分頁影響。",
                      properties: {
                        total: { type: "integer", example: 37 },
                        pending: { type: "integer", example: 4 },
                        approved: { type: "integer", example: 30 },
                        rejected: { type: "integer", example: 3 },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/materials/{id}/approve": {
      post: {
        tags: ["Admin"],
        summary: "核准教材上架 / Approve material",
        description:
          "pending_review → published。寫入 reviewed_by / reviewed_at，清空退回原因，" +
          "並在**首次**公開時設定 published_at。寫 material.published 稽核事件並寄信給創作者。" +
          "其他來源狀態一律 409。見 docs/material-review-workflow.md §6。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  note: {
                    type: "string",
                    description: "內部備註，只寫進稽核事件，不寄給創作者。",
                    example: "內容與標註相符。",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "已上架 / Published.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    material: { $ref: "#/components/schemas/Material" },
                    firstPublish: { type: "boolean", example: true },
                  },
                },
              },
            },
          },
          404: { description: "教材不存在 / Material not found." },
          409: { description: "狀態不允許此轉移 / Illegal transition." },
        },
      },
    },
    "/admin/materials/{id}/request-changes": {
      post: {
        tags: ["Admin"],
        summary: "退回教材修改 / Request material changes",
        description:
          "pending_review → changes_requested。reasonCode 與 note 皆為必填，note trim 後至少 10 字。" +
          "寫入 review snapshot、寫 material.changes_requested 稽核事件並寄信給創作者。" +
          "見 docs/material-review-workflow.md §5。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["reasonCode", "note"],
                properties: {
                  reasonCode: {
                    type: "string",
                    enum: [
                      "incomplete_info",
                      "media_quality",
                      "features_mismatch",
                      "file_problem",
                      "ip_concern",
                      "other",
                    ],
                  },
                  note: {
                    type: "string",
                    description: "補充說明，trim 後至少 10 字（code point）。",
                    example: "活動步驟只寫了一句，請補充完整流程與所需時間。",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "已退回 / Returned for changes.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { material: { $ref: "#/components/schemas/Material" } },
                },
              },
            },
          },
          400: { description: "reasonCode 非法或 note 太短 / Invalid input." },
          404: { description: "教材不存在 / Material not found." },
          409: { description: "狀態不允許此轉移 / Illegal transition." },
        },
      },
    },
    "/admin/payment-proofs/{id}/approve": {
      post: {
        tags: ["Admin"],
        summary: "核准付款憑證 / Approve payment proof",
        description: "核准後訂單會改為 approved。Approves a proof and updates order status to approved.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { note: { type: "string", example: "Payment verified." } } } } },
        },
        responses: {
          200: {
            description: "核准成功 / Approved.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    proofId: { type: "string", example: "10" },
                    order: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "ord_lg8b93v1az1" },
                        status: { type: "string", example: "approved" },
                        paid_at: { type: "string", format: "date-time", example: "2026-04-21T13:00:00.000Z" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/payment-proofs/{id}/reject": {
      post: {
        tags: ["Admin"],
        summary: "拒絕付款憑證 / Reject payment proof",
        description: "拒絕指定付款憑證。Reject one pending payment proof.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["rejection_reason"],
                properties: {
                  rejection_reason: {
                    type: "string",
                    enum: ["amount_mismatch", "unreadable", "payment_not_found", "invalid_proof", "other"],
                    description: "必填。買家會在訂單詳情看到對應文案。",
                    example: "unreadable",
                  },
                  note: {
                    type: "string",
                    description: "補充說明。rejection_reason = other 時**必填**。",
                    example: "Image is not clear.",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "拒絕成功 / Rejected.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    proof: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "9fe1273a-8a4b-4db8-b3f7-7bde0612a4a1" },
                        review_status: { type: "string", example: "rejected" },
                        rejection_reason: { type: "string", example: "unreadable" },
                        note: { type: "string", example: "Image is not clear." },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/reports": {
      get: {
        tags: ["Admin"],
        summary: "管理員檢舉列表 / Admin reports",
        description: "管理員查詢全部檢舉，可加 status 篩選。Admin list all reports with optional status filter.",
        security: bearerSecurity,
        parameters: [{ in: "query", name: "status", required: false, schema: { type: "string", enum: ["pending", "reviewed"] } }],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Report" } } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/materials/{materialId}/reports": {
      get: {
        tags: ["Admin"],
        summary: "管理員查教材檢舉 / Admin reports by material",
        description: "依教材查檢舉清單。List reports by material id.",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "materialId", required: true, schema: { type: "string" } },
          { in: "query", name: "status", required: false, schema: { type: "string", enum: ["pending", "reviewed"] } },
        ],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Report" } } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/reports/{id}": {
      patch: {
        tags: ["Admin"],
        deprecated: true,
        summary: "【已淘汰】標記檢舉已讀 / Mark report reviewed (deprecated)",
        description:
          "**@deprecated — 不屬於正式流程。** 僅允許 `status=reviewed`（`pending → reviewed`）。" +
          "它寫入的 `reviewed` 是 legacy 終態：沒有 resolution、沒有處置說明、沒有案件歷程，" +
          "且**不是**正式狀態機的合法轉移目標。正式流程請用 " +
          "`POST /admin/report-cases/{id}/investigate` → `/request-response` → `/resolve`。" +
          "回應帶 `Deprecation: true` 與 `Link: </admin/report-cases>; rel=\"successor-version\"`。" +
          "正式 Admin UI 已無任何入口呼叫它；既有 `reviewed` 資料保留不回填。" +
          "見 docs/mvp_rules.md §6 與 docs/admin-information-architecture.md §9。 " +
          "Deprecated legacy acknowledgement path kept only for backward compatibility.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["reviewed"], example: "reviewed" } } } },
          },
        },
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { $ref: "#/components/schemas/Report" } } } },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/payment-proofs/{id}": {
      get: {
        tags: ["Admin"],
        summary: "付款憑證審核 context / Payment proof decision context",
        description:
          "單筆審核所需的完整資訊：憑證 + 訂單 + 買家 + 訂單明細 + **同一張訂單的其他憑證**。" +
          "最後一項是必要的：買家在被退回後會重新上傳，Admin 必須看得到上一次的退回理由。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    proof: { type: "object", description: "同 /admin/payment-proofs 的單列。" },
                    orderItems: { type: "array", items: { type: "object" } },
                    otherProofs: {
                      type: "array",
                      description: "同一張訂單的其他憑證（含其 rejection_reason / note）。",
                      items: { type: "object" },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/report-cases": {
      get: {
        tags: ["Admin"],
        summary: "檢舉案件佇列 / Report case queue",
        description:
          "取代舊的 `GET /admin/reports`（後者保留為 legacy 裸陣列）。支援五狀態 workflow、搜尋與分頁。" +
          "See docs/mvp_rules.md §6.",
        security: bearerSecurity,
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            description:
              '"open"（**未結案** = pending + investigating + awaiting_creator）、"all"，或以逗號分隔的狀態子集合。' +
              "Admin 的**待辦**是 `pending,investigating`（reportWorkflow.ADMIN_ACTIONABLE_REPORT_STATUSES）—— " +
              "`awaiting_creator` 未結案但球在創作者手上，不算待辦；Dashboard 待辦卡即以此查詢。" +
              "見 docs/admin-information-architecture.md §4.1。",
            schema: { type: "string", example: "open" },
          },
          { in: "query", name: "q", required: false, schema: { type: "string" } },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/ReportCase" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                    statusCounts: { type: "object", additionalProperties: { type: "integer" } },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/report-cases/{id}": {
      get: {
        tags: ["Admin"],
        summary: "檢舉案件詳情 / Report case detail",
        description: "含完整處理歷程（Admin 內部筆記也在內）。`allowedTransitions` 決定 UI 該顯示哪些動作。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    report: { $ref: "#/components/schemas/ReportCase" },
                    events: { type: "array", items: { $ref: "#/components/schemas/ReportEvent" } },
                    availableResolutions: { type: "array", items: { type: "string" } },
                    allowedTransitions: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/report-cases/{id}/investigate": {
      post: {
        tags: ["Admin"],
        summary: "接手檢舉案件 / Start investigation",
        description: "pending → investigating。非法轉移回 409。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { note: { type: "string" } } } } },
        },
        responses: {
          200: { description: "成功 / Success." },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/report-cases/{id}/request-response": {
      post: {
        tags: ["Admin"],
        summary: "要求創作者補充說明 / Request creator response",
        description: "pending | investigating → awaiting_creator。創作者會在 /creator/cases 看到這則訊息。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["message"], properties: { message: { type: "string" } } },
            },
          },
        },
        responses: {
          200: { description: "成功 / Success." },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/report-cases/{id}/notes": {
      post: {
        tags: ["Admin"],
        summary: "新增內部調查筆記 / Add admin note",
        description: "不改變案件狀態；**創作者看不到**這則筆記。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["message"], properties: { message: { type: "string" } } },
            },
          },
        },
        responses: {
          200: { description: "成功 / Success." },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/report-cases/{id}/resolve": {
      post: {
        tags: ["Admin"],
        summary: "檢舉案件處置 / Resolve report case",
        description:
          "dismissed → 狀態 dismissed；其餘 → resolved。`unpublish_material` 會實際把教材下架" +
          "（僅當目前為 published），並寫入 material.unpublished audit log。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["resolution"],
                properties: {
                  resolution: {
                    type: "string",
                    enum: ["dismissed", "warning", "request_changes", "unpublish_material"],
                  },
                  note: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "成功 / Success." },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/creator/cases": {
      get: {
        tags: ["Creator"],
        summary: "創作者平台案件清單 / Creator moderation cases",
        description:
          "只回**自己教材**上的案件（授權寫在 SQL 的 materials.teacher_id）。不回傳檢舉人身分。" +
          "亦掛在 /teacher/cases（相容別名）。",
        security: bearerSecurity,
        parameters: [
          {
            in: "query",
            name: "scope",
            required: false,
            schema: { type: "string", enum: ["action_required", "open", "all"], default: "all" },
          },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { type: "object" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                    actionRequiredCount: {
                      type: "integer",
                      description: "待回覆案件的**全表**數量；側欄徽章讀這個，不要用 items.length。",
                      example: 1,
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/creator/cases/{id}": {
      get: {
        tags: ["Creator"],
        summary: "創作者案件詳情 / Creator case detail",
        description: "`events` 已濾除 Admin 內部筆記。不屬於自己的案件一律 404（不是 403）。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    case: { type: "object" },
                    events: { type: "array", items: { $ref: "#/components/schemas/ReportEvent" } },
                    canRespond: { type: "boolean" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/creator/cases/{id}/respond": {
      post: {
        tags: ["Creator"],
        summary: "創作者提交說明 / Submit creator response",
        description: "awaiting_creator → investigating（球回到 Admin 手上）。狀態不符回 409。目前僅支援文字。",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["message"], properties: { message: { type: "string" } } },
            },
          },
        },
        responses: {
          200: { description: "成功 / Success." },
          400: { $ref: "#/components/responses/BadRequest" },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          409: { $ref: "#/components/responses/Conflict" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/activity-logs/filters": {
      get: {
        tags: ["Admin"],
        summary: "活動紀錄篩選選項 / Activity log filter options",
        description:
          "回傳 activity_logs 中**實際出現過**的 action 與 actor_role（含筆數）。" +
          "硬編下拉清單會在新增 action 之後靜靜地漏掉它。",
        security: bearerSecurity,
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    actions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { action: { type: "string" }, count: { type: "integer" } },
                      },
                    },
                    actorRoles: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: { actor_role: { type: "string" }, count: { type: "integer" } },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/activity-logs": {
      get: {
        tags: ["Admin"],
        summary: "活動紀錄列表 / Activity logs",
        description:
          "既有的精確比對參數全部保留；另加人類可讀搜尋 `q` 與日期區間 `from`/`to`。" +
          "每列補上 `actor_email` 與 `target_label`，`meta` 與所有 technical id 原封不動回傳。" +
          "See docs/mvp_rules.md §22.",
        security: bearerSecurity,
        parameters: [
          { in: "query", name: "actor_id", required: false, schema: { type: "string" } },
          { in: "query", name: "actor_role", required: false, schema: { type: "string" } },
          { in: "query", name: "action", required: false, schema: { type: "string" } },
          { in: "query", name: "target_type", required: false, schema: { type: "string" } },
          { in: "query", name: "target_id", required: false, schema: { type: "string" } },
          {
            in: "query",
            name: "q",
            required: false,
            description: "操作者 email / 教材標題 / 對象 email / 訂單編號 / action。",
            schema: { type: "string" },
          },
          {
            in: "query",
            name: "from",
            required: false,
            description: "YYYY-MM-DD，含當日。格式不符一律視為未提供（不回 400）。",
            schema: { type: "string", format: "date" },
          },
          {
            in: "query",
            name: "to",
            required: false,
            description: "YYYY-MM-DD，含當日。",
            schema: { type: "string", format: "date" },
          },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/activity-logs/{id}": {
      get: {
        tags: ["Admin"],
        summary: "活動紀錄詳情 / Activity log detail",
        description: "依 id 取得單筆活動紀錄。Get one activity log by id.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { $ref: "#/components/schemas/ActivityLog" } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          404: { $ref: "#/components/responses/NotFound" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/users/{userId}/activity-logs": {
      get: {
        tags: ["Admin"],
        summary: "使用者活動紀錄 / User activity logs",
        description: "查詢指定 userId 的活動紀錄。List activity logs by actor user id.",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "userId", required: true, schema: { type: "string" } },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/materials/{materialId}/activity-logs": {
      get: {
        tags: ["Admin"],
        summary: "教材活動紀錄 / Material activity logs",
        description: "查詢指定教材活動紀錄。List activity logs by material target.",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "materialId", required: true, schema: { type: "string" } },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/admin/orders/{orderId}/activity-logs": {
      get: {
        tags: ["Admin"],
        summary: "訂單活動紀錄 / Order activity logs",
        description: "查詢指定訂單活動紀錄。List activity logs by order target.",
        security: bearerSecurity,
        parameters: [
          { in: "path", name: "orderId", required: true, schema: { type: "string" } },
          { in: "query", name: "page", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
          { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          200: {
            description: "成功 / Success.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: { type: "array", items: { $ref: "#/components/schemas/ActivityLog" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
  },
};

function setupSwagger(app) {
  app.use("/api-doc", swaggerUi.serve, swaggerUi.setup(openApiSpec, { explorer: true }));
  app.get("/api-doc.json", (req, res) => {
    res.json(openApiSpec);
  });
}

module.exports = { setupSwagger, openApiSpec };
