import { verifyHs256Jwt } from "@rocket-mcp/token-exchange/jwt";

export function verifyApplicationToken(authorization) {
  const token = /^Bearer\s+(.+)$/i.exec(authorization || "")?.[1];
  return verifyHs256Jwt(token, {
    secret: process.env.APPLICATION_JWT_SECRET || "development-jwt-secret-change-me-now",
    issuer: "https://application.example.com",
    audience: "https://application.example.com/api",
    clockSkewSeconds: 30,
  });
}
