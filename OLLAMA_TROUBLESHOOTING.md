# OpenClaw + Ollama on Raspberry Pi 5 — 罠と解決策まとめ

> 最終更新: 2026-02-18
> 環境: Raspberry Pi 5 8GB / Ollama 0.16.2 / OpenClaw 2026.2.15 / llama3.2-bot:3b

Gemini APIの無料枠制限を回避するためにOllamaへ移行する中で踏んだ罠と、その解決策をまとめます。
同じ構成を試す方の参考になれば。

---

## 罠1: OpenClawのOllamaコンテキストウィンドウが128Kにハードコードされている

### 症状
```
Error: model requires more system memory (15.5 GiB) than is available (6.0 GiB)
```

### 原因
OpenClawのdistコードに `OLLAMA_DEFAULT_CONTEXT_WINDOW = 128e3`（128,000トークン）がハードコードされている。
Ollamaがモデルメタデータ（`llama.context_length`）を返しても、この定数を優先して使う。
128Kトークン分のKVキャッシュを確保しようとするとRPi5の8GBメモリでは当然OOM。

### 解決策
OpenClawのdistファイルを直接パッチする（`openclaw update`で上書きされるので再適用が必要）:

```bash
# contextWindow: 128K → 8192
for f in \
  ~/openclaw/dist/plugin-sdk/model-selection-AqojAoRn.js \
  ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
  ~/openclaw/dist/model-selection-CJoUqb8d.js \
  ~/openclaw/dist/model-auth-CV_4hyfG.js \
  ~/openclaw/dist/model-selection-bvGotck9.js
do
  sed -i 's/OLLAMA_DEFAULT_CONTEXT_WINDOW = 128e3/OLLAMA_DEFAULT_CONTEXT_WINDOW = 8192/' "$f"
done
```

---

## 罠2: OpenClawの最低コンテキスト要件が16Kで弾かれる

### 症状
```
Error: Model context window too small (8192 tokens). Minimum is 16000.
```

### 原因
OpenClawには `CONTEXT_WINDOW_HARD_MIN_TOKENS = 16e3` という下限チェックがある。
8192に下げると「小さすぎる」とエラーになる。

### 解決策
```bash
# HARD_MIN: 16K → 6144（または8192）
for f in \
  ~/openclaw/dist/plugin-sdk/reply-CWOwz-a_.js \
  ~/openclaw/dist/pi-embedded-Dk6f-sJC.js \
  ~/openclaw/dist/pi-embedded-BfTG8NvM.js \
  ~/openclaw/dist/reply-CCS1zuBM.js \
  ~/openclaw/dist/subagent-registry-8P-93r_3.js
do
  sed -i 's/CONTEXT_WINDOW_HARD_MIN_TOKENS = 16e3/CONTEXT_WINDOW_HARD_MIN_TOKENS = 6144/' "$f"
done
```

---

## 罠3: プロンプトがでかすぎてOllamaがtruncateする

### 症状
Ollamaのログに:
```
truncating input prompt limit=8192 prompt=9408
```

### 原因
OpenClawのエージェントには大量のツール定義（`read`, `edit`, `write`, `browser`など全17種類）が
システムプロンプトとして含まれる。これだけで17K文字以上。RPi5でのOllamaには重すぎる。

### 解決策
不要なツールをすべて無効化し、必要最小限（`exec`のみ）にする:

```bash
openclaw config set tools.deny '["read","edit","write","process","browser","canvas","nodes","message","tts","gateway","agents_list","sessions_list","sessions_history","sessions_send","sessions_spawn","subagents","session_status","web_search","web_fetch","memory_search","memory_get","cron"]' --json
```

また、ワークスペースファイルも削減する:
- `AGENTS.md`: 7,869文字 → 493文字に要約
- `SOUL.md`: 4,685文字 → 1,462文字に要約

---

## 罠4: `OLLAMA_LOAD_TIMEOUT=0` は「無制限」ではなく「デフォルト5分」になる

### 症状
```
# Ollamaログ
| 500 | 5m0s | POST "/api/chat"  ← ちょうど5分でタイムアウト
```

### 原因
`OLLAMA_LOAD_TIMEOUT=0` を設定すると、Ollamaの内部実装では
「0以下 → デフォルト値（5分）を使用」という挙動になる。
「0 = 無制限」と思って設定すると逆効果。

### 解決策
明示的な値（30分以上）を設定する:

```bash
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_LOAD_TIMEOUT=30m"
Environment="OLLAMA_DEBUG=1"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama
```

`KEEP_ALIVE=24h` でモデルをメモリに常駐させ、毎回のロード時間（1〜2秒）も節約できる。

---

## 罠5: `stream: true`（デフォルト）でOllamaのprompt eval中に接続タイムアウト

### 症状
stream:trueでOllamaにリクエストを送ると、prompt eval中はトークンが一切送信されない。
5分間無通信でGINサーバー（Ollamaの内部HTTPサーバー）が接続タイムアウト → HTTP 500。

### 計測した速度
```
短いプロンプト (30 tokens):   18.8 t/s
長いプロンプト (2841 tokens):  4.1 t/s  ← KVキャッシュ増加でメモリ帯域幅が律速
```
3814トークンのプロンプト × 4.1 t/s = 約15分。5分でタイムアウトするのは必然。

### 解決策
OpenClawのOllamaリクエストを `stream: false` に変更するdistパッチ:

```bash
# stream: true → false に変更（4ファイル）
for f in \
  ~/openclaw/dist/model-selection-CJoUqb8d.js \
  ~/openclaw/dist/model-auth-CV_4hyfG.js \
  ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
  ~/openclaw/dist/model-selection-bvGotck9.js
do
  sed -i 's/stream: true,/stream: false,/' "$f"
done
```

stream: false に変更した後、レスポンスのパース部分（NDJSONストリーム → 単一JSON）も
変更が必要。詳細は `OLLAMA_MIGRATION_WIP.md` のパッチワンライナー参照。

---

## 罠6: OpenClawのエージェントタイムアウトが10分（デフォルト）で短すぎる

### 症状
`fetch failed` や `This operation was aborted` でcronジョブが失敗する。

### 原因
OpenClawの embedded run timeout は `DEFAULT_AGENT_TIMEOUT_SECONDS = 600`（10分）。
Ollamaの処理が10分以上かかると、OpenClaw側が強制終了する。

### 解決策
`openclaw.json` で設定を延長する（distパッチ不要）:

```bash
openclaw config set agents.defaults.timeoutSeconds 3600
```

これで1時間まで待てるようになる。

---

## 罠7: OpenClawのスワップ不足でOllamaがOOM Killされる

### 症状
```
Error: model requires more system memory (X GiB) than is available (6.0 GiB)
```

または突然Ollamaが死ぬ。

### 解決策
RPi5のデフォルトスワップは200MBで小さすぎる。2GBに拡張:

```bash
sudo sed -i 's/CONF_SWAPSIZE=200/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
sudo dphys-swapfile swapoff && sudo dphys-swapfile setup && sudo dphys-swapfile swapon
free -h  # 確認
```

---

## 最終的な動作設定まとめ

### Ollama設定 (`/etc/systemd/system/ollama.service.d/override.conf`)
```ini
[Service]
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_LOAD_TIMEOUT=30m"
Environment="OLLAMA_DEBUG=1"
```

### openclaw.json
```json
{
  "agents": {
    "defaults": {
      "timeoutSeconds": 3600
    }
  },
  "tools": {
    "deny": ["read","edit","write","process","browser","canvas","nodes","message",
             "tts","gateway","agents_list","sessions_list","sessions_history",
             "sessions_send","sessions_spawn","subagents","session_status",
             "web_search","web_fetch","memory_search","memory_get","cron"]
  }
}
```

### distパッチ（`openclaw update` 後に再適用）
```bash
# 1. contextWindow 128K → 8192
for f in ~/openclaw/dist/plugin-sdk/model-selection-AqojAoRn.js \
         ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
         ~/openclaw/dist/model-selection-CJoUqb8d.js \
         ~/openclaw/dist/model-auth-CV_4hyfG.js \
         ~/openclaw/dist/model-selection-bvGotck9.js; do
  sed -i 's/OLLAMA_DEFAULT_CONTEXT_WINDOW = 128e3/OLLAMA_DEFAULT_CONTEXT_WINDOW = 8192/' "$f"
done

# 2. HARD_MIN 16K → 6144
for f in ~/openclaw/dist/plugin-sdk/reply-CWOwz-a_.js \
         ~/openclaw/dist/pi-embedded-Dk6f-sJC.js \
         ~/openclaw/dist/pi-embedded-BfTG8NvM.js \
         ~/openclaw/dist/reply-CCS1zuBM.js \
         ~/openclaw/dist/subagent-registry-8P-93r_3.js; do
  sed -i 's/CONTEXT_WINDOW_HARD_MIN_TOKENS = 16e3/CONTEXT_WINDOW_HARD_MIN_TOKENS = 6144/' "$f"
done

# 3. stream: true → false
for f in ~/openclaw/dist/model-selection-CJoUqb8d.js \
         ~/openclaw/dist/model-auth-CV_4hyfG.js \
         ~/openclaw/dist/auth-profiles-BT9SuY8t.js \
         ~/openclaw/dist/model-selection-bvGotck9.js; do
  sed -i 's/stream: true,/stream: false,/' "$f"
done
```

---

## 現在の成功率（2026-02-18時点）

| 状況 | 結果 |
|------|------|
| パッチ前 | cronジョブほぼ全滅（OOM or タイムアウト） |
| contextWindow + tools.deny適用後 | truncate解消、fetch failed継続 |
| stream:false + timeoutSeconds:3600 | 大幅改善（11/13件が成功）|
| + OLLAMA_LOAD_TIMEOUT=30m | 検証中（5分超のリクエストへの効果待ち） |

応答時間は2〜5分程度。たまに5分を少し超えてタイムアウトするケースが残っており、
引き続き調査中。
