# ラズパイ × OpenClaw 野球情報自動ツイートbot

## 概要
Raspberry Pi 5 + OpenClaw + Gemini API（無料枠）で、野球情報を自動ツイートするbot。

cronジョブでスケジュール実行 → Geminiが最新ニュースをWeb検索 → 野球おじさんキャラでツイート作文 → 自動投稿、という流れ。

## 構成図
```
[cron schedule] → [OpenClaw Gateway] → [Gemini 2.5 Flash (API)]
                                              ↓
                                        web_search で最新情報取得
                                              ↓
                                        ツイート作文（140字・たとえ入り）
                                              ↓
                                    [exec: tweet.js] → Twitter API
```

## 必要なもの
### ハードウェア
- Raspberry Pi 5（4GB以上。Gemini API利用のため8GB不要）
- microSD 32GB以上 or NVMe SSD
- USB-C電源（27W推奨）
- ヒートシンク/ファン付きケース

### アカウント・APIキー
- X (Twitter) Developer → Free Tier（月500ポスト、無料）
- Google AI Studio → Gemini APIキー（無料枠: 15 RPM / 1500 RPD）

## セットアップ手順

### 1. ラズパイ初期設定
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. OpenClawインストール
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard  # Gemini APIキーを入力
```

### 3. 設定ファイル
```bash
# bot人格定義
cp SOUL.md.example ~/.openclaw/workspace/SOUL.md

# APIキー（.envに記載）
cat >> ~/.openclaw/.env << 'EOF'
TWITTER_API_KEY=xxx
TWITTER_API_SECRET=xxx
TWITTER_ACCESS_TOKEN=xxx
TWITTER_ACCESS_SECRET=xxx
EOF
chmod 600 ~/.openclaw/.env

# ツイート投稿スキル
mkdir -p ~/.openclaw/skills/twitter-post
cp skills/twitter-post/tweet.js ~/.openclaw/skills/twitter-post/
cd ~/.openclaw/skills/twitter-post && npm install twitter-api-v2 dotenv

# 古ツイート掃除スキル
mkdir -p ~/.openclaw/skills/twitter-cleanup
cp skills/twitter-cleanup/cleanup.js ~/.openclaw/skills/twitter-cleanup/
cd ~/.openclaw/skills/twitter-cleanup && npm install twitter-api-v2 dotenv
```

### 4. OpenClaw設定
```bash
# モデルをGemini 2.5 Flashに設定
openclaw config set agents.defaults.model.primary "google/gemini-2.5-flash"

# エージェントタイムアウトを延長（デフォルト10分→1時間）
openclaw config set agents.defaults.timeoutSeconds 3600

# 不要なツールを無効化（トークン節約＋安全性）
openclaw config set tools.deny '["read","edit","write","process","browser","canvas","nodes","message","tts","gateway","agents_list","sessions_list","sessions_history","sessions_send","sessions_spawn","subagents","session_status","memory_search","memory_get","cron"]' --json
```

### 5. cronジョブ登録
```bash
# 例: 毎日9時にWBC情報をツイート
openclaw cron add \
  --cron "0 9 * * *" \
  --tz "Asia/Tokyo" \
  --name "WBC 09:00" \
  --system-event "WBCの最新情報（試合結果・注目選手・大会の展開）を調べて140字以内でツイートして。"

# 一覧確認
openclaw cron list
```

**注意**: `config.yaml` の `heartbeat.schedules` はOpenClawに自動反映されません。`openclaw cron add` で登録してください。

### 6. セキュリティ対策
```bash
# UFWファイアウォール（SSH以外拒否）
sudo ufw allow ssh
sudo ufw enable

# .envのパーミッション
chmod 600 ~/.openclaw/.env
```
- ゲートウェイはlocalhost限定（`bind: loopback`）
- ClawHubからスキルをインストールしない（自作のみ）

### 7. systemdサービス化
```bash
# ~/.config/systemd/user/openclaw-gateway.service
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/openclaw-gateway.service << 'EOF'
[Unit]
Description=OpenClaw Gateway
After=network.target

[Service]
ExecStart=/usr/bin/openclaw gateway
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
EOF

systemctl --user enable openclaw-gateway
systemctl --user start openclaw-gateway
```

### 8. ヘルスチェック（オプション）
```bash
cp healthcheck.sh ~/.openclaw/healthcheck.sh
chmod +x ~/.openclaw/healthcheck.sh
crontab -e
# 追加: */5 * * * * ~/.openclaw/healthcheck.sh
```

## スマホからの遠隔操作（Tailscale + Termius）
```bash
# ラズパイにTailscaleをインストール
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
AndroidアプリはTailscale + Terminusを使用。TerminusでラズパイのTailscale IPにSSH接続。

## ファイル構成
```
~/.openclaw/
├── workspace/
│   ├── SOUL.md              # bot人格定義
│   ├── AGENTS.md            # エージェント動作指示
│   └── TOOLS.md             # ツール使い方メモ
├── openclaw.json            # モデル設定
├── config.yaml              # Heartbeat設定
├── .env                     # APIキー（git管理外）
├── healthcheck.sh           # 死活監視
├── cron/
│   └── jobs.json            # cronジョブ定義
└── skills/
    ├── twitter-post/
    │   └── tweet.js         # ツイート投稿
    └── twitter-cleanup/
        └── cleanup.js       # 古ツイート削除
```

## コスト
| 項目 | 費用 |
|------|------|
| Gemini 2.5 Flash 無料枠 | **無料**（15 RPM / 1500 RPD） |
| X API Free Tier | 月500ポスト無料 |
| ラズパイ電気代 | 月約300円 |

## Ollamaローカル実行について
当初Ollama（llama3.2:3b）でのローカル実行を試みましたが、以下の理由でGeminiに移行しました：
- **速度**: prompt eval が 4.1 t/s しか出ず、1リクエストに3〜15分かかる
- **タイムアウト**: Ollama内部の5分タイムアウト（GIN HTTPサーバー）で頻繁にHTTP 500
- **品質**: tool calling の精度が低く（引数の型エラー、パス間違い）、日本語ツイート作文もできない
- 詳細は [OLLAMA_TROUBLESHOOTING.md](OLLAMA_TROUBLESHOOTING.md) を参照

Gemini無料枠は13ジョブ/日 × 30日 = 390ツイート < 月500上限で十分収まります。

## 注意事項
- X Free Tierは月500ポスト上限（1日16ツイート目安）
- botアカウントはプロフィールにbot明記必須
- モデル設定は `openclaw.json` で管理（`openclaw config set` コマンドで変更）
- cronジョブの `--system-event` 内容がそのままエージェントへの指示になる

## 参考
- [OpenClaw公式](https://docs.openclaw.ai/)
- [Google AI Studio](https://aistudio.google.com/)
- [X API ドキュメント](https://developer.x.com/en/docs)
