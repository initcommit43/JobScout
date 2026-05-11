import express, { Request, Response } from 'express';
import path from 'path';
import { scrapeKarriere } from '../scraper/karriere';
import { scrapeDevjobs } from '../scraper/devjobs';
import { scrapeLinkedin } from '../scraper/linkedin';
import { scrapeAms } from '../scraper/ams';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// ?q=developer&source=all|karriere|devjobs  (defaults: q=developer, source=all)
app.get('/api/jobs', async (req: Request, res: Response) => {
    const searchTerm = typeof req.query.q === 'string' ? req.query.q : 'developer';
    const source = typeof req.query.source === 'string' ? req.query.source : 'all';

    try {
        const scrapers: Promise<any[]>[] = [];

        if (source === 'all' || source === 'karriere') scrapers.push(scrapeKarriere(searchTerm));
        if (source === 'all' || source === 'devjobs')  scrapers.push(scrapeDevjobs(searchTerm));
        if (source === 'all' || source === 'linkedin') scrapers.push(scrapeLinkedin(searchTerm));
        if (source === 'all' || source === 'ams')      scrapers.push(scrapeAms(searchTerm));

        const results = await Promise.all(scrapers);
        const jobs = results.flat().sort((a, b) => b.postedAt - a.postedAt);

        res.json(jobs);
    } catch (error) {
        console.error('Failed to fetch jobs:', error);
        res.status(500).json({ error: 'scraper failed' });
    }
});

app.listen(3000, () => {
    console.log('Server läuft auf Port 3000');
});

export default app;
