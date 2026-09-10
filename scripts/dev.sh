#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:-}" in
    ""|--check|--tunnel|--test) ;;
    *) echo "用法: ./start.sh [--check|--tunnel|--test]" >&2; exit 2 ;;
esac
if [[ $# -gt 1 ]]; then echo "用法: ./start.sh [--check|--tunnel|--test]" >&2; exit 2; fi
cd "$repo_dir"
if [[ -f .env.local ]]; then
    set -a
    source .env.local
    set +a
fi
if [[ "${1:-}" == --tunnel ]]; then
    if [[ ! -f .env.deploy ]]; then echo "SSH 隧道需要 .env.deploy。" >&2; exit 1; fi
    source .env.deploy
    : "${MINDPOP_SSH_HOST:?缺少 SSH 主机}"
    : "${MINDPOP_SSH_USER:?缺少 SSH 用户}"
    : "${MINDPOP_SSH_KEY:?缺少 SSH 私钥路径}"
    echo "建立本地 127.0.0.1:13306 到服务器 127.0.0.1:3306 的隧道；保持此终端运行。"
    exec ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ConnectTimeout=10 \
        -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
        -i "$MINDPOP_SSH_KEY" -L 127.0.0.1:13306:127.0.0.1:3306 \
        "$MINDPOP_SSH_USER@$MINDPOP_SSH_HOST"
fi
if [[ -z "${JAVA_HOME:-}" ]]; then
    for candidate in /opt/homebrew/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk@11/libexec/openjdk.jdk/Contents/Home; do
        if [[ -x "$candidate/bin/java" ]]; then JAVA_HOME="$candidate"; break; fi
    done
    if [[ -z "${JAVA_HOME:-}" && -x /usr/libexec/java_home ]]; then
        JAVA_HOME="$(/usr/libexec/java_home -v 11 2>/dev/null || true)"
    fi
fi
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then
    echo "未找到 JDK 11；在 .env.local 设置已验证的 JAVA_HOME。见 docs/internal/LOCAL_DEVELOPMENT.md" >&2
    exit 1
fi
java_version="$("$JAVA_HOME/bin/java" -version 2>&1)"
if [[ "$java_version" != *'version "11.'* ]]; then
    echo "需要 JDK 11，请修正 JAVA_HOME。" >&2; exit 1
fi
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
if [[ "${1:-}" == --test ]]; then
    unset SPRING_DATASOURCE_URL SPRING_DATASOURCE_USERNAME SPRING_DATASOURCE_PASSWORD MYSQL_HOST MYSQL_USER MYSQL_PASSWORD
    exec sh ./mvnw -B test
fi
if [[ ! -f src/main/resources/application.properties ]]; then
    echo "缺少 application.properties；按 LOCAL_DEVELOPMENT.md 从 example 恢复并配置凭据。" >&2
    exit 1
fi
echo "JDK 11 与本地配置文件检查通过（尚未验证数据库连接）。"
if [[ "${1:-}" == --check ]]; then exit 0; fi
# 本地连接可能指向云端库；启动过程不自动迁移或写入示例数据。
export SPRING_JPA_HIBERNATE_DDL_AUTO=none
export MINDPOP_DATA_INITIALIZER_ENABLED=false
echo "启动完整后端；自动建表和示例初始化已关闭。按 Ctrl+C 停止本次进程。"
exec sh ./mvnw spring-boot:run
