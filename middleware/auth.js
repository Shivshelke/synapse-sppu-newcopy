/**
 * middleware/auth.js
 * Protects admin routes — rejects unauthenticated requests.
 */

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  // API request → JSON error
  if (req.path.startsWith('/api') || req.headers['content-type'] === 'application/json') {
    return res.status(401).json({ error: 'Unauthorized. Please login.' });
  }
  // Browser request → redirect to login
  return res.redirect('/login.html');
}

module.exports = { requireAdmin };
