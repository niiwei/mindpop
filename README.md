# 敲脑壳 MindPop

> 专为复杂知识设计的硬核记忆工具  
> 强制主动输出 × 科学间隔复习 × 结构化记忆

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#在线体验">在线体验</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#截图展示">截图</a>
</p>

---

## ✨ 为什么选择敲脑壳？

传统记忆工具的问题：**看提示回想答案 → 点击查看答案 → "啊我想起来了"**

这种自我欺骗式学习效率极低。敲脑壳采用 **"单框连击"** 交互设计：

- ✍️ **输入即匹配** - 无需手动提交，敲对关键词答案自动跳出  
- 🚫 **彻底防欺骗** - 不敲对不显示，强迫大脑完成硬核提取  
- 🎯 **无序答题** - 任意顺序回答，避免死记硬背顺序  

> 记忆不是重复阅读，而是**主动提取**。

---

## � 功能特性

### 核心机制

| 特性 | 说明 |
|------|------|
| **强制主动输出** | JetPunk风格单框连击，敲对才显示答案 |
| **SM-2间隔复习** | Anki同款算法，遗忘临界点精准推送 |
| **5种状态流转** | 新测验→学习中→待复习→今日复习→重学中 |
| **4级评级体系** | 重来/困难/良好/简单，算法自动计算下次复习时间 |

### 功能模块

- 📚 **测验管理** - 创建/编辑/删除测验，支持打字题和填空题
- 📂 **分组管理** - 多对多分组关联，科学组织知识体系
- 📊 **学习统计** - 今日/本周/本月数据可视化
- 📥 **导入导出** - JSON格式一键迁移
- 👤 **用户系统** - JWT认证，严格数据隔离
- 🎁 **官方测验包** - 12个高质量测验，新用户注册即送

---

## 🌐 在线体验

**访问地址：** https://mindpop.top

**试用账户：**
- 用户名：`test8`
- 密码：`test8`

> 💡 支持双端访问，电脑体验更佳~

---

## 🛠️ 快速开始

### 环境要求

- Java 11+
- MySQL 8.0（本地或远程）

### 本地启动

Mac/Linux 从工程根目录执行 `./start.sh --check`，再执行 `./start.sh`。
首次恢复配置、Java 11 发现、连接云端数据库及完整验收步骤见
[本地开发说明](docs/internal/LOCAL_DEVELOPMENT.md)。Windows 保留 `start.bat` 入口。

访问 http://localhost:8080（若配置了其他端口，以实际配置为准）。

---

## 🏗️ 技术栈

### 后端
- **框架**: Spring Boot 2.7
- **数据库**: MySQL 8.0 + Spring Data JPA
- **安全**: JWT + Spring Security (BCrypt)
- **构建**: Maven

### 前端
- **原生技术**: HTML5 + CSS3 + Vanilla JavaScript (ES6+)
- **交互**: Fetch API + LocalStorage
- **设计**: 空·息·恒·信极简理念

### 部署
- **验证**: GitHub Actions（Java 11 + Node.js 20）
- **构建**: Docker Maven 构建环境
- **运行**: 阿里云 ECS + systemd + Nginx
- **发布**: `main` 提交与服务器版本一一对应

---

## 📁 项目结构

```
typing-quiz/
├── mcp-server/                     # 本地 stdio MCP 适配器
├── scripts/deploy-main.sh          # 从 main 构建、备份、部署与冒烟验证
├── src/main/java/com/typingquiz/
│   ├── entity/        # 实体类 (Quiz, Answer, User, QuizGroup...)
│   ├── repository/    # 数据访问层 (Spring Data JPA)
│   ├── service/       # 业务逻辑层
│   ├── controller/    # REST API 控制器
│   └── config/        # 配置类
├── src/main/resources/static/  # 前端页面
├── initial-data/      # 官方测验包
└── docs/              # 文档
```

---

## 📖 相关文档

- [API 文档](document_trail/docs/API.md)
- [数据库设计](document_trail/docs/DB_SCHEMA.md)
- [更新日志](document_trail/CHANGELOG.md)
- [开发指南](docs/internal/AI_DEVELOPMENT_GUIDE.md)
- [Agent API 与 MCP 接入](docs/AGENT_API.md)
- [发布与部署](DEPLOY.md)

---

## 🤝 贡献

欢迎 Issue 和 PR！

---

## 📄 许可证

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by 敲脑壳 MindPop Team
</p>
