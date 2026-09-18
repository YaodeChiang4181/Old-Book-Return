const LineProvider = require('next-auth/providers/line').default;

try {
  const provider = LineProvider({
    clientId: "123",
    clientSecret: "456",
    authorization: { params: { scope: "profile openid" } },
  });
  console.log(provider);
} catch (e) {
  console.error(e);
}
