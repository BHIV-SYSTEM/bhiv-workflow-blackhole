import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BRANCH, ORGANIZATION, TENANT_ID } from '../config.js';

export const SEED_PASSWORD = 'TestPass123!';

export const SEED_USERS = {
  admin: {
    name: 'E2E Admin',
    email: 'admin@blackhole.ai',
    password: SEED_PASSWORD,
    role: 'Admin',
    canonicalEmployeeId: 'EMP-BHIV-ADM1',
    employeeId: 'EMP-BHIV-ADM1',
    departmentKey: 'engineering',
  },
  manager: {
    name: 'E2E Manager',
    email: 'manager@blackhole.ai',
    password: SEED_PASSWORD,
    role: 'Manager',
    canonicalEmployeeId: 'EMP-BHIV-MGR1',
    employeeId: 'EMP-BHIV-MGR1',
    departmentKey: 'engineering',
  },
  emp1: {
    name: 'E2E Employee One',
    email: 'emp1@blackhole.ai',
    password: SEED_PASSWORD,
    role: 'User',
    canonicalEmployeeId: 'EMP-BHIV-101',
    employeeId: 'EMP-BHIV-101',
    departmentKey: 'engineering',
  },
  emp2: {
    name: 'E2E Employee Two',
    email: 'emp2@blackhole.ai',
    password: SEED_PASSWORD,
    role: 'User',
    canonicalEmployeeId: 'EMP-BHIV-102',
    employeeId: 'EMP-BHIV-102',
    departmentKey: 'engineering',
  },
  emp3: {
    name: 'E2E Employee Three',
    email: 'emp3@blackhole.ai',
    password: SEED_PASSWORD,
    role: 'User',
    canonicalEmployeeId: 'EMP-BHIV-103',
    employeeId: 'EMP-BHIV-103',
    departmentKey: 'productQa',
  },
  tester: {
    name: 'E2E Tester',
    email: 'tester@blackhole.ai',
    password: SEED_PASSWORD,
    role: 'Tester',
    canonicalEmployeeId: 'EMP-BHIV-TST1',
    employeeId: 'EMP-BHIV-TST1',
    departmentKey: 'productQa',
  },
};

const COLLECTIONS_TO_CLEAR = [
  'users',
  'departments',
  'tasks',
  'tasksubmissions',
  'productcontexts',
  'notifications',
];

async function withMongoConnection(mongoUri, fn) {
  const uri = mongoUri || process.env.E2E_MONGO_URI;
  if (!uri) {
    throw new Error('E2E_MONGO_URI is required for seedData operations.');
  }

  const conn = await mongoose.createConnection(uri).asPromise();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/**
 * Clears core test collections and inserts deterministic departments, users,
 * legacy ProductContext entries, and tasks into MongoDB.
 */
export async function resetAndSeed(mongoUri = process.env.E2E_MONGO_URI) {
  return withMongoConnection(mongoUri, async (conn) => {
    const db = conn.db;

    for (const colName of COLLECTIONS_TO_CLEAR) {
      await db.collection(colName).deleteMany({});
    }

    const now = new Date();
    const futureDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 8);

    // 1. Departments
    const deptEngineeringId = new mongoose.Types.ObjectId();
    const deptProductQaId = new mongoose.Types.ObjectId();

    const departments = [
      {
        _id: deptEngineeringId,
        name: 'Engineering',
        description: 'Core platform and product engineering',
        color: 'bg-blue-500',
        members: [],
        createdAt: now,
      },
      {
        _id: deptProductQaId,
        name: 'Product & QA',
        description: 'Product management and quality assurance',
        color: 'bg-emerald-500',
        members: [],
        createdAt: now,
      },
    ];

    const deptIds = {
      engineering: deptEngineeringId,
      productQa: deptProductQaId,
    };

    // 2. Users
    const userDocs = {};
    const usersToInsert = [];

    for (const [key, spec] of Object.entries(SEED_USERS)) {
      const userId = new mongoose.Types.ObjectId();
      const deptId = deptIds[spec.departmentKey];
      const doc = {
        _id: userId,
        name: spec.name,
        email: spec.email.toLowerCase(),
        password: passwordHash,
        role: spec.role,
        department: deptId,
        stillExist: 1,
        employeeId: spec.employeeId,
        canonicalEmployeeId: spec.canonicalEmployeeId,
        tenantId: TENANT_ID,
        organization: ORGANIZATION,
        branch: BRANCH,
        workMode: 'WFO',
        hourlyRate: 25,
        monitoringPaused: false,
        dataRetentionPeriod: 30,
        currentParikshakTaskId: null,
        createdAt: now,
        updatedAt: now,
      };
      userDocs[key] = doc;
      usersToInsert.push(doc);
    }

    departments[0].lead = userDocs.manager._id;
    departments[0].members = [
      userDocs.admin._id,
      userDocs.manager._id,
      userDocs.emp1._id,
      userDocs.emp2._id,
    ];
    departments[1].lead = userDocs.admin._id;
    departments[1].members = [userDocs.emp3._id, userDocs.tester._id];

    await db.collection('departments').insertMany(departments);
    await db.collection('users').insertMany(usersToInsert);

    // 3. Legacy ProductContext records
    const productContexts = [
      {
        _id: new mongoose.Types.ObjectId(),
        contextId: 'CTX-SEED-NIY1',
        tenantId: TENANT_ID,
        employeeId: userDocs.emp1.canonicalEmployeeId,
        user: userDocs.emp1._id,
        productId: 'NIYANTRAN',
        productName: 'Niyantran Task Workflow Engine',
        version: 'v1.0',
        status: 'PENDING_APPROVAL',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
        previousStatus: null,
        content: 'Legacy pending context for NIYANTRAN authored by emp1',
        summary: 'Legacy pending NIYANTRAN context',
        rejectionReason: null,
        outdatedReason: null,
        submittedAt: now,
        approvedBy: null,
        approvedAt: null,
        versionHistory: [
          {
            version: 'v1.0',
            content: 'Legacy pending context for NIYANTRAN authored by emp1',
            summary: 'Legacy pending NIYANTRAN context',
            approvedAt: null,
            approvedBy: null,
            timestamp: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: new mongoose.Types.ObjectId(),
        contextId: 'CTX-SEED-PAR1',
        tenantId: TENANT_ID,
        employeeId: userDocs.emp2.canonicalEmployeeId,
        user: userDocs.emp2._id,
        productId: 'PARIKSHAK',
        productName: 'Parikshak Engineering Review Runtime',
        version: 'v1.0',
        status: 'REJECTED',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        deletionReason: null,
        previousStatus: null,
        content: 'Legacy rejected context for PARIKSHAK authored by emp2',
        summary: 'Legacy rejected PARIKSHAK context',
        rejectionReason: 'Legacy rejection',
        outdatedReason: null,
        submittedAt: now,
        approvedBy: null,
        approvedAt: null,
        versionHistory: [
          {
            version: 'v1.0',
            content: 'Legacy rejected context for PARIKSHAK authored by emp2',
            summary: 'Legacy rejected PARIKSHAK context',
            approvedAt: null,
            approvedBy: null,
            timestamp: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.collection('productcontexts').insertMany(productContexts);

    // 4. Tasks
    const tasks = {
      taskWithProduct: {
        _id: new mongoose.Types.ObjectId(),
        title: 'Build Niyantran Context Bridge',
        description: 'Implement task-to-context metadata propagation for NIYANTRAN.',
        status: 'In Progress',
        priority: 'High',
        department: deptIds.engineering,
        assignee: userDocs.emp1._id,
        createdBy: userDocs.admin._id,
        dueDate: futureDueDate,
        product: 'NIYANTRAN',
        task_id: 'T-NIY-101',
        branch: BRANCH,
        tenantId: TENANT_ID,
        progress: 40,
        createdAt: now,
        updatedAt: now,
      },
      taskMissingContext: {
        _id: new mongoose.Types.ObjectId(),
        title: 'Implement Trinetra Telemetry Sync',
        description: 'Task assigned to emp3 who has no ProductContext record yet.',
        status: 'In Progress',
        priority: 'Medium',
        department: deptIds.productQa,
        assignee: userDocs.emp3._id,
        createdBy: userDocs.admin._id,
        dueDate: futureDueDate,
        product: 'TRINETRA',
        task_id: 'T-TRI-102',
        branch: BRANCH,
        tenantId: TENANT_ID,
        progress: 20,
        createdAt: now,
        updatedAt: now,
      },
      taskNoProduct: {
        _id: new mongoose.Types.ObjectId(),
        title: 'Internal Process Documentation',
        description: 'General task with explicitly null product and no task_id.',
        status: 'In Progress',
        priority: 'Low',
        department: deptIds.engineering,
        assignee: userDocs.emp1._id,
        createdBy: userDocs.manager._id,
        dueDate: futureDueDate,
        product: null,
        branch: BRANCH,
        tenantId: TENANT_ID,
        progress: 10,
        createdAt: now,
        updatedAt: now,
      },
      taskCompleted: {
        _id: new mongoose.Types.ObjectId(),
        title: 'Parikshak Review Adapter Hardening',
        description: 'Completed task assigned to emp2 for PARIKSHAK.',
        status: 'Completed',
        priority: 'Medium',
        department: deptIds.engineering,
        assignee: userDocs.emp2._id,
        createdBy: userDocs.admin._id,
        dueDate: futureDueDate,
        product: 'PARIKSHAK',
        task_id: 'T-PAR-103',
        branch: BRANCH,
        tenantId: TENANT_ID,
        progress: 100,
        createdAt: now,
        updatedAt: now,
      },
    };

    await db.collection('tasks').insertMany(Object.values(tasks));

    return {
      departments: {
        engineering: departments[0],
        productQa: departments[1],
      },
      users: userDocs,
      productContexts,
      tasks,
    };
  });
}

/**
 * Reads direct collection snapshots from MongoDB so tests can verify
 * persisted database state independently of API projections.
 */
export async function getDbSnapshot(mongoUri = process.env.E2E_MONGO_URI) {
  return withMongoConnection(mongoUri, async (conn) => {
    const db = conn.db;
    const [
      users,
      departments,
      tasks,
      tasksubmissions,
      productcontexts,
      notifications,
    ] = await Promise.all(
      COLLECTIONS_TO_CLEAR.map((name) => db.collection(name).find({}).toArray())
    );

    return {
      users,
      departments,
      tasks,
      tasksubmissions,
      productcontexts,
      notifications,
    };
  });
}

export async function getCollectionDocs(
  collectionName,
  filter = {},
  mongoUri = process.env.E2E_MONGO_URI
) {
  return withMongoConnection(mongoUri, async (conn) => {
    return conn.db.collection(collectionName).find(filter).toArray();
  });
}
