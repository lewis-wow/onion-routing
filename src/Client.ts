import { createCipheriv, randomBytes } from 'node:crypto';
import { IRelay, Relay, RelayType } from './Relay.js';
import { Utils } from './Utils.js';

export type Circuit = {
  entryRelay: IRelay;
  middleRelay: IRelay;
  exitRelay: IRelay;
};

export class Client {
  constructor(public directoryAuthority: string) {}

  async list(): Promise<IRelay[] | null> {
    return Utils.fetchData(this.directoryAuthority);
  }

  buildCircuit(relays: IRelay[]): Circuit {
    const entryRelay = relays.find(
      (relay) => relay.relayType === RelayType.GUARD_RELAY,
    );
    const middleRelay = relays.find(
      (relay) => relay.relayType === RelayType.MIDDLE_RELAY,
    );
    const exitRelay = relays.find(
      (relay) => relay.relayType === RelayType.EXIT_RELAY,
    );

    if (!entryRelay || !middleRelay || !exitRelay) {
      throw new Error('Client: could not build circuit.');
    }

    return {
      entryRelay,
      middleRelay,
      exitRelay,
    };
  }

  async createSession(circuit: Circuit): Promise<void> {
    await Utils.fetchData<string>(`http://${circuit.entryRelay.name}/session`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await Utils.fetchData<string>(
      `http://${circuit.middleRelay.name}/session`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );

    await Utils.fetchData<string>(`http://${circuit.exitRelay.name}/session`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  private encrypt(message: string, aesKey: string) {
    const iv = randomBytes(16);
    const cipher = createCipheriv(Relay.CIPHER_ALGORITHM, aesKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(message, 'utf8'),
      cipher.final(),
    ]);

    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted.toString('hex'),
    };
  }
}
