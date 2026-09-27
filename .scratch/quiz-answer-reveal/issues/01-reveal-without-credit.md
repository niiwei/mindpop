# 逐项显示答案且不计分
Status: resolved
Type: task

依据 ../spec.md 实现。测试通过现有 `tests/browser/` 浏览器边界验证：定向点击、顺序提示、普通/v2、填空提示、得分与结算。代码限既有网站前端文件，文档同步至答题页运行说明。

## 目录与清理

需求保存在本目录 `spec.md`，任务保存在 `issues/`；截图和静态测试服务日志仅作临时产物，本轮结束清理。

## 交付记录

- 实现：打字题未答项悬停或聚焦出现“显示答案”，点击只揭示该项；填空题可定向揭示未填空。原有提示依次揭示下一项。揭示项不写入答对集合，之后再次输入也不计分；结算以主动回答数统计。
- 验证：独立发布分支从 `main` 仅移入本任务文件；`MINDPOP_BROWSER_BASE_URL=http://127.0.0.1:18083 npm run test:browser -- --workers=1`，13/13 通过，覆盖普通/v2/填空、定向显示、顺序提示及得分。MCP `npm test` 3/3；Docker 中 `maven:3.9.9-eclipse-temurin-11 mvn -B test package` BUILD SUCCESS。真实线上验收结果在发布后补记；静态浏览器测试不等于完整后端验收。
- 文档同步：`README.md` 更新作答与揭示的区别；答题页 JS/CSS 资源版本已更新。
- 代码版本：原功能提交 `cfe991f`；独立发布提交 `4cd410e`，合并到 `main` 的部署提交为 `1f3d1d3e35d640cea782fcb767026a05f4dbbf59`。
- 发布状态：2026-09-27 已发布到生产；本机插件与桥接服务的其他改动未随此票部署。

## 发布记录

- 时间：2026-09-27 13:56（北京时间）；部署 SHA：`1f3d1d3e35d640cea782fcb767026a05f4dbbf59`。
- 合并前 PR #1 和合并后 `main` CI 均通过；发布脚本从同一 SHA 的 Git 归档重新执行 Java 9/9、MCP 3/3、浏览器 13/13 并构建 JAR。
- 生产回读：`/opt/mindpop/DEPLOYED_COMMIT` 与部署 SHA 一致，`mindpop.service` 为 active，服务器本机 `index.html` 返回 200；公网答题页引用新 JS/CSS 版本，两个 JS 文件与发布提交逐字节一致，未授权 Agent API 返回预期 401。以公网 `https://mindpop.top` 为测试地址运行 `tests/browser/hint.spec.js`，6/6 通过；未使用生产账户创建或修改测验数据。
- 数据库迁移：无。回滚位置：`/opt/mindpop/backups/20260927-135627/typing-quiz-1.1.0.jar`；按 `DEPLOY.md` 恢复 JAR 并重启服务，Git 代码回退使用新提交，不重写 `main`。
- 仍需人工验收：在已登录的日常浏览器打开真实测验，确认悬停文案、点击体验及结算显示；自动化验收使用真实生产静态页面和隔离测试数据。
