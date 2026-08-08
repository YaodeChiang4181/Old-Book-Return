import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import LineProvider from "next-auth/providers/line"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    LineProvider({
      clientId: process.env.LINE_CLIENT_ID || "2011021687",
      clientSecret: process.env.LINE_CLIENT_SECRET || "fdbbd679f1359a6c8ffd0a05d43741ca",
    })
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
