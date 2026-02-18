# Ollama セットアップメモ

> **⚠️ 注意: このプロジェクトではOllamaからGemini APIに移行しました。**
> 詳細は [README.md](README.md) のOllamaセクションを参照。

## 目的（当初）
Gemini API（無料枠制限で1日3〜5回程度しかツイートできない）→ Ollama（ローカルLLM、制限なし）に切り替え

## 環境
- RPi5 8GB
- Ollama 0.16.2
- OpenClaw 2026.2.15
- モデル: llama3.2-bot:3b（llama3.2:3bベースのカスタムモデル）※当初はgemma3:4bだったが変更
- X API Free Tier（月500ポスト）

---

## セットアップ手順

### 1. Ollamaインストール
```bash
curl -fsSL https://ollama.com/install.sh | sh
# → Ollama 0.16.2 インストール済み（systemdサービスとして起動中）
systemctl is-active ollama  # active を確認
```

### 2. モデルダウンロード
```bash
# ベースモデルのダウンロード（3Bクラスが現実的）
ollama pull llama3.2:3b

# キャラクター設定をModelfileで上書きしてカスタムモデルを作成
ollama create llama3.2-bot:3b -f /path/to/Modelfile
```

> **モデル選定メモ**: llama3.2:3bはRPi5 8GBで動くが重め（4.1 t/s）。
> 日本語精度が高い **Qwen2.5:1.5b**（9.97 t/s）への乗り換えを検討中。

### 3. Ollamaのsystemd設定（重要・デフォルトでは動かない）

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_LOAD_TIMEOUT=30m"
Environment="OLLAMA_DEBUG=1"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

**各設定の意味:**
- `OLLAMA_KEEP_ALIVE=24h`: モデルをメモリに24時間常駐（cronジョブのたびにロードすると遅い）
- `OLLAMA_NUM_PARALLEL=1`: 並列リクエスト数を1に制限（RPi5はメモリが限られるため）
- `OLLAMA_LOAD_TIMEOUT=30m`: **⚠️ 0にすると「デフォルト5分」になる罠に注意！** 明示的な値を設定する
- `OLLAMA_DEBUG=1`: ログにトークン速度などを出力（トラブルシューティング用）

### 4. スワップ拡張

RPi5のデフォルト200MBでは不足。2GBに拡張:

```bash
sudo sed -i 's/CONF_SWAPSIZE=200/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile swapoff && sudo dphys-swapfile setup && sudo dphys-swapfile swapon
free -h  # 確認（Swap: 2.0Gi になっていればOK）
```

### 5. OpenClawにOllamaを設定

```bash
# .envにOllama用のダミーAPIキーを追加
echo 'OLLAMA_API_KEY=ollama' >> ~/.openclaw/.env

# モデルを切り替え
openclaw models set ollama/llama3.2-bot:3b

# エージェントタイムアウトを延長（デフォルト10分では短すぎる）
openclaw config set agents.defaults.timeoutSeconds 3600

# 不要なツールをすべて無効化（システムプロンプトを軽くするため）
openclaw config set tools.deny '["read","edit","write","process","browser","canvas","nodes","message","tts","gateway","agents_list","sessions_list","sessions_history","sessions_send","sessions_spawn","subagents","session_status","web_search","web_fetch","memory_search","memory_get","cron"]' --json
```

### 6. OpenClawのdistパッチ（必須）

OpenClawはOllamaのcontextWindowを128K固定でハードコードしている。RPi5には大きすぎるため修正が必要。

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

# stream: true → false（prompt eval中の5分idle timeoutを回避）
for f in \
  ~/openclaw/dist/model-selection-CJoUqb8d.js \
  ~/openclaw/dist/model-auth-CV_4hyfG.js \
  ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
  ~/openclaw/dist/model-selection-bvGotck9.js; do
  sed -i 's/stream: true,/stream: false,/' "$f"
done
```

> ⚠️ `openclaw update` を実行するとこれらのパッチが上書きされる。更新後は再適用が必要。

### 7. 動作確認

```bash
# Ollamaに直接リクエストして応答を確認（cronに近い条件で）
curl -s http://127.0.0.1:11434/api/chat \
  -d '{"model":"llama3.2-bot:3b","messages":[{"role":"user","content":"今日の野球について一言"}],"stream":false,"options":{"num_ctx":8192}}'

# cronジョブを手動実行
openclaw cron run <job-id> --timeout 600000

# Ollamaのログを確認
journalctl -u ollama --since "5 min ago" --no-pager | grep "api/chat"
```

成功すると `| 200 | Xm Xs | POST "/api/chat"` が出る。応答は2〜5分程度かかる。

---

## ⚠️ 既知の問題と回避策

詳細は [OLLAMA_TROUBLESHOOTING.md](./OLLAMA_TROUBLESHOOTING.md) を参照。

| 問題 | 原因 | 解決策 |
|------|------|--------|
| OOM（15GB必要と言われる） | contextWindowが128K固定 | distパッチで8192に |
| `context window too small` | HARD_MINが16K | distパッチで6144に |
| `truncating input prompt` | ツール定義が17K文字 | tools.denyで不要ツールを無効化 |
| `fetch failed` / タイムアウト | 複数の原因が重なる | 上記パッチ + 設定変更 |
| `OLLAMA_LOAD_TIMEOUT=0` が逆効果 | 0 → デフォルト5分 | 明示的に `30m` 等を指定 |

---

## ⚠️ 実際の構成メモ（想定と違った点）
- OpenClawの設定は `~/.openclaw/` 配下で管理
- LLMモデル設定は `config.yaml` の `llm:` セクションではなく `openclaw.json` で管理
- cronジョブは `openclaw cron` コマンドで管理（config.yamlのheartbeat.schedulesは自動反映されない）
- Brave Search API で `search_lang: "ja"` が無効エラー → 既存問題、無視でOK

---

## 今後の改善候補

- **モデル変更**: llama3.2:3b → Qwen2.5:1.5b（日本語精度高い、速度約2倍）
- **openclaw update 後のパッチ自動化**: post-updateフックを設ける
- **Bluesky対応**（将来）: `@atproto/api` で投稿スキル追加（Ollama + Bluesky = コスト0・制限なし）
