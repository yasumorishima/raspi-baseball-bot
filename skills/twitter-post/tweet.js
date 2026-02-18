// tweet.js - OpenClaw skill for posting tweets
// Place in ~/.openclaw/skills/twitter-post/tweet.js
//
// Usage:
//   echo "ツイート内容" | node tweet.js
//   node tweet.js "ツイート内容"

const { TwitterApi } = require("twitter-api-v2");

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", reject);
    // 100ms待ってstdinにデータがなければargvにフォールバック
    setTimeout(() => {
      if (!data) {
        process.stdin.destroy();
        resolve(null);
      }
    }, 100);
  });
}

(async () => {
  // stdin優先、なければargvを全結合（スペース分割対策）
  let text = await readStdin();
  if (!text) {
    text = process.argv.slice(2).join(" ");
  }

  if (!text) {
    console.error("Usage: echo 'text' | node tweet.js  OR  node tweet.js 'text'");
    process.exit(1);
  }

  if (text.length > 280) {
    console.error(`Error: Tweet exceeds 280 characters (${text.length})`);
    process.exit(1);
  }

  try {
    const result = await client.v2.tweet(text);
    console.log("Tweet posted:", result.data.id);
  } catch (err) {
    console.error("Error posting tweet:", err.code || err.statusCode || "unknown");
    console.error("Message:", err.message);
    if (err.data) {
      console.error("API response:", JSON.stringify(err.data));
    }
    process.exit(1);
  }
})();
