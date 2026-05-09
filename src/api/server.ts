import express, { Request, Response } from 'express';
import path from 'path';
import { scrapeKarriere } from '../scraper/karriere';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// ?q=developer  (defaults to "developer" if not provided)
app.get('/api/jobs', async (req: Request, res: Response) => {
    const searchTerm = typeof req.query.q === 'string' ? req.query.q : 'developer';

    try {
        const jobs = await scrapeKarriere(searchTerm);
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
