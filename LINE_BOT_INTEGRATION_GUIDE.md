# 網頁端與 LINE Bot 系統串接實作指南與注意事項

這份指南總結了在「影像製作所平台專案」中，將網頁端與 LINE Bot 成功串接的實戰經驗與地雷。未來如果有新的專案需要將網頁服務與 LINE 系統結合，這份文件將提供清晰的架構指引。

---

## 1. LINE Developers 後台申請與設定重點

要讓伺服器能跟 LINE 溝通，必須在 LINE Developers Console 完成以下核心設定：

- **Provider 與 Channel**：
  - 建立一個 Provider（組織名稱），然後在底下建立一個 **Messaging API Channel**。
- **Webhook URL**：
  - 填寫你的後端 API 網址（例如：`https://你的網域/api/integrations/line/webhook/`）。
  - **🚨 關鍵注意**：LINE 規定 Webhook 網址**必須是 HTTPS**。在本地端開發時，必須使用 `ngrok` 或 `localtunnel` 將 `localhost` 轉換為 HTTPS 網址才能順利測試。
  - 記得開啟 **"Use webhook"** 的開關，並點擊 Verify 確保 LINE 能成功呼叫到你的伺服器。
- **自動回覆設定 (Auto-reply messages)**：
  - 務必到 LINE Official Account Manager 的設定中，將 **「自動回覆訊息」關閉**，否則使用者打字時，系統會同時觸發你的程式碼與 LINE 內建的罐頭回覆。
- **環境變數 (Environment Variables)**：
  - 取得 `Channel Secret` 與 `Channel Access Token (Long-lived)`，並將它們存入後端的 `.env` 環境變數中，**絕對不要把這些金鑰推送到 GitHub 上**。

---

## 2. 後端 Webhook 實作與安全機制

Webhook 是 LINE 傳遞使用者訊息給你的「唯一入口」，這裡的實作必須非常嚴謹：

### A. 簽章驗證 (Signature Validation)
- LINE 在每次呼叫你的 Webhook 時，都會在 HTTP Header 附上 `X-Line-Signature`。
- 你**必須**使用 `Channel Secret` 來驗證這個簽章是否合法，以防止惡意人士偽造 LINE 的請求攻擊你的伺服器。

### B. 關閉 CSRF 防護
- 在 Django 或其他框架中，POST 請求通常會被 CSRF（跨站請求偽造）中介軟體擋下。
- 必須針對 LINE Webhook 的 View 加上 `@csrf_exempt`（Django）或相應的豁免設定，因為 LINE 的請求不會帶有我們網站的 CSRF Token。

### C. 錯誤處理與回應速度
- Webhook 收到請求後，必須在 **1~2 秒內回傳 `HTTP 200 OK`**，否則 LINE 會判定超時並重試，導致你的機器人「重複回覆相同的訊息」。
- 即使處理邏輯發生錯誤（Try-Catch），最後還是要回傳 `200 OK` 結束 HTTP 請求，把錯誤寫入後端 Log 即可。

---

## 3. 核心功能實作技巧

### A. 狀態機 (State Machine) 管理連貫對話
LINE Bot 的對話是無狀態的（Stateless），如果你希望機器人能做到「詢問電影名稱 -> 詢問評分 -> 詢問心得」的連貫式對話，就必須在資料庫建立一個 `LineBotState` 資料表。
- **欄位建議**：`line_user_id` (PK), `state` (目前狀態, 字串), `data` (暫存資料, JSON)。
- 每次收到訊息時，先檢查該使用者的 `state`，根據狀態決定要執行哪段程式碼。
- **防呆機制**：必須設定「強制退出/取消」的保留關鍵字（例如：輸入「取消」或「/規則」時，強制清空該使用者的狀態）。

### B. LINE 帳號與網頁帳號的綁定 (Account Linking)
為了讓使用者在 LINE 發布的心得能同步到網頁版的個人主頁，我們實作了綁定機制：
1. **生成綁定碼**：網頁端生成一組時效性的亂碼（如：6 位數字），存入資料庫，並對應到該使用者的網頁帳號（`campus_id`）。
2. **LINE 端驗證**：使用者在 LINE 輸入 `#綁定 123456`，Webhook 接收後比對資料庫，若吻合，就將該使用者的 `line_user_id` 寫入網頁帳號的欄位中。
3. 未來該 `line_user_id` 發送的任何心得，都可以直接關聯到他原本的 `User` 實體。

### C. 活用 Flex Message (彈性訊息)
純文字太過單調，對於「經驗值提升」、「影迷名片」或是「圖文選單」，強烈建議使用 **Flex Message**。
- 你可以利用 LINE 官方的 [Flex Message Simulator](https://developers.line.biz/flex-simulator/) 透過視覺化拖曳設計版面，然後匯出 JSON 直接貼入程式碼中（本次專案的經驗值通知卡片即是使用此技巧）。

---

## 4. 常見坑洞與除錯指南

- **中文字元編碼問題**：在處理 Hashtag 或是正則表達式時，容易遇到全形與半形字元的混淆（例如：使用者輸入全形的 `＃標籤`）。程式碼中要統一做 Replace 或正規化處理。
- **字串切割問題**：避免使用者輸入 `#標籤A#標籤B` 而產生「連體嬰標籤」。在字串處理時，除了特定的分隔符號（如逗號、分號），最好一律將 `#` 視為切割點（使用 Regex 解析）。
- **快取未更新 (Cache Invalidation)**：若網頁前端有做 API 快取（如本次專案的首頁熱門心得），當使用者從 LINE Bot 發文或按讚時，Webhook 必須一併呼叫 `cache.delete('快取鍵值')`，確保網頁版能即時顯示最新資料。
