#!/bin/bash
# healthcheck.sh - OpenClaw死活監視スクリプト
# Place in ~/.openclaw/healthcheck.sh
# crontab例: */10 * * * * ~/.openclaw/healthcheck.sh >> ~/.openclaw/healthcheck.log 2>&1

GATEWAY_URL="http://localhost:3000/health"
LOG_FILE="$HOME/.openclaw/healthcheck.log"
MAX_LOG_LINES=1000

check_gateway() {
  response=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY_URL" 2>/dev/null)
  echo "$response"
}

restart_openclaw() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] OpenClaw gateway down. Restarting..."
  pkill -f "openclaw" 2>/dev/null
  sleep 2
  nohup openclaw start >> "$HOME/.openclaw/openclaw.log" 2>&1 &
  sleep 5
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restart attempted."
}

# ログローテーション（1000行超えたら古い行を削除）
if [ -f "$LOG_FILE" ]; then
  lines=$(wc -l < "$LOG_FILE")
  if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
    tail -n 500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
fi

# ヘルスチェック
status=$(check_gateway)
if [ "$status" != "200" ]; then
  restart_openclaw
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK (HTTP $status)"
fi
