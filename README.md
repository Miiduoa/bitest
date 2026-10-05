# bitest｜BI regression checks

一個很小的資料品質檢查器，用在「昨天的報表正常，今天資料管線改了之後還正常嗎？」這種情境。

與其等 dashboard 出現怪數字才人工找問題，bitest 會先比較 baseline 與 current CSV，檢查 schema、筆數、null rate、主鍵重複與數值平均漂移，最後輸出 Markdown report，失敗時回傳非 0 exit code。

## 快速跑

```bash
python -m unittest discover -s tests -v
python cli.py sample/baseline.csv sample/current.csv --key id --numeric revenue
```

產出的 `report.md` 可以直接留在 CI artifact，或貼進 PR / issue。

## 預設檢查

- schema 是否改變
- row count 變動是否超過 25%
- 各欄 null rate 是否增加超過 5 個百分點
- 指定 key 是否出現重複
- 指定 numeric 欄平均值是否漂移超過 20%

這些門檻是示範值，不是通用標準。實際系統應依資料 grain、更新頻率與 KPI 重要程度調整。

## 為什麼值得做

很多資料專案只展示分析結果，但實務上「資料今天還能不能信」同樣重要。這個 repo 比較像一個最小版 data observability / regression gate：規則透明、可放 CI，也不需要先導入一整套資料平台。
