/** Mock data for EduMarket MVP UI — swap with API layer later. */

export type MockMaterial = {
  id: string;
  title: string;
  ageLabel: string;
  category: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviewCount: number;
  coverGradient: string;
  durationHours: number;
  units: number;
  learners: number;
  description: string;
  outline: string[];
  learnPoints: string[];
};

export type MockCartItem = {
  id: string;
  materialId: string;
  title: string;
  ageLabel: string;
  price: number;
  quantity: number;
  coverGradient: string;
};

export type MockReview = {
  id: string;
  materialId: string;
  userName: string;
  /** Visual accent for avatar circle */
  avatarAccent: "violet" | "coral" | "emerald" | "amber";
  rating: number;
  date: string;
  content: string;
  likes: number;
};

export type MockAdminOrder = {
  id: string;
  user: string;
  amount: number;
  status: "pending" | "processing" | "completed" | "cancelled";
  time: string;
};

export type MockAdminStats = {
  revenue: number;
  orders: number;
  materials: number;
  users: number;
  revenueTrend: string;
  ordersTrend: string;
  materialsTrend: string;
  usersTrend: string;
  orderStatusDonut: { label: string; value: number; color: string }[];
};

export const mockMaterials: MockMaterial[] = [
  {
    id: "mat_demo_1",
    title: "小學數學思維訓練",
    ageLabel: "適合 6–12 歲",
    category: "math",
    price: 299,
    originalPrice: 399,
    rating: 4.8,
    reviewCount: 128,
    coverGradient: "from-violet-200 to-indigo-100",
    durationHours: 12,
    units: 24,
    learners: 1234,
    description:
      "透過生活化題目與遊戲化練習，培養孩子的邏輯推理與解題策略。課程由淺入深，搭配可列印學習單，適合親子共學。",
    outline: ["數感與運算", "圖形與空間", "生活應用題", "綜合評量"],
    learnPoints: ["建立數學自信心", "掌握核心概念", "培養自主學習習慣", "銜接校內課程"],
  },
  {
    id: "mat_demo_2",
    title: "雙語閱讀啟蒙課",
    ageLabel: "適合 5–10 歲",
    category: "language",
    price: 349,
    originalPrice: 349,
    rating: 4.6,
    reviewCount: 86,
    coverGradient: "from-rose-100 to-orange-50",
    durationHours: 10,
    units: 18,
    learners: 892,
    description:
      "以繪本與韻文引導中英文聽讀，搭配發音練習音檔，讓孩子在輕鬆氛圍中愛上閱讀。",
    outline: ["字母與拼音", "主題單字", "簡短句型", "親子共讀活動"],
    learnPoints: ["累積核心單字量", "提升口語表達", "建立閱讀節奏", "銜接國小英文"],
  },
  {
    id: "mat_demo_3",
    title: "自然科學實驗盒（線上版）",
    ageLabel: "適合 8–14 歲",
    category: "science",
    price: 420,
    originalPrice: 520,
    rating: 4.9,
    reviewCount: 203,
    coverGradient: "from-emerald-100 to-cyan-50",
    durationHours: 15,
    units: 30,
    learners: 2103,
    description:
      "安全可在家進行的小實驗影片與觀察紀錄表，涵蓋力、熱、光、電基礎觀念。",
    outline: ["觀察與假設", "實驗步驟", "紀錄與討論", "科學閱讀"],
    learnPoints: ["動手做中學", "科學方法啟蒙", "連結生活現象", "培養好奇心"],
  },
  {
    id: "mat_demo_4",
    title: "創意美術：色彩與構圖",
    ageLabel: "適合 6–12 歲",
    category: "art",
    price: 260,
    originalPrice: 320,
    rating: 4.5,
    reviewCount: 54,
    coverGradient: "from-amber-100 to-yellow-50",
    durationHours: 8,
    units: 16,
    learners: 445,
    description:
      "從色彩理論到構圖練習，搭配簡單數位繪圖教學，激發孩子的視覺表達力。",
    outline: ["色彩基礎", "線條與形狀", "構圖練習", "主題創作"],
    learnPoints: ["建立美感語彙", "鼓勵自由創作", "作品展示技巧", "欣賞名家作品"],
  },
];

export const mockCartItems: MockCartItem[] = [
  {
    id: "cart_1",
    materialId: "mat_demo_1",
    title: "小學數學思維訓練",
    ageLabel: "適合 6–12 歲",
    price: 299,
    quantity: 1,
    coverGradient: "from-violet-200 to-indigo-100",
  },
  {
    id: "cart_2",
    materialId: "mat_demo_2",
    title: "雙語閱讀啟蒙課",
    ageLabel: "適合 5–10 歲",
    price: 349,
    quantity: 1,
    coverGradient: "from-rose-100 to-orange-50",
  },
];

export const mockReviews: MockReview[] = [
  {
    id: "rev_1",
    materialId: "mat_demo_1",
    userName: "家長・林",
    avatarAccent: "violet",
    rating: 5,
    date: "2026-04-10",
    content: "題目設計很有趣，孩子每天主動想練習，推薦給同齡家庭！",
    likes: 24,
  },
  {
    id: "rev_2",
    materialId: "mat_demo_1",
    userName: "Chen Mom",
    avatarAccent: "coral",
    rating: 4,
    date: "2026-04-02",
    content: "內容扎實，若能有更多影音講解會更完美。",
    likes: 8,
  },
  {
    id: "rev_3",
    materialId: "mat_demo_1",
    userName: "王爸爸",
    avatarAccent: "emerald",
    rating: 5,
    date: "2026-03-28",
    content: "列印學習單很方便，和學校進度也能互相補強。",
    likes: 15,
  },
];

export const mockAdminStats: MockAdminStats = {
  revenue: 45231,
  orders: 1234,
  materials: 567,
  users: 2345,
  revenueTrend: "+12.5%",
  ordersTrend: "+3.2%",
  materialsTrend: "+8.1%",
  usersTrend: "+5.4%",
  orderStatusDonut: [
    { label: "待處理", value: 18, color: "#FF6B73" },
    { label: "處理中", value: 22, color: "#6C63FF" },
    { label: "已完成", value: 52, color: "#22C55E" },
    { label: "已取消", value: 8, color: "#9CA3AF" },
  ],
};

export const mockAdminRecentOrders: MockAdminOrder[] = [
  { id: "ORD-9281", user: "parent@example.com", amount: 698, status: "pending", time: "2026-04-25 09:12" },
  { id: "ORD-9280", user: "user88@school.tw", amount: 299, status: "completed", time: "2026-04-25 08:40" },
  { id: "ORD-9279", user: "hello@test.com", amount: 1047, status: "processing", time: "2026-04-24 21:03" },
  { id: "ORD-9278", user: "demo@edu.tw", amount: 420, status: "cancelled", time: "2026-04-24 18:55" },
];

export const mockCategoryRow = [
  { id: "all", label: "全部", emoji: "✨" },
  { id: "language", label: "語言學習", emoji: "🗣️" },
  { id: "math", label: "數學", emoji: "🔢" },
  { id: "science", label: "科學", emoji: "🔬" },
  { id: "art", label: "藝術設計", emoji: "🎨" },
  { id: "more", label: "更多", emoji: "⋯" },
];

/** Star distribution for rating summary (mock). */
export const mockStarDistribution = [0.62, 0.22, 0.08, 0.05, 0.03] as const;
