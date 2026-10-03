# 发布用户更新日志

Status: resolved
Type: task

用户明确要求更新后部署。从已审查的本地提交 `f2478f4` 提取更新日志、首页底部和登录页入口到最新 main 的功能分支。个人插件的采集修复和其他本地功能不属于服务器发布产物，不合并整个插件分支。

## 验收与交付

- 来源验证：插件分支已完成双轴审查；更新日志桌面/手机布局及匿名登录页入口通过。首页/登录页相对 origin/main 仅新增日志链接。
- 发布前：功能分支 CI 的 Java、MCP、浏览器检查通过后合并 main；部署前本地 HEAD 必须与 origin/main 一致。
- 发布后：核对服务器 SHA、服务健康、公开日志页面与两个入口、未认证 Agent API，记录回滚位置。没有数据库迁移，不创建或修改线上测验。
- 文档：AGENTS 定义维护约定；README 和 CHANGELOG 指向用户日志；本票留存发布结果。
- 发布结果：2026-10-03 已部署，生产 SHA `7a4de66f2950230046ede91e95b0de61df3e3d4b`，PR #5。
- 验证：PR 与 main CI 通过 Java 9/9、MCP 3/3、浏览器15/15；标准脚本从同一SHA归档构建并部署成功。服务器 DEPLOYED_COMMIT 回读一致，mindpop.service active；公网 changelog/home/login 均200，两个入口存在；未认证Agent API401。
- 回滚：`/opt/mindpop/backups/20261003-193528/typing-quiz-1.1.0.jar`。无数据库迁移。
- 个人插件：采集修复留在 codex/browser-extension，本地构建需Chrome重新加载；本次没有发布插件商店或把个人插件/评测工作台合并到服务器分支。
- 本发布记录属于事后文档同步，合并记录后不重复部署应用。
