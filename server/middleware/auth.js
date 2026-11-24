const jwt = require("jsonwebtoken");

// Hard guard: refuse to load this middleware if JWT_SECRET is absent.
// This keeps the startup env-validation in sync with the actual point of use
// and ensures no request can be verified against a predictable fallback secret.
if (!process.env.JWT_SECRET) {
  throw new Error(
    "[auth.js] JWT_SECRET environment variable is not set. " +
    "The server will not start without it. " +
    "Set JWT_SECRET to a long random secret before running."
  );
}

module.exports = (req, res, next) => {
  let token = req.header("x-auth-token");
  if (!token && req.header("Authorization")) {
    const authHeader = req.header("Authorization");
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else {
      token = authHeader;
    }
  }

  if (!token) {
    return res.status(401).json({ error: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token is not valid" });
  }
};
