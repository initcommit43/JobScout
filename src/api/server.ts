import express, { Request, Response } from 'express';
import path from 'path';
import { scrapeKarriere } from '../scraper/karriere';
import { scrapeDevjobs } from '../scraper/devjobs';
import { scrapeLinkedin } from '../scraper/linkedin';
import { scrapeAms } from '../scraper/ams';

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

const JOB_TITLES = [
    'Android Developer', 'Backend Developer', 'Cloud Engineer', 'Data Analyst',
    'Data Engineer', 'Data Scientist', 'DevOps Engineer', 'Embedded Developer',
    'Frontend Developer', 'Fullstack Developer', 'iOS Developer', 'IT Administrator',
    'IT Consultant', 'IT Projektmanager', 'IT Support', 'Java Developer',
    'Junior Developer', 'Kotlin Developer', 'Machine Learning Engineer', 'Mobile Developer',
    'Net Developer', 'Network Engineer', 'PHP Developer', 'Platform Engineer',
    'Product Owner', 'Python Developer', 'QA Engineer', 'React Developer',
    'SAP Developer', 'Scrum Master', 'Security Engineer', 'Senior Developer',
    'Site Reliability Engineer', 'Software Architect', 'Software Developer',
    'Software Engineer', 'System Administrator', 'TypeScript Developer',
    'UI UX Designer', 'Web Developer',
];

app.get('/api/suggestions', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : '';
    if (!q) return res.json([]);
    const matches = JOB_TITLES.filter(t => t.toLowerCase().includes(q)).slice(0, 8);
    res.json(matches);
});

// ?q=developer&source=all|karriere|devjobs  (defaults: q=developer, source=all)
app.get('/api/jobs', async (req: Request, res: Response) => {
    const searchTerm = typeof req.query.q === 'string' ? req.query.q : 'developer';
    const source = typeof req.query.source === 'string' ? req.query.source : 'all';
    const location = typeof req.query.location === 'string' && req.query.location ? req.query.location : undefined;

    try {
        const scrapers: Promise<any[]>[] = [];

        if (source === 'all' || source === 'karriere') scrapers.push(scrapeKarriere(searchTerm, location));
        if (source === 'all' || source === 'devjobs')  scrapers.push(scrapeDevjobs(searchTerm, location));
        if (source === 'all' || source === 'linkedin') scrapers.push(scrapeLinkedin(searchTerm, location));
        if (source === 'all' || source === 'ams')      scrapers.push(scrapeAms(searchTerm, location));

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
