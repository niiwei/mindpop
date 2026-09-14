# MindPop 发布与部署

`main` 是 GitHub 和生产环境的唯一发布源。本地发布脚本会拒绝非 `main`、存在未提交受控修改，或与 `origin/main` 不一致的代码，从而保证 GitHub 提交与服务器版本一一对应。

## 首次配置

环境要求：Docker、Node.js 20+、OpenSSH。Java 构建固定在 `maven:3.9.9-eclipse-temurin-11` 容器中完成。

```bash
cp .env.deploy.example .env.deploy
```

在 `.env.deploy` 填写服务器地址、SSH 用户、专用密钥绝对路径、远端目录和公网地址。该文件已被 Git 忽略，不得提交。

生产服务器当前约定：

| 项目 | 位置 |
|---|---|
| 应用目录 | `/opt/mindpop` |
| 运行 JAR | `/opt/mindpop/target/typing-quiz-1.1.0.jar` |
| systemd 服务 | `mindpop.service` |
| 环境配置 | `/etc/mindpop/mindpop.env` |
| 公网入口 | `https://mindpop.top` |

## 反向代理（nginx）

公网入口由服务器上的 nginx 承担：80 与 443 均指向本应用，`www.mindpop.top` 统一 `301` 到裸域。生产使用宝塔面板托管的 nginx，vhost 位于 `/www/server/panel/vhost/nginx/`。

配置副本、部署步骤、验证命令与回滚方式见 **[`deploy/nginx/README.md`](deploy/nginx/README.md)**。

> ⚠️ 服务器重建或迁移后，务必按该文档恢复 vhost 并跑一遍六种写法验证。常见故障：80 端口缺少本站 server 块时，明文 http 会落到宝塔默认站（WordPress）；应用生成的 `http://` 跳转未被改写时，浏览器会掉回 80 端口并 `404`。**这两种情况在本机浏览器上往往因缓存或 HSTS 而看不出来，只有全新访客会踩到。**

## 标准发布流程

1. 从最新 `main` 创建 `codex/<topic>` 功能分支。
2. 完成代码、测试和文档，推送功能分支。
3. 通过审查后合并到 `main`，等待 GitHub CI 通过。
4. 在本地同步 `main`，执行：

```bash
./scripts/deploy-main.sh
```

脚本会自动完成：

- 确认本地 `HEAD` 等于 `origin/main`；
- 从该提交的干净归档运行 Java 与 MCP 测试并构建 JAR；
- 将 JAR 上传到 `/opt/mindpop/releases/<commit>/`；
- 备份当前 JAR，替换运行版本并重启 `mindpop.service`；
- 写入 `/opt/mindpop/DEPLOYED_COMMIT`；
- 验证服务器本机页面、公网页面和 Agent API 未认证响应。

本地存在未跟踪草稿不会进入构建，因为脚本从 Git 提交归档构建；存在未提交的受控文件修改时脚本会停止。

## 数据库迁移

数据库迁移脚本位于 `src/main/resources/db/migration/`。涉及结构变化时，先运行对应的只读 preflight，再备份数据库并执行迁移，最后发布应用。发布脚本不会自动执行 SQL，避免把不可逆数据库操作混入普通代码发布。

本期 Agent MCP v1：

```text
src/main/resources/db/migration/agent_mcp_v1_preflight.sql
src/main/resources/db/migration/agent_mcp_v1.sql
```

## 验证与排障

```bash
systemctl is-active mindpop
cat /opt/mindpop/DEPLOYED_COMMIT
journalctl -u mindpop -n 100 --no-pager
curl --fail --location https://mindpop.top/index.html
curl --silent --output /dev/null --write-out '%{http_code}\n' https://mindpop.top/api/agent/v1/quizzes
```

最后一条未携带 PAT 时应返回 `401`。

公网可达性需覆盖**全部常见写法**（无 `www` / 有 `www`、`http` / `https`），六种写法都应 `200` 并最终落在 `https://mindpop.top/home.html`：

```bash
for u in http://mindpop.top/ http://www.mindpop.top/ https://mindpop.top/ \
         https://www.mindpop.top/ http://mindpop.top/login.html https://mindpop.top/login.html; do
  printf '%-34s ' "$u"
  curl -s -m 12 -L -o /dev/null -w 'HTTP %{http_code}  →  %{url_effective}\n' "$u"
done
```

## 回滚

先定位 `/opt/mindpop/backups/<timestamp>/typing-quiz-1.1.0.jar`，再将其恢复到运行路径并重启服务。代码回退使用新的 `git revert` 提交，不重写共享 `main` 历史，也不对 `main` 执行强推。

数据库回滚必须使用发布前备份，并先停止应用。数据库结构与数据回滚不能只依赖 JAR 回退。
