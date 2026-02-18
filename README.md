# ラズパイ × OpenClaw 野球情報自動ツイートbot

## 概要
Raspberry Pi 5 + OpenClaw + Ollama（ローカルLLM）で、NPB/MLBの野球情報を自動ツイートするbotの構築手順。

LLMをローカルで動かすため **API制限なし・完全無料** で運用可能。

Windows版Claude Code DesktopのSSHバグ（/usr/bin/ssh ハードコード問題）の回避策として、PowerShell → SSH → Claude Code CLIの構成を採用。

## 対応環境
この手順はRaspberry Pi向けですが、Node.js 22 + 4GB RAM以上のLinux環境なら応用可能です：
- Oracle Cloud無料枠（4コア24GB RAM、完全無料）
- ConoHa / さくらVPS等の国内VPS
- AWS / GCP無料枠
- 古いPC / ノートPC（Ubuntu等をインストール）

## 背景
- Claude Code DesktopのWindows SSH接続は2026年2月時点でバグあり（[Issue #25659](https://github.com/anthropics/claude-code/issues/25659)）
- 回避策：PowerShellからSSHでラズパイに入り、ラズパイ上でClaude Code CLIを直接使用

## 必要なもの
### ハードウェア
- Raspberry Pi 5（**8GB推奨**、Ollamaモデル動作に必要）
- microSD 32GB以上 or NVMe SSD
- USB-C電源（27W推奨）
- ヒートシンク/ファン付きケース

### アカウント・APIキー
- X (Twitter) Developer → Free Tier APIキー（月500ポスト、無料）
- Gemini APIキーは不要（Ollamaで代替）

## セットアップ手順

### 1. ラズパイ初期設定
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Windows PCからSSH接続
```powershell
# SSH鍵生成
ssh-keygen -t ed25519

# 公開鍵をラズパイに送る
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh ユーザー名@ラズパイIP "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"

# 接続
ssh ユーザー名@ラズパイIP
```

### 3. Claude Code CLIインストール（ラズパイ上）
```bash
sudo npm install -g @anthropic-ai/claude-code
claude  # 初回は認証URLをPCブラウザで開く
```

### 4. Ollamaインストール（ラズパイ上）
```bash
curl -fsSL https://ollama.com/install.sh | sh
# → systemdサービスとして自動起動

# スワップを2GBに拡張（デフォルト200MBでは不足）
sudo sed -i 's/CONF_SWAPSIZE=200/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile swapoff && sudo dphys-swapfile setup && sudo dphys-swapfile swapon

# systemd設定（モデル常駐・タイムアウト延長）
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_LOAD_TIMEOUT=30m"
Environment="OLLAMA_DEBUG=1"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama

# ベースモデルダウンロード（約2GB）
ollama pull llama3.2:3b

# Modelfileでbot用カスタムモデルを作成
ollama create llama3.2-bot:3b -f /path/to/Modelfile

# 確認
ollama list
```

> 詳細な設定・トラブル対応は [OLLAMA_SETUP.md](./OLLAMA_SETUP.md) を参照。

### 5. OpenClawインストール
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard  # LLMプロバイダー設定
```

### 6. OpenClawにOllama設定
```bash
# .envにOllama用のダミーAPIキーを追加
echo 'OLLAMA_API_KEY=ollama' >> ~/.openclaw/.env

# モデル変更
openclaw models set ollama/llama3.2-bot:3b

# エージェントタイムアウトを延長（デフォルト10分では短すぎる）
openclaw config set agents.defaults.timeoutSeconds 3600

# 不要なツールをすべて無効化（システムプロンプトを軽くするため）
openclaw config set tools.deny '["read","edit","write","process","browser","canvas","nodes","message","tts","gateway","agents_list","sessions_list","sessions_history","sessions_send","sessions_spawn","subagents","session_status","web_search","web_fetch","memory_search","memory_get","cron"]' --json
```

### 7. OpenClawのdistパッチ（必須）
OpenClawはOllamaのcontextWindowを128K固定でハードコードしており、RPi5では動作しない。
**インストール・アップデートのたびに以下のパッチを再適用する。**

```bash
# contextWindow: 128K → 8192
for f in \
  ~/openclaw/dist/plugin-sdk/model-selection-AqojAoRn.js \
  ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
  ~/openclaw/dist/model-selection-CJoUqb8d.js \
  ~/openclaw/dist/model-auth-CV_4hyfG.js \
  ~/openclaw/dist/model-selection-bvGotck9.js; do
  sed -i 's/OLLAMA_DEFAULT_CONTEXT_WINDOW = 128e3/OLLAMA_DEFAULT_CONTEXT_WINDOW = 8192/' "$f"
done

# HARD_MIN: 16K → 6144
for f in \
  ~/openclaw/dist/plugin-sdk/reply-CWOwz-a_.js \
  ~/openclaw/dist/pi-embedded-Dk6f-sJC.js \
  ~/openclaw/dist/pi-embedded-BfTG8NvM.js \
  ~/openclaw/dist/reply-CCS1zuBM.js \
  ~/openclaw/dist/subagent-registry-8P-93r_3.js; do
  sed -i 's/CONTEXT_WINDOW_HARD_MIN_TOKENS = 16e3/CONTEXT_WINDOW_HARD_MIN_TOKENS = 6144/' "$f"
done

# stream: true → false（prompt eval中のタイムアウトを回避）
for f in \
  ~/openclaw/dist/model-selection-CJoUqb8d.js \
  ~/openclaw/dist/model-auth-CV_4hyfG.js \
  ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
  ~/openclaw/dist/model-selection-bvGotck9.js; do
  sed -i 's/stream: true,/stream: false,/' "$f"
done
```

### 8. 設定ファイル
- SOUL.md → エージェントの人格定義
- config.yaml → Heartbeatスケジュール（参考用）
- .env → APIキー（※リポジトリに含めない）

### 9. セキュリティ対策
- UFWファイアウォール有効化（SSH以外拒否）
- ゲートウェイはlocalhost限定
- ClawHubからスキルをインストールしない
- .envのパーミッション600

## スマホからの遠隔操作（Tailscale + Termius）
外出先からAndroidスマホでbotを操作できます。

```bash
# ラズパイにTailscaleをインストール
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# キー期限切れ時の再認証
sudo tailscale up --reset  # 表示されたURLをブラウザで開く
```

AndroidアプリはTailscale + Terminusを使用。TerminusでラズパイのTailscale IPにSSH接続。

## ファイル構成
```
~/.openclaw/
├── SOUL.md                  # bot人格定義
├── config.yaml              # Heartbeatスケジュール（参考用）
├── openclaw.json            # モデル設定（実際の設定ファイル）
├── .env                     # APIキー（git管理外）
├── healthcheck.sh           # 死活監視
└── skills/
    ├── twitter-post/
    │   └── tweet.js         # ツイート投稿
    └── twitter-cleanup/
        └── cleanup.js       # 古ツイート削除

このリポジトリ:
├── OLLAMA_SETUP.md          # Ollama/OpenClawセットアップ詳細メモ
├── OLLAMA_TROUBLESHOOTING.md  # 罠と解決策まとめ（7項目）
├── SOUL.md.example          # bot人格定義サンプル
├── config.yaml.example      # スケジュール設定サンプル
└── healthcheck.sh           # 死活監視スクリプト
```

## 自動ツイートスケジュール
| 時刻 | 内容 |
|------|------|
| 7:30 | 野球豆知識 |
| 8:00 | MLB結果（日本人選手中心） |
| 12:00/18:00 | トレード・移籍情報 |
| 22:00 | NPB試合結果 |
| 月曜9:00 | 週間スタッツ分析 |
| 深夜3:00 | 古ツイート・いいね掃除 |

## コスト
| 項目 | 費用 |
|------|------|
| Ollama (llama3.2-bot:3b) | **完全無料・制限なし** |
| X API Free Tier | 月500ポスト無料 |
| ラズパイ電気代 | 月約300円 |

## Windows Claude Desktop SSHバグ回避メモ
```powershell
# バグ: /usr/bin/ssh ハードコード問題
# 回避策1: C:\usr\bin\ssh.exe にコピー（ENOENTは解消するがhost deniedが残る）
New-Item -ItemType Directory -Path "C:\usr\bin" -Force
Copy-Item "C:\Windows\System32\OpenSSH\ssh.exe" -Destination "C:\usr\bin\ssh.exe"

# 回避策2（採用）: PowerShellからSSH → ラズパイ上でClaude Code CLI
ssh ユーザー名@ラズパイIP
claude
```

## 注意事項
- BOOTSTRAP.mdが残っているとbootstrapping状態で止まる
- X Free Tierは月500ポスト上限（1日16ツイート目安）
- botアカウントはプロフィールにbot明記必須
- `config.yaml` の `heartbeat.schedules` はOpenClawのcronシステムに自動反映されません。スケジュールは `~/.openclaw/cron/jobs.json` に別途登録が必要です。
- モデル設定は `config.yaml` の `llm:` セクションではなく `openclaw.json` で管理（`openclaw models set` コマンドで変更）
- Brave Search APIで `search_lang: "ja"` が無効エラーが出るが既知の問題、動作に支障なし
- **`openclaw update` を実行するとdistパッチが上書きされる。** 更新後は手順7のパッチを再適用する
- `OLLAMA_LOAD_TIMEOUT=0` は「無制限」ではなく「デフォルト5分」になる罠に注意。明示的な値を指定する
- 応答は2〜5分程度かかる。タイムアウトが続く場合は [OLLAMA_TROUBLESHOOTING.md](./OLLAMA_TROUBLESHOOTING.md) を参照

## 参考
- [OLLAMA_SETUP.md](./OLLAMA_SETUP.md) — Ollama/OpenClawセットアップ詳細
- [OLLAMA_TROUBLESHOOTING.md](./OLLAMA_TROUBLESHOOTING.md) — 罠と解決策まとめ
- [OpenClaw公式](https://docs.openclaw.ai/)
- [Claude Code Desktop SSH Issue #25659](https://github.com/anthropics/claude-code/issues/25659)
- [OpenClawセキュリティ警告（Qiita）](https://qiita.com/emi_ndk/)
