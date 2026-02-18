# Ollama セットアップメモ

## 目的
Gemini API（無料枠制限で1日3回程度しかツイートできない）→ Ollama（ローカルLLM、制限なし）に切り替え

## 環境
- RPi5 8GB
- OpenClaw でエージェント管理
- X API Free Tier（月500ポスト）

## 実施済み手順（2026-02-17 完了）

### 1. Ollamaインストール
```bash
curl -fsSL https://ollama.com/install.sh | sh
# → Ollama 0.16.2 インストール済み（systemdサービスとして起動中）
```

### 2. モデルDL
```bash
ollama pull gemma3:4b
# → gemma3:4b (3.3GB) ダウンロード済み
```

### 3. OpenClawにOllama設定
```bash
# ~/.openclaw/.env に追記
OLLAMA_API_KEY=ollama

# モデル変更（config.yamlではなくopenclaw.jsonで管理されている）
openclaw models set ollama/gemma3:4b
```

### 4. 確認
```bash
ollama list  # gemma3:4b 確認済み
# ゲートウェイログで agent model: ollama/gemma3:4b 確認済み
```

## ⚠️ 実際の構成メモ（想定と違った点）
- `~/raspi-baseball-bot/` はRPiには存在しない（Windowsのリポジトリパス）
- OpenClawの設定は `~/.openclaw/` 配下で管理
- LLMモデル設定は `config.yaml` の `llm:` セクションではなく `openclaw.json` で管理
- モデル変更コマンドは `openclaw models set ollama/gemma3:4b`

## 既知の無関係なエラー
- Brave Search API で `search_lang: "ja"` が無効エラー → 今回の変更前からある既存問題、無視でOK

## 完了後にやること
1. **GitHubのREADME更新**: LLMがGemini→Ollamaに変わったことを反映 ← **次回やる**
2. **Bluesky対応**（将来）: アカウント作成 → `@atproto/api` で投稿スキル追加
   - Ollama + Bluesky = コスト0・制限なし の無敵構成
