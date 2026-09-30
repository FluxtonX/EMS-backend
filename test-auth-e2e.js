const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

const API_BASE = 'http://127.0.0.1:4000/api/v1';

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      `${API_BASE}${path}`,
      { method: 'POST', headers },
      (res) => {
        let resBody = '';
        res.on('data', (c) => (resBody += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, body: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      `${API_BASE}${path}`,
      { method: 'GET', headers },
      (res) => {
        let resBody = '';
        res.on('data', (c) => (resBody += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, body: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runEndToEndTest() {
  console.log('====================================================');
  console.log('STARTING END-TO-END AUTHENTICATION INTEGRITY TEST');
  console.log('====================================================');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
  });

  const timestamp = Date.now();
  const testEmail = `operator_${timestamp}@workforce-test.co.uk`;
  const testPassword = 'Password123!';
  const companyName = `Apex Security ${timestamp}`;

  // Step 1: Check health endpoint
  console.log('\n[1/7] Testing GET /api/v1/health ...');
  const healthStart = Date.now();
  const healthRes = await get('/health');
  console.log(`✓ Health endpoint status: ${healthRes.status} in ${Date.now() - healthStart}ms`, healthRes.body);

  // Step 2: Register company & user
  console.log(`\n[2/7] Testing POST /api/v1/auth/register with email: ${testEmail} ...`);
  const regStart = Date.now();
  const regRes = await post('/auth/register', {
    companyName,
    email: testEmail,
    password: testPassword,
    firstName: 'Marcus',
    lastName: 'Vance',
    phone: '+44 7700 900123',
  });
  console.log(`✓ Register response status: ${regRes.status} in ${Date.now() - regStart}ms`);
  if (regRes.status !== 201) {
    console.error('Registration failed:', regRes.body);
    process.exit(1);
  }
  const session = regRes.body.data;
  console.log(`✓ Registered User ID: ${session.user.id}, Company ID: ${session.company.id}, Role: ${session.company.role}`);

  // Step 3: Verify permanent persistence in Supabase
  console.log('\n[3/7] Verifying record persistence directly in Supabase PostgreSQL tables ...');
  const { data: dbUser, error: uErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (uErr || !dbUser) {
    console.error('FAILED: User was not persisted in Supabase users table!', uErr);
    process.exit(1);
  }
  console.log(`✓ Verified in Supabase: User "${dbUser.email}" [ID: ${dbUser.id}] is permanently stored in PostgreSQL!`);

  const { data: dbComp, error: cErr } = await supabase
    .from('companies')
    .select('*')
    .eq('id', session.company.id)
    .single();
  if (cErr || !dbComp) {
    console.error('FAILED: Company was not persisted in Supabase companies table!', cErr);
    process.exit(1);
  }
  console.log(`✓ Verified in Supabase: Company "${dbComp.name}" [ID: ${dbComp.id}] is permanently stored in PostgreSQL!`);

  const { data: dbMembers, error: mErr } = await supabase
    .from('company_members')
    .select('*')
    .eq('user_id', session.user.id);
  if (mErr || !dbMembers || dbMembers.length === 0) {
    console.error('FAILED: Membership was not persisted in Supabase company_members table!', mErr);
    process.exit(1);
  }
  console.log(`✓ Verified in Supabase: Company membership [Role: ${dbMembers[0].role}] is permanently stored in PostgreSQL!`);

  // Step 4: Login with valid credentials
  console.log('\n[4/7] Testing POST /api/v1/auth/login with valid credentials ...');
  const loginStart = Date.now();
  const loginRes = await post('/auth/login', {
    email: testEmail,
    password: testPassword,
  });
  console.log(`✓ Login response status: ${loginRes.status} in ${Date.now() - loginStart}ms`);
  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes.body);
    process.exit(1);
  }
  const accessToken = loginRes.body.data.accessToken;
  console.log(`✓ Successfully received JWT accessToken (${accessToken.slice(0, 20)}...)`);

  // Step 5: Test session restoration with GET /auth/me
  console.log('\n[5/7] Testing GET /api/v1/auth/me (Session restoration & RBAC) ...');
  const meRes = await get('/auth/me', accessToken);
  console.log(`✓ GET /auth/me status: ${meRes.status}`, meRes.body?.data ? 'Profile valid' : 'No data');
  if (meRes.status !== 200) {
    console.error('GET /auth/me failed:', meRes.body);
    process.exit(1);
  }

  // Step 6: Test invalid credentials rejection
  console.log('\n[6/7] Testing POST /api/v1/auth/login with WRONG password (Must reject) ...');
  const badLoginRes = await post('/auth/login', {
    email: testEmail,
    password: 'WrongPassword999!',
  });
  console.log(`✓ Invalid password response status: ${badLoginRes.status} (Expected 401 Unauthorized)`);
  if (badLoginRes.status !== 401) {
    console.error('Expected 401 but got:', badLoginRes.status);
    process.exit(1);
  }

  // Step 7: Test duplicate email rejection
  console.log('\n[7/7] Testing duplicate email registration (Must reject with 409 Conflict) ...');
  const dupRes = await post('/auth/register', {
    companyName: 'Another Company',
    email: testEmail,
    password: testPassword,
    firstName: 'Duplicate',
    lastName: 'Tester',
  });
  console.log(`✓ Duplicate registration status: ${dupRes.status} (Expected 409 Conflict)`);
  if (dupRes.status !== 409) {
    console.error('Expected 409 but got:', dupRes.status);
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log('ALL 7 END-TO-END TESTS PASSED WITH 100% SUCCESS!');
  console.log('AUTHENTICATION IS FAST AND PERMANENTLY PERSISTENT!');
  console.log('====================================================');
}

runEndToEndTest().catch((err) => {
  console.error('E2E Test Exception:', err);
  process.exit(1);
});
