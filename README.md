# BI 規劃師｜刷題系統（bitest）

中華企業資源規劃學會 BI 規劃師參考題型離線／線上練習介面：

- **本機**：`python3 scripts/serve.py` → 終端機顯示之本機網址  
- **Vercel**：將此 Repo 連結並部署；專案根目錄即為靜態網站（`index.html`）。  
  詳見 [Vercel 官方說明](https://vercel.com/docs/getting-started-with-vercel/import)。

靜態檔案根目錄為 `index.html`。Python 僅用於本機重新從 PDF 產生題庫：

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/parse_bp_pdf.py /路徑/題庫.pdf
```

## License

題庫內容請遵守原出處／學會之授權；本程式碼以實際專案需求為準。
