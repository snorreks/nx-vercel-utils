import type { Executor, ExecutorContext } from '@nrwl/devkit';
import { join } from 'node:path';
import type { PackageManager } from '$types';
import { logger, getFlavor, getFlavorValue, execute } from '$utils';
import { mkdir, readFile, writeFile } from 'fs/promises';

interface EmulateOptions {
	/** Don't log anything */
	silent?: boolean;
	/** Get verbose logs */
	verbose?: boolean;
	flavors: Record<string, string>;
	/** The flavor of the project */
	flavor?: string;

	envFilePath?: string;

	packageManager?: PackageManager;

	vercelProjectName: string;

	only?: string[];
}
type Environment = 'production' | 'development' | 'preview';

interface BaseOptions {
	packageManager: PackageManager;
	projectRoot: string;
	flavor: string;
	environment: Environment;
	githubBranch?: string;

	temporaryDirectory: string;
}

const getBaseOptions = (
	options: EmulateOptions,
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
		temporaryDirectory,
	};

	if (baseOptions.environment === 'preview' && flavorValue !== 'preview') {
		baseOptions.githubBranch = flavorValue;
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

const getCommandArguments = (
	options: BaseOptions & { key: string; value: string | undefined },
): string[] => {
	const {
		projectRoot,
		githubBranch,
		value,
		environment,
		key,
		temporaryDirectory,
	} = options;
	const commandArguments: string[] = [
		'vercel',
		'env',
		value ? 'add' : 'rm',
		key,
		environment,
	];

	if (githubBranch) {
		commandArguments.push(githubBranch);
	}

	commandArguments.push(
		'--cwd',
		projectRoot,
		'--local-config',
		join(temporaryDirectory, 'vercel.json'),
	);

	if (!value) {
		commandArguments.push('--yes');
	}

	return commandArguments;
};

const deleteEnvVariable = async (
	options: BaseOptions & { key: string },
): Promise<boolean> => {
	const { projectRoot, packageManager } = options;
	logger.debug('deleteEnvVariable', options);
	try {
		await execute({
			packageManager,
			commandArguments: getCommandArguments({
				...options,
				value: undefined,
			}),
			cwd: projectRoot,
			maxTimeout: 60 * 1000,
		});
		return true;
	} catch (error) {
		logger.debug('Error removing variable', error);
		return false;
	}
};

const addEnvVariable = async (
	options: BaseOptions & { key: string; value: string },
) => {
	const { projectRoot, packageManager, value, key } = options;
	logger.debug('addEnvVariable', options);
	await execute({
		packageManager,
		commandArguments: getCommandArguments(options),
		cwd: projectRoot,
		questionAnswers: [
			{
				question: ` the value of ${key}? `,
				answer: value,
			},
			{
				question: `to which Git branch? (leave empty for all Preview branches)?`,
				answer: '',
			},
		],
		maxTimeout: 60 * 1000,
	});
};

const readEnvFile = async (filePath: string): Promise<[string, string][]> => {
	try {
		const fileContent = await readFile(filePath, 'utf-8');
		const envVariablePattern =
			/^([^#\s][\w-.]+)\s*=\s*(.*(?:\n(?!\w).*)*)/gm;
		const envVariables: [string, string][] = [];

		let match: RegExpExecArray | null;
		while ((match = envVariablePattern.exec(fileContent)) !== null) {
			const key = match[1].trim();
			const value = match[2].replace(/\\\n/g, '\n').trim();
			envVariables.push([key, value]);
		}

		return envVariables;
	} catch (error) {
		throw new Error(`Error reading environment file ${filePath}: ${error}`);
	}
};

const executor: Executor<EmulateOptions> = async (options, context) => {
	logger.setLogSeverity(options);
	const baseOptions = getBaseOptions(options, context);
	const { projectRoot, temporaryDirectory, flavor } = baseOptions;
	let [envFileVariables] = await Promise.all([
		readEnvFile(join(projectRoot, `.env.${flavor}`)),
		createVercelJson(temporaryDirectory, options.vercelProjectName),
	]);
	logger.debug('envFileVariables', envFileVariables);
	const only = options.only;

	if (only) {
		envFileVariables = envFileVariables.filter(([key]) =>
			only.includes(key),
		);

		for (const key of only) {
			if (!envFileVariables.find(([envKey]) => envKey === key)) {
				logger.warn(`Variable ${key} not found in .env.${flavor}`);
			}
		}
	}

	if (envFileVariables.length === 0) {
		logger.warn('No variables to upload');
		return {
			success: false,
		};
	}

	const uploadAndDeleteEnvVariable = async (
		key: string,
		value: string,
	): Promise<void> => {
		try {
			await addEnvVariable({
				...baseOptions,
				key,
				value,
			});
		} catch (error) {
			const responseOk = await deleteEnvVariable({
				...baseOptions,
				key,
			});
			if (!responseOk) {
				throw error;
			}
			await addEnvVariable({
				...baseOptions,
				key,
				value,
			});
		}
	};

	// await Promise.all(
	// 	envFileVariables.map(([key, value]) => uploadEnvVariable(key, value)),
	// );

	logger.startSpinner(envFileVariables.length, options.vercelProjectName);

	for (const [key, value] of envFileVariables) {
		const startTime = Date.now();
		try {
			await uploadAndDeleteEnvVariable(key, value);
			logger.logFunctionDeployed(key, Date.now() - startTime);
		} catch (error) {
			const errorMessage = (error as { message?: string } | undefined)
				?.message;
			logger.debug(error);

			logger.logFunctionFailed(key, errorMessage);
		}
	}

	logger.endSpinner();

	return {
		success: !logger.hasFailedEnvironments,
	};
};

export default executor;
