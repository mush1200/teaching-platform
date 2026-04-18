require("dotenv").config();
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
const { ensureCoreTables } = require("./models/bootstrapModel");
app.use(express.json());

app.use("/auth", authRouter);
app.use("/download", downloadRouter);
app.use("/materials", materialsRouter);
app.use("/cart", cartRouter);
app.use("/orders", orderRouter);
app.use("/reviews", reviewRoutes);
app.use("/me", meRouter);
app.use("/reports", reportsRouter);
app.use("/admin", adminRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = 3000;
ensureCoreTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("database bootstrap failed:", err);
    process.exit(1);
  });
