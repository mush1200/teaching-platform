const fs = require("fs");
const path = require("path");
const envPath =
  [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")].find((p) => fs.existsSync(p)) ??
  path.join(__dirname, ".env");
require("dotenv").config({ path: envPath });
const express = require("express");
const app = express();

const authRouter = require("./routes/auth");
const downloadRouter = require("./routes/download");
const materialsRouter = require("./routes/materials");
const cartRouter = require("./routes/cart");
const orderRouter = require("./routes/order");
const reviewRoutes = require("./routes/review.routes");
const meRouter = require("./routes/me");
const reportsRouter = require("./routes/reports");
const adminRouter = require("./routes/admin");
const adminActivityLogsRouter = require("./routes/adminActivityLogs");
const teacherSalesRouter = require("./routes/teacherSales");
const teacherUploadRouter = require("./routes/teacherUpload");
const creatorCasesRouter = require("./routes/creatorCases");
const { ensureCoreTables } = require("./models/bootstrapModel");
const { setupSwagger } = require("./swagger");
app.use(express.json());
setupSwagger(app);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/auth", authRouter);
app.use("/download", downloadRouter);
app.use("/materials", materialsRouter);
app.use("/cart", cartRouter);
app.use("/orders", orderRouter);
app.use("/reviews", reviewRoutes);
app.use("/me", meRouter);
app.use("/reports", reportsRouter);
app.use("/admin", adminRouter);
app.use("/admin", adminActivityLogsRouter);
app.use("/teacher/sales", teacherSalesRouter);
/*
 * Creator 端的平台案件（檢舉）介面。掛在兩個路徑上：`/creator/cases` 是 canonical，
 * `/teacher/cases` 是相容別名 —— 技術角色仍叫 teacher，Web 的 `/teacher/*` 也還在
 * 308 導向 `/creator/*` 的過渡期。兩者是同一個 router，行為不會分歧。
 *
 * 必須掛在 `teacherUploadRouter` 之前：後者用 `app.use("/teacher", ...)` 這種寬前綴，
 * 順序顛倒時 `/teacher/cases` 會先落到它身上。
 */
app.use("/creator/cases", creatorCasesRouter);
app.use("/teacher/cases", creatorCasesRouter);
app.use("/teacher", teacherUploadRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const rawPort = Number.parseInt(String(process.env.PORT ?? "3000"), 10);
const listenPort =
  Number.isFinite(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 3000;
ensureCoreTables()
  .then(() => {
    // Do not pass a callback to app.listen: Express 5 registers that fn with
    // server.once("error", ...), so EADDRINUSE can still invoke the "success" callback
    // and the process exits when the bind actually failed.
    const server = app.listen(listenPort);
    server.once("listening", () => {
      console.log(`Server running on port ${listenPort}`);
    });
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${listenPort} is already in use (PID on Windows: check netstat -ano). Stop that process, or set PORT in .env / environment.`
        );
      } else {
        console.error("HTTP server failed to start:", err.message || err);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error("database bootstrap failed:", err);
    console.error(
      "Exiting with code 1: fix DB/migrations first (see Backend/models/bootstrapModel.js)."
    );
    process.exit(1);
  });
