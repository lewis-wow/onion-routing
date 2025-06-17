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

type ExitNodePayload = {
  url: string;
  init?: RequestInit;
};

type NodePayload = {
  relayId: string;
  nextPayload: string;
};

/*
export type RelayPayload =
  | {
      relayType: RelayType.EXIT_RELAY;
      payload: {
        url: string;
        init?: RequestInit;
      };
    }
  | {
      relayType: RelayType.GUARD_RELAY | RelayType.MIDDLE_RELAY;
      payload: {
        relayId: string;
        remainingPayload: string;
      };
    };
*/

const payloadSchema = z
  .object({
    relayType: z.enum([RelayType.EXIT_RELAY]),
    payload: z.object({
      url: z.string().url(),
      init: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .or(
    z.object({
      relayType: z.enum([RelayType.GUARD_RELAY, RelayType.MIDDLE_RELAY]),
      payload: z.object({
        relayId: z.string(),
        remainingPayload: z.string(),
      }),
    }),
  );
export type RelayPayload = z.infer<typeof payloadSchema>;

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
            payload: z.string(),
          }),
        ),
        async (c) => {
          const { sessionId, payload } = c.req.valid('json');

          const session = sessions.find(
            (session) => session.sessionId === sessionId,
          );

          if (!session) {
            throw new HTTPException(400);
          }

          const decryptedPayload = this.decrypt(
            payload,
            session.sharedSecret,
            session.iv,
          );

          const parsedPayload = JSON.parse(btoa(decryptedPayload));
          const validatedPayload = payloadSchema.parse(parsedPayload);

          if (
            validatedPayload.relayType === RelayType.EXIT_RELAY &&
            this.relayType !== RelayType.EXIT_RELAY
          ) {
            throw new HTTPException(400);
          }

          if (validatedPayload.relayType === RelayType.EXIT_RELAY) {
            return await this.exitNodeFetch(validatedPayload.payload);
          }

          return this.forwardRoute(validatedPayload.payload);
        },
      );
  }

  private async forwardRoute(nodePayload: NodePayload): Promise<Response> {
    const response = await fetch(`http://${nodePayload.relayId}/route`, {
      body: JSON.stringify({
        payload: nodePayload.nextPayload,
      }),
    });

    return response;
  }

  private async exitNodeFetch(
    exitNodePayload: ExitNodePayload,
  ): Promise<Response> {
    const response = await fetch(exitNodePayload.url, exitNodePayload.init);

    return response;
  }

  private decrypt(
    encryptedData: string,
    aesKey: string,
    ivHex: string,
  ): string {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  static readonly CIPHER_ALGORITHM = 'aes-256-cbc';
}
