# Credits

## Scraper-Schicht

Die Portal-Adapter unter `scrapers/` sowie die zugehörigen Hilfsmodule
(`lib/fetch-page.ts`, `lib/normalize-description.ts`, `lib/grid-batch.ts`,
`lib/query-schema.ts`, `lib/scrape-runner.ts`, `lib/hash.ts`, `lib/slugify.ts`,
`storage/`) stammen aus [`Saos-EBB/JoBBoT`](https://github.com/Saos-EBB/JoBBoT) und
wurden mit ausdrücklicher Zustimmung des Repository-Inhabers übernommen.

Dank an **saos** für die Weiterentwicklung der ursprünglichen Adapter und für die
Freigabe zur Wiederverwendung. Die Logik ist unverändert übernommen; angepasst wurden
die Kommentarsprache (Englisch), die Typisierung für die strengere `tsconfig` dieses
Repos und die Auflösung der Konfigurationspfade.

Die Test-Fixtures unter `test/fixtures/` sind mitgeschnittene Portalseiten aus demselben
Repo. Enthaltene Kontaktadressen, Personennamen und Tracking-Token wurden vor der
Übernahme durch Platzhalter auf `@example.com` ersetzt.

## Abhängigkeiten

Die verwendeten Bibliotheken stehen in `package.json`; ihre Lizenzen liegen unter
`node_modules/<paket>/LICENSE`.
