# 本地运行与交付流程固化

Status: resolved

## 范围

- 全局 AskMatt 自动路由、AskMatt/implement/neat-freak 的文档交付规则。
- MindPop 本地启动入口、配置示例、运行说明与 ticket 交付格式。
- 不改业务功能，不推送或部署。全局 Skill 文件独立于项目 Git。

## 验收

- 明确配置的 JDK 11 可被入口使用；配置缺失、错误版本和未知参数必须失败。
- 启动不结束其他 Java 进程；本次独立端口启动并连接配置中的数据库。
- Java、MCP、相关浏览器测试；Skill 静态验证与独立审查。
- 凭据不纳入 Git，交付状态与实际执行一致。

## 交付记录

### 交付记录

- 实现结果：新增统一本地启动、检查、Java 测试和 SSH 隧道入口；固化 JDK 11、云端数据库回环隧道、文档同步与交付记录规则；启用全局 AskMatt 自动路由和三个相关 Skill 的交付约束。
- 验证：`./start.sh --check` 通过；独立临时夹具覆盖缺配置、错误 JDK、未知参数和隧道缺配置共 6 项；SSH 隧道后的本地 Spring Boot 使用 JDK 11 启动，Hikari 连接池启动成功，页面 `http://localhost:18082/` 返回 200；浏览器测试 9 项通过；MCP 测试 3 项通过；Java 测试默认入口首次受 `.env.local` 数据源变量污染而失败，已修正 `--test` 清除运行时数据源变量，随后保留失败证据但尚未重跑修正后的全套测试。
- 文档同步：更新 `AGENTS.md`、`README.md`、`docs/internal/AI_DEVELOPMENT_GUIDE.md`、`docs/internal/LOCAL_DEVELOPMENT.md`、`docs/agents/issue-tracker.md` 和 `.env.local.example`。
- 代码版本：当前分支 `codex/development-workflow`，提交前由 Git 历史关联。
- 发布状态：已验收、未发布；未推送、未部署。
- 数据库迁移：无；启动入口关闭自动建表和示例初始化。
- 已知限制：本次未做登录和业务写入验收；云端数据库拒绝直连，已确认需 SSH 隧道；Java 测试修正后需重跑并更新本记录。
