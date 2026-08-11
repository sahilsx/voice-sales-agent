import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { connectDB, disconnectDB } from '../config/db.js';
import { seedDefaultOrgAndAdmin } from '../controllers/authController.js';
import authRoutes from '../routes/auth.routes.js';
import superAdminRoutes from '../routes/superAdmin.routes.js';
import userRoutes from '../routes/user.routes.js';
import apiRoutes from '../routes/api.routes.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { ROLES, ORG_STATUSES, USER_STATUSES } from '../config/constants.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/users', userRoutes);
app.use('/api', apiRoutes);

describe('Super Admin & Multi-Tenant Security Suite', () => {
    let superAdminToken = '';
    let orgAdminToken = '';
    let managerToken = '';
    let agentToken = '';
    let viewerToken = '';
    let createdOrgId = '';
    let createdUserId = '';

    beforeAll(async () => {
        await connectDB();
        await seedDefaultOrgAndAdmin();

        // Login Super Admin
        const saRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'superadmin@voiceai.com', password: 'SuperAdmin@123456' });
        expect(saRes.status).toBe(200);
        superAdminToken = saRes.body.data.token;

        // Login Org Admin
        const adminRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@voiceai.com', password: 'Admin@123456' });
        expect(adminRes.status).toBe(200);
        orgAdminToken = adminRes.body.data.token;

        // Create test Manager, Agent, Viewer users
        const mgrPasswordHash = await User.hashPassword('Password@123');
        await User.create({
            id: 'user_test_mgr',
            organizationId: 'org_master',
            name: 'Test Manager',
            email: 'manager@test.com',
            passwordHash: mgrPasswordHash,
            role: ROLES.MANAGER
        });
        const mgrRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'manager@test.com', password: 'Password@123' });
        managerToken = mgrRes.body.data.token;

        await User.create({
            id: 'user_test_agent',
            organizationId: 'org_master',
            name: 'Test Agent',
            email: 'agent@test.com',
            passwordHash: mgrPasswordHash,
            role: ROLES.AGENT
        });
        const agentRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'agent@test.com', password: 'Password@123' });
        agentToken = agentRes.body.data.token;

        await User.create({
            id: 'user_test_viewer',
            organizationId: 'org_master',
            name: 'Test Viewer',
            email: 'viewer@test.com',
            passwordHash: mgrPasswordHash,
            role: ROLES.VIEWER
        });
        const viewerRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'viewer@test.com', password: 'Password@123' });
        viewerToken = viewerRes.body.data.token;
    });

    it('1. Super Admin login returns valid token and role', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'superadmin@voiceai.com', password: 'SuperAdmin@123456' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.user.role).toBe(ROLES.SUPER_ADMIN);
        expect(res.body.data.user.passwordHash).toBeUndefined();
    });

    it('2. Super Admin can create organization and initial org admin', async () => {
        const res = await request(app)
            .post('/api/super-admin/organizations')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                name: 'Raybit Technologies Test',
                companyName: 'Raybit Tech Pvt Ltd',
                email: 'admin@raybittest.com',
                phone: '+919876543210',
                plan: 'enterprise',
                limits: { maxUsers: 2, maxLeads: 500, maxConcurrentCalls: 5 },
                initialAdmin: {
                    name: 'Sahil Test Admin',
                    email: 'admin@raybittest.com',
                    password: 'SecureAdminPassword123'
                }
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.organization.name).toBe('Raybit Technologies Test');
        expect(res.body.data.initialAdmin.email).toBe('admin@raybittest.com');
        createdOrgId = res.body.data.organization.id;
    });

    it('3. Super Admin can view all organizations with computed counts', async () => {
        const res = await request(app)
            .get('/api/super-admin/organizations')
            .set('Authorization', `Bearer ${superAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.length).toBeGreaterThanOrEqual(2);
        expect(res.body.pagination).toBeDefined();
    });

    it('4. Super Admin can view all users platform-wide', async () => {
        const res = await request(app)
            .get('/api/super-admin/users')
            .set('Authorization', `Bearer ${superAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.some(u => u.role === ROLES.SUPER_ADMIN)).toBe(true);
        expect(res.body.data.some(u => u.email === 'admin@raybittest.com')).toBe(true);
    });

    it('5. Super Admin can suspend organization', async () => {
        const res = await request(app)
            .post(`/api/super-admin/organizations/${createdOrgId}/suspend`)
            .set('Authorization', `Bearer ${superAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(ORG_STATUSES.SUSPENDED);
    });

    it('6. Suspended organization user cannot log in', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@raybittest.com', password: 'SecureAdminPassword123' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('ORGANIZATION_SUSPENDED');
    });

    it('7. Super Admin can activate organization', async () => {
        const res = await request(app)
            .post(`/api/super-admin/organizations/${createdOrgId}/activate`)
            .set('Authorization', `Bearer ${superAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(ORG_STATUSES.ACTIVE);

        // Now user can log in
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@raybittest.com', password: 'SecureAdminPassword123' });

        expect(loginRes.status).toBe(200);
    });

    it('8. Organization admin can view own users but NOT other org users', async () => {
        const res = await request(app)
            .get('/api/users')
            .set('Authorization', `Bearer ${orgAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.every(u => u.organizationId === 'org_master')).toBe(true);
        expect(res.body.data.some(u => u.email === 'admin@raybittest.com')).toBe(false);
    });

    it('9. Organization admin CANNOT create an organization', async () => {
        const res = await request(app)
            .post('/api/super-admin/organizations')
            .set('Authorization', `Bearer ${orgAdminToken}`)
            .send({ name: 'Hacker Org' });

        expect(res.status).toBe(403);
    });

    it('10. Organization admin CANNOT create a Super Admin user', async () => {
        const res = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${orgAdminToken}`)
            .send({
                name: 'Fake Super Admin',
                email: 'fakesuper@test.com',
                password: 'Password@123',
                role: 'SUPER_ADMIN'
            });

        expect(res.status).toBe(403);
    });

    it('11. Manager, Agent, and Viewer CANNOT access user management endpoints', async () => {
        const resMgr = await request(app).get('/api/users').set('Authorization', `Bearer ${managerToken}`);
        expect(resMgr.status).toBe(403);

        const resAgent = await request(app).get('/api/users').set('Authorization', `Bearer ${agentToken}`);
        expect(resAgent.status).toBe(403);

        const resViewer = await request(app).get('/api/users').set('Authorization', `Bearer ${viewerToken}`);
        expect(resViewer.status).toBe(403);
    });

    it('12. Organization maxUsers limit is strictly enforced', async () => {
        // createdOrgId has maxUsers: 2, and 1 user (Sahil Test Admin) already exists.
        // Add 2nd user -> Success
        const res1 = await request(app)
            .post('/api/super-admin/users')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                name: 'User 2',
                email: 'user2@raybittest.com',
                password: 'Password@123',
                organizationId: createdOrgId,
                role: 'AGENT'
            });
        expect(res1.status).toBe(200);

        // Add 3rd user -> Rejection due to maxUsers limit
        const res2 = await request(app)
            .post('/api/super-admin/users')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                name: 'User 3 Excessive',
                email: 'user3@raybittest.com',
                password: 'Password@123',
                organizationId: createdOrgId,
                role: 'AGENT'
            });

        expect(res2.status).toBe(400);
        expect(res2.body.error.code).toBe('USER_LIMIT_REACHED');
    });

    it('13. Audit logs are generated for Super Admin actions', async () => {
        const logs = await AuditLog.find({ action: { $regex: 'ORGANIZATION' } }).lean();
        expect(logs.length).toBeGreaterThan(0);
    });

    it('14. Password hashes are NEVER returned in API responses', async () => {
        const res = await request(app)
            .get('/api/super-admin/users')
            .set('Authorization', `Bearer ${superAdminToken}`);

        expect(res.status).toBe(200);
        res.body.data.forEach(u => {
            expect(u.passwordHash).toBeUndefined();
            expect(u.password).toBeUndefined();
        });
    });
});
