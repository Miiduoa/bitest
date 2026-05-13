# BI 規劃師｜刷題系統（bitest）

中華企業資源規劃學會 BI 規劃師參考題型離線／線上練習介面。

## 前端靜態檔（`web/`）

- **本機預覽**：於專案根目錄執行 `python3 scripts/serve.py`，再以終端機顯示之本機網址開啟（靜態根目錄為 `web/`）。
- **Vercel（與 GitHub 連線的 `bitest` 專案）**：請到 Vercel 專案 **Settings → General**：
  - **Framework Preset** → **Other**
  - **Root Directory** → **`web`**（必須，否則會誤判成 Python）
  - 若曾失敗過，請在 **Deployments** 重新 **Redeploy**。
- **已成功之靜態預覽網址**（由 `web/` 目錄直接部署）：<https://web-one-omega-91.vercel.app>  
  你可於 Vercel 將網域改掛到自己偏好的 Production 別名／專案。

倉庫：<https://github.com/Miiduoa/bitest>。匯入步驟可參考 [Vercel Import 文件](https://vercel.com/docs/getting-started-with-vercel/import)。

## 題庫

題庫檔為 `web/questions.json`，可由 PDF 重新產製：

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/parse_bp_pdf.py /路徑/題庫.pdf
```

## License

題庫內容請遵守原出處／學會之授權；程式碼以實際專案需求為準。
