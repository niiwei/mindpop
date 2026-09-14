# nginx 反向代理配置

> 用途：保存生产环境 nginx vhost 的**配置副本**，用于服务器重建、迁移或配置丢失时快速恢复。
> 只存配置文本与说明，**不放证书私钥、密码或任何机器专属凭据**。

## 这份配置解决什么问题

域名指向一台阿里云 ECS。nginx（宝塔面板托管）后面同时存在两套东西：

| 端口 | 后面是谁 |
|---|---|
| 443 | 本应用（Spring Boot，`127.0.0.1:8080`） |
| 80 | 宝塔默认站 WordPress（`server_name wordpress default_server`，root 为 `/www/wwwroot/wordpress`） |

此前有两个缺失叠加在一起：

1. **80 端口没有为本站声明 server 块** → 所有明文 http 请求都落到默认站 WordPress。
2. **应用在反向代理后不知道自己在 HTTPS 后面** → 生成 `http://mindpop.top/home.html` 这样的绝对跳转；浏览器跟随该跳转就从 443 掉回 80 端口，撞上 WordPress，然后 404。

**后果**：只有「浏览器会自己把 http 升级为 https」的访问者能正常打开——也就是说本机开发者（浏览器留有 HSTS 等状态）能打开，而**全新的访客打不开**。这类故障在自己机器上极难复现。

## 改动要点

1. 为 `mindpop.top` 与 `www.mindpop.top` **新增 80 端口 server 块**，一律 `301` 到 `https://mindpop.top`；
2. 443 块补 `X-Forwarded-Port $server_port`；
3. 443 块增加 `proxy_redirect ~^http://[^/]+/(.*)$ https://mindpop.top/$1;`，把应用生成的 `http://` Location 改写回 `https`。

> 第 3 条是用 nginx 兜住应用侧问题。更彻底的修法是让应用启用 forwarded-headers 解析（Spring Boot `server.forward-headers-strategy=framework`），但那需要改应用并重启，本目录暂不采用。

## 文件与服务器路径对应

| 仓库文件 | 服务器路径 |
|---|---|
| `deploy/nginx/mindpop.top.conf` | `/www/server/panel/vhost/nginx/mindpop.top.conf` |
| `deploy/nginx/www.mindpop.top.conf` | `/www/server/panel/vhost/nginx/www.mindpop.top.conf` |

服务器的 nginx 主配置为 `/www/server/nginx/conf/nginx.conf`，其中 `include /www/server/panel/vhost/nginx/*.conf;`。

## 部署步骤

```bash
# 0. 本机在仓库根目录执行；把 <HOST> 换成服务器地址
HOST=<HOST>

# 1. 先备份服务器上的现有配置
ssh root@$HOST 'D=/www/server/panel/vhost/nginx; \
  cp -a $D/mindpop.top.conf $D/mindpop.top.conf.bak-$(date +%Y%m%d-%H%M%S) && \
  cp -a $D/www.mindpop.top.conf $D/www.mindpop.top.conf.bak-$(date +%Y%m%d-%H%M%S)'

# 2. 上传
scp deploy/nginx/mindpop.top.conf     root@$HOST:/tmp/
scp deploy/nginx/www.mindpop.top.conf root@$HOST:/tmp/

# 3. 安装（保留 644 权限）
ssh root@$HOST 'install -m 644 /tmp/mindpop.top.conf     /www/server/panel/vhost/nginx/mindpop.top.conf; \
                install -m 644 /tmp/www.mindpop.top.conf /www/server/panel/vhost/nginx/www.mindpop.top.conf'

# 4. 语法检查通过后才 reload；不通过就不要 reload
ssh root@$HOST 'nginx -t && nginx -s reload'
```

## 验证

以下六种写法应全部返回 `200`，并最终落在 `https://mindpop.top/home.html`：

```bash
for u in http://mindpop.top/ http://www.mindpop.top/ https://mindpop.top/ \
         https://www.mindpop.top/ http://mindpop.top/login.html https://mindpop.top/login.html; do
  printf '%-34s ' "$u"
  curl -s -m 12 -L -o /dev/null -w 'HTTP %{http_code}  →  %{url_effective}\n' "$u"
done
```

落地页标题应为 `<title>敲脑壳 MindPop - 首页</title>`。

**无副作用检查**（不应因本站改动而受影响）：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://<服务器IP>/          # 宝塔默认站，应为 200
curl -s -o /dev/null -w '%{http_code}\n' http://mindpop.top:8080/login.html   # 应用直连，应为 200
```

## 回滚

```bash
ssh root@$HOST 'D=/www/server/panel/vhost/nginx; \
  cp -a $(ls -t $D/mindpop.top.conf.bak-* | head -1) $D/mindpop.top.conf && \
  nginx -t && nginx -s reload'
```

## 注意事项

- 证书路径 `/www/server/panel/vhost/nginx/ssl/*.pem|.key` 由宝塔生成，**重装或换面板后路径与文件名可能变化**，恢复前先确认实际路径。
- 服务器上另有宝塔默认站 `/www/server/panel/vhost/nginx/127.0.0.1.conf`（`server_name wordpress default_server`）。本配置**不修改它**；只要本站声明了 `server_name`，80 端口就不会再落到默认站。
- `listen ... ssl http2` 是 nginx 1.26 的弃用写法（仅告警）。如需消除，可改为 `listen 443 ssl;` 加独立的 `http2 on;`。
- 证书私钥、`.env.deploy`、SSH 私钥等**一律不得放进本目录**。
