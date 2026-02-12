const bcrypt = require("bcryptjs");
const { signToken } = require("../utils/jwt");

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1) 找 user
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    // 2) 比對密碼
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // 3) 簽 token（只放必要資訊）
    const token = signToken({ userId: user._id.toString(), role: user.role });

    // 4) 回傳
    res.json({
      token,
      user: { id: user._id, email: user.email, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
