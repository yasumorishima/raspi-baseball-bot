#!/bin/bash
# healthcheck.sh - OpenClaw Gateway 死活監視スクリプト
# Place in ~/.openclaw/healthcheck.sh
# crontab例: */5 * * * * ~/.openclaw/healthcheck.sh

LOG_FILE="$HOME/.openclaw/healthcheck.log"
MAX_LOG_LINES=1000
STATE_FILE="/tmp/openclaw-healthcheck-state"

# ログローテーション（1000行超えたら古い行を削除）
if [ -f "$LOG_FILE" ]; then
  lines=$(wc -l < "$LOG_FILE")
  if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
    tail -n 500 "$LOG_FILE" > "${LOG_FILE}.tmp" && mv "${LOG_FILE}.tmp" "$LOG_FILE"
  fi
fi

# ゲートウェイの状態確認（systemdサービス）
status=$(systemctl --user is-active openclaw-gateway 2>/dev/null)

if [ "$status" = "active" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK ($status)" >> "$LOG_FILE"
  rm -f "$STATE_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Gateway down ($status). Restarting..." >> "$LOG_FILE"
  systemctl --user restart openclaw-gateway
  sleep 5
  new_status=$(systemctl --user is-active openclaw-gateway 2>/dev/null)
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restart result: $new_status" >> "$LOG_FILE"
fi
