// cleanup.js - OpenClaw skill for deleting old tweets and likes
// Place in ~/.openclaw/skills/twitter-cleanup/cleanup.js

const { TwitterApi } = require("twitter-api-v2");

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const DAYS_TO_KEEP = parseInt(process.env.CLEANUP_DAYS_TO_KEEP || "30");
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);

(async () => {
  try {
    const me = await client.v2.me();
    const userId = me.data.id;

    // Delete old tweets
    const tweets = await client.v2.userTimeline(userId, {
      max_results: 100,
      "tweet.fields": ["created_at"],
    });

    let deletedTweets = 0;
    for await (const tweet of tweets) {
      const createdAt = new Date(tweet.created_at);
      if (createdAt < cutoff) {
        await client.v2.deleteTweet(tweet.id);
        deletedTweets++;
        console.log(`Deleted tweet: ${tweet.id} (${tweet.created_at})`);
      }
    }

    // Unlike old likes
    const likes = await client.v2.userLikedTweets(userId, {
      max_results: 100,
      "tweet.fields": ["created_at"],
    });

    let deletedLikes = 0;
    for await (const tweet of likes) {
      const createdAt = new Date(tweet.created_at);
      if (createdAt < cutoff) {
        await client.v2.unlike(userId, tweet.id);
        deletedLikes++;
        console.log(`Unliked tweet: ${tweet.id}`);
      }
    }

    console.log(
      `Cleanup complete: ${deletedTweets} tweets deleted, ${deletedLikes} likes removed`
    );
  } catch (err) {
    console.error("Error during cleanup:", err.message);
    process.exit(1);
  }
})();
