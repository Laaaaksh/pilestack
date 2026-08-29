import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    githubAccessToken?: string;
    githubLogin?: string;
    user?: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubAccessToken?: string;
    githubLogin?: string;
  }
}
