import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

export interface TestAnfrage {
  method: string;
  pfad: string;
  body: unknown;
}

export interface TestServer {
  baseURL: string;
  /** Every request the adapter sent, in order. */
  anfragen: TestAnfrage[];
  schliessen(): Promise<void>;
}

type Antwort = { status?: number; body: unknown };
type Handler = (anfrage: TestAnfrage) => Antwort;

/**
 * A loopback stand-in for a provider endpoint. Not a network test: nothing leaves
 * the machine and no key is involved — it only lets us assert the exact request
 * shape an adapter builds, which a mocked SDK would quietly let us get wrong.
 */
export async function testServer(handler: Handler): Promise<TestServer> {
  const anfragen: TestAnfrage[] = [];

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const teile: Buffer[] = [];
    req.on('data', (teil: Buffer) => teile.push(teil));
    req.on('end', () => {
      const roh = Buffer.concat(teile).toString('utf8');
      const anfrage: TestAnfrage = {
        method: req.method ?? 'GET',
        pfad: req.url ?? '/',
        body: roh.length > 0 ? (JSON.parse(roh) as unknown) : undefined,
      };
      anfragen.push(anfrage);

      const antwort = handler(anfrage);
      res.writeHead(antwort.status ?? 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(antwort.body));
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const adresse = server.address() as AddressInfo;

  return {
    baseURL: `http://127.0.0.1:${String(adresse.port)}/v1`,
    anfragen,
    async schliessen() {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

export function chatAntwort(inhalt: string): Antwort {
  return {
    body: {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 0,
      model: 'test-model',
      choices: [{ index: 0, message: { role: 'assistant', content: inhalt }, finish_reason: 'stop' }],
    },
  };
}
