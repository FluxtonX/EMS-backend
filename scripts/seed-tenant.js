const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

const STANDARD_JOB_TYPES = [
  { name: 'Security Officer', description: 'Access control, premises patrol, and visitor logging' },
  { name: 'Door Supervisor', description: 'SIA licensed physical door supervision, search, and crowd management' },
  { name: 'CCTV Operator', description: 'Control room monitoring, video archiving, and incident dispatch' },
  { name: 'Event Steward', description: 'Customer assistance, perimeter marshalling, and event safety' },
];

const STANDARD_SITES = [
  {
    name: 'Canary Wharf Financial Tower',
    code: 'CW-01',
    address: {
      line1: '25 Canada Square',
      city: 'London',
      postalCode: 'E14 5LB',
      country: 'United Kingdom',
    },
    contact_name: 'James Sterling',
    contact_phone: '+44 20 7946 0912',
    contact_email: 'facilities@canarywharf.co.uk',
    latitude: 51.5033,
    longitude: -0.0189,
    geofence_radius: 250,
    status: 'active',
  },
  {
    name: 'Heathrow Logistics Hub',
    code: 'HT-04',
    address: {
      line1: 'Southern Perimeter Road, Cargo Terminal 4',
      city: 'Hounslow',
      postalCode: 'TW6 3XZ',
      country: 'United Kingdom',
    },
    contact_name: 'Sarah Jenkins',
    contact_phone: '+44 20 8759 1234',
    contact_email: 'security@heathrowlogistics.co.uk',
    latitude: 51.4586,
    longitude: -0.4452,
    geofence_radius: 300,
    status: 'active',
  },
  {
    name: 'Westfield Stratford City',
    code: 'WF-02',
    address: {
      line1: 'Olympic Park, Montfichet Rd',
      city: 'London',
      postalCode: 'E20 1EJ',
      country: 'United Kingdom',
    },
    contact_name: 'Marcus Brody',
    contact_phone: '+44 20 8221 7300',
    contact_email: 'ops@westfieldstratford.co.uk',
    latitude: 51.5435,
    longitude: -0.0075,
    geofence_radius: 200,
    status: 'active',
  },
];

const STANDARD_SITE_RATES = {
  'CW-01': [
    { jobTypeName: 'Door Supervisor', payRate: 14.50, billingRate: 22.00 },
    { jobTypeName: 'CCTV Operator', payRate: 15.00, billingRate: 24.00 },
    { jobTypeName: 'Security Officer', payRate: 13.50, billingRate: 20.00 },
  ],
  'HT-04': [
    { jobTypeName: 'Security Officer', payRate: 13.75, billingRate: 21.00 },
    { jobTypeName: 'CCTV Operator', payRate: 15.25, billingRate: 24.50 },
  ],
  'WF-02': [
    { jobTypeName: 'Security Officer', payRate: 13.25, billingRate: 19.50 },
    { jobTypeName: 'Door Supervisor', payRate: 14.00, billingRate: 21.50 },
    { jobTypeName: 'Event Steward', payRate: 12.50, billingRate: 18.00 },
  ],
};

const STANDARD_CLIENTS = [
  {
    name: 'Canary Wharf Group Plc',
    company_number: '04191122',
    vat_number: 'GB 548 7219 02',
    billing_email: 'accounts@canarywharf.com',
    phone: '+44 20 7418 2000',
    address: 'One Canada Square, Canary Wharf, London E14 5AA',
    status: 'active',
    payment_terms_days: 30,
    currency: 'GBP',
    notes: 'Tier 1 commercial property management account.',
  },
  {
    name: 'Heathrow Airport Holdings Ltd',
    company_number: '01988690',
    vat_number: 'GB 653 8291 14',
    billing_email: 'procurement-aviation@heathrow.com',
    phone: '+44 20 8759 7000',
    address: 'The Compass Centre, Nelson Road, Hounslow TW6 2GW',
    status: 'active',
    payment_terms_days: 45,
    currency: 'GBP',
    notes: 'Aviation security and cargo hub contract.',
  },
];

async function seedCompany(company) {
  console.log(`\n======================================================`);
  console.log(`Seeding tenant: ${company.name} (${company.id})`);
  console.log(`======================================================`);

  // 1. Seed / Ensure Job Types
  const jobTypeMap = new Map(); // name -> id
  const { data: existingJobTypes, error: jtErr } = await supabase
    .from('job_types')
    .select('id, name')
    .eq('company_id', company.id);

  if (jtErr) {
    console.error(`Error fetching job types for ${company.name}:`, jtErr);
    return;
  }

  for (const jt of existingJobTypes || []) {
    jobTypeMap.set(jt.name, jt.id);
  }

  for (const jt of STANDARD_JOB_TYPES) {
    if (!jobTypeMap.has(jt.name)) {
      const { data: inserted, error: insertErr } = await supabase
        .from('job_types')
        .insert({
          company_id: company.id,
          name: jt.name,
          description: jt.description,
          is_active: true,
        })
        .select()
        .single();

      if (insertErr) {
        console.error(`Failed to create job type ${jt.name}:`, insertErr.message);
      } else {
        console.log(`+ Created Job Type: ${jt.name} (${inserted.id})`);
        jobTypeMap.set(jt.name, inserted.id);
      }
    } else {
      console.log(`= Existing Job Type: ${jt.name} (${jobTypeMap.get(jt.name)})`);
    }
  }

  // 2. Seed / Ensure Sites
  const siteMap = new Map(); // code -> { id, name }
  const { data: existingSites, error: siteErr } = await supabase
    .from('sites')
    .select('id, code, name')
    .eq('company_id', company.id);

  if (siteErr) {
    console.error(`Error fetching sites for ${company.name}:`, siteErr);
    return;
  }

  for (const s of existingSites || []) {
    siteMap.set(s.code, { id: s.id, name: s.name });
  }

  for (const siteData of STANDARD_SITES) {
    if (!siteMap.has(siteData.code)) {
      const enrichedAddress = {
        ...siteData.address,
        latitude: siteData.latitude,
        longitude: siteData.longitude,
        geofenceRadius: siteData.geofence_radius,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('sites')
        .insert({
          company_id: company.id,
          name: siteData.name,
          code: siteData.code,
          address: enrichedAddress,
          contact_name: siteData.contact_name,
          contact_phone: siteData.contact_phone,
          contact_email: siteData.contact_email,
          status: siteData.status,
        })
        .select()
        .single();

      if (insertErr) {
        console.error(`Failed to create site ${siteData.code}:`, insertErr.message);
      } else {
        console.log(`+ Created Site: ${siteData.name} [${siteData.code}] (${inserted.id})`);
        siteMap.set(siteData.code, { id: inserted.id, name: inserted.name });
      }
    } else {
      console.log(`= Existing Site: ${siteData.name} [${siteData.code}] (${siteMap.get(siteData.code).id})`);
    }
  }

  // 3. Seed / Ensure Site Jobs & Rates Matrix
  for (const [siteCode, rates] of Object.entries(STANDARD_SITE_RATES)) {
    const site = siteMap.get(siteCode);
    if (!site) continue;

    for (const rateInfo of rates) {
      const jobTypeId = jobTypeMap.get(rateInfo.jobTypeName);
      if (!jobTypeId) continue;

      // Check if site_job already exists
      const { data: existingSj } = await supabase
        .from('site_jobs')
        .select('id, default_pay_rate, billing_rate')
        .eq('company_id', company.id)
        .eq('site_id', site.id)
        .eq('job_type_id', jobTypeId)
        .maybeSingle();

      if (!existingSj) {
        const { data: insertedSj, error: sjErr } = await supabase
          .from('site_jobs')
          .insert({
            company_id: company.id,
            site_id: site.id,
            job_type_id: jobTypeId,
            default_pay_rate: rateInfo.payRate,
            billing_rate: rateInfo.billingRate,
            currency: 'GBP',
            status: 'active',
          })
          .select()
          .single();

        if (sjErr) {
          console.error(`Failed to link rate for ${rateInfo.jobTypeName} on ${site.name}:`, sjErr.message);
        } else {
          console.log(`  + Site Rate: ${site.name} -> ${rateInfo.jobTypeName} | Pay: £${rateInfo.payRate.toFixed(2)} | Charge: £${rateInfo.billingRate.toFixed(2)}`);
        }
      } else {
        console.log(`  = Existing Site Rate: ${site.name} -> ${rateInfo.jobTypeName} | Pay: £${Number(existingSj.default_pay_rate).toFixed(2)} | Charge: £${Number(existingSj.billing_rate).toFixed(2)}`);
      }
    }
  }

  // 4. Seed / Ensure Clients & Invoicing
  const clientMap = new Map();
  const { data: existingClients } = await supabase
    .from('clients')
    .select('id, name')
    .eq('company_id', company.id);

  for (const c of existingClients || []) {
    clientMap.set(c.name, c.id);
  }

  for (const clientData of STANDARD_CLIENTS) {
    if (!clientMap.has(clientData.name)) {
      const { data: insertedClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          company_id: company.id,
          name: clientData.name,
          company_number: clientData.company_number,
          vat_number: clientData.vat_number,
          billing_email: clientData.billing_email,
          phone: clientData.phone,
          address: clientData.address,
          status: clientData.status,
          payment_terms_days: clientData.payment_terms_days,
          currency: clientData.currency,
          notes: clientData.notes,
        })
        .select()
        .single();

      if (clientErr) {
        console.error(`Failed to create client ${clientData.name}:`, clientErr.message);
      } else {
        console.log(`+ Created Client: ${clientData.name} (${insertedClient.id})`);
        clientMap.set(clientData.name, insertedClient.id);
      }
    } else {
      console.log(`= Existing Client: ${clientData.name} (${clientMap.get(clientData.name)})`);
    }
  }

  // 5. Seed Contracts linking Clients to Sites
  const canaryClientId = clientMap.get('Canary Wharf Group Plc');
  const canarySite = siteMap.get('CW-01');
  if (canaryClientId && canarySite) {
    const { data: existingContract } = await supabase
      .from('contracts')
      .select('id')
      .eq('company_id', company.id)
      .eq('client_id', canaryClientId)
      .eq('site_id', canarySite.id)
      .maybeSingle();

    if (!existingContract) {
      await supabase.from('contracts').insert({
        company_id: company.id,
        client_id: canaryClientId,
        site_id: canarySite.id,
        contract_number: `CNT-${siteMap.get('CW-01').code}-2026`,
        title: 'Canary Wharf Tower Security & Facilities Master Agreement',
        start_date: '2026-01-01',
        billing_cycle: 'monthly',
        hourly_billing_rate: 22.00,
        status: 'active',
      });
      console.log(`  + Seeded Active Master Contract for Canary Wharf Group`);
    }
  }

  const heathrowClientId = clientMap.get('Heathrow Airport Holdings Ltd');
  const heathrowSite = siteMap.get('HT-04');
  if (heathrowClientId && heathrowSite) {
    const { data: existingContract } = await supabase
      .from('contracts')
      .select('id')
      .eq('company_id', company.id)
      .eq('client_id', heathrowClientId)
      .eq('site_id', heathrowSite.id)
      .maybeSingle();

    if (!existingContract) {
      await supabase.from('contracts').insert({
        company_id: company.id,
        client_id: heathrowClientId,
        site_id: heathrowSite.id,
        contract_number: `CNT-${heathrowSite.code}-2026`,
        title: 'Heathrow Cargo Perimeter & Logistics Security Agreement',
        start_date: '2026-01-01',
        billing_cycle: 'monthly',
        hourly_billing_rate: 23.50,
        status: 'active',
      });
      console.log(`  + Seeded Active Master Contract for Heathrow Airport Holdings`);
    }
  }
}

async function runSeed() {
  console.log('Fetching active companies from Supabase...');
  const { data: companies, error } = await supabase
    .from('companies')
    .select('id, name, slug')
    .eq('status', 'active');

  if (error || !companies || companies.length === 0) {
    console.error('No active companies found or query failed:', error);
    process.exit(1);
  }

  console.log(`Found ${companies.length} active company tenants.`);
  for (const company of companies) {
    await seedCompany(company);
  }

  console.log('\n>>> All active tenants seeded with real operational sites, rates, clients, and contracts successfully! <<<');
}

runSeed().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
