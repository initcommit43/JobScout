import { runScrape } from '../lib/scrape-runner.ts';
import { ladeSources } from '../lib/sources.ts';
import { SCRAPER_NAMEN, SCRAPER_REGISTRY } from '../scrapers/registry.ts';
import { createStorage } from '../storage/index.ts';

/**
 * Fetches jobs from the configured portals into data/jobs/.
 *
 *   npm run scrape                 # alle Portale aus config/sources.json
 *   npm run scrape -- karriere.at  # nur dieses Portal
 */
async function main(): Promise<void> {
  const sources = await ladeSources();
  const gewuenscht = process.argv.slice(2);
  const namen = gewuenscht.length > 0 ? gewuenscht : Object.keys(sources);

  const unbekannt = namen.filter((name) => !SCRAPER_NAMEN.includes(name));
  if (unbekannt.length > 0) {
    console.error(
      `Unbekannte Portale: ${unbekannt.join(', ')}. Bekannt sind: ${SCRAPER_NAMEN.join(', ')}.`,
    );
    process.exitCode = 1;
    return;
  }

  const ohneAnfrage = namen.filter((name) => (sources[name] ?? []).length === 0);
  if (ohneAnfrage.length > 0) {
    console.error(
      `Ohne Suchanfrage in config/sources.json: ${ohneAnfrage.join(', ')}. ` +
        'Vorlage ist config/sources.example.json.',
    );
    process.exitCode = 1;
    return;
  }

  const ergebnisse = await runScrape({
    names: namen,
    registry: SCRAPER_REGISTRY,
    queriesFor: (name) => sources[name] ?? [],
    storage: createStorage(),
    onProgress: (name, current, total) => {
      process.stdout.write(`\r[${name}] ${String(current)}/${String(total)}          `);
    },
  });

  process.stdout.write('\n');
  for (const ergebnis of ergebnisse) {
    if (ergebnis.ok) {
      console.log(`${ergebnis.name}: ${String(ergebnis.newCount)} neu, ${String(ergebnis.skipCount)} bekannt`);
    } else {
      console.error(`${ergebnis.name}: fehlgeschlagen —`, ergebnis.error);
    }
  }

  if (ergebnisse.every((ergebnis) => !ergebnis.ok)) process.exitCode = 1;
}

await main();
