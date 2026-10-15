#!/usr/bin/env node
// Generate voice-over for every dialogue line with ElevenLabs text-to-speech.
//
// The API key stays on your machine; the site only plays the resulting MP3s
// (assets/voice/*.mp3, listed in assets/voice/manifest.json).
//
// Setup:
//   1. Put your key in klt-tracker/.env  (gitignored):  ELEVENLABS_API_KEY=sk_...
//      or export ELEVENLABS_API_KEY in your shell.
//   2. node tools/make_voices.mjs --list-voices        # pick voice ids
//   3. Set characters.<id>.voice.name (or .id) in js/data/chapters.js
//   4. node tools/make_voices.mjs --dry-run            # see lines + character count
//   5. node tools/make_voices.mjs                      # generate (skips unchanged lines)
//
// Options:
//   --dry-run            print what would be generated and the total characters
//   --list-voices        list voices available to your account
//   --only=<chapterId>   only these chapters (comma-separated)
//   --speakers=<ids>     only these speakers (comma-separated, e.g. wren,tomasi)
//   --force              regenerate even if the text and voice are unchanged
//   --prune-stale        only delete clips whose line text changed (no API calls); prints the
//                        characters needed to regenerate them
//   (Pauses: short <break/> tags are added after commas, colons and sentence ends, see withPauses.)
//   --model=<id>         ElevenLabs model id (default eleven_multilingual_v2;
//                        eleven_flash_v2_5 uses fewer credits)
//
// Lines whose `text` contains math should have a `say` field (plain English).
// Otherwise math is converted roughly and the script prints a warning.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'voice');
const MANIFEST = join(OUT_DIR, 'manifest.json');
const CACHE = join(OUT_DIR, '.cache.json');
const API = 'https://api.elevenlabs.io/v1';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const MODEL = args.model || 'eleven_multilingual_v2';
const ONLY = args.only ? String(args.only).split(',') : null;
const SPEAKERS = args.speakers ? String(args.speakers).split(',') : null;

async function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const env = await readFile(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^\s*ELEVENLABS_API_KEY\s*=\s*(\S+)/m);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  } catch { /* no .env */ }
  return null;
}

/** Rough markup -> speech for lines without `say`. */
function speakable(text) {
  let mathy = false;
  const spoken = text
    .replace(/\$\$?([^$]+)\$\$?/g, (_, m) => {
      mathy = true;
      return m
        .replace(/\\(mathbf|operatorname|text|mathrm)\{([^}]*)\}/g, '$2')
        .replace(/\\lambda/g, 'lambda').replace(/\\Delta/g, 'delta ').replace(/\\nabla/g, 'gradient of ')
        .replace(/\\sum/g, 'the sum of ').replace(/\\tau/g, 'tau').replace(/\\min/g, 'min')
        .replace(/\^2/g, ' squared').replace(/_\{?([a-z0-9]+)\}?/gi, ' $1')
        .replace(/\\[a-z]+/gi, ' ').replace(/[{}\\]/g, ' ')
        .replace(/=/g, ' equals ').replace(/\+/g, ' plus ').replace(/-/g, ' minus ')
        .replace(/\s+/g, ' ').trim();
    })
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/\[OUTLINE\]\s*/g, '')
    .replace(/\s+/g, ' ').trim();
  return { spoken, mathy };
}

/**
 * Breathing room: ElevenLabs reads straight through punctuation, so add short <break/> pauses after it
 * (eleven_multilingual_v2 supports them). Only after punctuation followed by a space, so "0.5" and "e.g." are left alone.
 */
const PAUSE = { sentence: 0.55, colon: 0.35, comma: 0.25 };
function withPauses(text) {
  const brk = (s) => ` <break time="${s}s" />`;
  return text
    .replace(/([.!?])\s+(?=\S)/g, (_, p) => `${p}${brk(PAUSE.sentence)} `)
    .replace(/([:;])\s+(?=\S)/g, (_, p) => `${p}${brk(PAUSE.colon)} `)
    .replace(/(,)\s+(?=\S)/g, (_, p) => `${p}${brk(PAUSE.comma)} `);
}

async function listVoices(key) {
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`GET /voices: HTTP ${r.status} ${await r.text()}`);
  const { voices } = await r.json();
  for (const v of voices) {
    const labels = Object.values(v.labels ?? {}).join(', ');
    console.log(`${v.voice_id}  ${v.name.padEnd(22)} ${(v.category ?? '').padEnd(12)} ${labels}`);
  }
}

/** Fill in voice ids from voice names in your ElevenLabs library. */
async function resolveIds(key, voices) {
  const want = voices.filter((v) => !v.id && v.name);
  if (!want.length) return;
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': key } });
  if (!r.ok) throw new Error(`GET /voices: HTTP ${r.status} ${await r.text()}`);
  const lib = (await r.json()).voices;
  for (const v of want) {
    const low = v.name.toLowerCase();
    const hit = lib.find((x) => x.name === v.name)
      ?? lib.find((x) => x.name.toLowerCase() === low)
      ?? lib.find((x) => x.name.toLowerCase().startsWith(low)); // e.g. "Peter" -> "Peter- Deep, Steady and Natural"
    if (!hit) throw new Error(`No voice named "${v.name}" in your ElevenLabs library (see --list-voices)`);
    v.id = hit.voice_id;
    console.log(`voice "${v.name}" -> ${v.id}`);
  }
}

async function tts(key, voice, text) {
  const body = {
    text,
    model_id: MODEL,
    voice_settings: {
      stability: voice.stability ?? 0.5,
      similarity_boost: voice.similarity ?? 0.75,
      style: voice.style ?? 0,
      use_speaker_boost: true,
    },
  };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`${API}/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status >= 500) {
      const wait = 2000 * 2 ** attempt;
      console.warn(`  HTTP ${r.status}, retrying in ${wait / 1000}s`);
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  }
  throw new Error('gave up after retries');
}

const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; } };
const exists = (p) => access(p).then(() => true, () => false);

async function main() {
  const key = await apiKey();
  if (args['list-voices']) {
    if (!key) throw new Error('Set ELEVENLABS_API_KEY (env or klt-tracker/.env) first.');
    return listVoices(key);
  }

  const { chapters, characters, standIns = {} } = await import(join(ROOT, 'js/data/chapters.js'));
  const jobs = [];
  const voicedKeys = new Set(); // every currently voiced line in the selected chapters (any speaker)
  for (const ch of chapters) {
    if (ONLY && !ONLY.includes(ch.id)) continue;
    ch.dialogue.forEach((line, i) => {
      if (characters[standIns[line.speaker] ?? line.speaker]?.voice) voicedKeys.add(`${ch.id}:${i}`);
    });
    ch.dialogue.forEach((line, i) => {
      const speaker = standIns[line.speaker] ?? line.speaker; // e.g. Kanade stands in for Lucas
      const voice = characters[speaker]?.voice;
      if (!voice) return; // e.g. the flight log is not voiced
      if (SPEAKERS && !SPEAKERS.includes(speaker)) return;
      const { spoken, mathy } = line.say ? { spoken: line.say, mathy: false } : speakable(line.text);
      jobs.push({ key: `${ch.id}:${i}`, ch, i, speaker, voice, text: withPauses(spoken), warn: mathy });
    });
  }

  const missing = [...new Set(jobs.filter((j) => !j.voice.id && !j.voice.name).map((j) => j.speaker))];
  const chars = jobs.reduce((n, j) => n + j.text.length, 0);
  for (const j of jobs.filter((x) => x.warn)) {
    console.warn(`! ${j.key} has math but no \`say\`; spoken as: "${j.text.slice(0, 90)}…"`);
  }

  if (args['prune-stale']) {
    const manifest = await readJson(MANIFEST, {});
    const cache = await readJson(CACHE, {});
    let removed = 0, chars = 0;
    for (const j of jobs) {
      const { brief, ...settings } = j.voice;
      const hash = createHash('sha1').update(JSON.stringify([MODEL, settings, j.text])).digest('hex').slice(0, 10);
      if (manifest[j.key] && cache[j.key] !== hash) {
        await unlink(join(ROOT, manifest[j.key])).catch(() => {});
        delete manifest[j.key]; delete cache[j.key]; removed++;
      }
      if (!manifest[j.key]) chars += j.text.length;
    }
    // Clips for lines that no longer exist (the dialogue got shorter).
    const live = new Set(jobs.map((j) => j.key));
    for (const k of Object.keys(manifest)) {
      if (live.has(k) || (ONLY && !ONLY.includes(k.split(':')[0]))) continue;
      await unlink(join(ROOT, manifest[k])).catch(() => {});
      delete manifest[k]; delete cache[k]; removed++;
    }
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
    await writeFile(CACHE, JSON.stringify(cache, null, 2));
    console.log(`Removed ${removed} stale clips. Lines without audio: ${chars} characters to generate.`);
    return;
  }

  if (args['dry-run']) {
    for (const j of jobs) console.log(`${j.key.padEnd(14)} ${j.speaker.padEnd(7)} ${j.text}`);
    console.log(`\n${jobs.length} lines, ${chars} characters (model ${MODEL}).`);
    if (missing.length) console.log(`Voice id not set for: ${missing.join(', ')}`);
    return;
  }
  if (!key) throw new Error('Set ELEVENLABS_API_KEY (env or klt-tracker/.env). Use --dry-run to preview without a key.');
  if (missing.length) {
    throw new Error(`Set characters.<id>.voice.id in js/data/chapters.js for: ${missing.join(', ')} (see --list-voices)`);
  }

  await resolveIds(key, [...new Set(jobs.map((j) => j.voice))]);
  await mkdir(OUT_DIR, { recursive: true });
  const manifest = await readJson(MANIFEST, {});
  const cache = await readJson(CACHE, {});
  let made = 0, skipped = 0;
  for (const j of jobs) {
    const { brief, ...settings } = j.voice; // the brief is a note, not a setting
    const hash = createHash('sha1').update(JSON.stringify([MODEL, settings, j.text])).digest('hex').slice(0, 10);
    const file = `${j.ch.id}-${String(j.i).padStart(2, '0')}-${j.speaker}.mp3`;
    const path = join(OUT_DIR, file);
    if (!args.force && cache[j.key] === hash && await exists(path)) { skipped++; manifest[j.key] = `assets/voice/${file}`; continue; }
    process.stdout.write(`${j.key.padEnd(14)} ${j.speaker.padEnd(7)} … `);
    const audio = await tts(key, j.voice, j.text);
    await writeFile(path, audio);
    manifest[j.key] = `assets/voice/${file}`;
    cache[j.key] = hash;
    made++;
    console.log(`${(audio.length / 1024).toFixed(0)} KB`);
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2)); // save progress as we go
    await writeFile(CACHE, JSON.stringify(cache, null, 2));
  }
  // Prune clips for lines that no longer exist in the selected chapters.
  const selected = new Set(chapters.filter((c) => !ONLY || ONLY.includes(c.id)).map((c) => c.id));
  let pruned = 0;
  for (const k of Object.keys(manifest)) {
    if (!selected.has(k.split(':')[0]) || voicedKeys.has(k)) continue;
    await unlink(join(ROOT, manifest[k])).catch(() => {});
    delete manifest[k]; delete cache[k]; pruned++;
  }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  await writeFile(CACHE, JSON.stringify(cache, null, 2));
  console.log(`\nDone: ${made} generated, ${skipped} unchanged, ${pruned} stale removed. Manifest: assets/voice/manifest.json`);
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
