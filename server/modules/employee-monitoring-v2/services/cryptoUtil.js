/**
 * Employee Monitoring V2 - Cryptographic Utility
 * 
 * Provides AES-256-GCM encryption/decryption at rest for device credentials.
 * Ensures device secrets are never stored in plaintext within MongoDB.
 */

const crypto = require('crypto');

function getMasterKey() {
  const secret = process.env.MONITORING_V2_ENCRYPTION_KEY || process.env.JWT_SECRET || 'niyantran-v2-device-key-master-secret-fallback-key';
  return crypto.scryptSync(secret, 'niyantran-v2-device-key-salt', 32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} iv:authTag:ciphertext (hex encoded)
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext string.
 * @param {string} encryptedString - iv:authTag:ciphertext
 * @returns {string} decrypted plaintext
 */
function decrypt(encryptedString) {
  if (!encryptedString) return null;
  const parts = encryptedString.split(':');
  if (parts.length !== 3) return null;
  
  const [ivHex, authTagHex, cipherHex] = parts;
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt
};
