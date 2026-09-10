# 敲脑壳 MindPop AI 开发指南

> 本文档帮助 AI 工具快速了解项目结构和开发规范。

## 项目概述

**敲脑壳 MindPop** - 专为复杂知识设计的硬核记忆工具。

| 项目信息 | 值 |
|----------|-----|
| 当前版本 | v1.6.0 |
| 技术栈 | Spring Boot 2.7.18 + MySQL 8.0 + Vanilla JS |
| 构建工具 | Maven |
| Java 版本 | 11 |
| 服务器 | your_server_ip:8080 |
| 数据库 | MySQL 8.0 (your_server_ip) |

## 核心功能

- ✅ 用户注册/登录 (JWT 认证)
- ✅ 打字测验 / 填空测验
- ✅ 测验管理 (CRUD)
- ✅ 数据库管理
- ✅ 导入导出 (JSON)
- ✅ 测验分组
- ✅ 账户数据隔离

## 项目结构

```
typing-quiz/
├── src/main/java/com/typingquiz/
│   ├── entity/           # 实体类 (Quiz, Answer, User, QuizGroup)
│   ├── repository/       # 数据访问层
│   ├── service/         # 业务逻辑层
│   ├── controller/      # REST API 控制器
│   ├── dto/             # 数据传输对象
│   ├── config/          # 配置类
│   ├── exception/       # 异常处理
│   └── util/            # 工具类
├── src/main/resources/
│   ├── application.properties  # 应用配置
│   └── static/          # 前端资源 (HTML/CSS/JS)
├── pom.xml
├── Dockerfile
├── start.bat            # 本地启动 (MYSQL_HOST=your_server_ip)
└── docs/
```

## 关键 API 端点

### 测验相关
- `GET /api/quizzes` - 获取所有测验
- `POST /api/quizzes` - 创建测验
- `PUT /api/quizzes/{id}` - 更新测验
- `DELETE /api/quizzes/{id}` - 删除测验

### 认证相关
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- 所有 API 需要 Authorization header: `Bearer <token>`

### 导入导出
- `GET /api/import-export/quizzes/export` - 导出所有
- `POST /api/import-export/quizzes/import` - 导入

## 开发规范

### Git 使用
```bash
# 提交前测试通过
git add -A
git commit -m "fix: xxx"     # 使用 fix/feat/chore/docs 前缀
git push
```

### 分支策略
- `main` - 稳定发布版本
- `feature/xxx` - 功能分支
- `fix/xxx` - 修复分支

### 测试要求
- 本地测试通过后再推送
- 不在云服务器上调试本地问题
- 运行 `./mvnw clean package` 构建验证

## 环境配置

### 本地开发

统一入口和当前配置方法以 [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) 为准。
Mac/Linux 使用 `./start.sh --check` 后执行 `./start.sh`；Windows 使用 `start.bat`。
完整验收必须运行后端，静态页面测试不能证明数据库、登录或 API 可用。

### 云端部署

生产环境使用 systemd 运行 JAR。功能分支完成审查后合并到 `main`，等待 GitHub CI 通过，再从本地最新 `main` 执行：

```bash
./scripts/deploy-main.sh
```

脚本会核对 `origin/main`、从干净提交构建、备份旧 JAR、重启服务并验证公网。配置与回滚方式见根目录 `DEPLOY.md`。

**注意：**
- 仅修改前端文件（HTML/JS/CSS）时，无需 `docker build`，刷新浏览器即可生效
- 修改后端 Java 代码时，必须执行 `docker build` 重新打包

## 数据库配置

| 用户 | 用途 | 密码 |
|------|------|------|
| root | 管理员 | your_mysql_password |
| typingquiz | 应用连接 | your_mysql_password |

连接字符串：
```properties
spring.datasource.url=jdbc:mysql://${MYSQL_HOST:localhost}:3306/typing_quiz?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
```

## 账户隔离规则

所有查询必须按 `userId` 过滤：
- 测验：用户只能查看/操作自己的测验
- 分组：用户只能查看/操作自己的分组
- 前端请求必须携带 `Authorization: Bearer <token>`

## 代码提交流程

1. **本地修改代码**
2. **本地测试验证** (`./mvnw clean package`)
3. **测试通过后提交并推送**
4. **部署到云服务器**

## 测试要求

- 功能测试通过后再提交
- 确保不影响现有功能
- 本地环境能复现的问题不在云服务器上调试

## 常见任务

### 添加新功能
1. 创建 `feature/xxx` 分支
2. 在对应层添加代码：
   - `entity/` - 数据模型
   - `repository/` - 数据访问
   - `service/` - 业务逻辑
   - `controller/` - API 端点
   - `dto/` - 请求/响应对象
3. 本地测试
4. 提交并推送到 main

### 修复 Bug
1. 创建 `fix/xxx` 分支
2. 定位问题代码
3. 本地复现并修复
4. 测试通过后提交

### 更新文档
- 更新 `CHANGELOG.md` 记录变更
- 更新版本号在 `pom.xml`

## 重要文件

| 文件 | 说明 |
|------|------|
| `README.md` | 项目完整说明（包含快速开始） |
| `CHANGELOG.md` | 更新日志 |
| `ARCHITECTURE.md` | 系统架构设计（详细） |
| `数据库配置.md` | MySQL 配置详情 |
| `待优化项目清单.md` | 未来开发计划 |
| `PROJECT_MANAGEMENT.md` | 版本管理、回滚方案 |

> **已合并/删除的文档：**
> - `DEVELOPMENT_GUIDE.md` → 内容已合并到本文档
> - `QUICK_START.md` → 内容已合并到 `README.md`
> - `PROJECT_STATUS.md` → 已删除（过时）

## 关键设计决策

| 决策 | 说明 |
|------|------|
| 分层架构 | Controller → Service → Repository → Entity |
| JPA 数据访问 | Spring Data JPA 自动生成 CRUD |
| JWT 无状态认证 | 服务端无需存储 Session |
| BCrypt 密码加密 | 防彩虹表攻击 |
| 标准化答案匹配 | normalizedContent 实现大小写不敏感 |
| 级联删除 | 测验删除时自动删除关联答案 |
| CORS 开放 | 支持跨域请求 (`@CrossOrigin(origins = "*")`) |

## 扩展性建议

| 方向 | 建议 |
|------|------|
| 缓存 | 添加 Redis 缓存热点数据 |
| 分页 | Repository 添加 Page<> 返回 |
| 搜索 | 考虑 Elasticsearch |
| 消息队列 | 添加异步任务处理 |
| 监控 | 添加 Actuator 端点 |

## 注意事项

1. **账户隔离** - 所有数据操作必须验证用户身份
2. **测试优先** - 本地测试通过后再推送
3. **文档同步** - 代码变更同步更新相关文档
4. **版本标签** - 每次发布打标签

---

**最后更新：** 2026-02-08
