// import { StackFrame } from 'vscode-debugadapter';
import { OutputChannel } from 'vscode';
import { EventEmitter } from 'events';
import { JSDWrapper, startJSDWrapper } from './jsdWrapper';


export var outputChannel: OutputChannel

export const NEWLINE = '\n';       // Newline symbol(s) in use - \n, \r\n or \r
export const JSD_PROMPT = 'jsd>';  // JSD prompt string, used for end-of-response detection

const JSD_CMD = {
	PAUSE: 				'.\r\n',
	STEP: 				'.s\r\n',
	STEP_IN: 			'.si\r\n',
	STEP_OUT: 			'.so\r\n',
	CONTINUE: 			'.cont\r\n',
	BACKTRACE:			'.bt\r\n',
	SET_BREAKPOINT:		'.bp set {0}:{1}\r\n',
	CLEAR_BREAKPOINT:	'.bp clear {0}:{1}\r\n',
	CLEAR_BREAKPOINTS: 	'.bp clear all\r\n',
	LIST_BREAKPOINTS:	'.bp list\r\n',
	LOCAL_VARS:			'.local\r\n',
	ALL_VARS:			'.all\r\n',
	SOURCES: 			'.sources\r\n',
	KILL: 				'.kill\r\n',
};


export class JSDCommand {
	protected _cmd: string;
	protected _args: any[];

	constructor(cmd: string, ... args: any[]) {
		this._cmd = cmd;
		this._args = args;
	}

	public toString(): string {
		let tostr: string = this._cmd;
		this._args.forEach((arg, index) => tostr.replace(RegExp(`{${index}}`), arg));
		return tostr;
	}
}


export class JSDFrame {
	public func: string;
	public file: string;
	public line: number;

	constructor(func: string, file: string, line: number) {
		this.func = func;
		this.file = file;
		this.line = line;
	}
}

export class JSDRuntime extends EventEmitter {

	private _jsdWrapper: JSDWrapper;
	private _js_root: string;

	public start(program: string, js_root: string) {
		console.log('Starting jsdWrapper', program, 'for', js_root);
		this._js_root = js_root;
		this._jsdWrapper = startJSDWrapper(program, this);
	}

	public async pause() {
		await this._jsdWrapper.sendSimpleCommand(new JSDCommand(JSD_CMD.PAUSE));
		this.sendEvent('stopOnPause');
	}

	public async continue() {
		await this._jsdWrapper.sendSimpleCommand(new JSDCommand(JSD_CMD.CONTINUE));
		// this.sendEvent('stopOnBreakpoint');
	}

	public async step() {
		const result = await this._jsdWrapper.sendSimpleCommand(new JSDCommand(JSD_CMD.STEP));
		this.sendEvent('stopOnStep');

		this.sendEvent('output', `STEP: ${result[0]}`);
	}

	public async stepIn() {
		const result = await this._jsdWrapper.sendSimpleCommand(new JSDCommand(JSD_CMD.STEP_IN));
		this.sendEvent('stopOnStep');

		this.sendEvent('output', `STEP: ${result[0]}`);
	}

	public async stepOut() {
		const result = await this._jsdWrapper.sendSimpleCommand(new JSDCommand(JSD_CMD.STEP_OUT));
		if (result[1]) this.sendEvent('stopOnStep');

		this.sendEvent('output', `STEP: ${result[0]}`);
	}

	public async getStackTrace(startFrame: number, endFrame: number): Promise<JSDFrame[]> {
		const result = await this._jsdWrapper.sendSimpleCommand(new JSDCommand(JSD_CMD.BACKTRACE));

		this.sendEvent('output', `BT: ${result[0]}`);

		let frames: JSDFrame[] = [];
		result[0].split(NEWLINE).slice(1, -1).forEach(line => {
			const stackRegex = /^#\d+\s+([a-zA-Z0-9_./]+):(\d+):\s+function\s+([a-zA-Z0-9_]*)\s*\(\)$/g;
			const match = stackRegex.exec(line.trim());
			// this.sendEvent('output', `BT-line: <${line.trim()}> => ${match}\n`);
			if (match == null) return;

			const fn = `function ${match[3]}()`;
			const fl = `${this._js_root}/${match[1]}`;
			const ln = parseInt(match[2], 10);
			frames.push(new JSDFrame(fn, fl, ln));
		});

		return frames;
	}

	public sendEvent(event: string, ... args: any[]) {
		setImmediate(_ => this.emit(event, ...args));
	}
}

/*export class JSDRuntime extends EventEmitter {

	// TODO: Change!

	// the initial (and one and only) file we are 'debugging'
	private _sourceFile: string;
	public get sourceFile() {
		return this._sourceFile;
	}

	// the contents (= lines) of the one and only file
	private _sourceLines: string[];

	// This is the next line that will be 'executed'
	private _currentLine = 0;

	// maps from sourceFile to array of Mock breakpoints
	// private _breakPoints = new Map<string, MockBreakpoint[]>();

	// since we want to send breakpoint events, we will assign an id to every event
	// so that the frontend can match events with breakpoints.
	// private _breakpointId = 1;

	**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 *
	// TODO: Change!
	public stack(startFrame: number, endFrame: number): any {

		/*const words = this._sourceLines[this._currentLine].trim().split(/\s+/);

		const frames = new Array<any>();
		// every word of the current line becomes a stack frame.
		for (let i = startFrame; i < Math.min(endFrame, words.length); i++) {
			const name = words[i];	// use a word of the line as the stackframe name
			frames.push({
				index: i,
				name: `${name}(${i})`,
				file: this._sourceFile,
				line: this._currentLine
			});
		}
		return {
			frames: frames,
			count: words.length
		};
	}

	*
	 * Set breakpoint in file with given line.
	 *
	public setBreakPoint(path: string, line: number) : Breakpoint | undefined {

		/*const bp = <MockBreakpoint> { verified: false, line, id: this._breakpointId++ };
		let bps = this._breakPoints.get(path);
		if (!bps) {
			bps = new Array<MockBreakpoint>();
			this._breakPoints.set(path, bps);
		}
		bps.push(bp);

		this.verifyBreakpoints(path);

		return bp;
		return undefined;
	}

	*
	 * Clear breakpoint in file with given line.
	 *
	public clearBreakPoint(path: string, line: number) : Breakpoint | undefined {
		*let bps = this._breakPoints.get(path);
		if (bps) {
			const index = bps.findIndex(bp => bp.line === line);
			if (index >= 0) {
				const bp = bps[index];
				bps.splice(index, 1);
				return bp;
			}
		}*
		return undefined;
	}

	*
	 * Clear all breakpoints for file.
	 *
	public clearBreakpoints(path: string): void {
		// this._breakPoints.delete(path);
	}

	// private methods

	**
	 * Run through the file.
	 * If stepEvent is specified only run a single step and emit the stepEvent.
	 *
	private run(reverse = false, stepEvent?: string) {
		/*if (reverse) {
			for (let ln = this._currentLine-1; ln >= 0; ln--) {
				if (this.fireEventsForLine(ln, stepEvent)) {
					this._currentLine = ln;
					return;
				}
			}
			// no more lines: stop at first line
			this._currentLine = 0;
			this.sendEvent('stopOnEntry');
		} else {
			for (let ln = this._currentLine+1; ln < this._sourceLines.length; ln++) {
				if (this.fireEventsForLine(ln, stepEvent)) {
					this._currentLine = ln;
					return true;
				}
			}
			// no more lines: run to end
			this.sendEvent('end');
		}*
	}

	private verifyBreakpoints(path: string) : void {
		/*let bps = this._breakPoints.get(path);
		if (bps) {
			this.loadSource(path);
			bps.forEach(bp => {
				if (!bp.verified && bp.line < this._sourceLines.length) {
					const srcLine = this._sourceLines[bp.line].trim();

					// if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
					if (srcLine.length === 0 || srcLine.indexOf('+') === 0) {
						bp.line++;
					}
					// if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
					if (srcLine.indexOf('-') === 0) {
						bp.line--;
					}
					// don't set 'verified' to true if the line contains the word 'lazy'
					// in this case the breakpoint will be verified 'lazy' after hitting it once.
					if (srcLine.indexOf('lazy') < 0) {
						bp.verified = true;
						this.sendEvent('breakpointValidated', bp);
					}
				}
			});
		}*
	}
}*/
