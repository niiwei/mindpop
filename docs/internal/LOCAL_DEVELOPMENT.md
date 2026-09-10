# 本地开发与验收

工程根目录就是 Git 根目录。以下命令从根目录执行；`start.sh` 也可从其他目录以绝对路径调用。

## 恢复本机环境

1. 将 `src/main/resources/application.properties.example` 复制为同目录 `application.properties`。若已有真实配置，不覆盖。
2. 将 `.env.local.example` 复制为 `.env.local`，填写实际配置；已有文件只修改所需项。该文件作为 shell 配置加载，不要粘贴不可信命令。
3. `JAVA_HOME` 指向包含 `bin/java` 的 JDK 11 根目录。未指定时，入口检查 Homebrew 的稳定 JDK 路径和 macOS `java_home -v 11`。找不到时先检查已有安装，不凭默认 `java` 不可用就判断未安装。非标准安装通过 `.env.local` 明确配置，勿将带版本号的本机路径写进共享脚本。
4. `MYSQL_HOST` 指向实际开发数据库；本地服务可以直连云端 MySQL，不需要把后端部署到云端才能调试。确认目标确实是数据库主机，不自动假定它与部署主机相同。数据库用户及密码由 `MYSQL_USER`、`MYSQL_PASSWORD` 或现有受忽略的 properties 配置提供。

`.env.local` 的值覆盖同名 shell 环境变量。普通启动不加载 `.env` 或 `.env.deploy`；`--tunnel` 仅读取 `.env.deploy` 中的 SSH 配置。所有真实凭据不得纳入 Git。

## 云端数据库通过 SSH 隧道连接

当前部署数据库仅允许服务器本机连接。不要为了本地调试开放数据库授权。

1. 确认 `.env.deploy` 中 SSH 主机、用户、私钥可用。
2. 一个终端运行 `./start.sh --tunnel`，保持运行。它仅将本地 `127.0.0.1:13306` 转发至该服务器的 `127.0.0.1:3306`；端口占用会失败，不结束其他隧道。
3. `.env.local` 使用 `SPRING_DATASOURCE_URL=jdbc:mysql://127.0.0.1:13306/<实际库名>?<原连接参数>`，以及 `SPRING_DATASOURCE_USERNAME`、`SPRING_DATASOURCE_PASSWORD`。这些值覆盖 properties；从获授权的现有配置恢复，不在文档中记录真实凭据。
4. 另一个终端运行 `./start.sh --check` 和 `./start.sh`。使用其他本地 HTTP 端口可执行 `SERVER_PORT=18082 ./start.sh`（前提是 `.env.local` 没有覆盖 SERVER_PORT）。
5. 调试结束后分别在后端和隧道终端按 Ctrl+C。

只有数据库确实位于该 SSH 服务器的 3306 时使用此入口。其他部署拓扑应先核实并调整规则与脚本，不能沿用错误目标。直连仅适用于已有授权允许的数据库；此时按上一节配置 MYSQL 变量，不需要隧道。

## 统一入口

```bash
./start.sh --check
./start.sh
```

`--check` 只验证 JDK 版本及配置文件存在，不代表数据库或后端可用。启动时强制关闭 Hibernate 自动建表与示例初始化，避免连接云端库就产生初始化写入；需要迁移时单独按发布流程处理。业务 API 的写入行为不受此开关限制，写入验收应使用测试账户和可清理的数据。

入口不结束其他 Java 进程。端口占用时确认占用者；停止本次前台服务用 Ctrl+C，不使用 `pkill java`。

## 验收层次

- 环境：`./start.sh --check`。
- 后端：启动日志中应用启动完成、Hikari 连接池启动成功；随后对实际本地端口检查页面和 API。
- 功能：使用测试账户验证登录及本次涉及的读取/写入流程；仅服务启动不代表这些功能通过。
- 前端静态检查：静态服务器和 mock API 的浏览器测试只证明该测试范围，不能替代真实登录、API、数据库验收。

```bash
curl --fail --location --silent --show-error http://localhost:8080/ -o /tmp/mindpop-page.html
# 使用与启动相同的配置加载和 JDK 发现逻辑执行 Java 测试
./start.sh --test
(cd mcp-server && npm ci && npm test)
# 浏览器测试需要先提供服务，参照 .github/workflows/ci.yml
npm run test:browser -- --workers=1
```

不要把页面响应成功写成登录或数据库验收通过；记录真实执行的命令、结果及未验证项。临时页面、日志和截图交付前清理，需长期保存的证据按任务记录注明位置并去除敏感内容。

## 排错顺序

- JDK 找不到或不是 11：检查 `.env.local` 和已有安装，修正 `JAVA_HOME`。
- 缺少 properties：从 example 或已知本机备份恢复，不生成虚假凭据。
- `Communications link failure` / `Connection refused`：检查数据库主机、3306 连通性、云端服务和访问控制；应用已使用正确 JDK 时不要重新排查 Java。
- 认证失败：检查数据库账号授权及凭据来源，不输出密码。
- 表或字段缺失：核对数据库迁移，不通过开启自动建表掩盖问题。

## 交付

按 `docs/agents/issue-tracker.md` 在原 ticket 保存验收与发布状态。当前运行方法在本文件就地更新，单次操作结果保留在 ticket。
