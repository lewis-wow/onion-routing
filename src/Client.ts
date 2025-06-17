import { createCipheriv, createDiffieHellman } from 'node:crypto';
import { IRelay, RelayType } from './Relay.js';
import { Utils } from './Utils.js';

export type CircuitRelaySession = {
  relay: IRelay;
  sessionId: string;
  sharedSecret: string;
  iv: string;
};

export type Circuit = {
  entry: CircuitRelaySession;
  middle: CircuitRelaySession;
  exit: CircuitRelaySession;
};

export type Payload = {
  sessionId: string;
  algorithm: string;
  encryptedPayload: string;
};

export type ExitPayload = {
  url: string;
  init?: RequestInit;
};

export type DecryptedPayload = {
  nextRelay: IRelay;
  nextPayload: Payload;
};

export class Client {
  private circuit: Circuit | undefined = undefined;

  constructor(public directoryAuthority: string) {}

  async fetch<T = unknown>(url: string, init?: RequestInit) {
    if (!this.circuit) {
      throw new Error("Client: circuit wasn't built yet.");
    }

    const exitPayload: Payload = {
      sessionId: this.circuit.exit.sessionId,
      ...this.encrypt(
        JSON.stringify({
          url,
          init,
        } as ExitPayload),
        this.circuit.exit,
      ),
    };

    const middlePayload: Payload = {
      sessionId: this.circuit.middle.sessionId,
      ...this.encrypt(
        JSON.stringify({
          nextRelay: this.circuit.exit.relay,
          nextPayload: exitPayload,
        } as DecryptedPayload),
        this.circuit.middle,
      ),
    };

    const entryPayload: Payload = {
      sessionId: this.circuit.entry.sessionId,
      ...this.encrypt(
        JSON.stringify({
          nextRelay: this.circuit.middle.relay,
          nextPayload: middlePayload,
        } as DecryptedPayload),
        this.circuit.entry,
      ),
    };

    const { response, data } = await Utils.fetchData<T>(
      Utils.createURLFromNodeName(this.circuit.entry.relay.name, 'route'),
      {
        method: 'POST',
        body: JSON.stringify(entryPayload),
      },
    );

    return {
      response,
      data,
    };
  }

  async buildCircuit(): Promise<void> {
    const relayPool = await this.listRelays();
    const circuit = await this._buildCircuit(relayPool);

    this.circuit = circuit;
  }

  private async listRelays(): Promise<IRelay[]> {
    const { data } = await Utils.fetchData<IRelay[]>(
      Utils.createURLFromNodeName(this.directoryAuthority, 'list'),
    );

    return data ?? [];
  }

  private async _buildCircuit(relays: IRelay[]): Promise<Circuit> {
    const entryRelay = this.findRelay(relays, RelayType.GUARD_RELAY);
    const middleRelay = this.findRelay(relays, RelayType.MIDDLE_RELAY);
    const exitRelay = this.findRelay(relays, RelayType.EXIT_RELAY);

    const circuit = {
      entry: await this.createSessionWithRelay(entryRelay),
      middle: await this.createSessionWithRelay(middleRelay),
      exit: await this.createSessionWithRelay(exitRelay),
    };

    return circuit;
  }

  private findRelay(relays: IRelay[], relayType: RelayType) {
    const relay = relays.find((relay) => relay.relayType === relayType);

    if (!relay) {
      throw new Error('Client: could not build circuit.');
    }

    return relay;
  }

  private async createSessionWithRelay(relay: IRelay) {
    const dh = createDiffieHellman(Client.DIFFIE_HELLMAN_PRIME_LENGHT);
    const clientPublicKey = dh.generateKeys('base64');
    const clientPrime = dh.getPrime('base64');
    const clientGenerator = dh.getGenerator('base64');

    const { data } = await Utils.fetchData<{
      sessionId: string;
      serverPublicKey: string;
      iv: string;
    }>(`http://${relay.name}/session`, {
      method: 'POST',
      body: JSON.stringify({
        clientPublicKey,
        clientPrime,
        clientGenerator,
      }),
    });

    if (!data) {
      throw new Error('Client: cannot create session with relay.');
    }

    const sharedSecret = dh.computeSecret(
      Buffer.from(data.serverPublicKey, 'base64'),
      null,
      'base64',
    );

    return {
      sessionId: data.sessionId,
      iv: data.iv,
      sharedSecret,
      relay,
    };
  }

  private encrypt(
    message: string,
    encryptOpts: { sharedSecret: string; iv: string },
  ) {
    const cipher = createCipheriv(
      Client.CIPHER_ALGORITHM,
      encryptOpts.sharedSecret,
      encryptOpts.iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(message, 'utf8'),
      cipher.final(),
    ]);

    return {
      encryptedPayload: encrypted.toString('hex'),
      algorithm: Client.CIPHER_ALGORITHM,
    };
  }

  static readonly DIFFIE_HELLMAN_PRIME_LENGHT = 2048;
  static readonly CIPHER_ALGORITHM = 'aes-256-cbc';
}
