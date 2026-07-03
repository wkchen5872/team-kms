## ADDED Requirements

### Requirement: 副檔名錨定的引用檔名解析

解析 wiki footnote 引用(`[^N]: …`)時,系統 SHALL 以副檔名為錨定點抽取檔名:在 footnote 值中找出以已知副檔名(pdf/doc(x)/ppt(x)/xls(x)/csv/htm(l)/md/txt)結尾的檔名 token。系統 SHALL NOT 因檔名內含「空白-連字號-空白」(` - `)而截斷檔名。位於檔名 token 之後、下一個 token 之前的純文字(人工註解)SHALL 被忽略。若 footnote 值不含任何可辨識副檔名,系統 SHALL 退回以整段修剪後字串作為單一檔名(維持既有 title/base 名比對)。

#### Scenario: 含 ` - ` 的結構性檔名不被截斷

- **WHEN** footnote 為 `[^1]: 2025 - 台糖 - 台中市北屯區陳平段.md`
- **THEN** 解析出的檔名為 `2025 - 台糖 - 台中市北屯區陳平段.md`(完整,不截斷成 `2025`)

#### Scenario: 忽略檔名後的註解文字

- **WHEN** footnote 為 `[^1]: report.pdf — 詳見附錄`
- **THEN** 解析出的檔名為 `report.pdf`,頁碼為空,尾隨註解被忽略

#### Scenario: 保留無空白連字號的版本後綴

- **WHEN** footnote 為 `[^1]: 2501.12948v2-2.pdf, p.5`
- **THEN** 解析出的檔名為 `2501.12948v2-2.pdf`,頁碼為 5

#### Scenario: 無副檔名時退回整串比對

- **WHEN** footnote 值不含任何已知副檔名
- **THEN** 以整段修剪後字串作為單一檔名進行比對

### Requirement: 單一 footnote 支援多來源引用

當一個 footnote 值包含多個副檔名 token(以 `；`、`;`、`、`、`,` 或空白分隔)時,系統 SHALL 將每個 token 解析為獨立的一筆引用,並各自抓取其後緊接的 `, p.N` 頁碼(若有)。

#### Scenario: 全形分號複合引注拆成多筆

- **WHEN** footnote 為 `[^1]: A契約書.doc；B契約書.doc`
- **THEN** 系統產生兩筆引用,分別指向 `A契約書.doc` 與 `B契約書.doc`

#### Scenario: 各來源各自帶頁碼

- **WHEN** footnote 為 `[^1]: A.pdf, p.3；B.pdf, p.5`
- **THEN** 系統產生兩筆引用:`A.pdf` 頁碼 3、`B.pdf` 頁碼 5

### Requirement: 全知識庫引用重算

系統 SHALL 提供對單一知識庫重算引用的能力:對該 KB 所有 wiki 頁重新抽取引用邊,並以重算結果取代既有 `document_references`。此能力 SHALL 可被外部觸發(API 端點),供 parser 更新後回填既有頁面。重算 SHALL 僅限請求者擁有的知識庫。

#### Scenario: 重算後既有頁面套用新 parser

- **WHEN** 對某 KB 觸發引用重算
- **THEN** 該 KB 每個 wiki 頁的引用邊依最新 parser 規則重建,先前因解析失敗而漏掉的引用被補上

#### Scenario: 重算僅限自己的知識庫

- **WHEN** 請求者對不屬於自己的知識庫觸發重算
- **THEN** 系統拒絕(not found / 無權限),不更動任何資料
