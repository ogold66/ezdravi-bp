import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// 1. UŽIVATELÉ (Users)
export const users = sqliteTable('users', {
  user_id: integer('user_id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  created_at: text('created_at').notNull(),
});

// 2. Diagnózy (Diagnoses)
export const diseases = sqliteTable('diseases', {
  disease_id: integer('disease_id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.user_id),
  disease_name: text('disease_name').notNull(),
  type: text('type').notNull(), // 'ACUTE' nebo 'CHRONIC'
  note: text('note'),
  start_date: text('start_date'), 
  end_date: text('end_date'), // Pokud je null, nemoc stále probíhá
});

// 3. NÁVŠTĚVY LÉKAŘE (Visits)
export const visits = sqliteTable('visits', {
  visit_id: integer('visit_id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.user_id),
  disease_id: integer('disease_id').references(() => diseases.disease_id),
  hospital: text('hospital'),
  department: text('department'),
  date: text('date'),
  doctor: text('doctor'),
  note: text('note'),
  medical_report: text('medical_report'), 
  status: text('status'), // 'PLANNED', 'COMPLETED', 'MISSED'
});

// ==========================================
// NOVÝ KONCEPT: LÉKÁRNIČKA VS. PLÁNY
// ==========================================

// 4. LÉKÁRNIČKA - Fyzický sklad (Inventory)
export const inventory = sqliteTable('inventory', {
  inventory_id: integer('inventory_id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.user_id),
  visit_id: integer('visit_id').references(() => visits.visit_id),
  
  medication_name: text('medication_name').notNull(), // Např. "Zyrtec"
  form: text('form').notNull(), // 'PILL' nebo 'SYRUP'
  unit: text('unit').notNull(), // 'ks' nebo 'ml'
  
  total_qty: real('total_qty').notNull(), // Kolik toho bylo na začátku (např. 30)
  remaining_qty: real('remaining_qty').notNull(), // Kolik reálně zbývá v krabičce (např. 25)
  
  expiration_date: text('expiration_date'), // Kdy lék projde
  status: text('status').default('ACTIVE'), // 'ACTIVE' (mám ho) nebo 'DEPLETED' (došel/vyhozen)
  
  created_at: text('created_at').notNull(),
  depleted_at: text('depleted_at'), // Kdy jsem krabičku dobral (pro historii)
});

// 5. KARTOTÉKA - Režim užívání (Medication Plans)
// Zde se definuje, JAK se konkrétní krabička z Lékárničky používá pro danou nemoc.
export const medicationPlans = sqliteTable('medication_plans', {
  plan_id: integer('plan_id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').references(() => users.user_id),
  
  // VAZBY NA OKOLÍ
  inventory_id: integer('inventory_id').references(() => inventory.inventory_id).notNull(), // Která fyzická krabička se bere
  disease_id: integer('disease_id').references(() => diseases.disease_id), // Na jakou nemoc to je (volitelné, může to být prevence)
  
  // TYP UŽÍVÁNÍ
  is_sos: integer('is_sos', { mode: 'boolean' }).default(false), // Je to jen podle potřeby?
  interval_hint: text('interval_hint'), // Např. "při bolesti, max po 6h" (pro SOS)
  
  // FORMÁT: [{"days":["1","2"],"doses":[{"time":"08:00","amount":1}]}]
  doses_config: text('doses_config').notNull(), 
  
  // OD KDY DO KDY TENTO PLÁN PLATÍ
  start_date: text('start_date'), 
  end_date: text('end_date'), // Pokud plán ukončím a vytvořím nový, tady bude datum konce
  
  created_at: text('created_at').notNull(),
});

// 6. HISTORIE UŽÍVÁNÍ - Logy (Medication Logs)
export const medicationLogs = sqliteTable('medication_logs', {
  log_id: integer('log_id').primaryKey({ autoIncrement: true }),
  plan_id: integer('plan_id').references(() => medicationPlans.plan_id).notNull(), // Kterého plánu se to týká
  inventory_id: integer('inventory_id').references(() => inventory.inventory_id).notNull(),
  
  scheduled_date: text('scheduled_date'), // ISO YYYY-MM-DD (Pro snazší filtrování "Dneška")
  scheduled_time: text('scheduled_time'), // HH:mm (Kdy se to mělo vzít, u SOS bude null)
  
  taken_at: text('taken_at'), // ISO Timestamp reálného odkliknutí (kdy to opravdu polkl)
  
  amount: real('amount').notNull(), // Kolik ks/ml se reálně vzalo (abychom to uměli "vrátit" do krabičky při chybě)
  status: text('status').notNull(), // 'TAKEN' (vzal) nebo 'MISSED' (úmyslně nevzal)
});

// 7. LÉKAŘSKÉ ZPRÁVY A DOKUMENTY (Visit Documents)
export const visitDocuments = sqliteTable('visit_documents', {
  document_id: integer('document_id').primaryKey({ autoIncrement: true }),
  visit_id: integer('visit_id').references(() => visits.visit_id).notNull(), // K jaké návštěvě to patří
  
  uri: text('uri').notNull(), // Cesta k souboru (fotce) v telefonu
  type: text('type').default('IMAGE'), // 'IMAGE' nebo 'PDF'
  
  created_at: text('created_at').notNull(),
});
