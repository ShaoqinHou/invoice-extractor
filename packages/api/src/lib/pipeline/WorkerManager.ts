import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { createInterface, type Interface as ReadlineInterface } from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
}

/**
 * Manages a persistent Python worker process that communicates via NDJSON over stdin/stdout.
 *
 * The worker stays alive between requests — Python interpreter, imported libraries, and
 * loaded ML models remain in memory. After an idle timeout, the worker is shut down to
 * free RAM and re-spawned on the next request.
 */
export class WorkerManager {
  private process: ChildProcess | null = null;
  private readline: ReadlineInterface | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingRequest | null = null;
  private queue: Array<{ input: string; resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }> = [];
  private busy = false;
  private scriptPath: string;
  private label: string;

  /** Idle timeout in ms — worker shuts down after this long without requests. */
  idleTimeoutMs: number;

  constructor(scriptName: string, label: string, idleTimeoutMs = 5 * 60 * 1000) {
    this.scriptPath = path.join(PROJECT_ROOT, 'scripts', scriptName);
    this.label = label;
    this.idleTimeoutMs = idleTimeoutMs;
  }

  /** Send a request to the worker. Spawns the process if not running. */
  async request(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      this.queue.push({ input: JSON.stringify(input), resolve, reject });
      this.processQueue();
    });
  }

  /** Process queued requests one at a time (worker handles one request per line). */
  private processQueue(): void {
    if (this.busy || this.queue.length === 0) return;
    this.busy = true;

    const { input, resolve, reject } = this.queue.shift()!;

    if (!this.process) {
      try {
        this.spawn();
      } catch (err) {
        this.busy = false;
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }

    this.resetIdleTimer();
    this.pending = { resolve, reject };

    // Write the request to stdin (one JSON line)
    this.process!.stdin!.write(input + '\n');
  }

  /** Spawn the Python worker process. */
  private spawn(): void {
    console.log(`[${this.label}] Spawning worker: python ${this.scriptPath}`);

    this.process = spawn('python', [this.scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows needs shell: false (default) for proper stdin/stdout piping
    });

    // Read stdout line by line — each line is one JSON response
    this.readline = createInterface({ input: this.process.stdout! });
    this.readline.on('line', (line: string) => {
      if (!this.pending) return;

      const { resolve, reject } = this.pending;
      this.pending = null;
      this.busy = false;

      try {
        const result = JSON.parse(line) as Record<string, unknown>;
        if (result.error) {
          reject(new Error(`Worker error: ${result.error}`));
        } else {
          resolve(result);
        }
      } catch {
        reject(new Error(`Failed to parse worker response: ${line.slice(0, 200)}`));
      }

      // Process next queued request
      this.processQueue();
    });

    // Log stderr (Python warnings, model loading messages)
    const stderrRl = createInterface({ input: this.process.stderr! });
    stderrRl.on('line', (line: string) => {
      console.log(`[${this.label}] ${line}`);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[${this.label}] Worker exited (code=${code}, signal=${signal})`);
      this.cleanup();

      // Reject any pending request
      if (this.pending) {
        const { reject } = this.pending;
        this.pending = null;
        this.busy = false;
        reject(new Error(`Worker process exited unexpectedly (code=${code})`));
      }

      // Reject all queued requests
      for (const { reject } of this.queue) {
        reject(new Error(`Worker process exited unexpectedly (code=${code})`));
      }
      this.queue = [];
    });

    this.process.on('error', (err) => {
      console.error(`[${this.label}] Worker spawn error:`, err);
      this.cleanup();

      if (this.pending) {
        const { reject } = this.pending;
        this.pending = null;
        this.busy = false;
        reject(err);
      }
    });
  }

  /** Reset the idle timer — called on each request. */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (!this.busy && this.queue.length === 0) {
        console.log(`[${this.label}] Idle timeout — shutting down worker`);
        this.shutdown();
      }
    }, this.idleTimeoutMs);
  }

  /** Shut down the worker process to free RAM. */
  shutdown(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.cleanup();
  }

  /** Clean up process references. */
  private cleanup(): void {
    if (this.readline) {
      this.readline.close();
      this.readline = null;
    }
    if (this.process) {
      try {
        this.process.stdin?.end();
        this.process.kill();
      } catch { /* already dead */ }
      this.process = null;
    }
  }

  /** Whether the worker process is currently running. */
  get isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }
}
