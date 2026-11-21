/**
 * Niyantran Employee Monitoring V2 — E2E MongoDB Helper
 * Direct database connection, collection queries, schema validations,
 * assertions, and test fixture cleanup using mongoose from server/node_modules/mongoose.
 */

const path = require('node:path');
const assert = require('node:assert/strict');
const config = require('../config');

// Resolve mongoose from server subsystem
let mongoose;
try {
  mongoose = require(path.resolve(config.paths.server, 'node_modules/mongoose'));
} catch {
  try {
    mongoose = require('mongoose');
  } catch (err) {
    throw new Error(`Unable to resolve mongoose from ${config.paths.server}/node_modules/mongoose: ${err.message}`);
  }
}

class DbHelper {
  constructor(uri = config.mongoUri) {
    this.uri = uri;
    this.mongoose = mongoose;
    this.connection = null;
  }

  /**
   * Connect to MongoDB. Reuses existing active connection if already connected.
   * @param {string} [uri] Override MongoDB connection URI
   * @returns {Promise<import('mongoose').Connection>}
   */
  async connect(uri = this.uri) {
    this.uri = uri;
    if (this.mongoose.connection.readyState === 1) {
      this.connection = this.mongoose.connection;
      return this.connection;
    }

    await this.mongoose.connect(this.uri, {
      serverSelectionTimeoutMS: config.timeouts.shortTimeout,
      autoIndex: false
    });

    this.connection = this.mongoose.connection;
    return this.connection;
  }

  /**
   * Disconnect cleanly from MongoDB.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.mongoose.connection.readyState !== 0) {
      await this.mongoose.disconnect();
    }
    this.connection = null;
  }

  /**
   * Get direct native MongoDB collection handle.
   * @param {string} collectionName
   * @returns {import('mongodb').Collection}
   */
  getCollection(collectionName) {
    if (!this.mongoose.connection || this.mongoose.connection.readyState !== 1) {
      throw new Error(`MongoDB is not connected (readyState: ${this.mongoose.connection?.readyState}). Call dbHelper.connect() first.`);
    }
    return this.mongoose.connection.db.collection(collectionName);
  }

  // --- Collection Shortcuts ---
  get users() { return this.getCollection('users'); }
  get devices() { return this.getCollection('monitoring_v2_devices'); }
  get sessions() { return this.getCollection('monitoring_v2_sessions'); }
  get telemetry() { return this.getCollection('monitoring_v2_telemetry'); }
  get attendances() { return this.getCollection('attendances'); }
  get dailyAttendances() { return this.getCollection('dailyattendances'); }
  get alerts() { return this.getCollection('monitoring_alerts'); }
  get keystrokeLogs() { return this.getCollection('keystroke_logs'); }
  get screenCaptures() { return this.getCollection('screen_captures'); }

  // --- Query Helpers ---

  /**
   * Find a user by email.
   * @param {string} email
   */
  async getUserByEmail(email) {
    return this.users.findOne({ email });
  }

  /**
   * Find a user by ObjectId or string id.
   * @param {string|import('mongoose').Types.ObjectId} id
   */
  async getUserById(id) {
    const filter = typeof id === 'string' && this.mongoose.Types.ObjectId.isValid(id)
      ? { _id: new this.mongoose.Types.ObjectId(id) }
      : { _id: id };
    return this.users.findOne(filter);
  }

  /**
   * Find a device by device_id string.
   * @param {string} deviceId
   */
  async getDeviceById(deviceId) {
    return this.devices.findOne({
      $or: [{ device_id: deviceId }, { deviceId }]
    });
  }

  /**
   * Find all registered devices for an employee.
   * @param {string|import('mongoose').Types.ObjectId} employeeId
   */
  async getDevicesByEmployee(employeeId) {
    const idStr = String(employeeId);
    return this.devices.find({
      $or: [
        { employee_id: idStr },
        { employeeId: idStr },
        { employee_id: new this.mongoose.Types.ObjectId(idStr) }
      ]
    }).toArray();
  }

  /**
   * Find a monitoring session by session_id.
   * @param {string} sessionId
   */
  async getSessionById(sessionId) {
    return this.sessions.findOne({
      $or: [{ session_id: sessionId }, { sessionId }]
    });
  }

  /**
   * Find active monitoring sessions for an employee.
   * @param {string} employeeId
   */
  async getSessionsByEmployee(employeeId) {
    const idStr = String(employeeId);
    return this.sessions.find({
      $or: [
        { employee_id: idStr },
        { employeeId: idStr }
      ]
    }).sort({ created_at: -1 }).toArray();
  }

  /**
   * Find all telemetry batches submitted for a session.
   * @param {string} sessionId
   */
  async getTelemetryBySession(sessionId) {
    return this.telemetry.find({
      $or: [{ session_id: sessionId }, { sessionId }]
    }).sort({ timestamp: 1 }).toArray();
  }

  /**
   * Find all alerts for an employee.
   * @param {string} employeeId
   */
  async getAlertsByEmployee(employeeId) {
    const idStr = String(employeeId);
    return this.alerts.find({
      $or: [
        { employee_id: idStr },
        { employeeId: idStr },
        { employee_id: new this.mongoose.Types.ObjectId(idStr) }
      ]
    }).sort({ created_at: -1, createdAt: -1 }).toArray();
  }

  /**
   * Find attendance record for a user and optional date.
   * @param {string} userId
   * @param {Date|string} [date]
   */
  async getAttendanceByUser(userId, date = null) {
    const filter = {
      $or: [
        { user: new this.mongoose.Types.ObjectId(String(userId)) },
        { user: String(userId) },
        { employeeId: String(userId) }
      ]
    };
    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      filter.date = { $gte: startOfDay, $lte: endOfDay };
    }
    return this.attendances.find(filter).sort({ date: -1, createdAt: -1 }).toArray();
  }

  /**
   * Find daily attendance record for a user.
   * @param {string} userId
   * @param {string} [dateStr] 'YYYY-MM-DD'
   */
  async getDailyAttendanceByUser(userId, dateStr = null) {
    const filter = {
      $or: [
        { user: new this.mongoose.Types.ObjectId(String(userId)) },
        { user: String(userId) }
      ]
    };
    if (dateStr) {
      filter.date = dateStr;
    }
    return this.dailyAttendances.find(filter).sort({ date: -1 }).toArray();
  }

  // --- Assertion Helpers ---

  /**
   * Assert that at least one document exists matching the query.
   * @param {string} collectionName
   * @param {Object} query
   * @param {string} [message]
   * @returns {Promise<Object>} The matched document
   */
  async assertDocumentExists(collectionName, query, message) {
    const col = this.getCollection(collectionName);
    const doc = await col.findOne(query);
    assert.ok(
      doc !== null && doc !== undefined,
      message || `Expected document in collection '${collectionName}' matching ${JSON.stringify(query)}, but none was found.`
    );
    return doc;
  }

  /**
   * Assert that a document matches expected field values.
   * @param {string} collectionName
   * @param {Object} query
   * @param {Object} expectedFields
   * @param {string} [message]
   * @returns {Promise<Object>}
   */
  async assertDocumentMatches(collectionName, query, expectedFields, message) {
    const doc = await this.assertDocumentExists(collectionName, query, message);
    for (const [key, expectedVal] of Object.entries(expectedFields)) {
      const actualVal = doc[key];
      if (expectedVal instanceof RegExp) {
        assert.match(
          String(actualVal),
          expectedVal,
          `${message || 'Assertion failed'}: Field '${key}' value '${actualVal}' did not match regex ${expectedVal}`
        );
      } else {
        assert.deepEqual(
          actualVal,
          expectedVal,
          `${message || 'Assertion failed'}: Field '${key}' expected '${expectedVal}' but got '${actualVal}'`
        );
      }
    }
    return doc;
  }

  /**
   * Assert that a collection has zero documents matching the query.
   * Critical for privacy gates (zero keystrokes, zero screenshots).
   * @param {string} collectionName
   * @param {Object} [query={}]
   * @param {string} [message]
   */
  async assertCollectionEmpty(collectionName, query = {}, message) {
    const col = this.getCollection(collectionName);
    const count = await col.countDocuments(query);
    assert.equal(
      count,
      0,
      message || `Expected collection '${collectionName}' to have 0 documents matching ${JSON.stringify(query)}, but found ${count}.`
    );
  }

  /**
   * Assert exact document count for a query.
   * @param {string} collectionName
   * @param {Object} query
   * @param {number} expectedCount
   * @param {string} [message]
   */
  async assertDocumentCount(collectionName, query, expectedCount, message) {
    const col = this.getCollection(collectionName);
    const count = await col.countDocuments(query);
    assert.equal(
      count,
      expectedCount,
      message || `Expected collection '${collectionName}' to have ${expectedCount} documents matching ${JSON.stringify(query)}, but found ${count}.`
    );
  }

  // --- Cleanup Helper ---

  /**
   * Clean up test data matching safe criteria.
   * Never deletes core seeded users (rudra, ishan, lead.admin).
   * @param {Object} [filter]
   */
  async cleanupTestData(filter = {}) {
    if (!this.mongoose.connection || this.mongoose.connection.readyState !== 1) return;

    // Default safe filter: remove documents tagged with test tag or test employee
    const testEmployeeEmail = config.credentials.testEmployee.email;
    const testUser = await this.users.findOne({ email: testEmployeeEmail });

    if (testUser) {
      const testUserIdStr = String(testUser._id);
      await this.devices.deleteMany({ employee_id: testUserIdStr });
      await this.sessions.deleteMany({ employee_id: testUserIdStr });
      await this.telemetry.deleteMany({ employee_id: testUserIdStr });
      await this.alerts.deleteMany({ employee_id: testUserIdStr });
    }

    if (filter.sessionId) {
      await this.sessions.deleteMany({ session_id: filter.sessionId });
      await this.telemetry.deleteMany({ session_id: filter.sessionId });
    }

    if (filter.deviceId) {
      await this.devices.deleteMany({ device_id: filter.deviceId });
    }

    if (filter.customCollection && filter.customQuery) {
      await this.getCollection(filter.customCollection).deleteMany(filter.customQuery);
    }
  }
}

// Factory function
function createDbHelper(uri = config.mongoUri) {
  return new DbHelper(uri);
}

// Singleton instance
const dbHelper = new DbHelper(config.mongoUri);

module.exports = {
  DbHelper,
  createDbHelper,
  dbHelper
};
