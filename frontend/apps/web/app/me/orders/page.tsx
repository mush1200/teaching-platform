export { default } from "../../orders/page";

/** 與 /orders 同一個 client 頁面：route segment config 需在本檔字面宣告，re-export 不會被 Next 靜態分析讀到。 */
export const dynamic = "force-dynamic";
