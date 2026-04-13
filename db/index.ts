import { openDatabaseSync } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

// 1. Otevře (nebo vytvoří) reálný soubor databáze v telefonu
export const expoDb = openDatabaseSync('ezdravi.db');

// 2. Propojí Expo SQLite s Drizzle ORM a naším schématem
export const db = drizzle(expoDb, { schema });