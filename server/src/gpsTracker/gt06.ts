/**
 * Servidor TCP para trackers GPS físicos por hardware (protocolo GT06, común en
 * dispositivos económicos de rastreo vehicular). Sin hardware real a mano para
 * probar contra un dispositivo, esta implementación sigue la variante más
 * documentada del protocolo (start 0x78 0x78, CRC-ITU/X.25) — puede necesitar
 * ajustes menores según el modelo exacto de tracker que se compre.
 *
 * Referencia rápida del framing:
 *   [0x78 0x78] [largo] [protocolo] [contenido...] [serial:2] [crc:2] [0x0D 0x0A]
 */
import { createServer, type Socket } from 'node:net';
import { recordGpsPoint, touchTracker } from '../routes/gps.js';

const START = Buffer.from([0x78, 0x78]);
const STOP = Buffer.from([0x0d, 0x0a]);

const PROTO_LOGIN = 0x01;
const LOCATION_PROTOCOLS = new Set([0x12, 0x16, 0x22, 0x32]);

function crcItu(buf: Buffer): number {
  let crc = 0xffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? (crc >> 1) ^ 0x8408 : crc >> 1;
    }
  }
  return (~crc) & 0xffff;
}

function buildAck(protocol: number, serial: number): Buffer {
  const body = Buffer.from([protocol, (serial >> 8) & 0xff, serial & 0xff]);
  const length = body.length + 2; // + crc
  const crc = crcItu(Buffer.concat([Buffer.from([length]), body]));
  return Buffer.concat([
    START,
    Buffer.from([length]),
    body,
    Buffer.from([(crc >> 8) & 0xff, crc & 0xff]),
    STOP,
  ]);
}

function bcdImei(content: Buffer): string {
  // Terminal ID: 8 bytes BCD-packed -> 16 dígitos, el IMEI real son los 15 últimos.
  let digits = '';
  for (const byte of content.subarray(0, 8)) {
    digits += byte.toString(16).padStart(2, '0');
  }
  return digits.replace(/^0/, '').slice(0, 15);
}

function decodeLocation(content: Buffer): { lat: number; lng: number } | null {
  // date/time (6) + gps-info-length&satellites (1) + lat (4) + lng (4) + speed (1) + curso/estado (2)
  if (content.length < 18) return null;
  const rawLat = content.readUInt32BE(7);
  const rawLng = content.readUInt32BE(11);
  const courseStatus = content.readUInt16BE(16);
  const isSouth = (courseStatus & 0x0400) !== 0;
  const isWest = (courseStatus & 0x0800) !== 0;
  let lat = rawLat / 1800000;
  let lng = rawLng / 1800000;
  if (isSouth) lat = -lat;
  if (isWest) lng = -lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  return { lat, lng };
}

interface ConnState {
  imei?: string;
  buffer: Buffer;
}

function handleFrame(state: ConnState, socket: Socket, frame: Buffer) {
  const length = frame[0];
  const protocol = frame[1];
  const content = frame.subarray(2, 2 + length - 1 - 2 - 2);
  const serial = frame.readUInt16BE(2 + content.length);

  if (protocol === PROTO_LOGIN) {
    state.imei = bcdImei(content);
    socket.write(buildAck(protocol, serial));
    void touchTracker(state.imei).catch(() => {});
    return;
  }

  if (LOCATION_PROTOCOLS.has(protocol) && state.imei) {
    const loc = decodeLocation(content);
    if (loc) {
      void touchTracker(state.imei).then((courierId) => {
        if (courierId) void recordGpsPoint(courierId, loc.lat, loc.lng, Date.now());
      }).catch(() => {});
    }
    socket.write(buildAck(protocol, serial));
  }
}

function consumeBuffer(state: ConnState, socket: Socket) {
  for (;;) {
    const startIdx = state.buffer.indexOf(START);
    if (startIdx < 0) {
      state.buffer = Buffer.alloc(0);
      return;
    }
    if (startIdx > 0) state.buffer = state.buffer.subarray(startIdx);
    if (state.buffer.length < 3) return;

    const length = state.buffer[2]; // byte justo después de los dos bytes de inicio
    if (state.buffer.length < 2 + 1 + length + STOP.length) return; // aún no llegó el paquete completo

    const frame = state.buffer.subarray(2, 2 + 1 + length);
    try {
      handleFrame(state, socket, frame);
    } catch {
      // paquete con formato inesperado (variante de hardware distinta) — se descarta
    }
    state.buffer = state.buffer.subarray(2 + 1 + length + STOP.length);
  }
}

export function startGt06Server(port: number): void {
  const server = createServer((socket) => {
    const state: ConnState = { buffer: Buffer.alloc(0) };
    socket.on('data', (chunk) => {
      state.buffer = Buffer.concat([state.buffer, chunk]);
      consumeBuffer(state, socket);
    });
    socket.on('error', () => {});
  });
  server.listen(port, () => {
    console.log(`Servidor GT06 (trackers GPS) escuchando en :${port}`);
  });
}
