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
- Gemini APIキーは不要（Ollamaローカル推論で代替）

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
# systemdサービスとして自動起動

# モデルダウンロード（約2GB、時間かかる）
ollama pull llama3.2:3b

# 確認
ollama list
```

### 5. OpenClawインストール
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard  # LLMプロバイダー設定
```

### 6. OpenClawにOllama設定
```bash
# ~/.openclaw/.env に追記
echo 'OLLAMA_API_KEY=ollama' >> ~/.openclaw/.env

# モデル変更
openclaw models set ollama/llama3.2:3b
```

### 7. 設定ファイル
- SOUL.md → エージェントの人格定義
- config.yaml → Heartbeatスケジュール（参考用）
- .env → APIキー（※リポジトリに含めない）

### 8. セキュリティ対策
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
| Ollama (llama3.2:3b) | **完全無料・制限なし** |
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

### 基本
- BOOTSTRAP.mdが残っているとbootstrapping状態で止まる
- X Free Tierは月500ポスト上限（1日16ツイート目安）
- botアカウントはプロフィールにbot明記必須
- `config.yaml` の `heartbeat.schedules` はOpenClawのcronシステムに自動反映されません。スケジュールは `~/.openclaw/cron/jobs.json` に別途登録が必要です
- モデル設定は `config.yaml` の `llm:` セクションではなく `openclaw.json` で管理（`openclaw models set` コマンドで変更）
- Brave Search APIで `search_lang: "ja"` が無効エラーが出るが既知の問題、動作に支障なし

### モデル選定
- OpenClawの `web_search`/`exec` ツールを使うにはfunction calling対応モデルが必須
- `gemma3:4b` はツール非対応 → `llama3.2:3b`（2.0GB）を使用
- 日本語重視なら `qwen2.5:1.5b` も候補（推論速度: 約10 tokens/s）
- 4-bit量子化モデル（Q4_K_M）推奨。8GB RAMでのコンテキスト長は4096〜8192が安定域

### Ollama運用の罠
- `OLLAMA_KEEP_ALIVE=-1` でモデルをメモリ常駐させると再ロード不要になるが、他プロセスとのメモリ競合に注意
- `OLLAMA_LOAD_TIMEOUT` を十分に延長しないと、初回ロード中にサービスがタイムアウトで落ちる
- コンテキスト長を32768等に上げすぎるとKVキャッシュがRAMを食い尽くしOOM Killerが発動する

### 長期運用の罠
- microSDは書き込み寿命が短い。ログ・DB・モデルはNVMe SSD推奨
- Playwright（Chromium）プロセスのメモリリークに注意。数日でOOM発生の可能性あり → 定期rebootまたはプロセス強制終了を推奨
- `openclaw.json` の `agents.defaults.timeoutSeconds` を十分に長く設定（LLM推論が30秒〜1分かかる場合、短いタイムアウトで「沈黙のbot」になる）
- IPv6環境ではAPI接続時に名前解決で5〜8分ハングすることがある → `/etc/sysctl.conf` でIPv6無効化を検討
- アクティブクーラー必須。冷却不足で82°C超えるとサーマルスロットリング → 推論タイムアウトの連鎖障害

## 参考
- [OpenClaw公式](https://docs.openclaw.ai/)
- [Claude Code Desktop SSH Issue #25659](https://github.com/anthropics/claude-code/issues/25659)
- [OpenClawセキュリティ警告（Qiita）](https://qiita.com/emi_ndk/)
