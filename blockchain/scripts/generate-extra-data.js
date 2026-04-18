'use strict';
const fs   = require('fs');
const path = require('path');

const VALIDATORS = ['0xfe3b557e8fb62b89f4916b721be55ceb828dbd73'];

function toBuffer(hex) {
  return Buffer.from(hex.replace('0x','').toLowerCase(), 'hex');
}

// RLP encode a single byte array
function rlpEncodeBytes(buf) {
  if (buf.length === 1 && buf[0] < 0x80) return buf;
  if (buf.length <= 55) return Buffer.concat([Buffer.from([0x80 + buf.length]), buf]);
  const lenHex = buf.length.toString(16).padStart(2,'0');
  const lenBuf = Buffer.from(lenHex, 'hex');
  return Buffer.concat([Buffer.from([0xb7 + lenBuf.length]), lenBuf, buf]);
}

// RLP encode a list of buffers
function rlpEncodeList(items) {
  const encoded = Buffer.concat(items.map(rlpEncodeBytes));
  if (encoded.length <= 55)
    return Buffer.concat([Buffer.from([0xc0 + encoded.length]), encoded]);
  const lenHex = encoded.length.toString(16).padStart(2,'0');
  const lenBuf = Buffer.from(lenHex, 'hex');
  return Buffer.concat([Buffer.from([0xf7 + lenBuf.length]), lenBuf, encoded]);
}

const vanity     = Buffer.alloc(32, 0);
const validators = rlpEncodeList(VALIDATORS.map(toBuffer));
const emptyList  = rlpEncodeList([]);   // vote
const emptyList2 = rlpEncodeList([]);   // seals

const extraData = '0x' + Buffer.concat([vanity, validators, emptyList, emptyList2]).toString('hex');

console.log('\n[extraData]', extraData);
console.log('Validators:', VALIDATORS);

const genesisPath = path.resolve(__dirname, '../config/genesis.json');
const genesis = JSON.parse(fs.readFileSync(genesisPath, 'utf8'));
genesis.extraData = extraData;
fs.writeFileSync(genesisPath, JSON.stringify(genesis, null, 2));
console.log('\n[ok] genesis.json updated. Start Besu: ./besu-start.sh\n');
