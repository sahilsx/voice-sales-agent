import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import apiRoutes from '../routes/api.routes.js';
import User from '../models/User.js';

const app = express();
app.use(express.json());
app.use('/api', apiRoutes);

describe('Lead Sheet Template Download API', () => {
    let validToken = '';

    beforeAll(async () => {
        await connectDB();
        const testUser = await User.findOneAndUpdate(
            { id: 'usr_template_test' },
            {
                id: 'usr_template_test',
                organizationId: 'org_master',
                name: 'Test Admin',
                email: 'templateadmin@test.com',
                passwordHash: 'hashed',
                role: 'ADMIN',
                status: 'active'
            },
            { upsert: true, returnDocument: 'after' }
        );
        validToken = jwt.sign({ userId: testUser.id }, env.JWT_SECRET);
    });

    it('downloads Excel template (.xlsx) successfully', async () => {
        const res = await request(app)
            .get('/api/leads/template?format=xlsx')
            .set('Authorization', `Bearer ${validToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(res.headers['content-disposition']).toContain('leads_sample_template.xlsx');
    });

    it('downloads CSV template (.csv) successfully', async () => {
        const res = await request(app)
            .get('/api/leads/template?format=csv')
            .set('Authorization', `Bearer ${validToken}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.headers['content-disposition']).toContain('leads_sample_template.csv');
        expect(res.text).toContain('lead_name');
        expect(res.text).toContain('lead_phone');
        expect(res.text).toContain('lead_interest');
    });
});
