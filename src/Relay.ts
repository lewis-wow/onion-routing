import { zValidator } from '@hono/zod-validator';
import {
  createDecipheriv,
  createDiffieHellman,
  randomBytes,
} from 'node:crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { HTTPException } from 'hono/http-exception';
import { Node } from './Node.js';
import { DecryptedPayload, ExitPayload, Payload } from './Client.js';

export type Session = {
  sessionId: string;
  sharedSecret: string;
  iv: string;
};

const sessions: Session[] = [];

export const ALGORITHM = 'aes-192-cbc';

export enum RelayType {
  GUARD_RELAY = 'GUARD_RELAY',
  MIDDLE_RELAY = 'MIDDLE_RELAY',
  EXIT_RELAY = 'EXIT_RELAY',
}

export interface IRelay {
  relayType: RelayType;
  name: string;
}

export class Relay extends Node implements IRelay {
  constructor(public relayType: RelayType) {
    super();

    this.app
      .post(
        '/session',
        zValidator(
          'json',
          z.object({
            clientPublicKey: z.string(),
            clientPrime: z.string(),
            clientGenerator: z.string(),
          }),
        ),
        async (c) => {
          const { clientPublicKey, clientPrime, clientGenerator } =
            c.req.valid('json');

          const dh = createDiffieHellman(
            Buffer.from(clientPrime, 'base64'),
            Buffer.from(clientGenerator, 'base64'),
          );

          const sharedSecret = dh.computeSecret(
            Buffer.from(clientPublicKey, 'base64'),
            null,
            'base64',
          );

          const serverPublicKey = dh.generateKeys('base64');
          const iv = randomBytes(16).toString('base64');
          const sessionId = uuidv4();

          sessions.push({
            sessionId,
            sharedSecret,
            iv,
          });

          return c.json({
            sessionId,
            serverPublicKey,
            iv,
          });
        },
      )
      .post(
        '/route',
        zValidator(
          'json',
          z.object({
            sessionId: z.string(),
            algorithm: z.string(),
            encryptedPayload: z.string(),
          }),
        ),
        async (c) => {
          const { sessionId, algorithm, encryptedPayload } =
            c.req.valid('json');

          const session = sessions.find(
            (session) => session.sessionId === sessionId,
          );

          if (!session) {
            throw new HTTPException(400);
          }

          const decryptedPayload = this.decrypt(
            encryptedPayload,
            algorithm,
            session.sharedSecret,
            session.iv,
          );

          const parsedPayload: DecryptedPayload = JSON.parse(decryptedPayload);

          if (
            parsedPayload.nextRelay.relayType === RelayType.EXIT_RELAY &&
            this.relayType !== RelayType.EXIT_RELAY
          ) {
            throw new HTTPException(400);
          }

          if (parsedPayload.nextRelay.relayType === RelayType.EXIT_RELAY) {
            return await this.fetchExit(
              parsedPayload.nextPayload as unknown as ExitPayload,
            );
          }

          return this.forwardRoute(
            parsedPayload.nextRelay,
            parsedPayload.nextPayload,
          );
        },
      );
  }

  private async forwardRoute(
    nextRelay: IRelay,
    nextPayload: Payload,
  ): Promise<Response> {
    const response = await fetch(`http://${nextRelay.name}/route`, {
      method: 'POST',
      body: JSON.stringify(nextPayload),
    });

    return response;
  }

  private async fetchExit({
    url,
    init,
  }: {
    url: string;
    init?: RequestInit;
  }): Promise<Response> {
    const response = await fetch(url, init);

    return response;
  }

  private decrypt(
    encryptedData: string,
    algorithm: string,
    aesKey: string,
    ivHex: string,
  ): string {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(algorithm, aesKey, iv);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
