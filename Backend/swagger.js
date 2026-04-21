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
          role: { type: "string", enum: ["teacher", "parent", "admin"], example: "parent" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:10:00.000Z" },
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
          file_key: { type: "string", example: "materials/math/worksheet-bundle.zip" },
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
        },
      },
      PaymentProof: {
        type: "object",
        properties: {
          id: { type: "integer", example: 10 },
          order_id: { type: "string", example: "ord_lg8b93v1az1" },
          proof_url: { type: "string", format: "uri", example: "https://cdn.example.com/proofs/p1.jpg" },
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
        properties: {
          id: { type: "string", example: "rep_lg8c5d8ke2" },
          material_id: { type: "string", example: "mat_lg8a1f6x9z2" },
          reporter_id: { type: "string", example: "usr_parent_001" },
          reason: { type: "string", example: "Suspected copyright issue." },
          status: { type: "string", enum: ["pending", "reviewed"], example: "pending" },
          created_at: { type: "string", format: "date-time", example: "2026-04-21T12:45:00.000Z" },
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
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          total: { type: "integer", example: 152 },
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
                  role: { type: "string", enum: ["teacher", "parent", "admin"], example: "teacher" },
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
          "匿名僅可見 published；老師可見 published+自己教材；管理員可見全部。Anonymous sees published only, teacher sees own + published, admin sees all.",
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
          "老師建立教材，初始狀態為 pending_review。Teacher creates material with initial status pending_review.",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "price", "fileKey", "ipDeclarationAccepted"],
                properties: {
                  title: { type: "string", example: "Math Worksheet Bundle" },
                  description: { type: "string", example: "Printable activities for grade 2-4." },
                  price: { type: "number", example: 199 },
                  category: { type: "string", example: "math" },
                  ageRange: { type: "string", example: "7-10" },
                  fileKey: { type: "string", example: "materials/math/worksheet-bundle.zip" },
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
          "老師可更新自己教材欄位；僅管理員可改 status。Teacher can edit own material fields; only admin can change status.",
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
                  fileKey: { type: "string", example: "materials/math/new-file.zip" },
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
        description: "僅 parent 可呼叫。Only parent role can create order from current cart.",
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
        description: "上傳手動付款憑證，供管理員審核。Upload payment proof for admin review.",
        security: bearerSecurity,
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", required: ["proofUrl"], properties: { proofUrl: { type: "string", format: "uri", example: "https://cdn.example.com/proofs/p1.jpg" } } } },
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
                    proof: { $ref: "#/components/schemas/PaymentProof" },
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
    "/download/{materialId}": {
      get: {
        tags: ["Download"],
        summary: "取得下載連結 / Get signed download URL",
        description:
          "僅已購買且核准訂單可下載。Available only if caller has approved order for the material.",
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
                    signedUrl: { type: "string", format: "uri", example: "https://download.local/materials/mat_lg8a1f6x9z2?token=mock-123" },
                    expiresInSeconds: { type: "integer", example: 300 },
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
    "/reviews": {
      post: {
        tags: ["Reviews"],
        summary: "新增評價 / Create review",
        description: "僅 parent 可建立評價。Only parent role can create review.",
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
    "/reports": {
      post: {
        tags: ["Reports"],
        summary: "新增檢舉 / Create report",
        description: "僅 parent 可建立檢舉，初始 status=pending。Parent creates report with initial pending status.",
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
    "/admin/materials": {
      get: {
        tags: ["Admin"],
        summary: "管理員教材列表 / Admin material list",
        description: "列出所有教材。List all materials for admin.",
        security: bearerSecurity,
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Material" } } } } } } },
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
        description: "可用 status 篩選。List orders with optional status filter.",
        security: bearerSecurity,
        parameters: [{ in: "query", name: "status", required: false, schema: { type: "string", example: "pending_payment" } }],
        responses: {
          200: { description: "成功 / Success.", content: { "application/json": { schema: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Order" } } } } } } },
          401: { $ref: "#/components/responses/Unauthorized" },
          403: { $ref: "#/components/responses/Forbidden" },
          500: { $ref: "#/components/responses/ServerError" },
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
            "application/json": { schema: { type: "object", required: ["note"], properties: { note: { type: "string", example: "Image is not clear." } } } },
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
                        id: { type: "integer", example: 10 },
                        review_status: { type: "string", example: "rejected" },
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
        summary: "標記檢舉已讀 / Mark report reviewed",
        description: "僅允許 status=reviewed。Only supports changing status to reviewed.",
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
    "/admin/activity-logs": {
      get: {
        tags: ["Admin"],
        summary: "活動紀錄列表 / Activity logs",
        description: "管理員查詢活動紀錄與分頁。Admin list activity logs with filters and pagination.",
        security: bearerSecurity,
        parameters: [
          { in: "query", name: "actor_id", required: false, schema: { type: "string" } },
          { in: "query", name: "actor_role", required: false, schema: { type: "string" } },
          { in: "query", name: "action", required: false, schema: { type: "string" } },
          { in: "query", name: "target_type", required: false, schema: { type: "string" } },
          { in: "query", name: "target_id", required: false, schema: { type: "string" } },
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
