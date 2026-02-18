// cleanup.js - OpenClaw skill for deleting old tweets
// Place in ~/.openclaw/skills/twitter-cleanup/cleanup.js
//
// ⚠️ X Free Tierでは読み取りAPI（userTimeline, userLikedTweets）が使えない（403）
// そのため、ツイートIDをstdinまたは引数で指定して削除する方式に変更
//
// Usage:
//   echo "1234567890,1234567891" | node cleanup.js
//   node cleanup.js 1234567890 1234567891
//   node cleanup.js  (引数なしの場合はスキップ)

const { TwitterApi } = require("twitter-api-v2");

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    setTimeout(() => {
      if (!data) {
        process.stdin.destroy();
        resolve(null);
      }
    }, 100);
  });
}

(async () => {
  // stdinからカンマ区切り or 引数からツイートID取得
  let tweetIds = [];
  const stdinData = await readStdin();
  if (stdinData) {
    tweetIds = stdinData.split(/[,\s]+/).filter(Boolean);
  } else {
    tweetIds = process.argv.slice(2).filter(Boolean);
  }

  if (tweetIds.length === 0) {
    console.log("No tweet IDs provided. Skipping cleanup.");
    process.exit(0);
  }

  let deleted = 0;
  let failed = 0;
  for (const id of tweetIds) {
    try {
      await client.v2.deleteTweet(id);
      deleted++;
      console.log(`Deleted tweet: ${id}`);
    } catch (err) {
      failed++;
      console.error(`Failed to delete ${id}: ${err.message}`);
    }
  }

  console.log(`Cleanup complete: ${deleted} deleted, ${failed} failed`);
})();
