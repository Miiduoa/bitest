# BI 規劃師｜刷題系統（bitest）

中華企業資源規劃學會 BI 規劃師參考題型離線／線上練習介面。

## 前端靜態檔（`web/`）

- **本機預覽**：於專案根目錄執行 `python3 scripts/serve.py`，再以終端機顯示之本機網址開啟（靜態根目錄為 `web/`）。
- **Vercel**：倉庫根目錄有 `npm run build`（將 `web/` 複製至 `dist/`），專案請用 **Framework: Other**／依 `vercel.json` 建置即可。正式域範例：**[bitest.vercel.app](https://bitest.vercel.app)**。亦可自 [GitHub](https://github.com/Miiduoa/bitest) 匯入。說明：[Vercel Import](https://vercel.com/docs/getting-started-with-vercel/import)。

若曾將專案誤設為 Python Preset，請改為 **Other** 並以本倉庫根目錄建置（不必再手動設 Root Directory 為 `web`）。

## 題庫

題庫檔為 `web/questions.json`，可由 PDF 重新產製：

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/parse_bp_pdf.py /路徑/題庫.pdf
```

## License

題庫內容請遵守原出處／學會之授權；程式碼以實際專案需求為準。
