export interface Job {
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    description?: string;
    salary?: string;
    employmentType?: string;
    postedAt: Date;
    source: 'karriere' | 'devjobs' | 'linkedin' | 'ams';
}
