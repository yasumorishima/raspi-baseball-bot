// tweet.js - OpenClaw skill for posting tweets
// Place in ~/.openclaw/skills/twitter-post/tweet.js

const { TwitterApi } = require("twitter-api-v2");

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const text = process.argv[2];

if (!text) {
  console.error("Usage: node tweet.js <text>");
  process.exit(1);
}

if (text.length > 280) {
  console.error(`Error: Tweet exceeds 280 characters (${text.length})`);
  process.exit(1);
}

(async () => {
  try {
    const result = await client.v2.tweet(text);
    console.log("Tweet posted:", result.data.id);
  } catch (err) {
    console.error("Error posting tweet:", err.message);
    process.exit(1);
  }
})();
