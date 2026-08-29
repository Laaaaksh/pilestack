import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    // Stash the user's own GitHub OAuth token (distinct from the GitHub
    // App's installation token) so repo-access checks can ask "can this
    // person see this repo" using their real GitHub permissions, plus their
    // login (comments and restack runs attribute to a GitHub username, not
    // NextAuth's generic display name).
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.githubAccessToken = account.access_token;
      }
      if (profile && "login" in profile && typeof profile.login === "string") {
        token.githubLogin = profile.login;
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.githubAccessToken === "string") {
        session.githubAccessToken = token.githubAccessToken;
      }
      if (typeof token.githubLogin === "string") {
        session.githubLogin = token.githubLogin;
      }
      return session;
    },
  },
});
