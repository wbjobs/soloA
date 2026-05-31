import { GameServer } from './GameServer';

const PORT = parseInt(process.env.PORT || '3000');
const UDP_PORT = parseInt(process.env.UDP_PORT || '3001');
const GALAXY_SEED = parseInt(process.env.GALAXY_SEED || '42');

console.log('Starting Space Trade Simulation Server...');
console.log(`TCP Port: ${PORT}, UDP Port: ${UDP_PORT}, Seed: ${GALAXY_SEED}`);

const server = new GameServer(PORT, UDP_PORT, GALAXY_SEED);
server.start();

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.stop();
  process.exit(0);
});
