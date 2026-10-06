const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function inspect() {
  await client.connect();
  console.log('--- DB INSPECTION ---');

  const companiesRes = await client.query('SELECT id, name, slug FROM companies;');
  console.log('Companies:', companiesRes.rows);

  const usersRes = await client.query('SELECT id, email, first_name, last_name FROM users LIMIT 10;');
  console.log('Users:', usersRes.rows);

  const membersRes = await client.query('SELECT company_id, user_id, role, status FROM company_members;');
  console.log('Company Members:', membersRes.rows);

  const sitesRes = await client.query('SELECT id, company_id, name, code, status FROM sites;');
  console.log('Sites:', sitesRes.rows);

  const jobTypesRes = await client.query('SELECT id, company_id, name FROM job_types;');
  console.log('Job Types:', jobTypesRes.rows);

  const siteJobsRes = await client.query('SELECT id, site_id, job_type_id, default_pay_rate, billing_rate FROM site_jobs;');
  console.log('Site Jobs:', siteJobsRes.rows);

  const employeesRes = await client.query('SELECT id, company_id, first_name, last_name, email FROM employees LIMIT 10;');
  console.log('Employees:', employeesRes.rows);

  await client.end();
}

inspect().catch((err) => {
  console.error('Inspect error:', err);
  process.exit(1);
});
