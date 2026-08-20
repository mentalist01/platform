import { spawn } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const REPORT_VERSION = 1;
const DEFAULT_DURATION_MINUTES = 180;
const DEFAULT_INTERVAL_SECONDS = 2;
const MAX_PERF_EVENTS = 10_000;

function parsePositiveNumber(value, flagName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} must be a positive number`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = {
    durationMinutes: DEFAULT_DURATION_MINUTES,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    outputDir: path.resolve('diagnostics-output'),
    pm2App: 'ege',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (flag === '--duration-minutes') {
      options.durationMinutes = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--interval-seconds') {
      options.intervalSeconds = parsePositiveNumber(value, flag);
      index += 1;
    } else if (flag === '--output-dir') {
      if (!value) throw new Error(`${flag} requires a path`);
      options.outputDir = path.resolve(value);
      index += 1;
    } else if (flag === '--pm2-app') {
      if (!value) throw new Error(`${flag} requires an app name`);
      options.pm2App = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function readSystemCpu() {
  const cpuLine = readFileSync('/proc/stat', 'utf8').split('\n')[0];
  const values = cpuLine.trim().split(/\s+/).slice(1).map(Number);
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = values;
  return {
    total: user + nice + system + idle + iowait + irq + softirq + steal,
    idle: idle + iowait,
    user: user + nice,
    system,
    iowait,
    irq,
    softirq,
    steal,
  };
}

function readMemory() {
  const fields = {};
  for (const line of readFileSync('/proc/meminfo', 'utf8').split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)/);
    if (match) fields[match[1]] = Number(match[2]);
  }

  const totalKb = fields.MemTotal ?? 0;
  const availableKb = fields.MemAvailable ?? fields.MemFree ?? 0;
  const swapTotalKb = fields.SwapTotal ?? 0;
  const swapFreeKb = fields.SwapFree ?? 0;

  return {
    totalMb: round(totalKb / 1024, 1),
    usedMb: round((totalKb - availableKb) / 1024, 1),
    availableMb: round(availableKb / 1024, 1),
    swapUsedMb: round((swapTotalKb - swapFreeKb) / 1024, 1),
  };
}

function readLoadAverage() {
  const [one, five, fifteen] = readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/).map(Number);
  return { one: round(one), five: round(five), fifteen: round(fifteen) };
}

function readNetworkTotals() {
  let receivedBytes = 0;
  let transmittedBytes = 0;

  for (const line of readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2)) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const interfaceName = line.slice(0, separator).trim();
    if (!interfaceName || interfaceName === 'lo') continue;
    const values = line.slice(separator + 1).trim().split(/\s+/).map(Number);
    receivedBytes += values[0] || 0;
    transmittedBytes += values[8] || 0;
  }

  return { receivedBytes, transmittedBytes };
}

function parseProcessStat(contents) {
  const openParen = contents.indexOf('(');
  const closeParen = contents.lastIndexOf(')');
  if (openParen === -1 || closeParen === -1) return null;
  const command = contents.slice(openParen + 1, closeParen);
  const fields = contents.slice(closeParen + 2).trim().split(/\s+/);
  return {
    command,
    ticks: Number(fields[11] || 0) + Number(fields[12] || 0),
    startTicks: Number(fields[19] || 0),
  };
}

function readStatusValue(contents, key) {
  const match = contents.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
  return match ? Number(match[1]) : 0;
}

function classifyProcess(command, commandLine) {
  const haystack = `${command}\n${commandLine}`.toLowerCase();
  if (haystack.includes('turnserver') || haystack.includes('coturn')) return 'turn';
  if (haystack.includes('nginx')) return 'nginx';
  if (haystack.includes('python')) return 'python';
  if (haystack.includes('node')) {
    if (/server[\\/]index\.js/.test(haystack)) return 'app_node';
    return 'node_other';
  }
  return null;
}

function readInterestingProcesses() {
  const processes = [];
  let entries = [];
  try {
    entries = readdirSync('/proc', { withFileTypes: true });
  } catch {
    return processes;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const pid = Number(entry.name);
    try {
      const stat = parseProcessStat(readFileSync(`/proc/${pid}/stat`, 'utf8'));
      if (!stat) continue;
      const commandLine = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ');
      const category = classifyProcess(stat.command, commandLine);
      if (!category) continue;
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      processes.push({
        pid,
        category,
        command: stat.command.slice(0, 32),
        ticks: stat.ticks,
        startTicks: stat.startTicks,
        rssMb: round(readStatusValue(status, 'VmRSS') / 1024, 1),
        threads: readStatusValue(status, 'Threads'),
      });
    } catch {
      // A short-lived process can disappear between /proc reads.
    }
  }

  return processes;
}

function parseSafePerfEvent(line) {
  let match = line.match(/lesson replay persist took (\d+)ms \((\d+) raw, (\d+) gzip\)/i);
  if (match) {
    return {
      kind: 'lesson_replay_persist',
      durationMs: Number(match[1]),
      rawBytes: Number(match[2]),
      gzipBytes: Number(match[3]),
    };
  }

  match = line.match(/board snapshot .* took (\d+)ms \((\d+) bytes\)/i);
  if (match) {
    return {
      kind: 'board_snapshot',
      durationMs: Number(match[1]),
      bytes: Number(match[2]),
    };
  }

  return null;
}

function startPm2PerfStream(appName, perfEvents, warnings) {
  let child;
  try {
    child = spawn('pm2', ['logs', appName, '--lines', '0', '--raw'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    warnings.push('pm2_perf_stream_unavailable');
    return null;
  }

  let buffer = '';
  const consume = (chunk) => {
    buffer += String(chunk);
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (perfEvents.length >= MAX_PERF_EVENTS) continue;
      const event = parseSafePerfEvent(line);
      if (event) perfEvents.push({ at: new Date().toISOString(), ...event });
    }
  };

  child.stdout.on('data', consume);
  child.stderr.on('data', consume);
  child.on('error', () => {
    if (!warnings.includes('pm2_perf_stream_unavailable')) {
      warnings.push('pm2_perf_stream_unavailable');
    }
  });
  return child;
}

function stopPm2PerfStream(child) {
  if (!child) return;
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (!child.killed) child.kill('SIGTERM');
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maximum(values) {
  if (!values.length) return null;
  return Math.max(...values);
}

function buildSummary(samples, perfEvents) {
  const systemBusy = samples.map((sample) => sample.system.cpuBusyPercent).filter(Number.isFinite);
  const systemUser = samples.map((sample) => sample.system.cpuUserPercent).filter(Number.isFinite);
  const systemKernel = samples.map((sample) => sample.system.cpuSystemPercent).filter(Number.isFinite);
  const systemSoftirq = samples.map((sample) => sample.system.cpuSoftirqPercent).filter(Number.isFinite);
  const systemSteal = samples.map((sample) => sample.system.cpuStealPercent).filter(Number.isFinite);
  const receiveRates = samples.map((sample) => sample.network.receiveMbps).filter(Number.isFinite);
  const transmitRates = samples.map((sample) => sample.network.transmitMbps).filter(Number.isFinite);
  const categories = ['turn', 'app_node', 'node_other', 'python', 'nginx'];
  const processCpu = {};

  for (const category of categories) {
    const perSampleHost = [];
    const perSampleOneCore = [];
    for (const sample of samples) {
      const matching = sample.processes.filter(
        (processInfo) => processInfo.category === category && Number.isFinite(processInfo.hostCpuPercent),
      );
      if (!matching.length) continue;
      perSampleHost.push(matching.reduce((sum, processInfo) => sum + processInfo.hostCpuPercent, 0));
      perSampleOneCore.push(matching.reduce((sum, processInfo) => sum + processInfo.oneCoreCpuPercent, 0));
    }
    processCpu[category] = {
      averageHostPercent: round(average(perSampleHost)),
      maximumHostPercent: round(maximum(perSampleHost)),
      averageOneCorePercent: round(average(perSampleOneCore)),
      maximumOneCorePercent: round(maximum(perSampleOneCore)),
      observed: perSampleHost.length > 0,
    };
  }

  const replayEvents = perfEvents.filter((event) => event.kind === 'lesson_replay_persist');
  const replayDurations = replayEvents.map((event) => event.durationMs);
  const boardEvents = perfEvents.filter((event) => event.kind === 'board_snapshot');
  const boardDurations = boardEvents.map((event) => event.durationMs);

  return {
    sampleCount: samples.length,
    system: {
      averageCpuBusyPercent: round(average(systemBusy)),
      maximumCpuBusyPercent: round(maximum(systemBusy)),
      averageCpuUserPercent: round(average(systemUser)),
      averageCpuSystemPercent: round(average(systemKernel)),
      averageCpuSoftirqPercent: round(average(systemSoftirq)),
      averageCpuStealPercent: round(average(systemSteal)),
    },
    network: {
      averageReceiveMbps: round(average(receiveRates), 3),
      maximumReceiveMbps: round(maximum(receiveRates), 3),
      averageTransmitMbps: round(average(transmitRates), 3),
      maximumTransmitMbps: round(maximum(transmitRates), 3),
    },
    processCpu,
    replayPersistence: {
      eventCount: replayEvents.length,
      averageDurationMs: round(average(replayDurations), 1),
      maximumDurationMs: round(maximum(replayDurations), 1),
    },
    boardSnapshots: {
      eventCount: boardEvents.length,
      averageDurationMs: round(average(boardDurations), 1),
      maximumDurationMs: round(maximum(boardDurations), 1),
    },
  };
}

function makeTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function printSummary(summary) {
  const turn = summary.processCpu.turn;
  const appNode = summary.processCpu.app_node;
  console.log('Collection finished. Quick technical summary:');
  console.log(`  system CPU: avg ${summary.system.averageCpuBusyPercent ?? 'n/a'}%, max ${summary.system.maximumCpuBusyPercent ?? 'n/a'}%`);
  console.log(`  TURN host CPU: avg ${turn.averageHostPercent ?? 'n/a'}%, max ${turn.maximumHostPercent ?? 'n/a'}%`);
  console.log(`  app Node host CPU: avg ${appNode.averageHostPercent ?? 'n/a'}%, max ${appNode.maximumHostPercent ?? 'n/a'}%`);
  console.log(`  network transmit: avg ${summary.network.averageTransmitMbps ?? 'n/a'} Mbit/s, max ${summary.network.maximumTransmitMbps ?? 'n/a'} Mbit/s`);
}

async function delay(milliseconds, state) {
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      state.wake = null;
      resolve();
    }, milliseconds);
    state.wake = () => {
      clearTimeout(timer);
      state.wake = null;
      resolve();
    };
  });
}

async function main() {
  if (process.platform !== 'linux') {
    throw new Error('Lesson diagnostics must run on the Linux production server (/proc is required).');
  }

  const options = parseArguments(process.argv.slice(2));
  mkdirSync(options.outputDir, { recursive: true, mode: 0o700 });

  const cpuCount = Math.max(1, os.cpus().length);
  const startedAt = new Date();
  const deadline = startedAt.getTime() + options.durationMinutes * 60_000;
  const samples = [];
  const perfEvents = [];
  const warnings = [];
  const state = { stopRequested: false, stopReason: 'duration_complete', wake: null };
  let previousCpu = null;
  let previousNetwork = null;
  let previousTimestampMs = null;
  let previousProcesses = new Map();

  const requestStop = (reason) => {
    if (state.stopRequested) return;
    state.stopRequested = true;
    state.stopReason = reason;
    state.wake?.();
  };
  process.once('SIGINT', () => requestStop('stopped_by_user'));
  process.once('SIGTERM', () => requestStop('stopped_by_signal'));

  const pm2Stream = startPm2PerfStream(options.pm2App, perfEvents, warnings);

  console.log(`Lesson diagnostics started at ${startedAt.toISOString()}.`);
  console.log(`Sampling every ${options.intervalSeconds}s for up to ${options.durationMinutes} minutes.`);
  console.log('No audio, video, screen contents, messages, URLs, environment variables, IPs or command lines are saved.');

  while (!state.stopRequested && Date.now() < deadline) {
    const timestampMs = Date.now();
    const currentCpu = readSystemCpu();
    const currentNetwork = readNetworkTotals();
    const currentProcesses = readInterestingProcesses();
    const cpuDelta = previousCpu ? currentCpu.total - previousCpu.total : 0;
    const elapsedSeconds = previousTimestampMs ? (timestampMs - previousTimestampMs) / 1000 : 0;
    const nextProcessMap = new Map();

    const processRows = currentProcesses.map((processInfo) => {
      const identity = `${processInfo.pid}:${processInfo.startTicks}`;
      const previousTicks = previousProcesses.get(identity);
      const tickDelta = Number.isFinite(previousTicks) ? processInfo.ticks - previousTicks : null;
      const hostCpuPercent = tickDelta !== null && cpuDelta > 0 ? (tickDelta / cpuDelta) * 100 : null;
      nextProcessMap.set(identity, processInfo.ticks);
      return {
        pid: processInfo.pid,
        category: processInfo.category,
        command: processInfo.command,
        hostCpuPercent: round(hostCpuPercent),
        oneCoreCpuPercent: round(hostCpuPercent === null ? null : hostCpuPercent * cpuCount),
        rssMb: processInfo.rssMb,
        threads: processInfo.threads,
      };
    });

    let cpuBusyPercent = null;
    let cpuUserPercent = null;
    let cpuSystemPercent = null;
    let cpuIowaitPercent = null;
    let cpuIrqPercent = null;
    let cpuSoftirqPercent = null;
    let cpuStealPercent = null;
    if (previousCpu && cpuDelta > 0) {
      cpuBusyPercent = ((cpuDelta - (currentCpu.idle - previousCpu.idle)) / cpuDelta) * 100;
      cpuUserPercent = ((currentCpu.user - previousCpu.user) / cpuDelta) * 100;
      cpuSystemPercent = ((currentCpu.system - previousCpu.system) / cpuDelta) * 100;
      cpuIowaitPercent = ((currentCpu.iowait - previousCpu.iowait) / cpuDelta) * 100;
      cpuIrqPercent = ((currentCpu.irq - previousCpu.irq) / cpuDelta) * 100;
      cpuSoftirqPercent = ((currentCpu.softirq - previousCpu.softirq) / cpuDelta) * 100;
      cpuStealPercent = ((currentCpu.steal - previousCpu.steal) / cpuDelta) * 100;
    }

    let receiveMbps = null;
    let transmitMbps = null;
    if (previousNetwork && elapsedSeconds > 0) {
      receiveMbps = ((currentNetwork.receivedBytes - previousNetwork.receivedBytes) * 8) / elapsedSeconds / 1_000_000;
      transmitMbps = ((currentNetwork.transmittedBytes - previousNetwork.transmittedBytes) * 8) / elapsedSeconds / 1_000_000;
    }

    samples.push({
      at: new Date(timestampMs).toISOString(),
      elapsedSeconds: round((timestampMs - startedAt.getTime()) / 1000, 1),
      system: {
        cpuBusyPercent: round(cpuBusyPercent),
        cpuUserPercent: round(cpuUserPercent),
        cpuSystemPercent: round(cpuSystemPercent),
        cpuIowaitPercent: round(cpuIowaitPercent),
        cpuIrqPercent: round(cpuIrqPercent),
        cpuSoftirqPercent: round(cpuSoftirqPercent),
        cpuStealPercent: round(cpuStealPercent),
        loadAverage: readLoadAverage(),
        memory: readMemory(),
      },
      network: {
        receiveMbps: round(receiveMbps, 3),
        transmitMbps: round(transmitMbps, 3),
      },
      processes: processRows,
    });

    previousCpu = currentCpu;
    previousNetwork = currentNetwork;
    previousTimestampMs = timestampMs;
    previousProcesses = nextProcessMap;

    const remainingMs = deadline - Date.now();
    if (!state.stopRequested && remainingMs > 0) {
      await delay(Math.min(options.intervalSeconds * 1000, remainingMs), state);
    }
  }

  stopPm2PerfStream(pm2Stream);
  const finishedAt = new Date();
  const summary = buildSummary(samples, perfEvents);
  const report = {
    reportVersion: REPORT_VERSION,
    privacy: {
      mediaContentsCollected: false,
      messageContentsCollected: false,
      screenContentsCollected: false,
      commandLinesCollected: false,
      environmentVariablesCollected: false,
      networkAddressesCollected: false,
    },
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: round((finishedAt.getTime() - startedAt.getTime()) / 1000, 1),
    stopReason: state.stopRequested ? state.stopReason : 'duration_complete',
    intervalSeconds: options.intervalSeconds,
    host: {
      platform: process.platform,
      architecture: process.arch,
      cpuCount,
      totalMemoryMb: round(os.totalmem() / 1024 / 1024, 1),
    },
    warnings,
    summary,
    perfEvents,
    samples,
  };

  const filename = `lesson-diagnostics-${makeTimestamp(startedAt)}.json.gz`;
  const destination = path.join(options.outputDir, filename);
  const temporary = `${destination}.partial`;
  writeFileSync(temporary, gzipSync(JSON.stringify(report)), { mode: 0o600 });
  renameSync(temporary, destination);

  printSummary(summary);
  console.log(`DIAGNOSTIC_FILE=${destination}`);
}

main().catch((error) => {
  console.error(`Lesson diagnostics failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
