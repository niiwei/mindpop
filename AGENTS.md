# MindPop 工作区规则

- 默认中文沟通，代码、命令和变量名使用英文。
- Git 根目录同时是工程根目录；Spring Boot 源码、`mcp-server/` 和项目文档都从仓库根目录定位，不再使用 `typing-quiz-main/` 包装目录。
- 新目录先约定用途、命名和清理规则；调整规则先改文档再改实践。
- 只修改当前任务所需文件，不顺手重构；实现前明确假设及验收标准。
- 提交前检查差异并执行相关验证；不得将未运行的验证写为通过。
- 功能从 `codex/<topic>` 分支开发，通过验证后合并到 `main`；`main` 是 GitHub 和生产部署的唯一发布源。
- 未经明确授权不得推送或部署；发布时必须先确认本地 `HEAD` 与 `origin/main` 一致。
- 不提交密钥、真实环境配置、数据库、构建产物和临时文件。

## 目录约定

- `src/` 存放 Spring Boot 运行代码和静态资源，保留既有目录结构。
- `mcp-server/` 存放独立 TypeScript stdio MCP 适配器；源码和测试位于 `src/`、`tests/`，`dist/` 与 `node_modules/` 不纳入 Git。
- `scripts/` 存放可重复的本地构建和生产发布脚本；部署凭据写入 `.env.deploy`，本地启动配置写入 `.env.local`；均不纳入 Git。
- `.github/workflows/` 存放 GitHub CI；合并 `main` 前必须通过 Java 与 MCP 测试。
- `docs/agents/` 存放工程技能配置；`CONTEXT.md` 存放领域术语；`docs/adr/` 存放编号决策记录。
- `.scratch/<feature>/` 存放可版本管理的需求和任务文档，功能名使用英文 kebab-case；需求为 `spec.md`，任务为 `issues/NN-slug.md`。
- 临时产物在交付前清理，只清理本次产生的文件；历史需求和任务文档保留。

## Agent skills

- Issue tracker 使用工程内本地 Markdown，参见 `docs/agents/issue-tracker.md`。
- Triage labels 使用默认五个角色标签，参见 `docs/agents/triage-labels.md`。
- Domain docs 采用 single-context，参见 `docs/agents/domain.md`。

## 本地凭据文件

- `src/main/resources/application.properties`、`wechat_notes_to_quiz/wechat_notes_to_quiz.py` 和 `.env.deploy` 含本机凭据并排除 Git。
- 对应 `.example` 文件纳入版本管理；恢复工作区时复制为原文件名并通过环境变量配置密钥。
- 发布脚本不得输出数据库密码、JWT、PAT 或 SSH 私钥内容。

## 开发与交付入口

- 本地调试前先读 `docs/internal/LOCAL_DEVELOPMENT.md`，运行 `./start.sh --check`；完整后端使用 `./start.sh`，不得用静态服务器代替 API、登录和数据库验收。
- 每次完成实现后按 neat-freak 的日常模式同步受影响文档，并在原 ticket 补交付记录；无文档变化需说明原因。全项目整理只在明确阶段收尾时执行。
- 交付记录格式见 `docs/agents/issue-tracker.md`；必须区分已验证、未验证和未发布。发布后追加实际部署 SHA、检查结果及回滚位置。
- SubAgent 读取适用项目规则及任务文档，返回改动文件、验证命令与结果、遗留问题。主 Agent 负责集成和最终提交；同一 worktree 的代码写入串行。
- `docs/internal/LOCAL_DEVELOPMENT.md` 保存当前运行方法；历史过程保留在 ticket。不要将密钥或机器专属路径复制到共享文档。
