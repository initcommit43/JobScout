export interface Job {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    description?: string;
    salary?: string;
    salaryMin?: number;       // parsed from salary string for filtering
    level?: string;           // e.g. Junior, Senior, Lead
    employmentType?: string;  // e.g. Vollzeit, Teilzeit, Hybrid, Remote
    postedAt: Date;
    source: 'karriere' | 'devjobs' | 'linkedin' | 'ams';
}
