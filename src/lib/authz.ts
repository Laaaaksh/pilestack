/**
 * "Can this signed-in person see this repo" — checked against GitHub itself
 * using the person's own OAuth token, not Pilestack's own notion of roles.
 * A private repo returns 404 to anyone without access; a public repo returns
 * 200 to everyone, which is the correct answer here too (if someone can
 * already read the PRs on github.com, Pilestack showing the same stack view
 * isn't a new exposure).
 */
export async function hasRepoAccess(
  userAccessToken: string,
  owner: string,
  name: string,
): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  return res.ok;
}
