// Compact "sync code" — a bidirectional encoding of the lease plus as many
// recent readings as fit, aimed at a ~64-character case-sensitive string
// (base64url is 6 bits/char, so 64 chars = 384 bits total).
//
// This is deliberately NOT a full backup: the mileage log is open-ended, and
// no fixed-length code can hold years of frequent readings. It carries the
// full lease config (dates, allowance, starting odometer, overage rate, a
// short vehicle name) plus the most recent readings that fit in the budget —
// enough to keep pace calculations accurate when you resume on another
// device. Use Export JSON for a complete, unlimited-history backup.

import { daysBetween, addDays } from './calculations.js';
import { makeEntryId } from './storage.js';

const VERSION = 1;
const EPOCH = '2000-01-01';
const TARGET_BITS = 64 * 6; // 384 — the ~64-char budget

const NAME_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 -';
const NAME_MAX_CHARS = 12;

const FIELD_BITS = {
  version: 4,
  startDate: 16,
  termMonths: 8,
  annualAllowance: 16,
  startOdometer: 24,
  overageCents: 8,
  nameLength: 4,
  nameChar: 6,
  includedCount: 8,
  totalCount: 8,
  entryDayDelta: 13,
  entryOdoDelta: 17,
  checksum: 8,
};

class BitWriter {
  constructor() { this.bits = []; }
  writeUint(value, bitLength) {
    for (let i = bitLength - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
  toBytes() {
    while (this.bits.length % 8 !== 0) this.bits.push(0);
    const bytes = new Uint8Array(this.bits.length / 8);
    for (let i = 0; i < bytes.length; i++) {
      let byte = 0;
      for (let b = 0; b < 8; b++) byte = (byte << 1) | this.bits[i * 8 + b];
      bytes[i] = byte;
    }
    return bytes;
  }
}

class BitReader {
  constructor(bytes) {
    this.bits = [];
    for (const byte of bytes) {
      for (let b = 7; b >= 0; b--) this.bits.push((byte >> b) & 1);
    }
    this.pos = 0;
  }
  readUint(bitLength) {
    let value = 0;
    for (let i = 0; i < bitLength; i++) value = (value << 1) | this.bits[this.pos++];
    return value >>> 0;
  }
  bitsLeft() {
    return this.bits.length - this.pos;
  }
}

function crc8(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc & 0x80) ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sanitizeName(name) {
  const upper = (name || '').trim();
  let out = '';
  for (const ch of upper) {
    if (out.length >= NAME_MAX_CHARS) break;
    out += NAME_CHARSET.includes(ch) ? ch : ' ';
  }
  return out.trimEnd();
}

function clampUint(value, bitLength) {
  const max = (2 ** bitLength) - 1;
  return Math.min(max, Math.max(0, Math.round(value)));
}

/**
 * @returns {{code:string, includedCount:number, totalCount:number, nameTruncated:boolean}}
 */
export function encodeSyncCode(lease, entries) {
  const name = sanitizeName(lease.vehicleName);
  const nameTruncated = name.length !== (lease.vehicleName || '').trim().length;

  const fixedBits = FIELD_BITS.version + FIELD_BITS.startDate + FIELD_BITS.termMonths
    + FIELD_BITS.annualAllowance + FIELD_BITS.startOdometer + FIELD_BITS.overageCents
    + FIELD_BITS.nameLength + (name.length * FIELD_BITS.nameChar)
    + FIELD_BITS.includedCount + FIELD_BITS.totalCount + FIELD_BITS.checksum;

  const entryBits = FIELD_BITS.entryDayDelta + FIELD_BITS.entryOdoDelta;
  const maxEntries = Math.max(0, Math.floor((TARGET_BITS - fixedBits) / entryBits));

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const includeCount = Math.min(sorted.length, maxEntries, 255);
  const included = sorted.slice(sorted.length - includeCount);

  const w = new BitWriter();
  w.writeUint(VERSION, FIELD_BITS.version);
  w.writeUint(clampUint(daysBetween(EPOCH, lease.startDate), FIELD_BITS.startDate), FIELD_BITS.startDate);
  w.writeUint(clampUint(lease.termMonths, FIELD_BITS.termMonths), FIELD_BITS.termMonths);
  w.writeUint(clampUint(lease.annualMileageAllowance, FIELD_BITS.annualAllowance), FIELD_BITS.annualAllowance);
  w.writeUint(clampUint(lease.startOdometer, FIELD_BITS.startOdometer), FIELD_BITS.startOdometer);
  w.writeUint(lease.overageRatePerMile != null ? clampUint(lease.overageRatePerMile * 100, 8) : 255, FIELD_BITS.overageCents);
  w.writeUint(name.length, FIELD_BITS.nameLength);
  for (const ch of name) w.writeUint(NAME_CHARSET.indexOf(ch), FIELD_BITS.nameChar);
  w.writeUint(includeCount, FIELD_BITS.includedCount);
  w.writeUint(Math.min(sorted.length, 255), FIELD_BITS.totalCount);

  let prevDate = lease.startDate;
  let prevOdo = lease.startOdometer;
  for (const e of included) {
    w.writeUint(clampUint(daysBetween(prevDate, e.date), FIELD_BITS.entryDayDelta), FIELD_BITS.entryDayDelta);
    w.writeUint(clampUint(e.odometer - prevOdo, FIELD_BITS.entryOdoDelta), FIELD_BITS.entryOdoDelta);
    prevDate = e.date;
    prevOdo = e.odometer;
  }

  const payload = w.toBytes();
  const checksum = crc8(payload);
  const fullBytes = new Uint8Array(payload.length + 1);
  fullBytes.set(payload);
  fullBytes[payload.length] = checksum;

  return {
    code: bytesToBase64Url(fullBytes),
    includedCount: includeCount,
    totalCount: sorted.length,
    nameTruncated,
  };
}

/**
 * @returns {{lease:object, entries:object[], includedCount:number, totalCount:number}}
 */
export function decodeSyncCode(rawCode) {
  const cleaned = (rawCode || '').replace(/\s+/g, '');
  if (!cleaned) throw new Error('Paste a sync code first.');

  let bytes;
  try {
    bytes = base64UrlToBytes(cleaned);
  } catch {
    throw new Error("That doesn't look like a valid sync code.");
  }
  if (bytes.length < 2) throw new Error("That doesn't look like a valid sync code.");

  const payload = bytes.slice(0, bytes.length - 1);
  const checksum = bytes[bytes.length - 1];
  if (crc8(payload) !== checksum) {
    throw new Error('That code failed its checksum — check for a typo or a truncated paste.');
  }

  const r = new BitReader(payload);
  const version = r.readUint(FIELD_BITS.version);
  if (version !== VERSION) throw new Error('This code was made by a newer or incompatible version of LeaseTrack.');

  const startDate = addDays(EPOCH, r.readUint(FIELD_BITS.startDate));
  const termMonths = r.readUint(FIELD_BITS.termMonths);
  const annualMileageAllowance = r.readUint(FIELD_BITS.annualAllowance);
  const startOdometer = r.readUint(FIELD_BITS.startOdometer);
  const overageCents = r.readUint(FIELD_BITS.overageCents);
  const nameLength = r.readUint(FIELD_BITS.nameLength);
  let vehicleName = '';
  for (let i = 0; i < nameLength; i++) vehicleName += NAME_CHARSET[r.readUint(FIELD_BITS.nameChar)];
  vehicleName = vehicleName.trimEnd();
  const includedCount = r.readUint(FIELD_BITS.includedCount);
  const totalCount = r.readUint(FIELD_BITS.totalCount);

  const entries = [];
  let prevDate = startDate;
  let prevOdo = startOdometer;
  for (let i = 0; i < includedCount; i++) {
    if (r.bitsLeft() < FIELD_BITS.entryDayDelta + FIELD_BITS.entryOdoDelta) {
      throw new Error("That code is truncated — some characters may be missing from the paste.");
    }
    const date = addDays(prevDate, r.readUint(FIELD_BITS.entryDayDelta));
    const odometer = prevOdo + r.readUint(FIELD_BITS.entryOdoDelta);
    entries.push({ id: makeEntryId(), date, odometer });
    prevDate = date;
    prevOdo = odometer;
  }

  const lease = {
    vehicleName,
    startDate,
    termMonths,
    annualMileageAllowance,
    startOdometer,
    overageRatePerMile: overageCents === 255 ? null : overageCents / 100,
    configured: true,
  };

  return { lease, entries, includedCount, totalCount };
}
