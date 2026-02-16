# ラズパイ × OpenClaw 野球情報自動ツイートbot

## 概要
Raspberry Pi 5 + OpenClaw + Gemini 2.5-flash（無料枠）で、NPB/MLBの野球情報を自動ツイートするbotの構築手順。

Windows版Claude Code DesktopのSSHバグ（/usr/bin/ssh ハードコード問題）の回避策として、PowerShell → SSH → Claude Code CLIの構成を採用。

## 対応環境
この手順はRaspberry Pi向けですが、Node.js 22 + 2GB RAM以上のLinux環境なら応用可能です：
- Oracle Cloud無料枠（4コア24GB RAM、完全無料）
- ConoHa / さくらVPS等の国内VPS
- AWS / GCP無料枠
- 古いPC / ノートPC（Ubuntu等をインストール）

## 背景
- Claude Code DesktopのWindows SSH接続は2026年2月時点でバグあり（[Issue #25659](https://github.com/anthropics/claude-code/issues/25659)）
- 回避策：PowerShellからSSHでラズパイに入り、ラズパイ上でClaude Code CLIを直接使用

## 必要なもの
### ハードウェア
- Raspberry Pi 5（4GB以上、8GB推奨）
- microSD 32GB以上 or NVMe SSD
- USB-C電源（27W推奨）
- ヒートシンク/ファン付きケース

### アカウント・APIキー（すべて無料）
- Google AI Studio → Gemini APIキー
- X (Twitter) Developer → Free Tier APIキー（月500ポスト）

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

### 4. OpenClawインストール
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard  # LLMプロバイダー: Google Gemini
```

### 5. 設定ファイル
- SOUL.md → エージェントの人格定義
- config.yaml → Heartbeatスケジュール
- .env → APIキー（※リポジトリに含めない）

### 6. セキュリティ対策
- UFWファイアウォール有効化（SSH以外拒否）
- ゲートウェイはlocalhost限定
- ClawHubからスキルをインストールしない
- .envのパーミッション600

## ファイル構成
```
~/.openclaw/
├── SOUL.md                  # bot人格定義
├── config.yaml              # Heartbeatスケジュール
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
| Gemini 2.5-flash | 無料枠 |
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
- gemini-2.0-flash / gemini-3-pro-preview は無料枠クォータ0（2026-02-16確認）
- BOOTSTRAP.mdが残っているとbootstrapping状態で止まる
- X Free Tierは月500ポスト上限（1日16ツイート目安）
- botアカウントはプロフィールにbot明記必須
- `config.yaml` の `heartbeat.schedules` はOpenClawのcronシステムに自動反映されません。スケジュールは `~/.openclaw/cron/jobs.json` に別途登録が必要です。

## 参考
- [OpenClaw公式](https://docs.openclaw.ai/)
- [Claude Code Desktop SSH Issue #25659](https://github.com/anthropics/claude-code/issues/25659)
- [OpenClawセキュリティ警告（Qiita）](https://qiita.com/emi_ndk/)
