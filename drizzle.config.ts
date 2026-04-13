import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle', // Sem se vygenerují instalační SQL soubory
  dialect: 'sqlite',
  driver: 'expo',   // Důležité: Říkáme mu, že to je pro mobilní Expo
});