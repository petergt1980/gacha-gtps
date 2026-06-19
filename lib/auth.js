const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'secret_ganti_ini';

function verifyUser(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== 'member') return null;
    return decoded;
  } catch { return null; }
}

function verifyAdmin(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, SECRET);
    if (decoded.role !== 'admin') return null;
    return decoded;
  } catch { return null; }
}

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

module.exports = { verifyUser, verifyAdmin, sign, SECRET };