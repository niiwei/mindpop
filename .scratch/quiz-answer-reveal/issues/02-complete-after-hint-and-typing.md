# 提示后手动答完仍应结算
Status: resolved
Type: task

打字题中先通过“提示”揭示一项，再手动答出最后一项时，测验应结束；揭示项仍不计分。回归同时覆盖未使用提示时的正常结束。

## 交付记录

- 实现：手动输入路径以“已答对数＋已揭示数”判断是否全部处理，与提示路径一致；揭示项仍不计分。更新答题页脚本版本，避免浏览器继续使用旧缓存。
- 验证：先新增浏览器测试复现 `completions: 0`，修复后 `MINDPOP_BROWSER_BASE_URL=http://127.0.0.1:18083 npx playwright test tests/browser --workers=1` 16/16 通过；`node --check src/main/resources/static/js/quiz-controller.js` 与 `git diff --check` 通过。测试使用本地静态页面，不代表真实登录/API/数据库验收。工作区原有 `start.sh` 删除，本轮未运行 Java 后端或完整服务验收。
- 文档同步：现有 `spec.md` 与 `README.md` 已写明揭示不计分及全部处理后结算，行为约定未改变，无需修改；本 ticket 记录缺陷和验收。
- 发布状态：未发布、未推送。代码版本由包含本 ticket 的提交定位。
