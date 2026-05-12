# WhereTheFlix

Eine kleine Info-App, die einen IMDb-Titel sucht und live prueft, in welchen Netflix-Regionen der Titel laut regionalen JustWatch-Katalogseiten verfuegbar ist.

## Start

```powershell
npm.cmd run dev
```

Danach im Browser oeffnen:

```text
http://localhost:3000
```

## Datenquellen

- IMDb Suggestions: Titel, IMDb-ID, Jahr, Poster und Basismetadaten.
- JustWatch-Webseiten: regionale Streaming-Angebote aus dem serverseitig gerenderten Apollo-State.

Netflix selbst wird nicht direkt gescraped, weil Netflix keine oeffentliche Katalog-API anbietet und direkte Abfragen stark von Login, Region und Bot-Schutz abhaengen.
