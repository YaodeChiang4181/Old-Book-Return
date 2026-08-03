import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    {
      id: "ncu",
      name: "NCU Portal",
      type: "oauth",
      version: "2.0",
      authorization: { url: "https://portal.ncu.edu.tw/oauth2/authorization" },
      token: {
        url: "https://portal.ncu.edu.tw/oauth2/token",
        // 依據截圖說明，需要在 header 加入 Accept: application/json
        // 以及使用 Basic Auth (NextAuth 預設 client_secret_basic 通常就是這樣)
      },
      userinfo: { url: "https://portal.ncu.edu.tw/apis/oauth/v1/info" },
      clientId: process.env.NCU_CLIENT_ID || "",
      clientSecret: process.env.NCU_CLIENT_SECRET || "",
      profile(profile: any) {
        // FIXME: 這裡需要依照 NCU API 實際回傳的 JSON 格式來修改欄位名稱
        return {
          id: profile.id || profile.identifier || String(Date.now()), // 假設的唯一識別碼
          name: profile.name || profile.chineseName || "中央大學學生",
          email: profile.email || `${profile.id}@cc.ncu.edu.tw`, // 假設的 email
          image: null,
          role: "STUDENT", // 加入 default role 以符合 TypeScript 型別定義
        };
      },
    }
  ],
  callbacks: {
    async signIn({ user }) {
      // 若信箱為 @cc.ncu.edu.tw 或指定信箱，自動賦予管理員權限
      const isAdmin = user.email?.endsWith('@cc.ncu.edu.tw') || user.email === '0966494679a@gmail.com';
      if (isAdmin && user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: 'ADMIN' }
        });
      }
      return true;
    },
    async session({ session, user }: any) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
        // 動態判定 (確保剛更新的狀態有生效)
        const isAdmin = session.user.email?.endsWith('@cc.ncu.edu.tw') || session.user.email === '0966494679a@gmail.com';
        if (isAdmin) {
          session.user.role = 'ADMIN';
        }
      }
      return session;
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
