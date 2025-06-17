import { Client } from './Client.js';
import { DirectoryAuthority } from './DirectoryAuthority.js';
import { Relay, RelayType } from './Relay.js';

const entryRelay = new Relay(RelayType.GUARD_RELAY);
await entryRelay.run();

const middleRelay = new Relay(RelayType.MIDDLE_RELAY);
await middleRelay.run();

const exitRelay = new Relay(RelayType.EXIT_RELAY);
await exitRelay.run();

const directoryAuthority = new DirectoryAuthority();
await directoryAuthority.run();

await entryRelay.register(directoryAuthority.name);
await middleRelay.register(directoryAuthority.name);
await exitRelay.register(directoryAuthority.name);

console.log(directoryAuthority.getRelays());

const client = new Client(directoryAuthority.name);
await client.buildCircuit();

const { response } = await client.fetch('https://www.npmjs.com/');

console.log(response);
