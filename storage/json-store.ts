import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { dataPfad } from '../lib/pfade.ts';
import { jobBasename } from '../lib/slugify.ts';
import type { Fit, Job, JobStatus } from '../scrapers/interface.ts';
import type { Storage } from './index.ts';

const FIT_ORDNER: readonly Fit[] = ['matched', 'offstack', 'brutal'];

/**
 * One JSON file per job. Triaged jobs are sorted into a subfolder named after their fit;
 * every other status stays in the base folder.
 */
export class JsonStore implements Storage {
  private readonly dir: string;

  constructor(basisVerzeichnis?: string) {
    // Resolved at construction, cwd-relative — never via import.meta.url.
    this.dir = basisVerzeichnis ?? dataPfad('jobs');
  }

  private dateiname(job: Job): string {
    return `${jobBasename(job)}.json`;
  }

  private ordnerFuer(job: Job): string {
    if (job.status !== 'triaged' || job.fit === null) return this.dir;
    return join(this.dir, job.fit);
  }

  private alleOrdner(): string[] {
    return [this.dir, ...FIT_ORDNER.map((fit) => join(this.dir, fit))];
  }

  /** Matches on the id suffix because the file name carries title and company too. */
  private async findeDatei(id: string): Promise<string | null> {
    for (const ordner of this.alleOrdner()) {
      const treffer = await sucheImOrdner(ordner, id);
      if (treffer !== null) return join(ordner, treffer);
    }
    return null;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.findeDatei(id)) !== null;
  }

  async save(job: Job): Promise<void> {
    const zielOrdner = this.ordnerFuer(job);
    await mkdir(zielOrdner, { recursive: true });
    const ziel = join(zielOrdner, this.dateiname(job));
    const temp = join(zielOrdner, `.tmp-${randomBytes(6).toString('hex')}.json`);
    await writeFile(temp, JSON.stringify(job, null, 2), 'utf8');
    await rename(temp, ziel);

    // If the job previously lived in ANOTHER folder (status change, e.g. matched →
    // generated), drop the old file. All other folders are checked explicitly rather
    // than via findeDatei(), which returns only the FIRST hit: a hit in the folder just
    // written would otherwise hide a stale file elsewhere.
    for (const ordner of this.alleOrdner()) {
      if (ordner === zielOrdner) continue;
      const treffer = await sucheImOrdner(ordner, job.id);
      if (treffer !== null) await entferne(join(ordner, treffer));
    }
  }

  async get(id: string): Promise<Job | null> {
    const pfad = await this.findeDatei(id);
    if (pfad === null) return null;
    try {
      return JSON.parse(await readFile(pfad, 'utf8')) as Job;
    } catch {
      return null;
    }
  }

  async list(filter?: { status?: JobStatus }): Promise<Job[]> {
    const jobs: Job[] = [];
    for (const ordner of this.alleOrdner()) {
      await mkdir(ordner, { recursive: true });
      // Skipping dotfiles covers both .tmp-* and .gitkeep, so no corrupt-file warning
      // is printed for a file that was never a job.
      const dateien = (await readdir(ordner)).filter(
        (datei) => datei.endsWith('.json') && !datei.startsWith('.'),
      );
      for (const datei of dateien) {
        try {
          const job = JSON.parse(await readFile(join(ordner, datei), 'utf8')) as Job;
          if (filter?.status === undefined || job.status === filter.status) jobs.push(job);
        } catch {
          console.warn(`[storage] Datei uebersprungen, kein gueltiges JSON: ${datei}`);
        }
      }
    }
    return jobs;
  }

  /**
   * Patch, not replace. A long-running generation must not overwrite changes the UI made
   * to the same job in the meantime.
   */
  async update(id: string, patch: Partial<Job>): Promise<Job> {
    const vorhanden = await this.get(id);
    if (vorhanden === null) throw new Error(`Job nicht gefunden: ${id}`);
    const aktualisiert = { ...vorhanden, ...patch, updatedAt: new Date().toISOString() };
    await this.save(aktualisiert);
    return aktualisiert;
  }

  async updateStatus(id: string, status: JobStatus): Promise<Job> {
    return this.update(id, { status });
  }

  async delete(id: string): Promise<void> {
    const pfad = await this.findeDatei(id);
    if (pfad !== null) await entferne(pfad);
  }

  async deleteJob(job: Job): Promise<void> {
    await entferne(join(this.ordnerFuer(job), this.dateiname(job)));
  }
}

async function sucheImOrdner(ordner: string, id: string): Promise<string | null> {
  try {
    const dateien = await readdir(ordner);
    return dateien.find((datei) => datei.endsWith(`_${id.slice(0, 8)}.json`)) ?? null;
  } catch {
    return null; // Ordner existiert (noch) nicht
  }
}

async function entferne(pfad: string): Promise<void> {
  try {
    await unlink(pfad);
  } catch {
    // schon weg
  }
}
