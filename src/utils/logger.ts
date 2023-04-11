import chalk from 'chalk';
import { createSpinner, type Spinner } from 'nanospinner';
import { toDisplayDuration } from './common';

/** `LogType` indicates the type of console log. See {@link Console} */
export type LogType = 'debug' | 'info' | 'warn' | 'error' | 'log';

/**
 * The priority of the log entry. The higher the number, the higher the
 * priority.
 */
enum LogSeverityPriority {
	silent = 0,
	debug = 1,
	info = 2,
	warn = 4,
	error = 5,
}

/**
 * `LogSeverity` indicates the detailed severity of the log entry. See
 * {@link LogSeverityPriority} for priority.
 */
export type LogSeverity = keyof typeof LogSeverityPriority;

/**
 * `LogEntry` represents a structured entry. All keys aside from `severity`,
 * `logType` and `message` are included in the log.
 */
export interface LogEntry {
	severity?: LogSeverity;
	logType?: LogType;
	message?: string;
}

/**
 * `Logger` is a wrapper around the console object. It provides a structured
 * logging interface and a way to dynamically set the {@link LogSeverity} (log
 * level).
 *
 * In production, the log severity is set to `CRITICAL` by default.
 *
 * In development, the log severity is set to `info` by default.
 */
export interface LoggerInterface {
	/** The current log severity */
	readonly currentLogSeverity: LogSeverity;

	readonly verbose: boolean;

	readonly hasFailedEnvironments: boolean;

	/**
	 * Sets the current log severity. If the severity is not set, it will never
	 * log anything.
	 */
	setLogSeverity(options: { silent?: boolean; verbose?: boolean }): void;

	startSpinner(deployableEnvironmentsAmount: number, projectId: string): void;

	endSpinner(): void;

	spinnerLog(text: string): void;

	logFunctionDeployed(environmentName: string, time: number): void;

	logFunctionFailed(environmentName: string, errorMessage?: string): void;

	/**
	 * Writes a `LogEntry` to the console.
	 *
	 * If the severity is not set, it will never log anything. If the severity
	 * is set, it will only log if the severity is greater than or equal to the
	 * current severity. See {@link LogSeverityPriority} for the priority order.
	 *
	 * The default {@link LogSeverity} is `info`.
	 *
	 * The default {@link LogType} is `log`.
	 *
	 * @param entry - The `LogEntry` including severity, message, and any
	 *   additional structured metadata.
	 */
	write(entry: LogEntry, ...data: unknown[]): void;
	/**
	 * Writes a `debug` {@link LogType}.
	 *
	 * The default {@link LogSeverity} is `debug`.
	 *
	 * @param args - Arguments, concatenated into the log message.
	 */
	debug(...args: unknown[]): void;
	/**
	 * Writes a `log` {@link LogType}.
	 *
	 * The default {@link LogSeverity} is `info`.
	 *
	 * @param args - Arguments, concatenated into the log message.
	 */
	log(...args: unknown[]): void;
	/**
	 * Writes a `info` {@link LogType}.
	 *
	 * The default {@link LogSeverity} is `info`.
	 *
	 * @param args - Arguments, concatenated into the log message.
	 */
	info(...args: unknown[]): void;
	/**
	 * Writes a `warn` {@link LogType}.
	 *
	 * The default {@link LogSeverity} is `warn`.
	 *
	 * @param args - Arguments, concatenated into the log message.
	 */
	warn(...args: unknown[]): void;
	/**
	 * Writes a `error` {@link LogType}.
	 *
	 * The default {@link LogSeverity} is `error`.
	 *
	 * @param args - Arguments, concatenated into the log message.
	 * @public
	 */
	error(...args: unknown[]): void;
}

class LoggerService implements LoggerInterface {
	currentLogSeverity: LogSeverity = 'info';

	get verbose(): boolean {
		return this.currentLogSeverity === 'debug';
	}

	private _spinner?: Spinner;
	private _projectId?: string;
	private _deployableEnvironmentsAmount = 0;

	get hasFailedEnvironments(): boolean {
		return this._failedDeployedFunctionAmount > 0;
	}

	private readonly _successfullyDeployedEnvironments: {
		environmentName: string;
		time: number;
	}[] = [];
	private readonly _failedDeployedEnvironments: {
		environmentName: string;
		errorMessage?: string;
	}[] = [];

	logFunctionDeployed(environmentName: string, time: number): void {
		this._successfullyDeployedEnvironments.push({
			environmentName,
			time,
		});
		this.spinnerLog(
			chalk.green(
				`Successfully deployed environment ${chalk.bold(
					environmentName,
				)}`,
			),
		);
	}

	logFunctionFailed(environmentName: string, errorMessage?: string): void {
		this._failedDeployedEnvironments.push({
			environmentName,
			errorMessage,
		});
		this.spinnerLog(
			chalk.red(
				`${chalk.bold(environmentName)} failed to environment${
					errorMessage ? `: ${errorMessage}` : ''
				}`,
			),
		);
	}

	private get _successfullyDeployedFunctionAmount(): number {
		return this._successfullyDeployedEnvironments.length;
	}
	private get _failedDeployedFunctionAmount(): number {
		return this._failedDeployedEnvironments.length;
	}

	get remainingEnvironmentsAmount(): number {
		return (
			this._deployableEnvironmentsAmount -
			this._successfullyDeployedFunctionAmount -
			this._failedDeployedFunctionAmount
		);
	}

	setLogSeverity(options: { silent?: boolean; verbose?: boolean }): void {
		if (options.silent) {
			this.currentLogSeverity = 'silent';
			return;
		}

		if (options.verbose) {
			this.currentLogSeverity = 'debug';
			return;
		}
	}

	write(entry: LogEntry, ...data: unknown[]): void {
		if (!this.currentLogSeverity) {
			return;
		}
		const { logType, message, severity } = entry;

		const currentLogSeverityPriority = this.toLogSeverityPriority(
			this.currentLogSeverity,
		);
		const entryLogSeverityPriority = this.toLogSeverityPriority(
			severity || 'info',
		);

		if (currentLogSeverityPriority > entryLogSeverityPriority) {
			return;
		}
		delete entry.severity;
		delete entry.logType;
		delete entry.message;

		const log = console[logType || 'log'];
		if (typeof message !== 'undefined') {
			log(message, ...data);
		} else {
			log(...data);
		}
	}

	get spinnerDefaultText(): string {
		return `Deploying to ${chalk.bold(this._projectId)} ${
			this.remainingEnvironmentsAmount
		}/${this._deployableEnvironmentsAmount} environments`;
	}

	startSpinner(
		deployableEnvironmentsAmount: number,
		projectId: string,
	): void {
		this._deployableEnvironmentsAmount = deployableEnvironmentsAmount;
		this._projectId = projectId;
		if (this.verbose) {
			return;
		}
		this._spinner = createSpinner(this.spinnerDefaultText).start();
	}

	endSpinner(): void {
		if (this._successfullyDeployedFunctionAmount) {
			this.spinnerSuccess(
				chalk.green(
					`Successfully deployed ${chalk.bold(
						this._successfullyDeployedFunctionAmount,
					)} environments to ${this._projectId}:`,
				),
			);
			for (const { environmentName, time } of this
				._successfullyDeployedEnvironments) {
				this.info(
					chalk.green(chalk.bold(environmentName)),
					`Time: ${toDisplayDuration(time)}`,
				);
			}
		}

		if (this._failedDeployedFunctionAmount) {
			this.spinnerError(
				chalk.red(
					`Failed to deploy ${chalk.bold(
						this._failedDeployedFunctionAmount,
					)} environments to ${this._projectId}:`,
				),
			);

			for (const { environmentName, errorMessage } of this
				._failedDeployedEnvironments) {
				this.error(
					chalk.red(chalk.bold(environmentName)),
					`Error: ${chalk.red(errorMessage)}`,
				);
			}

			this.log(
				'Add this to the end of your command to only deploy the failed commands:' +
					`\n${chalk.bold(
						'--only ' +
							this._failedDeployedEnvironments
								.map(({ environmentName }) => environmentName)
								.join(','),
					)}`,
			);
		}
	}

	spinnerLog(stopText: string): void {
		if (!this._spinner) {
			this.log(stopText);
			return;
		}

		this._spinner?.stop({
			text: stopText,
		});

		this._spinner?.start({
			text: this.spinnerDefaultText,
		});
	}

	private spinnerSuccess(text: string): void {
		if (!this._spinner) {
			this.log(text);
			return;
		}

		this._spinner?.success({
			text,
		});
	}

	private spinnerError(text: string): void {
		if (!this._spinner) {
			this.log(text);
			return;
		}

		this._spinner?.error({
			text,
		});
	}

	debug(...args: unknown[]): void {
		this.write(
			{
				logType: 'debug',
				severity: 'debug',
			},
			...args,
		);
	}
	info(...args: unknown[]): void {
		this.write(
			{
				logType: 'info',
				severity: 'info',
			},
			...args,
		);
	}
	warn(...args: unknown[]): void {
		this.write(
			{
				logType: 'warn',
				severity: 'warn',
			},
			...args,
		);
	}
	error(...args: unknown[]): void {
		this.write(
			{
				logType: 'error',
				severity: 'error',
			},
			...args,
		);
	}

	log(...args: unknown[]): void {
		this.write(
			{
				logType: 'log',
				severity: 'info',
			},
			...args,
		);
	}

	private toLogSeverityPriority(severity: LogSeverity): LogSeverityPriority {
		return LogSeverityPriority[severity];
	}
}

class LoggerFactory {
	private static logger: LoggerInterface = new LoggerService();
	static getLogger(): LoggerInterface {
		return LoggerFactory.logger;
	}
}

export const logger = LoggerFactory.getLogger();
