# 发布用户更新日志

Status: in-progress
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

## 导航栏入口补正（2026-10-04）

用户反馈：线上更新日志只能从首页页脚和登录页进入，主页顶部导航栏没有入口。核对后确认，线上 SHA `280e767` 的 `home.html` 导航栏无日志链接，页脚链接在页面最底部。

- 改动范围：`src/main/resources/static/` 下 12 个页面的导航栏、`changelog.html` 页面内容，以及 `css/navigation.css` 移动端响应式选择器；主导航页面（`home`/`index`/`quizzes`/`create`/`stats`/`manage`/`settings`）在“设置”与“退出”之间新增“更新日志”；旧式导航页面（`ai-create`/`database`/`review`/`review-quiz`）在末位追加；`changelog.html` 自身导航项与其他主页面对齐，仅“更新日志”高亮。未改动后端、数据库、插件与桥接。
- 变更中发现并修复的回归：新增第 8 个导航项后，768px 以下导航不换行，`home`/`quizzes`/`create`/`manage`/`settings` 在 390px 视口出现横向滚动（文档宽 408px > 390px）。根因是 `navigation.css` 的移动端规则只选了 `.navbar-nav`，而主页面导航容器用的是 `.nav-links`（该规则从未生效）。改为 `.navbar-nav, .nav-links` 后，除 `stats.html` 外全部页面在 1440/768/390 三档均无横向溢出。
- 本地验证（2026-10-04）：Java `mvn -B test` 9/9 通过（Docker `maven:3.9.9-eclipse-temurin-11`）；MCP `npm test` 3/3 通过；浏览器 `npm run test:browser -- --workers=1` 15/15 通过。另以脚本在 1440/768/390 三档遍历 12 个页面，确认“更新日志”入口在导航栏内可见、HTTP 200、无新增横向溢出。
- 待发布：本次为功能分支提交，尚未合并 main、未部署；推送与部署已获用户授权，待执行。
- 已知遗留（本票未处理，均非本次引入）：`index.html` 导航缺“看板”；`ai-create.html` 导航项为另一套短列表且首页链接指向 `index.html`；`changelog.html` 未加载 `api.js` 因而无“退出”；`stats.html` 在 390px 视口存在改前即有的横向溢出（文档宽 684px）；`review-quiz.html` 数据加载失败时会用错误页替换整个 `<body>`，导航随之消失（改前行为）。
