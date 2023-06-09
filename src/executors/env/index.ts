import type { Executor, ExecutorContext } from '@nrwl/devkit';
import { join } from 'node:path';
import type { PackageManager } from '$types';
import { logger, getFlavor, getFlavorValue, getLimiter } from '$utils';
import { mkdir, writeFile } from 'fs/promises';
import { getEnvironmentsToDeploy } from './lib/read-envs';
import { manageEnvironmentVariableInVercel } from './lib/upload-envs';

type EnviromentInput =
	| 'production'
	| 'development'
	| 'preview'
	| `preview:${string}`;

interface ExecuteOptions {
	/** Don't log anything */
	silent?: boolean;
	/** Get verbose logs */
	verbose?: boolean;
	flavors: Record<string, EnviromentInput>;
	/** The flavor of the project */
	flavor?: string;

	envFilePath?: string;

	packageManager?: PackageManager;

	vercelProjectName?: string;

	vercelProjectId: string;

	only?: string[];

	concurrency?: number;

	retryAmounts?: number;

	vercelToken: string;
	deleteUnusedEnvs?: boolean;
}
type Environment = 'production' | 'development' | 'preview';

export interface BaseOptions {
	packageManager: PackageManager;
	projectRoot: string;
	flavor: string;
	environment: Environment;
	githubBranch?: string;
	localEnvFilePath: string;
	temporaryDirectory: string;
	vercelProjectId: string;
	vercelToken: string;
	deleteUnusedEnvs?: boolean;
}

export interface EnvriomentData {
	/**
	 * If id is defined, the variable will be updated, otherwise it will be
	 * created
	 */
	id?: string;
	key: string;
	value: string;

	/**
	 * If the variable is in vercel, but not in the local env file, it will be
	 * deleted if deleteUnusedEnvs is true
	 */
	deleteEnv?: true;
}

const getBaseOptions = (
	options: ExecuteOptions,
	context: ExecutorContext,
): BaseOptions => {
	logger.debug('getBaseOptions', options);
	const { projectName, root: workspaceRoot, workspace } = context;

	if (!projectName) {
		throw new Error('Project name is not defined');
	}
	if (!workspace) {
		throw new Error('Workspace is not defined');
	}
	const relativeProjectPath = workspace.projects[projectName].root;
	const projectRoot = join(workspaceRoot, relativeProjectPath);
	const packageManager = options.packageManager ?? 'pnpm';
	const temporaryDirectory = join(workspaceRoot, 'tmp', relativeProjectPath);

	const flavor = getFlavor(options);

	const flavorValue = getFlavorValue({
		flavors: options.flavors,
		flavor,
	});
	const environment = getEnvironment(flavorValue);

	const baseOptions: BaseOptions = {
		packageManager,
		projectRoot,
		flavor,
		environment,
		localEnvFilePath: join(projectRoot, `.env.${flavor}`),
		temporaryDirectory,
		deleteUnusedEnvs: options.deleteUnusedEnvs,
		vercelToken: options.vercelToken,
		vercelProjectId: options.vercelProjectId,
	};

	if (
		baseOptions.environment === 'preview' &&
		flavorValue.startsWith('preview:')
	) {
		baseOptions.githubBranch = flavorValue.replace('preview:', '');
	}
	return baseOptions;
};

const getEnvironment = (value: string): Environment => {
	switch (value) {
		case 'production':
		case 'development':
			return value;
		default:
			return 'preview';
	}
};

const createVercelJson = async (directory: string, name: string) => {
	await mkdir(directory, { recursive: true }),
		await writeFile(
			join(directory, 'vercel.json'),
			JSON.stringify(
				{
					name: name,
				},
				undefined,
				2,
			),
		);
};

const executor: Executor<ExecuteOptions> = async (options, context) => {
	logger.setLogSeverity(options);
	const baseOptions = getBaseOptions(options, context);
	const { temporaryDirectory } = baseOptions;
	await createVercelJson(
		temporaryDirectory,
		options.vercelProjectName ?? options.vercelProjectId,
	);
	let envFileVariables = await getEnvironmentsToDeploy(baseOptions);
	logger.debug('envFileVariables', envFileVariables);
	const only = options.only;

	if (only) {
		envFileVariables = envFileVariables.filter(({ key }) =>
			only.includes(key),
		);
	}

	if (envFileVariables.length === 0) {
		logger.warn('No variables to upload');
		return {
			success: true,
		};
	}

	logger.startSpinner(
		envFileVariables.length,
		options.vercelProjectName ?? options.vercelProjectId,
	);

	const limit = getLimiter<void>(options.concurrency ?? 10);

	await Promise.all(
		envFileVariables.map((env) =>
			limit(async () => {
				const startTime = Date.now();
				try {
					await manageEnvironmentVariableInVercel(baseOptions, env);
					logger.logFunctionDeployed(env.key, Date.now() - startTime);
				} catch (error) {
					const errorMessage = (
						error as { message?: string } | undefined
					)?.message;
					logger.debug(error);

					logger.logFunctionFailed(env.key, errorMessage);
				}
			}),
		),
	);

	logger.endSpinner();

	return {
		success: !logger.hasFailedEnvironments,
	};
};

export default executor;
