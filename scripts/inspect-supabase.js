const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const WebSocket = require('ws');
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

async function inspect() {
  console.log('Testing Supabase HTTPS REST connection...');

  const { data: companies, error: compErr } = await supabase.from('companies').select('*');
  if (compErr) console.error('Companies error:', compErr);
  else console.log('Companies count:', companies.length, companies);

  const { data: users, error: userErr } = await supabase.from('users').select('id, email, first_name, last_name').limit(5);
  if (userErr) console.error('Users error:', userErr);
  else console.log('Users count:', users?.length, users);

  const { data: sites, error: siteErr } = await supabase.from('sites').select('*');
  if (siteErr) console.error('Sites error:', siteErr);
  else console.log('Sites count:', sites?.length, sites);

  const { data: jobTypes, error: jtErr } = await supabase.from('job_types').select('*');
  if (jtErr) console.error('Job types error:', jtErr);
  else console.log('Job types count:', jobTypes?.length, jobTypes);

  const { data: siteJobs, error: sjErr } = await supabase.from('site_jobs').select('*');
  if (sjErr) console.error('Site jobs error:', sjErr);
  else console.log('Site jobs count:', siteJobs?.length, siteJobs);
}

inspect().catch(console.error);
