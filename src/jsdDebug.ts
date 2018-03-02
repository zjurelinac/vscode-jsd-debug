import {
    Logger, logger,
    LoggingDebugSession,
    InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent,
    Thread, StackFrame, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { JSDRuntime, outputChannel } from './jsdRuntime';
import * as AsyncLock from 'async-lock';
import { basename } from 'path';

const { Subject } = require('await-notify');


interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    program: string;  		// An absolute path to the "program" to debug
    js_root: string;  		// An absolute path to the JS code root folder
    stopOnEntry?: boolean;  // Automatically stop target after launch. If not specified, false
    trace?: boolean;  		// Enable logging the Debug Adapter Protocol
}

export class JSDDebugSession extends LoggingDebugSession {

    private static THREAD_ID = 1;

    private _runtime: JSDRuntime;
    private _variableHandles = new Handles<string>(); 	// TODO: Investigate
    private _configurationDone = new Subject(); 		// TODO: Investigate

    private _lock: AsyncLock;
    private _startTime: number;

    private _stackId: number;

    public constructor() {
        super("jsd-debug.log");

        this._lock = new AsyncLock();
        this._startTime = Date.now();

        this._stackId = 0;

        this.setDebuggerLinesStartAt1(false);
        this.setDebuggerColumnsStartAt1(false);

        this._runtime = new JSDRuntime();

        this._runtime.on('stopOnEntry', () => {
            this.sendEvent(new StoppedEvent('entry', JSDDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnStep', () => {
            this.sendEvent(new StoppedEvent('step', JSDDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnPause', () => {
            this.sendEvent(new StoppedEvent('pause', JSDDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnBreakpoint', () => {
            this.sendEvent(new StoppedEvent('breakpoint', JSDDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnException', () => {
            this.sendEvent(new StoppedEvent('exception', JSDDebugSession.THREAD_ID));
        });
        this._runtime.on('breakpointValidated', (bp: Breakpoint) => {
            this.sendEvent(new BreakpointEvent('changed', bp));
        });
        this._runtime.on('output', (chunk: string) => {
            outputChannel.append(`[${((Date.now() - this._startTime) / 1000).toFixed(3)}] ${chunk}`);
        });
        this._runtime.on('end', () => {
            this.sendEvent(new TerminatedEvent());
        });
    }

    // The 'initialize' request is the first request by the frontend to interrogate which features the debug adapter provides.
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        response.body = response.body || {};

        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsConditionalBreakpoints = false;
        response.body.supportsHitConditionalBreakpoints = false;
        response.body.supportsEvaluateForHovers = false;
        response.body.exceptionBreakpointFilters = [];
        response.body.supportsStepBack = false;
        response.body.supportsSetVariable = false;
        response.body.supportsRestartFrame = false;
        response.body.supportsGotoTargetsRequest = false;
        response.body.supportsStepInTargetsRequest = false;
        response.body.supportsCompletionsRequest = false;
        response.body.supportsModulesRequest = false;
        response.body.additionalModuleColumns = [];
        response.body.supportedChecksumAlgorithms = [];
        response.body.supportsRestartRequest = false;
        response.body.supportsExceptionOptions = false;
        response.body.supportsValueFormattingOptions = false;
        response.body.supportsExceptionInfoRequest = false;
        response.body.supportTerminateDebuggee = false;
        response.body.supportsDelayedStackTraceLoading = false;
        response.body.supportsLoadedSourcesRequest = false;

        this.sendResponse(response);

        this.sendEvent(new InitializedEvent());
    }

    // Called at the end of the configuration sequence. Indicates everything was set up for start.
    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        super.configurationDoneRequest(response, args);
        this._configurationDone.notify();
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {
        logger.setup(Logger.LogLevel.Verbose, 'C:\\Users\\jurelinac\\Code\\Misc\\vscode-jsd-debug\\jsdsession-debug.log');

        await this._configurationDone.wait(1000);  // wait until configuration has finished

        this._runtime.start(args.program, args.js_root);

        this.sendResponse(response);
    }

    // TODO: Change!
    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {

        /*const path = <string>args.source.path;
        const clientLines = args.lines || [];

        // clear all breakpoints for this file
        this._runtime.clearBreakpoints(path);

        // set and verify breakpoint locations
        const actualBreakpoints = clientLines.map(l => {
            let { verified, line, id } = this._runtime.setBreakPoint(path, this.convertClientLineToDebugger(l));
            const bp = <DebugProtocol.Breakpoint> new Breakpoint(verified, this.convertDebuggerLineToClient(line));
            bp.id = id;
            return bp;
        });*/

        // send back the actual breakpoint positions
        response.body = {
            breakpoints: []
        };
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse) {
        response.body = { threads: [new Thread(JSDDebugSession.THREAD_ID, "thread 1")] };
        this.sendResponse(response);
    }

    // TODO: Change!
    protected async stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
        const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
        const endFrame = startFrame + maxLevels;

        console.log('Stack trace requested.');

        const stk = await this.runLocked('stacktrace', () => this._runtime.getStackTrace(startFrame, endFrame));

        response.body = {
            stackFrames: stk.map(frame => new StackFrame(this.getStackId(), frame.name, this.makeSource(frame.file), frame.line)),
            totalFrames: stk.length
        };

        this.sendResponse(response);

        console.log('Stack trace generated.');
    }

    // TODO: Change!
    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {

        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
        scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    // TODO: Change!
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {

        const variables = new Array<DebugProtocol.Variable>();
        /*const id = this._variableHandles.get(args.variablesReference);
        if (id !== null) {
            variables.push({
                name: id + "_i",
                type: "integer",
                value: "123",
                variablesReference: 0
            });
            variables.push({
                name: id + "_f",
                type: "float",
                value: "3.14",
                variablesReference: 0
            });
            variables.push({
                name: id + "_s",
                type: "string",
                value: "hello world",
                variablesReference: 0
            });
            variables.push({
                name: id + "_o",
                type: "object",
                value: "Object",
                variablesReference: this._variableHandles.create("object_")
            });
        }*/

        response.body = {
            variables: variables
        };
        this.sendResponse(response);
    }

    protected async continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
        await this._runtime.continue();
        this.sendResponse(response);
    }

    protected async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
        await this._runtime.step();
        this.sendResponse(response);
    }

    protected async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
        await this._runtime.stepIn();
        this.sendResponse(response);
	}

	protected async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
        await this._runtime.stepOut();
        this.sendResponse(response);
    }

    protected async pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
        await this._runtime.pause();
        this.sendResponse(response);
    }

    // TODO: Change!
    protected async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {

        let reply: string = '';

        if (args.context === 'repl') {
            // 'evaluate' supports to create and delete breakpoints from the 'repl':

        } else {

        }

        response.body = {
            result: reply,
            variablesReference: 0
        };
        this.sendResponse(response);
    }

    //---- helpers

    private runLocked(resource: string, fn: () => void): any {
        return this._lock.acquire(resource, fn);
    }

    private getStackId() {
        return ++this._stackId;
    }

    private makeSource(filePath: string): Source {
        return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath));
    }
}
