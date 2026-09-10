# 工程路径约定

本文件中的 repo 指 Git 与工程共同根目录。`.scratch/` 纳入 Git；不调用远程 issue API。

# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## 交付记录

每项实现工作使用原 ticket；简单工作可只建一张 ticket，不必额外 spec。完成前在 `## 交付记录` 中记录：

- 实现结果：实际完成范围。
- 验证：命令、结果、证据位置；未验证项及原因。
- 文档同步：修改的文档，或无需修改的原因。
- 代码版本：实现提交 SHA 或可追溯的 Git 历史。不要试图把包含本记录的提交 SHA 写入它自身；提交后通过 Git 历史定位，发布时记录实际部署 SHA。
- 发布状态：未发布 / 已发布 / 失败，不能用开发完成代替上线。
- 发布后追加：时间、部署 SHA、健康检查、迁移状态、回滚位置、遗留问题。

记录纳入 Git；测试日志只保存必要摘要或持久证据链接，不提交密钥和临时产物。多个 ticket 同批发布时，在一张协调 ticket 中保存发布记录，其余引用它。线上发布记录可在发布后用独立文档提交保存，明确它记录的部署 SHA，不因此再次触发应用发布。
