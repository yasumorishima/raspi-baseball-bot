# OpenClaw入門：ラズパイ × Geminiで自動ツイートbot

> **導入編 — サンドボックス環境としてのRaspberry Piでの実験記録**

## はじめに

「AIに野球の最新情報を拾わせて、勝手にツイートさせたい」

そう思い立って、Raspberry Pi 5 + OpenClaw + Gemini API（無料枠）で野球情報自動ツイートbotを作りました。**ランニングコスト0円**（電気代除く）です。

世の中のAI bot構築記事を見ると、だいたいこんな構成が多いです：

- **ChatGPT API** → 従量課金（安くても月$5〜）
- **Claude API** → 従量課金
- **AWS Lambda + DynamoDB** → 無料枠を超えると課金
- **Heroku / Railway** → 無料プランは廃止 or 制限厳しい

「いや、もっと気軽に試したいんだけど…」という人向けに、**完全無料で動く構成**を紹介します。ラズパイが家に転がっていれば、今日から始められます。

## 完成形

こんなツイートが1日13回、全自動で投稿されます：

> 3月5日からWBC2026開幕だって！もうすぐじゃん、待ちきれない！あの興奮、まるで地球の核が沸騰する前の静けさよ。⚾

キャラは「野球好きのちょっとクセのあるおじさん」。クオリティはご覧の通りですが、一応動いています。

## 構成と費用

```
[cronスケジュール] → [OpenClaw Gateway] → [Gemini 2.5 Flash API]
                                                 ↓
                                           web_searchで最新情報取得
                                                 ↓
                                           ツイート作文（140字）
                                                 ↓
                                     [tweet.js] → Twitter API
```

| 項目 | 費用 | 備考 |
|------|------|------|
| Raspberry Pi 5 | 初期費用のみ | 4GB版でOK（8GBは不要） |
| Gemini 2.5 Flash | **無料** | 15 RPM / 1500 RPD の無料枠 |
| X (Twitter) API | **無料** | Free Tier: 月500ポスト |
| OpenClaw | **無料** | OSSのAIエージェントフレームワーク |
| 電気代 | 月約300円 | Pi 5の消費電力は最大27W |

**月額ランニングコスト: 約300円（電気代のみ）**

## なぜラズパイなのか

「VPSでよくない？」と思うかもしれませんが、ラズパイを選んだ理由があります：

1. **サンドボックス環境として最適** — AIにシェルコマンドを実行させるので、メインPCとは完全に隔離したい。壊れても最悪SDカードを焼き直せばいい
2. **常時起動が前提** — VPSの無料枠は時間制限があったり突然停止したりする。ラズパイは電源入れっぱなしにするだけ
3. **学習コストが低い** — SSH接続してコマンド打つだけ。Kubernetes も Docker も AWS も不要
4. **初期費用で完結** — 月額課金がないので「放置しても安心」

## 技術スタック

### OpenClaw とは

[OpenClaw](https://openclaw.ai/) はオープンソースのAIエージェントフレームワークです。雑に言うと：

- LLM（Gemini, Claude, Ollama等）のゲートウェイ
- cronジョブでスケジュール実行ができる
- `exec` ツールでシェルコマンドを実行できる（AIが自分でスクリプトを叩ける）
- `web_search` で最新情報を検索できる（Brave Search APIキーが必要になる場合があります）
- Discord, Slack, Telegram等との連携も可能

今回は **cron → Gemini → web_search → exec（tweet.js）** という流れで使っています。

### Gemini 2.5 Flash 無料枠

Google AI Studioで発行できるAPIキーで、Gemini 2.5 Flashが無料で使えます。

- **15 RPM**（1分あたり15リクエスト）
- **1500 RPD**（1日あたり1500リクエスト）

1日13回のcronジョブなら余裕です。ただし、同時に大量リクエストを送るとレート制限に引っかかるので、ジョブの間隔は1時間以上空けています。

### Twitter API Free Tier

月500ポスト上限ですが、1日13ツイート × 30日 = 390ポストなので十分。書き込み専用（タイムライン読み取り不可）ですが、botには十分です。

## セットアップ手順（ざっくり）

詳細な手順は[リポジトリのREADME](README.md)にまとめてありますが、流れだけ紹介します。

### 1. ラズパイにOpenClawをインストール

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
openclaw onboard  # Gemini APIキーを入力
```

### 2. ツイート投稿スクリプトを配置

`tweet.js` は30行程度のシンプルなNode.jsスクリプトです。引数で受け取ったテキストをTwitter APIで投稿するだけ。

```javascript
// 簡略版
const { TwitterApi } = require("twitter-api-v2");
const client = new TwitterApi({ /* OAuth 1.0a keys */ });
const text = process.argv.slice(2).join(" ");
await client.v2.tweet(text);
```

### 3. botの人格を定義（SOUL.md）

OpenClawではワークスペースの `SOUL.md` でエージェントのキャラクターを定義します。

```markdown
# 野球おじさん

## ツイートスタイル
- 居酒屋でつぶやくラフさ
- 140字以内
- 【絶対ルール】壮大で独創的なたとえを毎回1つ入れる
```

このファイルがあるだけで、Geminiがキャラを演じてツイートを書いてくれます。

### 4. cronジョブを登録

```bash
openclaw cron add \
  --cron "0 9 * * *" \
  --tz "Asia/Tokyo" \
  --name "WBC 09:00" \
  --system-event "WBCの最新情報を調べて140字以内でツイートして。"
```

これで毎日9時にGeminiが起動して、Web検索 → ツイート作文 → 投稿を全自動でやってくれます。

### 5. systemdで永続化

```bash
systemctl --user enable openclaw-gateway
systemctl --user start openclaw-gateway
```

ラズパイの電源を入れれば自動起動。SSHで入る必要すらありません。

## Ollamaで地獄を見た話（おまけ）

実は最初、**完全オフライン**を目指してOllama（ローカルLLM）で動かそうとしました。API制限もなく、プライバシーも完璧 — 理想的に聞こえますよね。

結論から言うと、**Raspberry Pi 5 + llama3.2:3b ではまともに動きませんでした**。

### 踏んだ罠の数々

1. **OpenClawがcontextWindowを128Kでハードコード** → 8GBのPi 5ではメモリ不足で即死。distファイルを直接パッチして8Kに変更
2. **CONTEXT_WINDOW_HARD_MIN が16K** → 8Kのcontextと矛盾してエラー。これもdistパッチ
3. **Tools schemaだけで17K文字** → ほとんどのツールを `tools.deny` で無効化
4. **OLLAMA_LOAD_TIMEOUT=0 が「無制限」ではなく「デフォルト5分」** → 罠すぎる
5. **stream:true だと5分の沈黙でGINサーバーがタイムアウト** → stream:false にパッチ
6. **prompt eval が 4.1 tokens/sec** → 3800トークンのプロンプト処理に15分。5分でHTTP 500
7. **スワップが200MBしかない** → 2GBに拡張

これらを全部解決しても、**llama3.2:3bのtool calling精度が壊滅的**でした：

- `exec` の `env` 引数に文字列 `"{}"` を渡す（objectじゃないのでバリデーションエラー）
- コマンドのパスを間違える（`twitter-post/tweet.js` → ファイルが見つからない）
- ツールをテキストとして出力する（function callにならない）
- cronのプロンプト文をそのままツイート本文として渡す（作文していない）
- 阪神タイガースの情報を聞いたのに英語で「Let's go Orix!」と回答（チーム名すら違う）

**2日間の格闘の末、Geminiに切り替えたら18秒でツイートが投稿されました。** 世の中には、こだわりを捨てるべきときもある。

詳細なトラブルシューティングは [OLLAMA_TROUBLESHOOTING.md](OLLAMA_TROUBLESHOOTING.md) にまとめてあるので、同じ道を行く方の参考になれば幸いです。

## セキュリティについて

AIにシェルコマンドを実行させるので、セキュリティは重要です。ラズパイを**サンドボックス環境**として使うことで、リスクを最小限にしています。

- **専用機** — メインPCの情報は一切置かない
- **UFWファイアウォール** — SSH以外のincoming全拒否
- **ゲートウェイはlocalhost限定** — 外部からアクセス不可
- **ClawHubからスキルをインストールしない** — 自作スキルのみ使用
- **.envのパーミッション600** — APIキーは厳重管理
- **tools.deny設定** — AIが使えるツールを `exec` と `web_search` のみに制限

万が一AIが暴走しても、被害はラズパイ内で完結します。最悪SDカードを焼き直せばいい。これがサンドボックス環境の強みです。

## 今後やりたいこと

- **Discord連携** — OpenClawはDiscord botとしても動作するので、Discordから直接ツイート内容を確認・修正できるようにしたい
- **NPB/MLBシーズン対応** — 現在はWBC特化のプロンプト。シーズン開幕に合わせてチーム別のジョブに切り替える
- **ツイート品質の評価** — 投稿されたツイートのインプレッションを分析して、プロンプトを改善するフィードバックループ

## まとめ

| やったこと | 結果 |
|-----------|------|
| Ollama（ローカルLLM）で完全無料を目指す | 2日格闘して撃沈 |
| Gemini API（無料枠）に切り替え | 18秒で成功 |
| ランニングコスト | 月300円（電気代のみ） |
| 設定時間（Gemini構成） | 約1時間 |

「AIで何か自動化してみたい」と思ったとき、いきなりクラウドに課金する前に、まずラズパイで実験してみるのがおすすめです。壊れても痛くないし、うまくいったらそのまま本番環境として使える。

ソースコードは [GitHub](https://github.com/yasumorishima/raspi-baseball-bot) で公開しています。

---

*このbotは [@Ymori_Ymori](https://x.com/Ymori_Ymori) で稼働中です。*
