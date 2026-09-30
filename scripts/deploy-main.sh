#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
deploy_config="${MINDPOP_DEPLOY_CONFIG:-$repo_dir/.env.deploy}"

if [[ -f "$deploy_config" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$deploy_config"
    set +a
fi

: "${MINDPOP_SSH_HOST:?请在 .env.deploy 设置 MINDPOP_SSH_HOST}"
MINDPOP_SSH_USER="${MINDPOP_SSH_USER:-root}"
MINDPOP_REMOTE_DIR="${MINDPOP_REMOTE_DIR:-/opt/mindpop}"
MINDPOP_PUBLIC_URL="${MINDPOP_PUBLIC_URL:-https://mindpop.top}"

cd "$repo_dir"

if [[ "$(git branch --show-current)" != "main" ]]; then
    echo "发布只能从 main 分支执行" >&2
    exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "存在未提交的受控文件修改，请先提交或暂存到其他分支" >&2
    exit 1
fi

git fetch origin main
local_commit="$(git rev-parse HEAD)"
remote_commit="$(git rev-parse origin/main)"
if [[ "$local_commit" != "$remote_commit" ]]; then
    echo "本地 main 与 origin/main 不一致，请先完成推送或拉取" >&2
    exit 1
fi

build_dir="$(mktemp -d /tmp/mindpop-release.XXXXXX)"
static_pid=""
browser_port="${MINDPOP_BROWSER_PORT:-18080}"
cleanup() {
    if [[ -n "$static_pid" ]]; then
        kill "$static_pid" 2>/dev/null || true
    fi
    rm -rf "$build_dir"
}
trap cleanup EXIT

git archive "$local_commit" | tar -x -C "$build_dir"

docker run --rm \
    -v "$build_dir:/workspace" \
    -v "${MINDPOP_MAVEN_CACHE:-/tmp/mindpop-m2}:/root/.m2" \
    -w /workspace \
    maven:3.9.9-eclipse-temurin-11 \
    mvn -B test package

(cd "$build_dir/mcp-server" && npm ci && npm test)
(cd "$build_dir" && npm ci)
python3 -m http.server "$browser_port" --bind 127.0.0.1 --directory "$build_dir/src/main/resources/static" >/dev/null 2>&1 &
static_pid=$!
browser_ready=false
for attempt in {1..20}; do
    if curl --fail --silent --max-time 2 "http://127.0.0.1:$browser_port/index.html" >/dev/null; then
        browser_ready=true
        break
    fi
    sleep 1
done
if [[ "$browser_ready" != true ]]; then
    echo "浏览器测试服务未就绪：127.0.0.1:$browser_port" >&2
    exit 1
fi
(cd "$build_dir" && MINDPOP_BROWSER_BASE_URL="http://127.0.0.1:$browser_port" npm run test:browser -- --workers=1)
kill "$static_pid"
static_pid=""

jar_path="$build_dir/target/typing-quiz-1.1.0.jar"
if [[ ! -f "$jar_path" ]]; then
    echo "未找到构建产物 $jar_path" >&2
    exit 1
fi

ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
if [[ -n "${MINDPOP_SSH_KEY:-}" ]]; then
    ssh_options+=(-i "$MINDPOP_SSH_KEY")
fi
remote="${MINDPOP_SSH_USER}@${MINDPOP_SSH_HOST}"
release_dir="$MINDPOP_REMOTE_DIR/releases/$local_commit"

ssh "${ssh_options[@]}" "$remote" "mkdir -p '$release_dir' '$MINDPOP_REMOTE_DIR/backups'"
scp "${ssh_options[@]}" "$jar_path" "$remote:$release_dir/typing-quiz-1.1.0.jar.uploading"

ssh "${ssh_options[@]}" "$remote" bash -s -- "$MINDPOP_REMOTE_DIR" "$release_dir" "$local_commit" <<'REMOTE'
set -euo pipefail
remote_dir="$1"
release_dir="$2"
commit="$3"
timestamp="$(date +%Y%m%d-%H%M%S)"
current_jar="$remote_dir/target/typing-quiz-1.1.0.jar"
release_jar="$release_dir/typing-quiz-1.1.0.jar"
backup_dir="$remote_dir/backups/$timestamp"

mv "$release_jar.uploading" "$release_jar"
mkdir -p "$backup_dir" "$remote_dir/target"
if [[ -f "$current_jar" ]]; then
    cp "$current_jar" "$backup_dir/typing-quiz-1.1.0.jar"
fi
install -m 0644 "$release_jar" "$current_jar"
printf '%s\n' "$commit" > "$remote_dir/DEPLOYED_COMMIT"
systemctl restart mindpop

for attempt in {1..60}; do
    if systemctl is-active --quiet mindpop && curl --fail --silent --show-error http://127.0.0.1:8080/index.html >/dev/null; then
        exit 0
    fi
    sleep 2
done

systemctl status mindpop --no-pager
exit 1
REMOTE

curl --fail --location --silent --show-error "$MINDPOP_PUBLIC_URL/index.html" >/dev/null
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$MINDPOP_PUBLIC_URL/api/agent/v1/quizzes")"
if [[ "$status" != "401" ]]; then
    echo "Agent API 未认证检查预期 401，实际为 $status" >&2
    exit 1
fi

echo "发布完成：$local_commit"
