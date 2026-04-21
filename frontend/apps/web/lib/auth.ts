export type UserRole = "parent" | "teacher" | "admin";

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    created_at: string;
  };
};

export function mapStatusMessage(status: number): string {
  switch (status) {
    case 400:
      return "請確認輸入資料格式。";
    case 401:
      return "帳號或密碼錯誤，請重新登入。";
    case 403:
      return "你沒有此操作權限。";
    case 404:
      return "找不到服務或資料。";
    case 500:
      return "系統忙碌中，請稍後再試。";
    default:
      return "登入失敗，請稍後再試。";
  }
}

