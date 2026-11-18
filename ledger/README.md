# 記帳

個人收支紀錄。每筆有金額、分類、備註和日期，頁面顯示明細和餘額。

資料存在這個瀏覽器的 localStorage，沒有帳號，也不會上傳。重新整理後還在；換瀏覽器或清掉網站資料就沒了。

## 開啟

在倉庫根目錄執行：

```bash
python3 -m http.server 5179 --directory ledger
```

然後打開 <http://localhost:5179>。

請用本機伺服器開。直接點開 `index.html` 時，瀏覽器常會擋住頁面裡的模組，紀錄也存不住。

計算邏輯的測試：

```bash
node --test ledger/ledger.test.mjs
```
