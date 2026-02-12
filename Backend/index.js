require("dotenv").config();
const express = require("express");
const app = express();

const authRouter = require("./routes/auth");
const purchaseRouter = require("./routes/purchase");

app.use(express.json());

// ✅ auth 不要套 requireAuth，否則 login/register 會被擋住
app.use("/auth", authRouter);

// ✅ purchase 的保護在 purchase router 內處理（Day5）
app.use("/purchase", purchaseRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
