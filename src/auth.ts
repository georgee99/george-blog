import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

// Fails closed: no configured admin identity means nobody is authorised.
export function isAdminSub(sub: unknown): boolean {
  const adminSub = process.env.ADMIN_GOOGLE_SUB?.trim()
  return Boolean(adminSub) && typeof sub === 'string' && sub === adminSub
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/admin/login', error: '/admin/login' },
  callbacks: {
    // Only the configured Google account (stable `sub`, verified email) can sign in at all.
    async signIn({ account, profile }) {
      return (
        account?.provider === 'google' &&
        profile?.email_verified === true &&
        isAdminSub(profile.sub)
      )
    },
    // Auth.js generates its own random user id, so persist Google's stable `sub` explicitly.
    async jwt({ token, profile }) {
      if (profile?.sub) token.googleSub = profile.sub
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.googleSub === 'string' ? token.googleSub : ''
      }
      return session
    },
  },
})
