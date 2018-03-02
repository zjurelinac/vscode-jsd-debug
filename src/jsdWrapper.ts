import { JSDCommand, JSDRuntime, NEWLINE, JSD_PROMPT } from './jsdRuntime';
import * as cp from 'child_process';
import { basename } from 'path';


const wait = ms => new Promise(res => setTimeout(res, ms))

const OUTPUT_DELAY = 250;   // Max delay in ms between two outputs of same response


export class JSDWrapper {
    protected process: cp.ChildProcess;
    protected name: string;
    protected parent: JSDRuntime;

    public isAlive: boolean;
    public isRunning: boolean;

    public termCode: number;
    public termSignal: string;

    private _copyStdout: (chunk: any) => void;

    constructor(process: cp.ChildProcess, name: string, parent: JSDRuntime) {
        this.process = process;
        this.name = name;
        this.parent = parent;

        this.isAlive = true;
        this._copyStdout = (chunk) => this.copyStdout(chunk);

        process.stdout.on('data', this._copyStdout);
        // process.stdout.on('data', (chunk) => this.checkStatus(chunk.toString()));

        process.on('exit', (code, signal) => {
            this.isAlive = false;

            if (signal) this.termSignal = signal;
            if (code) this.termCode = code;
        });
    }

    public async sendSimpleCommand(cmd: JSDCommand): Promise<[string, boolean]> {
        this.parent.sendEvent('output', 'USER> ' + cmd.toString());

        this.pauseStdout();
        this.process.stdin.write(cmd.toString());

        let response = await this.collectResponse();

        // this.output(`READ: [${response}]\r\n`);

        this.resumeStdout();

        return [response, !!response];
    }

    public terminate(): void {
        if (this.isAlive) this.process.kill();
    }

    protected async collectResponse(): Promise<string> {
        let chunk: string | Buffer | null;
        let lines: string[] = [];
        let finished = false;

        await wait(OUTPUT_DELAY);

        while ((chunk = this.process.stdout.read()) != null && !finished) {
            // this.output(`COLLECT: Got chunk <${chunk.toString()}>`);
            let tlines = chunk.toString().split(NEWLINE);

            for (let i = 0; i < tlines.length && !finished; ++i) {
                let tline = tlines[i].trim();

                if (tline.startsWith(JSD_PROMPT)) {
                    let extra = [tline.slice(JSD_PROMPT.length)].concat(tlines.slice(i+1)).join(NEWLINE);
                    // this.output(`COLLECT: Found prompt <${tline}>, unshifting [${extra}]\n`);
                    this.process.stdout.unshift(extra);
                    finished = true;
                } else {
                    lines.push(tline);
                }
            }
        }

        return lines.join(NEWLINE);
    }

    protected checkStatus(chunk: string): void {
        this.parent.sendEvent('output', `CHECKING: [${chunk}]\r\n`);
    }

    protected output(msg: string): void {
        this.parent.sendEvent('output', msg);
    }

    protected copyStdout(chunk: string | Buffer): void {
        this.output(`<${chunk.toString().trim()}>\n`);
    }

    protected pauseStdout(): void {
        this.process.stdout.pause();
        this.process.stdout.removeListener('data', this._copyStdout);
    }

    protected resumeStdout(): void {
        this.process.stdout.resume();
        this.process.stdout.addListener('data', this._copyStdout);
    }
}

export function startJSDWrapper(program: string, parent: JSDRuntime) {
    return new JSDWrapper(cp.spawn(program), basename(program), parent);
}