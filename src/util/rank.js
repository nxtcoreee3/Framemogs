export function computeRank({ upvotes = 0, downvotes = 0 } = {}) {
  const score = (upvotes || 0) - (downvotes || 0);
  if (score <= -10) return { rank: "Banned", score };
  if (score < 10) return { rank: "NPC", score };
  if (score < 40) return { rank: "Average", score };
  if (score < 100) return { rank: "Mogger", score };
  if (score < 250) return { rank: "Chad", score };
  return { rank: "Framegod", score };
}
